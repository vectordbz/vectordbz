import { createDbClient, type DbClient } from '@deven96/ahnlich-client-node';
import {
  InfoServer,
  Ping,
  GetStore,
  ListStores,
  DropStore,
  CreateStore,
  Set as SetEntries,
  DelKey,
  DelPred,
  GetSimN,
  ListStoreEntries,
  ClearStore,
} from '@deven96/ahnlich-client-node/grpc/db/query_pb';
import { DbStoreEntry, StoreKey, StoreValue } from '@deven96/ahnlich-client-node/grpc/keyval_pb';
import { MetadataValue } from '@deven96/ahnlich-client-node/grpc/metadata_pb';
import { Algorithm } from '@deven96/ahnlich-client-node/grpc/algorithm/algorithm_pb';
import {
  AndCondition,
  Equals,
  In,
  NotEquals,
  NotIn,
  OrCondition,
  Predicate,
  PredicateCondition,
} from '@deven96/ahnlich-client-node/grpc/predicate_pb';
import type { DynamicFormSchema } from 'src/components/DynamicForm/types';
import {
  COLLECTION_DEFAULT_VECTOR,
  type CollectionSchema,
  type ConnectionConfig,
  type ConnectionResult,
  type CreateCollectionResult,
  type DeleteDocumentResult,
  type DeleteDocumentsResult,
  type Document,
  type DocumentVector,
  type DropCollectionResult,
  type FilterQuery,
  type FilterCondition,
  type GetCollectionInfoResult,
  type GetCollectionSchemaResult,
  type GetCollectionsResult,
  type GetDocumentsOptions,
  type GetDocumentsResult,
  type SearchCapabilities,
  type SearchOptions,
  type SearchResult,
  type TruncateCollectionResult,
  type UpsertDocumentData,
  type UpsertDocumentResult,
  type VectorDBClient,
} from '../../types';

const AHNLICH_DEFAULT_PORT = 1369;
const AHNLICH_DEFAULT_SCHEMA = 'public';
const AHNLICH_VECTOR_KEY = 'vector_key';
const AHNLICH_MAX_VECTOR_DIMENSION = 4_294_967_295;
const AHNLICH_DEFAULT_PAGE_LIMIT = 100;
const AHNLICH_MAX_PAGE_LIMIT = 1_000;

export const ahnlichCreateCollectionSchema: DynamicFormSchema = {
  title: 'Create Ahnlich Store',
  description: 'Configure a dense-vector store in Ahnlich',
  sections: [
    {
      key: 'general',
      title: 'General',
      items: [
        {
          key: 'name',
          label: 'Store Name',
          type: 'text',
          required: true,
          placeholder: 'my_store',
          description: 'Unique name for the Ahnlich store',
          rules: [
            {
              type: 'minLength',
              value: 1,
              message: 'Store name is required',
            },
          ],
        },
        {
          key: 'dimension',
          label: 'Vector Dimensions',
          type: 'number',
          required: true,
          defaultValue: 384,
          min: 1,
          description: 'Number of values in every embedding',
        },
        {
          key: 'predicateIndices',
          label: 'Predicate Indices',
          type: 'tags',
          defaultValue: [],
          placeholder: 'category',
          description: 'Metadata fields that Ahnlich may use in predicate filters',
        },
      ],
    },
  ],
};

type AhnlichStoreDefinition = {
  name: string;
  dimension: number;
  predicateIndices: string[];
};

type AhnlichStoreEntry = Pick<DbStoreEntry, 'key' | 'value'>;

type AhnlichBinaryMetadata = {
  type: 'image' | 'audio';
  encoding: 'base64';
  data: string;
};

/**
 * Adapts Ahnlich's vector-key store API to VectorDBZ's database-neutral
 * collection and document interface.
 */
export class AhnlichClient implements VectorDBClient {
  private readonly client: DbClient;
  private readonly schema: string;

  constructor(config: ConnectionConfig) {
    const host = config.host?.trim();

    if (!host) {
      throw new Error('Host is required for an Ahnlich connection');
    }

    const port = config.port ?? AHNLICH_DEFAULT_PORT;

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Ahnlich port must be an integer between 1 and 65535');
    }

    this.schema = config.schema?.trim() || AHNLICH_DEFAULT_SCHEMA;
    this.client = createDbClient(`${host}:${port}`);
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.client.ping(new Ping());
      const response = await this.client.infoServer(new InfoServer());
      const version = response.info?.version.trim();

      if (!version) {
        throw new Error('Ahnlich returned no server version');
      }

      return {
        success: true,
        version: `Ahnlich ${version}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown connection error';
      return {
        success: false,
        error: `Failed to connect to Ahnlich: ${message}`,
      };
    }
  }

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      const response = await this.client.listStores(
        new ListStores({
          schema: this.schema,
        }),
      );

      const collections = response.stores.map((store) => ({
        name: store.name,
        count: this.toSafeNumber(store.len, `Entry count for store "${store.name}"`),
      }));

      return {
        success: true,
        collections,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to list Ahnlich stores: ${message}`,
      };
    }
  }

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    try {
      const store = await this.getStoreInfo(collection);

      return {
        success: true,
        data: {
          name: store.name,
          count: this.toSafeNumber(store.len, `Entry count for store "${store.name}"`),
          sizeInBytes: this.toSafeNumber(store.sizeInBytes, `Size of store "${store.name}"`),
          dimension: store.dimension,
          predicateIndices: [...store.predicateIndices],
          nonLinearIndices: store.nonLinearIndices.map((index) => index.toJson()),
          schema: this.schema,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to load Ahnlich store "${collection}": ${message}`,
      };
    }
  }

  async getDocuments(
    collection: string,
    options?: GetDocumentsOptions,
  ): Promise<GetDocumentsResult> {
    const storeName = collection.trim();

    if (!storeName) {
      return {
        success: false,
        error: 'Ahnlich store name is required',
      };
    }

    try {
      const { limit, cursor } = this.parseListStoreEntriesOptions(options);
      const store = await this.getStoreInfo(storeName);

      const condition = options?.filter
        ? this.filterToPredicateCondition(options.filter, store.predicateIndices)
        : undefined;

      const response = await this.client.listStoreEntries(
        new ListStoreEntries({
          store: storeName,
          cursor,
          limit,
          condition,
          schema: this.schema,
        }),
      );

      return {
        success: true,
        documents: response.entries.map((entry) => this.storeEntryToDocument(entry)),
        nextOffset: response.nextCursor ?? null,
        ...(options?.filter
          ? {}
          : {
              totalCount: this.toSafeNumber(store.len, `Entry count for store "${storeName}"`),
            }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to browse entries in Ahnlich store "${storeName}": ${message}`,
      };
    }
  }

  async search(
    collection: string,
    vectors: Record<string, DocumentVector>,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const storeName = collection.trim();

    if (!storeName) {
      return {
        success: false,
        error: 'Ahnlich store name is required',
      };
    }

    const startTime = performance.now();

    try {
      this.assertSupportedSearchOptions(options);

      const store = await this.getStoreInfo(storeName);
      const searchInput = this.documentVectorsToStoreKey(vectors);
      const limit = this.parseSearchLimit(options?.limit);

      if (searchInput.key.length !== store.dimension) {
        throw new Error(
          `Search vector dimension ${searchInput.key.length} does not match ` +
            `store dimension ${store.dimension}`,
        );
      }

      const condition = options?.filter
        ? this.filterToPredicateCondition(options.filter, store.predicateIndices)
        : undefined;

      const response = await this.client.getSimN(
        new GetSimN({
          store: storeName,
          searchInput,
          closestN: BigInt(limit),
          algorithm: Algorithm.CosineSimilarity,
          condition,
          schema: this.schema,
        }),
      );

      const documents = response.entries.map((entry) => {
        if (!entry.similarity) {
          throw new Error('Ahnlich returned a search result without a similarity score');
        }

        if (!Number.isFinite(entry.similarity.value)) {
          throw new Error('Ahnlich returned a non-finite similarity score');
        }

        return this.storeEntryToDocument(entry, entry.similarity.value);
      });

      return {
        success: true,
        documents,
        metadata: {
          searchTimeMs: performance.now() - startTime,
          requestedTopK: limit,
          returnedCount: documents.length,
          effectiveTopK: documents.length,
          queryVectorDimension: searchInput.key.length,
          filterApplied: options?.filter !== undefined,
          filterConditions: options?.filter?.conditions,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to search Ahnlich store "${storeName}": ${message}`,
      };
    }
  }

  async deleteDocument(
    collection: string,
    primary: Document['primary'],
    dataRequirements?: Record<string, string>,
  ): Promise<DeleteDocumentResult> {
    void dataRequirements;

    const storeName = collection.trim();

    if (!storeName) {
      return {
        success: false,
        error: 'Ahnlich store name is required',
      };
    }

    try {
      const storeKey = this.primaryToStoreKey(primary);

      const response = await this.client.delKey(
        new DelKey({
          store: storeName,
          keys: [storeKey],
          schema: this.schema,
        }),
      );

      if (response.deletedCount === 0n) {
        return {
          success: false,
          error: `No entry found in Ahnlich store "${storeName}" for the provided vector key`,
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to delete entry from Ahnlich store "${storeName}": ${message}`,
      };
    }
  }

  async deleteDocuments(
    collection: string,
    filter: FilterQuery,
    dataRequirements?: Record<string, string>,
  ): Promise<DeleteDocumentsResult> {
    void dataRequirements;

    const storeName = collection.trim();

    if (!storeName) {
      return {
        success: false,
        error: 'Ahnlich store name is required',
      };
    }

    try {
      const store = await this.getStoreInfo(storeName);
      const condition = this.filterToPredicateCondition(filter, store.predicateIndices);

      const response = await this.client.delPred(
        new DelPred({
          store: storeName,
          condition,
          schema: this.schema,
        }),
      );

      return {
        success: true,
        deletedCount: this.toSafeNumber(
          response.deletedCount,
          `Deleted entry count for store "${storeName}"`,
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to delete filtered entries from Ahnlich store "${storeName}": ${message}`,
      };
    }
  }

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    const storeName = collection.trim();

    if (!storeName) {
      return {
        success: false,
        error: 'Ahnlich store name is required',
      };
    }

    try {
      await this.client.dropStore(
        new DropStore({
          store: storeName,
          errorIfNotExists: true,
          schema: this.schema,
        }),
      );

      return {
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to drop Ahnlich store "${storeName}": ${message}`,
      };
    }
  }

  async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
    const storeName = collection.trim();

    if (!storeName) {
      return {
        success: false,
        error: 'Ahnlich store name is required',
      };
    }

    try {
      const response = await this.client.clearStore(
        new ClearStore({
          store: storeName,
          schema: this.schema,
        }),
      );

      return {
        success: true,
        deletedCount: this.toSafeNumber(
          response.deletedCount,
          `Deleted entry count for store "${storeName}"`,
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to clear Ahnlich store "${storeName}": ${message}`,
      };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    try {
      const store = await this.getStoreInfo(collection);
      const fields: CollectionSchema['fields'] = {};

      for (const predicateIndex of store.predicateIndices) {
        fields[predicateIndex] = {
          name: predicateIndex,
          type: 'string',
          searchable: false,
          description: 'Ahnlich predicate-indexed metadata field',
        };
      }

      const schema: CollectionSchema = {
        primary: {
          name: AHNLICH_VECTOR_KEY,
          type: 'string',
          autoID: true,
          description:
            'Synthetic identifier derived from the embedding; Ahnlich has no separate document ID',
        },
        fields,
        vectors: {
          [COLLECTION_DEFAULT_VECTOR]: {
            name: COLLECTION_DEFAULT_VECTOR,
            type: 'vector',
            vectorType: 'dense',
            size: store.dimension,
            description:
              'Dense embedding used as the Ahnlich store key; similarity is selected per query',
          },
        },
        multipleVectors: false,
        hasVectors: true,
      };

      return {
        success: true,
        schema,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to load schema for Ahnlich store "${collection}": ${message}`,
      };
    }
  }

  async getSearchCapabilities(
    collection: string,
    schema?: CollectionSchema | null,
  ): Promise<SearchCapabilities> {
    void collection;
    void schema;

    return {
      dense: true,
      sparse: false,
      lexical: false,
      clientSideFusion: false,
      filters: true,
      scoreThreshold: false,
      multipleVectorFields: false,
      hasSparseVectorField: false,
      hasSearchableTextFields: false,
      fusionStrategies: [],
      supportsHybridAlpha: false,
      serverSideHybridNative: false,
    };
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    try {
      const definition = this.parseStoreDefinition(config);
      await this.client.createStore(
        new CreateStore({
          store: definition.name,
          dimension: definition.dimension,
          createPredicates: definition.predicateIndices,
          nonLinearIndices: [],
          errorIfExists: true,
          schema: this.schema,
        }),
      );
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to create Ahnlich store: "${message}"`,
      };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return ahnlichCreateCollectionSchema;
  }

  async upsertDocument(
    collection: string,
    data: UpsertDocumentData,
    dataRequirements?: Record<string, string>,
  ): Promise<UpsertDocumentResult> {
    void dataRequirements;

    const storeName = collection.trim();

    if (!storeName) {
      return {
        success: false,
        error: 'Ahnlich store name is required',
      };
    }

    try {
      const store = await this.getStoreInfo(storeName);
      const entry = this.documentToStoreEntry(data.document);
      const storeKey = entry.key;

      if (!storeKey) {
        throw new Error('Ahnlich entry requires an embedding');
      }

      if (storeKey.key.length !== store.dimension) {
        throw new Error(
          `Embedding dimension ${storeKey.key.length} does not match ` +
            `store dimension ${store.dimension}`,
        );
      }

      if (data.document.primary) {
        this.assertVectorKeyUnchanged(data.document.primary, storeKey);
      }

      const response = await this.client.set(
        new SetEntries({
          store: storeName,
          inputs: [entry],
          schema: this.schema,
        }),
      );

      if (!response.upsert) {
        throw new Error('Ahnlich returned no mutation result');
      }

      return {
        success: true,
        document: this.storeEntryToDocument(entry),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to upsert entry in Ahnlich store "${storeName}": ${message}`,
      };
    }
  }

  private filterToPredicateCondition(
    filter: FilterQuery,
    predicateIndices: string[],
  ): PredicateCondition {
    if (filter.conditions.length === 0) {
      throw new Error('Ahnlich predicate operations require at least one filter condition');
    }

    const indexedFields = new Set(predicateIndices);
    const conditions = filter.conditions.map((condition) =>
      this.filterConditionToPredicateCondition(condition, indexedFields),
    );

    let combinedCondition = conditions[0];

    for (const condition of conditions.slice(1)) {
      if (filter.logic === 'and') {
        combinedCondition = new PredicateCondition({
          kind: {
            case: 'and',
            value: new AndCondition({
              left: combinedCondition,
              right: condition,
            }),
          },
        });
      } else {
        combinedCondition = new PredicateCondition({
          kind: {
            case: 'or',
            value: new OrCondition({
              left: combinedCondition,
              right: condition,
            }),
          },
        });
      }
    }

    return combinedCondition;
  }

  private filterConditionToPredicateCondition(
    condition: FilterCondition,
    indexedFields: ReadonlySet<string>,
  ): PredicateCondition {
    const field = condition.field;

    if (!field.trim()) {
      throw new Error('Ahnlich filter field is required');
    }

    if (!indexedFields.has(field)) {
      throw new Error(`Ahnlich metadata field "${field}" does not have a predicate index`);
    }

    const rawValue: unknown = condition.value;
    let predicate: Predicate;

    switch (condition.operator) {
      case 'eq':
        predicate = new Predicate({
          kind: {
            case: 'equals',
            value: new Equals({
              key: field,
              value: this.filterValueToMetadataValue(field, rawValue),
            }),
          },
        });
        break;

      case 'neq':
        predicate = new Predicate({
          kind: {
            case: 'notEquals',
            value: new NotEquals({
              key: field,
              value: this.filterValueToMetadataValue(field, rawValue),
            }),
          },
        });
        break;

      case 'in':
        predicate = new Predicate({
          kind: {
            case: 'in',
            value: new In({
              key: field,
              values: this.filterValueToMetadataValues(field, rawValue),
            }),
          },
        });
        break;

      case 'not_in':
      case 'notIn':
        predicate = new Predicate({
          kind: {
            case: 'notIn',
            value: new NotIn({
              key: field,
              values: this.filterValueToMetadataValues(field, rawValue),
            }),
          },
        });
        break;

      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
      case 'contains':
      case 'starts_with':
      case 'ends_with':
        throw new Error(`Ahnlich does not support filter operator "${condition.operator}"`);

      default:
        throw new Error(`Unknown VectorDBZ filter operator "${condition.operator}"`);
    }

    return new PredicateCondition({
      kind: {
        case: 'value',
        value: predicate,
      },
    });
  }

  private filterValueToMetadataValue(field: string, value: unknown): MetadataValue {
    if (typeof value !== 'string') {
      throw new Error(`Ahnlich filter value for "${field}" must be a string`);
    }

    return new MetadataValue({
      value: {
        case: 'rawString',
        value,
      },
    });
  }

  private filterValueToMetadataValues(field: string, value: unknown): MetadataValue[] {
    const values = Array.isArray(value) ? value : [value];

    if (values.length === 0) {
      throw new Error(`Ahnlich membership filter for "${field}" requires at least one value`);
    }

    return values.map((item) => this.filterValueToMetadataValue(field, item));
  }

  private assertVectorKeyUnchanged(primary: Document['primary'], newStoreKey: StoreKey): void {
    const originalStoreKey = this.primaryToStoreKey(primary);

    const keyChanged =
      originalStoreKey.key.length !== newStoreKey.key.length ||
      originalStoreKey.key.some((value, index) => value !== newStoreKey.key[index]);

    if (keyChanged) {
      throw new Error(
        'Ahnlich uses the embedding as the document key. ' +
          'Delete the original entry before changing its embedding.',
      );
    }
  }

  private primaryToStoreKey(primary: Document['primary']): StoreKey {
    if (primary.name !== AHNLICH_VECTOR_KEY) {
      throw new Error(`Expected Ahnlich primary field "${AHNLICH_VECTOR_KEY}"`);
    }

    if (typeof primary.value !== 'string') {
      throw new Error('Ahnlich vector key must be a serialized embedding');
    }

    let parsedValue: unknown;

    try {
      parsedValue = JSON.parse(primary.value);
    } catch {
      throw new Error('Ahnlich vector key contains invalid JSON');
    }

    if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
      throw new Error('Ahnlich vector key must contain a non-empty array');
    }

    const values: number[] = [];

    for (const value of parsedValue) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error('Ahnlich vector key must contain only finite numbers');
      }

      values.push(value);
    }

    return new StoreKey({
      key: values,
    });
  }

  private documentToStoreEntry(document: Partial<Document>): DbStoreEntry {
    return new DbStoreEntry({
      key: this.documentVectorsToStoreKey(document.vectors ?? {}),
      value: this.payloadToStoreValue(document.payload ?? {}),
    });
  }

  private storeEntryToDocument(entry: AhnlichStoreEntry, score?: number): Document {
    const storeKey = entry.key;

    if (!storeKey || storeKey.key.length === 0) {
      throw new Error('Ahnlich returned an entry without an embedding');
    }

    const vector = this.storeKeyToDocumentVector(storeKey);
    const document: Document = {
      primary: {
        name: AHNLICH_VECTOR_KEY,
        value: JSON.stringify(storeKey.key),
      },
      vectors: {
        [COLLECTION_DEFAULT_VECTOR]: vector,
      },
      payload: this.storeValueToPayload(entry.value),
    };

    if (score !== undefined) {
      document.score = score;
    }

    return document;
  }

  private parseListStoreEntriesOptions(options?: GetDocumentsOptions): {
    limit: number;
    cursor?: string;
  } {
    const limit = options?.limit ?? AHNLICH_DEFAULT_PAGE_LIMIT;

    if (!Number.isInteger(limit) || limit < 1 || limit > AHNLICH_MAX_PAGE_LIMIT) {
      throw new Error(
        `Ahnlich document limit must be an integer between 1 and ${AHNLICH_MAX_PAGE_LIMIT}`,
      );
    }

    if (typeof options?.offset === 'number') {
      throw new Error('Ahnlich does not support numeric offsets; use the opaque nextOffset cursor');
    }

    if (options?.sort && options.sort.length > 0) {
      throw new Error('Ahnlich does not support user-configurable entry sorting');
    }

    return {
      limit,
      cursor: typeof options?.offset === 'string' ? options.offset : undefined,
    };
  }

  private assertSupportedSearchOptions(options?: SearchOptions): void {
    if (options?.scoreThreshold !== undefined) {
      throw new Error('Ahnlich does not support score-threshold search');
    }

    if (options?.vectorKey !== undefined && options.vectorKey !== COLLECTION_DEFAULT_VECTOR) {
      throw new Error('Ahnlich supports only its single default vector');
    }

    if (options?.lexicalQuery?.trim()) {
      throw new Error('Ahnlich DB does not support lexical search');
    }

    if (options?.hybridAlpha !== undefined) {
      throw new Error('Ahnlich DB does not support hybrid search');
    }
  }

  private parseSearchLimit(limit: number | undefined): number {
    const parsedLimit = limit ?? 10;

    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
      throw new Error('Ahnlich search limit must be a positive integer');
    }

    return parsedLimit;
  }

  private documentVectorsToStoreKey(vectors: Record<string, DocumentVector>): StoreKey {
    const vectorKeys = Object.keys(vectors);
    const vector = vectors[COLLECTION_DEFAULT_VECTOR];

    if (!vector || vectorKeys.length !== 1) {
      throw new Error('Ahnlich requires exactly one dense vector');
    }

    if (vector.vectorType !== 'dense') {
      throw new Error('Ahnlich does not support sparse or binary vectors');
    }

    const values = vector.value.data;

    if (values.length === 0) {
      throw new Error('Ahnlich embedding cannot be empty');
    }

    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error('Ahnlich embedding values must be finite numbers');
    }

    return new StoreKey({
      key: [...values],
    });
  }

  private storeKeyToDocumentVector(storeKey: StoreKey): DocumentVector {
    return {
      key: COLLECTION_DEFAULT_VECTOR,
      vectorType: 'dense',
      size: storeKey.key.length,
      value: {
        data: [...storeKey.key],
      },
    };
  }

  private payloadToStoreValue(payload: Record<string, unknown>): StoreValue {
    const metadata: Record<string, MetadataValue> = {};

    for (const [field, value] of Object.entries(payload)) {
      metadata[field] = this.payloadValueToMetadataValue(field, value);
    }

    return new StoreValue({
      value: metadata,
    });
  }

  private storeValueToPayload(storeValue: StoreValue | undefined): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (!storeValue) {
      return payload;
    }

    for (const [field, metadata] of Object.entries(storeValue.value)) {
      payload[field] = this.metadataValueToPayloadValue(metadata);
    }

    return payload;
  }

  private payloadValueToMetadataValue(field: string, value: unknown): MetadataValue {
    if (typeof value === 'string') {
      return new MetadataValue({
        value: {
          case: 'rawString',
          value,
        },
      });
    }

    if (this.isAhnlichBinaryMetadata(value)) {
      const bytes = new Uint8Array(Buffer.from(value.data, 'base64'));

      if (value.type === 'image') {
        return new MetadataValue({
          value: {
            case: 'image',
            value: bytes,
          },
        });
      }

      return new MetadataValue({
        value: {
          case: 'audio',
          value: bytes,
        },
      });
    }

    throw new Error(
      `Ahnlich metadata field "${field}" must be a string or base64 image/audio value`,
    );
  }

  private metadataValueToPayloadValue(metadata: MetadataValue): unknown {
    switch (metadata.value.case) {
      case 'rawString':
        return metadata.value.value;

      case 'image':
      case 'audio': {
        const binaryMetadata: AhnlichBinaryMetadata = {
          type: metadata.value.case,
          encoding: 'base64',
          data: Buffer.from(metadata.value.value).toString('base64'),
        };

        return binaryMetadata;
      }

      default:
        return null;
    }
  }

  private isAhnlichBinaryMetadata(value: unknown): value is AhnlichBinaryMetadata {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      (value.type === 'image' || value.type === 'audio') &&
      value.encoding === 'base64' &&
      typeof value.data === 'string'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private parseStoreDefinition(config: Record<string, unknown>): AhnlichStoreDefinition {
    const name = typeof config.name === 'string' ? config.name.trim() : '';

    if (!name) {
      throw new Error('Store name is required');
    }

    const dimension = config.dimension;

    if (
      typeof dimension !== 'number' ||
      !Number.isInteger(dimension) ||
      dimension < 1 ||
      dimension > AHNLICH_MAX_VECTOR_DIMENSION
    ) {
      throw new Error(
        `Vector dimension must be an integer between 1 and ${AHNLICH_MAX_VECTOR_DIMENSION}`,
      );
    }

    const configuredPredicateIndices = config.predicateIndices;
    const predicateValues: unknown[] = Array.isArray(configuredPredicateIndices)
      ? configuredPredicateIndices
      : [];

    if (configuredPredicateIndices !== undefined && !Array.isArray(configuredPredicateIndices)) {
      throw new Error('Predicate indices must be an array of strings');
    }

    const predicateIndices: string[] = [];

    for (const predicateValue of predicateValues) {
      if (typeof predicateValue !== 'string') {
        throw new Error('Predicate indices must be an array of strings');
      }

      const predicateIndex = predicateValue.trim();

      if (predicateIndex) {
        predicateIndices.push(predicateIndex);
      }
    }

    return {
      name,
      dimension,
      predicateIndices: [...new Set(predicateIndices)],
    };
  }

  private getStoreInfo(collection: string) {
    return this.client.getStore(
      new GetStore({
        store: collection,
        schema: this.schema,
      }),
    );
  }

  private toSafeNumber(value: bigint, description: string): number {
    const numberValue = Number(value);

    if (!Number.isSafeInteger(numberValue)) {
      throw new Error(`${description} exceeds JavaScript's safe integer range`);
    }

    return numberValue;
  }
}
