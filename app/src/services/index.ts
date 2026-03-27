// Export all services
export { QdrantClient } from './clients/qdrant';
export { WeaviateClient } from './clients/weaviate';
export { MilvusClient } from './clients/milvus';
export { ChromaDBClient } from './clients/chromadb';
export { PgVectorClient } from './clients/pgvector';
export { PineconeClient } from './clients/pinecone';
export { ElasticsearchClient } from './clients/elasticsearch';
export { RedisSearchClient } from './clients/redissearch';
export { connectionStore, settingsStore } from './store';
export * from './vectorUtils';
export {
  mergeWithDefault,
  getSchemaDerivedCapabilities,
} from './searchCapabilities';
import { VectorDBClient, ConnectionConfig, DatabaseType, DatabaseOption } from '../types';
import { QdrantClient } from './clients/qdrant';
import { WeaviateClient } from './clients/weaviate';
import { MilvusClient } from './clients/milvus';
import { ChromaDBClient } from './clients/chromadb';
import { PgVectorClient } from './clients/pgvector';
import { PineconeClient } from './clients/pinecone';
import { ElasticsearchClient } from './clients/elasticsearch';
import { RedisSearchClient } from './clients/redissearch';

/**
 * Factory function to create a database client based on type
 */
export function createClient(
  type: DatabaseType,
  config: ConnectionConfig
): VectorDBClient {
  switch (type) {
    case 'qdrant':
      return new QdrantClient(config);
    case 'weaviate':
      return new WeaviateClient(config);
    case 'milvus':
      return new MilvusClient(config);
    case 'chromadb':
      return new ChromaDBClient(config);
    case 'pgvector':
      return new PgVectorClient(config);
    case 'pinecone':
      return new PineconeClient(config);
    case 'elasticsearch':
      return new ElasticsearchClient(config);
    case 'redissearch':
      return new RedisSearchClient(config);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}

