import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '../index';
import {
  generateTestCollectionName,
  runFullTestFlow,
  testCollectionCreation,
  testDocumentInsertion,
  testDocumentRetrieval,
  testDocumentSorting,
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

describe('Elasticsearch Client Integration Tests', () => {
  let client: VectorDBClient;
  let collectionName: string;

  beforeAll(() => {
    const config = TEST_CONFIGS.elasticsearch;
    client = createClient(config.type, config);
    collectionName = generateTestCollectionName('elasticsearch_test')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
  });

  describe('Connection & Setup', () => {
    it('should test connection', async () => {
      const result = await client.testConnection();
      expect(result.success).toBe(true);
      expect(result.version).toBeDefined();
    });

    it('should get collections', async () => {
      const result = await client.getCollections();
      expect(result.success).toBe(true);
      expect(result.collections).toBeDefined();
      expect(Array.isArray(result.collections)).toBe(true);
    });
  });

  describe('Collection Management', () => {
    it('should create and verify collection', async () => {
      const { workingCollectionName, schema } = await testCollectionCreation({
        client,
        config: TEST_CONFIGS.elasticsearch,
        collectionName,
        vectorDimension: 1536,
      });
      expect(workingCollectionName).toBeDefined();
      expect(schema).toBeDefined();
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

      const testDocs = await testDocumentInsertion(client, workingCollectionName, schema, 1536);
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

    it('should sort documents', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testDocumentSorting(client, workingCollectionName, schema);
    }, 60000);

    it('should search documents', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testSearch(client, workingCollectionName, schema, 1536);
    }, 60000);

    it('should return search capabilities', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      const capabilities = await testGetSearchCapabilities(client, workingCollectionName, schema);
      expect(capabilities.lexical).toBe(true);
      expect(capabilities.sparse).toBe(true);
      expect(capabilities.supportsHybridAlpha).toBe(true);
      expect(capabilities.hybridAlphaDefault).toBe(0.75);
      expect(capabilities.serverSideHybridNative).toBe(true);
      expect(capabilities.fusionStrategies).toContain('server');
    }, 10000);

    it('should search with lexical query and hybrid alpha', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testSearchWithLexicalAndHybridAlpha(client, workingCollectionName, schema, 1536);
    }, 60000);

    it('should search with keywords only (no vector)', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testSearchKeywordOnly(client, workingCollectionName, schema);
    }, 60000);

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
    const fullTestCollectionName = generateTestCollectionName('elasticsearch_test_full')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');

    await runFullTestFlow({
      client,
      config: TEST_CONFIGS.elasticsearch,
      collectionName: fullTestCollectionName,
      vectorDimension: 1536,
    });
  }, 120000);
});
