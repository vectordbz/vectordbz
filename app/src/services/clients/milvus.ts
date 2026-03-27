import { ClientConfig, MilvusClient as MilvusSDK } from '@zilliz/milvus2-sdk-node';
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
// Milvus Constants
// ============================================

export const MILVUS_METRIC_TYPES = [
  { label: 'Cosine Similarity (COSINE)', value: 'COSINE' },
  { label: 'Inner Product (IP)', value: 'IP' },
  { label: 'Euclidean (L2)', value: 'L2' },
  { label: 'Hamming (HAMMING) - for Binary', value: 'HAMMING' },
  { label: 'Jaccard (JACCARD) - for Binary', value: 'JACCARD' },
] as const;

export const MILVUS_INDEX_TYPES = [
  { label: 'Auto Index (Recommended)', value: 'AUTOINDEX' },
  { label: 'HNSW', value: 'HNSW' },
  { label: 'IVF_FLAT', value: 'IVF_FLAT' },
  { label: 'IVF_SQ8', value: 'IVF_SQ8' },
  { label: 'IVF_PQ', value: 'IVF_PQ' },
  { label: 'SCANN', value: 'SCANN' },
  { label: 'Flat (Brute Force)', value: 'FLAT' },
  { label: 'Binary Flat', value: 'BIN_FLAT' },
] as const;

export const MILVUS_VECTOR_TYPES = [
  { label: 'Float Vector', value: 'FloatVector' },
  { label: 'Binary Vector', value: 'BinaryVector' },
  { label: 'Float16 Vector', value: 'Float16Vector' },
  { label: 'BFloat16 Vector', value: 'BFloat16Vector' },
  { label: 'Sparse Float Vector', value: 'SparseFloatVector' },
] as const;

export const MILVUS_SCALAR_TYPES = [
  { label: 'VarChar (String)', value: 'VarChar' },
  { label: 'Int8', value: 'Int8' },
  { label: 'Int16', value: 'Int16' },
  { label: 'Int32', value: 'Int32' },
  { label: 'Int64', value: 'Int64' },
  { label: 'Float', value: 'Float' },
  { label: 'Double', value: 'Double' },
  { label: 'Bool', value: 'Bool' },
  { label: 'JSON', value: 'JSON' },
  { label: 'Array', value: 'Array' },
] as const;

export const MILVUS_PRIMARY_KEY_TYPES = [
  { label: 'Int64 (Auto ID)', value: 'Int64' },
  { label: 'VarChar (String ID)', value: 'VarChar' },
] as const;

export const MILVUS_CONSISTENCY_LEVELS = [
  { label: 'Strong', value: 'Strong', description: 'Guaranteed latest data (slowest)' },
  { label: 'Bounded', value: 'Bounded', description: 'Read within time bound (recommended)' },
  { label: 'Session', value: 'Session', description: 'Read your own writes' },
  { label: 'Eventually', value: 'Eventually', description: 'No guarantee (fastest)' },
] as const;

export const MILVUS_DEFAULTS = {
  dimension: 1536,
  metricType: 'COSINE',
  indexType: 'AUTOINDEX',
  consistencyLevel: 'Bounded',
  shardsNum: 1,
  hnswM: 16,
  hnswEfConstruction: 200,
  ivfNlist: 1024,
  maxVarCharLength: 65535,
} as const;

// ============================================
// Milvus Create Collection Schema
// ============================================

export const milvusCreateCollectionSchema: DynamicFormSchema = {
  title: 'Create Milvus Collection',
  description: 'Configure your new collection in Milvus',
  sections: [
    {
      key: 'general',
      title: 'General',
      description: 'Basic collection settings',
      items: [
        {
          key: 'collection_name',
          label: 'Collection Name',
          type: 'text',
          required: true,
          placeholder: 'my_collection',
          description: 'Unique name for your collection',
          rules: [
            { type: 'minLength', value: 1, message: 'Collection name is required' },
            { type: 'pattern', value: '^[a-zA-Z_][a-zA-Z0-9_]*$', message: 'Must start with letter or underscore' },
          ],
        },
        { key: 'description', label: 'Description', type: 'textarea', rows: 2, placeholder: 'Optional description of the collection' },
      ],
    },
    {
      key: 'schemaType',
      title: 'Schema Type',
      items: [
        {
          key: 'schemaType',
          label: 'Schema Type',
          type: 'radio',
          direction: 'vertical',
          defaultValue: 'simple',
          options: [
            { label: 'Simple (Auto ID)', value: 'simple', description: 'Just specify vector dimensions, auto-generate IDs' },
            { label: 'Custom Schema', value: 'custom', description: 'Define primary key, vector fields, and scalar fields' },
          ],
        },
      ],
    },
    {
      key: 'simpleSchema',
      title: 'Vector Configuration',
      description: 'Configure your vector field',
      showWhen: { field: 'schemaType', operator: 'equals', value: 'simple' },
      items: [
        { key: 'dimension', label: 'Vector Dimensions', type: 'number', required: true, defaultValue: MILVUS_DEFAULTS.dimension, min: 1, max: 32768, description: 'Number of dimensions (e.g., 1536 for OpenAI, 768 for many models)' },
        { key: 'metric_type', label: 'Metric Type', type: 'select', defaultValue: MILVUS_DEFAULTS.metricType, options: [...MILVUS_METRIC_TYPES], description: 'Distance metric for similarity search' },
        { key: 'enable_dynamic_field', label: 'Enable Dynamic Schema', type: 'switch', defaultValue: true, description: 'Allow inserting fields not defined in schema' },
      ],
    },
    {
      key: 'customSchema',
      title: 'Schema Fields',
      description: 'Define your collection schema',
      showWhen: { field: 'schemaType', operator: 'equals', value: 'custom' },
      items: [
        { key: 'primaryKeyType', label: 'Primary Key Type', type: 'select', defaultValue: 'Int64', options: [...MILVUS_PRIMARY_KEY_TYPES] },
        { key: 'primaryKeyName', label: 'Primary Key Field Name', type: 'text', defaultValue: 'id', required: true },
        { key: 'autoId', label: 'Auto Generate ID', type: 'switch', defaultValue: true, description: 'Automatically generate primary key values', showWhen: { field: 'primaryKeyType', operator: 'equals', value: 'Int64' } },
        { key: 'maxLength', label: 'Max String Length', type: 'number', defaultValue: MILVUS_DEFAULTS.maxVarCharLength, min: 1, max: 65535, description: 'Maximum length for VarChar primary key', showWhen: { field: 'primaryKeyType', operator: 'equals', value: 'VarChar' } },
        { key: 'enable_dynamic_field', label: 'Enable Dynamic Schema', type: 'switch', defaultValue: true, description: 'Allow inserting fields not defined in schema' },
      ],
    },
    {
      key: 'vectorFields',
      title: 'Vector Fields',
      description: 'Define vector fields for your collection',
      showWhen: { field: 'schemaType', operator: 'equals', value: 'custom' },
      items: [
        {
          key: 'vectorFields',
          type: 'array',
          itemType: 'object',
          itemLabel: 'Vector Field',
          minItems: 1,
          itemFields: [
            { key: 'name', label: 'Field Name', type: 'text', required: true, defaultValue: 'vector', placeholder: 'vector' },
            { key: 'dataType', label: 'Data Type', type: 'select', defaultValue: 'FloatVector', options: [...MILVUS_VECTOR_TYPES] },
            {
              key: 'dimension',
              label: 'Dimensions',
              type: 'number',
              required: false, // Not required for SparseFloatVector
              defaultValue: MILVUS_DEFAULTS.dimension,
              min: 1,
              max: 32768,
              description: 'Number of dimensions (not required for sparse vectors)'
            },
            { key: 'metric_type', label: 'Metric Type', type: 'select', defaultValue: MILVUS_DEFAULTS.metricType, options: [...MILVUS_METRIC_TYPES] },
          ],
          addButtonText: 'Add Vector Field',
        },
      ],
    },
    {
      key: 'scalarFields',
      title: 'Scalar Fields',
      description: 'Define additional scalar fields',
      showWhen: { field: 'schemaType', operator: 'equals', value: 'custom' },
      collapsible: true,
      defaultCollapsed: false,
      items: [
        {
          key: 'scalarFields',
          type: 'array',
          itemType: 'object',
          itemLabel: 'Scalar Field',
          minItems: 0,
          itemFields: [
            { key: 'name', label: 'Field Name', type: 'text', required: true, placeholder: 'title' },
            { key: 'dataType', label: 'Data Type', type: 'select', required: true, defaultValue: 'VarChar', options: [...MILVUS_SCALAR_TYPES] },
            { key: 'maxLength', label: 'Max Length', type: 'number', defaultValue: MILVUS_DEFAULTS.maxVarCharLength, min: 1, max: 65535, description: 'For VarChar type only', showWhen: { field: 'dataType', operator: 'equals', value: 'VarChar' } },
            { key: 'nullable', label: 'Nullable', type: 'switch', defaultValue: true },
          ],
          addButtonText: 'Add Scalar Field',
        },
      ],
    },
    {
      key: 'indexing',
      title: 'Index Configuration',
      description: 'Configure vector index for faster search',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        { key: 'createIndex', label: 'Create Index on Vector Field', type: 'switch', defaultValue: true, description: 'Automatically create an index after collection creation' },
        { key: 'index_type', label: 'Index Type', type: 'select', defaultValue: MILVUS_DEFAULTS.indexType, showWhen: { field: 'createIndex', operator: 'equals', value: true }, options: [...MILVUS_INDEX_TYPES] },
        { key: 'hnsw_M', label: 'M (Max Connections)', type: 'number', defaultValue: MILVUS_DEFAULTS.hnswM, min: 4, max: 64, description: 'Maximum number of outgoing edges per node', showWhen: { field: 'index_type', operator: 'equals', value: 'HNSW', and: [{ field: 'createIndex', operator: 'equals', value: true }] } },
        { key: 'hnsw_efConstruction', label: 'EF Construction', type: 'number', defaultValue: MILVUS_DEFAULTS.hnswEfConstruction, min: 8, max: 512, description: 'Search depth during index build', showWhen: { field: 'index_type', operator: 'equals', value: 'HNSW', and: [{ field: 'createIndex', operator: 'equals', value: true }] } },
        { key: 'ivf_nlist', label: 'nlist (Number of Clusters)', type: 'number', defaultValue: MILVUS_DEFAULTS.ivfNlist, min: 1, max: 65536, description: 'Number of cluster units', showWhen: { field: 'index_type', operator: 'in', values: ['IVF_FLAT', 'IVF_SQ8', 'IVF_PQ'], and: [{ field: 'createIndex', operator: 'equals', value: true }] } },
      ],
    },
    {
      key: 'consistency',
      title: 'Consistency Level',
      description: 'Configure read consistency',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        { key: 'consistency_level', label: 'Consistency Level', type: 'select', defaultValue: MILVUS_DEFAULTS.consistencyLevel, options: [...MILVUS_CONSISTENCY_LEVELS] },
      ],
    },
    {
      key: 'sharding',
      title: 'Sharding',
      description: 'Configure data distribution',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        { key: 'shards_num', label: 'Number of Shards', type: 'number', defaultValue: MILVUS_DEFAULTS.shardsNum, min: 1, max: 64, description: 'Number of shards for distributed storage' },
      ],
    },
  ],
  showSubmit: true,
  showCancel: true,
  submitText: 'Create Collection',
}

export class MilvusClient implements VectorDBClient {
  private client: MilvusSDK;
  constructor(config: ConnectionConfig) {
    const protocol = config.https ? 'https' : 'http';
    const address = `${protocol}://${config.host}${config.port ? `:${config.port}` : ''}`;

    const connectionConfig: ClientConfig = {
      address,
      database: config.database || undefined,
    };

    // Enable SSL for HTTPS connections (required for Zilliz Cloud)
    if (config.https) {
      connectionConfig.ssl = true;
    }

    // Support both token and username/password authentication
    if (config.apiKey) {
      // If apiKey looks like a token (no @ symbol), use as token
      // Otherwise, treat as username:password format
      if (config.apiKey.includes('@') && config.apiKey.includes(':')) {
        const [username, password] = config.apiKey.split(':');
        connectionConfig.username = username;
        connectionConfig.password = password;
      } else {
        connectionConfig.token = config.apiKey;
      }
    }

    log.info('[Milvus] Connecting with config:', { address, ssl: config.https, hasToken: !!config.apiKey });
    this.client = new MilvusSDK(connectionConfig);
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.client.listCollections();
      log.info('[Milvus] Connection test: SDK connection successful');
      return { success: true, version: 'Milvus 2.x (SDK)' };
    } catch (error: any) {
      log.warn('[Milvus] Connection test failed:', error.message);
      return {
        success: false,
        error: `Failed to connect to Milvus: ${error.message}`
      };
    }
  }

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      const response = await this.client.listCollections();
      const collectionNames = response.data.map((item) => item.name);

      if (collectionNames.length === 0) {
        return { success: true, collections: [] };
      }

      // Get details for each collection
      const collections = await Promise.all(
        collectionNames.map(async (name: string) => {
          try {
            const desc = await this.client.describeCollection({ collection_name: name });

            // Find vector field to get dimension
            const vectorField = desc.schema?.fields?.find(
              (f: { data_type: string }) => f.data_type === 'FloatVector' || f.data_type === 'BinaryVector'
            );

            const stats = await this.client.getCollectionStats({ collection_name: name });
            const rowCount = +(stats.data.row_count || 0);
            // Return Milvus native collection format
            const collection: Collection = {
              name,
              count: rowCount,
            };
            return collection;
          } catch (descError: any) {
            log.warn(`[Milvus] Failed to describe collection ${name}`);
            return {
              name,
              count: 0,
            };
          }
        })
      );

      return { success: true, collections };
    } catch (error: any) {
      const message = error.message || 'Failed to fetch collections';
      return { success: false, error: message };
    }
  }

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    try {
      const desc = await this.client.describeCollection({ collection_name: collection });
      const stats = await this.client.getCollectionStats({ collection_name: collection });
      return {
        success: true,
        data: {
          collection: desc,
          stats,
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch collection info';
      return { success: false, error: message };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    try {
      const desc = await this.client.describeCollection({ collection_name: collection });
      const fields: Record<string, SchemaField> = {};
      const vectors: Record<string, VectorSchemaField> = {};
      let primary: SchemaField = { name: 'id', type: 'number', autoID: true };

      desc.schema?.fields?.forEach((field) => {
        const type = this.mapMilvusDataTypeToSchemaType(field.data_type);

        if (field.is_primary_key) {
          primary = {
            name: field.name,
            type,
            autoID: field.autoID,
            searchable: false, // Milvus doesn't support text search
          };
        } else if (type === 'vector') {
          // Determine vector type based on Milvus data type
          if (field.data_type === 'SparseFloatVector') {
            vectors[field.name] = {
              name: field.name,
              type: 'vector',
              vectorType: 'sparse',
            };
          } else if (field.data_type === 'BinaryVector') {
            vectors[field.name] = {
              name: field.name,
              type: 'vector',
              vectorType: 'binary',
              size: typeof field.dim === 'string' ? parseInt(field.dim, 10) : (field.dim as number),
            };
          } else {
            // FloatVector, Float16Vector, BFloat16Vector, etc.
            vectors[field.name] = {
              name: field.name,
              type: 'vector',
              vectorType: 'dense',
              size: typeof field.dim === 'string' ? parseInt(field.dim, 10) : (field.dim as number),
            };
          }
        } else {
          fields[field.name] = {
            name: field.name,
            type,
            searchable: false, // Milvus doesn't support text search
          };
        }
      });

      const totalVectors = Object.keys(vectors).length;
      return {
        success: true,
        schema: {
          primary,
          fields,
          vectors,
          multipleVectors: totalVectors > 1,
          hasVectors: totalVectors > 0,
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch collection schema';
      return { success: false, error: message };
    }
  }

  async getSearchCapabilities(_collection: string, schema?: CollectionSchema | null): Promise<SearchCapabilities> {
    return mergeWithDefault(
      {
        sparse: true,
        clientSideFusion: true,
        fusionStrategies: ['rrf', 'weighted'],
      },
      schema
    );
  }

  async upsertDocument(collection: string, data: UpsertDocumentData): Promise<UpsertDocumentResult> {
    try {
      const { document } = data;
      const { primary, vectors, payload } = document;
      const upsertData: Record<string, any> = {
        ...payload,
      }

      if (primary) {
        upsertData[primary.name] = primary.value;
      } else {
        const { schema } = await this.getCollectionSchema(collection);
        if (!schema) {
          return { success: false, error: 'Failed to get collection schema' };
        }
        const { primary: schemaPrimary } = schema;
        if (!schemaPrimary.autoID) {
          if (schemaPrimary.type === 'number') {
            upsertData[schemaPrimary.name] = Math.floor(Math.random() * 1000000);
          } else {
            upsertData[schemaPrimary.name] = crypto.randomUUID();
          }
        }
      }

      if (vectors) {
        Object.entries(vectors).forEach(([_, vectorData]) => {
          // Use vectorData.key (the field name) not the dictionary key
          const fieldName = vectorData.key;

          // Convert from our format to Milvus format
          if (vectorData.vectorType === 'dense') {
            upsertData[fieldName] = vectorData.value.data;
          } else if (vectorData.vectorType === 'sparse') {
            upsertData[fieldName] = {
              indices: vectorData.value.indices,
              values: vectorData.value.values,
            };
          } else if (vectorData.vectorType === 'binary') {
            upsertData[fieldName] = vectorData.value.data; // Byte array
          }
        });
      }
      await this.client.upsert({
        collection_name: collection,
        data: [upsertData],
      });
      return { success: true, document: upsertData };
    } catch (error) {
      log.error('[Milvus] Upsert error:', error);
      const message = error instanceof Error ? error.message : 'Failed to upsert document';
      return { success: false, error: message };
    }
  }

  async getDocuments(
    collection: string,
    options?: GetDocumentsOptions
  ): Promise<GetDocumentsResult> {
    try {
      const limit = options?.limit;
      const offset = typeof options?.offset === "number" ? options.offset : 0;

      // Build filter expression
      let filterExpr: string | undefined = undefined;
      if (options?.filter?.conditions?.length) {
        filterExpr = this.buildFilterExpression(options.filter);
      }

      // Milvus requires a valid expr. If no filter provided, use * always true expression *
      const expr = filterExpr || "";
      // Note: empty string means no filter in Milvus

      const response = await this.client.query({
        collection_name: collection,
        expr,
        limit,
        offset,
        output_fields: ["*"],
      });

      // Response shape:
      // { data: [ { field1: value1, field2: value2, ... }, ... ] }
      const raw = Array.isArray(response.data) ? response.data : [];
      const { schema } = await this.getCollectionSchema(collection);
      let documents: Document[] = raw.map((item) => this.recordToDocument(item, schema as CollectionSchema));

      // Milvus doesn't support native sorting, so sort client-side if requested
      if (options?.sort && options.sort.length > 0) {
        documents = sortDocuments(documents, options.sort);
      }

      return {
        success: true,
        documents,
        nextOffset: documents.length === limit ? offset + limit : null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch documents";

      return { success: false, error: message };
    }
  }

  private getVectorKey(key?: string): string {
    if (!key || key === COLLECTION_DEFAULT_VECTOR) {
      return 'default';
    }
    return key;
  }

  async search(collection: string, vectors: Record<string, DocumentVector>, options?: SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();
    try {
      const { schema } = await this.getCollectionSchema(collection);
      const filterExpr = options?.filter ? this.buildFilterExpression(options.filter) : undefined;

      const vectorKeys = Object.keys(vectors);

      // Hybrid search (multiple vectors)
      if (vectorKeys.length > 1) {
        // Perform separate searches and manually fuse results
        const allResults: Array<{ doc: Document; score: number; vectorKey: string }> = [];

        for (const key of vectorKeys) {
          const vectorData = vectors[key];
          let searchData: any;

          if (vectorData.vectorType === 'dense') {
            searchData = [vectorData.value.data];
          } else if (vectorData.vectorType === 'sparse') {
            searchData = [vectorData.value];
          } else if (vectorData.vectorType === 'binary') {
            searchData = [vectorData.value.data];
          }

          const response = await this.client.search({
            collection_name: collection,
            data: searchData,
            anns_field: key,
            limit: options?.limit ? options.limit * 2 : 20, // Fetch more for fusion
            output_fields: ['*'],
            ...(filterExpr && { expr: filterExpr }),
          });

          // Collect results with vector key
          (response.results || []).forEach((item: any, index: number) => {
            const doc = this.recordToDocument(item, schema as CollectionSchema);
            allResults.push({
              doc,
              score: doc.score || 0,
              vectorKey: key,
            });
          });
        }

        const searchTimeMs = performance.now() - startTime;

        // Apply threshold filter
        let results = allResults.map(({ doc, score, vectorKey }) => ({ ...doc, score, vectorKey }));
        if (options?.scoreThreshold !== undefined) {
          results = results.filter(doc => doc.score !== undefined && doc.score >= options.scoreThreshold!);
        }

        return {
          success: true,
          documents: results,
          metadata: { searchTimeMs },
        };
      }

      // Single vector search
      const vectorKey = vectorKeys[0];
      const vectorData = vectors[vectorKey];
      let searchData: any;

      if (vectorData.vectorType === 'dense') {
        searchData = [vectorData.value.data];
      } else if (vectorData.vectorType === 'sparse') {
        searchData = [vectorData.value];
      } else if (vectorData.vectorType === 'binary') {
        searchData = [vectorData.value.data];
      }

      const response = await this.client.search({
        collection_name: collection,
        data: searchData,
        anns_field: vectorKey,
        limit: options?.limit || 10,
        output_fields: ['*'],
        ...(filterExpr && { expr: filterExpr }),
      });

      const searchTimeMs = performance.now() - startTime;
      let results: Document[] = (response.results || []).map((item) =>
        this.recordToDocument(item, schema as CollectionSchema)
      );

      // Apply threshold filter
      if (options?.scoreThreshold !== undefined) {
        results = results.filter(doc => doc.score !== undefined && doc.score >= options.scoreThreshold!);
      }

      return {
        success: true,
        documents: results,
        metadata: { searchTimeMs },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { success: false, error: message };
    }
  }

  async deleteDocument(collection: string, primary: Document['primary']): Promise<DeleteDocumentResult> {
    try {
      await this.client.delete({
        collection_name: collection,
        filter: `${primary.name} == ${typeof primary.value === 'string' ? `"${primary.value}"` : primary.value}`,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      return { success: false, error: message };
    }
  }

  async deleteDocuments(collection: string, filter: FilterQuery): Promise<DeleteDocumentsResult> {
    try {
      // Get schema to determine primary key field name
      const { schema } = await this.getCollectionSchema(collection);
      if (!schema) {
        return { success: false, error: 'Failed to get collection schema' };
      }
      const primaryKeyField = schema.primary.name;

      const hasFilter = filter.conditions && filter.conditions.length > 0;
      const filterExpr = hasFilter ? this.buildFilterExpression(filter) : '';

      // Get count and primary key values
      let count = 0;
      let allPrimaryKeys: (string | number)[] = [];
      let offset = 0;
      const batchSize = 10000;

      for (;;) {
        const queryResponse = await this.client.query({
          collection_name: collection,
          ...(filterExpr && { expr: filterExpr }),
          limit: batchSize,
          offset: offset,
          output_fields: [primaryKeyField],
        });

        const primaryKeys = (queryResponse.data || []).map((item: any) => item[primaryKeyField]);
        if (primaryKeys.length === 0) break;

        allPrimaryKeys = allPrimaryKeys.concat(primaryKeys);

        if (primaryKeys.length < batchSize) break;
        offset += batchSize;
      }

      count = allPrimaryKeys.length;

      if (count === 0) {
        return { success: true, deletedCount: 0 };
      }

      // Delete - Milvus requires a filter expression
      if (filterExpr) {
        await this.client.delete({
          collection_name: collection,
          filter: filterExpr,
        });
      } else {
        // Delete all by primary key batches
        for (let i = 0; i < allPrimaryKeys.length; i += 1000) {
          const batch = allPrimaryKeys.slice(i, i + 1000);
          const primaryKeyFilter = `${primaryKeyField} in [${batch.map(pk => typeof pk === 'string' ? `"${pk}"` : pk).join(',')}]`;
          await this.client.delete({
            collection_name: collection,
            filter: primaryKeyFilter,
          });
        }
      }

      return { success: true, deletedCount: count };
    } catch (error) {
      console.error('[Milvus] Bulk delete error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete items';
      return { success: false, error: message };
    }
  }

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    try {
      await this.client.dropCollection({
        collection_name: collection,
      });
      return { success: true };
    } catch (error) {
      console.error('[Milvus] Drop collection error:', error);
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
      console.error('[Milvus] Truncate collection error:', error);
      const message = error instanceof Error ? error.message : 'Failed to truncate collection';
      return { success: false, error: message };
    }
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    try {
      const collectionName = (config.collection_name || config.name) as string;
      const schemaType = config.schemaType as string || (config.vectorFields ? 'custom' : 'simple');
      const description = config.description as string || '';

      if (schemaType === 'simple') {
        // Simple schema with auto ID
        const dimension = config.dimension as number;
        const metricType = config.metric_type as string || 'COSINE';
        const enableDynamicField = config.enable_dynamic_field !== false;

        await this.client.createCollection({
          collection_name: collectionName,
          auto_id: true,
          dimension,
          metric_type: metricType,
          description,
          enable_dynamic_field: enableDynamicField,
        });
      } else {
        // Custom schema
        const primaryKeyType = config.primaryKeyType as string || 'Int64';
        const primaryKeyName = (config.primaryKeyName || config.primaryField) as string || 'id';
        const autoId = config.autoId !== false;
        const enableDynamicField = config.enable_dynamic_field !== false;

        const fields: any[] = [];

        // Primary key field
        if (primaryKeyType === 'Int64') {
          fields.push({
            name: primaryKeyName,
            data_type: 'Int64',
            is_primary_key: true,
            auto_id: autoId,
          });
        } else {
          fields.push({
            name: primaryKeyName,
            data_type: 'VarChar',
            is_primary_key: true,
            max_length: config.maxLength || 65535,
          });
        }

        // Vector fields
        const vectorFields = config.vectorFields as Array<{
          name: string;
          dataType: string;
          dimension: number;
          metric_type: string;
        }>;

        if (vectorFields && vectorFields.length > 0) {
          for (const vf of vectorFields) {
            const fieldDef: any = {
              name: vf.name,
              data_type: vf.dataType || 'FloatVector',
            };

            // Only include dim for non-sparse vectors
            if (vf.dataType !== 'SparseFloatVector') {
              fieldDef.dim = vf.dimension;
            }

            fields.push(fieldDef);
          }
        }

        // Scalar fields
        const scalarFields = config.scalarFields as Array<{
          name: string;
          dataType: string;
          maxLength?: number;
          nullable?: boolean;
        }>;

        if (scalarFields && scalarFields.length > 0) {
          for (const sf of scalarFields) {
            const fieldDef: any = {
              name: sf.name,
              data_type: sf.dataType,
              nullable: sf.nullable ?? true,
            };
            if (sf.dataType === 'VarChar' && sf.maxLength) {
              fieldDef.max_length = sf.maxLength;
            }
            fields.push(fieldDef);
          }
        }

        const createCollectionParams: any = {
          collection_name: collectionName,
          auto_id: autoId,
          description,
          enable_dynamic_field: enableDynamicField,
          fields,
        };
        if (config.consistency_level) {
          createCollectionParams.consistency_level = config.consistency_level;
        }
        if (config.shards_num) {
          createCollectionParams.shards_num = config.shards_num;
        }

        await this.client.createCollection(createCollectionParams);

        // Create index if requested
        let hasIndexes = false;
        if (config.createIndex && vectorFields && vectorFields.length > 0) {
          const indexType = config.index_type as string || 'AUTOINDEX';

          // Create index for each vector field
          for (const vectorField of vectorFields) {
            const indexParams: any = {
              collection_name: collectionName,
              field_name: vectorField.name,
            };

            // Handle different vector types (following seed-milvus.js pattern)
            if (vectorField.dataType === 'SparseFloatVector') {
              // Sparse vectors need SPARSE_INVERTED_INDEX with IP metric
              indexParams.index_type = 'SPARSE_INVERTED_INDEX';
              indexParams.metric_type = 'IP';
            } else if (vectorField.dataType === 'BinaryVector') {
              // Binary vectors need BIN_FLAT with HAMMING metric
              indexParams.index_type = 'BIN_FLAT';
              indexParams.metric_type = 'HAMMING';
            } else {
              // Dense vectors (FloatVector, Float16Vector, BFloat16Vector)
              indexParams.index_type = indexType;
              indexParams.metric_type = vectorField.metric_type || 'COSINE';

              // Add index-specific params for dense vectors
              if (indexType === 'HNSW') {
                indexParams.params = {
                  M: config.hnsw_M || 16,
                  efConstruction: config.hnsw_efConstruction || 200,
                };
              } else if (['IVF_FLAT', 'IVF_SQ8', 'IVF_PQ'].includes(indexType)) {
                indexParams.params = {
                  nlist: config.ivf_nlist || 1024,
                };
              }
            }

            try {
              await this.client.createIndex(indexParams);
              hasIndexes = true;
              log.info(`[Milvus] Created ${indexParams.index_type} index for field ${vectorField.name}`);
            } catch (error) {
              log.warn(`[Milvus] Could not create index for field ${vectorField.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }

        // Always try to load the collection (required for search, even without indexes)
        // Retry a few times as loading can fail immediately after creation
        let loaded = false;
        for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            await this.client.loadCollection({ collection_name: collectionName });
            log.info(`[Milvus] Loaded collection ${collectionName}${hasIndexes ? ' with indexes' : ''}${attempt > 0 ? ` (attempt ${attempt + 1})` : ''}`);
            loaded = true;
          } catch (error) {
            if (attempt === 2) {
              // Last attempt failed
              log.error(`[Milvus] Failed to load collection ${collectionName} after ${attempt + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }
      }

      log.info(`[Milvus] Created collection: ${collectionName}`);
      return { success: true };
    } catch (error) {
      console.error('[Milvus] Create collection error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create collection';
      return { success: false, error: message };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return milvusCreateCollectionSchema;
  }

  private recordToDocument(record: any, schema: CollectionSchema): Document {
    const { score, ...rest } = record;
    const payload: Document['payload'] = {};
    const vectors: Record<string, DocumentVector> = {};
    const primary: Document['primary'] = {
      name: schema.primary.name,
      value: record[schema.primary.name],
    };

    // Handle $meta field (dynamic fields in Milvus are stored here as JSON)
    let metaData: any = {};
    if (rest.$meta) {
      try {
        // $meta can be a Buffer (JSON bytes) or already parsed JSON
        if (Buffer.isBuffer(rest.$meta)) {
          metaData = JSON.parse(rest.$meta.toString());
        } else if (typeof rest.$meta === 'string') {
          metaData = JSON.parse(rest.$meta);
        } else {
          metaData = rest.$meta;
        }
      } catch (e) {
        // If parsing fails, ignore $meta
        log.warn('[Milvus] Failed to parse $meta field:', e);
      }
    }

    Object.entries(rest).forEach(([key, value]: [string, any]) => {
      if (key === schema.primary.name || key === '$meta') {
        return;
      }

      // Check if this key is a vector field in the schema
      const vectorSchema = schema.vectors[key];
      if (vectorSchema) {
        if (vectorSchema.vectorType === 'dense') {
          // Dense vector - array of numbers
          if (Array.isArray(value)) {
            vectors[key] = {
              key,
              vectorType: 'dense',
              size: value.length,
              value: {
                data: value,
              },
            };
          }
        } else if (vectorSchema.vectorType === 'sparse') {
          // Sparse vector - object with indices and values
          if (value && typeof value === 'object' && 'indices' in value && 'values' in value) {
            vectors[key] = {
              key,
              vectorType: 'sparse',
              value: {
                indices: value.indices as number[],
                values: value.values as number[],
              },
            };
          }
        } else if (vectorSchema.vectorType === 'binary') {
          // Binary vector - array of bytes
          if (Array.isArray(value)) {
            vectors[key] = {
              key,
              vectorType: 'binary',
              size: value.length * 8, // Convert bytes to bits
              value: {
                data: value,
              },
            };
          }
        }
      } else {
        // Not a vector, add to payload
        payload[key] = value;
      }
    });

    // Merge $meta data into payload (dynamic fields)
    Object.assign(payload, metaData);

    return {
      primary,
      payload,
      vectors,
      score,
    };
  }

  private buildFilterExpression(filter: FilterQuery): string {
    const conditions = filter.conditions.map(cond => {
      const field = cond.field;
      const value = cond.valueType === 'string' ? `"${cond.value}"` : cond.value;

      switch (cond.operator) {
        case 'eq':
          return `${field} == ${value}`;
        case 'neq':
          return `${field} != ${value}`;
        case 'gt':
          return `${field} > ${value}`;
        case 'gte':
          return `${field} >= ${value}`;
        case 'lt':
          return `${field} < ${value}`;
        case 'lte':
          return `${field} <= ${value}`;
        case 'contains':
          return `${field} like "%${cond.value}%"`;
        default:
          return `${field} == ${value}`;
      }
    });

    return conditions.join(filter.logic === 'and' ? ' && ' : ' || ');
  }

  private mapMilvusDataTypeToSchemaType(dataType: string): SchemaField['type'] {
    let type: SchemaField['type'] = 'unknown';
    switch (dataType) {
      case 'Bool':
        type = 'boolean';
        break;
      case 'Int8':
      case 'Int16':
      case 'Int32':
      case 'Int64':
      case 'Float':
      case 'Double':
        type = 'number';
        break;
      case 'VarChar':
        type = 'string';
        break;
      case 'BinaryVector':
      case 'FloatVector':
      case 'Float16Vector':
      case 'BFloat16Vector':
      case 'SparseFloatVector':
      case 'Int8Vector':
        type = 'vector';
        break;
    }
    return type;
  }

  /**
   * Fuse multiple search results using RRF or DBSF
   */
  private fuseSearchResults(
    results: Array<{ doc: Document; score: number; vectorKey: string }>,
    method: 'rrf' | 'dbsf',
    limit: number
  ): Document[] {
    if (method === 'rrf') {
      // Reciprocal Rank Fusion (RRF)
      const k = 60; // RRF constant
      const docScores = new Map<string, { doc: Document; rrfScore: number }>();

      // Group results by vector type and calculate ranks
      const resultsByVector = new Map<string, Array<{ doc: Document; rank: number }>>();
      results.forEach(({ doc, vectorKey }) => {
        if (!resultsByVector.has(vectorKey)) {
          resultsByVector.set(vectorKey, []);
        }
        const rankList = resultsByVector.get(vectorKey)!;
        rankList.push({ doc, rank: rankList.length + 1 });
      });

      // Calculate RRF scores
      results.forEach(({ doc, vectorKey }) => {
        const docId = String(doc.primary.value);
        const vectorResults = resultsByVector.get(vectorKey)!;
        const rank = vectorResults.findIndex(r => String(r.doc.primary.value) === docId) + 1;

        const rrfContribution = 1 / (k + rank);

        if (docScores.has(docId)) {
          const existing = docScores.get(docId)!;
          existing.rrfScore += rrfContribution;
        } else {
          docScores.set(docId, { doc, rrfScore: rrfContribution });
        }
      });

      // Sort by RRF score and return top-k
      return Array.from(docScores.values())
        .sort((a, b) => b.rrfScore - a.rrfScore)
        .slice(0, limit)
        .map(({ doc, rrfScore }) => ({ ...doc, score: rrfScore }));
    } else {
      // Distribution-Based Score Fusion (DBSF) - simple weighted average
      const docScores = new Map<string, { doc: Document; scores: number[]; count: number }>();

      results.forEach(({ doc, score }) => {
        const docId = String(doc.primary.value);

        if (docScores.has(docId)) {
          const existing = docScores.get(docId)!;
          existing.scores.push(score);
          existing.count++;
        } else {
          docScores.set(docId, { doc, scores: [score], count: 1 });
        }
      });

      // Calculate average scores
      return Array.from(docScores.values())
        .map(({ doc, scores }) => {
          const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
          return { ...doc, score: avgScore };
        })
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit);
    }
  }

}

