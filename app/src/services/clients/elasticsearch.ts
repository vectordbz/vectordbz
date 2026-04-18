import { Client as ElasticsearchClientSDK } from '@elastic/elasticsearch';
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
import { hasNonZeroMagnitude } from '../vectorUtils';

// ============================================
// Elasticsearch Helpers
// ============================================

/** Elasticsearch index names: lowercase, alphanumeric, underscores */
function toIndexName(collection: string): string {
  const normalized = collection
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return normalized || 'default';
}

/** Convert app sparse format (indices + values) to ES sparse_vector format (token -> weight). ES requires positive values. */
function sparseToESQueryVector(indices: number[], values: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < indices.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && v > 0) out[String(indices[i])] = v;
  }
  return out;
}

/** Convert ES sparse_vector object back to app format (indices + values). */
function esSparseToIndicesValues(obj: Record<string, number>): {
  indices: number[];
  values: number[];
} {
  const keys = Object.keys(obj)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const indices = keys;
  const values = keys.map((k) => obj[String(k)] ?? 0);
  return { indices, values };
}

// ============================================
// Elasticsearch Constants
// ============================================

export const ELASTICSEARCH_DISTANCE_METRICS = [
  { label: 'Cosine', value: 'cosine', description: 'Best for normalized vectors' },
  { label: 'Dot Product', value: 'dot_product', description: 'For normalized vectors' },
  { label: 'L2 Norm', value: 'l2_norm', description: 'Euclidean distance' },
] as const;

export const ELASTICSEARCH_DEFAULTS = {
  vectorSize: 1536,
  similarity: 'cosine',
  numCandidates: 100,
} as const;

// ============================================
// Elasticsearch Create Collection Schema
// ============================================

export const elasticsearchCreateCollectionSchema: DynamicFormSchema = {
  title: 'Create Elasticsearch Index',
  description: 'Configure your new vector index in Elasticsearch',
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
          description: 'Unique name (lowercase, alphanumeric and underscores)',
          rules: [
            { type: 'minLength', value: 1, message: 'Index name is required' },
            {
              type: 'pattern',
              value: '^[a-z0-9_-]+$',
              message: 'Must be lowercase letters, numbers, hyphens or underscores',
            },
          ],
        },
      ],
    },
    {
      key: 'vectors',
      title: 'Vector Configuration',
      description: 'Configure dense vector field for kNN search',
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
              description: 'One dense vector per document',
            },
            { label: 'Named Vectors', value: 'named', description: 'Multiple named vector fields' },
          ],
        },
        {
          key: 'size',
          label: 'Vector Dimensions',
          type: 'number',
          required: true,
          defaultValue: ELASTICSEARCH_DEFAULTS.vectorSize,
          min: 1,
          max: 4096,
          description: 'Number of dimensions (e.g., 1536 for OpenAI)',
          showWhen: { field: 'vectorType', operator: 'equals', value: 'single' },
        },
        {
          key: 'similarity',
          label: 'Similarity Metric',
          type: 'select',
          required: true,
          defaultValue: ELASTICSEARCH_DEFAULTS.similarity,
          options: [...ELASTICSEARCH_DISTANCE_METRICS],
          description: 'Similarity for kNN search',
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
              label: 'Field Name',
              type: 'text',
              required: true,
              placeholder: 'embedding',
            },
            {
              key: 'size',
              label: 'Dimensions',
              type: 'number',
              required: true,
              defaultValue: ELASTICSEARCH_DEFAULTS.vectorSize,
              min: 1,
              max: 4096,
            },
            {
              key: 'similarity',
              label: 'Similarity',
              type: 'select',
              required: true,
              defaultValue: ELASTICSEARCH_DEFAULTS.similarity,
              options: [...ELASTICSEARCH_DISTANCE_METRICS],
            },
          ],
          addButtonText: 'Add Vector',
        },
      ],
    },
    {
      key: 'sparse',
      title: 'Sparse Vectors (optional)',
      description: 'Add sparse_vector fields for keyword-style / ELSER search',
      collapsible: true,
      defaultCollapsed: true,
      items: [
        {
          key: 'sparseVectors',
          label: 'Sparse Vector Fields',
          type: 'array',
          itemType: 'object',
          itemLabel: 'Sparse field',
          minItems: 0,
          itemFields: [
            {
              key: 'name',
              label: 'Field Name',
              type: 'text',
              required: true,
              placeholder: 'sparse_tokens',
            },
          ],
          addButtonText: 'Add Sparse Vector',
        },
      ],
    },
  ],
  showSubmit: true,
  showCancel: true,
  submitText: 'Create Index',
};

// ============================================
// Filter Builder (FilterQuery -> ES bool)
// ============================================

function buildElasticsearchFilter(filter: FilterQuery): Record<string, unknown> {
  if (!filter.conditions || filter.conditions.length === 0) {
    return { match_all: {} };
  }

  const clauses: Record<string, unknown>[] = [];

  for (const cond of filter.conditions) {
    const field = cond.field === 'id' ? '_id' : cond.field;

    if (cond.operator === 'eq') {
      if (cond.valueType === 'number') {
        clauses.push({ term: { [field]: Number(cond.value) } });
      } else if (cond.valueType === 'boolean') {
        clauses.push({ term: { [field]: Boolean(cond.value) } });
      } else {
        clauses.push({ term: { [field]: String(cond.value) } });
      }
    } else if (cond.operator === 'neq') {
      if (cond.valueType === 'number') {
        clauses.push({ bool: { must_not: [{ term: { [field]: Number(cond.value) } }] } });
      } else if (cond.valueType === 'boolean') {
        clauses.push({ bool: { must_not: [{ term: { [field]: Boolean(cond.value) } }] } });
      } else {
        clauses.push({ bool: { must_not: [{ term: { [field]: String(cond.value) } }] } });
      }
    } else if (cond.valueType === 'number') {
      const num = Number(cond.value);
      const range: Record<string, number> = {};
      if (cond.operator === 'gt') range.gt = num;
      else if (cond.operator === 'gte') range.gte = num;
      else if (cond.operator === 'lt') range.lt = num;
      else if (cond.operator === 'lte') range.lte = num;
      if (Object.keys(range).length > 0) {
        clauses.push({ range: { [field]: range } });
      }
    } else if (cond.operator === 'contains' || cond.operator === 'starts_with') {
      clauses.push({ match_phrase_prefix: { [field]: String(cond.value) } });
    }
  }

  if (clauses.length === 0) {
    return { match_all: {} };
  }

  if (filter.logic === 'and') {
    return { bool: { must: clauses } };
  } else {
    return { bool: { should: clauses, minimum_should_match: 1 } };
  }
}

// ============================================
// Elasticsearch Client
// ============================================

export class ElasticsearchClient implements VectorDBClient {
  private client: ElasticsearchClientSDK;

  constructor(config: ConnectionConfig) {
    if (!config.host) {
      throw new Error('Host is required for Elasticsearch connection');
    }

    const protocol = config.https ? 'https' : 'http';
    const node = `${protocol}://${config.host}${config.port ? `:${config.port}` : ''}`;

    const clientConfig: any = {
      node,
    };

    if (config.apiKey && config.apiKey.trim()) {
      clientConfig.auth = { apiKey: config.apiKey.trim() };
    } else if (config.user && config.password) {
      clientConfig.auth = { username: config.user, password: config.password };
    }

    log.info('[Elasticsearch] Client config:', { node: clientConfig.node });
    this.client = new ElasticsearchClientSDK(clientConfig);
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const response = await this.client.info();
      const version =
        (response as any).version?.number ?? (response as any).version ?? 'Elasticsearch';
      log.info('[Elasticsearch] Connection successful:', { version });
      return { success: true, version: `Elasticsearch ${version}` };
    } catch (error: any) {
      const message = error?.meta?.body?.error?.reason ?? error?.message ?? 'Connection failed';
      return { success: false, error: message };
    }
  }

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      const response = await this.client.cat.indices({ format: 'json' });
      const indices = response as any as Array<{ index: string; 'docs.count'?: string }>;
      const collections: Collection[] = [];

      for (const idx of indices) {
        const name = idx.index;
        if (name.startsWith('.')) continue;
        const count = parseInt((idx as any)['docs.count'] ?? '0', 10) || 0;
        collections.push({ name, count });
      }

      return { success: true, collections };
    } catch (error: any) {
      const message =
        error?.meta?.body?.error?.reason ?? error?.message ?? 'Failed to list indices';
      return { success: false, error: message };
    }
  }

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    const index = toIndexName(collection);
    try {
      const [countResp, mappingResp] = await Promise.all([
        this.client.count({ index }),
        this.client.indices.getMapping({ index }),
      ]);
      const count = (countResp as any).count ?? 0;
      const mapping = (mappingResp as any)[index]?.mappings ?? {};
      return { success: true, data: { count, mapping } };
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        return { success: false, error: `Index ${index} not found` };
      }
      const message =
        error?.meta?.body?.error?.reason ?? error?.message ?? 'Failed to get index info';
      return { success: false, error: message };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    const index = toIndexName(collection);
    try {
      const mappingResp = await this.client.indices.getMapping({ index });
      const mapping = (mappingResp as any)[index]?.mappings?.properties ?? {};
      const fields: Record<string, SchemaField> = {};
      const vectors: Record<string, VectorSchemaField> = {};

      for (const [name, prop] of Object.entries(mapping as Record<string, any>)) {
        if (!prop || name === 'id' || name === '_id') continue;

        if (prop.type === 'dense_vector') {
          vectors[name] = {
            name,
            type: 'vector',
            vectorType: 'dense',
            size: prop.dims ?? 0,
            distance: prop.similarity ?? 'cosine',
          };
        } else if (prop.type === 'rank_features' || prop.type === 'sparse_vector') {
          vectors[name] = {
            name,
            type: 'vector',
            vectorType: 'sparse',
          };
        } else {
          let type: SchemaField['type'] = 'unknown';
          switch (prop.type) {
            case 'keyword':
            case 'text':
              type = 'string';
              break;
            case 'long':
            case 'integer':
            case 'short':
            case 'float':
            case 'double':
              type = 'number';
              break;
            case 'boolean':
              type = 'boolean';
              break;
            case 'date':
              type = 'date';
              break;
          }
          fields[name] = {
            name,
            type,
            searchable: prop.type === 'text',
          };
        }
      }

      const totalVectors = Object.keys(vectors).length;
      const defaultVectorName =
        totalVectors === 1 ? Object.keys(vectors)[0] : COLLECTION_DEFAULT_VECTOR;
      if (totalVectors === 1 && vectors[defaultVectorName]) {
        vectors[COLLECTION_DEFAULT_VECTOR] = {
          ...vectors[defaultVectorName],
          name: COLLECTION_DEFAULT_VECTOR,
        };
      }

      return {
        success: true,
        schema: {
          primary: { name: 'id', type: 'string', autoID: false },
          fields,
          vectors:
            totalVectors > 0
              ? vectors
              : {
                  [COLLECTION_DEFAULT_VECTOR]: {
                    name: COLLECTION_DEFAULT_VECTOR,
                    type: 'vector',
                    vectorType: 'dense',
                    size: 0,
                    distance: 'cosine',
                  },
                },
          multipleVectors: totalVectors > 1,
          hasVectors: totalVectors > 0,
        },
      };
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        return { success: false, error: `Index ${index} not found` };
      }
      const message = error?.meta?.body?.error?.reason ?? error?.message ?? 'Failed to get schema';
      return { success: false, error: message };
    }
  }

  async getSearchCapabilities(
    _collection: string,
    schema?: CollectionSchema | null,
  ): Promise<SearchCapabilities> {
    return mergeWithDefault(
      {
        dense: true,
        sparse: true,
        lexical: true,
        supportsHybridAlpha: true,
        hybridAlphaDefault: 0.75,
        fusionStrategies: ['rrf', 'weighted', 'server'],
        serverSideHybridNative: true,
      },
      schema,
    );
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    const name = (config.name as string)?.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || '';
    if (!name) {
      return { success: false, error: 'Index name is required' };
    }

    const vectorType = config.vectorType as string;
    const properties: Record<string, any> = {
      id: { type: 'keyword' },
    };

    if (vectorType === 'named') {
      const namedVectors = config.namedVectors as Array<{
        name: string;
        size: number;
        similarity: string;
      }>;
      for (const v of namedVectors || []) {
        const fieldName = (v.name || 'embedding').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        properties[fieldName] = {
          type: 'dense_vector',
          dims: v.size ?? ELASTICSEARCH_DEFAULTS.vectorSize,
          index: true,
          similarity: (v.similarity as string) ?? ELASTICSEARCH_DEFAULTS.similarity,
        };
      }
    } else {
      properties.embedding = {
        type: 'dense_vector',
        dims: (config.size as number) ?? ELASTICSEARCH_DEFAULTS.vectorSize,
        index: true,
        similarity: (config.similarity as string) ?? ELASTICSEARCH_DEFAULTS.similarity,
      };
    }

    const sparseVectors = config.sparseVectors as Array<{ name: string }> | undefined;
    if (sparseVectors?.length) {
      for (const v of sparseVectors) {
        const fieldName = (v.name || 'sparse_tokens').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        properties[fieldName] = { type: 'sparse_vector' };
      }
    }

    try {
      await this.client.indices.create({
        index: name,
        body: {
          mappings: {
            properties: {
              ...properties,
              metadata: { type: 'object', enabled: false },
            },
            dynamic: true,
          },
        },
      });
      log.info('[Elasticsearch] Created index:', name);
      return { success: true };
    } catch (error: any) {
      const message =
        error?.meta?.body?.error?.reason ?? error?.message ?? 'Failed to create index';
      return { success: false, error: message };
    }
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    return elasticsearchCreateCollectionSchema;
  }

  async upsertDocument(
    collection: string,
    data: UpsertDocumentData,
  ): Promise<UpsertDocumentResult> {
    const index = toIndexName(collection);
    const { document } = data;
    const id = document?.primary?.value != null ? String(document.primary.value) : undefined;

    const body: Record<string, any> = { ...(document?.payload ?? {}) };

    if (document?.vectors) {
      for (const [key, vec] of Object.entries(document.vectors)) {
        if (vec.vectorType === 'dense' && 'data' in vec.value) {
          const fieldName = key === COLLECTION_DEFAULT_VECTOR ? 'embedding' : key;
          body[fieldName] = vec.value.data;
        } else if (vec.vectorType === 'sparse' && 'indices' in vec.value && 'values' in vec.value) {
          body[key] = sparseToESQueryVector(vec.value.indices, vec.value.values);
        }
      }
    }

    if (id !== undefined) body.id = id;

    try {
      await this.client.index({
        index,
        id: id ?? undefined,
        document: body,
        refresh: true,
      });
      return { success: true, document: { ...body, id: id ?? body.id } };
    } catch (error: any) {
      const message = error?.meta?.body?.error?.reason ?? error?.message ?? 'Upsert failed';
      log.error('[Elasticsearch] Upsert error:', error);
      return { success: false, error: message };
    }
  }

  private hitToDocument(hit: any, vectorFieldNames: string[]): Document {
    const src = hit._source ?? {};
    const fields = hit.fields ?? {};
    for (const key of vectorFieldNames) {
      const fromFields = fields[key];
      if (fromFields !== undefined && src[key] === undefined) {
        (src as any)[key] = Array.isArray(fromFields) ? fromFields[0] : fromFields;
      }
    }
    const vectors: Record<string, DocumentVector> = {};

    for (const key of vectorFieldNames) {
      const raw = src[key] ?? src[key === COLLECTION_DEFAULT_VECTOR ? 'embedding' : key];
      if (Array.isArray(raw)) {
        vectors[key] = {
          key,
          vectorType: 'dense',
          size: raw.length,
          value: { data: raw },
        };
      } else if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as any).indices) &&
        Array.isArray((raw as any).values)
      ) {
        vectors[key] = {
          key,
          vectorType: 'sparse',
          value: { indices: (raw as any).indices, values: (raw as any).values },
        };
      } else if (
        raw &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        raw !== null &&
        !('indices' in raw)
      ) {
        const obj = raw as Record<string, number>;
        const { indices, values } = esSparseToIndicesValues(obj);
        if (indices.length > 0) {
          vectors[key] = { key, vectorType: 'sparse', value: { indices, values } };
        }
      }
    }

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k !== 'embedding' && !vectorFieldNames.includes(k) && k !== 'id') {
        payload[k] = v;
      }
    }

    const primaryValue = hit._id ?? src.id ?? hit._id;
    const score = (hit._score ?? 0) as number;

    return {
      primary: { name: 'id', value: primaryValue },
      vectors,
      score,
      payload,
    };
  }

  async getDocuments(
    collection: string,
    options?: GetDocumentsOptions,
  ): Promise<GetDocumentsResult> {
    const index = toIndexName(collection);
    const limit = options?.limit ?? 50;
    const from = typeof options?.offset === 'number' ? options.offset : 0;

    try {
      const schemaResult = await this.getCollectionSchema(collection);
      const vectorSchema = schemaResult.schema?.vectors ?? {};
      const vectorFieldNames = Object.keys(vectorSchema);
      const esVectorFieldNames = [
        ...new Set(
          vectorFieldNames.map((k) => (k === COLLECTION_DEFAULT_VECTOR ? 'embedding' : k)),
        ),
      ];

      const filterQuery = options?.filter
        ? buildElasticsearchFilter(options.filter)
        : { match_all: {} };

      // ES does not allow sorting by _id; use document field "id" (keyword) when primary is id.
      // For payload fields: text fields are not sortable; use field.keyword. Others use field as-is.
      const sort: any[] = [];
      if (options?.sort?.length) {
        let properties: Record<string, { type?: string }> = {};
        try {
          const mappingResp = await this.client.indices.getMapping({ index });
          properties = (mappingResp as any)[index]?.mappings?.properties ?? {};
        } catch {
          // ignore; will use field name as-is for non-id
        }
        for (const s of options.sort) {
          const rawField = s.field === 'id' ? 'id' : s.field;
          const prop = properties[rawField];
          const sortField =
            rawField !== 'id' && prop?.type === 'text' ? `${rawField}.keyword` : rawField;
          sort.push({ [sortField]: s.order });
        }
      }

      // Do not request `fields` for vector field names: dense_vector does not support docvalue_fields
      // and can cause "all shards failed". Vectors are returned in _source.
      const response = await this.client.search({
        index,
        body: {
          query: filterQuery,
          size: limit,
          from,
          ...(sort.length > 0 && { sort }),
          _source: true,
        },
      });

      const hits = (response as any).hits?.hits ?? [];
      const documents: Document[] = hits.map((hit: any) =>
        this.hitToDocument(hit, vectorFieldNames.length > 0 ? vectorFieldNames : ['embedding']),
      );

      const total = (response as any).hits?.total;
      const totalValue = typeof total === 'object' ? (total?.value ?? total) : total;
      const nextFrom = from + hits.length;
      const nextOffset = nextFrom < (totalValue ?? 0) ? nextFrom : null;

      return {
        success: true,
        documents,
        nextOffset,
        totalCount: totalValue,
      };
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        return { success: false, error: `Index ${index} not found` };
      }
      const message =
        error?.meta?.body?.error?.reason ?? error?.message ?? 'Failed to get documents';
      return { success: false, error: message };
    }
  }

  async search(
    collection: string,
    vectors: Record<string, DocumentVector>,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = performance.now();
    const index = toIndexName(collection);

    try {
      const schemaResult = await this.getCollectionSchema(collection);
      const vectorFields =
        schemaResult.schema?.vectors != null
          ? Object.keys(schemaResult.schema.vectors).filter((k) => k !== COLLECTION_DEFAULT_VECTOR)
          : [];
      const defaultVecName = schemaResult.schema?.vectors?.[COLLECTION_DEFAULT_VECTOR]
        ? COLLECTION_DEFAULT_VECTOR
        : (vectorFields[0] ?? 'embedding');

      const filterClause = options?.filter ? buildElasticsearchFilter(options.filter) : undefined;

      const limit = options?.limit ?? 10;
      const numCandidates = Math.max(limit * 10, ELASTICSEARCH_DEFAULTS.numCandidates);

      const vectorKeys = Object.keys(vectors);
      const denseKey = vectorKeys.find((k) => vectors[k].vectorType === 'dense');
      const denseVector = denseKey ? vectors[denseKey] : null;
      const vectorArray =
        denseVector && denseVector.vectorType === 'dense' && 'data' in denseVector.value
          ? denseVector.value.data
          : null;

      const sparseKey = vectorKeys.find((k) => vectors[k].vectorType === 'sparse');
      const sparseVector = sparseKey ? vectors[sparseKey] : null;
      const sparseQueryVector =
        sparseVector &&
        sparseVector.vectorType === 'sparse' &&
        'indices' in sparseVector.value &&
        'values' in sparseVector.value
          ? sparseToESQueryVector(sparseVector.value.indices, sparseVector.value.values)
          : null;

      const knnFieldName =
        denseKey === COLLECTION_DEFAULT_VECTOR ? 'embedding' : (denseKey ?? 'embedding');
      const sparseFieldName = sparseKey ?? 'sparse_tokens';

      const useLexical = Boolean(options?.lexicalQuery?.trim());
      const lexicalQuery = options?.lexicalQuery?.trim();

      // multi_match with fields: ['*'] can hit dense_vector and fail; use only text-capable fields
      const schemaFields = schemaResult.schema?.fields ?? {};
      const textFields = Object.entries(schemaFields)
        .filter(([, f]) => (f as { searchable?: boolean }).searchable === true)
        .map(([name]) => name);
      const lexicalFields = textFields.length > 0 ? textFields : ['text', 'category'];

      // Cosine (and similar) does not support zero-magnitude vectors; skip knn when vector is all zeros (e.g. keyword-only search)
      const useDenseVector = vectorArray && hasNonZeroMagnitude(vectorArray);

      // hybridAlpha: 0 = keyword only, 1 = vector only, 0.5 = equal (both). Same semantics as Weaviate.
      const alpha = Math.max(0, Math.min(1, options?.hybridAlpha ?? 0.75));
      const alphaEpsilon = 1e-6;
      const includeKnn = useDenseVector && (!lexicalQuery || alpha > alphaEpsilon);
      const includeLexical = lexicalQuery && (!useDenseVector || alpha < 1 - alphaEpsilon);

      let body: any;

      const subSearches: any[] = [];
      if (includeKnn) {
        subSearches.push({
          knn: {
            field: knnFieldName,
            query_vector: vectorArray,
            k: limit,
            num_candidates: numCandidates,
            ...(options?.scoreThreshold != null && { min_score: options.scoreThreshold }),
          },
        });
      }
      if (includeLexical) {
        subSearches.push({
          query: {
            multi_match: { query: lexicalQuery!, fields: lexicalFields, fuzziness: 'AUTO' },
          },
        });
      }
      if (sparseQueryVector && Object.keys(sparseQueryVector).length > 0) {
        subSearches.push({
          query: {
            sparse_vector: {
              field: sparseFieldName,
              query_vector: sparseQueryVector,
            },
          },
        });
      }

      if (subSearches.length === 0) {
        return {
          success: false,
          error: 'Provide at least one of: dense vector, sparse vector, or lexical query',
        };
      }

      if (subSearches.length === 1) {
        const single = subSearches[0];
        if (single.knn) {
          body = {
            knn: single.knn,
            ...(filterClause && !(filterClause as any).match_all && { filter: filterClause }),
            size: limit,
            _source: true,
          };
        } else if (single.query) {
          const queryClause = single.query;
          body = {
            query:
              filterClause && !(filterClause as any).match_all
                ? { bool: { must: [queryClause], filter: [filterClause] } }
                : queryClause,
            size: limit,
            _source: true,
          };
        } else {
          return { success: false, error: 'Invalid search clause' };
        }
      } else {
        // Hybrid: use retriever API with RRF (sub_searches does not accept knn in ES 8.15)
        const retrievers: any[] = [];
        for (const s of subSearches) {
          if (s.knn) {
            const knnRetriever: any = {
              knn: {
                field: s.knn.field,
                query_vector: s.knn.query_vector,
                k: s.knn.k,
                num_candidates: s.knn.num_candidates,
                ...(s.knn.min_score != null && { similarity: s.knn.min_score }),
              },
            };
            if (filterClause && !(filterClause as any).match_all)
              knnRetriever.knn.filter = filterClause;
            retrievers.push(knnRetriever);
          } else if (s.query) {
            const queryClause =
              filterClause && !(filterClause as any).match_all
                ? { bool: { must: [s.query], filter: [filterClause] } }
                : s.query;
            retrievers.push({ standard: { query: queryClause } });
          }
        }
        body = {
          retriever: {
            rrf: {
              retrievers,
              rank_constant: 60,
              rank_window_size: Math.max(limit, 10),
            },
          },
          size: limit,
          _source: true,
        };
      }

      let response: any;
      try {
        response = await this.client.search({ index, body });
      } catch (retrieverError: any) {
        const errMsg = retrieverError?.meta?.body?.error?.reason ?? retrieverError?.message ?? '';
        const isRrfLicenseError =
          subSearches.length > 1 &&
          (errMsg.includes('RRF') ||
            errMsg.includes('Reciprocal Rank Fusion') ||
            errMsg.includes('non-compliant'));
        if (isRrfLicenseError) {
          // Fallback: run knn and query separately, merge with RRF on the client (free ES has no server-side RRF)
          const k = 60;
          const allVectorFields = schemaResult.schema?.vectors
            ? Object.keys(schemaResult.schema.vectors)
            : [defaultVecName, 'embedding'];
          const hitsByDocId = new Map<string, { hit: any; rrfScore: number }>();
          const addRrfScores = (hits: any[], rankOffset: number) => {
            hits.forEach((hit: any, idx: number) => {
              const id = hit._id ?? hit._source?.id;
              if (id == null) return;
              const rank = rankOffset + idx + 1;
              const rrfScore = 1 / (k + rank);
              const existing = hitsByDocId.get(String(id));
              if (existing) existing.rrfScore += rrfScore;
              else hitsByDocId.set(String(id), { hit, rrfScore });
            });
          };
          for (const s of subSearches) {
            let searchBody: any;
            if (s.knn) {
              searchBody = {
                knn: s.knn,
                ...(filterClause && !(filterClause as any).match_all && { filter: filterClause }),
                size: Math.max(limit, 10),
                _source: true,
              };
            } else if (s.query) {
              const queryClause =
                filterClause && !(filterClause as any).match_all
                  ? { bool: { must: [s.query], filter: [filterClause] } }
                  : s.query;
              searchBody = { query: queryClause, size: Math.max(limit, 10), _source: true };
            } else continue;
            const res = await this.client.search({ index, body: searchBody });
            const h = (res as any).hits?.hits ?? [];
            addRrfScores(h, 0);
          }
          const merged = [...hitsByDocId.entries()]
            .sort((a, b) => b[1].rrfScore - a[1].rrfScore)
            .slice(0, limit)
            .map(([, v]) => v.hit);
          const documents: Document[] = merged.map((hit: any) =>
            this.hitToDocument(hit, allVectorFields),
          );
          const searchTimeMs = performance.now() - startTime;
          return { success: true, documents, metadata: { searchTimeMs } };
        }
        throw retrieverError;
      }

      const hits = (response as any).hits?.hits ?? [];
      const allVectorFields = schemaResult.schema?.vectors
        ? Object.keys(schemaResult.schema.vectors)
        : [defaultVecName, 'embedding'];
      const documents: Document[] = hits.map((hit: any) =>
        this.hitToDocument(hit, allVectorFields),
      );

      const searchTimeMs = performance.now() - startTime;
      return {
        success: true,
        documents,
        metadata: { searchTimeMs },
      };
    } catch (error: any) {
      const rootCause = (error?.meta?.body?.error?.root_cause ?? [])[0];
      const message =
        rootCause?.reason ?? error?.meta?.body?.error?.reason ?? error?.message ?? 'Search failed';
      log.warn('[Elasticsearch] Search failed:', message);
      return { success: false, error: message };
    }
  }

  async deleteDocument(
    collection: string,
    primary: Document['primary'],
  ): Promise<DeleteDocumentResult> {
    const index = toIndexName(collection);
    const id = String(primary.value);
    try {
      await this.client.delete({ index, id, refresh: true });
      return { success: true };
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        return { success: true };
      }
      const message = error?.meta?.body?.error?.reason ?? error?.message ?? 'Delete failed';
      return { success: false, error: message };
    }
  }

  async deleteDocuments(collection: string, filter: FilterQuery): Promise<DeleteDocumentsResult> {
    const index = toIndexName(collection);
    try {
      const query = buildElasticsearchFilter(filter);
      const response = await this.client.deleteByQuery({
        index,
        body: { query },
        refresh: true,
      });
      const deleted = (response as any).deleted ?? 0;
      return { success: true, deletedCount: deleted };
    } catch (error: any) {
      const message =
        error?.meta?.body?.error?.reason ?? error?.message ?? 'Delete by query failed';
      return { success: false, error: message };
    }
  }

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    const index = toIndexName(collection);
    try {
      await this.client.indices.delete({ index });
      return { success: true };
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        return { success: true };
      }
      const message =
        error?.meta?.body?.error?.reason ?? error?.message ?? 'Failed to delete index';
      return { success: false, error: message };
    }
  }

  async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
    const result = await this.deleteDocuments(collection, { conditions: [], logic: 'and' });
    return {
      success: result.success,
      deletedCount: result.deletedCount ?? 0,
      error: result.error,
    };
  }
}
