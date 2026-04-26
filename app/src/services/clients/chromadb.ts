import { ChromaClient, CloudClient, GetResponse, IncludeEnum, QueryResponse } from 'chromadb';
import log from 'electron-log';
import {
  VectorDBClient,
  ConnectionConfig,
  ConnectionResult,
  GetCollectionsResult,
  GetCollectionInfoResult,
  SearchResult,
  Document,
  DeleteDocumentResult,
  DeleteDocumentsResult,
  DropCollectionResult,
  TruncateCollectionResult,
  CreateCollectionResult,
  FilterQuery,
  GetDocumentsOptions,
  GetDocumentsResult,
  SearchOptions,
  DocumentVector,
  Collection,
  GetCollectionSchemaResult,
  SchemaField,
  VectorSchemaField,
  COLLECTION_DEFAULT_VECTOR,
  UpsertDocumentResult,
  UpsertDocumentData,
  CollectionSchema,
  SearchCapabilities,
} from '../../types';
import { isVector } from '..';
import { mergeWithDefault } from '../searchCapabilities';
import { DynamicFormSchema } from '../../components/DynamicForm/types';
import { sortDocuments } from '../documentUtils';

// ============================================
// ChromaDB Constants
// ============================================

export const CHROMADB_DISTANCE_METRICS = [
  { label: 'Cosine', value: 'cosine', description: 'Best for normalized vectors' },
  { label: 'Euclidean (L2)', value: 'l2', description: 'L2 distance' },
  { label: 'Inner Product', value: 'ip', description: 'For non-normalized vectors' },
] as const;

export const CHROMADB_DEFAULTS = {
  dimension: 1536,
  distance: 'cosine',
} as const;

// ============================================
// ChromaDB Create Collection Schema
// ============================================

export const chromaDBCreateCollectionSchema: DynamicFormSchema = {
  title: 'Create ChromaDB Collection',
  description: 'Configure your new vector collection in ChromaDB',
  sections: [
    {
      key: 'general',
      title: 'General',
      description: 'Basic collection settings',
      items: [
        {
          key: 'name',
          label: 'Collection Name',
          type: 'text',
          required: true,
          placeholder: 'my_collection',
          description: 'Unique name for your collection',
          rules: [
            { type: 'minLength', value: 1, message: 'Collection name is required' },
            {
              type: 'pattern',
              value: '^[a-zA-Z_][a-zA-Z0-9_]*$',
              message: 'Must start with letter or underscore',
            },
          ],
        },
      ],
    },
    {
      key: 'vectors',
      title: 'Vector Configuration',
      description: 'Configure vector storage',
      items: [
        {
          key: 'dimension',
          label: 'Vector Dimensions',
          type: 'number',
          required: true,
          defaultValue: CHROMADB_DEFAULTS.dimension,
          min: 1,
          max: 65535,
          description: 'Number of dimensions (e.g., 1536 for OpenAI, 768 for many models)',
        },
        {
          key: 'distance',
          label: 'Distance Metric',
          type: 'select',
          required: true,
          defaultValue: CHROMADB_DEFAULTS.distance,
          options: [...CHROMADB_DISTANCE_METRICS],
          description: 'Distance function for similarity search',
        },
      ],
    },
    {
      key: 'hnsw',
      title: 'HNSW Index Configuration',
      description: 'Configure the HNSW index for approximate nearest neighbor search',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        {
          key: 'hnsw_M',
          label: 'M (Max Connections)',
          type: 'number',
          defaultValue: 32,
          min: 4,
          max: 128,
          description: 'Number of edges per node. Higher = better recall but slower build',
        },
        {
          key: 'hnsw_construction_ef',
          label: 'EF Construction',
          type: 'number',
          defaultValue: 128,
          min: 4,
          max: 512,
          description: 'Search width during index build. Higher = better quality but slower',
        },
        {
          key: 'hnsw_search_ef',
          label: 'EF Search',
          type: 'number',
          defaultValue: 64,
          min: 4,
          max: 512,
          description: 'Search width during query. Higher = better recall but slower',
        },
      ],
    },
  ],
  showSubmit: true,
  showCancel: true,
  submitText: 'Create Collection',
};

// Helper to build ChromaDB filter from FilterQuery
function buildChromaFilter(filter: FilterQuery): Record<string, any> {
  const conditions: Record<string, any>[] = [];

  for (const cond of filter.conditions) {
    const condition: Record<string, any> = {};

    switch (cond.operator) {
      case 'eq':
        condition[cond.field] = { $eq: cond.value };
        break;
      case 'neq':
        condition[cond.field] = { $ne: cond.value };
        break;
      case 'gt':
        condition[cond.field] = { $gt: cond.value };
        break;
      case 'gte':
        condition[cond.field] = { $gte: cond.value };
        break;
      case 'lt':
        condition[cond.field] = { $lt: cond.value };
        break;
      case 'lte':
        condition[cond.field] = { $lte: cond.value };
        break;
      case 'contains':
        condition[cond.field] = { $contains: cond.value };
        break;
      default:
        condition[cond.field] = { $eq: cond.value };
    }

    conditions.push(condition);
  }

  if (conditions.length === 0) {
    return {};
  }

  if (filter.logic === 'and') {
    return { $and: conditions };
  } else {
    return { $or: conditions };
  }
}

// Helper to create a no-op embedding function
function createNoOpEmbeddingFunction(dimension = 1536) {
  return {
    embed: async (texts: string[]) => {
      return texts.map(() => new Array(dimension).fill(0));
    },
    generate: async (texts: string[]) => {
      return texts.map(() => new Array(dimension).fill(0));
    },
  };
}

export class ChromaDBClient implements VectorDBClient {
  private client: ChromaClient | CloudClient;
  private isCloud: boolean;
  private defaultEmbeddingFunction: ReturnType<typeof createNoOpEmbeddingFunction>;

  constructor(config: ConnectionConfig) {
    // Determine if this is a cloud connection
    const isCloudConnection = !!(config.apiKey && config.tenant && config.database);

    if (isCloudConnection) {
      // ChromaDB Cloud connection
      this.client = new CloudClient({
        apiKey: config.apiKey!,
        tenant: config.tenant!,
        database: config.database!,
      });
      this.isCloud = true;
      log.info('[ChromaDB] Connecting to ChromaDB Cloud', {
        tenant: config.tenant,
        database: config.database,
      });
    } else {
      // Local ChromaDB connection
      // ChromaClient can be initialized with a path for local connections
      // https://docs.trychroma.com/docs/overview/getting-started
      const host = config.host;
      const port = config.port;
      const protocol = config.https ? 'https' : 'http';
      const path = `${protocol}://${host}:${port}`;
      const tenant = config.tenant;
      const database = config.database;

      this.client = new ChromaClient({
        path,
        tenant,
        database,
      });
      this.isCloud = false;
      log.info('[ChromaDB] Connecting to local ChromaDB', {
        path,
        host,
        port,
        tenant,
        database,
      });
    }

    // Create default embedding function (will be overridden when we know dimension)
    this.defaultEmbeddingFunction = createNoOpEmbeddingFunction();
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.client.listCollections();
      const version = this.isCloud ? 'Chroma Cloud' : 'ChromaDB (Local)';
      log.info('[ChromaDB] Connection test successful');
      return { success: true, version };
    } catch (error: any) {
      log.warn('[ChromaDB] Connection test failed:', error.message);
      return {
        success: false,
        error: `Failed to connect to ChromaDB: ${error.message}`,
      };
    }
  }

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      const collections = await this.client.listCollections();
      const result: Collection[] = [];

      for (const col of collections) {
        try {
          const collectionName = typeof col === 'string' ? col : (col as any)?.name || String(col);

          if (!collectionName) continue;

          const collection = await this.client.getCollection({
            name: collectionName,
            embeddingFunction: this.defaultEmbeddingFunction,
          });
          const count = await collection.count();
          result.push({
            name: collectionName,
            count: count || 0,
          });
        } catch (error: any) {
          const collectionName = typeof col === 'string' ? col : (col as any)?.name || String(col);

          if (!collectionName) continue;

          log.warn(`[ChromaDB] Failed to get collection ${collectionName}:`, error.message);
          result.push({
            name: collectionName,
            count: 0,
          });
        }
      }

      return { success: true, collections: result };
    } catch (error: any) {
      const message = error.message || 'Failed to fetch collections';
      return { success: false, error: message };
    }
  }

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
      const count = await col.count();
      const metadata = col.metadata || {};

      return {
        success: true,
        data: {
          name: collection,
          count,
          metadata,
        },
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to fetch collection info';
      return { success: false, error: message };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
      const sample = await col.get({
        limit: 1,
        include: [
          IncludeEnum.Embeddings,
          IncludeEnum.Metadatas,
          IncludeEnum.Documents,
          IncludeEnum.Distances,
        ],
      });
      const fields: Record<string, SchemaField> = {};
      const vectors: Record<string, VectorSchemaField> = {};

      // ChromaDB uses 'id' as primary key (string)
      const primary: SchemaField = { name: 'id', type: 'string', autoID: false };

      // Get vector dimension from metadata or sample
      let vectorDimension = 0;
      if (sample.embeddings && sample.embeddings.length > 0 && sample.embeddings[0]) {
        vectorDimension = sample.embeddings[0].length;
      } else if (col.metadata?.dimension) {
        vectorDimension = col.metadata.dimension as number;
      }

      if (vectorDimension > 0) {
        vectors[COLLECTION_DEFAULT_VECTOR] = {
          name: COLLECTION_DEFAULT_VECTOR,
          type: 'vector',
          vectorType: 'dense',
          size: vectorDimension,
        };
      }

      // Extract metadata fields from sample
      let hasSearchableTextFields = false;
      if (sample.metadatas && sample.metadatas.length > 0) {
        const firstMetadata = sample.metadatas[0];
        if (firstMetadata) {
          Object.entries(firstMetadata).forEach(([key, value]) => {
            let type: SchemaField['type'] = 'unknown';
            if (typeof value === 'string') type = 'string';
            else if (typeof value === 'number') type = 'number';
            else if (typeof value === 'boolean') type = 'boolean';
            else if (Array.isArray(value)) type = 'array';
            else if (typeof value === 'object') type = 'object';

            // ChromaDB supports text search via queryTexts, but not true hybrid (BM25 + vector)
            // Text fields can be searched, but ChromaDB doesn't combine text and vector scores
            const isSearchable = type === 'string';
            if (isSearchable) {
              hasSearchableTextFields = true;
            }

            fields[key] = {
              name: key,
              type,
              searchable: isSearchable,
            };
          });
        }
      }

      // ChromaDB supports text search OR vector search, but not true hybrid (combining scores)
      // So we set supportsHybridSearch to false even though it has text search capability
      const supportsHybridSearch = false; // ChromaDB doesn't support true BM25 + vector hybrid search

      return {
        success: true,
        schema: {
          primary,
          fields,
          vectors,
          multipleVectors: false, // ChromaDB doesn't support multiple vectors per collection
          hasVectors: Object.keys(vectors).length > 0,
        },
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to fetch collection schema';
      return { success: false, error: message };
    }
  }

  async getSearchCapabilities(
    _collection: string,
    schema?: CollectionSchema | null,
  ): Promise<SearchCapabilities> {
    return mergeWithDefault(
      {
        fusionStrategies: ['rrf', 'weighted'],
      },
      schema,
    );
  }

  async getDocuments(
    collection: string,
    options?: GetDocumentsOptions,
  ): Promise<GetDocumentsResult> {
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });

      const limit = options?.limit || 50;
      const offset = typeof options?.offset === 'number' ? options.offset : 0;

      // ChromaDB stores IDs separately from metadata, so we need to handle them differently
      const { ids, where } = this.buildChromaQueryParams(options?.filter);

      const getParams = {
        limit,
        offset,
        ...(ids && { ids }),
        ...(where && { where }),
        include: [
          IncludeEnum.Embeddings,
          IncludeEnum.Metadatas,
          IncludeEnum.Documents,
          IncludeEnum.Distances,
        ],
      };

      const result = await col.get(getParams);
      let documents = this.recordsToDocuments(result);

      // ChromaDB doesn't support native sorting, so sort client-side if requested
      if (options?.sort && options.sort.length > 0) {
        documents = sortDocuments(documents, options.sort);
      }

      return {
        success: true,
        documents,
        nextOffset: documents.length === limit ? offset + limit : null,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to fetch documents';
      return { success: false, error: message };
    }
  }

  /**
   * Build ChromaDB query parameters from filter conditions.
   * Separates ID filters (use `ids` parameter) from metadata filters (use `where` clause).
   */
  private buildChromaQueryParams(filter?: FilterQuery): {
    ids?: string[];
    where?: Record<string, any>;
  } {
    if (!filter || filter.conditions.length === 0) {
      return {};
    }

    const idConditions = filter.conditions.filter((c) => c.field === 'id');
    const metadataConditions = filter.conditions.filter((c) => c.field !== 'id');

    const ids = this.extractIdsFromConditions(idConditions);
    const where =
      metadataConditions.length > 0
        ? buildChromaFilter({ conditions: metadataConditions, logic: filter.logic })
        : undefined;

    return { ids, where };
  }

  /**
   * Extract ID values from ID filter conditions.
   * Only supports 'eq' operator for ID filtering in ChromaDB.
   */
  private extractIdsFromConditions(
    idConditions: Array<{ operator: string; value: string | number | boolean }>,
  ): string[] | undefined {
    if (idConditions.length === 0) {
      return undefined;
    }

    // ChromaDB only supports exact ID matching via the `ids` parameter
    // Filter out boolean values and non-eq operators
    const eqIds = idConditions
      .filter(
        (c) => c.operator === 'eq' && (typeof c.value === 'string' || typeof c.value === 'number'),
      )
      .map((c) => String(c.value));

    return eqIds.length > 0 ? eqIds : undefined;
  }

  async search(
    collection: string,
    vectors: Record<string, DocumentVector>,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = performance.now();
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
      const limit = options?.limit || 10;
      const where = options?.filter ? buildChromaFilter(options.filter) : undefined;

      // Extract dense vector from the DocumentVector format
      const denseVectorEntry = Object.values(vectors).find((v) => v.vectorType === 'dense');
      const denseVector = denseVectorEntry?.value?.data;

      // Build query parameters based on search type
      const queryParams: any = {
        nResults: limit,
        where,
        include: [
          IncludeEnum.Embeddings,
          IncludeEnum.Metadatas,
          IncludeEnum.Documents,
          IncludeEnum.Distances,
        ],
      };

      if (denseVector) {
        // Pure vector search
        queryParams.queryEmbeddings = [denseVector];
      } else {
        return { success: false, error: 'No valid search vector or query provided' };
      }

      const results: any = await col.query(queryParams);

      const searchTimeMs = performance.now() - startTime;

      const documents: Document[] = [];
      const ids = results.ids?.[0] || [];
      const distances = results.distances?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];
      const documents_text = results.documents?.[0] || [];
      const embeddings = results.embeddings?.[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const distance = distances[i];
        const metadata = metadatas?.[i] || {};
        const document_text = documents_text?.[i];
        const embedding = embeddings[i];
        const score = distance !== undefined ? 1 - distance : undefined; // Convert distance to similarity score

        // Apply threshold filter (ChromaDB doesn't support threshold natively, so filter client-side)
        if (
          options?.scoreThreshold !== undefined &&
          score !== undefined &&
          score < options.scoreThreshold
        ) {
          continue;
        }

        const doc: Document = {
          primary: { name: 'id', value: id },
          score,
          vectors: {},
          payload: { ...metadata },
        };

        // Add vector if available
        if (embedding && Array.isArray(embedding)) {
          doc.vectors[COLLECTION_DEFAULT_VECTOR] = {
            key: COLLECTION_DEFAULT_VECTOR,
            vectorType: 'dense',
            size: embedding.length,
            value: { data: embedding },
          };
        }

        if (document_text) {
          doc.payload.document = document_text;
        }

        documents.push(doc);
      }

      const metadata = {
        searchTimeMs,
      };

      return { success: true, documents, metadata };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { success: false, error: message };
    }
  }

  async deleteDocument(
    collection: string,
    primary: Document['primary'],
  ): Promise<DeleteDocumentResult> {
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
      await col.delete({ ids: [String(primary.value)] });
      return { success: true };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      return { success: false, error: message };
    }
  }

  async deleteDocuments(collection: string, filter: FilterQuery): Promise<DeleteDocumentsResult> {
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
      const where = buildChromaFilter(filter);

      // Get all IDs matching the filter
      const result = await col.get({
        where,
      });

      const ids = result.ids || [];
      if (ids.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      // Delete by IDs
      await col.delete({ ids: ids.map((id) => String(id)) });

      return { success: true, deletedCount: ids.length };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to delete documents';
      return { success: false, error: message };
    }
  }

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    try {
      await this.client.deleteCollection({ name: collection });
      return { success: true };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to drop collection';
      return { success: false, error: message };
    }
  }

  async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
      const count = await col.count();

      // Get all IDs and delete them
      const result = await col.get({});
      const ids = result.ids || [];

      if (ids.length > 0) {
        await col.delete({ ids: ids.map((id) => String(id)) });
      }

      return { success: true, deletedCount: ids.length || count || 0 };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to truncate collection';
      return { success: false, error: message };
    }
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    try {
      const name = config.name as string;
      const dimension = config.dimension as number;
      const distance = (config.distance as string) || 'cosine';

      // Build metadata for HNSW configuration
      const metadata: Record<string, any> = {
        'hnsw:space': distance,
      };

      if (config.hnsw_M) metadata['hnsw:M'] = config.hnsw_M;
      if (config.hnsw_construction_ef)
        metadata['hnsw:construction_ef'] = config.hnsw_construction_ef;
      if (config.hnsw_search_ef) metadata['hnsw:search_ef'] = config.hnsw_search_ef;

      // Create a no-op embedding function (we'll provide embeddings directly)
      const noOpEmbeddingFunction = createNoOpEmbeddingFunction(dimension);

      await this.client.createCollection({
        name,
        embeddingFunction: noOpEmbeddingFunction,
        metadata,
      });

      log.info(`[ChromaDB] Created collection: ${name}`);
      return { success: true };
    } catch (error: any) {
      log.error('[ChromaDB] Create collection error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create collection';
      return { success: false, error: message };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return chromaDBCreateCollectionSchema;
  }

  async upsertDocument(
    collection: string,
    data: UpsertDocumentData,
  ): Promise<UpsertDocumentResult> {
    try {
      const col = await this.client.getCollection({
        name: collection,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
      const { document } = data;
      const { primary, vectors, payload } = document;

      const id = primary ? String(primary.value) : crypto.randomUUID();

      // Extract dense vector from DocumentVector format
      let embedding: number[] | undefined;
      if (vectors) {
        const denseVectorEntry = Object.values(vectors).find((v) => v.vectorType === 'dense');
        if (denseVectorEntry?.value && 'data' in denseVectorEntry.value) {
          embedding = denseVectorEntry.value.data;
        }
      }

      // Convert payload to metadata (ChromaDB metadata must be string | number | boolean)
      const metadata: Record<string, string | number | boolean> = {};
      if (payload) {
        Object.entries(payload).forEach(([key, value]) => {
          if (
            key !== 'document' &&
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
          ) {
            metadata[key] = value;
          }
        });
      }

      const document_text = payload?.document as string | undefined;

      const upsertParams: any = {
        ids: [id],
        metadatas: [metadata],
      };

      if (embedding) {
        upsertParams.embeddings = [embedding];
      }

      if (document_text) {
        upsertParams.documents = [document_text];
      }

      await col.upsert(upsertParams);

      return { success: true, document: { id, ...metadata } };
    } catch (error: any) {
      log.error('[ChromaDB] Upsert error:', error);
      const message = error instanceof Error ? error.message : 'Failed to upsert document';
      return { success: false, error: message };
    }
  }

  private recordsToDocuments(records: GetResponse): Document[] {
    const documents: Document[] = [];
    const ids = records.ids || [];
    // @ts-expect-error - chromadb doesn't export MultiQueryResponse, but distances is available on search
    const distances = (records.distances as number[]) || [];
    const embeddings = records.embeddings || [];
    const metadatas = records.metadatas || [];
    const documents_text = records.documents || [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const distance = distances[i];
      const embedding = embeddings[i];
      const metadata = metadatas?.[i] || {};
      const document_text = documents_text?.[i];

      const doc: Document = {
        primary: { name: 'id', value: id },
        vectors: {},
        payload: { ...metadata },
        score: distance !== undefined ? 1 - distance : undefined,
      };

      if (embedding && Array.isArray(embedding)) {
        doc.vectors[COLLECTION_DEFAULT_VECTOR] = {
          key: COLLECTION_DEFAULT_VECTOR,
          vectorType: 'dense',
          size: embedding.length,
          value: { data: embedding },
        };
      }

      if (document_text) {
        doc.payload.document = document_text;
      }

      documents.push(doc);
    }

    return documents;
  }
}
