import { createClient, commandOptions } from 'redis';
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
  FilterCondition,
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
import { mergeWithDefault } from '../searchCapabilities';
import { hasNonZeroMagnitude } from '../vectorUtils';

type RedisClient = ReturnType<typeof createClient>;

// ============================================
// Helpers
// ============================================

function toIndexName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return normalized || 'default';
}

function keyPrefix(index: string): string {
  return `${index}:`;
}

function bufferToFloat32Array(buf: Buffer): number[] {
  if (buf.byteLength % 4 !== 0) return [];
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(arr);
}

function float32ToBuffer(vector: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buf.writeFloatLE(vector[i], i * 4);
  }
  return buf;
}

function parseFieldValue(str: string): unknown {
  if (str === 'true') return true;
  if (str === 'false') return false;
  const num = Number(str);
  if (!isNaN(num) && str !== '') return num;
  return str;
}

// ============================================
// Filter Builder
// ============================================

type RedisFieldType = 'TEXT' | 'NUMERIC' | 'TAG';

function escapeTagValue(val: string): string {
  return val.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|/\\]/g, '\\$&');
}

function escapeTextPhrase(val: string): string {
  return val.replace(/"/g, '\\"');
}

function buildConditionClause(
  cond: FilterCondition,
  fieldTypes: Record<string, RedisFieldType>
): string {
  const field = cond.field;
  const val = cond.value;
  const ft = fieldTypes[field];

  // Resolve effective field type: schema type wins, fallback to valueType hint
  const isNumeric = ft === 'NUMERIC' || (!ft && cond.valueType === 'number');
  const isTag = ft === 'TAG' || (!ft && cond.valueType === 'boolean');
  const isText = ft === 'TEXT';

  switch (cond.operator) {
    case 'eq':
      if (isNumeric) return `@${field}:[${val} ${val}]`;
      if (isTag)     return `@${field}:{${escapeTagValue(String(val))}}`;
      if (isText)    return `@${field}:"${escapeTextPhrase(String(val))}"`;
      // Unknown field type — prefer TAG (exact) for short values, TEXT phrase otherwise
      return `@${field}:{${escapeTagValue(String(val))}}`;

    case 'neq':
      if (isNumeric) return `-@${field}:[${val} ${val}]`;
      if (isTag)     return `-@${field}:{${escapeTagValue(String(val))}}`;
      if (isText)    return `-@${field}:"${escapeTextPhrase(String(val))}"`;
      return `-@${field}:{${escapeTagValue(String(val))}}`;

    case 'gt':
      return `@${field}:[(${val} +inf]`;
    case 'gte':
      return `@${field}:[${val} +inf]`;
    case 'lt':
      return `@${field}:[-inf (${val}]`;
    case 'lte':
      return `@${field}:[-inf ${val}]`;

    case 'contains':
    case 'starts_with':
      if (isTag) return `@${field}:{*${escapeTagValue(String(val))}*}`;
      return `@${field}:*${String(val)}*`;

    default:
      return '';
  }
}

function buildRedisFilter(
  filter: FilterQuery,
  fieldTypes: Record<string, RedisFieldType> = {}
): string {
  if (!filter.conditions || filter.conditions.length === 0) return '*';
  const clauses = filter.conditions
    .map((cond) => buildConditionClause(cond, fieldTypes))
    .filter(Boolean);
  if (clauses.length === 0) return '*';
  return filter.logic === 'or' ? clauses.join(' | ') : `(${clauses.join(' ')})`;
}

// ============================================
// Schema Parsing (FT.INFO)
// ============================================

interface VecFieldInfo {
  name: string;
  dim: number;
  algorithm: string;
  distanceMetric: string;
}

interface ParsedSchema {
  vectorFields: Record<string, VecFieldInfo>;
  payloadFields: string[];
  searchableTextFields: string[];
  fieldTypes: Record<string, RedisFieldType>;
  numDocs: number;
}

function parseSchemaFromInfo(info: any): ParsedSchema {
  const vectorFields: Record<string, VecFieldInfo> = {};
  const payloadFields: string[] = [];
  const searchableTextFields: string[] = [];
  const fieldTypes: Record<string, RedisFieldType> = {};

  const attrs: any[] = Array.isArray(info.attributes)
    ? info.attributes
    : Object.values(info.attributes ?? {});

  for (const attr of attrs) {
    const name: string = attr.attribute ?? attr.identifier ?? '';
    const type: string = (attr.type ?? '').toUpperCase();

    if (type === 'VECTOR') {
      vectorFields[name] = {
        name,
        dim: attr.dim ?? attr.DIM ?? 0,
        algorithm: attr.algorithm ?? attr.ALGORITHM ?? 'HNSW',
        distanceMetric: attr.distanceMetric ?? attr.DISTANCE_METRIC ?? 'COSINE',
      };
    } else {
      payloadFields.push(name);
      if (type === 'TEXT' || type === 'NUMERIC' || type === 'TAG') {
        fieldTypes[name] = type as RedisFieldType;
      }
      if (type === 'TEXT') searchableTextFields.push(name);
    }
  }

  const numDocs =
    parseInt(String(info.numDocs ?? info['num_docs'] ?? info.NUM_DOCS ?? 0), 10) || 0;

  return { vectorFields, payloadFields, searchableTextFields, fieldTypes, numDocs };
}

// ============================================
// Score conversion
// ============================================

function scoreToSimilarity(rawScore: number, distanceMetric: string): number {
  const metric = distanceMetric.toUpperCase();
  if (metric === 'COSINE') return 1 - rawScore; // Redis returns cosine distance
  if (metric === 'L2') return 1 / (1 + rawScore);
  if (metric === 'IP') return -rawScore; // Redis returns negative inner product
  return 1 - rawScore;
}

// ============================================
// Constants
// ============================================

export const REDISSEARCH_DISTANCE_METRICS = [
  { label: 'Cosine', value: 'COSINE', description: 'Best for normalized embeddings' },
  { label: 'L2 (Euclidean)', value: 'L2', description: 'Euclidean distance' },
  { label: 'Inner Product', value: 'IP', description: 'For pre-normalized dot product' },
] as const;

export const REDISSEARCH_ALGORITHMS = [
  { label: 'HNSW', value: 'HNSW', description: 'Fast approximate nearest neighbour (recommended)' },
  { label: 'FLAT', value: 'FLAT', description: 'Exact brute-force search' },
] as const;

export const REDISSEARCH_DEFAULTS = {
  vectorSize: 1536,
  distanceMetric: 'COSINE',
  algorithm: 'HNSW',
} as const;

// ============================================
// Create Collection Schema
// ============================================

export const redissearchCreateCollectionSchema: DynamicFormSchema = {
  title: 'Create RediSearch Index',
  description: 'Configure your new vector index in Redis Stack',
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
          placeholder: 'my_index',
          description: 'Unique name (lowercase, alphanumeric, underscores or hyphens)',
          rules: [
            { type: 'minLength', value: 1, message: 'Index name is required' },
            { type: 'pattern', value: '^[a-z0-9_:-]+$', message: 'Must be lowercase letters, numbers, underscores, colons or hyphens' },
          ],
        },
      ],
    },
    {
      key: 'vectors',
      title: 'Vector Configuration',
      description: 'Configure vector field(s) for similarity search',
      items: [
        {
          key: 'vectorType',
          label: 'Vector Configuration Type',
          type: 'radio',
          direction: 'vertical',
          defaultValue: 'single',
          options: [
            { label: 'Single Vector', value: 'single', description: 'One vector field per document' },
            { label: 'Named Vectors', value: 'named', description: 'Multiple named vector fields' },
          ],
        },
        {
          key: 'algorithm',
          label: 'Index Algorithm',
          type: 'select',
          required: true,
          defaultValue: REDISSEARCH_DEFAULTS.algorithm,
          options: [...REDISSEARCH_ALGORITHMS],
          description: 'HNSW is recommended for most use cases',
          showWhen: { field: 'vectorType', operator: 'equals', value: 'single' },
        },
        {
          key: 'size',
          label: 'Vector Dimensions',
          type: 'number',
          required: true,
          defaultValue: REDISSEARCH_DEFAULTS.vectorSize,
          min: 1,
          max: 32768,
          description: 'Number of dimensions (e.g. 1536 for OpenAI)',
          showWhen: { field: 'vectorType', operator: 'equals', value: 'single' },
        },
        {
          key: 'distanceMetric',
          label: 'Distance Metric',
          type: 'select',
          required: true,
          defaultValue: REDISSEARCH_DEFAULTS.distanceMetric,
          options: [...REDISSEARCH_DISTANCE_METRICS],
          description: 'Similarity metric for kNN search',
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
            { key: 'name', label: 'Field Name', type: 'text', required: true, placeholder: 'embedding' },
            { key: 'size', label: 'Dimensions', type: 'number', required: true, defaultValue: REDISSEARCH_DEFAULTS.vectorSize, min: 1, max: 32768 },
            { key: 'algorithm', label: 'Algorithm', type: 'select', required: true, defaultValue: REDISSEARCH_DEFAULTS.algorithm, options: [...REDISSEARCH_ALGORITHMS] },
            { key: 'distanceMetric', label: 'Metric', type: 'select', required: true, defaultValue: REDISSEARCH_DEFAULTS.distanceMetric, options: [...REDISSEARCH_DISTANCE_METRICS] },
          ],
          addButtonText: 'Add Vector',
        },
      ],
    },
  ],
  showSubmit: true,
  showCancel: true,
  submitText: 'Create Index',
};

// ============================================
// RedisSearch Client
// ============================================

export class RedisSearchClient implements VectorDBClient {
  private client: RedisClient;

  constructor(config: ConnectionConfig) {
    const host = config.host || 'localhost';
    const port = config.port || 6379;
    const protocol = config.https ? 'rediss' : 'redis';

    let url: string;
    if (config.password?.trim()) {
      url = `${protocol}://:${encodeURIComponent(config.password.trim())}@${host}:${port}`;
    } else {
      url = `${protocol}://${host}:${port}`;
    }

    this.client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 5) return new Error('Max reconnection attempts reached');
          return Math.min(retries * 500, 3000);
        },
      },
    });
    this.client.on('error', (e: Error) => log.warn('[RedisSearch] Client error:', e.message));
    log.info('[RedisSearch] Client configured for', `${host}:${port}`);
  }

  private async ensureConnected(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  private async getSchemaInternal(index: string): Promise<ParsedSchema> {
    try {
      const info = await this.client.ft.info(index);
      return parseSchemaFromInfo(info);
    } catch {
      return { vectorFields: {}, payloadFields: [], searchableTextFields: [], fieldTypes: {}, numDocs: 0 };
    }
  }

  // ============================================
  // testConnection
  // ============================================

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.ensureConnected();
      const info = await this.client.info('server');
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      const version = versionMatch?.[1]?.trim() || 'unknown';
      log.info('[RedisSearch] Connected, version:', version);
      return { success: true, version: `Redis Stack ${version}` };
    } catch (err: any) {
      log.warn('[RedisSearch] testConnection failed:', err.message);
      return { success: false, error: err.message || 'Connection failed' };
    }
  }

  // ============================================
  // getCollections
  // ============================================

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      await this.ensureConnected();
      const indices = await this.client.ft._list();
      const collections: Collection[] = await Promise.all(
        indices.map(async (name) => {
          try {
            const info = await this.client.ft.info(name);
            const count =
              parseInt(String((info as any).numDocs ?? (info as any)['num_docs'] ?? 0), 10) || 0;
            return { name, count };
          } catch {
            return { name, count: 0 };
          }
        })
      );
      return { success: true, collections };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to list indices' };
    }
  }

  // ============================================
  // getCollectionInfo
  // ============================================

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    const index = toIndexName(collection);
    try {
      await this.ensureConnected();
      const info = await this.client.ft.info(index);
      return { success: true, data: info as unknown as Record<string, unknown> };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get index info' };
    }
  }

  // ============================================
  // getCollectionSchema
  // ============================================

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    const index = toIndexName(collection);
    try {
      await this.ensureConnected();
      const schema = await this.getSchemaInternal(index);

      const fields: Record<string, SchemaField> = {};
      for (const name of schema.payloadFields) {
        fields[name] = {
          name,
          type: 'string',
          searchable: schema.searchableTextFields.includes(name),
        };
      }

      const vectors: Record<string, VectorSchemaField> = {};
      for (const [name, info] of Object.entries(schema.vectorFields)) {
        vectors[name] = {
          name,
          type: 'vector',
          vectorType: 'dense',
          size: info.dim,
          distance: info.distanceMetric.toLowerCase(),
        };
      }

      const totalVectors = Object.keys(vectors).length;
      if (totalVectors === 1) {
        const [onlyKey] = Object.keys(vectors);
        vectors[COLLECTION_DEFAULT_VECTOR] = { ...vectors[onlyKey], name: COLLECTION_DEFAULT_VECTOR };
      }

      return {
        success: true,
        schema: {
          primary: { name: 'id', type: 'string', autoID: false },
          fields,
          vectors: totalVectors > 0
            ? vectors
            : { [COLLECTION_DEFAULT_VECTOR]: { name: COLLECTION_DEFAULT_VECTOR, type: 'vector', vectorType: 'dense', size: 0, distance: 'cosine' } },
          multipleVectors: totalVectors > 1,
          hasVectors: totalVectors > 0,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get schema' };
    }
  }

  // ============================================
  // getSearchCapabilities
  // ============================================

  async getSearchCapabilities(
    _collection: string,
    schema?: CollectionSchema | null
  ): Promise<SearchCapabilities> {
    return mergeWithDefault(
      {
        dense: true,
        sparse: false,
        lexical: true,
        clientSideFusion: true,
        fusionStrategies: ['rrf', 'weighted'],
      },
      schema
    );
  }

  // ============================================
  // getDocuments
  // ============================================

  async getDocuments(
    collection: string,
    options?: GetDocumentsOptions
  ): Promise<GetDocumentsResult> {
    const index = toIndexName(collection);
    const limit = options?.limit ?? 50;
    const offset = typeof options?.offset === 'number' ? options.offset : 0;

    try {
      await this.ensureConnected();

      const parsed = await this.getSchemaInternal(index);
      const filterQuery = options?.filter ? buildRedisFilter(options.filter, parsed.fieldTypes) : '*';
      const vecFieldNames = Object.keys(parsed.vectorFields);

      const searchOpts: any = {
        LIMIT: { from: offset, size: limit },
      };

      if (options?.sort?.length) {
        const s = options.sort[0];
        searchOpts.SORTBY = { BY: s.field, DIRECTION: s.order.toUpperCase() };
      }

      // Return only payload fields (avoid binary vector blobs in the string result)
      if (parsed.payloadFields.length > 0) {
        searchOpts.RETURN = parsed.payloadFields;
      }

      const result = await this.client.ft.search(index, filterQuery, searchOpts);

      // Fetch vector fields separately with buffer mode for correct binary decoding
      const documents: Document[] = await Promise.all(
        result.documents.map(async (doc) => {
          const key = doc.id;
          const docId = key.startsWith(`${index}:`) ? key.slice(index.length + 1) : key;

          const payload: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(doc.value)) {
            payload[k] = parseFieldValue(v as string);
          }

          const vectors: Record<string, DocumentVector> = {};
          if (vecFieldNames.length > 0) {
            try {
              const hashBufs = await this.client.hGetAll(
                commandOptions({ returnBuffers: true }),
                key
              ) as unknown as Record<string, Buffer>;

              for (const vecName of vecFieldNames) {
                const buf = hashBufs[vecName];
                if (Buffer.isBuffer(buf) && buf.byteLength > 0 && buf.byteLength % 4 === 0) {
                  const data = bufferToFloat32Array(buf);
                  const fieldKey = vecFieldNames.length === 1 ? COLLECTION_DEFAULT_VECTOR : vecName;
                  vectors[fieldKey] = {
                    key: fieldKey,
                    vectorType: 'dense',
                    size: data.length,
                    value: { data },
                  };
                }
              }
            } catch {
              // Non-fatal: return document without vector data
            }
          }

          return {
            primary: { name: 'id', value: docId },
            vectors,
            payload,
          };
        })
      );

      const total = result.total;
      const nextOffset = offset + result.documents.length < total ? offset + result.documents.length : null;

      return { success: true, documents, nextOffset, totalCount: total };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get documents' };
    }
  }

  // ============================================
  // search (KNN + lexical)
  // ============================================

  async search(
    collection: string,
    vectors: Record<string, DocumentVector>,
    options?: SearchOptions
  ): Promise<SearchResult> {
    const startTime = performance.now();
    const index = toIndexName(collection);

    try {
      await this.ensureConnected();

      const parsed = await this.getSchemaInternal(index);
      const vecFieldNames = Object.keys(parsed.vectorFields);
      const limit = options?.limit ?? 10;
      const filterQuery = options?.filter ? buildRedisFilter(options.filter, parsed.fieldTypes) : '*';

      const denseKey = Object.keys(vectors).find((k) => vectors[k].vectorType === 'dense');
      const denseVec = denseKey ? vectors[denseKey] : null;
      const vectorArray =
        denseVec?.vectorType === 'dense' && 'data' in denseVec.value
          ? denseVec.value.data
          : null;

      const useDense = Boolean(vectorArray && hasNonZeroMagnitude(vectorArray));
      const useLexical = Boolean(options?.lexicalQuery?.trim());
      const lexicalQuery = options?.lexicalQuery?.trim() ?? '';

      if (!useDense && !useLexical) {
        return { success: false, error: 'Provide at least one of: dense vector or lexical query' };
      }

      let documents: Document[] = [];
      const searchTimeMs = () => performance.now() - startTime;

      if (useDense) {
        // Determine which vector field to search against
        const requestedKey = options?.vectorKey;
        let targetField: string;
        if (requestedKey && vecFieldNames.includes(requestedKey)) {
          targetField = requestedKey;
        } else if (requestedKey === COLLECTION_DEFAULT_VECTOR && vecFieldNames.length > 0) {
          targetField = vecFieldNames[0];
        } else {
          targetField = vecFieldNames[0] ?? 'embedding';
        }

        const vecInfo = parsed.vectorFields[targetField];
        const distanceMetric = vecInfo?.distanceMetric ?? 'COSINE';
        const vecBuf = float32ToBuffer(vectorArray!);

        const baseQuery = filterQuery === '*' ? '*' : filterQuery;
        const knnQuery = `${baseQuery}=>[KNN ${limit} @${targetField} $BLOB AS __score]`;

        const returnFields = [
          ...parsed.payloadFields,
          '__score',
        ];

        const knnResult = await this.client.ft.search(index, knnQuery, {
          PARAMS: { BLOB: vecBuf },
          DIALECT: 2,
          SORTBY: { BY: '__score', DIRECTION: 'ASC' },
          LIMIT: { from: 0, size: limit },
          RETURN: returnFields.length > 0 ? returnFields : undefined,
        } as any);

        // Fetch vectors with buffer mode
        documents = await Promise.all(
          knnResult.documents.map(async (doc) => {
            const key = doc.id;
            const docId = key.startsWith(`${index}:`) ? key.slice(index.length + 1) : key;
            const rawScore = parseFloat((doc.value as any).__score ?? '0');
            const score = scoreToSimilarity(rawScore, distanceMetric);

            const payload: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(doc.value)) {
              if (k === '__score') continue;
              payload[k] = parseFieldValue(v as string);
            }

            const docVectors: Record<string, DocumentVector> = {};
            if (vecFieldNames.length > 0) {
              try {
                const hashBufs = await this.client.hGetAll(
                  commandOptions({ returnBuffers: true }),
                  key
                ) as unknown as Record<string, Buffer>;

                for (const vecName of vecFieldNames) {
                  const buf = hashBufs[vecName];
                  if (Buffer.isBuffer(buf) && buf.byteLength > 0 && buf.byteLength % 4 === 0) {
                    const data = bufferToFloat32Array(buf);
                    const fieldKey = vecFieldNames.length === 1 ? COLLECTION_DEFAULT_VECTOR : vecName;
                    docVectors[fieldKey] = { key: fieldKey, vectorType: 'dense', size: data.length, value: { data } };
                  }
                }
              } catch { /* non-fatal */ }
            }

            return {
              primary: { name: 'id', value: docId },
              score,
              vectors: docVectors,
              payload,
            };
          })
        );

        if (options?.scoreThreshold != null) {
          documents = documents.filter((d) => (d.score ?? 0) >= options.scoreThreshold!);
        }
      } else if (useLexical) {
        // Lexical-only: build a full-text query across text fields
        const textFields = parsed.searchableTextFields;
        let query: string;
        if (textFields.length > 0) {
          const fieldClauses = textFields.map((f) => `@${f}:${lexicalQuery}`).join(' | ');
          query = filterQuery === '*' ? `(${fieldClauses})` : `${filterQuery} (${fieldClauses})`;
        } else {
          query = lexicalQuery;
        }

        const lexResult = await this.client.ft.search(index, query, {
          LIMIT: { from: 0, size: limit },
          RETURN: parsed.payloadFields.length > 0 ? parsed.payloadFields : undefined,
        } as any);

        documents = await Promise.all(
          lexResult.documents.map(async (doc) => {
            const key = doc.id;
            const docId = key.startsWith(`${index}:`) ? key.slice(index.length + 1) : key;

            const payload: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(doc.value)) {
              payload[k] = parseFieldValue(v as string);
            }

            return {
              primary: { name: 'id', value: docId },
              vectors: {},
              payload,
            };
          })
        );
      }

      return {
        success: true,
        documents,
        metadata: { searchTimeMs: searchTimeMs() },
      };
    } catch (err: any) {
      log.warn('[RedisSearch] search failed:', err.message);
      return { success: false, error: err.message || 'Search failed' };
    }
  }

  // ============================================
  // upsertDocument
  // ============================================

  async upsertDocument(
    collection: string,
    data: UpsertDocumentData
  ): Promise<UpsertDocumentResult> {
    const index = toIndexName(collection);
    const { document } = data;
    const docId = document?.primary?.value != null ? String(document.primary.value) : `doc_${Date.now()}`;
    const key = `${keyPrefix(index)}${docId}`;

    try {
      await this.ensureConnected();

      const hashData: Record<string, string | Buffer> = { id: docId };

      if (document?.vectors) {
        for (const [vecKey, vec] of Object.entries(document.vectors)) {
          if (vec.vectorType === 'dense' && 'data' in vec.value) {
            const fieldName = vecKey === COLLECTION_DEFAULT_VECTOR ? 'embedding' : vecKey;
            hashData[fieldName] = float32ToBuffer(vec.value.data);
          }
        }
      }

      if (document?.payload) {
        for (const [k, v] of Object.entries(document.payload)) {
          if (v === null || v === undefined) continue;
          hashData[k] = Array.isArray(v) ? v.join(',') : String(v);
        }
      }

      await this.client.hSet(key, hashData as any);
      return { success: true, document: { id: docId } };
    } catch (err: any) {
      log.error('[RedisSearch] upsertDocument error:', err.message);
      return { success: false, error: err.message || 'Upsert failed' };
    }
  }

  // ============================================
  // deleteDocument
  // ============================================

  async deleteDocument(
    collection: string,
    primary: Document['primary']
  ): Promise<DeleteDocumentResult> {
    const index = toIndexName(collection);
    const key = `${keyPrefix(index)}${primary.value}`;
    try {
      await this.ensureConnected();
      await this.client.del(key);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Delete failed' };
    }
  }

  // ============================================
  // deleteDocuments
  // ============================================

  async deleteDocuments(
    collection: string,
    filter: FilterQuery
  ): Promise<DeleteDocumentsResult> {
    const index = toIndexName(collection);
    try {
      await this.ensureConnected();

      const parsed = await this.getSchemaInternal(index);
      const filterQuery = filter.conditions?.length ? buildRedisFilter(filter, parsed.fieldTypes) : '*';

      // Fetch matching document keys (no fields needed, just IDs)
      let from = 0;
      const batchSize = 500;
      let deletedCount = 0;

      while (true) {
        const result = await this.client.ft.search(index, filterQuery, {
          LIMIT: { from, size: batchSize },
          RETURN: [],
        } as any);

        if (result.documents.length === 0) break;

        const keys = result.documents.map((d) => d.id);
        await this.client.del(keys);
        deletedCount += keys.length;

        if (result.documents.length < batchSize) break;
        from += batchSize;
      }

      return { success: true, deletedCount };
    } catch (err: any) {
      return { success: false, error: err.message || 'Delete by filter failed' };
    }
  }

  // ============================================
  // dropCollection
  // ============================================

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    const index = toIndexName(collection);
    try {
      await this.ensureConnected();
      await this.client.ft.dropIndex(index, { DD: true });
      return { success: true };
    } catch (err: any) {
      if (err.message?.includes('Unknown Index name')) {
        return { success: true };
      }
      return { success: false, error: err.message || 'Failed to drop index' };
    }
  }

  // ============================================
  // truncateCollection
  // ============================================

  async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
    const result = await this.deleteDocuments(collection, { conditions: [], logic: 'and' });
    return {
      success: result.success,
      deletedCount: result.deletedCount ?? 0,
      error: result.error,
    };
  }

  // ============================================
  // createCollection
  // ============================================

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    const name = toIndexName(String(config.name ?? ''));
    if (!name) return { success: false, error: 'Index name is required' };

    try {
      await this.ensureConnected();

      const schema: Record<string, any> = {};
      const vectorType = config.vectorType as string;

      if (vectorType === 'named') {
        const namedVectors = config.namedVectors as Array<{
          name: string;
          size: number;
          algorithm: string;
          distanceMetric: string;
        }>;
        for (const v of namedVectors ?? []) {
          const fieldName = (v.name || 'embedding').toLowerCase().replace(/[^a-z0-9_]/g, '_');
          schema[fieldName] = {
            type: 'VECTOR',
            ALGORITHM: (v.algorithm ?? REDISSEARCH_DEFAULTS.algorithm) as any,
            TYPE: 'FLOAT32',
            DIM: v.size ?? REDISSEARCH_DEFAULTS.vectorSize,
            DISTANCE_METRIC: (v.distanceMetric ?? REDISSEARCH_DEFAULTS.distanceMetric) as any,
          };
        }
      } else {
        schema.embedding = {
          type: 'VECTOR',
          ALGORITHM: (config.algorithm ?? REDISSEARCH_DEFAULTS.algorithm) as any,
          TYPE: 'FLOAT32',
          DIM: (config.size as number) ?? REDISSEARCH_DEFAULTS.vectorSize,
          DISTANCE_METRIC: (config.distanceMetric ?? REDISSEARCH_DEFAULTS.distanceMetric) as any,
        };
      }

      await this.client.ft.create(name, schema, {
        ON: 'HASH',
        PREFIX: keyPrefix(name),
      });

      log.info('[RedisSearch] Created index:', name);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to create index' };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return redissearchCreateCollectionSchema;
  }
}
