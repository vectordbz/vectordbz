import { QdrantClient as QdrantSDK, Schemas as QdrantSchemas } from '@qdrant/js-client-rest';
import log from 'electron-log';
import {
  VectorDBClient,
  ConnectionConfig,
  ConnectionResult,
  GetCollectionsResult,
  GetCollectionInfoResult,
  SearchResult,
  SearchOptions,
  FilterQuery,
  DeleteDocumentResult,
  DeleteDocumentsResult,
  DropCollectionResult,
  TruncateCollectionResult,
  CreateCollectionResult,
  Collection,
  GetDocumentsOptions,
  GetDocumentsResult,
  Document,
  DocumentVector,
  GetCollectionSchemaResult,
  SchemaField,
  VectorSchemaField,
  COLLECTION_DEFAULT_VECTOR,
  UpsertDocumentData,
  UpsertDocumentResult,
  SearchCapabilities,
  CollectionSchema,
} from '../../types';
import { DynamicFormSchema } from '../../components/DynamicForm/types';
import { sortDocuments } from '../documentUtils';
import { mergeWithDefault } from '../searchCapabilities';

// ============================================
// Qdrant Constants
// ============================================

export const QDRANT_DISTANCE_METRICS = [
  { label: 'Cosine', value: 'Cosine', description: 'Best for normalized vectors' },
  { label: 'Euclidean', value: 'Euclid', description: 'L2 distance' },
  { label: 'Dot Product', value: 'Dot', description: 'For non-normalized vectors' },
  { label: 'Manhattan', value: 'Manhattan', description: 'L1 distance' },
] as const;

export const QDRANT_QUANTIZATION_TYPES = [
  { label: 'Scalar (int8)', value: 'scalar', description: '4x memory reduction' },
  { label: 'Product (PQ)', value: 'product', description: 'Higher compression' },
  { label: 'Binary', value: 'binary', description: '32x memory reduction' },
] as const;

export const QDRANT_DEFAULTS = {
  vectorSize: 1536,
  distance: 'Cosine',
  hnswM: 16,
  hnswEfConstruct: 100,
  hnswFullScanThreshold: 10000,
  shardNumber: 1,
  replicationFactor: 1,
  writeConsistencyFactor: 1,
} as const;

// ============================================
// Qdrant Create Collection Schema
// ============================================

export const qdrantCreateCollectionSchema: DynamicFormSchema = {
  title: 'Create Qdrant Collection',
  description: 'Configure your new vector collection in Qdrant',
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
              message:
                'Must start with letter or underscore, only alphanumeric and underscores allowed',
            },
          ],
        },
      ],
    },
    {
      key: 'vectors',
      title: 'Vector Configuration',
      description: 'Configure vector storage and indexing',
      items: [
        {
          key: 'vectorType',
          label: 'Vector Configuration Type',
          type: 'radio',
          direction: 'vertical',
          defaultValue: 'single',
          options: [
            {
              label: 'Single Vector',
              value: 'single',
              description: 'One vector per point (most common)',
            },
            {
              label: 'Named Vectors',
              value: 'named',
              description: 'Multiple named vectors per point',
            },
          ],
        },
        {
          key: 'size',
          label: 'Vector Dimensions',
          type: 'number',
          required: true,
          defaultValue: QDRANT_DEFAULTS.vectorSize,
          min: 1,
          max: 65535,
          description: 'Number of dimensions (e.g., 1536 for OpenAI, 768 for many models)',
          showWhen: { field: 'vectorType', operator: 'equals', value: 'single' },
        },
        {
          key: 'distance',
          label: 'Distance Metric',
          type: 'select',
          required: true,
          defaultValue: QDRANT_DEFAULTS.distance,
          options: [...QDRANT_DISTANCE_METRICS],
          description: 'Distance function for similarity search',
          showWhen: { field: 'vectorType', operator: 'equals', value: 'single' },
        },
        {
          key: 'namedVectors',
          label: 'Named Vectors',
          type: 'array',
          itemType: 'object',
          itemLabel: 'Vector',
          showWhen: { field: 'vectorType', operator: 'equals', value: 'named' },
          minItems: 1,
          itemFields: [
            {
              key: 'name',
              label: 'Vector Name',
              type: 'text',
              required: true,
              placeholder: 'default',
            },
            {
              key: 'size',
              label: 'Dimensions',
              type: 'number',
              required: true,
              defaultValue: QDRANT_DEFAULTS.vectorSize,
              min: 1,
              max: 65535,
            },
            {
              key: 'distance',
              label: 'Distance',
              type: 'select',
              required: true,
              defaultValue: QDRANT_DEFAULTS.distance,
              options: [...QDRANT_DISTANCE_METRICS],
            },
          ],
          addButtonText: 'Add Vector',
        },
      ],
    },
    {
      key: 'indexing',
      title: 'HNSW Index Configuration',
      description: 'Configure the HNSW index for approximate nearest neighbor search',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        {
          key: 'hnsw_m',
          label: 'M (Max Connections)',
          type: 'number',
          defaultValue: QDRANT_DEFAULTS.hnswM,
          min: 4,
          max: 128,
          description: 'Number of edges per node. Higher = better recall but slower build',
        },
        {
          key: 'hnsw_ef_construct',
          label: 'EF Construct',
          type: 'number',
          defaultValue: QDRANT_DEFAULTS.hnswEfConstruct,
          min: 4,
          max: 512,
          description: 'Search width during index build. Higher = better quality but slower',
        },
        {
          key: 'hnsw_full_scan_threshold',
          label: 'Full Scan Threshold',
          type: 'number',
          defaultValue: QDRANT_DEFAULTS.hnswFullScanThreshold,
          min: 1,
          description: 'Max collection size before HNSW index is built',
        },
        {
          key: 'on_disk',
          label: 'Store on Disk',
          type: 'switch',
          defaultValue: false,
          description: 'Store vectors on disk instead of RAM (slower but uses less memory)',
        },
      ],
    },
    {
      key: 'quantization',
      title: 'Quantization',
      description: 'Reduce memory usage with vector quantization',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        {
          key: 'quantization_enabled',
          label: 'Enable Quantization',
          type: 'switch',
          defaultValue: false,
        },
        {
          key: 'quantization_type',
          label: 'Quantization Type',
          type: 'select',
          defaultValue: 'scalar',
          showWhen: { field: 'quantization_enabled', operator: 'equals', value: true },
          options: [...QDRANT_QUANTIZATION_TYPES],
        },
        {
          key: 'quantization_always_ram',
          label: 'Keep Quantized in RAM',
          type: 'switch',
          defaultValue: true,
          showWhen: { field: 'quantization_enabled', operator: 'equals', value: true },
          description: 'Keep quantized vectors in RAM even if on_disk is enabled',
        },
      ],
    },
    {
      key: 'sharding',
      title: 'Sharding & Replication',
      description: 'Configure distributed storage',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        {
          key: 'shard_number',
          label: 'Number of Shards',
          type: 'number',
          defaultValue: QDRANT_DEFAULTS.shardNumber,
          min: 1,
          max: 128,
          description: 'Split collection across multiple shards',
        },
        {
          key: 'replication_factor',
          label: 'Replication Factor',
          type: 'number',
          defaultValue: QDRANT_DEFAULTS.replicationFactor,
          min: 1,
          max: 16,
          description: 'Number of replicas for each shard',
        },
        {
          key: 'write_consistency_factor',
          label: 'Write Consistency Factor',
          type: 'number',
          defaultValue: QDRANT_DEFAULTS.writeConsistencyFactor,
          min: 1,
          description: 'Minimum replicas that must confirm write',
        },
      ],
    },
  ],
  showSubmit: true,
  showCancel: true,
  submitText: 'Create Collection',
};

// Qdrant-specific types
interface QdrantFilterCondition {
  key: string;
  match?: { value: string | number | boolean } | { text: string };
  range?: { gt?: number; gte?: number; lt?: number; lte?: number };
}

interface QdrantHasIdCondition {
  has_id: (string | number)[];
}

type QdrantFilterConditionUnion = QdrantFilterCondition | QdrantHasIdCondition;

interface QdrantFilter {
  must?: QdrantFilterConditionUnion[];
  should?: QdrantFilterConditionUnion[];
  must_not?: QdrantFilterConditionUnion[];
}

// Convert our filter format to Qdrant filter format
function buildQdrantFilter(filter: FilterQuery): QdrantFilter {
  // Separate ID conditions from payload conditions
  const idConditions = filter.conditions.filter((cond) => cond.field === 'id');
  const payloadConditions = filter.conditions.filter((cond) => cond.field !== 'id');

  const qdrantConditions: QdrantFilterCondition[] = payloadConditions
    .filter((cond) => cond.operator !== 'neq')
    .map((cond) => {
      const condition: QdrantFilterCondition = { key: cond.field };

      if (cond.valueType === 'number') {
        const numValue = Number(cond.value);
        switch (cond.operator) {
          case 'eq':
            condition.match = { value: numValue };
            break;
          case 'gt':
            condition.range = { gt: numValue };
            break;
          case 'gte':
            condition.range = { gte: numValue };
            break;
          case 'lt':
            condition.range = { lt: numValue };
            break;
          case 'lte':
            condition.range = { lte: numValue };
            break;
        }
      } else if (cond.valueType === 'boolean') {
        condition.match = { value: Boolean(cond.value) };
      } else {
        switch (cond.operator) {
          case 'eq':
            condition.match = { value: String(cond.value) };
            break;
          case 'contains':
          case 'starts_with':
            condition.match = { text: String(cond.value) };
            break;
        }
      }

      return condition;
    });

  // Handle ID conditions using has_id
  // Collect all ID values for eq and neq operators
  const hasIdValues: (string | number)[] = [];
  const hasIdNotValues: (string | number)[] = [];

  idConditions.forEach((cond) => {
    // Convert ID value to appropriate type (number or string)
    const idValue =
      cond.valueType === 'number'
        ? Number(cond.value)
        : /^\d+$/.test(String(cond.value))
          ? parseInt(String(cond.value), 10)
          : String(cond.value);

    if (cond.operator === 'eq') {
      hasIdValues.push(idValue);
    } else if (cond.operator === 'neq') {
      hasIdNotValues.push(idValue);
    }
    // Note: Qdrant's has_id doesn't support range operators (gt, gte, lt, lte)
    // For those, we'd need to use a different approach or skip them
  });

  const hasIdConditions: { has_id: (string | number)[] }[] = [];
  const hasIdNotConditions: { has_id: (string | number)[] }[] = [];

  if (hasIdValues.length > 0) {
    hasIdConditions.push({ has_id: hasIdValues });
  }
  if (hasIdNotValues.length > 0) {
    hasIdNotConditions.push({ has_id: hasIdNotValues });
  }

  // Handle neq operators for payload fields by putting them in must_not
  const mustNotConditions = payloadConditions
    .filter((c) => c.operator === 'neq')
    .map((cond) => ({
      key: cond.field,
      match: { value: cond.valueType === 'number' ? Number(cond.value) : cond.value } as {
        value: string | number | boolean;
      },
    }));

  const result: QdrantFilter = {};

  // Combine ID conditions with payload conditions
  const allMustConditions: (QdrantFilterCondition | { has_id: (string | number)[] })[] = [
    ...qdrantConditions,
    ...hasIdConditions,
  ];
  const allMustNotConditions: (QdrantFilterCondition | { has_id: (string | number)[] })[] = [
    ...mustNotConditions,
    ...hasIdNotConditions,
  ];

  if (filter.logic === 'and') {
    if (allMustConditions.length > 0) result.must = allMustConditions;
    if (allMustNotConditions.length > 0) result.must_not = allMustNotConditions;
  } else {
    if (allMustConditions.length > 0) result.should = allMustConditions;
    if (allMustNotConditions.length > 0) result.must_not = allMustNotConditions;
  }

  return result;
}

export class QdrantClient implements VectorDBClient {
  private client: QdrantSDK;

  constructor(config: ConnectionConfig) {
    if (!config.host) {
      throw new Error('Host is required for Qdrant connection');
    }

    const protocol = config.https ? 'https' : 'http';
    const url = `${protocol}://${config.host}${config.port ? `:${config.port}` : ''}`;

    // Ensure API key is properly set (trim whitespace)
    const clientConfig: {
      url: string;
      apiKey?: string;
    } = {
      url,
    };

    if (config.apiKey) {
      // Trim whitespace from API key
      const trimmedApiKey = config.apiKey.trim();
      if (trimmedApiKey) {
        clientConfig.apiKey = trimmedApiKey;
      }
    }

    // Always log in Electron main process for debugging
    log.info('Qdrant Client Config:', clientConfig);

    this.client = new QdrantSDK(clientConfig);
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const result = await this.client.getCollections();
      log.info('Qdrant connection successful:', {
        collectionsCount: result.collections?.length || 0,
      });

      return {
        success: true,
        version: 'Qdrant (SDK)',
      };
    } catch (error: any) {
      let message = error instanceof Error ? error.message : 'Unknown error';

      // Provide more specific error messages
      if (error?.status === 403 || message?.includes('Forbidden') || message?.includes('403')) {
        message =
          'Forbidden: Check your API key and ensure it has the correct permissions. Verify the URL format matches: https://host:port';
      } else if (
        error?.status === 401 ||
        message?.includes('Unauthorized') ||
        message?.includes('401')
      ) {
        message =
          'Unauthorized: Invalid API key. Verify the API key is correct and has no extra spaces.';
      } else if (message?.includes('fetch failed') || message?.includes('ECONNREFUSED')) {
        message = `Connection failed: Unable to reach. Check host, port, and network connectivity.`;
      }

      return { success: false, error: message };
    }
  }

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      const response = await this.client.getCollections();
      const collectionsList = response.collections || [];

      // Fetch detailed info for each collection
      const collections = await Promise.all(
        collectionsList.map(async (col: { name: string }) => {
          const info = await this.client.getCollection(col.name);
          // Return Qdrant's native collection format
          const collection: Collection = {
            name: col.name,
            count: info.points_count || 0,
          };

          return collection;
        }),
      );

      return { success: true, collections };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch collections';
      return { success: false, error: message };
    }
  }

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    try {
      const info = await this.client.getCollection(collection);
      return { success: true, data: info };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch collection info';
      return { success: false, error: message };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    try {
      const info = await this.client.getCollection(collection);
      const { documents } = await this.getDocuments(collection, { limit: 1 });
      const firstDocument = documents && documents.length > 0 ? documents[0] : null;
      let typeOfPrimary: SchemaField['type'] = 'string';
      if (firstDocument) {
        const { primary } = firstDocument;
        if (typeof primary.value === 'number') {
          typeOfPrimary = 'number';
        }
      }
      const fields: Record<string, SchemaField> = {};

      Object.entries(info.payload_schema).forEach(([name, config]) => {
        let type: SchemaField['type'] = 'unknown';
        switch (config?.data_type) {
          case 'keyword':
          case 'text':
            type = 'string';
            break;
          case 'integer':
          case 'float':
            type = 'number';
            break;
          case 'bool':
            type = 'boolean';
            break;
          case 'datetime':
            type = 'date';
            break;
        }

        // Qdrant doesn't support BM25 text search, fields are filterable but not searchable
        fields[name] = {
          name,
          type,
          searchable: false,
        };
      });

      const vectorConfigs = info.config?.params?.vectors;
      const sparseVectorConfigs = info.config?.params?.sparse_vectors;
      const vectors: Record<string, VectorSchemaField> = {};

      // Parse dense vectors
      if (vectorConfigs) {
        if (vectorConfigs.size) {
          // Single unnamed vector
          vectors[COLLECTION_DEFAULT_VECTOR] = {
            name: COLLECTION_DEFAULT_VECTOR,
            type: 'vector',
            vectorType: 'dense',
            size: vectorConfigs.size as number,
            distance: vectorConfigs.distance as string,
          };
        } else {
          // Named dense vectors
          Object.entries(vectorConfigs).forEach(([key, value]: any) => {
            vectors[key] = {
              name: key,
              type: 'vector',
              vectorType: 'dense',
              size: value.size as number,
              distance: value.distance as string,
            };
          });
        }
      }

      // Parse sparse vectors
      if (sparseVectorConfigs) {
        Object.entries(sparseVectorConfigs).forEach(([key]: any) => {
          vectors[key] = {
            name: key,
            type: 'vector',
            vectorType: 'sparse',
          };
        });
      }

      const totalVectors = Object.keys(vectors).length;
      return {
        success: true,
        schema: {
          primary: { name: 'id', type: typeOfPrimary, autoID: false },
          fields,
          vectors,
          multipleVectors: totalVectors > 1,
          hasVectors: totalVectors > 0,
        },
      };
    } catch (error) {
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
        sparse: true,
        fusionStrategies: ['rrf', 'weighted', 'server'],
      },
      schema,
    );
  }

  async upsertDocument(
    collection: string,
    data: UpsertDocumentData,
  ): Promise<UpsertDocumentResult> {
    try {
      // Generate ID if not provided
      const { document } = data;
      const { primary, vectors, payload } = document;
      const upsertData: any = {
        vector: {},
        payload,
      };
      if (primary) {
        upsertData[primary.name] = primary.value;
      } else {
        const { schema } = await this.getCollectionSchema(collection);
        if (!schema) {
          return { success: false, error: 'Failed to get collection schema' };
        }
        const { primary } = schema;
        if (!primary.autoID) {
          if (primary.type === 'number') {
            upsertData[primary.name] = Math.floor(Math.random() * 1000000);
          } else {
            upsertData[primary.name] = crypto.randomUUID();
          }
        }
      }
      // handling multiple vectors vs default vector
      if (vectors) {
        Object.entries(vectors).forEach(([key, vectorData]) => {
          let vectorValue: any;

          // Convert DocumentVector to Qdrant format
          if (vectorData.vectorType === 'dense') {
            vectorValue = vectorData.value.data;
          } else if (vectorData.vectorType === 'sparse') {
            vectorValue = {
              indices: vectorData.value.indices,
              values: vectorData.value.values,
            };
          } else if (vectorData.vectorType === 'binary') {
            // Qdrant doesn't support binary vectors, this shouldn't happen
            throw new Error('Qdrant does not support binary vectors');
          }

          if (key === COLLECTION_DEFAULT_VECTOR) {
            upsertData.vector = vectorValue;
          } else {
            upsertData.vector[key] = vectorValue;
          }
        });
      }

      await this.client.upsert(collection, {
        wait: true,
        points: [upsertData],
      });
      return { success: true, document: upsertData };
    } catch (error) {
      log.error('[Qdrant] Upsert error:', error);
      const message = error instanceof Error ? error.message : 'Failed to upsert document';
      return { success: false, error: message };
    }
  }

  async getDocuments(
    collection: string,
    options?: GetDocumentsOptions,
  ): Promise<GetDocumentsResult> {
    try {
      const limit = options?.limit || 50;
      const qdrantFilter = options?.filter ? buildQdrantFilter(options.filter) : undefined;

      // Qdrant's order_by only works with indexed payload fields
      // It cannot sort by 'id' (primary key) or 'score' (computed field)
      // For these fields, we need to fetch and sort client-side
      const firstSort = options?.sort && options.sort.length > 0 ? options.sort[0] : null;
      const isSortableByQdrant =
        firstSort && firstSort.field !== 'id' && firstSort.field !== 'score';

      // Build order_by for Qdrant (only for payload fields)
      let orderBy: any = undefined;
      if (isSortableByQdrant) {
        orderBy = {
          key: firstSort!.field,
          direction: firstSort!.order === 'asc' ? 'asc' : 'desc',
        };
      }

      const result = await this.client.scroll(collection, {
        limit,
        offset: options?.offset || undefined,
        with_payload: true,
        with_vector: true,
        ...(qdrantFilter && { filter: qdrantFilter as any }),
        ...(orderBy && { order_by: orderBy }),
      });

      // Return Qdrant's native format - preserve all fields
      let documents: Document[] = (result.points || []).map((point: QdrantSchemas['Record']) => {
        const doc: Document = this.recordToDocument(point);
        return doc;
      });

      // If sorting by 'id' or 'score', or if order_by failed, sort client-side
      if (options?.sort && options.sort.length > 0 && !isSortableByQdrant) {
        documents = sortDocuments(documents, options.sort);
      }

      return {
        success: true,
        documents,
        nextOffset:
          result.next_page_offset && typeof result.next_page_offset !== 'object'
            ? (result.next_page_offset as string | number)
            : null,
      };
    } catch (error) {
      // If order_by failed (e.g., field not indexed), try fetching without order_by and sort client-side
      if (options?.sort && options.sort.length > 0) {
        try {
          const limit = options?.limit || 50;
          const qdrantFilter = options?.filter ? buildQdrantFilter(options.filter) : undefined;

          const result = await this.client.scroll(collection, {
            limit,
            offset: options?.offset || undefined,
            with_payload: true,
            with_vector: true,
            ...(qdrantFilter && { filter: qdrantFilter as any }),
          });

          let documents: Document[] = (result.points || []).map(
            (point: QdrantSchemas['Record']) => {
              const doc: Document = this.recordToDocument(point);
              return doc;
            },
          );

          // Sort client-side as fallback
          documents = sortDocuments(documents, options.sort);

          return {
            success: true,
            documents,
            nextOffset:
              result.next_page_offset && typeof result.next_page_offset !== 'object'
                ? (result.next_page_offset as string | number)
                : null,
          };
        } catch (fallbackError) {
          const message =
            fallbackError instanceof Error ? fallbackError.message : 'Failed to fetch items';
          return { success: false, error: message };
        }
      }

      const message = error instanceof Error ? error.message : 'Failed to fetch items';
      return { success: false, error: message };
    }
  }

  async search(
    collection: string,
    vectors: Record<string, DocumentVector>,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = performance.now();
    try {
      const qdrantFilter = options?.filter ? buildQdrantFilter(options.filter) : undefined;

      const vectorKeys = Object.keys(vectors);

      if (vectorKeys.length > 1) {
        const queries = vectorKeys.map((key) => {
          const vectorData = vectors[key];
          let queryVector: any;

          if (vectorData.vectorType === 'dense') {
            queryVector = {
              query: vectorData.value.data,
              using: key,
            };
          } else if (vectorData.vectorType === 'sparse') {
            queryVector = {
              query: {
                indices: vectorData.value.indices,
                values: vectorData.value.values,
              },
              using: key,
            };
          }

          return queryVector;
        });

        const payload: any = {
          prefetch: queries,
          limit: options?.limit || 10,
          with_payload: true,
          with_vector: true,
          ...(options?.scoreThreshold && {
            score_threshold: options.scoreThreshold,
          }),
          ...(qdrantFilter && { filter: qdrantFilter }),
        };

        const results = await this.client.query(collection, payload);
        const searchTimeMs = performance.now() - startTime;

        const mappedResults: Document[] = (results.points || []).map((result: any) =>
          this.recordToDocument(result),
        );

        return {
          success: true,
          documents: mappedResults,
          metadata: { searchTimeMs },
        };
      } else {
        const vectorKey = vectorKeys[0];
        const vectorData = vectors[vectorKey];

        if (!vectorData || !vectorData.value) {
          return { success: false, error: 'Invalid vector data provided' };
        }

        let searchVector: any;

        if (vectorData.vectorType === 'dense') {
          // Dense vector search
          if (!('data' in vectorData.value) || !Array.isArray(vectorData.value.data)) {
            return {
              success: false,
              error: 'Invalid dense vector format: expected array in value.data',
            };
          }

          if (vectorKey === COLLECTION_DEFAULT_VECTOR) {
            // Default/unnamed vector: use search API with just the array
            searchVector = vectorData.value.data;
          } else {
            // Named dense vector: use Query API with 'using' parameter
            const payload = {
              query: vectorData.value.data,
              using: vectorKey,
              limit: options?.limit || 10,
              with_payload: true,
              with_vector: true,
              ...(options?.scoreThreshold && {
                score_threshold: options.scoreThreshold,
              }),
              ...(qdrantFilter && { filter: qdrantFilter }),
            };

            const results = await this.client.query(collection, payload);
            const searchTimeMs = performance.now() - startTime;

            const mappedResults: Document[] = (results.points || []).map((result: any) =>
              this.recordToDocument(result),
            );

            return {
              success: true,
              documents: mappedResults,
              metadata: { searchTimeMs },
            };
          }
        } else if (vectorData.vectorType === 'sparse') {
          // Sparse vector search - use query API with using parameter
          const payload = {
            query: {
              indices: vectorData.value.indices,
              values: vectorData.value.values,
            },
            using: vectorKey,
            limit: options?.limit || 10,
            with_payload: true,
            with_vector: true,
            ...(options?.scoreThreshold && {
              score_threshold: options.scoreThreshold,
            }),
            ...(qdrantFilter && { filter: qdrantFilter }),
          };

          const results = await this.client.query(collection, payload);
          const searchTimeMs = performance.now() - startTime;

          const mappedResults: Document[] = (results.points || []).map((result: any) =>
            this.recordToDocument(result),
          );

          return {
            success: true,
            documents: mappedResults,
            metadata: { searchTimeMs },
          };
        }

        const payload: any = {
          vector: searchVector,
          limit: options?.limit || 10,
          with_payload: true,
          with_vector: true,
          ...(options?.scoreThreshold && {
            score_threshold: options.scoreThreshold,
          }),
          ...(qdrantFilter && { filter: qdrantFilter as any }),
        };

        const results = await this.client.search(collection, payload);
        const searchTimeMs = performance.now() - startTime;

        const mappedResults: Document[] = (results || []).map((result) =>
          this.recordToDocument(result),
        );

        return {
          success: true,
          documents: mappedResults,
          metadata: { searchTimeMs },
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { success: false, error: message };
    }
  }

  async deleteDocument(
    collection: string,
    primary: Document['primary'],
  ): Promise<DeleteDocumentResult> {
    try {
      // Qdrant IDs can be integers or UUIDs
      // If it's a numeric string, convert to number
      const pointId = /^\d+$/.test(String(primary.value))
        ? parseInt(String(primary.value), 10)
        : String(primary.value);

      await this.client.delete(collection, {
        points: [pointId],
      });
      return { success: true };
    } catch (error) {
      console.error('[Qdrant] Delete error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete item';
      return { success: false, error: message };
    }
  }

  async deleteDocuments(collection: string, filter: FilterQuery): Promise<DeleteDocumentsResult> {
    try {
      const hasFilter = filter.conditions && filter.conditions.length > 0;

      if (!hasFilter) {
        // Delete all documents by scrolling through and deleting by IDs
        let offset: string | number | undefined = undefined;
        const batchSize = 1000;
        let deleted = 0;

        do {
          const scrollResult = await this.client.scroll(collection, {
            limit: batchSize,
            offset,
            with_payload: false,
            with_vector: false,
          });

          const points = scrollResult.points || [];
          if (points.length === 0) break;

          const ids = points.map((p: { id: string | number }) => p.id);
          await this.client.delete(collection, {
            points: ids,
          });
          deleted += ids.length;

          offset =
            scrollResult.next_page_offset && typeof scrollResult.next_page_offset !== 'object'
              ? (scrollResult.next_page_offset as string | number)
              : undefined;
        } while (offset);

        return { success: true, deletedCount: deleted };
      }

      // Delete by filter
      const qdrantFilter = buildQdrantFilter(filter);

      // Get count first
      const countResult = await this.client.count(collection, {
        filter: qdrantFilter as any,
        exact: true,
      });
      const count = countResult.count || 0;

      if (count === 0) {
        return { success: true, deletedCount: 0 };
      }

      // Delete by filter
      await this.client.delete(collection, {
        filter: qdrantFilter as any,
      });

      return { success: true, deletedCount: count };
    } catch (error) {
      console.error('[Qdrant] Bulk delete error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete items';
      return { success: false, error: message };
    }
  }

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    try {
      await this.client.deleteCollection(collection);
      return { success: true };
    } catch (error) {
      console.error('[Qdrant] Drop collection error:', error);
      const message = error instanceof Error ? error.message : 'Failed to drop collection';
      return { success: false, error: message };
    }
  }

  async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
    try {
      // Truncate is just deleting all documents (empty filter)
      const result = await this.deleteDocuments(collection, { conditions: [], logic: 'and' });
      return {
        success: result.success,
        deletedCount: result.deletedCount || 0,
        error: result.error,
      };
    } catch (error) {
      console.error('[Qdrant] Truncate collection error:', error);
      const message = error instanceof Error ? error.message : 'Failed to truncate collection';
      return { success: false, error: message };
    }
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    try {
      const name = config.name as string;
      const vectorType = config.vectorType as string;

      // Build vectors configuration
      let vectors: any;

      if (vectorType === 'named') {
        // Named vectors configuration
        const namedVectors = config.namedVectors as Array<{
          name: string;
          size: number;
          distance: string;
        }>;
        vectors = {};
        for (const vec of namedVectors || []) {
          vectors[vec.name] = {
            size: vec.size,
            distance: vec.distance,
            on_disk: config.on_disk || false,
          };
        }
      } else {
        // Single vector configuration
        vectors = {
          size: config.size as number,
          distance: config.distance as string,
          on_disk: config.on_disk || false,
        };
      }

      // Add sparse vectors if specified
      let sparseVectors: any = undefined;
      if (config.sparseVectors) {
        const sparseVectorConfigs = config.sparseVectors as Array<{ name: string }>;
        sparseVectors = {};
        for (const vec of sparseVectorConfigs) {
          sparseVectors[vec.name] = {};
        }
      }

      // Build HNSW config
      const hnswConfig: any = {};
      if (config.hnsw_m) hnswConfig.m = config.hnsw_m;
      if (config.hnsw_ef_construct) hnswConfig.ef_construct = config.hnsw_ef_construct;
      if (config.hnsw_full_scan_threshold)
        hnswConfig.full_scan_threshold = config.hnsw_full_scan_threshold;

      // Build quantization config
      let quantizationConfig: any = undefined;
      if (config.quantization_enabled) {
        const qType = config.quantization_type as string;
        if (qType === 'scalar') {
          quantizationConfig = {
            scalar: {
              type: 'int8',
              always_ram: config.quantization_always_ram ?? true,
            },
          };
        } else if (qType === 'product') {
          quantizationConfig = {
            product: {
              compression: 'x16',
              always_ram: config.quantization_always_ram ?? true,
            },
          };
        } else if (qType === 'binary') {
          quantizationConfig = {
            binary: {
              always_ram: config.quantization_always_ram ?? true,
            },
          };
        }
      }

      const createOptions: Record<string, unknown> = { vectors };
      if (sparseVectors) {
        createOptions.sparse_vectors = sparseVectors;
      }
      if (Object.keys(hnswConfig).length > 0) {
        createOptions.hnsw_config = hnswConfig;
      }
      if (quantizationConfig) {
        createOptions.quantization_config = quantizationConfig;
      }
      if (config.shard_number) {
        createOptions.shard_number = config.shard_number as number;
      }
      if (config.replication_factor) {
        createOptions.replication_factor = config.replication_factor as number;
      }
      if (config.write_consistency_factor) {
        createOptions.write_consistency_factor = config.write_consistency_factor as number;
      }

      await this.client.createCollection(name, createOptions as any);

      log.info(`[Qdrant] Created collection: ${name}`);
      return { success: true };
    } catch (error) {
      console.error('[Qdrant] Create collection error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create collection';
      return { success: false, error: message };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return qdrantCreateCollectionSchema;
  }

  private recordToDocument(point: QdrantSchemas['Record'] & { score?: number }): Document {
    const vectors: Record<string, DocumentVector> = {};

    if (Array.isArray(point.vector)) {
      // Single unnamed dense vector
      vectors[COLLECTION_DEFAULT_VECTOR] = {
        key: COLLECTION_DEFAULT_VECTOR,
        vectorType: 'dense',
        size: point.vector.length,
        value: {
          data: point.vector as number[],
        },
      };
    } else if (point.vector && typeof point.vector === 'object') {
      // Named vectors (can be dense or sparse)
      Object.entries(point.vector).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // Dense vector
          vectors[key] = {
            key,
            vectorType: 'dense',
            size: value.length,
            value: {
              data: value as number[],
            },
          };
        } else if (value && typeof value === 'object' && 'indices' in value && 'values' in value) {
          // Sparse vector
          vectors[key] = {
            key,
            vectorType: 'sparse',
            value: {
              indices: (value as any).indices as number[],
              values: (value as any).values as number[],
            },
          };
        }
      });
    }

    return {
      primary: { name: 'id', value: point.id },
      vectors,
      score: point.score,
      payload: point.payload || {},
    };
  }
}
