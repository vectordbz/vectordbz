import axios from 'axios';
import pg from 'pg';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { createClient as createRedisClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const QDRANT_URL = process.env.QDRANT_URL || `http://${process.env.QDRANT_HOST || 'localhost'}:${process.env.QDRANT_PORT || '6333'}`;
const WEAVIATE_URL = process.env.WEAVIATE_URL || `http://${process.env.WEAVIATE_HOST || 'localhost'}:${process.env.WEAVIATE_PORT || '8080'}`;
const CHROMA_URL = process.env.CHROMA_URL || `http://${process.env.CHROMA_HOST || 'localhost'}:${process.env.CHROMA_PORT || '8000'}`;
const MILVUS_URL = process.env.MILVUS_URL || `http://${process.env.MILVUS_HOST || 'localhost'}:${process.env.MILVUS_PORT || '19530'}`;
const POSTGRES_URL = process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/vectordb';
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || `http://${process.env.ELASTICSEARCH_HOST || 'localhost'}:${process.env.ELASTICSEARCH_PORT || '9200'}`;
const REDIS_URL = process.env.REDIS_URL || (() => {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD || '';
  return password ? `redis://:${password}@${host}:${port}` : `redis://${host}:${port}`;
})();

async function cleanQdrant() {
  console.log('\nCleaning Qdrant...');
  try {
    const response = await axios.get(`${QDRANT_URL}/collections`);
    const collections = response.data.result.collections || [];
    for (const col of collections) {
      await axios.delete(`${QDRANT_URL}/collections/${col.name}`);
      console.log(`  Deleted: ${col.name}`);
    }
    console.log('Done.');
  } catch (error) {
    console.error(`Skipped (${error.message})`);
  }
}

async function cleanWeaviate() {
  console.log('\nCleaning Weaviate...');
  try {
    const response = await axios.get(`${WEAVIATE_URL}/v1/schema`);
    const classes = response.data.classes || [];
    for (const cls of classes) {
      await axios.delete(`${WEAVIATE_URL}/v1/schema/${cls.class}`);
      console.log(`  Deleted: ${cls.class}`);
    }
    console.log('Done.');
  } catch (error) {
    console.error(`Skipped (${error.message})`);
  }
}

async function cleanChroma() {
  console.log('\nCleaning ChromaDB...');
  try {
    const response = await axios.get(`${CHROMA_URL}/api/v1/collections`);
    const collections = response.data || [];
    for (const col of collections) {
      await axios.delete(`${CHROMA_URL}/api/v1/collections/${col.name}`);
      console.log(`  Deleted: ${col.name}`);
    }
    console.log('Done.');
  } catch (error) {
    console.error(`Skipped (${error.message})`);
  }
}

async function cleanMilvus() {
  console.log('\nCleaning Milvus...');
  try {
    const response = await axios.get(`${MILVUS_URL}/v2/vectordb/collections/list`, {
      params: { dbName: 'default' },
    });
    const collections = response.data.data || [];
    for (const name of collections) {
      await axios.post(`${MILVUS_URL}/v2/vectordb/collections/drop`, {
        dbName: 'default',
        collectionName: name,
      });
      console.log(`  Deleted: ${name}`);
    }
    console.log('Done.');
  } catch (error) {
    console.error(`Skipped (${error.message})`);
  }
}

async function cleanPgVector() {
  console.log('\nCleaning PostgreSQL (pgvector)...');
  try {
    const pool = new Pool({ connectionString: POSTGRES_URL });
    const result = await pool.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    for (const { tablename } of result.rows) {
      await pool.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
      console.log(`  Deleted: ${tablename}`);
    }
    await pool.end();
    console.log('Done.');
  } catch (error) {
    console.error(`Skipped (${error.message})`);
  }
}

async function cleanElasticsearch() {
  console.log('\nCleaning Elasticsearch...');
  try {
    const esConfig = { node: ELASTICSEARCH_URL };
    if (process.env.ELASTICSEARCH_API_KEY) {
      esConfig.auth = { apiKey: process.env.ELASTICSEARCH_API_KEY };
    }
    const client = new ElasticsearchClient(esConfig);
    const { indices } = await client.cat.indices({ format: 'json' });
    const userIndices = (indices || [])
      .map(i => i.index)
      .filter(name => name && !name.startsWith('.'));
    for (const index of userIndices) {
      await client.indices.delete({ index });
      console.log(`  Deleted: ${index}`);
    }
    console.log('Done.');
  } catch (error) {
    console.error(`Skipped (${error.message})`);
  }
}

async function cleanRedisSearch() {
  console.log('\nCleaning RedisSearch...');
  const client = createRedisClient({ url: REDIS_URL });
  client.on('error', () => {});
  try {
    await client.connect();
    const indexes = await client.ft._list();
    for (const index of indexes) {
      await client.ft.dropIndex(index, { DD: true });
      console.log(`  Deleted: ${index}`);
    }
    console.log('Done.');
  } catch (error) {
    console.error(`Skipped (${error.message})`);
  } finally {
    await client.quit().catch(() => {});
  }
}

async function main() {
  console.log('VectorDB Cleaner');
  console.log('================');

  await cleanQdrant();
  await cleanWeaviate();
  await cleanChroma();
  await cleanMilvus();
  await cleanPgVector();
  await cleanElasticsearch();
  await cleanRedisSearch();

  console.log('\nAll databases cleaned.');
}

main().catch(console.error);
