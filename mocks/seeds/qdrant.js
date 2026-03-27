import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import {
  generateProducts,
  generateDocuments,
  generateUsers,
  generateImages,
  generateMultiVectorProducts,
  generateMultiVectorDocuments,
  generatePapers,
  generateMusic,
  generateRealEstate,
  generateHybridProducts,
  generateHybridDocuments,
  generateHybridPapers,
} from '../generators.js';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || (() => {
  const host = process.env.QDRANT_HOST || 'localhost';
  const port = process.env.QDRANT_PORT || '6333';
  if (host.startsWith('http://') || host.startsWith('https://')) {
    return host;
  }
  const token = process.env.QDRANT_TOKEN || '';
  const protocol = token ? 'https' : 'http';
  return `${protocol}://${host}:${port}`;
})();
const QDRANT_TOKEN = process.env.QDRANT_TOKEN || '';

export async function seedQdrantDB() {
  console.log('\n🚀 Seeding Qdrant...\n');
  
  let cleanUrl = QDRANT_URL;
  if (cleanUrl.includes('://')) {
    cleanUrl = cleanUrl.replace(/^https?:\/\/(https?:\/\/)/, '$1');
  }
  
  const clientConfig = {
    url: cleanUrl,
    checkCompatibility: false,
  };
  
  if (QDRANT_TOKEN) {
    clientConfig.apiKey = QDRANT_TOKEN;
    console.log(`  Connecting to Qdrant at ${cleanUrl} with API token...`);
  } else {
    console.log(`  Connecting to Qdrant at ${cleanUrl}...`);
  }
  
  const client = new QdrantClient(clientConfig);
  
  try {
    await client.getCollections();
    console.log('✓ Connected to Qdrant');
  } catch (error) {
    console.error('❌ Cannot connect to Qdrant:', error.message);
    if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('unauthorized')) {
      console.error('  ⚠️  Authentication error - check your QDRANT_TOKEN');
    } else if (error.message?.includes('unsecure') || error.message?.includes('https')) {
      console.error('  ⚠️  Cloud instances require HTTPS. Set QDRANT_URL with https://');
    }
    return;
  }

  // Qdrant-specific collections with unique schemas
  const collections = [
    {
      name: 'ecommerce_products',
      dimension: 384,
      data: generateProducts(30, 384),
      distance: 'Cosine',
      description: 'E-commerce products with rich metadata',
    },
    {
      name: 'research_papers',
      dimension: 768,
      data: generatePapers(25, 768),
      distance: 'Cosine',
      description: 'Scientific research papers',
    },
    {
      name: 'user_profiles',
      dimension: 256,
      data: generateUsers(40, 256),
      distance: 'Cosine',
      description: 'User profile embeddings',
    },
    {
      name: 'photo_gallery',
      dimension: 512,
      data: generateImages(35, 512),
      distance: 'Cosine',
      description: 'Photo gallery with image URLs',
    },
    {
      name: 'multi_vector_products',
      vectors: {
        text_embedding: { size: 384, distance: 'Cosine' },
        image_embedding: { size: 512, distance: 'Cosine' },
      },
      data: generateMultiVectorProducts(20),
      distance: 'Cosine',
      description: 'Products with multiple vector fields',
    },
    {
      name: 'multi_vector_docs',
      vectors: {
        title_embedding: { size: 256, distance: 'Cosine' },
        content_embedding: { size: 768, distance: 'Cosine' },
        summary_embedding: { size: 384, distance: 'Cosine' },
      },
      data: generateMultiVectorDocuments(15),
      distance: 'Cosine',
      description: 'Documents with multiple vector embeddings',
    },
    {
      name: 'hybrid_products',
      vectors: {
        dense: { size: 384, distance: 'Cosine' },
      },
      sparse_vectors: {
        sparse: {},
      },
      data: generateHybridProducts(25, 384),
      distance: 'Cosine',
      description: 'Products with hybrid search (dense semantic + sparse keyword vectors)',
    },
    {
      name: 'hybrid_documents',
      vectors: {
        dense: { size: 768, distance: 'Cosine' },
      },
      sparse_vectors: {
        sparse: {},
      },
      data: generateHybridDocuments(20, 768),
      distance: 'Cosine',
      description: 'Documents with hybrid search (semantic + keyword/BM25)',
    },
    {
      name: 'hybrid_papers',
      vectors: {
        dense: { size: 768, distance: 'Cosine' },
      },
      sparse_vectors: {
        sparse: {},
      },
      data: generateHybridPapers(18, 768),
      distance: 'Cosine',
      description: 'Research papers with hybrid search capabilities',
    },
  ];

  for (const col of collections) {
    try {
      console.log(`\n📦 Processing collection: ${col.name}`);
      
      // Delete collection if exists
      try {
        await client.deleteCollection(col.name);
        console.log(`  ✓ Dropped existing collection`);
      } catch (e) {
        // Collection may not exist
      }
      
      // Create collection
      try {
        const createConfig = {};
        
        if (col.vectors) {
          createConfig.vectors = col.vectors;
        } else {
          createConfig.vectors = {
            size: col.dimension,
            distance: col.distance,
          };
        }
        
        // Add sparse vectors if specified
        if (col.sparse_vectors) {
          createConfig.sparse_vectors = col.sparse_vectors;
        }
        
        await client.createCollection(col.name, createConfig);
        console.log(`  ✓ Collection created`);
      } catch (createError) {
        console.error(`  ❌ Collection creation failed:`, createError.message || createError);
        if (createError.data) {
          console.error(`  Error details:`, JSON.stringify(createError.data, null, 2));
        }
        throw createError;
      }
      
      // Insert in batches
      let insertedCount = 0;
      for (let i = 0; i < col.data.length; i += 20) {
        const batch = col.data.slice(i, i + 20);
        const points = batch.map((p, idx) => {
          const pointId = i + idx + 1;
          
          // Handle multi-vector points
          let vectorData;
          if (col.vectors) {
            // Extract named dense vectors
            const namedVectors = {};
            for (const vecName of Object.keys(col.vectors)) {
              const dataFieldName = vecName === 'dense' ? 'dense_vector' : vecName;
              if (p[dataFieldName] && Array.isArray(p[dataFieldName])) {
                namedVectors[vecName] = p[dataFieldName];
              } else if (p[vecName] && Array.isArray(p[vecName])) {
                namedVectors[vecName] = p[vecName];
              }
            }
            
            // Handle sparse vectors separately
            if (col.sparse_vectors) {
              for (const sparseVecName of Object.keys(col.sparse_vectors)) {
                const dataFieldName = sparseVecName === 'sparse' ? 'sparse_vector' : sparseVecName;
                const sparseData = p[dataFieldName];
                if (sparseData && sparseData.indices && sparseData.values) {
                  namedVectors[sparseVecName] = {
                    indices: sparseData.indices,
                    values: sparseData.values,
                  };
                }
              }
            }
            
            vectorData = namedVectors;
          } else {
            // Single vector
            if (!Array.isArray(p.vector) || p.vector.length !== col.dimension) {
              throw new Error(`Invalid vector for ${p.id}: expected length ${col.dimension}, got ${p.vector?.length || 0}`);
            }
            vectorData = p.vector;
          }
          
          // Clean payload - remove vector fields and id
          const cleanPayload = {};
          const vectorFieldsToExclude = ['id', 'vector', 'dense_vector', 'sparse_vector'];
          if (col.vectors) {
            vectorFieldsToExclude.push(...Object.keys(col.vectors));
          }
          
          for (const [key, value] of Object.entries(p)) {
            if (vectorFieldsToExclude.includes(key)) {
              continue;
            }
            if (value !== null && value !== undefined) {
              if (typeof value === 'number' && !isNaN(value)) {
                cleanPayload[key] = value;
              } else if (typeof value === 'boolean') {
                cleanPayload[key] = value;
              } else if (typeof value === 'string') {
                cleanPayload[key] = value;
              } else if (Array.isArray(value)) {
                cleanPayload[key] = value;
              } else {
                cleanPayload[key] = String(value);
              }
            }
          }
          
          return {
            id: pointId,
            vector: vectorData,
            payload: cleanPayload,
          };
        });
        
        try {
          await client.upsert(col.name, {
            wait: true,
            points: points,
          });
          insertedCount += batch.length;
        } catch (insertError) {
          console.error(`  ❌ Failed to insert batch ${i + 1}-${i + batch.length}:`, insertError.message);
          throw insertError;
        }
      }
      console.log(`  ✓ Inserted ${insertedCount} items`);
      
      // Create payload indexes for common fields
      const indexFields = col.name === 'ecommerce_products' 
        ? ['category', 'brand', 'price', 'inStock', 'rating']
        : col.name === 'research_papers'
        ? ['field', 'year', 'citations', 'journal']
        : col.name === 'user_profiles'
        ? ['city', 'country', 'isPremium', 'isVerified']
        : col.name === 'photo_gallery'
        ? ['category', 'photographer', 'format', 'width', 'height']
        : col.name === 'multi_vector_products'
        ? ['category', 'brand', 'price']
        : col.name === 'hybrid_products'
        ? ['category', 'brand', 'price', 'inStock', 'rating']
        : col.name === 'hybrid_documents'
        ? ['docType', 'author', 'language', 'wordCount']
        : col.name === 'hybrid_papers'
        ? ['field', 'year', 'citations']
        : ['docType', 'author', 'wordCount'];
      
      let indexCount = 0;
      for (const field of indexFields) {
        try {
          const fieldType = ['price', 'rating', 'citations', 'year', 'wordCount', 'width', 'height', 'plays', 'likes', 'views', 'downloads', 'bedrooms', 'bathrooms', 'squareFeet', 'yearBuilt'].includes(field) ? 'float'
            : ['inStock', 'isPremium', 'isVerified', 'isPublic'].includes(field) ? 'bool'
            : 'keyword';
          
          await client.createPayloadIndex(col.name, {
            field_name: field,
            field_schema: fieldType,
          });
          indexCount++;
        } catch (e) {
          // Index may already exist
        }
      }
      
      if (indexCount > 0) {
        console.log(`  ✓ Created ${indexCount} payload indexes`);
      }
      
      console.log(`✅ Qdrant: ${col.name} (${insertedCount} items, ${indexCount} indexes)`);
    } catch (error) {
      console.error(`❌ Qdrant ${col.name}:`, error.message);
    }
  }
}

