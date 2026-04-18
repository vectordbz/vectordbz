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
  testDocumentUpdate,
  testDocumentDeletion,
  testCollectionManagement,
  generateTestVector,
  generateTestSparseVector,
  generateTestBinaryVector,
  generateTestBinaryDocument,
  waitFor,
  TEST_CONFIGS,
} from './test-utils';
import { VectorDBClient, Document } from '../../types';

describe('Milvus Client Integration Tests', () => {
  let client: VectorDBClient;
  let collectionName: string;

  beforeAll(() => {
    const config = TEST_CONFIGS.milvus;
    client = createClient(config.type, config);
    collectionName = generateTestCollectionName('milvus_test');
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
        config: TEST_CONFIGS.milvus,
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

      await testGetSearchCapabilities(client, workingCollectionName, schema);
    }, 10000);

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
    const fullTestCollectionName = generateTestCollectionName('milvus_test_full');

    await runFullTestFlow({
      client,
      config: TEST_CONFIGS.milvus,
      collectionName: fullTestCollectionName,
      vectorDimension: 1536,
    });
  }, 120000);

  // ============================================
  // Sparse & Binary Vector Tests
  // ============================================

  describe('Sparse Vector Support', () => {
    it('should create collection with sparse vectors', async () => {
      const sparseCollectionName = generateTestCollectionName('milvus_sparse');

      console.log('Creating Milvus collection with sparse vectors...');

      // Create collection with sparse vector field using Milvus format
      // Note: SparseFloatVector should NOT have dimension specified
      const createResult = await client.createCollection({
        collection_name: sparseCollectionName,
        schemaType: 'custom',
        primaryKeyType: 'VarChar',
        primaryKeyName: 'id',
        maxLength: 100,
        autoId: false,
        enable_dynamic_field: true,
        vectorFields: [{ name: 'sparse_vector', dataType: 'SparseFloatVector', metric_type: 'IP' }],
        scalarFields: [{ name: 'text', dataType: 'VarChar', maxLength: 1000 }],
        createIndex: false,
      });

      if (!createResult.success) {
        console.error('Create collection failed:', createResult.error);
      }
      expect(createResult.success).toBe(true);
      console.log('✓ Sparse vector collection created');

      // Verify schema
      await waitFor(async () => {
        const schema = await client.getCollectionSchema(sparseCollectionName);
        return !!(schema.success && schema.schema?.vectors?.sparse_vector);
      });

      const schemaResult = await client.getCollectionSchema(sparseCollectionName);
      expect(schemaResult.success).toBe(true);
      expect(schemaResult.schema?.vectors.sparse_vector).toBeDefined();
      expect(schemaResult.schema?.vectors.sparse_vector.vectorType).toBe('sparse');
      console.log('✓ Sparse vector schema verified');

      // Cleanup
      await client.dropCollection(sparseCollectionName);
    }, 30000);

    it('should insert and search sparse vectors', async () => {
      const sparseCollectionName = generateTestCollectionName('milvus_sparse_search');

      // Create sparse collection with index (REQUIRED for search to work)
      await client.createCollection({
        collection_name: sparseCollectionName,
        schemaType: 'custom',
        primaryKeyType: 'VarChar',
        primaryKeyName: 'id',
        maxLength: 100,
        autoId: false,
        enable_dynamic_field: true,
        vectorFields: [{ name: 'sparse_vector', dataType: 'SparseFloatVector', metric_type: 'IP' }],
        scalarFields: [{ name: 'text', dataType: 'VarChar', maxLength: 1000 }],
        createIndex: true, // Sparse vectors NEED SPARSE_INVERTED_INDEX to search!
      });

      await waitFor(async () => {
        const schema = await client.getCollectionSchema(sparseCollectionName);
        return schema.success;
      });

      // Ensure collection is loaded (sparse vectors can work without index but need to be loaded)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Create a base sparse vector that will have some overlap with search
      const baseSparseVector = generateTestSparseVector();

      // Insert sparse documents
      console.log('Inserting sparse documents...');
      for (let i = 1; i <= 5; i++) {
        // Create variants of the base sparse vector with some overlap
        const sparseVector = {
          indices: [
            ...baseSparseVector.indices,
            ...(i > 2 ? [baseSparseVector.indices[0] + i * 10] : []),
          ],
          values: [...baseSparseVector.values, ...(i > 2 ? [Math.random() * 5] : [])],
        };

        const doc: Document = {
          primary: { name: 'id', value: i },
          vectors: {
            sparse_vector: {
              key: 'sparse_vector',
              vectorType: 'sparse',
              value: sparseVector,
            },
          },
          payload: { text: `Sparse document ${i}` },
        };
        await client.upsertDocument(sparseCollectionName, { document: doc });
      }
      console.log('✓ Sparse documents inserted');

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Search with sparse vector (using base vector for overlap)
      console.log('Performing sparse vector search...');
      const searchVectors = {
        sparse_vector: {
          key: 'sparse_vector',
          vectorType: 'sparse' as const,
          value: baseSparseVector,
        },
      };

      const searchResult = await client.search(sparseCollectionName, searchVectors, { limit: 3 });

      expect(searchResult.success).toBe(true);
      expect(searchResult.documents).toBeDefined();
      expect(searchResult.documents!.length).toBeGreaterThan(0);
      console.log(`✓ Sparse search returned ${searchResult.documents!.length} results`);

      // Cleanup
      await client.dropCollection(sparseCollectionName);
    }, 30000);
  });

  describe('Binary Vector Support', () => {
    it('should create collection with binary vectors', async () => {
      const binaryCollectionName = generateTestCollectionName('milvus_binary');

      console.log('Creating Milvus collection with binary vectors...');

      // Create collection with binary vector field using Milvus format
      const createResult = await client.createCollection({
        collection_name: binaryCollectionName,
        schemaType: 'custom',
        primaryKeyType: 'VarChar',
        primaryKeyName: 'id',
        maxLength: 100,
        autoId: false,
        enable_dynamic_field: true,
        vectorFields: [
          {
            name: 'binary_vector',
            dataType: 'BinaryVector',
            dimension: 256,
            metric_type: 'HAMMING',
          },
        ],
        scalarFields: [{ name: 'title', dataType: 'VarChar', maxLength: 500 }],
        createIndex: false,
      });

      expect(createResult.success).toBe(true);
      console.log('✓ Binary vector collection created');

      // Verify schema
      await waitFor(async () => {
        const schema = await client.getCollectionSchema(binaryCollectionName);
        return !!(schema.success && schema.schema?.vectors?.binary_vector);
      });

      const schemaResult = await client.getCollectionSchema(binaryCollectionName);
      expect(schemaResult.success).toBe(true);
      const binaryField = schemaResult.schema?.vectors.binary_vector;
      expect(binaryField).toBeDefined();
      expect(binaryField?.vectorType).toBe('binary');
      if (binaryField?.vectorType === 'binary') {
        expect(binaryField.size).toBe(256);
      }
      console.log('✓ Binary vector schema verified');

      // Cleanup
      await client.dropCollection(binaryCollectionName);
    }, 30000);

    it('should insert and search binary vectors', async () => {
      const binaryCollectionName = generateTestCollectionName('milvus_binary_search');

      // Create binary collection - binary vectors need BIN_FLAT index
      await client.createCollection({
        collection_name: binaryCollectionName,
        schemaType: 'custom',
        primaryKeyType: 'VarChar',
        primaryKeyName: 'id',
        maxLength: 100,
        autoId: false,
        enable_dynamic_field: true,
        vectorFields: [
          {
            name: 'binary_vector',
            dataType: 'BinaryVector',
            dimension: 256,
            metric_type: 'HAMMING',
          },
        ],
        scalarFields: [{ name: 'title', dataType: 'VarChar', maxLength: 500 }],
        createIndex: true,
        index_type: 'BIN_FLAT', // Binary vectors require BIN_FLAT index
      });

      await waitFor(async () => {
        const schema = await client.getCollectionSchema(binaryCollectionName);
        return schema.success;
      });

      // Insert binary documents
      console.log('Inserting binary documents...');
      for (let i = 1; i <= 5; i++) {
        const doc = generateTestBinaryDocument(i, 256, { title: `Binary doc ${i}` });
        await client.upsertDocument(binaryCollectionName, { document: doc });
      }
      console.log('✓ Binary documents inserted');

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Search with binary vector
      console.log('Performing binary vector search...');
      const searchVectors = {
        binary_vector: {
          key: 'binary_vector',
          vectorType: 'binary' as const,
          size: 256,
          value: { data: generateTestBinaryVector(256) },
        },
      };

      const searchResult = await client.search(binaryCollectionName, searchVectors, { limit: 3 });

      expect(searchResult.success).toBe(true);
      expect(searchResult.documents).toBeDefined();
      expect(searchResult.documents!.length).toBeGreaterThan(0);
      console.log(`✓ Binary search returned ${searchResult.documents!.length} results`);

      // Cleanup
      await client.dropCollection(binaryCollectionName);
    }, 30000);
  });
});
