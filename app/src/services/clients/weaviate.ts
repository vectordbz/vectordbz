import axios, { AxiosInstance } from 'axios';
import {
  VectorDBClient,
  ConnectionConfig,
  ConnectionResult,
  GetCollectionsResult,
  GetCollectionInfoResult,
  SearchResult,
  SearchOptions,
  FilterQuery,
  DropCollectionResult,
  TruncateCollectionResult,
  CreateCollectionResult,
  Collection,
  Document,
  DeleteDocumentsResult,
  DeleteDocumentResult,
  GetDocumentsOptions,
  GetDocumentsResult,
  GetCollectionSchemaResult,
  SchemaField,
  VectorSchemaField,
  COLLECTION_DEFAULT_VECTOR,
  UpsertDocumentData,
  UpsertDocumentResult,
  DenseDocumentVector,
  SearchCapabilities,
  CollectionSchema,
} from '../../types';
import { DynamicFormSchema } from '../../components/DynamicForm/types';
import { mergeWithDefault } from '../searchCapabilities';

// ============================================
// Weaviate Constants
// ============================================

export const WEAVIATE_VECTORIZERS = [
  { label: 'None (bring your own vectors)', value: 'none' },
  { label: 'text2vec-openai', value: 'text2vec-openai' },
  { label: 'text2vec-cohere', value: 'text2vec-cohere' },
  { label: 'text2vec-huggingface', value: 'text2vec-huggingface' },
  { label: 'text2vec-transformers', value: 'text2vec-transformers' },
  { label: 'img2vec-neural', value: 'img2vec-neural' },
  { label: 'multi2vec-clip', value: 'multi2vec-clip' },
] as const;

export const WEAVIATE_DISTANCE_METRICS = [
  { label: 'Cosine', value: 'cosine' },
  { label: 'Dot Product', value: 'dot' },
  { label: 'L2 Squared', value: 'l2-squared' },
  { label: 'Hamming', value: 'hamming' },
  { label: 'Manhattan', value: 'manhattan' },
] as const;

export const WEAVIATE_INDEX_TYPES = [
  { label: 'HNSW', value: 'hnsw', description: 'Hierarchical Navigable Small World (default)' },
  { label: 'Flat', value: 'flat', description: 'Brute force (exact, slow)' },
] as const;

export const WEAVIATE_DATA_TYPES = [
  { label: 'Text', value: 'text' },
  { label: 'Text[]', value: 'text[]' },
  { label: 'Int', value: 'int' },
  { label: 'Int[]', value: 'int[]' },
  { label: 'Number', value: 'number' },
  { label: 'Number[]', value: 'number[]' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Boolean[]', value: 'boolean[]' },
  { label: 'Date', value: 'date' },
  { label: 'Date[]', value: 'date[]' },
  { label: 'UUID', value: 'uuid' },
  { label: 'UUID[]', value: 'uuid[]' },
  { label: 'Blob', value: 'blob' },
  { label: 'Object', value: 'object' },
  { label: 'Object[]', value: 'object[]' },
  { label: 'GeoCoordinates', value: 'geoCoordinates' },
  { label: 'PhoneNumber', value: 'phoneNumber' },
] as const;

export const WEAVIATE_STOPWORDS_PRESETS = [
  { label: 'English', value: 'en' },
  { label: 'None', value: 'none' },
] as const;

export const WEAVIATE_DEFAULTS = {
  vectorizer: 'none',
  vectorIndexType: 'hnsw',
  distance: 'cosine',
  efConstruction: 128,
  maxConnections: 64,
  bm25B: 0.75,
  bm25K1: 1.2,
  replicationFactor: 1,
} as const;

// ============================================
// Weaviate Create Collection Schema
// ============================================

export const weaviateCreateCollectionSchema: DynamicFormSchema = {
  title: 'Create Weaviate Class',
  description: 'Configure your new class (collection) in Weaviate',
  sections: [
    {
      key: 'general',
      title: 'General',
      description: 'Basic class settings',
      items: [
        {
          key: 'class',
          label: 'Class Name',
          type: 'text',
          required: true,
          placeholder: 'Article',
          description: 'Must start with an uppercase letter (PascalCase)',
          rules: [
            { type: 'minLength', value: 1, message: 'Class name is required' },
            { type: 'pattern', value: '^[A-Z][a-zA-Z0-9]*$', message: 'Must start with uppercase letter (PascalCase)' },
          ],
        },
        { key: 'description', label: 'Description', type: 'textarea', rows: 2, placeholder: 'A collection of articles...' },
      ],
    },
    {
      key: 'vectorConfig',
      title: 'Vector Configuration',
      description: 'Configure vector storage type',
      items: [
        {
          key: 'vectorConfigType',
          label: 'Vector Config Type',
          type: 'radio',
          direction: 'vertical',
          defaultValue: 'single',
          options: [
            { label: 'Single Vector', value: 'single', description: 'One vector per object (default)' },
            { label: 'Named Vectors', value: 'named', description: 'Multiple named vectors per object' },
          ],
        },
        {
          key: 'namedVectors',
          label: 'Named Vectors',
          type: 'array',
          itemType: 'object',
          itemLabel: 'Vector',
          showWhen: { field: 'vectorConfigType', operator: 'equals', value: 'named' },
          minItems: 1,
          itemFields: [
            { key: 'name', label: 'Vector Name', type: 'text', required: true, placeholder: 'title_vector' },
            { key: 'vectorizer', label: 'Vectorizer', type: 'select', defaultValue: 'none', options: [{ label: 'None', value: 'none' }, { label: 'text2vec-openai', value: 'text2vec-openai' }, { label: 'text2vec-cohere', value: 'text2vec-cohere' }] },
          ],
          addButtonText: 'Add Named Vector',
        },
      ],
    },
    {
      key: 'vectorizer',
      title: 'Vectorizer',
      description: 'Configure how vectors are created',
      showWhen: { field: 'vectorConfigType', operator: 'notEquals', value: 'named' },
      items: [
        { key: 'vectorizer', label: 'Vectorizer', type: 'select', defaultValue: WEAVIATE_DEFAULTS.vectorizer, options: [...WEAVIATE_VECTORIZERS], description: 'Choose how to generate vectors from your data' },
        { key: 'vectorizerModel', label: 'Model', type: 'text', placeholder: 'text-embedding-ada-002', showWhen: { field: 'vectorizer', operator: 'notEquals', value: 'none' }, description: 'Model name for the vectorizer' },
      ],
    },
    {
      key: 'indexing',
      title: 'Vector Index',
      description: 'Configure vector index settings (single vector mode only)',
      collapsible: true,
      defaultCollapsed: true,
      showWhen: { field: 'vectorConfigType', operator: 'notEquals', value: 'named' },
      items: [
        { key: 'vectorIndexType', label: 'Index Type', type: 'select', defaultValue: WEAVIATE_DEFAULTS.vectorIndexType, options: [...WEAVIATE_INDEX_TYPES] },
        { key: 'distance', label: 'Distance Metric', type: 'select', defaultValue: WEAVIATE_DEFAULTS.distance, options: [...WEAVIATE_DISTANCE_METRICS] },
        { key: 'ef', label: 'EF (Search)', type: 'number', defaultValue: -1, min: -1, description: 'Size of dynamic candidate list (-1 for auto)', showWhen: { field: 'vectorIndexType', operator: 'equals', value: 'hnsw' } },
        { key: 'efConstruction', label: 'EF Construction', type: 'number', defaultValue: WEAVIATE_DEFAULTS.efConstruction, min: 4, description: 'Size of dynamic candidate list during build', showWhen: { field: 'vectorIndexType', operator: 'equals', value: 'hnsw' } },
        { key: 'maxConnections', label: 'Max Connections', type: 'number', defaultValue: WEAVIATE_DEFAULTS.maxConnections, min: 4, max: 128, description: 'Maximum connections per node', showWhen: { field: 'vectorIndexType', operator: 'equals', value: 'hnsw' } },
      ],
    },
    {
      key: 'properties',
      title: 'Properties (Schema)',
      description: 'Define the data schema for this class',
      items: [
        {
          key: 'properties',
          type: 'array',
          itemType: 'object',
          itemLabel: 'Property',
          minItems: 0,
          itemFields: [
            { key: 'name', label: 'Property Name', type: 'text', required: true, placeholder: 'title', description: 'Must start with lowercase letter' },
            { key: 'dataType', label: 'Data Type', type: 'select', required: true, defaultValue: 'text', options: [...WEAVIATE_DATA_TYPES] },
            { key: 'description', label: 'Description', type: 'text', placeholder: 'Optional description' },
            { key: 'indexSearchable', label: 'Searchable', type: 'switch', defaultValue: true, description: 'Enable full-text search on this property' },
            { key: 'indexFilterable', label: 'Filterable', type: 'switch', defaultValue: true, description: 'Enable filtering on this property' },
          ],
          addButtonText: 'Add Property',
        },
      ],
    },
    {
      key: 'invertedIndex',
      title: 'Inverted Index',
      description: 'Configure keyword search and filtering',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        { key: 'bm25_b', label: 'BM25 b', type: 'number', defaultValue: WEAVIATE_DEFAULTS.bm25B, min: 0, max: 1, step: 0.05, description: 'Length normalization parameter' },
        { key: 'bm25_k1', label: 'BM25 k1', type: 'number', defaultValue: WEAVIATE_DEFAULTS.bm25K1, min: 0, max: 3, step: 0.1, description: 'Term frequency saturation parameter' },
        { key: 'stopwords_preset', label: 'Stopwords Preset', type: 'select', defaultValue: 'en', options: [...WEAVIATE_STOPWORDS_PRESETS] },
        { key: 'indexTimestamps', label: 'Index Timestamps', type: 'switch', defaultValue: false, description: 'Enable filtering by creation/update timestamps' },
        { key: 'indexNullState', label: 'Index Null State', type: 'switch', defaultValue: false, description: 'Enable filtering for null values' },
        { key: 'indexPropertyLength', label: 'Index Property Length', type: 'switch', defaultValue: false, description: 'Enable filtering by property length' },
      ],
    },
    {
      key: 'replication',
      title: 'Replication',
      description: 'Configure data replication',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        { key: 'replicationFactor', label: 'Replication Factor', type: 'number', defaultValue: WEAVIATE_DEFAULTS.replicationFactor, min: 1, description: 'Number of replicas for fault tolerance' },
      ],
    },
    {
      key: 'multiTenancy',
      title: 'Multi-Tenancy',
      description: 'Configure tenant isolation',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        { key: 'multiTenancyEnabled', label: 'Enable Multi-Tenancy', type: 'switch', defaultValue: false, description: 'Isolate data by tenant' },
      ],
    },
  ],
  showSubmit: true,
  showCancel: true,
  submitText: 'Create Class',
}

export class WeaviateClient implements VectorDBClient {
  private client: AxiosInstance;

  constructor(config: ConnectionConfig) {
    const protocol = config.https ? 'https' : 'http';
    const baseURL = `${protocol}://${config.host}${config.port ? `:${config.port}` : ''}`;

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
      timeout: 30000,
    });
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const response = await this.client.get('/v1/meta');
      return {
        success: true,
        version: response.data?.version || 'unknown'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      const response = await this.client.get('/v1/schema');
      const classes = response.data.classes || [];

      // Get object counts for each class
      const collections = await Promise.all(
        classes.map(async (cls: { class: string; vectorIndexType?: string; vectorizer?: string; properties?: Array<{ name: string; dataType: string[] }> }) => {
          const className = cls.class;
          let count = 0;
          try {
            const col = await this.getCollectionInfo(className);
            if (col.success) {
              count = col.data?.count as number || 0;
            }
          } catch {
            // Ignore count errors
          }

          // Return Weaviate native collection format
          const collection: Collection = {
            name: className,
            count,
            ...cls, // Preserve all other class schema fields
          };
          return collection;
        })
      );

      return { success: true, collections };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch collections';
      return { success: false, error: message };
    }
  }

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    try {
      // Fetch full schema
      const schemaResponse = await this.client.get('/v1/schema');
      const classes = schemaResponse.data.classes || [];
      const classInfo = classes.find((cls: { class: string }) => cls.class === collection) || null;

      if (!classInfo) {
        return {
          success: true,
          data: { class: null, count: 0 }
        };
      }

      const isMultiTenant = classInfo.multiTenancyConfig?.enabled;
      let count = 0;
      if (!isMultiTenant) {
        // Simple aggregate for non-tenant collections
        const graphqlResponse = await this.client.post('/v1/graphql', {
          query: `{
            Aggregate {
              ${collection} {
                meta { count }
              }
            }
          }`
        });

        count = graphqlResponse.data?.data?.Aggregate?.[collection]?.[0]?.meta?.count || 0;
      } else {
        // Multi-tenant: sum counts across tenants
        const tenants = await this.getCollectionTenants(collection);

        for (const tenant of tenants) {
          const tenantName = tenant.name;

          const graphqlResponse = await this.client.post('/v1/graphql', {
            query: `{
              Aggregate {
                ${collection}(tenant: "${tenantName}") {
                  meta { count }
                }
              }
            }`
          });

          const tenantCount = graphqlResponse.data?.data?.Aggregate?.[collection]?.[0]?.meta?.count || 0;

          count += tenantCount;
        }
      }

      return {
        success: true,
        data: {
          class: classInfo,
          count
        }
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch collection info';
      return { success: false, error: message };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    try {
      const response = await this.client.get('/v1/schema');
      const classSchema = response.data.classes?.find((c: { class: string }) => c.class === collection);

      if (!classSchema) {
        return { success: false, error: `Class "${collection}" not found` };
      }

      const fields: Record<string, SchemaField> = {};
      let hasSearchableTextFields = false;

      // Check if class has inverted index configured (required for BM25 search)
      const hasInvertedIndex = !!classSchema.invertedIndexConfig;

      (classSchema.properties || []).forEach((prop: {
        name: string;
        dataType: string[];
        description?: string;
        indexSearchable?: boolean;
        indexInverted?: boolean;
      }) => {
        const dataType = prop.dataType[0]?.toLowerCase() || '';
        let type: SchemaField['type'] = 'unknown';

        switch (dataType) {
          case 'int':
          case 'number':
          case 'float':
            type = 'number';
            break;
          case 'bool':
            type = 'boolean';
            break;
          case 'date':
            type = 'date';
            break;
          case 'text':
            type = 'string';
            break;
          case 'array':
            type = 'array';
            break;
          case 'object':
            type = 'object';
        }

        // Check if field is searchable (for BM25/text search)
        // Weaviate uses indexSearchable to enable/disable full-text search on a property
        // By default, text properties are searchable unless explicitly disabled
        // Also requires the class to have an inverted index configured
        const isSearchable = hasInvertedIndex &&
          type === 'string' &&
          prop.indexSearchable !== false &&
          prop.indexInverted !== false;
        if (isSearchable) {
          hasSearchableTextFields = true;
        }

        fields[prop.name] = {
          name: prop.name,
          type,
          description: prop.description,
          searchable: isSearchable,
        };
      });

      let dataRequirements = undefined;
      if (classSchema.multiTenancyConfig?.enabled) {
        const tenants = await this.getCollectionTenants(collection);
        dataRequirements = {
          tenant: {
            key: 'tenant',
            value: tenants.map(tenant => tenant.name),
          },
        };
      }

      // Handle vector configuration (single or multiple named vectors)
      const vectorIndexConfig = classSchema.vectorIndexConfig;
      const vectorConfig = classSchema.vectorConfig;
      const vectors: Record<string, VectorSchemaField> = {};

      // Try to get a sample document to determine vector sizes, but don't fail if empty
      const dataRequirementsToUse = dataRequirements ? { tenant: dataRequirements.tenant.value[0] } : undefined;
      let document: Document | undefined;
      try {
        const result = await this.getDocuments(collection, { limit: 1, dataRequirements: dataRequirementsToUse });
        const documents = result?.documents || [];
        document = documents[0];
      } catch (e) {
        // Empty collection or error - will use default size
      }

      if (vectorIndexConfig) {
        // Single vector configuration
        const vectorData = document?.vectors?.[COLLECTION_DEFAULT_VECTOR];
        const vectorSize = vectorData?.vectorType === 'dense' && 'data' in vectorData.value
          ? vectorData.value.data.length
          : 0;
        vectors[COLLECTION_DEFAULT_VECTOR] = {
          name: COLLECTION_DEFAULT_VECTOR,
          type: 'vector',
          vectorType: 'dense',
          size: vectorSize
        };
      } else if (vectorConfig) {
        // Multiple named vectors configuration
        Object.entries(vectorConfig).forEach(([key, value]: any) => {
          const vectorData = document?.vectors?.[key];
          const vectorSize = vectorData?.vectorType === 'dense' && 'data' in vectorData.value
            ? vectorData.value.data.length
            : 0;
          vectors[key] = {
            name: key,
            type: 'vector',
            vectorType: 'dense',
            size: vectorSize
          };
        });
      }

      const totalVectors = Object.keys(vectors).length;

      return {
        success: true,
        schema: {
          primary: { name: 'id', type: 'string', autoID: true }, // Weaviate primary key is always 'id'
          fields,
          vectors,
          multipleVectors: totalVectors > 1,
          hasVectors: totalVectors > 0,
          dataRequirements,
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get schema';
      return { success: false, error: message };
    }
  }

  async getSearchCapabilities(_collection: string, schema?: CollectionSchema | null): Promise<SearchCapabilities> {
    return mergeWithDefault(
      {
        lexical: true,
        fusionStrategies: ['rrf', 'weighted', 'server'],
        supportsHybridAlpha: true,
        hybridAlphaDefault: 0.75,
      },
      schema
    );
  }

  private async getCollectionTenants(collection: string): Promise<{ name: string, activityStatus: string }[]> {
    try {
      const response = await this.client.get<{ name: string, activityStatus: string }[]>(`/v1/schema/${collection}/tenants`);
      return response.data || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get collection tenants';
      console.error('[Weaviate] Failed to get collection tenants:', message);
      return [];
    }
  }

  async upsertDocument(collection: string, data: UpsertDocumentData, dataRequirements?: Record<string, string>): Promise<UpsertDocumentResult> {
    try {
      const { document } = data;
      const { primary, vectors, payload } = document;

      // Build the object to upsert
      const weaviateObject: Record<string, unknown> = {
        class: collection,
        properties: payload || {},
      };

      // Only add tenant if specified (don't set to undefined)
      if (dataRequirements?.tenant) {
        weaviateObject.tenant = dataRequirements.tenant;
      }

      // Handle vectors - check if single or multiple (only dense vectors supported)
      if (vectors && Object.keys(vectors).length > 0) {
        const vectorKeys = Object.keys(vectors);
        const denseVectors: Record<string, number[]> = {};

        // Extract only dense vectors
        for (const [key, vec] of Object.entries(vectors)) {
          if (vec.vectorType === 'dense') {
            denseVectors[key] = vec.value.data;
          }
        }

        if (Object.keys(denseVectors).length === 0) {
          return { success: false, error: 'At least one dense vector is required for Weaviate' };
        }

        if (Object.keys(denseVectors).length === 1 && vectorKeys[0] === COLLECTION_DEFAULT_VECTOR) {
          // Single vector mode - use 'vector' field
          weaviateObject.vector = denseVectors[COLLECTION_DEFAULT_VECTOR];
        } else {
          // Multiple named vectors mode - use 'vectors' field
          weaviateObject.vectors = denseVectors;
        }
      }

      let resultId: string;

      if (primary && primary.value) {
        // Update existing object
        weaviateObject.id = primary.value;
        await this.client.put(`/v1/objects/${collection}/${primary.value}`, weaviateObject);
        resultId = String(primary.value);
        console.log(`[Weaviate] Updated object: ${primary.value}`);
      } else {
        // Create new object (Weaviate will generate UUID)
        const response = await this.client.post('/v1/objects', weaviateObject);
        resultId = response.data.id;
        console.log(`[Weaviate] Created object: ${resultId}`);
      }

      return {
        success: true,
        document: { primary: { name: 'id', value: resultId }, ...payload }
      };
    } catch (error: any) {
      console.error('[Weaviate] Upsert error:', error);
      const message = error?.response?.data?.error?.[0]?.message ||
        (error instanceof Error ? error.message : 'Failed to upsert document');
      return { success: false, error: message };
    }
  }

  async getDocuments(collection: string, options?: GetDocumentsOptions): Promise<GetDocumentsResult> {
    try {
      const limit = options?.limit || 50;
      const offset = typeof options?.offset === 'number' ? options.offset : 0;

      // Get class properties from schema
      const schemaResponse = await this.client.get('/v1/schema');
      const classSchema = schemaResponse.data.classes?.find(
        (c: { class: string }) => c.class === collection,
      );
      const properties = classSchema?.properties?.map((p: { name: string }) => p.name) || [];
      let vectorKeys = ['vector'];
      if (classSchema?.vectorConfig) {
        vectorKeys = Object.keys(classSchema.vectorConfig);
      }
      // Build query parameters array for cleaner construction
      const queryParams: string[] = [];

      if (options?.dataRequirements?.tenant) {
        queryParams.push(`tenant: "${options.dataRequirements.tenant}"`);
      }

      queryParams.push(`limit: ${limit}`);
      queryParams.push(`offset: ${offset}`);

      // Build where clause only if filters exist
      if (options?.filter) {
        queryParams.push(`where: ${this.buildWeaviateWhere(options.filter)}`);
      }

      // Build sort clause for Weaviate (supports sorting by primitive properties)
      if (options?.sort && options.sort.length > 0) {
        // Weaviate supports sorting by multiple properties
        const sortFields = options.sort.map(sort => {
          // Weaviate primary key is always 'id' and is sortable
          // Also allow sorting by properties in the schema
          if (sort.field === 'id' || properties.find((p: string) => p === sort.field)) {
            return `{path: ["${sort.field}"], order: ${sort.order === 'asc' ? 'asc' : 'desc'}}`;
          }
          // For other fields (like 'score'), try to sort anyway - might be a computed field
          // If it fails, the error will be caught and returned
          return `{path: ["${sort.field}"], order: ${sort.order === 'asc' ? 'asc' : 'desc'}}`;
        });
        queryParams.push(`sort: [${sortFields.join(', ')}]`);
      }

      // Build properties query - filter out any undefined/null values
      const validProperties = properties.filter((p: string) => p && typeof p === 'string');
      const propertiesQuery = validProperties.length > 0 ? validProperties.join('\n            ') : '';

      // Build the query - ensure proper formatting even with no properties
      const query = `{
        Get {
          ${collection}(
            ${queryParams.join('\n            ')}
          ) {
            ${propertiesQuery ? propertiesQuery + '\n            ' : ''}_additional {
              id
              ${vectorKeys.length > 1 ? `vectors { ${vectorKeys.join(' ')} }` : 'vector'}
            }
          }
        }
      }`;

      const response = await this.client.post('/v1/graphql', { query });

      if (response.data.errors) {
        const errorMessage = response.data.errors.map((e: any) => e.message).join('; ');
        console.error('[Weaviate] getDocuments GraphQL errors:', response.data.errors);
        return { success: false, error: `GraphQL error: ${errorMessage}` };
      }

      const records = response.data.data?.Get?.[collection] || [];
      const documents: Document[] = records.map((obj: any) => this.recordToDocument(obj));

      return {
        success: true,
        documents,
        nextOffset: documents.length >= limit ? offset + limit : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch documents';
      return { success: false, error: message };
    }
  }

  async search(collection: string, vectors: Record<string, DenseDocumentVector>, options?: SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();
    try {
      let denseVector: number[] | undefined;
      let vectorKey: string | undefined;
      for (const [key, vectorData] of Object.entries(vectors)) {
        if (
          vectorData.vectorType === 'dense' &&
          'data' in vectorData.value &&
          Array.isArray(vectorData.value.data)
        ) {
          denseVector = vectorData.value.data;
          vectorKey = key !== COLLECTION_DEFAULT_VECTOR ? vectorData.key : undefined;
          break;
        }
      }

      const schema = await this.client.get('/v1/schema');
      const classSchema = schema.data.classes?.find((c: { class: string }) => c.class === collection);
      let vectorKeys = ['vector'];
      if (classSchema?.vectorConfig) {
        vectorKeys = Object.keys(classSchema.vectorConfig);
      }
      const propertyNames = classSchema?.properties?.map((p: { name: string }) => p.name) || [];
      const propertiesQuery = propertyNames.length > 0 ? propertyNames.join('\n              ') : '';

      const whereClause = options?.filter ? this.buildWeaviateWhere(options.filter) : '';
      const dataRequirementsClause = options?.dataRequirements ? `tenant: "${options.dataRequirements.tenant}"` : '';

      // Weaviate uses certainty (0-1) for similarity threshold
      const certaintyClause = options?.scoreThreshold !== undefined
        ? `\n                certainty: ${options.scoreThreshold}`
        : '';

      const limit = options?.limit || 10;

      // When lexicalQuery is provided, use Weaviate hybrid search (BM25 + vector)
      const useHybrid = Boolean(options?.lexicalQuery?.trim());
      const alpha = options?.hybridAlpha ?? 0.75;
      let searchClause: string;

      if (useHybrid) {
        // Hybrid: query = BM25 text, alpha = balance (0 = keyword, 1 = vector, 0.5 = equal)
        // When user provides both keywords and a vector, pass the vector so Weaviate uses it for the vector
        // component (required when vectorizer is "none"; otherwise Weaviate vectorizes the query).
        const escapedQuery = options!.lexicalQuery!.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
        const hybridVector =
          denseVector && denseVector.length > 0
            ? `\n                vector: [${denseVector.join(',')}]${vectorKey ? `\n                targetVectors: ["${vectorKey}"]` : ''}`
            : '';
        searchClause = `hybrid: {
                query: "${escapedQuery}"
                alpha: ${Math.max(0, Math.min(1, alpha))}${hybridVector}
              }`;
      } else {
        // Pure vector search — require a vector
        if (!denseVector || denseVector.length === 0) {
          return { success: false, error: 'A query vector is required for vector search. Paste a vector or use Generate embedding.' };
        }
        const nearVectorClause = `nearVector: {
                vector: [${denseVector.join(',')}]${vectorKey ? `\n                targetVectors: ["${vectorKey}"]` : ''}${certaintyClause}
              }`;
        searchClause = nearVectorClause;
      }

      const response = await this.client.post('/v1/graphql', {
        query: `{
          Get {
            ${collection}(
              ${dataRequirementsClause}
              ${searchClause}
              limit: ${limit}
              ${whereClause ? `where: ${whereClause}` : ''}
            ) {
              ${propertiesQuery}
              _additional {
                id
                distance
                certainty
                ${useHybrid ? 'score' : ''}
                ${vectorKeys.length > 1 ? `vectors { ${vectorKeys.join(' ')} }` : 'vector'}
              }
            }
          }
        }`,
      });

      const searchTimeMs = performance.now() - startTime;

      const data = response.data.data?.Get?.[collection] || [];
      const results = data.map((result: any) => {
        const weaviateDoc = this.recordToDocument(result);
        return weaviateDoc;
      });

      const metadata = {
        searchTimeMs,
      };

      return { success: true, documents: results, metadata };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { success: false, error: message };
    }
  }

  async deleteDocument(collection: string, primary: Document['primary'], dataRequirements?: Record<string, string>): Promise<DeleteDocumentResult> {
    try {
      let url = `/v1/objects/${collection}/${primary.value}`;
      if (dataRequirements) {
        url += `?tenant=${dataRequirements.tenant}`;
      }
      await this.client.delete(url);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      return { success: false, error: message };
    }
  }

  async deleteDocuments(collection: string, filter: FilterQuery, dataRequirements?: Record<string, string>): Promise<DeleteDocumentsResult> {
    try {
      const queryContext = this.buildQueryContext(filter, dataRequirements);

      // Get initial count
      const count = await this.getDocumentCount(collection, queryContext);
      if (count === 0) {
        return { success: true, deletedCount: 0 };
      }

      // Delete documents in batches
      const deletedCount = await this.deleteDocumentsInBatches(collection, queryContext, dataRequirements, count);

      return { success: true, deletedCount };
    } catch (error) {
      console.error('[Weaviate] Bulk delete error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete documents';
      return { success: false, error: message };
    }
  }

  /**
   * Build query context (where clause and data requirements) for GraphQL queries
   */
  private buildQueryContext(filter: FilterQuery, dataRequirements?: Record<string, string>) {
    const hasFilter = filter.conditions && filter.conditions.length > 0;
    const whereClause = hasFilter ? this.buildWeaviateWhere(filter) : '';
    const dataRequirementsClause = dataRequirements ? `tenant: "${dataRequirements.tenant}"` : '';

    return { hasFilter, whereClause, dataRequirementsClause };
  }

  /**
   * Get document count using Aggregate query
   */
  private async getDocumentCount(collection: string, context: { hasFilter: boolean; whereClause: string; dataRequirementsClause: string }): Promise<number> {
    const queryParts: string[] = [];
    if (context.dataRequirementsClause) {
      queryParts.push(context.dataRequirementsClause);
    }
    if (context.hasFilter && context.whereClause) {
      queryParts.push(`where: ${context.whereClause}`);
    }

    const countQuery = queryParts.length > 0
      ? `{ Aggregate { ${collection}(
        ${queryParts.join('\n        ')}
      ) { meta { count } } } }`
      : `{ Aggregate { ${collection} {
        meta { count }
      } } }`;

    const response = await this.client.post('/v1/graphql', { query: countQuery });
    return response.data.data?.Aggregate?.[collection]?.[0]?.meta?.count || 0;
  }

  /**
   * Build Get query to fetch object IDs
   */
  private buildGetIdsQuery(collection: string, context: { hasFilter: boolean; whereClause: string; dataRequirementsClause: string }, limit: number): string {
    const queryParts: string[] = [];
    if (context.dataRequirementsClause) {
      queryParts.push(context.dataRequirementsClause);
    }
    if (context.hasFilter && context.whereClause) {
      queryParts.push(`where: ${context.whereClause}`);
    }
    queryParts.push(`limit: ${limit}`);

    return `{ Get { ${collection}(
      ${queryParts.join('\n      ')}
    ) { _additional { id } } } }`;
  }

  /**
   * Delete documents in batches, handling Weaviate's tombstoning behavior
   */
  private async deleteDocumentsInBatches(
    collection: string,
    context: { hasFilter: boolean; whereClause: string; dataRequirementsClause: string },
    dataRequirements: Record<string, string> | undefined,
    expectedCount: number
  ): Promise<number> {
    const BATCH_SIZE = 1000;
    const deletedIds = new Set<string>();
    let deletedCount = 0;
    let consecutiveEmptyBatches = 0;

    while (true) {
      // Fetch batch of object IDs
      const getQuery = this.buildGetIdsQuery(collection, context, BATCH_SIZE);
      const response = await this.client.post('/v1/graphql', { query: getQuery });
      const objects = response.data.data?.Get?.[collection] || [];

      if (objects.length === 0) {
        break; // No more objects to fetch
      }

      // Filter out already deleted IDs
      const idsToDelete = objects
        .map((obj: any) => obj._additional?.id)
        .filter((id: string) => id && !deletedIds.has(id));

      // If all objects in this batch were already deleted, check if we should continue
      if (idsToDelete.length === 0) {
        consecutiveEmptyBatches++;
        // Stop if we've seen multiple empty batches or got fewer than batch size
        if (consecutiveEmptyBatches >= 2 || objects.length < BATCH_SIZE) {
          break;
        }
        continue;
      }

      // Reset counter and delete the new IDs
      consecutiveEmptyBatches = 0;
      deletedCount += await this.deleteObjectIds(collection, idsToDelete, deletedIds, dataRequirements);

      // Stop if we got fewer than batch size and deleted everything
      if (objects.length < BATCH_SIZE && idsToDelete.length === objects.length) {
        break;
      }
    }

    return deletedCount;
  }

  /**
   * Delete a list of object IDs and track them
   */
  private async deleteObjectIds(
    collection: string,
    ids: string[],
    deletedIds: Set<string>,
    dataRequirements?: Record<string, string>
  ): Promise<number> {
    let deleted = 0;

    for (const id of ids) {
      try {
        await this.deleteDocument(collection, { name: 'id', value: id }, dataRequirements);
        deletedIds.add(id);
        deleted++;
      } catch (error) {
        console.error(`[Weaviate] Failed to delete object ${id}:`, error);
      }
    }

    return deleted;
  }

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    try {
      await this.client.delete(`/v1/schema/${collection}`);
      return { success: true };
    } catch (error) {
      console.error('[Weaviate] Drop collection error:', error);
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
      console.error('[Weaviate] Truncate collection error:', error);
      const message = error instanceof Error ? error.message : 'Failed to truncate collection';
      return { success: false, error: message };
    }
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    try {
      const className = config.class as string;
      const vectorizer = config.vectorizer as string || 'none';
      const vectorConfigType = config.vectorConfigType as string || 'single';

      // Build class schema
      const classSchema: any = {
        class: className,
      };
      if (config.description) {
        classSchema.description = config.description;
      }

      // Properties
      const properties = config.properties as Array<{
        name: string;
        dataType: string;
        description?: string;
        indexSearchable?: boolean;
        indexFilterable?: boolean;
      }>;

      if (properties && properties.length > 0) {
        classSchema.properties = properties.map(prop => {
          const propSchema: any = {
            name: prop.name,
            dataType: [prop.dataType],
            indexSearchable: prop.indexSearchable ?? true,
            indexFilterable: prop.indexFilterable ?? true,
          };
          if (prop.description) {
            propSchema.description = prop.description;
          }
          return propSchema;
        });
      }

      // Vector configuration
      if (vectorConfigType === 'named') {
        // Named vectors configuration - NO class-level vectorizer or vectorIndexType
        const namedVectors = config.namedVectors as Array<{ name: string; vectorizer: string }>;
        if (namedVectors && namedVectors.length > 0) {
          classSchema.vectorConfig = {};
          for (const vec of namedVectors) {
            classSchema.vectorConfig[vec.name] = {
              vectorIndexType: 'hnsw',
              vectorizer: {
                [vec.vectorizer === 'none' ? 'none' : vec.vectorizer]: {},
              },
            };
          }
        }
      } else {
        // Single vector configuration - set class-level vectorizer and index
        classSchema.vectorizer = vectorizer === 'none' ? 'none' : vectorizer;

        const vectorIndexType = config.vectorIndexType as string || 'hnsw';
        const distance = config.distance as string || 'cosine';

        classSchema.vectorIndexType = vectorIndexType;

        if (vectorIndexType === 'hnsw') {
          const vectorIndexConfig: any = { distance };
          if (config.ef !== undefined && config.ef !== -1) {
            vectorIndexConfig.ef = config.ef;
          }
          if (config.efConstruction) {
            vectorIndexConfig.efConstruction = config.efConstruction;
          }
          if (config.maxConnections) {
            vectorIndexConfig.maxConnections = config.maxConnections;
          }
          classSchema.vectorIndexConfig = vectorIndexConfig;
        }
      }

      // Inverted index configuration
      if (config.bm25_b !== undefined || config.bm25_k1 !== undefined ||
        config.indexTimestamps || config.indexNullState || config.indexPropertyLength) {
        const invertedIndexConfig: any = {
          bm25: {
            b: config.bm25_b ?? 0.75,
            k1: config.bm25_k1 ?? 1.2,
          },
          indexTimestamps: config.indexTimestamps ?? false,
          indexNullState: config.indexNullState ?? false,
          indexPropertyLength: config.indexPropertyLength ?? false,
        };
        if (config.stopwords_preset && config.stopwords_preset !== 'none') {
          invertedIndexConfig.stopwords = { preset: config.stopwords_preset };
        }
        classSchema.invertedIndexConfig = invertedIndexConfig;
      }

      // Replication
      if (config.replicationFactor && (config.replicationFactor as number) > 1) {
        classSchema.replicationConfig = {
          factor: config.replicationFactor,
        };
      }

      // Multi-tenancy
      if (config.multiTenancyEnabled) {
        classSchema.multiTenancyConfig = {
          enabled: true,
        };
      }

      // Module config (for vectorizer settings)
      if (vectorizer !== 'none' && config.vectorizerModel) {
        classSchema.moduleConfig = {
          [vectorizer]: {
            model: config.vectorizerModel,
          },
        };
      }

      await this.client.post('/v1/schema', classSchema);

      console.log(`[Weaviate] Created class: ${className}`);
      return { success: true };
    } catch (error: any) {
      console.error('[Weaviate] Create collection error:', error);
      const message = error?.response?.data?.error?.[0]?.message ||
        (error instanceof Error ? error.message : 'Failed to create class');
      return { success: false, error: message };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return weaviateCreateCollectionSchema;
  }

  private recordToDocument(result: any): Document {
    const document: Document = {
      primary: { name: 'id', value: result._additional?.id || '' },
      vectors: {},
      payload: {},
    };

    if (result._additional?.vector) {
      document.vectors[COLLECTION_DEFAULT_VECTOR] = {
        key: COLLECTION_DEFAULT_VECTOR,
        vectorType: 'dense',
        size: result._additional.vector.length,
        value: { data: result._additional.vector },
      };
    } else if (result._additional?.vectors) {
      Object.entries(result._additional?.vectors).forEach(([key, value]: any) => {
        document.vectors[key] = {
          key,
          vectorType: 'dense',
          size: value.length,
          value: { data: value },
        };
      });
    }

    // Hybrid returns score; nearVector returns certainty/distance
    const score = result._additional?.score ?? result._additional?.certainty ?? (result._additional?.distance != null ? (1 - result._additional.distance) : undefined);
    if (score != null) {
      document.score = Number(score);
    }

    // Spread all properties (everything except _additional)
    Object.entries(result).forEach(([key, value]) => {
      if (key !== '_additional') {
        document.payload[key] = value;
      }
    });

    return document;
  }

  private buildWeaviateWhere(filter: { conditions: Array<{ field: string; operator: string; value: string | number | boolean; valueType: string }>; logic: string }): string {
    if (!filter.conditions || filter.conditions.length === 0) return '';

    const conditions = filter.conditions.map(cond => {
      const path = `["${cond.field}"]`;
      let operator = '';
      let valueStr = '';

      switch (cond.operator) {
        case 'eq':
          operator = 'Equal';
          break;
        case 'neq':
          operator = 'NotEqual';
          break;
        case 'gt':
          operator = 'GreaterThan';
          break;
        case 'gte':
          operator = 'GreaterThanEqual';
          break;
        case 'lt':
          operator = 'LessThan';
          break;
        case 'lte':
          operator = 'LessThanEqual';
          break;
        case 'contains':
          operator = 'Like';
          valueStr = `"*${cond.value}*"`;
          break;
        case 'starts_with':
          operator = 'Like';
          valueStr = `"${cond.value}*"`;
          break;
        default:
          operator = 'Equal';
      }

      if (!valueStr) {
        if (cond.valueType === 'number') {
          valueStr = String(cond.value);
        } else if (cond.valueType === 'boolean') {
          valueStr = String(cond.value);
        } else {
          valueStr = `"${cond.value}"`;
        }
      }

      const valueKey = cond.valueType === 'number' ? 'valueNumber' :
        cond.valueType === 'boolean' ? 'valueBoolean' : 'valueText';

      return `{ path: ${path}, operator: ${operator}, ${valueKey}: ${valueStr} }`;
    });

    if (filter.conditions.length === 1) {
      return conditions[0];
    }

    const logic = filter.logic === 'or' ? 'Or' : 'And';
    return `{ operator: ${logic}, operands: [${conditions.join(', ')}] }`;
  }
}
