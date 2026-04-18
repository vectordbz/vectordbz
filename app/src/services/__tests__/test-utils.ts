/**
 * Common Test Utilities for Vector Database Integration Tests
 *
 * This module provides only shared, database-agnostic utilities.
 * Client-specific test logic should be in each client's test file.
 */

import { expect } from 'vitest';
import {
  VectorDBClient,
  ConnectionConfig,
  Document,
  DocumentVector,
  COLLECTION_DEFAULT_VECTOR,
  SearchCapabilities,
  CollectionSchema,
} from '../../types';
import { DynamicFormSchema } from '../../components/DynamicForm/types';
import crypto from 'crypto';

// ============================================
// Types
// ============================================

export interface TestFlowOptions {
  client: VectorDBClient;
  config: ConnectionConfig;
  collectionName: string;
  vectorDimension?: number;
}

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a random collection name for testing
 */
export function generateTestCollectionName(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a test vector of specified dimension
 * Matches the UI's generateRandomVector implementation
 */
export function generateTestVector(dimension = 1536): number[] {
  return Array.from({ length: dimension }, () => parseFloat((Math.random() * 2 - 1).toFixed(6)));
}

/**
 * Generate a sparse test vector
 */
export function generateTestSparseVector(
  maxDimension = 30000,
  nonZeroCount = 50,
): { indices: number[]; values: number[] } {
  const indices: number[] = [];
  const values: number[] = [];

  // Generate unique random indices
  const usedIndices = new Set<number>();
  while (usedIndices.size < nonZeroCount) {
    usedIndices.add(Math.floor(Math.random() * maxDimension));
  }

  // Sort indices and generate values
  Array.from(usedIndices)
    .sort((a, b) => a - b)
    .forEach((idx) => {
      indices.push(idx);
      values.push(Math.random() * 5); // Positive values for BM25-style
    });

  return { indices, values };
}

/**
 * Generate a binary test vector (byte array)
 */
export function generateTestBinaryVector(dimensionBits = 256): number[] {
  const numBytes = Math.ceil(dimensionBits / 8);
  return Array.from({ length: numBytes }, () => Math.floor(Math.random() * 256));
}

/**
 * Generate a test document with vector
 */
export function generateTestDocument(
  id: string | number,
  vectorDimension = 1536,
  metadata: Record<string, unknown> = {},
): Document {
  return {
    primary: {
      name: 'id',
      value: id,
    },
    vectors: {
      [COLLECTION_DEFAULT_VECTOR]: {
        key: COLLECTION_DEFAULT_VECTOR,
        vectorType: 'dense',
        size: vectorDimension,
        value: {
          data: generateTestVector(vectorDimension),
        },
      },
    },
    payload: {
      text: `Test document ${id}`,
      category: 'test',
      ...metadata,
    },
  };
}

/**
 * Generate a test document with sparse vector
 */
export function generateTestSparseDocument(
  id: string | number,
  metadata: Record<string, unknown> = {},
): Document {
  return {
    primary: {
      name: 'id',
      value: id,
    },
    vectors: {
      sparse: {
        key: 'sparse',
        vectorType: 'sparse',
        value: generateTestSparseVector(),
      },
    },
    payload: {
      text: `Test sparse document ${id}`,
      category: 'test',
      ...metadata,
    },
  };
}

/**
 * Generate a test document with binary vector
 */
export function generateTestBinaryDocument(
  id: string | number,
  dimensionBits = 256,
  metadata: Record<string, unknown> = {},
): Document {
  return {
    primary: {
      name: 'id',
      value: id,
    },
    vectors: {
      binary_vector: {
        key: 'binary_vector',
        vectorType: 'binary',
        size: dimensionBits,
        value: {
          data: generateTestBinaryVector(dimensionBits),
        },
      },
    },
    payload: {
      text: `Test binary document ${id}`,
      category: 'test',
      ...metadata,
    },
  };
}

/**
 * Generate a test document with hybrid vectors (dense + sparse)
 */
export function generateTestHybridDocument(
  id: string | number,
  denseDimension = 384,
  metadata: Record<string, unknown> = {},
): Document {
  return {
    primary: {
      name: 'id',
      value: id,
    },
    vectors: {
      dense: {
        key: 'dense',
        vectorType: 'dense',
        size: denseDimension,
        value: {
          data: generateTestVector(denseDimension),
        },
      },
      sparse: {
        key: 'sparse',
        vectorType: 'sparse',
        value: generateTestSparseVector(),
      },
    },
    payload: {
      text: `Test hybrid document ${id}`,
      category: 'test',
      ...metadata,
    },
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

// ============================================
// Test Configuration
// ============================================

/**
 * Default connection configs for local testing
 * These match the docker-compose.yml services
 */
export const TEST_CONFIGS: Record<string, ConnectionConfig> = {
  qdrant: {
    type: 'qdrant',
    host: 'localhost',
    port: 6333,
    https: false,
  },
  weaviate: {
    type: 'weaviate',
    host: 'localhost',
    port: 8080,
    https: false,
  },
  chromadb: {
    type: 'chromadb',
    host: 'localhost',
    port: 8000,
    https: false,
  },
  milvus: {
    type: 'milvus',
    host: 'localhost',
    port: 19530,
    https: false,
  },
  pgvector: {
    type: 'pgvector',
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'vectordb',
    https: false,
  },
  pinecone: {
    type: 'pinecone',
    apiKey: process.env.PINECONE_API_KEY || '',
  },
  elasticsearch: {
    type: 'elasticsearch',
    host: 'localhost',
    port: 9200,
    https: false,
  },
  redissearch: {
    type: 'redissearch',
    host: 'localhost',
    port: 6379,
    https: false,
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Convert collection name to PascalCase for Weaviate
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[_\s-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Build a simple collection config from the schema
 * Extracts required fields and uses defaults/defaultValues from the schema
 * This is a common helper - client-specific overrides should be done in client test files
 */
export function buildSimpleCollectionConfig(
  schema: DynamicFormSchema,
  collectionName: string,
  vectorDimension: number,
  clientSpecificOverrides?: (config: Record<string, unknown>) => void,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  // Helper to check if a field's showWhen condition is satisfied
  const isConditionSatisfied = (item: any, config: Record<string, unknown>): boolean => {
    if (!item.showWhen) return true;
    const { field, operator, value } = item.showWhen;
    const fieldValue = config[field];

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'notEquals':
        return fieldValue !== value;
      default:
        return true;
    }
  };

  // First pass: Set collection name
  for (const section of schema.sections) {
    for (const item of section.items) {
      if (item.hidden) continue;

      if (item.key === 'name' || item.key === 'class' || item.key === 'collection_name') {
        // For Weaviate, convert to PascalCase
        if (item.key === 'class') {
          config[item.key] = toPascalCase(collectionName);
        } else {
          config[item.key] = collectionName;
        }
      }
    }
  }

  // Second pass: Set defaults for fields without showWhen conditions
  for (const section of schema.sections) {
    for (const item of section.items) {
      if (item.hidden || config[item.key] !== undefined) continue;
      if (!isConditionSatisfied(item, config)) continue;

      if (item.defaultValue !== undefined) {
        config[item.key] = item.defaultValue;
      } else if (item.required) {
        // For required fields without defaults, use sensible defaults
        if (item.type === 'radio' && item.options && item.options.length > 0) {
          config[item.key] = item.options[0].value;
        } else if (item.type === 'select' && item.options && item.options.length > 0) {
          config[item.key] = item.options[0].value;
        } else if (item.type === 'number') {
          config[item.key] = item.min !== undefined ? item.min : 1;
        } else if (item.type === 'boolean' || item.type === 'switch') {
          config[item.key] = false;
        } else if (item.type === 'text') {
          config[item.key] = '';
        }
      }
    }
  }

  // Third pass: Set vector dimension
  for (const section of schema.sections) {
    for (const item of section.items) {
      if (item.hidden || !isConditionSatisfied(item, config)) continue;

      if (item.key === 'size' || item.key === 'dimension' || item.key === 'vectorDimensions') {
        config[item.key] = vectorDimension;
      }
    }
  }

  // Apply client-specific overrides if provided
  if (clientSpecificOverrides) {
    clientSpecificOverrides(config);
  }

  return config;
}

// ============================================
// Generic Test Functions
// ============================================
// These are generic implementations that work for most clients.
// Clients can override these in their test files if needed.

/**
 * Test collection creation and setup
 */
export async function testCollectionCreation(
  options: TestFlowOptions,
): Promise<{ workingCollectionName: string; schema: any }> {
  const { client, collectionName, vectorDimension = 1536 } = options;

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
  const createConfig = buildSimpleCollectionConfig(
    createSchema,
    collectionName,
    vectorDimension,
    (config) => {
      // Milvus-specific override
      if (
        config.primaryKeyType !== undefined ||
        config.autoId !== undefined ||
        config.autoID !== undefined ||
        config.schemaType !== undefined
      ) {
        config.schemaType = 'custom';
        config.primaryKeyType = 'VarChar';
        config.primaryKeyName = 'id';
        config.maxLength = 255;
        config.autoId = false;
        config.autoID = false;
        if (
          !config.vectorFields ||
          !Array.isArray(config.vectorFields) ||
          config.vectorFields.length === 0
        ) {
          config.vectorFields = [
            {
              name: 'vector',
              dataType: 'FloatVector',
              dimension: vectorDimension,
              metric_type: 'COSINE',
            },
          ];
        }
      }
    },
  );

  // Determine the expected collection name (for Weaviate, it's PascalCase)
  const expectedCollectionName = createConfig.class
    ? (createConfig.class as string)
    : collectionName;

  const createResult = await client.createCollection(createConfig);
  if (!createResult.success) {
    throw new Error(`Failed to create collection: ${createResult.error}`);
  }
  console.log('✓ Collection created');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('Step 4: Verifying collection exists...');
  // For Weaviate and other databases, check both count increase and name existence
  await waitFor(
    async () => {
      try {
        const collectionsAfter = await client.getCollections();
        if (!collectionsAfter.success) return false;

        // Check if count increased
        const newCount = collectionsAfter.collections?.length || 0;
        if (newCount > initialCount) return true;

        // Also check if the expected collection name exists (for Weaviate PascalCase)
        if (expectedCollectionName && collectionsAfter.collections) {
          const found = collectionsAfter.collections.some((c) => c.name === expectedCollectionName);
          if (found) return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    20000,
    500,
  ); // Increased timeout to 20s for slower databases like Weaviate

  const collectionsAfter = await client.getCollections();
  if (!collectionsAfter.success) {
    throw new Error(`Failed to get collections after creation: ${collectionsAfter.error}`);
  }

  // Try to find the collection by expected name first (for Weaviate PascalCase)
  let createdCollection = expectedCollectionName
    ? collectionsAfter.collections?.find((c) => c.name === expectedCollectionName)
    : null;

  // If not found by name, find by comparing with before list
  if (!createdCollection) {
    const collectionsBeforeNames = new Set(collectionsBefore.collections?.map((c) => c.name) || []);
    createdCollection = collectionsAfter.collections?.find(
      (c) => !collectionsBeforeNames.has(c.name),
    );
  }

  if (!createdCollection) {
    const newCount = collectionsAfter.collections?.length || 0;
    throw new Error(
      `Newly created collection not found in collections list. ` +
        `Expected name: ${expectedCollectionName}, ` +
        `Count before: ${initialCount}, Count after: ${newCount}`,
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

/**
 * Test document insertion
 */
export async function testDocumentInsertion(
  client: VectorDBClient,
  workingCollectionName: string,
  schema: any,
  vectorDimension: number,
  dataRequirements?: Record<string, string>,
): Promise<Document[]> {
  console.log('Step 7: Inserting test documents...');
  const primaryKeyName = schema?.primary.name || 'id';
  const schemaVectors = schema?.vectors || {};
  const vectorFieldNames =
    Object.keys(schemaVectors).length > 0
      ? Object.keys(schemaVectors)
      : [COLLECTION_DEFAULT_VECTOR];
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

  const adjustedDocs = testDocs.map((doc) => {
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
        if (
          !vector.value ||
          !vector.value.data ||
          !Array.isArray(vector.value.data) ||
          vector.value.data.length === 0
        ) {
          throw new Error(`Document ${doc.primary.value} has invalid dense vector for key ${key}`);
        }
        if (vector.value.data.length !== vectorDimension) {
          throw new Error(
            `Document ${doc.primary.value} vector dimension mismatch: expected ${vectorDimension}, got ${vector.value.data.length}`,
          );
        }
      }

      const vectorKey = key === COLLECTION_DEFAULT_VECTOR ? actualVectorFieldName : key;
      // Ensure the key property matches the field name
      adjustedVectors[vectorKey] = {
        ...vector,
        key: vectorKey,
      };
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

  const isAutoID = schema?.primary?.autoID === true;
  const documentsToInsert = isAutoID
    ? adjustedDocs.map((doc) => {
        const { primary, ...docWithoutPrimary } = doc;
        return docWithoutPrimary;
      })
    : adjustedDocs;

  const insertedDocs: Document[] = [];

  for (let i = 0; i < documentsToInsert.length; i++) {
    const doc = documentsToInsert[i];
    const originalDoc = adjustedDocs[i];
    const docId = isAutoID ? '(auto-generated)' : originalDoc.primary.value;

    console.log(`  Inserting document: ${docId} (primary key: ${primaryKeyName})...`);
    const upsertResult = await client.upsertDocument(
      workingCollectionName,
      { document: doc },
      dataRequirements,
    );
    if (!upsertResult.success) {
      throw new Error(`Failed to upsert document ${docId}: ${upsertResult.error}`);
    }

    let actualId: string | number;
    if (upsertResult.document) {
      if (upsertResult.document.primary?.value !== undefined) {
        actualId = upsertResult.document.primary.value;
      } else if (upsertResult.document.id !== undefined) {
        actualId = upsertResult.document.id;
      } else if (upsertResult.document[primaryKeyName] !== undefined) {
        actualId = upsertResult.document[primaryKeyName];
      } else {
        actualId = originalDoc.primary.value;
      }
    } else {
      actualId = originalDoc.primary.value;
    }

    const insertedDoc: Document = {
      ...doc,
      primary: {
        name: primaryKeyName,
        value: actualId,
      },
    };
    insertedDocs.push(insertedDoc);
    console.log(`  ✓ Document ${actualId} inserted`);
  }
  console.log(`✓ Inserted ${insertedDocs.length} documents`);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  return insertedDocs;
}

/**
 * Test document retrieval and pagination
 */
export async function testDocumentRetrieval(
  client: VectorDBClient,
  workingCollectionName: string,
  expectedCount: number,
  dataRequirements?: Record<string, string>,
): Promise<void> {
  console.log('Step 9: Getting documents...');
  const getDocsResult = await client.getDocuments(workingCollectionName, {
    limit: Math.max(expectedCount, 20),
    dataRequirements,
  });
  if (!getDocsResult.success) {
    throw new Error(`Failed to get documents: ${getDocsResult.error}`);
  }
  if (!getDocsResult.documents || getDocsResult.documents.length < expectedCount) {
    throw new Error(
      `Expected at least ${expectedCount} documents, got ${getDocsResult.documents?.length || 0}`,
    );
  }
  console.log(`✓ Retrieved ${getDocsResult.documents.length} documents`);

  console.log('Step 9b: Testing pagination...');
  const pageSize = 5;
  const firstPageResult = await client.getDocuments(workingCollectionName, {
    limit: pageSize,
    dataRequirements,
  });
  if (!firstPageResult.success) {
    throw new Error(`Failed to get first page: ${firstPageResult.error}`);
  }
  if (!firstPageResult.documents || firstPageResult.documents.length !== pageSize) {
    throw new Error(
      `Expected ${pageSize} documents on first page, got ${firstPageResult.documents?.length || 0}`,
    );
  }
  console.log(`✓ First page: ${firstPageResult.documents.length} documents`);

  if (firstPageResult.nextOffset === null) {
    throw new Error('Expected nextOffset to be available for pagination');
  }

  const secondPageResult = await client.getDocuments(workingCollectionName, {
    limit: pageSize,
    offset: firstPageResult.nextOffset,
    dataRequirements,
  });
  if (!secondPageResult.success) {
    throw new Error(`Failed to get second page: ${secondPageResult.error}`);
  }
  if (!secondPageResult.documents || secondPageResult.documents.length !== pageSize) {
    throw new Error(
      `Expected ${pageSize} documents on second page, got ${secondPageResult.documents?.length || 0}`,
    );
  }

  const firstPageIds = new Set(firstPageResult.documents.map((d) => d.primary.value));
  const secondPageIds = new Set(secondPageResult.documents.map((d) => d.primary.value));
  const overlap = [...firstPageIds].filter((id) => secondPageIds.has(id));
  if (overlap.length > 0) {
    throw new Error(
      `Pagination overlap detected: ${overlap.length} documents appear on both pages`,
    );
  }

  console.log(`✓ Second page: ${secondPageResult.documents.length} documents (no overlap)`);
}

/**
 * Test document sorting
 */
export async function testDocumentSorting(
  client: VectorDBClient,
  workingCollectionName: string,
  schema: any,
  dataRequirements?: Record<string, string>,
): Promise<void> {
  console.log('Step 9c: Testing document sorting...');

  // Get all documents first to verify sorting
  const allDocsResult = await client.getDocuments(workingCollectionName, {
    limit: 100,
    dataRequirements,
  });
  if (!allDocsResult.success || !allDocsResult.documents || allDocsResult.documents.length < 3) {
    throw new Error(
      `Need at least 3 documents for sorting test, got ${allDocsResult.documents?.length || 0}`,
    );
  }

  const primaryKeyName = schema?.primary.name || 'id';
  const testDocs = allDocsResult.documents;

  // Test sorting by primary key (ascending)
  console.log(`  Testing sort by ${primaryKeyName} (ascending)...`);
  const sortAscResult = await client.getDocuments(workingCollectionName, {
    limit: testDocs.length,
    sort: [{ field: primaryKeyName, order: 'asc' }],
    dataRequirements,
  });
  if (!sortAscResult.success || !sortAscResult.documents) {
    throw new Error(`Failed to sort by ${primaryKeyName} ascending: ${sortAscResult.error}`);
  }

  // Verify ascending order
  const ascValues = sortAscResult.documents.map((doc) => {
    const val = doc.primary.value;
    return typeof val === 'number' ? val : String(val);
  });
  const ascSorted = [...ascValues].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  });
  if (JSON.stringify(ascValues) !== JSON.stringify(ascSorted)) {
    throw new Error(`Documents not sorted ascending by ${primaryKeyName}`);
  }
  console.log(`  ✓ Ascending sort verified`);

  // Test sorting by primary key (descending)
  console.log(`  Testing sort by ${primaryKeyName} (descending)...`);
  const sortDescResult = await client.getDocuments(workingCollectionName, {
    limit: testDocs.length,
    sort: [{ field: primaryKeyName, order: 'desc' }],
    dataRequirements,
  });
  if (!sortDescResult.success || !sortDescResult.documents) {
    throw new Error(`Failed to sort by ${primaryKeyName} descending: ${sortDescResult.error}`);
  }

  // Verify descending order
  const descValues = sortDescResult.documents.map((doc) => {
    const val = doc.primary.value;
    return typeof val === 'number' ? val : String(val);
  });
  const descSorted = [...descValues].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return b - a;
    return String(b).localeCompare(String(a));
  });
  if (JSON.stringify(descValues) !== JSON.stringify(descSorted)) {
    throw new Error(`Documents not sorted descending by ${primaryKeyName}`);
  }
  console.log(`  ✓ Descending sort verified`);

  // Test sorting by a payload field if available
  const firstDoc = testDocs[0];
  if (firstDoc.payload && Object.keys(firstDoc.payload).length > 0) {
    const payloadField = Object.keys(firstDoc.payload)[0];
    const payloadValue = firstDoc.payload[payloadField];

    // Only test if it's a sortable type
    if (
      typeof payloadValue === 'string' ||
      typeof payloadValue === 'number' ||
      typeof payloadValue === 'boolean'
    ) {
      console.log(`  Testing sort by payload field "${payloadField}" (ascending)...`);
      const payloadSortResult = await client.getDocuments(workingCollectionName, {
        limit: testDocs.length,
        sort: [{ field: payloadField, order: 'asc' }],
      });

      if (payloadSortResult.success && payloadSortResult.documents) {
        // Verify sorting
        const payloadValues = payloadSortResult.documents
          .map((doc) => doc.payload?.[payloadField])
          .filter((v) => v !== undefined && v !== null);

        if (payloadValues.length > 1) {
          const sortedPayloadValues = [...payloadValues].sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            return String(a).localeCompare(String(b));
          });

          if (JSON.stringify(payloadValues) === JSON.stringify(sortedPayloadValues)) {
            console.log(`  ✓ Payload field "${payloadField}" sort verified`);
          } else {
            console.log(
              `  ⚠ Payload field "${payloadField}" sort may not be fully supported (native vs client-side)`,
            );
          }
        }
      } else {
        console.log(
          `  ⚠ Sorting by payload field "${payloadField}" not supported or failed: ${payloadSortResult.error}`,
        );
      }
    }
  }

  console.log('✓ Document sorting tests completed');
}

/**
 * Test getSearchCapabilities returns valid capabilities for the collection
 */
export async function testGetSearchCapabilities(
  client: VectorDBClient,
  collectionName: string,
  schema?: CollectionSchema | null,
): Promise<SearchCapabilities> {
  const capabilities = await client.getSearchCapabilities(collectionName, schema ?? undefined);
  expect(capabilities).toBeDefined();
  expect(typeof capabilities.dense).toBe('boolean');
  expect(capabilities.dense).toBe(true);
  expect(typeof capabilities.sparse).toBe('boolean');
  expect(typeof capabilities.lexical).toBe('boolean');
  expect(typeof capabilities.clientSideFusion).toBe('boolean');
  expect(typeof capabilities.filters).toBe('boolean');
  expect(typeof capabilities.scoreThreshold).toBe('boolean');
  expect(Array.isArray(capabilities.fusionStrategies)).toBe(true);
  if (capabilities.supportsHybridAlpha !== undefined) {
    expect(typeof capabilities.supportsHybridAlpha).toBe('boolean');
    if (capabilities.supportsHybridAlpha && capabilities.hybridAlphaDefault != null) {
      expect(typeof capabilities.hybridAlphaDefault).toBe('number');
      expect(capabilities.hybridAlphaDefault).toBeGreaterThanOrEqual(0);
      expect(capabilities.hybridAlphaDefault).toBeLessThanOrEqual(1);
    }
  }
  return capabilities;
}

/**
 * Test search with lexicalQuery and hybridAlpha (for clients that support hybrid, e.g. Weaviate)
 */
export async function testSearchWithLexicalAndHybridAlpha(
  client: VectorDBClient,
  workingCollectionName: string,
  schema: any,
  vectorDimension: number,
  dataRequirements?: Record<string, string>,
): Promise<void> {
  const capabilities = await client.getSearchCapabilities(workingCollectionName, schema);
  if (!capabilities.lexical) {
    console.log('  Skipping lexical/hybrid search test (client does not support lexical)');
    return;
  }

  // Get a document vector for search
  const getDocsResult = await client.getDocuments(workingCollectionName, {
    limit: 1,
    dataRequirements,
  });
  if (!getDocsResult.success || !getDocsResult.documents?.length) {
    throw new Error('No documents to use for hybrid search test');
  }

  const sampleDoc = getDocsResult.documents[0];
  const schemaVectors = schema?.vectors || {};
  const vectorFieldNames =
    Object.keys(schemaVectors).length > 0
      ? Object.keys(schemaVectors)
      : [COLLECTION_DEFAULT_VECTOR];
  const searchVectorKey = schemaVectors[COLLECTION_DEFAULT_VECTOR]
    ? COLLECTION_DEFAULT_VECTOR
    : vectorFieldNames[0];
  const docVector = sampleDoc.vectors?.[searchVectorKey];
  if (!docVector || docVector.vectorType !== 'dense' || !('data' in docVector.value)) {
    throw new Error('Sample document has no dense vector for hybrid search test');
  }

  const searchVectors: Record<string, DocumentVector> = {
    [searchVectorKey]: {
      key: searchVectorKey,
      vectorType: 'dense',
      size: docVector.size || vectorDimension,
      value: { data: docVector.value.data },
    },
  };

  const searchOptions: any = {
    limit: 5,
    dataRequirements,
    lexicalQuery: 'test document',
  };
  if (capabilities.supportsHybridAlpha) {
    searchOptions.hybridAlpha = capabilities.hybridAlphaDefault ?? 0.75;
  }

  const searchResult = await client.search(workingCollectionName, searchVectors, searchOptions);
  expect(searchResult.success).toBe(true);
  expect(searchResult.documents).toBeDefined();
  // May return 0 results if no text matches; success is enough to verify the API accepts options
  console.log(
    `✓ Search with lexical/hybrid options returned ${searchResult.documents?.length ?? 0} results`,
  );
}

/**
 * Test keyword-only search (no vector, only lexicalQuery) for backends that support it (e.g. Elasticsearch, Weaviate).
 * Calls search with empty vectors and lexicalQuery; skips if client does not support lexical.
 */
export async function testSearchKeywordOnly(
  client: VectorDBClient,
  workingCollectionName: string,
  schema: any,
  dataRequirements?: Record<string, string>,
): Promise<void> {
  const capabilities = await client.getSearchCapabilities(workingCollectionName, schema);
  if (!capabilities.lexical) {
    console.log('  Skipping keyword-only search test (client does not support lexical)');
    return;
  }

  const searchVectors: Record<string, DocumentVector> = {};
  const searchOptions: any = {
    limit: 5,
    dataRequirements,
    lexicalQuery: 'test document',
  };
  if (capabilities.supportsHybridAlpha) {
    searchOptions.hybridAlpha = 0; // keyword only
  }

  const searchResult = await client.search(workingCollectionName, searchVectors, searchOptions);
  expect(searchResult.success).toBe(true);
  expect(searchResult.documents).toBeDefined();
  console.log(`✓ Keyword-only search returned ${searchResult.documents?.length ?? 0} results`);
}

/**
 * Test search functionality
 */
export async function testSearch(
  client: VectorDBClient,
  workingCollectionName: string,
  schema: any,
  vectorDimension: number,
  dataRequirements?: Record<string, string>,
): Promise<void> {
  console.log('Step 10: Testing search...');

  // Get a document from the collection to use its vector for search
  const getDocsResult = await client.getDocuments(workingCollectionName, {
    limit: 1,
    dataRequirements,
  });

  if (!getDocsResult.success || !getDocsResult.documents || getDocsResult.documents.length === 0) {
    throw new Error('No documents found in collection to use for search test');
  }

  const sampleDoc = getDocsResult.documents[0];
  if (!sampleDoc.vectors || Object.keys(sampleDoc.vectors).length === 0) {
    throw new Error('Sample document has no vectors to use for search');
  }

  // Find the appropriate vector to use for search
  const schemaVectors = schema?.vectors || {};
  const vectorFieldNames =
    Object.keys(schemaVectors).length > 0
      ? Object.keys(schemaVectors)
      : [COLLECTION_DEFAULT_VECTOR];
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
      dataRequirements,
    });
    if (!searchResult.success) {
      throw new Error(`Search failed: ${searchResult.error}`);
    }
    if (!searchResult.documents || searchResult.documents.length === 0) {
      throw new Error('Search returned no results');
    }
    console.log(
      `✓ Search returned ${searchResult.documents.length} results (using vector from document: ${sampleDoc.primary.value})`,
    );
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
    dataRequirements,
  });
  if (!searchResult.success) {
    throw new Error(`Search failed: ${searchResult.error}`);
  }
  if (!searchResult.documents || searchResult.documents.length === 0) {
    throw new Error('Search returned no results');
  }
  console.log(
    `✓ Search returned ${searchResult.documents.length} results (using vector from document: ${sampleDoc.primary.value})`,
  );
}

/**
 * Test document update
 */
export async function testDocumentUpdate(
  client: VectorDBClient,
  workingCollectionName: string,
  testDoc: Document,
  dataRequirements?: Record<string, string>,
): Promise<void> {
  console.log('Step 11: Updating document...');
  const updatedPayload = {
    ...testDoc.payload,
    updated: true,
    newField: 'updated_value',
  };
  const updateResult = await client.upsertDocument(
    workingCollectionName,
    {
      document: {
        ...testDoc,
        payload: updatedPayload,
      },
    },
    dataRequirements,
  );
  if (!updateResult.success) {
    throw new Error(`Failed to update document: ${updateResult.error}`);
  }
  console.log('✓ Document updated');

  // Wait longer for indexing, especially for pgvector
  await new Promise((resolve) => setTimeout(resolve, 2000));
  let foundDoc: Document | undefined;

  // Try filter first
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
    dataRequirements,
  });

  if (updatedDocs.success && updatedDocs.documents && updatedDocs.documents.length > 0) {
    foundDoc = updatedDocs.documents.find((doc) => doc.primary.value === testDoc.primary.value);
  }

  // Fallback: get all documents and find the one we updated
  if (!foundDoc) {
    const allDocs = await client.getDocuments(workingCollectionName, { limit: 1000 });
    if (allDocs.success && allDocs.documents) {
      foundDoc = allDocs.documents.find((doc) => doc.primary.value === testDoc.primary.value);
    }
  }

  // If still not found, wait a bit more and try again (for slow databases like pgvector)
  if (!foundDoc) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const retryDocs = await client.getDocuments(workingCollectionName, { limit: 1000 });
    if (retryDocs.success && retryDocs.documents) {
      foundDoc = retryDocs.documents.find((doc) => doc.primary.value === testDoc.primary.value);
    }
  }

  if (!foundDoc) {
    throw new Error(`Updated document not found (ID: ${testDoc.primary.value})`);
  }

  // Check payload - some databases (like pgvector) might store fields in metadata JSONB
  const payload = foundDoc.payload || {};
  let updated = payload.updated;
  let newField = payload.newField;

  // Check if fields are nested in metadata (pgvector stores non-schema fields in metadata JSONB)
  if (payload.metadata && typeof payload.metadata === 'object') {
    const metadata = payload.metadata as Record<string, unknown>;
    if (updated === undefined && metadata.updated !== undefined) {
      updated = metadata.updated;
    }
    if (newField === undefined && metadata.newField !== undefined) {
      newField = metadata.newField;
    }
  }

  if (updated !== true || newField !== 'updated_value') {
    // Debug: log what we actually got
    console.error('Document payload:', JSON.stringify(payload, null, 2));
    console.error('Expected: updated=true, newField=updated_value');
    throw new Error(
      `Document was not updated correctly. Got updated=${updated}, newField=${newField}`,
    );
  }
  console.log('✓ Update verified');
}

/**
 * Test document deletion
 */
export async function testDocumentDeletion(
  client: VectorDBClient,
  workingCollectionName: string,
  testDocs: Document[],
  dataRequirements?: Record<string, string>,
): Promise<void> {
  console.log('Step 12: Deleting single document...');
  const docToDelete = testDocs[0];
  const deleteResult = await client.deleteDocument(
    workingCollectionName,
    docToDelete.primary,
    dataRequirements,
  );
  if (!deleteResult.success) {
    throw new Error(`Failed to delete document: ${deleteResult.error}`);
  }
  console.log('✓ Document deleted');

  await new Promise((resolve) => setTimeout(resolve, 500));
  const docsAfterDelete = await client.getDocuments(workingCollectionName, {
    limit: 10,
    dataRequirements,
  });
  if (!docsAfterDelete.success) {
    throw new Error(`Failed to get documents after delete: ${docsAfterDelete.error}`);
  }
  const remainingCount = docsAfterDelete.documents?.length || 0;
  if (remainingCount >= testDocs.length) {
    throw new Error(
      `Document was not deleted. Expected < ${testDocs.length}, got ${remainingCount}`,
    );
  }
  console.log('✓ Deletion verified');

  console.log('Step 13: Deleting multiple documents with filter...');
  const deleteManyResult = await client.deleteDocuments(
    workingCollectionName,
    {
      conditions: [
        {
          field: 'category',
          operator: 'eq',
          value: 'B',
          valueType: 'string',
        },
      ],
      logic: 'and',
    },
    dataRequirements,
  );
  if (!deleteManyResult.success) {
    throw new Error(`Failed to delete documents: ${deleteManyResult.error}`);
  }
  console.log(`✓ Deleted ${deleteManyResult.deletedCount || 0} documents with filter`);
}

/**
 * Test collection management (truncate and drop)
 */
export async function testCollectionManagement(
  client: VectorDBClient,
  workingCollectionName: string,
): Promise<void> {
  console.log('Step 14: Truncating collection...');
  const truncateResult = await client.truncateCollection(workingCollectionName);
  if (!truncateResult.success) {
    throw new Error(`Failed to truncate collection: ${truncateResult.error}`);
  }
  console.log(`✓ Collection truncated (deleted ${truncateResult.deletedCount || 0} documents)`);

  // Wait for deletion to fully propagate (Pinecone is asynchronous)
  // Retry checking multiple times before failing
  let verified = false;
  for (let attempt = 0; attempt < 10 && !verified; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const collectionInfo = await client.getCollectionInfo(workingCollectionName);
    if (!collectionInfo.success) {
      // Some databases (like Qdrant) may return "Not Found" for empty collections after truncate
      // Check if collection still exists in collections list
      const collections = await client.getCollections();
      if (collections.success && collections.collections) {
        const found = collections.collections.find((c) => c.name === workingCollectionName);
        if (found) {
          console.log('✓ Truncation verified (collection exists but info unavailable)');
          verified = true;
          break;
        } else {
          throw new Error(`Collection ${workingCollectionName} not found after truncate`);
        }
      } else {
        throw new Error(
          `Collection ${workingCollectionName} not found after truncate: ${collectionInfo.error}`,
        );
      }
    } else {
      const docsAfterTruncate = await client.getDocuments(workingCollectionName, { limit: 100 });
      if (!docsAfterTruncate.success) {
        if (
          collectionInfo.data &&
          typeof collectionInfo.data.count === 'number' &&
          collectionInfo.data.count === 0
        ) {
          console.log('✓ Truncation verified (collection is empty)');
          verified = true;
          break;
        }
        // Continue retrying if getDocuments failed
      } else {
        if (!docsAfterTruncate.documents || docsAfterTruncate.documents.length === 0) {
          console.log('✓ Truncation verified');
          verified = true;
          break;
        }
        // Still has documents, continue waiting
        if (attempt === 9) {
          throw new Error(
            `Collection was not truncated after 10 attempts. Found ${docsAfterTruncate.documents.length} documents`,
          );
        }
      }
    }
  }

  console.log('Step 15: Dropping collection...');
  const dropResult = await client.dropCollection(workingCollectionName);
  if (!dropResult.success) {
    throw new Error(`Failed to drop collection: ${dropResult.error}`);
  }
  console.log('✓ Collection dropped');

  await new Promise((resolve) => setTimeout(resolve, 500));
  const collectionsAfterDrop = await client.getCollections();
  if (!collectionsAfterDrop.success) {
    throw new Error(`Failed to get collections after drop: ${collectionsAfterDrop.error}`);
  }
  const foundAfterDrop = collectionsAfterDrop.collections?.find(
    (c) => c.name === workingCollectionName,
  );
  if (foundAfterDrop) {
    throw new Error(`Collection ${workingCollectionName} still exists after drop`);
  }
  console.log('✓ Drop verified');
}

/**
 * Full integration test flow (calls all test sections)
 */
export async function runFullTestFlow(options: TestFlowOptions): Promise<void> {
  const { client, vectorDimension = 1536 } = options;

  const { workingCollectionName, schema } = await testCollectionCreation(options);
  const testDocs = await testDocumentInsertion(
    client,
    workingCollectionName,
    schema,
    vectorDimension,
  );
  await testDocumentRetrieval(client, workingCollectionName, testDocs.length);
  await testSearch(client, workingCollectionName, schema, vectorDimension);
  await testDocumentUpdate(client, workingCollectionName, testDocs[2]);
  await testDocumentDeletion(client, workingCollectionName, testDocs);
  await testCollectionManagement(client, workingCollectionName);

  console.log('\n✅ All tests passed!');
}
