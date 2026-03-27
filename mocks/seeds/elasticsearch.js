import { Client } from '@elastic/elasticsearch';
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

const ELASTICSEARCH_URL =
  process.env.ELASTICSEARCH_URL ||
  (() => {
    const host = process.env.ELASTICSEARCH_HOST || 'localhost';
    const port = process.env.ELASTICSEARCH_PORT || '9200';
    return `http://${host}:${port}`;
  })();
const config = { node: ELASTICSEARCH_URL };

if (process.env.ELASTICSEARCH_API_KEY) {
  config.auth = { apiKey: process.env.ELASTICSEARCH_API_KEY };
}

const client = new Client(config);

function toIndexName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'default';
}

export async function seedElasticsearchDB() {
  console.log('\n🚀 Seeding Elasticsearch...\n');
  console.log(`  Connecting to ${ELASTICSEARCH_URL}`);

  try {
    const info = await client.info();
    console.log('✓ Connected to Elasticsearch', info.version?.number || '');
  } catch (err) {
    console.error('❌ Cannot connect to Elasticsearch:', err.message);
    return;
  }

  const collections = [
    {
      name: 'ecommerce_products',
      dimension: 384,
      data: generateProducts(30, 384),
      textFields: ['name', 'description', 'category', 'brand'],
      description: 'E-commerce products with rich metadata',
    },
    {
      name: 'research_papers',
      dimension: 768,
      data: generatePapers(25, 768),
      textFields: ['title', 'abstract', 'field', 'journal'],
      description: 'Scientific research papers',
    },
    {
      name: 'user_profiles',
      dimension: 256,
      data: generateUsers(40, 256),
      textFields: ['username', 'fullName', 'bio', 'city', 'country'],
      description: 'User profile embeddings',
    },
    {
      name: 'photo_gallery',
      dimension: 512,
      data: generateImages(35, 512),
      textFields: ['title', 'description', 'category', 'photographer'],
      description: 'Photo gallery with image URLs',
    },
    {
      name: 'documents',
      dimension: 768,
      data: generateDocuments(30, 768),
      textFields: ['title', 'content', 'excerpt', 'author', 'docType'],
      description: 'Documents with full text for BM25',
    },
    {
      name: 'multi_vector_products',
      vectors: { text_embedding: 384, image_embedding: 512 },
      data: generateMultiVectorProducts(20),
      textFields: ['name', 'description', 'category', 'brand'],
      description: 'Products with multiple vector fields',
    },
    {
      name: 'multi_vector_docs',
      vectors: { title_embedding: 256, content_embedding: 768, summary_embedding: 384 },
      data: generateMultiVectorDocuments(15),
      textFields: ['title', 'content', 'summary', 'author'],
      description: 'Documents with multiple vector embeddings',
    },
  ];

  for (const col of collections) {
    const indexName = toIndexName(col.name);
    try {
      console.log(`\n📦 Processing index: ${indexName}`);

      try {
        await client.indices.delete({ index: indexName });
        console.log('  ✓ Dropped existing index');
      } catch (e) {
        if (e.meta?.statusCode !== 404) throw e;
      }

      const properties = {
        id: { type: 'keyword' },
      };

      if (col.vectors) {
        for (const [vecName, dim] of Object.entries(col.vectors)) {
          const fieldName = vecName === 'embedding' ? 'embedding' : vecName;
          properties[fieldName] = {
            type: 'dense_vector',
            dims: dim,
            index: true,
            similarity: 'cosine',
          };
        }
      } else {
        properties.embedding = {
          type: 'dense_vector',
          dims: col.dimension,
          index: true,
          similarity: 'cosine',
        };
      }

      for (const field of col.textFields || []) {
        properties[field] = { type: 'text', fields: { keyword: { type: 'keyword' } } };
      }

      await client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: { ...properties },
            dynamic: true,
          },
        },
      });
      console.log('  ✓ Index created');

      const bulkBody = [];
      for (let i = 0; i < col.data.length; i++) {
        const p = col.data[i];
        const docId = String(p.id || `doc_${i + 1}`);

        const source = { id: docId };
        if (col.vectors) {
          for (const [vecName] of Object.entries(col.vectors)) {
            const dataField = vecName === 'text_embedding' ? 'text_embedding' : vecName === 'image_embedding' ? 'image_embedding' : vecName;
            const vec = p[dataField] ?? p[vecName];
            if (Array.isArray(vec)) source[vecName] = vec;
          }
        } else {
          source.embedding = p.vector;
        }

        for (const [key, value] of Object.entries(p)) {
          if (key === 'vector' || key === 'id' || (col.vectors && Object.keys(col.vectors).includes(key))) continue;
          if (value !== null && value !== undefined) source[key] = value;
        }

        bulkBody.push({ index: { _index: indexName, _id: docId } });
        bulkBody.push(source);
      }

      const bulkResp = await client.bulk({ refresh: true, body: bulkBody });
      if (bulkResp.errors) {
        const errs = bulkResp.items.filter((i) => i.index?.error);
        if (errs.length) console.error('  ⚠ Bulk errors:', errs.slice(0, 3));
      }
      console.log(`  ✓ Indexed ${col.data.length} documents`);
      console.log(`✅ Elasticsearch: ${indexName} (${col.data.length} docs)`);
    } catch (err) {
      console.error(`❌ Elasticsearch ${indexName}:`, err.message);
    }
  }
}
