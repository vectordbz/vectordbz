import { DynamicFormSchema } from '../components/DynamicForm/types';

// ============================================
// Database Types
// ============================================

export type DatabaseType = 'qdrant' | 'weaviate' | 'milvus' | 'chromadb' | 'pgvector' | 'pinecone' | 'elasticsearch' | 'redissearch';

export interface DatabaseOption {
  value: DatabaseType;
  label: string;
  color: string;
  fields: string[];
  presets: Record<string, any>;
}

export interface ConnectionConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  apiKey?: string;
  https?: boolean; // For HTTP-based APIs and SSL for PostgreSQL
  tenant?: string; // For ChromaDB Cloud
  database?: string; // For ChromaDB Cloud and PostgreSQL
  user?: string; // For PostgreSQL
  password?: string; // For PostgreSQL
}

export interface SavedConnection extends ConnectionConfig {
  id: string;
  name: string;
  createdAt: string;
}

// ============================================
// Collection & Item Types
// ============================================

// Flexible collection structure - each database can store its own format
export interface Collection extends Record<string, unknown> {
  name: string;
  count: number;
}

export const COLLECTION_DEFAULT_VECTOR = '_vectordbz_default_vector';

export interface Document{
  primary: {
    name: string;
    value: string | number;
  }
  score?: number;
  vectors: Record<string, DocumentVector>;
  payload: Record<string, unknown>;
}

// Document vectors - discriminated union by type
export type DocumentVector = 
  | DenseDocumentVector 
  | SparseDocumentVector
  | BinaryDocumentVector;

export interface DenseDocumentVector {
  key: string;
  vectorType: 'dense';
  size: number;
  value: {
    data: number[]; // Float array
  };
}

export interface SparseDocumentVector {
  key: string;
  vectorType: 'sparse';
  value: {
    indices: number[];
    values: number[];
  };
}

export interface BinaryDocumentVector {
  key: string;
  vectorType: 'binary';
  size: number; // Size in bits
  value: {
    data: number[]; // Byte array (0-255)
  };
}

// ============================================
// Filter Types
// ============================================

export interface FilterCondition {
  field: string;
  operator: string;
  value: string | number | boolean;
  valueType: 'string' | 'number' | 'boolean';
}

export interface FilterQuery {
  conditions: FilterCondition[];
  logic: 'and' | 'or';
}

// ============================================
// API Options & Results
// ============================================

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export interface GetDocumentsOptions {
  limit?: number;
  offset?: string | number;
  filter?: FilterQuery;
  sort?: SortField[];
  dataRequirements?: Record<string, string>;
}

export interface SearchOptions {
  limit?: number;
  scoreThreshold?: number;
  filter?: FilterQuery;
  dataRequirements?: Record<string, string>;
  /** Vector field key when collection has multiple vectors (e.g. for search). */
  vectorKey?: string;
  /** Lexical query (BM25 / full-text). Used when client supports lexical/hybrid (e.g. Weaviate, pgvector FTS). */
  lexicalQuery?: string;
  /** Hybrid balance: 0 = keyword only, 1 = vector only, 0.5 = equal. Used when client supports hybrid (e.g. Weaviate). */
  hybridAlpha?: number;
}

/** Point from 2D/3D projection for visualization (VisualizeTab). */
export interface ProjectedPoint {
  id: string;
  x: number;
  y: number;
  z?: number;
  originalIndex: number;
  document: Document;
}

export interface ConnectionResult {
  success: boolean;
  version?: string;
  error?: string;
}

export interface GetCollectionsResult {
  success: boolean;
  collections?: Collection[];
  error?: string;
}

export interface GetDocumentsResult {
  success: boolean;
  documents?: Document[];
  nextOffset?: string | number | null;
  totalCount?: number;
  error?: string;
}

export interface SearchMetadata {
  // Timing
  searchTimeMs?: number;
  
  // Query stats
  requestedTopK?: number;
  returnedCount?: number;
  effectiveTopK?: number; // After threshold filtering
  
  // Embedding stats
  queryVectorDimension?: number;
  queryVectorNorm?: number;
  queryVectorMean?: number;
  queryVectorVariance?: number;
  queryVectorNormalized?: boolean;
  
  // Score statistics
  scoreDistribution?: {
    min: number;
    max: number;
    avg: number;
    median: number;
    scores: number[];
  };
  scoreGapRank1Rank2?: number;
  scoreEntropy?: number;
  
  // Confidence
  confidenceLevel?: 'high' | 'medium' | 'low';
  confidenceScore?: number;
  
  // Filter impact
  filterApplied?: boolean;
  filterConditions?: FilterCondition[];
  candidatesBeforeFilter?: number;
  candidatesAfterFilter?: number;
}

export interface SearchResult {
  success: boolean;
  documents?: Document[];
  error?: string;
  metadata?: SearchMetadata;
}

export interface UpsertDocumentData {
  document: Partial<Document>;
  dataRequirements?: Record<string, string>;
}

export interface UpsertDocumentResult {
  success: boolean;
  document?: Record<string, any>;
  error?: string;
}

export interface DeleteDocumentResult {
  success: boolean;
  error?: string;
}

export interface DeleteDocumentsResult {
  success: boolean;
  deletedCount?: number;
  error?: string;
}


export interface DropCollectionResult {
  success: boolean;
  error?: string;
}

export interface TruncateCollectionResult {
  success: boolean;
  deletedCount?: number;
  error?: string;
}

export interface CreateCollectionResult {
  success: boolean;
  error?: string;
}

export interface GetCollectionInfoResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'unknown' | 'vector';
  autoID?: boolean;
  description?: string;
  searchable?: boolean; // Whether this field is searchable (for text search/BM25)
}

// Vector schema fields - discriminated union by vector type
export type VectorSchemaField = 
  | DenseVectorSchemaField 
  | SparseVectorSchemaField
  | BinaryVectorSchemaField;

export interface DenseVectorSchemaField extends SchemaField {
  type: 'vector';
  vectorType: 'dense';
  size: number;
  distance?: string; // cosine, l2, dot, etc.
}

export interface SparseVectorSchemaField extends SchemaField {
  type: 'vector';
  vectorType: 'sparse';
  distance?: string; // Usually dot or ip
}

export interface BinaryVectorSchemaField extends SchemaField {
  type: 'vector';
  vectorType: 'binary';
  size: number; // Size in bits
  distance?: string; // hamming, jaccard, etc.
}

export interface CollectionSchema {
  primary: SchemaField;
  fields: Record<string, SchemaField>;
  vectors: Record<string, VectorSchemaField>;
  // wether collection has multiple vectors
  multipleVectors: boolean;
  // whether collection has vectors
  hasVectors: boolean;
  // data requirements for the collection like weaviate multi-tenant or pinecone namespaces
  dataRequirements?: Record<string, DataRequirement>;
}

export interface DataRequirement {
  key: string;
  value: string[];
}

export interface GetCollectionSchemaResult {
  success: boolean;
  schema?: CollectionSchema;
  error?: string;
}

// ============================================
// Search Capabilities (per-DB + default)
// ============================================

/** Fusion strategies the UI can offer for hybrid search */
export type FusionStrategy = 'rrf' | 'weighted' | 'server';

/** Describes what search/hybrid features a DB (and optionally a collection) supports */
export interface SearchCapabilities {
  /** Dense (semantic) vector search */
  dense: boolean;
  /** Sparse vector search (keyword-style indices) */
  sparse: boolean;
  /** Lexical search (BM25 / full-text search) */
  lexical: boolean;
  /** We can run multiple queries and fuse client-side (RRF, weighted) */
  clientSideFusion: boolean;
  /** Payload/metadata filters supported */
  filters: boolean;
  /** Score threshold / min score supported */
  scoreThreshold: boolean;
  /** Collection has multiple vector fields (schema-derived) */
  multipleVectorFields: boolean;
  /** Collection has at least one sparse vector field (schema-derived) */
  hasSparseVectorField: boolean;
  /** Collection has searchable text fields for lexical (schema-derived, e.g. pgvector FTS) */
  hasSearchableTextFields: boolean;
  /** Allowed fusion strategies for this context */
  fusionStrategies: FusionStrategy[];
  /** When true, UI can show hybrid alpha control (balance between keyword and vector, e.g. Weaviate). */
  supportsHybridAlpha?: boolean;
  /** Default hybrid alpha when not set (e.g. 0.75). */
  hybridAlphaDefault?: number;
  /** When true, backend supports native server-side hybrid (e.g. Elasticsearch sub_searches + RRF). */
  serverSideHybridNative?: boolean;
}

export interface GetSearchCapabilitiesResult {
  success: boolean;
  capabilities?: SearchCapabilities;
  error?: string;
}

/** Default capabilities: minimum every DB is assumed to support */
export const DEFAULT_SEARCH_CAPABILITIES: SearchCapabilities = {
  dense: true,
  sparse: false,
  lexical: false,
  clientSideFusion: true,
  filters: true,
  scoreThreshold: true,
  multipleVectorFields: false,
  hasSparseVectorField: false,
  hasSearchableTextFields: false,
  fusionStrategies: ['rrf', 'weighted'],
};

// ============================================
// VectorDB Client Interface
// ============================================

export interface VectorDBClient {
  testConnection(): Promise<ConnectionResult>;
  getCollections(): Promise<GetCollectionsResult>;
  getCollectionInfo(collection: string): Promise<GetCollectionInfoResult>;
  getDocuments(collection: string, options?: GetDocumentsOptions): Promise<GetDocumentsResult>;
  search(collection: string, vectors: Record<string, DocumentVector>, options?: SearchOptions): Promise<SearchResult>;
  deleteDocument(collection: string, primary: Document['primary'], dataRequirements?: Record<string, string>): Promise<DeleteDocumentResult>;
  deleteDocuments(collection: string, filter: FilterQuery, dataRequirements?: Record<string, string>): Promise<DeleteDocumentsResult>;
  dropCollection(collection: string): Promise<DropCollectionResult>;
  truncateCollection(collection: string): Promise<TruncateCollectionResult>;
  getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult>;
  /** Search capabilities for this backend (dense, sparse, lexical/BM25, hybrid). Schema can refine (e.g. pgvector FTS). */
  getSearchCapabilities(collection: string, schema?: CollectionSchema | null): Promise<SearchCapabilities>;
  createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult>;
  getCreateCollectionSchema(): DynamicFormSchema;
  upsertDocument(collection: string, data: UpsertDocumentData, dataRequirements?: Record<string, string>): Promise<UpsertDocumentResult>;
}

// ============================================
// App State Types
// ============================================

export interface ActiveConnection {
  id: string;
  name: string;
  config: ConnectionConfig;
  version?: string;
  collections: Collection[];
  isExpanded: boolean;
  isLoading: boolean;
}

export interface TabInfo {
  id: string;
  connectionId: string;
  connectionName: string;
  connectionType: DatabaseType;
  collection: Collection;
}

export interface AppState {
  connections: ActiveConnection[];
  tabs: TabInfo[];
  activeTabId: string | null;
}