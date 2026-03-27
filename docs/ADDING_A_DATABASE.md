# Adding a New Database Integration

This guide walks you through every file you need to touch to add a new vector database to VectorDBZ. The architecture uses a plugin pattern — every database is a TypeScript class implementing the `VectorDBClient` interface, registered through a central factory.

---

## Quick Checklist

Before you start, [open an issue](https://github.com/vectordbz/vectordbz/issues/new?template=new_db_integration.yml) to discuss the integration and avoid duplicate work.

- [ ] Add `'newdb'` to `DatabaseType` union in `app/src/types/index.ts`
- [ ] Add any new connection fields to `ConnectionConfig` in `app/src/types/index.ts`
- [ ] Create `app/src/services/clients/newdb.ts` implementing `VectorDBClient`
- [ ] Export and register the client in `app/src/services/index.ts`
- [ ] Add a `DatabaseOption` entry in `app/src/services/databases.ts`
- [ ] Install the SDK: `npm install newdb-sdk` in `app/`
- [ ] Add a mock seed script `mocks/seeds/newdb.js`
- [ ] Add a Docker service in `docker-compose.yml`
- [ ] Write integration tests `app/src/services/__tests__/newdb.test.ts`

---

## Step 1 — Register the Database Type

Open `app/src/types/index.ts` and add your identifier to the `DatabaseType` union:

```typescript
// Before
export type DatabaseType = 'qdrant' | 'weaviate' | 'milvus' | 'chromadb' | 'pgvector' | 'pinecone' | 'elasticsearch' | 'redissearch';

// After
export type DatabaseType = 'qdrant' | 'weaviate' | 'milvus' | 'chromadb' | 'pgvector' | 'pinecone' | 'elasticsearch' | 'redissearch' | 'newdb';
```

---

## Step 2 — Add Connection Fields (if needed)

If your database requires connection fields that don't already exist in `ConnectionConfig`, add them in the same file (`app/src/types/index.ts`):

```typescript
export interface ConnectionConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  apiKey?: string;
  https?: boolean;
  tenant?: string;
  database?: string;
  user?: string;
  password?: string;
  // Add new fields here, e.g.:
  // region?: string;       // for cloud-native DBs
  // namespace?: string;    // for namespace-scoped DBs
}
```

Use optional fields (`?`) — `ConnectionConfig` is shared across all databases.

---

## Step 3 — Implement the Client

Create `app/src/services/clients/newdb.ts`. The file must export a class that implements `VectorDBClient`.

Below is a complete annotated skeleton. Copy it, replace `NewDB` with your database name, and fill in the implementations:

```typescript
import log from 'electron-log';
import {
  VectorDBClient,
  ConnectionConfig,
  ConnectionResult,
  GetCollectionsResult,
  GetCollectionInfoResult,
  GetDocumentsOptions,
  GetDocumentsResult,
  SearchResult,
  SearchOptions,
  FilterQuery,
  DeleteDocumentResult,
  DeleteDocumentsResult,
  DropCollectionResult,
  TruncateCollectionResult,
  CreateCollectionResult,
  GetCollectionSchemaResult,
  CollectionSchema,
  SearchCapabilities,
  UpsertDocumentData,
  UpsertDocumentResult,
  Document,
  DocumentVector,
} from '../../types';
import { DynamicFormSchema } from '../../components/DynamicForm/types';
import { mergeWithDefault } from '../searchCapabilities';

// ============================================
// NewDB Client Implementation
// ============================================

export class NewDBClient implements VectorDBClient {
  private config: ConnectionConfig;
  private client: any; // replace with your SDK's client type

  constructor(config: ConnectionConfig) {
    this.config = config;
    // Initialize your SDK client here, e.g.:
    // this.client = new NewDBSDK({ host: config.host, apiKey: config.apiKey });
  }

  // ---- Connection ----

  async testConnection(): Promise<ConnectionResult> {
    try {
      // Ping the database or fetch a lightweight metadata endpoint.
      // Return the server version string if available.
      const info = await this.client.getServerInfo();
      return { success: true, version: info.version };
    } catch (error) {
      log.error('NewDB testConnection error:', error);
      return { success: false, error: String(error) };
    }
  }

  // ---- Collections ----

  async getCollections(): Promise<GetCollectionsResult> {
    try {
      // Return a list of Collection objects: { name: string, count: number, ...extras }
      // 'count' is the document/point count. Set to 0 if unavailable.
      const raw = await this.client.listCollections();
      const collections = raw.map((c: any) => ({
        name: c.name,
        count: c.vectorCount ?? 0,
      }));
      return { success: true, collections };
    } catch (error) {
      log.error('NewDB getCollections error:', error);
      return { success: false, error: String(error) };
    }
  }

  async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
    try {
      // Return raw info as a plain object — displayed as JSON in the Info tab.
      const info = await this.client.describeCollection(collection);
      return { success: true, data: info as Record<string, unknown> };
    } catch (error) {
      log.error('NewDB getCollectionInfo error:', error);
      return { success: false, error: String(error) };
    }
  }

  async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
    try {
      // Build a CollectionSchema that describes primary key, payload fields, and vector fields.
      // The UI uses this to power filtering, sorting, and search configuration.
      const schema: CollectionSchema = {
        primary: { name: 'id', type: 'string' },
        fields: {
          // Add payload/metadata fields here, e.g.:
          // text: { name: 'text', type: 'string' },
          // category: { name: 'category', type: 'string' },
        },
        vectors: {
          // Add vector fields here. Use COLLECTION_DEFAULT_VECTOR for single-vector collections.
          // For named vectors, use the field name as the key.
          // Example dense vector:
          // my_vector: {
          //   name: 'my_vector', type: 'vector', vectorType: 'dense',
          //   key: 'my_vector', size: 1536, distance: 'cosine',
          // },
        },
        multipleVectors: false, // true if the collection supports multiple named vectors
        hasVectors: true,
      };
      return { success: true, schema };
    } catch (error) {
      log.error('NewDB getCollectionSchema error:', error);
      return { success: false, error: String(error) };
    }
  }

  // ---- Documents ----

  async getDocuments(collection: string, options?: GetDocumentsOptions): Promise<GetDocumentsResult> {
    try {
      // Fetch a page of documents. Support limit/offset pagination.
      // Map results to the Document shape: { primary, vectors, payload, score? }
      // Return nextOffset = null when there are no more pages.
      const { limit = 10, offset = 0, filter, sort } = options ?? {};
      const result = await this.client.list(collection, { limit, offset });
      const documents: Document[] = result.items.map((item: any) => ({
        primary: { name: 'id', value: item.id },
        vectors: {
          // map vector fields to DocumentVector shape
        },
        payload: item.metadata ?? {},
      }));
      return {
        success: true,
        documents,
        nextOffset: result.hasMore ? (Number(offset) + limit) : null,
        totalCount: result.total,
      };
    } catch (error) {
      log.error('NewDB getDocuments error:', error);
      return { success: false, error: String(error) };
    }
  }

  async upsertDocument(
    collection: string,
    data: UpsertDocumentData,
    dataRequirements?: Record<string, string>
  ): Promise<UpsertDocumentResult> {
    try {
      // Insert or update a document.
      // data.document is a Partial<Document> — primary, vectors, and payload may all be present.
      const { document } = data;
      await this.client.upsert(collection, {
        id: document.primary?.value,
        vector: /* extract dense vector data from document.vectors */,
        metadata: document.payload,
      });
      return { success: true };
    } catch (error) {
      log.error('NewDB upsertDocument error:', error);
      return { success: false, error: String(error) };
    }
  }

  async deleteDocument(
    collection: string,
    primary: Document['primary'],
    dataRequirements?: Record<string, string>
  ): Promise<DeleteDocumentResult> {
    try {
      await this.client.delete(collection, primary.value);
      return { success: true };
    } catch (error) {
      log.error('NewDB deleteDocument error:', error);
      return { success: false, error: String(error) };
    }
  }

  async deleteDocuments(
    collection: string,
    filter: FilterQuery,
    dataRequirements?: Record<string, string>
  ): Promise<DeleteDocumentsResult> {
    try {
      // Delete all documents matching the filter.
      // filter.conditions is an array of { field, operator, value, valueType }.
      // filter.logic is 'and' | 'or'.
      const deletedCount = await this.client.deleteWhere(collection, this.buildFilter(filter));
      return { success: true, deletedCount };
    } catch (error) {
      log.error('NewDB deleteDocuments error:', error);
      return { success: false, error: String(error) };
    }
  }

  // ---- Search ----

  async search(
    collection: string,
    vectors: Record<string, DocumentVector>,
    options?: SearchOptions
  ): Promise<SearchResult> {
    try {
      // vectors is a map of vectorKey → DocumentVector (dense, sparse, or binary).
      // options.limit, options.filter, options.scoreThreshold, options.vectorKey are common.
      // For dense search, extract: vectors[key].value.data (number[])
      const vectorKey = options?.vectorKey ?? Object.keys(vectors)[0];
      const vector = vectors[vectorKey];
      if (!vector || vector.vectorType !== 'dense') {
        return { success: false, error: 'Only dense vectors are supported' };
      }
      const queryVector = (vector.value as any).data as number[];

      const results = await this.client.query(collection, {
        vector: queryVector,
        topK: options?.limit ?? 10,
        filter: options?.filter ? this.buildFilter(options.filter) : undefined,
        scoreThreshold: options?.scoreThreshold,
      });

      const documents: Document[] = results.matches.map((match: any) => ({
        primary: { name: 'id', value: match.id },
        score: match.score,
        vectors: {},
        payload: match.metadata ?? {},
      }));

      return { success: true, documents };
    } catch (error) {
      log.error('NewDB search error:', error);
      return { success: false, error: String(error) };
    }
  }

  // ---- Collection Management ----

  async dropCollection(collection: string): Promise<DropCollectionResult> {
    try {
      await this.client.deleteCollection(collection);
      return { success: true };
    } catch (error) {
      log.error('NewDB dropCollection error:', error);
      return { success: false, error: String(error) };
    }
  }

  async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
    try {
      // Delete all documents but keep the collection/index.
      // If the SDK has no truncate, implement as: fetch all IDs → delete all.
      const deletedCount = await this.client.truncate(collection);
      return { success: true, deletedCount };
    } catch (error) {
      log.error('NewDB truncateCollection error:', error);
      return { success: false, error: String(error) };
    }
  }

  async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
    try {
      // config comes from the DynamicForm defined in getCreateCollectionSchema() below.
      await this.client.createCollection({
        name: config.name as string,
        dimension: config.dimension as number,
      });
      return { success: true };
    } catch (error) {
      log.error('NewDB createCollection error:', error);
      return { success: false, error: String(error) };
    }
  }

  // ---- Capabilities & Schema ----

  async getSearchCapabilities(
    collection: string,
    schema?: CollectionSchema | null
  ): Promise<SearchCapabilities> {
    // Declare what your database supports. mergeWithDefault fills in the rest with safe defaults.
    // See app/src/types/index.ts → SearchCapabilities for all flags.
    return mergeWithDefault({
      dense: true,
      sparse: false,         // set true if you support sparse vector search
      lexical: false,        // set true if you support BM25/full-text search
      filters: true,
      scoreThreshold: true,
      clientSideFusion: false,
    });
  }

  getCreateCollectionSchema(): DynamicFormSchema {
    // Defines the form shown when the user clicks "Create Collection".
    // Use DynamicFormSchema sections and items — see other clients for examples.
    return {
      title: 'Create NewDB Collection',
      description: 'Configure your new collection',
      sections: [
        {
          key: 'general',
          title: 'General',
          items: [
            {
              key: 'name',
              label: 'Collection Name',
              type: 'text',
              required: true,
              placeholder: 'my_collection',
              rules: [{ type: 'minLength', value: 1, message: 'Name is required' }],
            },
            {
              key: 'dimension',
              label: 'Vector Dimensions',
              type: 'number',
              required: true,
              defaultValue: 1536,
              min: 1,
            },
          ],
        },
      ],
    };
  }

  // ---- Private Helpers ----

  private buildFilter(filter: FilterQuery): any {
    // Translate the VectorDBZ filter format into whatever your SDK expects.
    // filter.conditions: Array<{ field, operator, value, valueType }>
    // filter.logic: 'and' | 'or'
    // Supported operators: 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains'
    return filter; // replace with actual translation
  }
}
```

---

## Step 4 — Register in the Factory

Open `app/src/services/index.ts` and add the export and the `case`:

```typescript
// 1. Add export
export { NewDBClient } from './clients/newdb';

// 2. Add import at the top of the file
import { NewDBClient } from './clients/newdb';

// 3. Add case to createClient()
export function createClient(type: DatabaseType, config: ConnectionConfig): VectorDBClient {
  switch (type) {
    // ... existing cases ...
    case 'newdb':
      return new NewDBClient(config);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}
```

---

## Step 5 — Add the UI Connection Option

Open `app/src/services/databases.ts` and add an entry to `databaseOptions`:

```typescript
{
  value: 'newdb',
  label: 'NewDB',
  color: '#your-brand-color',          // hex color for the DB badge
  fields: ['host', 'port', 'apiKey'],  // which ConnectionConfig fields to show in the connection form
  presets: { ...defaultPresets, host: 'localhost', port: 1234 },
},
```

And add the color to `getDatabaseColor`:

```typescript
const colors: Record<string, string> = {
  // ... existing entries ...
  newdb: '#your-brand-color',
};
```

**`fields`** controls which input fields appear in the connection modal. Pick from:
`'host'`, `'port'`, `'apiKey'`, `'https'`, `'database'`, `'tenant'`, `'user'`, `'password'`

---

## Step 6 — Install the SDK

```bash
cd app
npm install newdb-sdk
```

---

## Step 7 — Add a Mock Seed Script

Create `mocks/seeds/newdb.js` following the pattern of `mocks/seeds/qdrant.js`:

```javascript
import { NewDBClient } from '@newdb/sdk';

const client = new NewDBClient({
  host: process.env.NEWDB_HOST || 'localhost',
  port: parseInt(process.env.NEWDB_PORT || '1234'),
});

const COLLECTION_NAME = 'vectordbz_test';
const VECTOR_DIM = 1536;

async function seed() {
  console.log('Seeding NewDB...');

  // Create collection
  await client.createCollection({ name: COLLECTION_NAME, dimension: VECTOR_DIM });

  // Insert sample documents
  const docs = Array.from({ length: 50 }, (_, i) => ({
    id: `doc_${i}`,
    vector: Array.from({ length: VECTOR_DIM }, () => Math.random() * 2 - 1),
    metadata: {
      text: `Sample document ${i}`,
      category: ['A', 'B', 'C'][i % 3],
      value: i * 10,
    },
  }));

  await client.upsertMany(COLLECTION_NAME, docs);
  console.log(`Seeded ${docs.length} documents into ${COLLECTION_NAME}`);
}

seed().catch(console.error);
```

Also add the collection name to `mocks/clean.js` so it can be deleted on cleanup.

---

## Step 8 — Add a Docker Compose Service

Add the database service to `docker-compose.yml`. Follow the existing service pattern and add comments:

```yaml
  # NewDB Vector Database
  # API: http://localhost:1234
  newdb:
    image: newdb/newdb:latest
    container_name: newdb
    ports:
      - "1234:1234"
    volumes:
      - newdb_data:/data
    restart: unless-stopped
```

Also add `newdb_data:` to the `volumes:` section at the bottom of the file.

---

## Step 9 — Write Integration Tests

Create `app/src/services/__tests__/newdb.test.ts`. Add a `TEST_CONFIGS` entry in `test-utils.ts` first:

```typescript
// In test-utils.ts, add to TEST_CONFIGS:
newdb: {
  type: 'newdb' as DatabaseType,
  host: 'localhost',
  port: 1234,
},
```

Then write the test file:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '../index';
import {
  generateTestCollectionName,
  generateTestDocument,
  TEST_CONFIGS,
} from './test-utils';
import { VectorDBClient, COLLECTION_DEFAULT_VECTOR } from '../../types';

describe('NewDB Client Integration Tests', () => {
  let client: VectorDBClient;
  let collectionName: string;

  beforeAll(() => {
    const config = TEST_CONFIGS.newdb;
    client = createClient(config.type, config);
    collectionName = generateTestCollectionName('newdb_test');
  });

  it('should connect successfully', async () => {
    const result = await client.testConnection();
    expect(result.success).toBe(true);
  });

  it('should list collections', async () => {
    const result = await client.getCollections();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.collections)).toBe(true);
  });

  it('should run full CRUD flow', async () => {
    // Create collection
    const schema = client.getCreateCollectionSchema();
    const createResult = await client.createCollection({
      name: collectionName,
      dimension: 128,
    });
    expect(createResult.success).toBe(true);

    // Insert document
    const doc = generateTestDocument('test_1', 128, { category: 'A' });
    const upsertResult = await client.upsertDocument(collectionName, { document: doc });
    expect(upsertResult.success).toBe(true);

    // Retrieve documents
    const getResult = await client.getDocuments(collectionName, { limit: 10 });
    expect(getResult.success).toBe(true);
    expect(getResult.documents?.length).toBeGreaterThan(0);

    // Search
    const searchResult = await client.search(collectionName, doc.vectors, { limit: 5 });
    expect(searchResult.success).toBe(true);
    expect(searchResult.documents?.length).toBeGreaterThan(0);

    // Delete document
    const deleteResult = await client.deleteDocument(collectionName, doc.primary);
    expect(deleteResult.success).toBe(true);

    // Drop collection
    const dropResult = await client.dropCollection(collectionName);
    expect(dropResult.success).toBe(true);
  }, 60000);
});
```

---

## Tips

**Filter translation** is the trickiest part. Look at how other clients translate `FilterQuery` — especially `pgvector.ts` (SQL `WHERE`) and `elasticsearch.ts` (Elasticsearch query DSL) for contrasting approaches.

**`getCollectionSchema`** drives a lot of UI behavior. The more accurate your schema (especially vector field sizes and types), the better the search and visualization experience.

**`getCreateCollectionSchema`** uses `DynamicFormSchema` — a declarative form builder. Look at `qdrant.ts` for an example with sections, conditional fields (`showWhen`), and validation rules.

**Error handling**: always catch, always log with `electron-log`, always return `{ success: false, error: String(error) }` — never throw from a public method.

**Sparse / lexical / hybrid**: if your database supports these, set the relevant flags in `getSearchCapabilities()` and handle the corresponding `SearchOptions` fields (`lexicalQuery`, `hybridAlpha`, sparse vectors) in `search()`.
