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
  waitFor,
  TEST_CONFIGS,
} from './test-utils';
import { VectorDBClient, Document } from '../../types';

/**
 * Generate a Pinecone-compatible collection name
 * Pinecone requires: lowercase alphanumeric characters and hyphens only
 */
function generatePineconeCollectionName(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  // Replace underscores with hyphens and ensure lowercase
  return `${prefix}-${timestamp}-${random}`.toLowerCase();
}

describe('Pinecone Client Integration Tests', () => {
  let client: VectorDBClient;
  let collectionName: string;
  const hasApiKey = !!process.env.PINECONE_API_KEY;

  beforeAll(() => {
    if (!hasApiKey) {
      console.warn('⚠️  PINECONE_API_KEY not set - skipping Pinecone tests');
      return;
    }
    const config = {
      type: 'pinecone' as const,
      apiKey: process.env.PINECONE_API_KEY!,
    };
    client = createClient(config.type, config);
    collectionName = generatePineconeCollectionName('pinecone-test');
  });

  describe('Connection & Setup', () => {
    it('should test connection', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const result = await client.testConnection();
      expect(result.success).toBe(true);
    }, 30000);

    it('should get collections', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const result = await client.getCollections();
      expect(result.success).toBe(true);
      expect(result.collections).toBeDefined();
      expect(Array.isArray(result.collections)).toBe(true);
    }, 30000);
  });

  describe('Collection Management', () => {
    it('should create and verify collection', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const { workingCollectionName, schema } = await testCollectionCreation({
        client,
        config: { type: 'pinecone', apiKey: process.env.PINECONE_API_KEY! },
        collectionName,
        vectorDimension: 384,
      });
      expect(workingCollectionName).toBeDefined();
      expect(schema).toBeDefined();
      (client as any).__testCollectionName = workingCollectionName;
      (client as any).__testSchema = schema;
    }, 120000); // Pinecone index creation can take time
  });

  describe('Document Operations', () => {
    it('should insert documents', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      // Get namespace from schema if available
      const namespace = schema.dataRequirements?.namespace?.value?.[0];
      const dataRequirements = namespace ? { namespace } : undefined;

      const testDocs = await testDocumentInsertion(
        client,
        workingCollectionName,
        schema,
        384,
        dataRequirements
      );
      expect(testDocs.length).toBe(12);
      (client as any).__testDocs = testDocs;
      (client as any).__testDataRequirements = dataRequirements;
    }, 60000);

    it('should retrieve documents and test pagination', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      const dataRequirements = (client as any).__testDataRequirements;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentRetrieval(client, workingCollectionName, testDocs.length, dataRequirements);
    }, 60000);

    it('should sort documents', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      const dataRequirements = (client as any).__testDataRequirements;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testDocumentSorting(client, workingCollectionName, schema, dataRequirements);
    }, 60000);

    it('should search documents', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      const dataRequirements = (client as any).__testDataRequirements;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testSearch(client, workingCollectionName, schema, 384, dataRequirements);
    }, 60000);

    it('should return search capabilities', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      const schema = (client as any).__testSchema;
      if (!workingCollectionName || !schema) {
        throw new Error('Collection must be created first');
      }

      await testGetSearchCapabilities(client, workingCollectionName, schema);
    }, 10000);

    it('should update documents', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      const dataRequirements = (client as any).__testDataRequirements;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentUpdate(client, workingCollectionName, testDocs[2], dataRequirements);
    }, 60000);

    it('should delete documents', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      const dataRequirements = (client as any).__testDataRequirements;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentDeletion(client, workingCollectionName, testDocs, dataRequirements);
    }, 60000);
  });

  describe('Collection Cleanup', () => {
    it('should truncate and drop collection', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }
      const workingCollectionName = (client as any).__testCollectionName;
      if (!workingCollectionName) {
        throw new Error('Collection must be created first');
      }

      await testCollectionManagement(client, workingCollectionName);
    }, 60000);
  });

  it('should complete full integration test flow', async () => {
    if (!hasApiKey) {
      console.log('⏭️  Skipping - PINECONE_API_KEY not set');
      return;
    }
    const fullTestCollectionName = generatePineconeCollectionName('pinecone-test-full');

    await runFullTestFlow({
      client,
      config: TEST_CONFIGS.pinecone,
      collectionName: fullTestCollectionName,
      vectorDimension: 384,
    });
  }, 180000); // Longer timeout for full flow

  // ============================================
  // Sparse Vector Tests
  // ============================================

  describe('Sparse Vector Support', () => {
    it('should create collection with dotproduct metric for sparse vectors', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }

      const sparseCollectionName = generatePineconeCollectionName('pinecone-sparse');
      
      console.log('Creating Pinecone index with dotproduct metric for sparse vectors...');
      
      // Pinecone requires dotproduct metric for sparse vector support
      const createResult = await client.createCollection({
        name: sparseCollectionName,
        dimension: 384,
        metric: 'dotproduct', // Required for sparse vectors
        spec: 'serverless',
        cloud: 'aws',
        region: 'us-east-1',
      });
      
      expect(createResult.success).toBe(true);
      console.log('✓ Sparse-compatible index created');
      
      // Wait for index to be ready
      await waitFor(async () => {
        const schema = await client.getCollectionSchema(sparseCollectionName);
        return schema.success;
      }, 60000);
      
      const schemaResult = await client.getCollectionSchema(sparseCollectionName);
      expect(schemaResult.success).toBe(true);
      console.log('✓ Index schema verified');
      
      // Cleanup
      await client.dropCollection(sparseCollectionName);
    }, 120000);

    it('should insert and search documents with sparse vectors', async () => {
      if (!hasApiKey) {
        console.log('⏭️  Skipping - PINECONE_API_KEY not set');
        return;
      }

      const sparseCollectionName = generatePineconeCollectionName('pinecone-sparse-search');
      
      // Create index with dotproduct metric
      await client.createCollection({
        name: sparseCollectionName,
        dimension: 384,
        metric: 'dotproduct',
        spec: 'serverless',
        cloud: 'aws',
        region: 'us-east-1',
      });
      
      await waitFor(async () => {
        const schema = await client.getCollectionSchema(sparseCollectionName);
        return schema.success;
      }, 60000);
      
      // Create a base sparse vector for overlap
      const baseSparseVector = generateTestSparseVector();
      const insertedDocuments: Document[] = [];
      
      // Insert documents with sparse vectors
      console.log('Inserting documents with sparse vectors...');
      for (let i = 1; i <= 5; i++) {
        // Create variants with some overlap
        const sparseVector = {
          indices: [...baseSparseVector.indices, ...(i > 2 ? [baseSparseVector.indices[0] + i * 10] : [])],
          values: [...baseSparseVector.values, ...(i > 2 ? [Math.random() * 5] : [])],
        };
        
        const doc: Document = {
          primary: { name: 'id', value: `doc${i}` },
          vectors: {
            '__default__': {
              key: '__default__',
              vectorType: 'dense',
              size: 384,
              value: { data: generateTestVector(384) },
            },
            'sparse': {
              key: 'sparse',
              vectorType: 'sparse',
              value: sparseVector,
            },
          },
          payload: { text: `Sparse document ${i}` },
        };
        await client.upsertDocument(sparseCollectionName, { document: doc });
        insertedDocuments.push(doc);
      }
      console.log('✓ Documents with sparse vectors inserted');
      
      // Wait for index propagation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get a document from the collection to use its dense vector for search
      const getDocsResult = await client.getDocuments(sparseCollectionName, { limit: 1 });
      if (!getDocsResult.success || !getDocsResult.documents || getDocsResult.documents.length === 0) {
        throw new Error('No documents found to use for search');
      }
      
      const sampleDoc = getDocsResult.documents[0];
      if (!sampleDoc.vectors || !sampleDoc.vectors.__default__) {
        throw new Error('Sample document missing dense vector for search');
      }
      
      const docDenseVector = sampleDoc.vectors.__default__;
      if (docDenseVector.vectorType !== 'dense' || !('data' in docDenseVector.value) || !Array.isArray(docDenseVector.value.data)) {
        throw new Error('Invalid dense vector format in sample document');
      }
      
      // Search with sparse vector (using dense vector from inserted document)
      console.log('Performing sparse vector search...');
      const searchVectors = {
        '__default__': {
          key: '__default__',
          vectorType: 'dense' as const,
          size: 384,
          value: { data: docDenseVector.value.data },
        },
        'sparse': {
          key: 'sparse',
          vectorType: 'sparse' as const,
          value: baseSparseVector,
        },
      };
      
      const searchResult = await client.search(sparseCollectionName, searchVectors, { limit: 3 });
      
      expect(searchResult.success).toBe(true);
      expect(searchResult.documents).toBeDefined();
      expect(searchResult.documents!.length).toBeGreaterThan(0);
      console.log(`✓ Sparse search returned ${searchResult.documents!.length} results`);
      console.log(`  Using dense vector from document: ${sampleDoc.primary.value}`);
      
      // Cleanup
      await client.dropCollection(sparseCollectionName);
    }, 180000);
  });

});

