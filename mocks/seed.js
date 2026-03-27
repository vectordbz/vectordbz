import { seedQdrantDB }       from './seeds/qdrant.js';
import { seedWeaviateDB }     from './seeds/weaviate.js';
import { seedChromaDB }       from './seeds/chromadb.js';
import { seedMilvusDB }       from './seeds/milvus.js';
import { seedPineconeDB }     from './seeds/pinecone.js';
import { seedPgVectorDB }     from './seeds/pgvector.js';
import { seedElasticsearchDB } from './seeds/elasticsearch.js';
import { seedRedisSearchDB }  from './seeds/redissearch.js';

const args = process.argv.slice(2);
const seedAll = args.length === 0;

const seedQdrant       = seedAll || args.includes('--qdrant');
const seedWeaviate     = seedAll || args.includes('--weaviate');
const seedChroma       = seedAll || args.includes('--chroma');
const seedMilvus       = seedAll || args.includes('--milvus');
const seedPinecone     = seedAll || args.includes('--pinecone');
const seedPgVector     = seedAll || args.includes('--pgvector') || args.includes('--postgres');
const seedElastic      = seedAll || args.includes('--elasticsearch') || args.includes('--elastic');
const seedRedisSearch  = seedAll || args.includes('--redissearch') || args.includes('--redis');

async function main() {
  console.log('VectorDB Seed');
  console.log('=============');

  if (seedQdrant)      await seedQdrantDB();
  if (seedWeaviate)    await seedWeaviateDB();
  if (seedChroma)      await seedChromaDB();
  if (seedMilvus)      await seedMilvusDB();
  if (seedPinecone)    await seedPineconeDB();
  if (seedPgVector)    await seedPgVectorDB();
  if (seedElastic)     await seedElasticsearchDB();
  if (seedRedisSearch) await seedRedisSearchDB();

  console.log('\nDone. Open VectorDBZ and connect to explore the seeded data.');
}

main().catch(console.error);
