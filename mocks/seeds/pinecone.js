import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import {
  generateProducts,
  generateDocuments,
  generateUsers,
  generateImages,
  generateRealEstate,
  generateHybridProducts,
  generateHybridDocuments,
  generateHybridPapers,
  sparseToDictFormat,
} from '../generators.js';

dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';

export async function seedPineconeDB() {
  console.log('\n🚀 Seeding Pinecone...\n');
  
  if (!PINECONE_API_KEY) {
    console.error('❌ PINECONE_API_KEY is required');
    return;
  }

  const client = new Pinecone({
    apiKey: PINECONE_API_KEY,
  });

  try {
    // Test connection by listing indexes
    await client.listIndexes();
    console.log('✓ Connected to Pinecone');
  } catch (error) {
    console.error('❌ Cannot connect to Pinecone:', error.message);
    return;
  }

  // Pinecone-specific collections with multiple namespaces
  // Note: Pinecone index names must be lowercase alphanumeric with hyphens only (no underscores)
  const collections = [
    {
      name: 'product-index',
      dimension: 384,
      namespaces: [
        { name: 'electronics', data: generateProducts(15, 384).map(p => ({ ...p, category: 'Electronics' })) },
        { name: 'clothing', data: generateProducts(12, 384).map(p => ({ ...p, category: 'Clothing' })) },
        { name: 'home', data: generateProducts(10, 384).map(p => ({ ...p, category: 'Home & Garden' })) },
      ],
      description: 'Product search index with namespace isolation',
    },
    {
      name: 'content-index',
      dimension: 768,
      namespaces: [
        { name: 'articles', data: generateDocuments(20, 768).map(d => ({ ...d, docType: 'article' })) },
        { name: 'reports', data: generateDocuments(15, 768).map(d => ({ ...d, docType: 'report' })) },
        { name: 'tutorials', data: generateDocuments(18, 768).map(d => ({ ...d, docType: 'tutorial' })) },
      ],
      description: 'Content search index with multiple content types',
    },
    {
      name: 'user-index',
      dimension: 256,
      namespaces: [
        { name: 'premium', data: generateUsers(20, 256).map(u => ({ ...u, tier: 'premium', subscriptionActive: true })) },
        { name: 'free', data: generateUsers(25, 256).map(u => ({ ...u, tier: 'free', subscriptionActive: false })) },
        { name: 'enterprise', data: generateUsers(10, 256).map(u => ({ ...u, tier: 'enterprise', subscriptionActive: true })) },
      ],
      description: 'User profile index with tier-based namespaces',
    },
    {
      name: 'media-index',
      dimension: 512,
      namespaces: [
        { name: 'images', data: generateImages(20, 512).map(img => ({ ...img, mediaType: 'image' })) },
        { name: 'videos', data: generateImages(15, 512).map(img => ({ ...img, mediaType: 'video', duration: Math.floor(Math.random() * 3600) })) },
        { name: 'audio', data: generateImages(12, 512).map(img => ({ ...img, mediaType: 'audio', duration: Math.floor(Math.random() * 600) })) },
      ],
      description: 'Media asset index with type-based namespaces',
    },
    {
      name: 'property-index',
      dimension: 384,
      namespaces: [
        { name: 'residential', data: generateRealEstate(15, 384).map(p => ({ ...p, propertyType: 'residential' })) },
        { name: 'commercial', data: generateRealEstate(12, 384).map(p => ({ ...p, propertyType: 'commercial' })) },
        { name: 'land', data: generateRealEstate(8, 384).map(p => ({ ...p, propertyType: 'land' })) },
      ],
      description: 'Real estate listing index with property type namespaces',
    },
    {
      name: 'hybrid-product-index',
      dimension: 384,
      namespaces: [
        { name: 'all', data: generateHybridProducts(30, 384) },
      ],
      description: 'Hybrid search product index (dense + sparse vectors)',
      supportsHybrid: true,
    },
    {
      name: 'hybrid-document-index',
      dimension: 768,
      namespaces: [
        { name: 'all', data: generateHybridDocuments(25, 768) },
      ],
      description: 'Hybrid search document index (semantic + keyword)',
      supportsHybrid: true,
    },
    {
      name: 'hybrid-paper-index',
      dimension: 768,
      namespaces: [
        { name: 'all', data: generateHybridPapers(20, 768) },
      ],
      description: 'Hybrid search research papers index',
      supportsHybrid: true,
    },
  ];

  for (const col of collections) {
    try {
      console.log(`\n📦 Processing index: ${col.name}`);
      console.log(`   ${col.description}`);
      
      // Delete index if exists
      try {
        await client.deleteIndex(col.name);
        console.log(`  ✓ Deleted existing index`);
        // Wait for deletion to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        // Index may not exist
      }
      
      // Create index (serverless)
      try {
        await client.createIndex({
          name: col.name,
          dimension: col.dimension,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1',
            },
          },
        });
        console.log(`  ✓ Index created (waiting for readiness...)`);
        
        // Wait for index to be ready
        let ready = false;
        let attempts = 0;
        while (!ready && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const status = await client.describeIndex(col.name);
            if (status.status?.ready) {
              ready = true;
            }
          } catch (e) {
            // Continue waiting
          }
          attempts++;
        }
        
        if (!ready) {
          console.warn(`  ⚠️  Index may not be ready yet, continuing anyway...`);
        } else {
          console.log(`  ✓ Index is ready`);
        }
      } catch (createError) {
        if (createError.message?.includes('already exists') || createError.message?.includes('409')) {
          console.log(`  ✓ Index already exists`);
        } else {
          throw createError;
        }
      }
      
      // Get index instance
      const index = client.index(col.name);
      
      // Insert data into multiple namespaces
      let totalInserted = 0;
      const namespaces = col.namespaces || [{ name: '', data: col.data || [] }];
      
      for (const namespace of namespaces) {
        console.log(`  📁 Inserting into namespace: "${namespace.name || '(default)'}"`);
        const namespaceData = namespace.data || [];
        let insertedCount = 0;
        
        // Insert data in batches
        for (let i = 0; i < namespaceData.length; i += 20) {
          const batch = namespaceData.slice(i, i + 20);
          
          const vectors = batch.map(p => {
            // Extract metadata (everything except id, vector, dense_vector, and sparse_vector)
            const metadata = {};
            for (const [key, value] of Object.entries(p)) {
              if (key !== 'id' && key !== 'vector' && key !== 'dense_vector' && key !== 'sparse_vector') {
                // Pinecone metadata supports string, number, boolean, array
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                  metadata[key] = value;
                } else if (Array.isArray(value)) {
                  metadata[key] = value;
                } else if (value !== null && value !== undefined) {
                  metadata[key] = String(value);
                }
              }
            }
            
            const vectorData = {
              id: String(p.id),
              values: p.dense_vector || p.vector,
              metadata: metadata,
            };
            
            // Add sparse vector if available (for hybrid search)
            if (p.sparse_vector && p.sparse_vector.indices && p.sparse_vector.values) {
              vectorData.sparseValues = {
                indices: p.sparse_vector.indices,
                values: p.sparse_vector.values,
              };
            }
            
            return vectorData;
          });
          
          try {
            await index.namespace(namespace.name).upsert(vectors);
            insertedCount += batch.length;
          } catch (insertError) {
            console.error(`  ❌ Failed to insert batch in namespace "${namespace.name}":`, insertError.message);
            throw insertError;
          }
        }
        
        console.log(`    ✓ Inserted ${insertedCount} items`);
        totalInserted += insertedCount;
      }
      
      // Show namespace statistics
      try {
        const stats = await index.describeIndexStats();
        console.log(`  📊 Namespace statistics:`);
        if (stats.namespaces) {
          Object.entries(stats.namespaces).forEach(([ns, data]) => {
            console.log(`    "${ns || '(default)'}": ${data.recordCount || 0} vectors`);
          });
        }
      } catch (e) {
        // Ignore stats errors
      }
      
      console.log(`✅ Pinecone: ${col.name} (${totalInserted} items across ${namespaces.length} namespace${namespaces.length > 1 ? 's' : ''})`);
    } catch (error) {
      console.error(`❌ Pinecone ${col.name}:`, error.message);
    }
  }
}

