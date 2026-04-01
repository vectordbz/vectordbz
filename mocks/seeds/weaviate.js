import axios from 'axios';
import {
  generateDocuments,
  generateUsers,
  generateImages,
  generatePapers,
  generateMusic,
  generateMultiVectorProducts,
  generateMultiVectorDocuments,
  generateProducts,
  generateUserMemories,
} from '../generators.js';

const WEAVIATE_URL = process.env.WEAVIATE_URL || 'http://localhost:8080';
const apiKey = process.env.WEAVIATE_API_KEY || '';
const headers = {
  'Content-Type': 'application/json',
};

if (apiKey) {
  headers['Authorization'] = `Bearer ${apiKey}`;
}

const client = axios.create({
  baseURL: WEAVIATE_URL,
  headers,
});

export async function seedWeaviateDB() {
  console.log('\n🚀 Seeding Weaviate...\n');
  
  try {
    await client.get('/v1/meta');
    console.log('✓ Connected to Weaviate');
  } catch {
    console.error('❌ Cannot connect to Weaviate');
    return;
  }

  // Weaviate-specific collections with unique schemas
  const collections = [
    {
      name: 'Article',
      data: generateDocuments(30, 768),
      properties: [
        { name: 'title', dataType: ['text'] },
        { name: 'content', dataType: ['text'] },
        { name: 'excerpt', dataType: ['text'] },
        { name: 'author', dataType: ['text'] },
        { name: 'authorEmail', dataType: ['text'] },
        { name: 'docType', dataType: ['text'] },
        { name: 'wordCount', dataType: ['int'] },
        { name: 'language', dataType: ['text'] },
        { name: 'readingTime', dataType: ['int'] },
        { name: 'isPublic', dataType: ['boolean'] },
        { name: 'viewCount', dataType: ['int'] },
      ],
      description: 'Article documents with full text content',
    },
    {
      name: 'Researcher',
      data: generateUsers(35, 256),
      properties: [
        { name: 'username', dataType: ['text'] },
        { name: 'fullName', dataType: ['text'] },
        { name: 'email', dataType: ['text'] },
        { name: 'bio', dataType: ['text'] },
        { name: 'city', dataType: ['text'] },
        { name: 'country', dataType: ['text'] },
        { name: 'timezone', dataType: ['text'] },
        { name: 'isPremium', dataType: ['boolean'] },
        { name: 'isVerified', dataType: ['boolean'] },
        { name: 'followerCount', dataType: ['int'] },
        { name: 'followingCount', dataType: ['int'] },
      ],
      description: 'Researcher profiles',
    },
    {
      name: 'MediaAsset',
      data: generateImages(25, 512),
      properties: [
        { name: 'title', dataType: ['text'] },
        { name: 'description', dataType: ['text'] },
        { name: 'imageUrl', dataType: ['text'] },
        { name: 'category', dataType: ['text'] },
        { name: 'photographer', dataType: ['text'] },
        { name: 'photographerEmail', dataType: ['text'] },
        { name: 'width', dataType: ['int'] },
        { name: 'height', dataType: ['int'] },
        { name: 'fileSize', dataType: ['int'] },
        { name: 'format', dataType: ['text'] },
        { name: 'views', dataType: ['int'] },
        { name: 'likes', dataType: ['int'] },
        { name: 'downloads', dataType: ['int'] },
        { name: 'license', dataType: ['text'] },
        { name: 'location', dataType: ['text'] },
      ],
      description: 'Media assets with image URLs',
    },
    {
      name: 'Publication',
      data: generatePapers(20, 768),
      properties: [
        { name: 'title', dataType: ['text'] },
        { name: 'abstract', dataType: ['text'] },
        { name: 'field', dataType: ['text'] },
        { name: 'journal', dataType: ['text'] },
        { name: 'year', dataType: ['int'] },
        { name: 'citations', dataType: ['int'] },
        { name: 'doi', dataType: ['text'] },
      ],
      description: 'Scientific publications',
    },
    {
      name: 'Track',
      data: generateMusic(30, 256),
      properties: [
        { name: 'title', dataType: ['text'] },
        { name: 'artist', dataType: ['text'] },
        { name: 'album', dataType: ['text'] },
        { name: 'genre', dataType: ['text'] },
        { name: 'duration', dataType: ['int'] },
        { name: 'year', dataType: ['int'] },
        { name: 'plays', dataType: ['int'] },
        { name: 'likes', dataType: ['int'] },
        { name: 'bpm', dataType: ['int'] },
        { name: 'key', dataType: ['text'] },
      ],
      description: 'Music tracks',
    },
    {
      name: 'MultiVectorProduct',
      data: generateMultiVectorProducts(20),
      vectors: {
        text_embedding: { dimension: 384, distance: 'cosine' },
        image_embedding: { dimension: 512, distance: 'cosine' },
      },
      properties: [
        { name: 'name', dataType: ['text'] },
        { name: 'description', dataType: ['text'] },
        { name: 'price', dataType: ['number'] },
        { name: 'category', dataType: ['text'] },
        { name: 'brand', dataType: ['text'] },
        { name: 'sku', dataType: ['text'] },
        { name: 'inStock', dataType: ['boolean'] },
        { name: 'rating', dataType: ['number'] },
        { name: 'reviewCount', dataType: ['int'] },
        { name: 'imageUrl', dataType: ['text'] },
      ],
      description: 'Products with multiple named vectors',
    },
    {
      name: 'MultiVectorDocument',
      data: generateMultiVectorDocuments(15),
      vectors: {
        title_embedding: { dimension: 256, distance: 'cosine' },
        content_embedding: { dimension: 768, distance: 'cosine' },
        summary_embedding: { dimension: 384, distance: 'cosine' },
      },
      properties: [
        { name: 'title', dataType: ['text'] },
        { name: 'content', dataType: ['text'] },
        { name: 'summary', dataType: ['text'] },
        { name: 'author', dataType: ['text'] },
        { name: 'docType', dataType: ['text'] },
        { name: 'wordCount', dataType: ['int'] },
      ],
      description: 'Documents with multiple named vectors',
    },
    {
      name: 'TenantDocument',
      data: generateDocuments(40, 768),
      multiTenant: true,
      tenants: ['acme-corp', 'techstart-inc', 'global-enterprises', 'innovate-labs'],
      properties: [
        { name: 'title', dataType: ['text'] },
        { name: 'content', dataType: ['text'] },
        { name: 'excerpt', dataType: ['text'] },
        { name: 'author', dataType: ['text'] },
        { name: 'authorEmail', dataType: ['text'] },
        { name: 'docType', dataType: ['text'] },
        { name: 'wordCount', dataType: ['int'] },
        { name: 'language', dataType: ['text'] },
        { name: 'isPublic', dataType: ['boolean'] },
        { name: 'viewCount', dataType: ['int'] },
      ],
      description: 'Multi-tenant documents (isolated by organization)',
    },
    {
      name: 'TenantProduct',
      data: generateProducts(50, 384),
      multiTenant: true,
      tenants: ['store-alpha', 'store-beta', 'store-gamma', 'store-delta', 'store-epsilon'],
      properties: [
        { name: 'name', dataType: ['text'] },
        { name: 'description', dataType: ['text'] },
        { name: 'price', dataType: ['number'] },
        { name: 'category', dataType: ['text'] },
        { name: 'brand', dataType: ['text'] },
        { name: 'sku', dataType: ['text'] },
        { name: 'inStock', dataType: ['boolean'] },
        { name: 'rating', dataType: ['number'] },
        { name: 'reviewCount', dataType: ['int'] },
      ],
      description: 'Multi-tenant products (isolated by store)',
    },
    {
      name: 'User_memories',
      data: generateUserMemories(5),
      description: 'User memories for agent memory store testing',
      // All properties listed here so the insert filter can match them
      properties: [
        { name: 'ids', dataType: ['text'] },
        { name: 'hash', dataType: ['text'] },
        { name: 'metadata', dataType: ['text'] },
        { name: 'data', dataType: ['text'] },
        { name: 'created_at', dataType: ['text'] },
        { name: 'category', dataType: ['text'] },
        { name: 'updated_at', dataType: ['text'] },
        { name: 'user_id', dataType: ['text'] },
        { name: 'agent_id', dataType: ['text'] },
        { name: 'run_id', dataType: ['text'] },
        { name: 'score', dataType: ['number'] },
        { name: 'payload', dataType: ['object'] },
      ],
      // Use the exact schema returned by Weaviate for full fidelity
      rawSchema: {
        class: 'User_memories',
        invertedIndexConfig: {
          bm25: { b: 0.75, k1: 1.2 },
          cleanupIntervalSeconds: 60,
          stopwords: { additions: null, preset: 'en', removals: null },
          usingBlockMaxWAND: true,
        },
        multiTenancyConfig: {
          autoTenantActivation: false,
          autoTenantCreation: false,
          enabled: false,
        },
        properties: [
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'ids', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'hash', tokenization: 'word' },
          { dataType: ['text'], description: 'Additional metadata', indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'metadata', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'data', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'created_at', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'category', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'updated_at', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'user_id', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'agent_id', tokenization: 'word' },
          { dataType: ['text'], indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'run_id', tokenization: 'word' },
          { dataType: ['number'], description: "This property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: false, name: 'score' },
          {
            dataType: ['object'],
            description: "This property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026",
            indexFilterable: true,
            indexRangeFilters: false,
            indexSearchable: false,
            name: 'payload',
            nestedProperties: [
              { dataType: ['date'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: false, name: 'updated_at' },
              { dataType: ['text'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'data', tokenization: 'word' },
              { dataType: ['text'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'user_id', tokenization: 'word' },
              { dataType: ['text'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'agent_id', tokenization: 'word' },
              { dataType: ['text'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'category', tokenization: 'word' },
              { dataType: ['uuid'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: false, name: 'hash' },
              { dataType: ['text'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: true, name: 'run_id', tokenization: 'word' },
              { dataType: ['uuid'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: false, name: 'id' },
              { dataType: ['date'], description: "This nested property was generated by Weaviate's auto-schema feature on Mon Mar 30 14:21:29 2026", indexFilterable: true, indexRangeFilters: false, indexSearchable: false, name: 'created_at' },
            ],
          },
        ],
        replicationConfig: { asyncEnabled: false, deletionStrategy: 'TimeBasedResolution', factor: 1 },
        shardingConfig: {
          actualCount: 1,
          actualVirtualCount: 128,
          desiredCount: 1,
          desiredVirtualCount: 128,
          function: 'murmur3',
          key: '_id',
          strategy: 'hash',
          virtualPerPhysical: 128,
        },
        vectorIndexConfig: {
          bq: { enabled: false },
          cleanupIntervalSeconds: 300,
          distance: 'cosine',
          dynamicEfFactor: 8,
          dynamicEfMax: 500,
          dynamicEfMin: 100,
          ef: -1,
          efConstruction: 128,
          filterStrategy: 'acorn',
          flatSearchCutoff: 40000,
          maxConnections: 32,
          multivector: { aggregation: 'maxSim', enabled: false, muvera: { dprojections: 16, enabled: false, ksim: 4, repetitions: 10 } },
          pq: { bitCompression: false, centroids: 256, enabled: false, encoder: { distribution: 'log-normal', type: 'kmeans' }, segments: 0, trainingLimit: 100000 },
          rq: { bits: 8, enabled: false, rescoreLimit: 20 },
          skip: false,
          skipDefaultQuantization: false,
          sq: { enabled: false, rescoreLimit: 20, trainingLimit: 100000 },
          trackDefaultQuantization: false,
          vectorCacheMaxObjects: 1000000000000,
        },
        vectorIndexType: 'hnsw',
        vectorizer: 'none',
      },
    },
  ];

  for (const col of collections) {
    try {
      console.log(`\n📦 Processing collection: ${col.name}`);
      
      // Delete if exists
      await client.delete(`/v1/schema/${col.name}`).catch(() => {});
      
      // Build schema config — use rawSchema verbatim when provided
      let schemaConfig;
      if (col.rawSchema) {
        schemaConfig = col.rawSchema;
      } else {
        schemaConfig = {
          class: col.name,
          invertedIndexConfig: {
            bm25: { b: 0.75, k1: 1.2 },
            stopwords: { preset: 'en' },
            indexTimestamps: true,
            indexNullState: true,
            indexPropertyLength: true,
          },
          properties: col.properties,
        };

        // Handle multiple vectors (named vectors) or single vector
        // Important: class-level vector config and named vectors are mutually exclusive
        if (col.vectors) {
          schemaConfig.vectorConfig = Object.fromEntries(
            Object.entries(col.vectors).map(([name, config]) => [
              name,
              {
                vectorizer: { none: {} },
                vectorIndexType: 'hnsw',
                vectorIndexConfig: {
                  distance: config.distance || 'cosine',
                  ef: 100,
                  efConstruction: 128,
                  maxConnections: 64,
                },
              },
            ])
          );
        } else {
          schemaConfig.vectorizer = 'none';
          schemaConfig.vectorIndexType = 'hnsw';
          schemaConfig.vectorIndexConfig = {
            distance: 'cosine',
            ef: 100,
            efConstruction: 128,
            maxConnections: 64,
          };
        }

        if (col.multiTenant) {
          schemaConfig.multiTenancyConfig = { enabled: true };
        }
      }
      
      try {
        await client.post(`/v1/schema`, schemaConfig);
        console.log(`  ✓ Collection created${col.vectors ? ' (with named vectors)' : ''}${col.multiTenant ? ' (multi-tenant enabled)' : ''}`);
      } catch (schemaError) {
        console.error(`  ❌ Schema creation failed:`, schemaError.response?.data || schemaError.message);
        throw schemaError;
      }
      
      // For multi-tenant collections, create tenants first
      if (col.multiTenant && col.tenants) {
        for (const tenant of col.tenants) {
          try {
            await client.post(`/v1/schema/${col.name}/tenants`, [{ name: tenant }]);
            console.log(`  ✓ Created tenant: ${tenant}`);
          } catch (tenantError) {
            // Tenant might already exist, that's okay
            if (tenantError.response?.status !== 422) {
              console.warn(`  ⚠ Could not create tenant ${tenant}:`, tenantError.response?.data || tenantError.message);
            }
          }
        }
      }
      
      // Insert in batches
      let insertedCount = 0;
      const tenantDataMap = new Map();
      
      // For multi-tenant collections, distribute data across tenants
      if (col.multiTenant && col.tenants) {
        col.data.forEach((item, index) => {
          const tenant = col.tenants[index % col.tenants.length];
          if (!tenantDataMap.has(tenant)) {
            tenantDataMap.set(tenant, []);
          }
          tenantDataMap.get(tenant).push(item);
        });
      } else {
        // Non-multi-tenant: use all data
        tenantDataMap.set(null, col.data);
      }
      
      // Insert data per tenant (or all at once for non-multi-tenant)
      for (const [tenant, tenantData] of tenantDataMap.entries()) {
        for (let i = 0; i < tenantData.length; i += 20) {
          const batch = tenantData.slice(i, i + 20);
          const batchRequest = {
            objects: batch.map(p => {
              const obj = {
                class: col.name,
                properties: Object.fromEntries(
                  Object.entries(p).filter(([k]) => {
                    // Exclude id and vector fields
                    if (k === 'id') return false;
                    if (col.vectors && Object.keys(col.vectors).includes(k)) return false;
                    if (!col.vectors && k === 'vector') return false;
                    // Only include properties defined in schema
                    return col.properties.some(prop => prop.name === k);
                  })
                ),
              };
              
              // Add tenant for multi-tenant collections
              if (col.multiTenant && tenant) {
                obj.tenant = tenant;
              }
              
              // Add vector(s)
              if (col.vectors) {
                // Multiple named vectors
                obj.vectors = {};
                for (const vecName of Object.keys(col.vectors)) {
                  if (p[vecName] && Array.isArray(p[vecName])) {
                    obj.vectors[vecName] = p[vecName];
                  }
                }
              } else {
                // Single vector
                obj.vector = p.vector;
              }
              
              return obj;
            }),
          };
          
          await client.post(`/v1/batch/objects`, batchRequest);
          insertedCount += batch.length;
        }
        
        if (tenant) {
          console.log(`  ✓ Inserted ${tenantData.length} items for tenant: ${tenant}`);
        }
      }
      
      console.log(`  ✓ Total inserted: ${insertedCount} items`);
      console.log(`✅ Weaviate: ${col.name} (${insertedCount} items${col.multiTenant ? `, ${col.tenants.length} tenants` : ''})`);
    } catch (error) {
      console.error(`❌ Weaviate ${col.name}:`, error.message);
    }
  }
}

