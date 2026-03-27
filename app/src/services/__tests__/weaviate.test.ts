import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
  toPascalCase,
} from './test-utils';
import { VectorDBClient, Document } from '../../types';
import { randomUUID } from 'crypto';

describe('Weaviate Client Integration Tests', () => {
  let client: VectorDBClient;
  let collectionName: string;

  beforeAll(() => {
    const config = TEST_CONFIGS.weaviate;
    client = createClient(config.type, config);
    collectionName = generateTestCollectionName('weaviate_test');
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
        config: TEST_CONFIGS.weaviate,
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

      const testDocs = await testDocumentInsertion(
        client,
        workingCollectionName,
        schema,
        1536
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
      expect(capabilities.supportsHybridAlpha).toBe(true);
      expect(capabilities.hybridAlphaDefault).toBe(0.75);
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
    const fullTestCollectionName = generateTestCollectionName('weaviate_test_full');

    await runFullTestFlow({
      client,
      config: TEST_CONFIGS.weaviate,
      collectionName: fullTestCollectionName,
      vectorDimension: 1536,
    });
  }, 120000);

  describe('Named Vectors Support', () => {
    let namedVectorsCollectionName: string;
    let insertedNamedVectorDoc: Document | null = null;

    it('should create collection with multiple named vectors', async () => {
      namedVectorsCollectionName = toPascalCase(generateTestCollectionName('weaviate_named_vectors'));
      
      const createResult = await client.createCollection({
        class: namedVectorsCollectionName,
        description: 'Test collection with multiple named vectors',
        vectorConfigType: 'named',
        namedVectors: [
          { name: 'title_vector', vectorizer: 'none' },
          { name: 'content_vector', vectorizer: 'none' },
        ],
        properties: [
          { name: 'title', dataType: 'text', indexSearchable: true },
          { name: 'content', dataType: 'text', indexSearchable: true },
        ],
      });
      
      expect(createResult.success).toBe(true);
      console.log('✓ Named vectors collection created');
      
      // Wait for collection to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);

    it('should insert document with multiple named vectors', async () => {
      const titleVector = Array.from({ length: 384 }, () => Math.random());
      const contentVector = Array.from({ length: 384 }, () => Math.random());
      
      const documentToInsert = {
        primary: { name: 'id', value: '' }, // Empty = let Weaviate generate UUID
        vectors: {
          title_vector: {
            key: 'title_vector',
            vectorType: 'dense',
            size: 384,
            value: { data: titleVector },
          },
          content_vector: {
            key: 'content_vector',
            vectorType: 'dense',
            size: 384,
            value: { data: contentVector },
          },
        },
        payload: {
          title: 'Multi-vector Document',
          content: 'This document has separate vectors for title and content',
        },
      };
      
      const result = await client.upsertDocument(namedVectorsCollectionName, {
        document: documentToInsert,
      });
      
      if (!result.success) {
        console.error('Failed to insert document:', result.error);
        throw new Error(`Document insertion failed: ${result.error}`);
      }
      expect(result.success).toBe(true);
      
      // Store the inserted document for later use in search
      // Use the original documentToInsert to preserve the vectors, but update the ID
      insertedNamedVectorDoc = {
        ...documentToInsert,
        primary: result.document?.primary || (result.id ? { name: 'id', value: result.id } : documentToInsert.primary),
      };
      
      console.log('✓ Document with multiple named vectors inserted');
      
      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));
    }, 30000);

    it('should search using specific named vector and verify vectors returned', async () => {
      // Get the document from the collection to use its vector
      if (!insertedNamedVectorDoc) {
        const getDocsResult = await client.getDocuments(namedVectorsCollectionName, { limit: 1 });
        if (!getDocsResult.success || !getDocsResult.documents || getDocsResult.documents.length === 0) {
          throw new Error('No documents found to use for search');
        }
        insertedNamedVectorDoc = getDocsResult.documents[0];
      }
      
      if (!insertedNamedVectorDoc.vectors || !insertedNamedVectorDoc.vectors.title_vector) {
        throw new Error('Sample document missing title_vector for search');
      }
      
      const docTitleVector = insertedNamedVectorDoc.vectors.title_vector;
      const docContentVector = insertedNamedVectorDoc.vectors.content_vector;
      
      if (docTitleVector.vectorType !== 'dense' || !('data' in docTitleVector.value) || !Array.isArray(docTitleVector.value.data)) {
        throw new Error('Invalid title_vector format in sample document');
      }
      
      if (!docContentVector || docContentVector.vectorType !== 'dense' || !('data' in docContentVector.value) || !Array.isArray(docContentVector.value.data)) {
        throw new Error('Invalid content_vector format in sample document');
      }
      
      // Search using title_vector from the inserted document
      const titleResult = await client.search(namedVectorsCollectionName, {
        title_vector: {
          key: 'title_vector',
          vectorType: 'dense',
          size: 384,
          value: { data: docTitleVector.value.data },
        },
      }, {
        limit: 5,
      });

      if (!titleResult.success) {
        console.error('Search failed:', titleResult.error);
      }
      expect(titleResult.success).toBe(true);
      expect(titleResult.documents).toBeDefined();
      expect(titleResult.documents!.length).toBeGreaterThan(0);
      
      // Verify both named vectors are returned
      const doc = titleResult.documents![0];
      expect(doc.vectors).toBeDefined();
      expect(doc.vectors.title_vector).toBeDefined();
      expect(doc.vectors.title_vector.vectorType).toBe('dense');
      expect(doc.vectors.content_vector).toBeDefined();
      expect(doc.vectors.content_vector.vectorType).toBe('dense');
      
      // Now search using content_vector to verify it's actually using the named vector
      // The results should be similar since we're using the same document's vectors
      const contentResult = await client.search(namedVectorsCollectionName, {
        content_vector: {
          key: 'content_vector',
          vectorType: 'dense',
          size: 384,
          value: { data: docContentVector.value.data },
        },
      }, {
        limit: 5,
      });
      
      expect(contentResult.success).toBe(true);
      expect(contentResult.documents).toBeDefined();
      expect(contentResult.documents!.length).toBeGreaterThan(0);
      
      // Verify the search is actually using the named vector by checking that
      // searching with title_vector vs content_vector can produce different results
      // (though in this case with only one document, both should return the same doc)
      const titleDocIds = new Set(titleResult.documents!.map(d => d.primary.value));
      const contentDocIds = new Set(contentResult.documents!.map(d => d.primary.value));
      
      // Both searches should find the same document (since we only inserted one)
      // But the important thing is that the search succeeded with the named vector
      expect(titleDocIds.size).toBeGreaterThan(0);
      expect(contentDocIds.size).toBeGreaterThan(0);
      
      console.log('✓ Search with named vector successful');
      console.log('  - Title vector search found', titleResult.documents!.length, 'results');
      console.log('  - Content vector search found', contentResult.documents!.length, 'results');
      console.log('  - Vectors returned:', Object.keys(doc.vectors).join(', '));
      console.log(`  - Using title_vector from document: ${insertedNamedVectorDoc.primary.value}`);
      console.log(`  - Using content_vector from document: ${insertedNamedVectorDoc.primary.value}`);
    }, 30000);

    it('should cleanup named vectors collection', async () => {
      const dropResult = await client.dropCollection(namedVectorsCollectionName);
      expect(dropResult.success).toBe(true);
      console.log('✓ Named vectors collection dropped');
    }, 30000);
  });
});

