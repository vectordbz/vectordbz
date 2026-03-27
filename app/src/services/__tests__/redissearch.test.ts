import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '../index';
import {
  generateTestCollectionName,
  runFullTestFlow,
  testCollectionCreation,
  testDocumentInsertion,
  testDocumentRetrieval,
  testSearch,
  testGetSearchCapabilities,
  testSearchWithLexicalAndHybridAlpha,
  testSearchKeywordOnly,
  testDocumentUpdate,
  testDocumentDeletion,
  testCollectionManagement,
  TEST_CONFIGS,
} from './test-utils';
import { VectorDBClient } from '../../types';

/**
 * RedisSearch integration tests.
 *
 * Requires a running Redis Stack instance (redis/redis-stack:latest).
 * Matches the docker-compose.yml redis service on port 6379.
 *
 * Note: RedisSearch requires fields to be declared in the index schema for
 * SORTBY to work. Because the `id` field is stored in the Hash but is not
 * an indexed schema field, sorting by primary key is not supported and that
 * step is skipped in this test suite.
 */
describe('RedisSearch Client Integration Tests', () => {
  let client: VectorDBClient;
  let collectionName: string;

  beforeAll(() => {
    const config = TEST_CONFIGS.redissearch;
    client = createClient(config.type, config);
    // Redis index names: lowercase, alphanumeric, underscores, hyphens, colons
    collectionName = generateTestCollectionName('redis_test')
      .toLowerCase()
      .replace(/[^a-z0-9_:-]/g, '_');
  });

  describe('Connection & Setup', () => {
    it('should test connection', async () => {
      const result = await client.testConnection();
      expect(result.success).toBe(true);
      expect(result.version).toBeDefined();
      expect(result.version).toContain('Redis Stack');
    }, 60000);

    it('should get collections', async () => {
      const result = await client.getCollections();
      expect(result.success).toBe(true);
      expect(result.collections).toBeDefined();
      expect(Array.isArray(result.collections)).toBe(true);
    }, 60000);
  });

  describe('Collection Management', () => {
    it('should create and verify collection', async () => {
      const { workingCollectionName, schema } = await testCollectionCreation({
        client,
        config: TEST_CONFIGS.redissearch,
        collectionName,
        vectorDimension: 128,
      });
      expect(workingCollectionName).toBeDefined();
      expect(schema).toBeDefined();
      expect(schema.hasVectors).toBe(true);
      (client as any).__testCollectionName = workingCollectionName;
      (client as any).__testSchema = schema;
    }, 60000);
  });

  describe('Document Operations', () => {
    it('should insert documents', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      const testDocs = await testDocumentInsertion(
        client,
        workingCollectionName,
        schema,
        128
      );
      expect(testDocs.length).toBe(12);
      (client as any).__testDocs = testDocs;
    }, 60000);

    it('should retrieve documents and test pagination', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentRetrieval(client, workingCollectionName, testDocs.length);
    }, 60000);

    it('should decode vector data from binary hashes', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      if (!workingCollectionName) {
        throw new Error('Collection must be created first');
      }

      const result = await client.getDocuments(workingCollectionName, { limit: 3 });
      expect(result.success).toBe(true);
      expect(result.documents?.length).toBeGreaterThan(0);

      // At least one document should have a decoded vector
      const docsWithVectors = result.documents?.filter(
        (d) => Object.keys(d.vectors).length > 0
      );
      expect(docsWithVectors?.length).toBeGreaterThan(0);

      const firstVecEntry = Object.values(docsWithVectors![0].vectors)[0];
      expect(firstVecEntry.vectorType).toBe('dense');
      if (firstVecEntry.vectorType === 'dense') {
        expect(firstVecEntry.value.data.length).toBe(128);
        expect(firstVecEntry.size).toBe(128);
      }
    }, 30000);

    it('should search documents with KNN vector query', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testSearch(client, workingCollectionName, schema, 128);
    }, 60000);

    it('should return correct search capabilities', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      const capabilities = await testGetSearchCapabilities(client, workingCollectionName, schema);
      expect(capabilities.dense).toBe(true);
      expect(capabilities.lexical).toBe(true);
      expect(capabilities.sparse).toBe(false);
      // RedisSearch does not use server-side hybrid alpha (no native fusion endpoint)
      expect(capabilities.serverSideHybridNative).toBeFalsy();
    }, 10000);

    it('should search with lexical query (TEXT fields)', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testSearchWithLexicalAndHybridAlpha(client, workingCollectionName, schema, 128);
    }, 60000);

    it('should support keyword-only search (no vector)', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testSearchKeywordOnly(client, workingCollectionName, schema);
    }, 60000);

    it('should filter documents by payload field', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      if (!workingCollectionName) {
        throw new Error('Collection must be created first');
      }

      const result = await client.getDocuments(workingCollectionName, {
        limit: 50,
        filter: {
          conditions: [{ field: 'category', operator: 'eq', value: 'A', valueType: 'string' }],
          logic: 'and',
        },
      });
      expect(result.success).toBe(true);
      // All returned docs should match the filter
      result.documents?.forEach((doc) => {
        expect(doc.payload.category).toBe('A');
      });
    }, 30000);

    it('should update documents', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentUpdate(client, workingCollectionName, testDocs[2]);
    }, 60000);

    it('should delete documents', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentDeletion(client, workingCollectionName, testDocs);
    }, 60000);
  });

  describe('Collection Cleanup', () => {
    it('should truncate and drop collection', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      if (!workingCollectionName) {
        throw new Error('Collection must be created first');
      }

      await testCollectionManagement(client, workingCollectionName);
    }, 60000);
  });

  it('should complete full integration test flow', async () => {
    const fullTestCollectionName = generateTestCollectionName('redis_test_full')
      .toLowerCase()
      .replace(/[^a-z0-9_:-]/g, '_');

    await runFullTestFlow({
      client,
      config: TEST_CONFIGS.redissearch,
      collectionName: fullTestCollectionName,
      vectorDimension: 128,
    });
  }, 120000);
});
