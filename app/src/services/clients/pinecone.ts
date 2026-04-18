import { Pinecone } from '@pinecone-database/pinecone';
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
  CollectionSchema,
  SearchCapabilities,
} from '../../types';
import { DynamicFormSchema } from '../../components/DynamicForm/types';
import { mergeWithDefault } from '../searchCapabilities';
import { sortDocuments } from '../documentUtils';

// ============================================
// Pinecone Constants
// ============================================

export const PINECONE_DISTANCE_METRICS = [
  { label: 'Cosine', value: 'cosine', description: 'Best for normalized vectors' },
  { label: 'Euclidean', value: 'euclidean', description: 'L2 distance' },
  { label: 'Dot Product', value: 'dotproduct', description: 'For non-normalized vectors' },
] as const;

export const PINECONE_DEFAULTS = {
  dimension: 1536,
  distance: 'cosine',
} as const;

// ============================================
// Pinecone Create Index Schema
// ============================================

export const pineconeCreateIndexSchema: DynamicFormSchema = {
  title: 'Create Pinecone Index',
  description: 'Configure your new vector index in Pinecone',
  sections: [
    {
      key: 'general',
      title: 'General',
      description: 'Basic index settings',
      items: [
        {
          key: 'name',
          label: 'Index Name',
          type: 'text',
          required: true,
          placeholder: 'my-index',
          description: 'Unique name for your index (lowercase, alphanumeric, hyphens)',
          rules: [
            { type: 'minLength', value: 1, message: 'Index name is required' },
            {
              type: 'pattern',
              value: '^[a-z0-9-]+$',
              message: 'Must be lowercase, alphanumeric with hyphens only',
            },
          ],
        },
        {
          key: 'dimension',
          label: 'Vector Dimension',
          type: 'number',
          required: true,
          defaultValue: PINECONE_DEFAULTS.dimension,
          min: 1,
          max: 20000,
          description: 'Dimension of vectors to be stored',
        },
      ],
    },
    {
      key: 'indexing',
      title: 'Index Configuration',
      description: 'Configure index type and distance metric',
      items: [
        {
          key: 'metric',
          label: 'Distance Metric',
          type: 'select',
          defaultValue: PINECONE_DEFAULTS.distance,
          options: [...PINECONE_DISTANCE_METRICS],
        },
        {
          key: 'spec',
          label: 'Index Type',
          type: 'radio',
          direction: 'vertical',
          defaultValue: 'serverless',
          options: [
            {
              label: 'Serverless',
              value: 'serverless',
              description: 'Fully managed, pay-as-you-go (recommended)',
            },
            { label: 'Pod-based', value: 'pod', description: 'Dedicated pods with fixed capacity' },
          ],
        },
      ],
    },
    {
      key: 'serverless',
      title: 'Serverless Configuration',
      description: 'Configure serverless index settings',
      showWhen: { field: 'spec', operator: 'equals', value: 'serverless' },
      items: [
        {
          key: 'cloud',
          label: 'Cloud Provider',
          type: 'select',
          defaultValue: 'aws',
          options: [
            { label: 'AWS', value: 'aws' },
            { label: 'GCP', value: 'gcp' },
            { label: 'Azure', value: 'azure' },
          ],
        },
        {
          key: 'region',
          label: 'Region',
          type: 'text',
          defaultValue: 'us-east-1',
          placeholder: 'us-east-1',
          description: 'AWS/GCP/Azure region (e.g., us-east-1, us-west1)',
        },
      ],
    },
    {
      key: 'pod',
      title: 'Pod Configuration',
      description: 'Configure pod-based index settings',
      showWhen: { field: 'spec', operator: 'equals', value: 'pod' },
      items: [
        {
          key: 'podType',
          label: 'Pod Type',
          type: 'select',
          defaultValue: 's1.x1',
          options: [
            { label: 's1.x1', value: 's1.x1', description: '1GB RAM, 1 vCPU' },
            { label: 's1.x2', value: 's1.x2', description: '2GB RAM, 2 vCPU' },
            { label: 'p1.x1', value: 'p1.x1', description: '4GB RAM, 1 vCPU' },
            { label: 'p1.x2', value: 'p1.x2', description: '8GB RAM, 2 vCPU' },
            { label: 'p1.x4', value: 'p1.x4', description: '16GB RAM, 4 vCPU' },
            { label: 'p2.x1', value: 'p2.x1', description: '8GB RAM, 1 vCPU' },
            { label: 'p2.x2', value: 'p2.x2', description: '16GB RAM, 2 vCPU' },
            { label: 'p2.x4', value: 'p2.x4', description: '32GB RAM, 4 vCPU' },
          ],
        },
        {
          key: 'pods',
          label: 'Number of Pods',
          type: 'number',
          defaultValue: 1,
          min: 1,
          max: 10,
          description: 'Number of pods for replication',
        },
        {
          key: 'replicas',
          label: 'Replicas',
          type: 'number',
          defaultValue: 1,
          min: 1,
          max: 10,
          description: 'Number of replicas per pod',
        },
        {
          key: 'podRegion',
          label: 'Region',
          type: 'text',
          defaultValue: 'us-east-1',
          placeholder: 'us-east-1',
          description: 'AWS/GCP/Azure region',
        },
      ],
    },
  ],
  showSubmit: true,
  showCancel: true,
  submitText: 'Create Index',
};

/**
 * Pinecone Client Implementation
 *
 * Mapping between Pinecone and our application:
 * - Our "Collection" = Pinecone "Index" (top-level container)
 * - Our "dataRequirements.namespace" = Pinecone "Namespace" (logical partition within index)
 *
 * Example:
 * - Collection: "product_index" → Pinecone Index: "product_index"
 * - Namespace: "electronics" → Pinecone Namespace: "electronics"
 *
 * Note: Pinecone doesn't have a "database" concept - only indexes and namespaces.
 */
export class PineconeClient implements VectorDBClient {
  private client: Pinecone;
  private indexCache: Map<string, ReturnType<Pinecone['index']>> = new Map();

  constructor(config: ConnectionConfig) {
    if (!config.apiKey) {
      throw new Error('Pinecone API key is required');
    }

    this.client = new Pinecone({
      apiKey: config.apiKey,
    });

    log.info('[Pinecone] Initialized client');
  }

  private getIndex(indexName: string) {
    // Cache index instances
    if (!this.indexCache.has(indexName)) {
      this.indexCache.set(indexName, this.client.index(indexName));
    }
    return this.indexCache.get(indexName)!;
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      // Test connection by listing indexes
      const indexes = await this.client.listIndexes();
      return {
        success: true,
        version: 'pinecone-sdk',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Get all collections (Pinecone indexes)
   * In Pinecone: indexes are the top-level containers (our "collections")
   */
  async getCollections(): Promise<GetCollectionsResult> {
    try {
      const indexesResponse = await this.client.listIndexes();
      const indexes = indexesResponse.indexes || [];

      // Get counts for each index
      const collections = await Promise.all(
        indexes.map(async (index: { name: string; dimension?: number; metric?: string }) => {
          let count = 0;
          try {
            const info = await this.getCollectionInfo(index.name);
            if (info.success && info.data) {
              count = (info.data.count as number) || 0;
            }
          } catch {
            // Ignore count errors
          }

          return {
            name: index.name,
            count,
            dimension: index.dimension,
            metric: index.metric,
          } as Collection;
        }),
      );

      return { success: true, collections };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch indexes';
      return { success: false, error: message };
    }
  }

  /**
   * Get collection info (Pinecone index info)
   * @param collection - Pinecone index name
   */
  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    try {
      const indexDescription = await this.client.describeIndex(collection);
      const index = this.getIndex(collection);
      const stats = await index.describeIndexStats();

      let totalCount = 0;
      const namespaces: string[] = [];
      if (stats.namespaces) {
        Object.entries(stats.namespaces).forEach(([ns, data]) => {
          totalCount += data.recordCount || 0;
          namespaces.push(ns);
        });
      }

      return {
        success: true,
        data: {
          ...indexDescription,
          count: totalCount,
          namespaces,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch index info';
      return { success: false, error: message };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    try {
      const indexInfo = await this.getCollectionInfo(collection);
      if (!indexInfo.success || !indexInfo.data) {
        return { success: false, error: 'Failed to get index info' };
      }

      const dimension = indexInfo.data.dimension as number;
      const index = this.getIndex(collection);

      // Get namespaces from index stats
      const stats = await index.describeIndexStats();
      // Get all namespace names (empty string represents default namespace)
      const namespaces = stats.namespaces ? Object.keys(stats.namespaces) : [];

      // Get a sample document to infer schema from the first available namespace
      let sampleDoc: Document | null = null;
      if (namespaces.length > 0) {
        const firstNamespace = namespaces[0];
        // Generate a random normalized vector to query (better than zero vector)
        const randomVector = Array.from({ length: dimension }, () => (Math.random() - 0.5) * 2);
        const norm = Math.sqrt(randomVector.reduce((sum, val) => sum + val * val, 0));
        const normalizedVector = norm > 0 ? randomVector.map((val) => val / norm) : randomVector;

        // Use namespace if provided, otherwise use default (empty string)
        const ns = firstNamespace || '';
        const queryResponse = await index.namespace(ns).query({
          topK: 1,
          vector: normalizedVector,
        });

        const matches = queryResponse.matches || [];
        if (matches.length > 0) {
          sampleDoc = this.matchToDocument(matches[0]);
        }
      }

      const fields: Record<string, SchemaField> = {};
      if (sampleDoc) {
        Object.entries(sampleDoc.payload).forEach(([key, value]) => {
          let type: SchemaField['type'] = 'unknown';
          if (typeof value === 'string') type = 'string';
          else if (typeof value === 'number') type = 'number';
          else if (typeof value === 'boolean') type = 'boolean';
          else if (Array.isArray(value)) type = 'array';
          else if (value && typeof value === 'object') type = 'object';

          // Pinecone doesn't support text search, so fields are not searchable
          fields[key] = {
            name: key,
            type,
            searchable: false,
          };
        });
      }

      const vectors: Record<string, VectorSchemaField> = {
        [COLLECTION_DEFAULT_VECTOR]: {
          name: COLLECTION_DEFAULT_VECTOR,
          type: 'vector',
          vectorType: 'dense',
          size: dimension,
          distance: indexInfo.data.metric as string,
        },
      };

      // Check if sample document has sparse vector
      if (sampleDoc && sampleDoc.vectors && sampleDoc.vectors['sparse']) {
        vectors['sparse'] = {
          name: 'sparse',
          type: 'vector',
          vectorType: 'sparse',
        };
      }

      // Always include namespaces in dataRequirements if they exist
      // Convert empty string (default namespace) to "__default__" for UI display
      const namespaceValues = namespaces.map((ns) => (ns === '' ? '__default__' : ns));
      const dataRequirements =
        namespaces.length > 0
          ? {
              namespace: {
                key: 'namespace',
                value: namespaceValues,
              },
            }
          : undefined;

      return {
        success: true,
        schema: {
          primary: { name: 'id', type: 'string' },
          fields,
          vectors,
          multipleVectors: false, // Pinecone v2+ supports sparse vectors but we focus on dense
          hasVectors: true,
          dataRequirements,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get schema';
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

  /**
   * Upsert document into Pinecone
   * @param collection - Pinecone index name (our "collection")
   * @param data - Document data
   * @param dataRequirements - Optional namespace (Pinecone namespace for data isolation)
   */
  async upsertDocument(
    collection: string,
    data: UpsertDocumentData,
    dataRequirements?: Record<string, string>,
  ): Promise<UpsertDocumentResult> {
    try {
      const { document } = data;
      const { primary, vectors, payload } = document;

      if (!primary?.value) {
        return { success: false, error: 'Document ID is required' };
      }

      if (!vectors || Object.keys(vectors).length === 0) {
        return { success: false, error: 'At least one vector is required' };
      }

      const index = this.getIndex(collection);
      // Convert "__default__" back to empty string for Pinecone API
      const namespace =
        dataRequirements?.namespace === '__default__' ? '' : dataRequirements?.namespace || '';

      // Extract dense and sparse vectors
      let denseVector: number[] | undefined;
      let sparseVector: { indices: number[]; values: number[] } | undefined;

      for (const [key, vectorData] of Object.entries(vectors)) {
        if (vectorData.vectorType === 'dense') {
          denseVector = vectorData.value.data;
        } else if (vectorData.vectorType === 'sparse') {
          sparseVector = vectorData.value;
        }
      }

      if (!denseVector) {
        return { success: false, error: 'Dense vector is required for Pinecone' };
      }

      // Pinecone metadata supports string, number, boolean, array
      const metadata: Record<string, any> = {};
      if (payload) {
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            ) {
              metadata[key] = value;
            } else if (Array.isArray(value)) {
              metadata[key] = value;
            } else {
              metadata[key] = String(value);
            }
          }
        });
      }

      // Use namespace if provided, otherwise use default (empty string)
      const ns = namespace || '';
      const upsertData: any = {
        id: String(primary.value),
        values: denseVector,
        metadata,
      };

      // Add sparse vector if provided
      if (sparseVector) {
        upsertData.sparseValues = sparseVector;
      }

      await index.namespace(ns).upsert([upsertData]);

      return {
        success: true,
        document: { primary, ...payload },
      };
    } catch (error: any) {
      console.error('[Pinecone] Upsert error:', error);
      const message =
        error?.message || (error instanceof Error ? error.message : 'Failed to upsert document');
      return { success: false, error: message };
    }
  }

  async getDocuments(
    collection: string,
    options?: GetDocumentsOptions,
  ): Promise<GetDocumentsResult> {
    try {
      const limit = options?.limit || 50;
      // Convert "__default__" back to empty string for Pinecone API
      const namespace =
        options?.dataRequirements?.namespace === '__default__'
          ? ''
          : options?.dataRequirements?.namespace || '';
      const index = this.getIndex(collection);

      // Use namespace if provided, otherwise use default (empty string)
      const ns = namespace || '';
      const namespaceIndex = index.namespace(ns);

      let documents: Document[] = [];
      let nextOffset: string | number | null = null;

      try {
        // Use listPaginated to get IDs (only supported for serverless indexes)
        // If offset is provided and it's a string, treat it as paginationToken
        // If offset is a number, it means we're paginating through IDs we already fetched
        const numericOffset = typeof options?.offset === 'number' ? options.offset : 0;
        const paginationToken = typeof options?.offset === 'string' ? options.offset : undefined;

        const listResponse = await namespaceIndex.listPaginated({
          prefix: '', // Empty prefix lists all IDs
          paginationToken,
        });

        const listItems = listResponse.vectors || [];
        // Extract IDs from list items (ListItem has an 'id' property or is a string)
        const allIds = listItems
          .map((item: any) => (typeof item === 'string' ? item : item.id))
          .filter(Boolean);

        // Check if there are more items available from Pinecone's pagination
        const hasPineconePagination = !!listResponse.pagination?.next;

        // Calculate which IDs to fetch based on offset
        const startIdx = numericOffset;
        const endIdx = startIdx + limit;
        const idsToFetch = allIds.slice(startIdx, endIdx);
        const hasMoreIds = endIdx < allIds.length;

        // If we have IDs, fetch the actual records
        if (idsToFetch.length > 0) {
          // Fetch records in batches (Pinecone fetch has limits)
          const batchSize = 100; // Pinecone typically allows up to 100 IDs per fetch

          for (let i = 0; i < idsToFetch.length; i += batchSize) {
            const batch = idsToFetch.slice(i, i + batchSize);
            const fetchResponse = await namespaceIndex.fetch(batch);
            const records = fetchResponse.records || {};

            // Convert fetched records to documents
            Object.entries(records).forEach(([id, record]: [string, any]) => {
              const vectors: Record<string, DocumentVector> = {};

              // Add dense vector
              if (record.values && record.values.length > 0) {
                vectors[COLLECTION_DEFAULT_VECTOR] = {
                  key: COLLECTION_DEFAULT_VECTOR,
                  vectorType: 'dense',
                  size: record.values.length,
                  value: {
                    data: record.values,
                  },
                };
              }

              // Add sparse vector if present
              if (
                record.sparseValues &&
                record.sparseValues.indices &&
                record.sparseValues.values
              ) {
                vectors['sparse'] = {
                  key: 'sparse',
                  vectorType: 'sparse',
                  value: {
                    indices: record.sparseValues.indices,
                    values: record.sparseValues.values,
                  },
                };
              }

              documents.push({
                primary: { name: 'id', value: id },
                vectors,
                payload: record.metadata || {},
              });
            });
          }
        }

        // Determine nextOffset
        // Priority: 1) Pinecone pagination token, 2) More IDs in current batch, 3) None
        if (hasPineconePagination && listResponse.pagination?.next) {
          // Use Pinecone's pagination token (resets offset to 0 for next batch)
          nextOffset = listResponse.pagination.next;
        } else if (hasMoreIds) {
          // We have more IDs in the current batch, use numeric offset
          nextOffset = endIdx;
        } else {
          // No more items available
          nextOffset = null;
        }
      } catch (listError: any) {
        // Fallback for pod-based indexes or if listPaginated is not supported
        // Use query with a random vector (less efficient but works for all index types)
        log.warn(
          '[Pinecone] listPaginated not available, falling back to query method:',
          listError.message,
        );

        const indexInfo = await this.getCollectionInfo(collection);
        if (!indexInfo.success || !indexInfo.data) {
          return { success: false, error: 'Failed to get index info' };
        }
        const dimension = (indexInfo.data.dimension as number) || 1536;

        // Generate a random normalized vector to query
        const randomVector = Array.from({ length: dimension }, () => (Math.random() - 0.5) * 2);
        const norm = Math.sqrt(randomVector.reduce((sum, val) => sum + val * val, 0));
        const normalizedVector = norm > 0 ? randomVector.map((val) => val / norm) : randomVector;

        const queryResponse = await namespaceIndex.query({
          topK: Math.min(limit, 10000), // Pinecone max is 10000
          vector: normalizedVector,
          includeMetadata: true,
          includeValues: true,
        });

        const matches = queryResponse.matches || [];
        documents = matches.map((match: any) => this.matchToDocument(match));
        nextOffset =
          documents.length >= limit
            ? (typeof options?.offset === 'number' ? options.offset : 0) + limit
            : null;
      }

      // Apply filters if provided
      if (options?.filter && options.filter.conditions.length > 0) {
        documents = documents.filter((doc) => {
          return this.matchesFilter(doc.payload || {}, options.filter!);
        });
      }

      // Apply sorting
      let sortedDocs = documents;
      if (options?.sort && options.sort.length > 0) {
        sortedDocs = sortDocuments(documents, options.sort);
      }

      return {
        success: true,
        documents: sortedDocs.slice(0, limit),
        nextOffset,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch documents';
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
      const limit = options?.limit || 10;
      // Convert "__default__" back to empty string for Pinecone API
      const namespace =
        options?.dataRequirements?.namespace === '__default__'
          ? ''
          : options?.dataRequirements?.namespace || '';
      const index = this.getIndex(collection);

      // Build filter for Pinecone metadata
      const filter = options?.filter ? this.buildPineconeFilter(options.filter) : undefined;

      // Extract dense and sparse vectors (use first of each when multiple; deterministic and matches single-vector search)
      let denseVector: number[] | undefined;
      let sparseVector: { indices: number[]; values: number[] } | undefined;

      for (const [, vectorData] of Object.entries(vectors)) {
        if (vectorData.vectorType === 'dense' && denseVector === undefined) {
          denseVector = vectorData.value.data;
        } else if (vectorData.vectorType === 'sparse' && sparseVector === undefined) {
          sparseVector = vectorData.value;
        }
      }

      if (!denseVector) {
        return { success: false, error: 'Dense vector is required for Pinecone search' };
      }

      // Send query vector as float32 copy so it matches Pinecone index precision and isn't mutated.
      // Copying from a document and searching with it then returns consistent results.
      const queryVector = Array.from(new Float32Array(denseVector));

      // Use namespace if provided, otherwise use default (empty string)
      const ns = namespace || '';
      const queryParams: any = {
        topK: limit,
        vector: queryVector,
        includeMetadata: true,
        includeValues: true,
        filter,
      };

      // Add sparse vector if provided (copy so caller data is not mutated)
      if (sparseVector) {
        queryParams.sparseVector = {
          indices: sparseVector.indices.slice(),
          values: Array.from(new Float32Array(sparseVector.values)),
        };
      }

      const queryResponse = await index.namespace(ns).query(queryParams);

      const searchTimeMs = performance.now() - startTime;
      const matches = queryResponse.matches || [];

      // Apply score threshold if provided
      let filteredMatches = matches;
      if (options?.scoreThreshold !== undefined) {
        filteredMatches = matches.filter((match: any) => {
          const score = match.score || 0;
          return score >= options.scoreThreshold!;
        });
      }

      const documents = filteredMatches.map((match: any) => this.matchToDocument(match));

      const metadata = {
        searchTimeMs,
        requestedTopK: limit,
        returnedCount: documents.length,
      };

      return { success: true, documents, metadata };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { success: false, error: message };
    }
  }

  async deleteDocument(
    collection: string,
    primary: Document['primary'],
    dataRequirements?: Record<string, string>,
  ): Promise<DeleteDocumentResult> {
    try {
      const index = this.getIndex(collection);
      // Convert "__default__" back to empty string for Pinecone API
      const namespace =
        dataRequirements?.namespace === '__default__' ? '' : dataRequirements?.namespace || '';

      // Use namespace if provided, otherwise use default (empty string)
      const ns = namespace || '';
      // Pinecone deleteMany accepts ids as an array directly, not wrapped in an object
      await index.namespace(ns).deleteMany([String(primary.value)]);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      return { success: false, error: message };
    }
  }

  async deleteDocuments(
    collection: string,
    filter: FilterQuery,
    dataRequirements?: Record<string, string>,
  ): Promise<DeleteDocumentsResult> {
    try {
      const index = this.getIndex(collection);
      // Convert "__default__" back to empty string for Pinecone API
      const namespace =
        dataRequirements?.namespace === '__default__' ? '' : dataRequirements?.namespace || '';

      // Use namespace if provided, otherwise use default (empty string)
      const ns = namespace || '';
      const namespaceIndex = index.namespace(ns);

      // Pinecone deleteMany with filter may not work reliably, so we'll fetch matching IDs first
      // Get all documents matching the filter
      const allDocs: Document[] = [];
      let offset: string | number | null | undefined = null;

      do {
        const result = await this.getDocuments(collection, {
          filter,
          limit: 1000,
          offset: offset ?? undefined,
          dataRequirements,
        });

        if (!result.success || !result.documents) {
          break;
        }

        allDocs.push(...result.documents);
        offset = result.nextOffset;
      } while (offset !== null);

      if (allDocs.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      // Delete by IDs in batches
      const idsToDelete = allDocs.map((doc) => String(doc.primary.value));
      const batchSize = 1000; // Pinecone allows up to 1000 IDs per deleteMany

      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        await namespaceIndex.deleteMany(batch);
      }

      return { success: true, deletedCount: idsToDelete.length };
    } catch (error) {
      console.error('[Pinecone] Bulk delete error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete documents';
      return { success: false, error: message };
    }
  }

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    try {
      await this.client.deleteIndex(collection);
      this.indexCache.delete(collection); // Clear cache

      // Pinecone deletion is asynchronous, but typically completes quickly (2-5 seconds)
      // Do a quick verification with minimal wait to avoid blocking
      let deleted = false;
      const maxAttempts = 5; // Only wait up to 5 seconds

      for (let attempt = 0; attempt < maxAttempts && !deleted; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          // Check if index still exists by listing all indexes
          const indexes = await this.client.listIndexes();
          const indexExists = indexes.indexes?.some(
            (idx: { name: string }) => idx.name === collection,
          );

          if (!indexExists) {
            deleted = true;
            break;
          }
        } catch (error: any) {
          // If listIndexes fails, try describeIndex as fallback
          try {
            await this.client.describeIndex(collection);
            // If describeIndex succeeds, index still exists - continue waiting
          } catch (describeError: any) {
            // If describeIndex fails, index is likely deleted
            const errorMessage = describeError?.message?.toLowerCase() || '';
            const errorStatus = describeError?.status;

            if (
              errorStatus === 404 ||
              errorMessage.includes('not found') ||
              errorMessage.includes('does not exist') ||
              errorMessage.includes('404')
            ) {
              deleted = true;
              break;
            }
          }
        }
      }

      // Always return success since deleteIndex was called successfully
      // Deletion is in progress even if verification hasn't completed yet
      return { success: true };
    } catch (error: any) {
      // If the index doesn't exist, that's also a success
      const errorMessage = error?.message?.toLowerCase() || '';
      if (
        error?.status === 404 ||
        errorMessage.includes('not found') ||
        errorMessage.includes('does not exist')
      ) {
        this.indexCache.delete(collection); // Clear cache anyway
        return { success: true };
      }

      console.error('[Pinecone] Drop index error:', error);
      const message =
        error?.message || (error instanceof Error ? error.message : 'Failed to drop index');
      return { success: false, error: message };
    }
  }

  async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
    try {
      // Truncate by deleting all vectors in all namespaces
      const index = this.getIndex(collection);
      const stats = await index.describeIndexStats();
      const namespaces = stats.namespaces ? Object.keys(stats.namespaces) : [];

      let totalDeleted = 0;
      for (const namespace of namespaces.length > 0 ? namespaces : ['']) {
        // Use namespace if provided, otherwise use default (empty string)
        const ns = namespace || '';
        await index.namespace(ns).deleteAll();
        totalDeleted += stats.namespaces?.[namespace]?.recordCount || 0;
      }

      // Wait for deletion to propagate (Pinecone deleteAll is asynchronous)
      // Retry checking until collection is empty or timeout
      let attempts = 0;
      const maxAttempts = 15; // Increased to allow more time for propagation
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const verifyStats = await index.describeIndexStats();
          const allEmpty = (
            verifyStats.namespaces ? Object.keys(verifyStats.namespaces) : ['']
          ).every((ns) => {
            const count = verifyStats.namespaces?.[ns]?.recordCount || 0;
            return count === 0;
          });
          if (allEmpty) {
            // Double-check by trying to get documents (more reliable than stats)
            try {
              const testDocs = await this.getDocuments(collection, { limit: 1 });
              if (testDocs.success && (!testDocs.documents || testDocs.documents.length === 0)) {
                break; // Verified empty via getDocuments
              }
            } catch {
              // If getDocuments fails, trust the stats
              break;
            }
          }
        } catch (error) {
          // If describeIndexStats fails, continue waiting
        }
        attempts++;
      }

      return {
        success: true,
        deletedCount: totalDeleted,
      };
    } catch (error) {
      console.error('[Pinecone] Truncate index error:', error);
      const message = error instanceof Error ? error.message : 'Failed to truncate index';
      return { success: false, error: message };
    }
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    try {
      const name = config.name as string;
      const dimension = config.dimension as number;
      const metric = (config.metric as string) || 'cosine';
      const spec = (config.spec as string) || 'serverless';

      const indexConfig: any = {
        name,
        dimension,
        metric,
      };

      if (spec === 'serverless') {
        indexConfig.spec = {
          serverless: {
            cloud: config.cloud || 'aws',
            region: config.region || 'us-east-1',
          },
        };
      } else {
        indexConfig.spec = {
          pod: {
            environment: config.podRegion || 'us-east-1',
            pod_type: config.podType || 's1.x1',
            pods: config.pods || 1,
            replicas: config.replicas || 1,
          },
        };
      }

      await this.client.createIndex(indexConfig);

      // Wait for index to be ready
      let ready = false;
      let attempts = 0;
      while (!ready && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const status = await this.client.describeIndex(name);
          if (status.status?.ready) {
            ready = true;
          }
        } catch {
          // Continue waiting
        }
        attempts++;
      }

      console.log(`[Pinecone] Created index: ${name}`);
      return { success: true };
    } catch (error: any) {
      console.error('[Pinecone] Create index error:', error);
      const message =
        error?.message || (error instanceof Error ? error.message : 'Failed to create index');
      return { success: false, error: message };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return pineconeCreateIndexSchema;
  }

  // Helper methods

  private matchToDocument(match: any): Document {
    const vectors: Record<string, DocumentVector> = {};

    // Add dense vector
    if (match.values && match.values.length > 0) {
      vectors[COLLECTION_DEFAULT_VECTOR] = {
        key: COLLECTION_DEFAULT_VECTOR,
        vectorType: 'dense',
        size: match.values.length,
        value: {
          data: match.values,
        },
      };
    }

    // Add sparse vector if present
    if (match.sparseValues && match.sparseValues.indices && match.sparseValues.values) {
      vectors['sparse'] = {
        key: 'sparse',
        vectorType: 'sparse',
        value: {
          indices: match.sparseValues.indices,
          values: match.sparseValues.values,
        },
      };
    }

    return {
      primary: { name: 'id', value: match.id || '' },
      score: match.score,
      vectors,
      payload: match.metadata || {},
    };
  }

  private buildPineconeFilter(filter: FilterQuery): any {
    if (!filter.conditions || filter.conditions.length === 0) {
      return undefined;
    }

    const conditions = filter.conditions.map((cond) => {
      const field = cond.field;
      const value = cond.value;

      switch (cond.operator) {
        case 'eq':
          return { [field]: { $eq: value } };
        case 'neq':
          return { [field]: { $ne: value } };
        case 'gt':
          return { [field]: { $gt: value } };
        case 'gte':
          return { [field]: { $gte: value } };
        case 'lt':
          return { [field]: { $lt: value } };
        case 'lte':
          return { [field]: { $lte: value } };
        case 'contains':
          return { [field]: { $in: [value] } }; // Approximate contains
        case 'starts_with':
          return { [field]: { $regex: `^${value}` } };
        default:
          return { [field]: { $eq: value } };
      }
    });

    if (conditions.length === 1) {
      return conditions[0];
    }

    // Pinecone uses $and and $or
    const logic = filter.logic === 'or' ? '$or' : '$and';
    return { [logic]: conditions };
  }

  private matchesFilter(metadata: Record<string, any>, filter: FilterQuery): boolean {
    if (!filter.conditions || filter.conditions.length === 0) {
      return true;
    }

    const results = filter.conditions.map((cond) => {
      const fieldValue = metadata[cond.field];
      const filterValue = cond.value;

      switch (cond.operator) {
        case 'eq':
          return fieldValue === filterValue;
        case 'neq':
          return fieldValue !== filterValue;
        case 'gt':
          return (
            typeof fieldValue === 'number' &&
            typeof filterValue === 'number' &&
            fieldValue > filterValue
          );
        case 'gte':
          return (
            typeof fieldValue === 'number' &&
            typeof filterValue === 'number' &&
            fieldValue >= filterValue
          );
        case 'lt':
          return (
            typeof fieldValue === 'number' &&
            typeof filterValue === 'number' &&
            fieldValue < filterValue
          );
        case 'lte':
          return (
            typeof fieldValue === 'number' &&
            typeof filterValue === 'number' &&
            fieldValue <= filterValue
          );
        case 'contains':
          return String(fieldValue).includes(String(filterValue));
        case 'starts_with':
          return String(fieldValue).startsWith(String(filterValue));
        default:
          return fieldValue === filterValue;
      }
    });

    if (filter.logic === 'or') {
      return results.some((r) => r);
    } else {
      return results.every((r) => r);
    }
  }
}
