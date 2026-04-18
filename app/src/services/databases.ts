import { DatabaseOption } from '../types';

export function getDatabaseColor(type: string) {
  const colors: Record<string, string> = {
    qdrant: '#dc4a68',
    weaviate: '#00d4aa',
    chromadb: '#ffd54f',
    milvus: '#4fc3f7',
    pgvector: '#326690',
    pinecone: '#0A0A0A',
    elasticsearch: '#D7689D',
    redissearch: '#DC382D',
  };
  return colors[type] || '#6366f1';
}

const defaultPresets = {
  host: undefined,
  port: undefined,
  apiKey: undefined,
  database: undefined,
  tenant: undefined,
  user: undefined,
  password: undefined,
};

export const databaseOptions: DatabaseOption[] = [
  {
    value: 'qdrant',
    label: 'Qdrant',
    color: getDatabaseColor('qdrant'),
    fields: ['host', 'port', 'apiKey'],
    presets: { ...defaultPresets, host: 'localhost', port: 6333 },
  },
  {
    value: 'weaviate',
    label: 'Weaviate',
    color: getDatabaseColor('weaviate'),
    fields: ['host', 'port', 'apiKey'],
    presets: { ...defaultPresets, host: 'localhost', port: 8080 },
  },
  {
    value: 'milvus',
    label: 'Milvus',
    color: getDatabaseColor('milvus'),
    fields: ['host', 'port', 'apiKey', 'database'],
    presets: { ...defaultPresets, host: 'localhost', port: 19530, database: '' },
  },
  {
    value: 'chromadb',
    label: 'ChromaDB',
    color: getDatabaseColor('chromadb'),
    fields: ['host', 'port', 'apiKey', 'database', 'tenant'],
    presets: { ...defaultPresets, host: 'localhost', port: 8000 },
  },
  {
    value: 'pgvector',
    label: 'PGVector',
    color: getDatabaseColor('pgvector'),
    fields: ['host', 'port', 'database', 'user', 'password'],
    presets: { ...defaultPresets, host: 'localhost', port: 5432 },
  },
  {
    value: 'pinecone',
    label: 'Pinecone',
    color: getDatabaseColor('pinecone'),
    fields: ['apiKey'],
    presets: { ...defaultPresets },
  },
  {
    value: 'elasticsearch',
    label: 'Elasticsearch',
    color: getDatabaseColor('elasticsearch'),
    fields: ['host', 'port', 'apiKey'],
    presets: { ...defaultPresets, host: 'localhost', port: 9200 },
  },
  {
    value: 'redissearch',
    label: 'RedisSearch',
    color: getDatabaseColor('redissearch'),
    fields: ['host', 'port', 'password'],
    presets: { ...defaultPresets, host: 'localhost', port: 6379 },
  },
];
