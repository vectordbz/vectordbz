import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AhnlichClient } from '../clients/ahnlich';
import { createClient } from '../index';
import { COLLECTION_DEFAULT_VECTOR, type DocumentVector } from '../../types';
import { TEST_CONFIGS } from './test-utils';

const TEST_ENTRIES = [
  { label: 'one', vector: [1, 0, 0] },
  { label: 'two', vector: [0, 1, 0] },
  { label: 'three', vector: [0, 0, 1] },
] as const;

function denseVectors(vector: readonly number[]): Record<string, DocumentVector> {
  return {
    [COLLECTION_DEFAULT_VECTOR]: {
      key: COLLECTION_DEFAULT_VECTOR,
      vectorType: 'dense',
      size: vector.length,
      value: {
        data: [...vector],
      },
    },
  };
}

describe('Ahnlich Client Integration Tests', () => {
  const storeName = `vectordbz_ahnlich_${Date.now()}`;

  let client: AhnlichClient;
  let storeCreated = false;

  async function upsertTestEntry(entry: (typeof TEST_ENTRIES)[number]): Promise<void> {
    const result = await client.upsertDocument(storeName, {
      document: {
        vectors: denseVectors(entry.vector),
        payload: {
          label: entry.label,
        },
      },
    });

    expect(result.success).toBe(true);
  }

  beforeAll(async () => {
    client = new AhnlichClient(TEST_CONFIGS.ahnlich);

    const connection = await client.testConnection();
    expect(connection.success).toBe(true);

    const creation = await client.createCollection({
      name: storeName,
      dimension: 3,
      predicateIndices: ['label'],
    });

    expect(creation.success).toBe(true);
    storeCreated = true;

    for (const entry of TEST_ENTRIES) {
      await upsertTestEntry(entry);
    }
  }, 30_000);

  afterAll(async () => {
    if (!storeCreated) {
      return;
    }

    const result = await client.dropCollection(storeName);
    expect(result.success).toBe(true);
  }, 30_000);

  it('registers Ahnlich in the client factory', () => {
    const factoryClient = createClient('ahnlich', TEST_CONFIGS.ahnlich);

    expect(factoryClient).toBeInstanceOf(AhnlichClient);
  });

  it('lists the created store and returns its information', async () => {
    const collections = await client.getCollections();

    expect(collections.success).toBe(true);
    expect(collections.collections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: storeName,
          count: 3,
        }),
      ]),
    );

    const info = await client.getCollectionInfo(storeName);

    expect(info.success).toBe(true);
    expect(info.data).toMatchObject({
      name: storeName,
      count: 3,
      dimension: 3,
      predicateIndices: ['label'],
      schema: 'public',
    });
  });

  it('maps the Ahnlich store definition to a VectorDBZ schema', async () => {
    const result = await client.getCollectionSchema(storeName);

    expect(result.success).toBe(true);
    expect(result.schema).toMatchObject({
      primary: {
        name: 'vector_key',
        type: 'string',
        autoID: true,
      },
      fields: {
        label: {
          name: 'label',
          type: 'string',
          searchable: false,
        },
      },
      vectors: {
        [COLLECTION_DEFAULT_VECTOR]: {
          vectorType: 'dense',
          size: 3,
        },
      },
      multipleVectors: false,
      hasVectors: true,
    });
  });

  it('reports only the search capabilities Ahnlich supports', async () => {
    const capabilities = await client.getSearchCapabilities(storeName);

    expect(capabilities).toEqual({
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
    });
  });

  it('uses the public schema when the connection omits schema', async () => {
    const defaultSchemaClient = new AhnlichClient({
      type: 'ahnlich',
      host: TEST_CONFIGS.ahnlich.host,
      port: TEST_CONFIGS.ahnlich.port,
    });

    const result = await defaultSchemaClient.getCollections();

    expect(result.success).toBe(true);
    expect(result.collections?.some((collection) => collection.name === storeName)).toBe(true);
  });

  it('forwards the opaque cursor and maps nextOffset', async () => {
    const firstPage = await client.getDocuments(storeName, {
      limit: 2,
    });

    expect(firstPage.success).toBe(true);
    expect(firstPage.documents).toHaveLength(2);
    expect(firstPage.totalCount).toBe(3);

    if (!firstPage.documents || typeof firstPage.nextOffset !== 'string') {
      throw new Error('Expected the first page to return an opaque cursor');
    }

    const firstPageKeys = new Set(firstPage.documents.map((document) => document.primary.value));

    const secondPage = await client.getDocuments(storeName, {
      limit: 2,
      offset: firstPage.nextOffset,
    });

    expect(secondPage.success).toBe(true);
    expect(secondPage.documents).toHaveLength(1);
    expect(secondPage.nextOffset).toBeNull();
    expect(secondPage.totalCount).toBe(3);

    if (!secondPage.documents) {
      throw new Error('Expected a second page of documents');
    }

    for (const document of secondPage.documents) {
      expect(firstPageKeys.has(document.primary.value)).toBe(false);
    }

    const labels = [...firstPage.documents, ...secondPage.documents].map(
      (document) => document.payload.label,
    );

    expect(labels).toHaveLength(3);
    expect(labels).toEqual(expect.arrayContaining(['one', 'two', 'three']));
  });

  it('converts Ahnlich entries into VectorDBZ documents', async () => {
    const result = await client.getDocuments(storeName, {
      limit: 3,
    });

    expect(result.success).toBe(true);

    const document = result.documents?.find((item) => item.payload.label === 'two');

    expect(document).toBeDefined();

    if (!document) {
      throw new Error('Expected to find the entry labelled "two"');
    }

    expect(document.primary).toEqual({
      name: 'vector_key',
      value: '[0,1,0]',
    });

    const vector = document.vectors[COLLECTION_DEFAULT_VECTOR];

    expect(vector).toBeDefined();
    expect(vector.vectorType).toBe('dense');

    if (vector.vectorType === 'dense') {
      expect(vector.size).toBe(3);
      expect(vector.value.data).toEqual([0, 1, 0]);
    }
  });

  it('omits totalCount for filtered requests', async () => {
    const result = await client.getDocuments(storeName, {
      limit: 10,
      filter: {
        logic: 'and',
        conditions: [
          {
            field: 'label',
            operator: 'eq',
            value: 'two',
            valueType: 'string',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.documents).toHaveLength(1);
    expect(result.documents?.[0].payload.label).toBe('two');
    expect(result).not.toHaveProperty('totalCount');
  });

  it('performs dense vector search', async () => {
    const result = await client.search(storeName, denseVectors([0, 1, 0]), { limit: 3 });

    expect(result.success).toBe(true);
    expect(result.documents).toHaveLength(3);
    expect(result.documents?.[0].payload.label).toBe('two');
    expect(result.documents?.[0].score).toBeCloseTo(1);
    expect(result.metadata).toMatchObject({
      requestedTopK: 3,
      returnedCount: 3,
      queryVectorDimension: 3,
      filterApplied: false,
    });
  });

  it('applies metadata filters to dense vector search', async () => {
    const result = await client.search(storeName, denseVectors([1, 0, 0]), {
      limit: 3,
      filter: {
        logic: 'and',
        conditions: [
          {
            field: 'label',
            operator: 'eq',
            value: 'three',
            valueType: 'string',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.documents).toHaveLength(1);
    expect(result.documents?.[0].payload.label).toBe('three');
    expect(result.metadata?.filterApplied).toBe(true);
  });

  it.each([
    { operator: 'neq', value: 'two', expected: ['one', 'three'] },
    { operator: 'in', value: 'two', expected: ['two'] },
    { operator: 'not_in', value: 'two', expected: ['one', 'three'] },
  ])('translates the $operator metadata operator', async ({ operator, value, expected }) => {
    const result = await client.getDocuments(storeName, {
      limit: 10,
      filter: {
        logic: 'and',
        conditions: [
          {
            field: 'label',
            operator,
            value,
            valueType: 'string',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.documents?.map((document) => document.payload.label)).toEqual(
      expect.arrayContaining(expected),
    );
    expect(result.documents).toHaveLength(expected.length);
  });

  it('combines metadata filters with AND', async () => {
    const result = await client.getDocuments(storeName, {
      limit: 10,
      filter: {
        logic: 'and',
        conditions: [
          { field: 'label', operator: 'neq', value: 'two', valueType: 'string' },
          { field: 'label', operator: 'neq', value: 'three', valueType: 'string' },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.documents).toHaveLength(1);
    expect(result.documents?.[0].payload.label).toBe('one');
  });

  it('combines metadata filters with OR', async () => {
    const result = await client.getDocuments(storeName, {
      limit: 10,
      filter: {
        logic: 'or',
        conditions: [
          { field: 'label', operator: 'eq', value: 'one', valueType: 'string' },
          { field: 'label', operator: 'eq', value: 'three', valueType: 'string' },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.documents?.map((document) => document.payload.label)).toEqual(
      expect.arrayContaining(['one', 'three']),
    );
    expect(result.documents).toHaveLength(2);
  });

  it('rejects unsupported and non-indexed metadata filters', async () => {
    const unsupported = await client.getDocuments(storeName, {
      filter: {
        logic: 'and',
        conditions: [{ field: 'label', operator: 'contains', value: 'o', valueType: 'string' }],
      },
    });

    expect(unsupported.success).toBe(false);
    expect(unsupported.error).toContain('does not support filter operator "contains"');

    const nonIndexed = await client.getDocuments(storeName, {
      filter: {
        logic: 'and',
        conditions: [{ field: 'missing', operator: 'eq', value: 'value', valueType: 'string' }],
      },
    });

    expect(nonIndexed.success).toBe(false);
    expect(nonIndexed.error).toContain('does not have a predicate index');
  });

  it('rejects vectors with the wrong dimension', async () => {
    const searchResult = await client.search(storeName, denseVectors([1, 0]), { limit: 1 });

    expect(searchResult.success).toBe(false);
    expect(searchResult.error).toContain('does not match store dimension 3');

    const upsertResult = await client.upsertDocument(storeName, {
      document: {
        vectors: denseVectors([1, 0]),
        payload: { label: 'wrong-dimension' },
      },
    });

    expect(upsertResult.success).toBe(false);
    expect(upsertResult.error).toContain('does not match store dimension 3');
  });

  it.each([
    { name: 'score threshold', options: { scoreThreshold: 0.5 }, error: 'score-threshold' },
    { name: 'named vector', options: { vectorKey: 'other' }, error: 'single default vector' },
    { name: 'lexical query', options: { lexicalQuery: 'hello' }, error: 'lexical search' },
    { name: 'hybrid search', options: { hybridAlpha: 0.5 }, error: 'hybrid search' },
  ])('rejects unsupported $name search', async ({ options, error }) => {
    const result = await client.search(storeName, denseVectors([1, 0, 0]), options);

    expect(result.success).toBe(false);
    expect(result.error).toContain(error);
  });

  it('deletes an entry by its vector key', async () => {
    const entry = TEST_ENTRIES[0];

    try {
      const result = await client.deleteDocument(storeName, {
        name: 'vector_key',
        value: JSON.stringify(entry.vector),
      });

      expect(result.success).toBe(true);

      const remaining = await client.getDocuments(storeName, {
        filter: {
          logic: 'and',
          conditions: [{ field: 'label', operator: 'eq', value: entry.label, valueType: 'string' }],
        },
      });

      expect(remaining.success).toBe(true);
      expect(remaining.documents).toEqual([]);
    } finally {
      await upsertTestEntry(entry);
    }
  });

  it('deletes entries by metadata predicate', async () => {
    const entry = TEST_ENTRIES[1];

    try {
      const result = await client.deleteDocuments(storeName, {
        logic: 'and',
        conditions: [{ field: 'label', operator: 'eq', value: entry.label, valueType: 'string' }],
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);

      const remaining = await client.getDocuments(storeName, {
        filter: {
          logic: 'and',
          conditions: [{ field: 'label', operator: 'eq', value: entry.label, valueType: 'string' }],
        },
      });

      expect(remaining.success).toBe(true);
      expect(remaining.documents).toEqual([]);
    } finally {
      await upsertTestEntry(entry);
    }
  });

  it('rejects numeric offsets', async () => {
    const result = await client.getDocuments(storeName, {
      limit: 2,
      offset: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('opaque nextOffset cursor');
  });

  it('rejects user-configurable sorting', async () => {
    const result = await client.getDocuments(storeName, {
      limit: 2,
      sort: [
        {
          field: 'label',
          order: 'asc',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('user-configurable entry sorting');
  });

  it.each([0, 1_001, 1.5])('rejects invalid document limit %s', async (limit) => {
    const result = await client.getDocuments(storeName, {
      limit,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('document limit must be an integer between 1 and 1000');
  });

  it('clears entries while preserving the store configuration', async () => {
    const beforeClear = await client.getCollectionInfo(storeName);

    expect(beforeClear.success).toBe(true);
    expect(beforeClear.data?.count).toBe(3);

    const result = await client.truncateCollection(storeName);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(3);

    const afterClear = await client.getCollectionInfo(storeName);

    expect(afterClear.success).toBe(true);
    expect(afterClear.data?.count).toBe(0);
    expect(afterClear.data?.dimension).toBe(beforeClear.data?.dimension);
    expect(afterClear.data?.predicateIndices).toEqual(beforeClear.data?.predicateIndices);
    expect(afterClear.data?.nonLinearIndices).toEqual(beforeClear.data?.nonLinearIndices);

    const emptyPage = await client.getDocuments(storeName);

    expect(emptyPage.success).toBe(true);
    expect(emptyPage.documents).toEqual([]);
    expect(emptyPage.nextOffset).toBeNull();
    expect(emptyPage.totalCount).toBe(0);
  });
});
