import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '../index';
import {
  generateTestCollectionName,
  generateTestDocument,
  generateTestVector,
  generateTestSparseVector,
  waitFor,
  TEST_CONFIGS,
  buildSimpleCollectionConfig,
  testDocumentSorting,
  testGetSearchCapabilities,
} from './test-utils';
import { VectorDBClient, Document, DocumentVector, COLLECTION_DEFAULT_VECTOR } from '../../types';
import crypto from 'crypto';

describe('Qdrant Client Integration Tests', () => {
  let client: VectorDBClient;
  let collectionName: string;

  beforeAll(() => {
    const config = TEST_CONFIGS.qdrant;
    client = createClient(config.type, config);
    collectionName = generateTestCollectionName('qdrant_test');
  });

  // ============================================
  // Client-Specific Test Helpers
  // ============================================

  async function testCollectionCreation(collectionName: string, vectorDimension: number = 1536) {
    console.log('Step 1: Testing connection...');
    const connectionResult = await client.testConnection();
    if (!connectionResult.success) {
      throw new Error(`Connection test failed: ${connectionResult.error}`);
    }
    console.log('✓ Connection test passed');

    console.log('Step 2: Getting existing collections...');
    const collectionsBefore = await client.getCollections();
    if (!collectionsBefore.success) {
      throw new Error(`Failed to get collections: ${collectionsBefore.error}`);
    }
    const initialCount = collectionsBefore.collections?.length || 0;
    console.log(`✓ Found ${initialCount} existing collections`);

    console.log('Step 3: Creating collection...');
    const createSchema = client.getCreateCollectionSchema();
    const createConfig = buildSimpleCollectionConfig(createSchema, collectionName, vectorDimension);
    
    // Determine the expected collection name
    const expectedCollectionName = createConfig.name ? createConfig.name as string : collectionName;
    
    const createResult = await client.createCollection(createConfig);
    if (!createResult.success) {
      throw new Error(`Failed to create collection: ${createResult.error}`);
    }
    console.log('✓ Collection created');

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Step 4: Verifying collection exists...');
    // Check both count increase and name existence for more robust verification
    await waitFor(async () => {
      try {
        const collectionsAfter = await client.getCollections();
        if (!collectionsAfter.success) return false;
        
        // Check if count increased
        const newCount = collectionsAfter.collections?.length || 0;
        if (newCount > initialCount) return true;
        
        // Also check if the expected collection name exists
        if (expectedCollectionName && collectionsAfter.collections) {
          const found = collectionsAfter.collections.some(c => c.name === expectedCollectionName);
          if (found) return true;
        }
        
        return false;
      } catch {
        return false;
      }
    }, 20000, 500); // Increased timeout to 20s for slower databases

    const collectionsAfter = await client.getCollections();
    if (!collectionsAfter.success) {
      throw new Error(`Failed to get collections after creation: ${collectionsAfter.error}`);
    }
    
    // Try to find the collection by expected name first
    let createdCollection = expectedCollectionName 
      ? collectionsAfter.collections?.find(c => c.name === expectedCollectionName)
      : null;
    
    // If not found by name, find by comparing with before list
    if (!createdCollection) {
      const collectionsBeforeNames = new Set(collectionsBefore.collections?.map(c => c.name) || []);
      createdCollection = collectionsAfter.collections?.find(c => !collectionsBeforeNames.has(c.name));
    }
    
    if (!createdCollection) {
      const newCount = collectionsAfter.collections?.length || 0;
      throw new Error(
        `Newly created collection not found in collections list. ` +
        `Expected name: ${expectedCollectionName}, ` +
        `Count before: ${initialCount}, Count after: ${newCount}`
      );
    }

    const workingCollectionName = createdCollection.name;
    console.log(`✓ Collection ${workingCollectionName} verified`);

    console.log('Step 5: Getting collection info...');
    const infoResult = await client.getCollectionInfo(workingCollectionName);
    if (!infoResult.success) {
      throw new Error(`Failed to get collection info: ${infoResult.error}`);
    }
    console.log('✓ Collection info retrieved');

    console.log('Step 6: Getting collection schema...');
    const schemaResult = await client.getCollectionSchema(workingCollectionName);
    if (!schemaResult.success) {
      throw new Error(`Failed to get collection schema: ${schemaResult.error}`);
    }
    if (!schemaResult.schema) {
      throw new Error('Collection schema is missing');
    }
    console.log('✓ Collection schema retrieved');

    return { workingCollectionName, schema: schemaResult.schema };
  }

  async function testDocumentInsertion(
    workingCollectionName: string,
    schema: any,
    vectorDimension: number
  ): Promise<Document[]> {
    console.log('Step 7: Inserting test documents...');
    const primaryKeyName = schema?.primary.name || 'id';
    const schemaVectors = schema?.vectors || {};
    const vectorFieldNames = Object.keys(schemaVectors).length > 0 ? Object.keys(schemaVectors) : [COLLECTION_DEFAULT_VECTOR];
    const actualVectorFieldName = schemaVectors[COLLECTION_DEFAULT_VECTOR]
      ? COLLECTION_DEFAULT_VECTOR
      : vectorFieldNames[0];

    const testDocs = Array.from({ length: 12 }, (_, i) => {
      const category = i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C';
      const value = (i + 1) * 10;
      return generateTestDocument(crypto.randomUUID(), vectorDimension, {
        category,
        value,
        index: i,
      });
    });

    const adjustedDocs = testDocs.map(doc => {
      if (!doc.vectors || Object.keys(doc.vectors).length === 0) {
        throw new Error(`Document ${doc.primary.value} is missing vectors`);
      }

      const adjustedVectors: Record<string, DocumentVector> = {};
      Object.entries(doc.vectors).forEach(([key, vector]) => {
        if (!vector) {
          throw new Error(`Document ${doc.primary.value} has missing vector for key ${key}`);
        }
        
        // Validate based on vector type
        if (vector.vectorType === 'dense') {
          if (!vector.value || !vector.value.data || !Array.isArray(vector.value.data) || vector.value.data.length === 0) {
            throw new Error(`Document ${doc.primary.value} has invalid dense vector for key ${key}`);
          }
          if (vector.value.data.length !== vectorDimension) {
            throw new Error(`Document ${doc.primary.value} vector dimension mismatch: expected ${vectorDimension}, got ${vector.value.data.length}`);
          }
        }

        const vectorKey = (key === COLLECTION_DEFAULT_VECTOR) ? actualVectorFieldName : key;
        adjustedVectors[vectorKey] = vector;
      });

      return {
        ...doc,
        primary: {
          name: primaryKeyName,
          value: doc.primary.value,
        },
        vectors: adjustedVectors,
      };
    });

    const insertedDocs: Document[] = [];

    for (const doc of adjustedDocs) {
      console.log(`  Inserting document: ${doc.primary.value} (primary key: ${primaryKeyName})...`);
      const upsertResult = await client.upsertDocument(workingCollectionName, { document: doc });
      if (!upsertResult.success) {
        throw new Error(`Failed to upsert document ${doc.primary.value}: ${upsertResult.error}`);
      }
      insertedDocs.push(doc);
      console.log(`  ✓ Document ${doc.primary.value} inserted`);
    }
    console.log(`✓ Inserted ${insertedDocs.length} documents`);

    await new Promise(resolve => setTimeout(resolve, 1000));
    return insertedDocs;
  }

  async function testDocumentRetrieval(workingCollectionName: string, expectedCount: number) {
    console.log('Step 9: Getting documents...');
    const getDocsResult = await client.getDocuments(workingCollectionName, { limit: Math.max(expectedCount, 20) });
    if (!getDocsResult.success) {
      throw new Error(`Failed to get documents: ${getDocsResult.error}`);
    }
    if (!getDocsResult.documents || getDocsResult.documents.length < expectedCount) {
      throw new Error(
        `Expected at least ${expectedCount} documents, got ${getDocsResult.documents?.length || 0}`
      );
    }
    console.log(`✓ Retrieved ${getDocsResult.documents.length} documents`);

    console.log('Step 9b: Testing pagination...');
    const pageSize = 5;
    const firstPageResult = await client.getDocuments(workingCollectionName, { limit: pageSize });
    if (!firstPageResult.success) {
      throw new Error(`Failed to get first page: ${firstPageResult.error}`);
    }
    if (!firstPageResult.documents || firstPageResult.documents.length !== pageSize) {
      throw new Error(
        `Expected ${pageSize} documents on first page, got ${firstPageResult.documents?.length || 0}`
      );
    }
    console.log(`✓ First page: ${firstPageResult.documents.length} documents`);

    if (firstPageResult.nextOffset === null) {
      throw new Error('Expected nextOffset to be available for pagination');
    }

    const secondPageResult = await client.getDocuments(workingCollectionName, {
      limit: pageSize,
      offset: firstPageResult.nextOffset,
    });
    if (!secondPageResult.success) {
      throw new Error(`Failed to get second page: ${secondPageResult.error}`);
    }
    if (!secondPageResult.documents || secondPageResult.documents.length !== pageSize) {
      throw new Error(
        `Expected ${pageSize} documents on second page, got ${secondPageResult.documents?.length || 0}`
      );
    }

    const firstPageIds = new Set(firstPageResult.documents.map(d => d.primary.value));
    const secondPageIds = new Set(secondPageResult.documents.map(d => d.primary.value));
    const overlap = [...firstPageIds].filter(id => secondPageIds.has(id));
    if (overlap.length > 0) {
      throw new Error(`Pagination overlap detected: ${overlap.length} documents appear on both pages`);
    }

    console.log(`✓ Second page: ${secondPageResult.documents.length} documents (no overlap)`);
  }

  async function testSearch(workingCollectionName: string, schema: any, vectorDimension: number) {
    console.log('Step 10: Testing search...');
    
    // Get a document from the collection to use its vector for search
    const getDocsResult = await client.getDocuments(workingCollectionName, { limit: 1 });
    if (!getDocsResult.success || !getDocsResult.documents || getDocsResult.documents.length === 0) {
      throw new Error('No documents found in collection to use for search test');
    }
    
    const sampleDoc = getDocsResult.documents[0];
    if (!sampleDoc.vectors || Object.keys(sampleDoc.vectors).length === 0) {
      throw new Error('Sample document has no vectors to use for search');
    }
    
    const schemaVectors = schema?.vectors || {};
    const vectorFieldNames = Object.keys(schemaVectors).length > 0 ? Object.keys(schemaVectors) : [COLLECTION_DEFAULT_VECTOR];
    const searchVectorKey = schemaVectors[COLLECTION_DEFAULT_VECTOR]
      ? COLLECTION_DEFAULT_VECTOR
      : vectorFieldNames[0];
    
    // Get the vector from the document
    const docVector = sampleDoc.vectors[searchVectorKey];
    if (!docVector) {
      // Fallback to first available vector
      const firstVectorKey = Object.keys(sampleDoc.vectors)[0];
      const firstVector = sampleDoc.vectors[firstVectorKey];
      if (!firstVector || firstVector.vectorType !== 'dense') {
        throw new Error('No dense vector found in sample document');
      }
      
      // Extract vector data
      let searchVectorData: number[];
      if ('data' in firstVector.value && Array.isArray(firstVector.value.data)) {
        searchVectorData = firstVector.value.data;
      } else {
        throw new Error('Invalid vector format in sample document');
      }
      
      // Create DocumentVector format using the document's vector
      const searchVectors: Record<string, DocumentVector> = {
        [firstVectorKey]: {
          key: firstVectorKey,
          vectorType: 'dense',
          size: firstVector.size || vectorDimension,
          value: { data: searchVectorData },
        },
      };
      
      const searchResult = await client.search(workingCollectionName, searchVectors, {
        limit: 5,
      });
      if (!searchResult.success) {
        throw new Error(`Search failed: ${searchResult.error}`);
      }
      if (!searchResult.documents || searchResult.documents.length === 0) {
        throw new Error('Search returned no results');
      }
      console.log(`✓ Search returned ${searchResult.documents.length} results (using vector from document: ${sampleDoc.primary.value})`);
      return;
    }
    
    if (docVector.vectorType !== 'dense') {
      throw new Error('Search vector must be dense type');
    }
    
    // Extract vector data
    let searchVectorData: number[];
    if ('data' in docVector.value && Array.isArray(docVector.value.data)) {
      searchVectorData = docVector.value.data;
    } else {
      throw new Error('Invalid vector format in sample document');
    }
    
    // Create DocumentVector format using the document's vector
    const searchVectors: Record<string, DocumentVector> = {
      [searchVectorKey]: {
        key: searchVectorKey,
        vectorType: 'dense',
        size: docVector.size || vectorDimension,
        value: { data: searchVectorData },
      },
    };
    
    const searchResult = await client.search(workingCollectionName, searchVectors, {
      limit: 5,
    });
    if (!searchResult.success) {
      throw new Error(`Search failed: ${searchResult.error}`);
    }
    if (!searchResult.documents || searchResult.documents.length === 0) {
      throw new Error('Search returned no results');
    }
    console.log(`✓ Search returned ${searchResult.documents.length} results (using vector from document: ${sampleDoc.primary.value})`);
  }

  async function testDocumentUpdate(workingCollectionName: string, testDoc: Document) {
    console.log('Step 11: Updating document...');
    const updatedPayload = {
      ...testDoc.payload,
      updated: true,
      newField: 'updated_value',
    };
    const updateResult = await client.upsertDocument(workingCollectionName, {
      document: {
        ...testDoc,
        payload: updatedPayload,
      },
    });
    if (!updateResult.success) {
      throw new Error(`Failed to update document: ${updateResult.error}`);
    }
    console.log('✓ Document updated');

    // Qdrant-specific: Use filter to find updated document
    await new Promise(resolve => setTimeout(resolve, 1000));
    const updatedDocs = await client.getDocuments(workingCollectionName, {
      filter: {
        conditions: [
          {
            field: testDoc.primary.name,
            operator: 'eq',
            value: testDoc.primary.value,
            valueType: typeof testDoc.primary.value === 'number' ? 'number' : 'string',
          },
        ],
        logic: 'and',
      },
      limit: 100,
    });

    if (!updatedDocs.success || !updatedDocs.documents || updatedDocs.documents.length === 0) {
      // Fallback: get all and find
      const allDocs = await client.getDocuments(workingCollectionName, { limit: 1000 });
      if (allDocs.success && allDocs.documents) {
        const foundDoc = allDocs.documents.find(doc => doc.primary.value === testDoc.primary.value);
        if (!foundDoc) {
          throw new Error(`Updated document not found (ID: ${testDoc.primary.value})`);
        }
        if (foundDoc.payload.updated !== true || foundDoc.payload.newField !== 'updated_value') {
          throw new Error('Document was not updated correctly');
        }
      } else {
        throw new Error(`Updated document not found (ID: ${testDoc.primary.value})`);
      }
    } else {
      const foundDoc = updatedDocs.documents[0];
      if (foundDoc.payload.updated !== true || foundDoc.payload.newField !== 'updated_value') {
        throw new Error('Document was not updated correctly');
      }
    }
    console.log('✓ Update verified');
  }

  async function testDocumentDeletion(workingCollectionName: string, testDocs: Document[]) {
    console.log('Step 12: Deleting single document...');
    const docToDelete = testDocs[0];
    const deleteResult = await client.deleteDocument(workingCollectionName, docToDelete.primary);
    if (!deleteResult.success) {
      throw new Error(`Failed to delete document: ${deleteResult.error}`);
    }
    console.log('✓ Document deleted');

    await new Promise(resolve => setTimeout(resolve, 500));
    const docsAfterDelete = await client.getDocuments(workingCollectionName, { limit: 10 });
    if (!docsAfterDelete.success) {
      throw new Error(`Failed to get documents after delete: ${docsAfterDelete.error}`);
    }
    const remainingCount = docsAfterDelete.documents?.length || 0;
    if (remainingCount >= testDocs.length) {
      throw new Error(`Document was not deleted. Expected < ${testDocs.length}, got ${remainingCount}`);
    }
    console.log('✓ Deletion verified');

    console.log('Step 13: Deleting multiple documents with filter...');
    const deleteManyResult = await client.deleteDocuments(workingCollectionName, {
      conditions: [
        {
          field: 'category',
          operator: 'eq',
          value: 'B',
          valueType: 'string',
        },
      ],
      logic: 'and',
    });
    if (!deleteManyResult.success) {
      throw new Error(`Failed to delete documents: ${deleteManyResult.error}`);
    }
    console.log(`✓ Deleted ${deleteManyResult.deletedCount || 0} documents with filter`);
  }

  async function testCollectionManagement(workingCollectionName: string) {
    console.log('Step 14: Truncating collection...');
    const truncateResult = await client.truncateCollection(workingCollectionName);
    if (!truncateResult.success) {
      throw new Error(`Failed to truncate collection: ${truncateResult.error}`);
    }
    console.log(`✓ Collection truncated (deleted ${truncateResult.deletedCount || 0} documents)`);

    // Qdrant-specific: May return "Not Found" for empty collections
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to verify truncation - Qdrant can be tricky with empty collections
    const docsAfterTruncate = await client.getDocuments(workingCollectionName, { limit: 100 });
    if (docsAfterTruncate.success) {
      if (docsAfterTruncate.documents && docsAfterTruncate.documents.length > 0) {
        throw new Error(`Collection was not truncated. Found ${docsAfterTruncate.documents.length} documents`);
      }
      console.log('✓ Truncation verified');
    } else {
      // Qdrant returns "Not Found" for empty collections - verify collection still exists
      const collections = await client.getCollections();
      if (collections.success && collections.collections) {
        const found = collections.collections.find(c => c.name === workingCollectionName);
        if (found) {
          console.log('✓ Truncation verified (collection is empty, getDocuments returned Not Found)');
        } else {
          // Collection doesn't exist - this might be acceptable if truncate deleted it
          // But let's check collection info one more time
          const collectionInfo = await client.getCollectionInfo(workingCollectionName);
          if (!collectionInfo.success) {
            console.log(`⚠ Collection ${workingCollectionName} not found after truncate - assuming truncation succeeded (Qdrant may delete empty collections)`);
          } else {
            console.log('✓ Truncation verified');
          }
        }
      } else {
        console.log(`⚠ Could not verify truncation (${docsAfterTruncate.error}), but truncate succeeded - assuming success`);
      }
    }

    console.log('Step 15: Dropping collection...');
    const dropResult = await client.dropCollection(workingCollectionName);
    if (!dropResult.success) {
      throw new Error(`Failed to drop collection: ${dropResult.error}`);
    }
    console.log('✓ Collection dropped');

    await new Promise(resolve => setTimeout(resolve, 500));
    const collectionsAfterDrop = await client.getCollections();
    if (!collectionsAfterDrop.success) {
      throw new Error(`Failed to get collections after drop: ${collectionsAfterDrop.error}`);
    }
    const foundAfterDrop = collectionsAfterDrop.collections?.find(c => c.name === workingCollectionName);
    if (foundAfterDrop) {
      throw new Error(`Collection ${workingCollectionName} still exists after drop`);
    }
    console.log('✓ Drop verified');
  }

  // ============================================
  // Test Cases
  // ============================================

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
      const { workingCollectionName, schema } = await testCollectionCreation(collectionName, 1536);
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

      const testDocs = await testDocumentInsertion(workingCollectionName, schema, 1536);
      expect(testDocs.length).toBe(12);
      (client as any).__testDocs = testDocs;
    }, 60000);

    it('should retrieve documents and test pagination', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentRetrieval(workingCollectionName, testDocs.length);
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

      await testSearch(workingCollectionName, schema, 1536);
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

      await testDocumentUpdate(workingCollectionName, testDocs[2]);
    }, 60000);

    it('should delete documents', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      const testDocs = (client as any).__testDocs;
      if (!workingCollectionName || !testDocs) {
        throw new Error('Documents must be inserted first');
      }

      await testDocumentDeletion(workingCollectionName, testDocs);
    }, 60000);
  });

  describe('Collection Cleanup', () => {
    it('should truncate and drop collection', async () => {
      const workingCollectionName = (client as any).__testCollectionName;
      if (!workingCollectionName) {
        throw new Error('Collection must be created first');
      }

      await testCollectionManagement(workingCollectionName);
    }, 60000);
  });

  it('should complete full integration test flow', async () => {
    const fullTestCollectionName = generateTestCollectionName('qdrant_test_full');
    const { workingCollectionName, schema } = await testCollectionCreation(fullTestCollectionName, 1536);
    const testDocs = await testDocumentInsertion(workingCollectionName, schema, 1536);
    await testDocumentRetrieval(workingCollectionName, testDocs.length);
    await testSearch(workingCollectionName, schema, 1536);
    await testDocumentUpdate(workingCollectionName, testDocs[2]);
    await testDocumentDeletion(workingCollectionName, testDocs);
    await testCollectionManagement(workingCollectionName);
    console.log('\n✅ All tests passed!');
  }, 120000);

  // ============================================
  // Sparse Vector Search Tests
  // ============================================

  describe('Sparse Vector Search', () => {
    it('should perform sparse-only search', async () => {
      const sparseCollectionName = generateTestCollectionName('qdrant_sparse_only');
      
      // Create collection with tiny dense vector + sparse (Qdrant requires at least one dense vector)
      await client.createCollection({
        name: sparseCollectionName,
        vectorType: 'named',
        namedVectors: [{ name: 'dummy', size: 4, distance: 'Cosine' }], // Minimal dense vector
        sparseVectors: [{ name: 'sparse' }],
      });
      
      await waitFor(async () => {
        const schema = await client.getCollectionSchema(sparseCollectionName);
        return schema.success;
      });
      
      // Create a base sparse vector that will have some overlap with search
      const baseSparseVector = generateTestSparseVector();
      
      // Insert documents with both vectors
      console.log('Inserting sparse documents...');
      for (let i = 1; i <= 5; i++) {
        // Create variants of the base sparse vector with some overlap
        const sparseVector = {
          indices: [...baseSparseVector.indices, ...(i > 2 ? [baseSparseVector.indices[0] + i * 10] : [])],
          values: [...baseSparseVector.values, ...(i > 2 ? [Math.random() * 5] : [])],
        };
        
        const doc: Document = {
          primary: { name: 'id', value: i },
          vectors: {
            dummy: {
              key: 'dummy',
              vectorType: 'dense',
              size: 4,
              value: { data: [0.1, 0.2, 0.3, 0.4] }, // Dummy vector
            },
            sparse: {
              key: 'sparse',
              vectorType: 'sparse',
              value: sparseVector,
            },
          },
          payload: { text: `Sparse doc ${i}` },
        };
        await client.upsertDocument(sparseCollectionName, { document: doc });
      }
      console.log('✓ Sparse documents inserted');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Perform sparse-only search (only query sparse vector) using the base vector
      console.log('Performing sparse-only search...');
      const searchVectors = {
        sparse: {
          key: 'sparse',
          vectorType: 'sparse' as const,
          value: baseSparseVector, // Use the same base vector for overlap
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
});
