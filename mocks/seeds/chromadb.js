import { ChromaClient, CloudClient } from 'chromadb';
import axios from 'axios';
import dotenv from 'dotenv';
import {
  generateProducts,
  generateDocuments,
  generateUsers,
  generateImages,
  generateRealEstate,
  generateMusic,
} from '../generators.js';

dotenv.config();

const CHROMA_API_KEY = process.env.CHROMA_API_KEY || '';
const CHROMA_TENANT = process.env.CHROMA_TENANT || '';
const CHROMA_DATABASE = process.env.CHROMA_DATABASE || '';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const CHROMA_IS_CLOUD = !!(CHROMA_API_KEY && CHROMA_TENANT && CHROMA_DATABASE);

export async function seedChromaDB() {
  console.log('\n🚀 Seeding ChromaDB...\n');
  
  let client;
  let isCloud = false;
  
  if (CHROMA_IS_CLOUD) {
    console.log('  Connecting to Chroma Cloud...');
    try {
      client = new CloudClient({
        apiKey: CHROMA_API_KEY,
        tenant: CHROMA_TENANT,
        database: CHROMA_DATABASE,
      });
      await client.listCollections();
      isCloud = true;
      console.log('✓ Connected to Chroma Cloud');
    } catch (error) {
      console.error('❌ Cannot connect to Chroma Cloud:', error.message);
      return;
    }
  } else {
    console.log(`  Connecting to ChromaDB at ${CHROMA_URL}...`);
    try {
      // Use ChromaClient for local connections with path
      // https://docs.trychroma.com/docs/overview/getting-started
      // Note: We skip the heartbeat check as the endpoint may have changed in newer versions
      client = new ChromaClient({
        path: CHROMA_URL,
      });
      
      // Try to list collections to verify connection
      // Note: Some ChromaDB versions may return 410 on certain endpoints
      // but the client should still work for creating collections and adding data
      try {
        await client.listCollections();
        console.log('✓ Connected to ChromaDB');
      } catch (listError) {
        // If listCollections fails, log a warning but continue
        // The client might still work for other operations
        const errorMsg = listError.message || String(listError);
        if (errorMsg.includes('410') || errorMsg.includes('Gone')) {
          console.log('⚠️  Warning: Got 410 error on listCollections (endpoint may be deprecated)');
          console.log('   Continuing anyway - client should still work for other operations...');
        } else {
          // For other errors, still log but try to continue
          console.log('⚠️  Warning: listCollections failed:', errorMsg);
          console.log('   Continuing anyway - will try to create collections...');
        }
      }
    } catch (error) {
      console.error('❌ Cannot connect to ChromaDB at', CHROMA_URL);
      console.error('   Error:', error.message);
      if (error.response) {
        console.error('   Status:', error.response.status);
        console.error('   Status Text:', error.response.statusText);
      }
      console.error('\n   Make sure ChromaDB is running. You can start it with:');
      console.error('   docker-compose up chromadb');
      console.error('   or');
      console.error('   chroma run --host localhost --port 8000');
      console.error('\n   If ChromaDB is running, check that the URL is correct.');
      console.error('   Note: If you see a 410 error, it may be a version mismatch.');
      console.error('   Try updating chromadb: npm install chromadb@latest');
      return;
    }
  }

  // ChromaDB-specific collections
  const collections = [
    {
      name: 'product_catalog',
      dimension: 384,
      data: generateProducts(35, 384),
      description: 'Product catalog with embeddings',
    },
    {
      name: 'content_library',
      dimension: 768,
      data: generateDocuments(30, 768),
      description: 'Content library documents',
    },
    {
      name: 'customer_profiles',
      dimension: 256,
      data: generateUsers(40, 256),
      description: 'Customer profile embeddings',
    },
    {
      name: 'property_listings',
      dimension: 384,
      data: generateRealEstate(25, 384),
      description: 'Real estate property listings',
    },
    {
      name: 'music_catalog',
      dimension: 256,
      data: generateMusic(30, 256),
      description: 'Music track catalog',
    },
    {
      name: 'image_gallery',
      dimension: 512,
      data: generateImages(40, 512),
      description: 'Image gallery with image_url metadata',
    },
  ];

  for (const col of collections) {
    try {
      console.log(`\n📦 Processing collection: ${col.name}`);
      
      if (isCloud) {
        const cloudClient = client;
        
        // Delete if exists
        try {
          const collections = await cloudClient.listCollections();
          const exists = collections.some(c => {
            const name = typeof c === 'string' ? c : c.name;
            return name === col.name;
          });
          if (exists) {
            await cloudClient.deleteCollection({ name: col.name });
            console.log(`  ✓ Dropped existing collection`);
          }
        } catch (e) {
          // Collection may not exist
        }
        
        // Create collection
        const noOpEmbeddingFunction = {
          embed: async (texts) => {
            return texts.map(() => new Array(col.dimension).fill(0));
          },
        };
        
        let collection;
        try {
          collection = await cloudClient.getCollection({ 
            name: col.name,
            embeddingFunction: noOpEmbeddingFunction,
          });
          console.log(`  ✓ Using existing collection`);
        } catch (getError) {
          try {
            collection = await cloudClient.createCollection({
              name: col.name,
              embeddingFunction: noOpEmbeddingFunction,
              metadata: { 
                'hnsw:space': 'cosine',
                'hnsw:construction_ef': 128,
                'hnsw:M': 32,
                'hnsw:search_ef': 64,
              },
            });
            console.log(`  ✓ Collection created`);
          } catch (createError) {
            console.error(`  ❌ Failed to create collection:`, createError.message);
            throw createError;
          }
        }
        
        // Add data in batches
        let insertedCount = 0;
        for (let i = 0; i < col.data.length; i += 20) {
          const batch = col.data.slice(i, i + 20);
          
          // Extract documents from content/description fields
          const documents = batch.map(p => {
            return p.content || p.description || p.bio || '';
          });
          
          // Clean metadata (remove vector, id, and document fields)
          // ChromaDB metadata only supports string, number, or boolean
          // Convert arrays and objects to strings
          const metadatas = batch.map(p => {
            const { id, vector, content, description, bio, ...rest } = p;
            const cleaned = {};
            for (const [key, value] of Object.entries(rest)) {
              if (value === null || value === undefined) {
                continue; // Skip null/undefined
              } else if (Array.isArray(value)) {
                // Convert arrays to comma-separated strings
                cleaned[key] = value.join(', ');
              } else if (typeof value === 'object') {
                // Convert objects to JSON strings
                cleaned[key] = JSON.stringify(value);
              } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                // Keep strings, numbers, and booleans as-is
                cleaned[key] = value;
              }
            }
            return cleaned;
          });
          
          const addParams = {
            ids: batch.map(p => String(p.id)),
            embeddings: batch.map(p => p.vector),
            metadatas: metadatas,
          };
          
          if (documents.some(d => d)) {
            addParams.documents = documents;
          }
          
          await collection.add(addParams);
          
          insertedCount += batch.length;
        }
        
        console.log(`  ✓ Inserted ${insertedCount} items`);
        console.log(`✅ Chroma Cloud: ${col.name} (${insertedCount} items)`);
      } else {
        // Self-hosted ChromaDB - use ChromaClient
        const localClient = client;
        
        // Create no-op embedding function
        const noOpEmbeddingFunction = {
          embed: async (texts) => {
            return texts.map(() => new Array(col.dimension).fill(0));
          },
          generate: async (texts) => {
            return texts.map(() => new Array(col.dimension).fill(0));
          },
        };
        
        // Delete if exists
        try {
          const collections = await localClient.listCollections();
          const exists = collections.some(c => {
            const name = typeof c === 'string' ? c : (c?.name || '');
            return name === col.name;
          });
          if (exists) {
            await localClient.deleteCollection({ name: col.name });
            console.log(`  ✓ Dropped existing collection`);
          }
        } catch (e) {
          // Collection may not exist
        }
        
        // Create collection
        let collection;
        try {
          collection = await localClient.getCollection({ 
            name: col.name,
            embeddingFunction: noOpEmbeddingFunction,
          });
          console.log(`  ✓ Using existing collection`);
        } catch (getError) {
          try {
            collection = await localClient.createCollection({
              name: col.name,
              embeddingFunction: noOpEmbeddingFunction,
              metadata: { 
                'hnsw:space': 'cosine',
                'hnsw:construction_ef': 128,
                'hnsw:M': 32,
                'hnsw:search_ef': 64,
              },
            });
            console.log(`  ✓ Collection created`);
          } catch (createError) {
            console.error(`  ❌ Failed to create collection:`, createError.message);
            throw createError;
          }
        }
        
        // Add data in batches
        let insertedCount = 0;
        for (let i = 0; i < col.data.length; i += 20) {
          const batch = col.data.slice(i, i + 20);
          
          // Extract documents from content/description fields
          const documents = batch.map(p => {
            return p.content || p.description || p.bio || '';
          });
          
          // Clean metadata (remove vector, id, and document fields)
          // ChromaDB metadata only supports string, number, or boolean
          // Convert arrays and objects to strings
          const metadatas = batch.map(p => {
            const { id, vector, content, description, bio, ...rest } = p;
            const cleaned = {};
            for (const [key, value] of Object.entries(rest)) {
              if (value === null || value === undefined) {
                continue; // Skip null/undefined
              } else if (Array.isArray(value)) {
                // Convert arrays to comma-separated strings
                cleaned[key] = value.join(', ');
              } else if (typeof value === 'object') {
                // Convert objects to JSON strings
                cleaned[key] = JSON.stringify(value);
              } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                // Keep strings, numbers, and booleans as-is
                cleaned[key] = value;
              }
            }
            return cleaned;
          });
          
          const addParams = {
            ids: batch.map(p => String(p.id)),
            embeddings: batch.map(p => p.vector),
            metadatas: metadatas,
          };
          
          if (documents.some(d => d)) {
            addParams.documents = documents;
          }
          
          await collection.add(addParams);
          
          insertedCount += batch.length;
        }
        
        console.log(`  ✓ Inserted ${insertedCount} items`);
        console.log(`✅ ChromaDB: ${col.name} (${insertedCount} items)`);
      }
    } catch (error) {
      console.error(`❌ ChromaDB ${col.name}:`, error.message);
    }
  }
}

