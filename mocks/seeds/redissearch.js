import { createClient } from 'redis';
import dotenv from 'dotenv';
import {
  generateProducts,
  generateDocuments,
  generateUsers,
  generateImages,
  generatePapers,
  generateMultiVectorProducts,
  generateMultiVectorDocuments,
} from '../generators.js';

dotenv.config();

const REDIS_URL =
  process.env.REDIS_URL ||
  (() => {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || '6379';
    const password = process.env.REDIS_PASSWORD || '';
    if (password) {
      return `redis://:${password}@${host}:${port}`;
    }
    return `redis://${host}:${port}`;
  })();

function toIndexName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'default';
}

function float32ArrayToBuffer(vector) {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }
  return buffer;
}

export async function seedRedisSearchDB() {
  console.log('\n🚀 Seeding RedisSearch...\n');
  console.log(`  Connecting to ${REDIS_URL.replace(/:\/\/:.*@/, '://:***@')}`);

  const client = createClient({ url: REDIS_URL });

  client.on('error', () => {});

  try {
    await client.connect();
    await client.ping();
    const info = await client.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    console.log('✓ Connected to Redis', versionMatch?.[1]?.trim() || '');
  } catch (err) {
    console.error('❌ Cannot connect to Redis:', err.message);
    await client.quit().catch(() => {});
    return;
  }

  const collections = [
    {
      name: 'ecommerce_products',
      dimension: 384,
      data: generateProducts(30, 384),
      textFields: ['name', 'description', 'category', 'brand'],
      numericFields: ['price', 'rating', 'reviewCount', 'stock'],
      tagFields: ['inStock'],
      description: 'E-commerce products with rich metadata',
    },
    {
      name: 'research_papers',
      dimension: 768,
      data: generatePapers(25, 768),
      textFields: ['title', 'abstract', 'field', 'journal'],
      numericFields: ['year', 'citations'],
      tagFields: [],
      description: 'Scientific research papers',
    },
    {
      name: 'user_profiles',
      dimension: 256,
      data: generateUsers(40, 256),
      textFields: ['username', 'fullName', 'bio', 'city', 'country'],
      numericFields: [],
      tagFields: ['isPremium', 'isVerified'],
      description: 'User profile embeddings',
    },
    {
      name: 'photo_gallery',
      dimension: 512,
      data: generateImages(35, 512),
      textFields: ['title', 'description', 'category', 'photographer'],
      numericFields: ['width', 'height'],
      tagFields: ['format'],
      description: 'Photo gallery with image URLs',
    },
    {
      name: 'documents',
      dimension: 768,
      data: generateDocuments(30, 768),
      textFields: ['title', 'content', 'excerpt', 'author', 'docType'],
      numericFields: ['wordCount'],
      tagFields: ['language'],
      description: 'Documents with full text for hybrid search',
    },
    {
      name: 'multi_vector_products',
      vectors: { text_embedding: 384, image_embedding: 512 },
      data: generateMultiVectorProducts(20),
      textFields: ['name', 'description', 'category', 'brand'],
      numericFields: ['price'],
      tagFields: [],
      description: 'Products with multiple vector fields',
    },
    {
      name: 'multi_vector_docs',
      vectors: { title_embedding: 256, content_embedding: 768, summary_embedding: 384 },
      data: generateMultiVectorDocuments(15),
      textFields: ['title', 'content', 'summary', 'author'],
      numericFields: ['wordCount'],
      tagFields: [],
      description: 'Documents with multiple vector embeddings',
    },
  ];

  for (const col of collections) {
    const indexName = toIndexName(col.name);
    const keyPrefix = `${indexName}:`;

    try {
      console.log(`\n📦 Processing index: ${indexName}`);

      // Drop existing index and all associated keys
      try {
        await client.ft.dropIndex(indexName, { DD: true });
        console.log('  ✓ Dropped existing index and data');
      } catch (e) {
        if (!e.message?.includes('Unknown Index name')) throw e;
      }

      // Build schema
      const schema = {};

      if (col.vectors) {
        for (const [vecName, dim] of Object.entries(col.vectors)) {
          schema[vecName] = {
            type: 'VECTOR',
            ALGORITHM: 'HNSW',
            TYPE: 'FLOAT32',
            DIM: dim,
            DISTANCE_METRIC: 'COSINE',
          };
        }
      } else {
        schema.embedding = {
          type: 'VECTOR',
          ALGORITHM: 'HNSW',
          TYPE: 'FLOAT32',
          DIM: col.dimension,
          DISTANCE_METRIC: 'COSINE',
        };
      }

      for (const field of col.textFields || []) {
        schema[field] = { type: 'TEXT' };
      }
      for (const field of col.numericFields || []) {
        schema[field] = { type: 'NUMERIC' };
      }
      for (const field of col.tagFields || []) {
        schema[field] = { type: 'TAG' };
      }

      await client.ft.create(indexName, schema, {
        ON: 'HASH',
        PREFIX: keyPrefix,
      });
      console.log('  ✓ Index created');

      // Insert documents as Redis Hashes
      let insertedCount = 0;
      for (let i = 0; i < col.data.length; i++) {
        const p = col.data[i];
        const docId = p.id || `doc_${i + 1}`;
        const key = `${keyPrefix}${docId}`;

        const hashData = { id: String(docId) };

        if (col.vectors) {
          for (const [vecName, dim] of Object.entries(col.vectors)) {
            const vec = p[vecName] ?? p[`${vecName}`];
            if (Array.isArray(vec) && vec.length === dim) {
              hashData[vecName] = float32ArrayToBuffer(vec);
            }
          }
        } else {
          if (Array.isArray(p.vector)) {
            hashData.embedding = float32ArrayToBuffer(p.vector);
          }
        }

        for (const [key2, value] of Object.entries(p)) {
          if (key2 === 'vector' || key2 === 'id') continue;
          if (col.vectors && Object.keys(col.vectors).includes(key2)) continue;
          if (value === null || value === undefined) continue;
          if (typeof value === 'object' && !Array.isArray(value)) continue;
          hashData[key2] = Array.isArray(value) ? value.join(',') : String(value);
        }

        await client.hSet(key, hashData);
        insertedCount++;
      }

      console.log(`  ✓ Inserted ${insertedCount} documents`);
      console.log(`✅ RedisSearch: ${indexName} (${insertedCount} docs)`);
    } catch (err) {
      console.error(`❌ RedisSearch ${indexName}:`, err.message);
    }
  }

  await client.quit();
}
