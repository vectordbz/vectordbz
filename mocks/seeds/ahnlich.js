import { createDbClient } from '@deven96/ahnlich-client-node';
import {
  CreateStore,
  DropStore,
  Ping,
  Set as SetEntries,
} from '@deven96/ahnlich-client-node/grpc/db/query_pb';
import {
  DbStoreEntry,
  StoreKey,
  StoreValue,
} from '@deven96/ahnlich-client-node/grpc/keyval_pb';
import { MetadataValue } from '@deven96/ahnlich-client-node/grpc/metadata_pb';
import dotenv from 'dotenv';
import { generateDocuments, generateProducts } from '../generators.js';

dotenv.config();

const AHNLICH_HOST = process.env.AHNLICH_HOST || 'localhost';
const AHNLICH_PORT = process.env.AHNLICH_PORT || '1369';
const AHNLICH_SCHEMA = process.env.AHNLICH_SCHEMA || 'public';
const BATCH_SIZE = 20;

function toMetadataValue(value) {
  const stringValue =
    typeof value === 'object' ? JSON.stringify(value) : String(value);

  return new MetadataValue({
    value: {
      case: 'rawString',
      value: stringValue,
    },
  });
}

function toStoreValue(item) {
  const metadata = {};

  for (const [field, value] of Object.entries(item)) {
    if (field === 'vector' || value === null || value === undefined) {
      continue;
    }

    metadata[field] = toMetadataValue(value);
  }

  return new StoreValue({
    value: metadata,
  });
}

function toStoreEntry(item, dimension) {
  if (!Array.isArray(item.vector) || item.vector.length !== dimension) {
    throw new Error(
      `Invalid vector for ${item.id}: expected ${dimension} dimensions`,
    );
  }

  return new DbStoreEntry({
    key: new StoreKey({
      key: item.vector,
    }),
    value: toStoreValue(item),
  });
}

export async function seedAhnlichDB() {
  console.log('\n🚀 Seeding Ahnlich...\n');
  console.log(`  Connecting to ${AHNLICH_HOST}:${AHNLICH_PORT}`);

  const client = createDbClient(`${AHNLICH_HOST}:${AHNLICH_PORT}`);

  try {
    await client.ping(new Ping());
    console.log('✓ Connected to Ahnlich');
  } catch (error) {
    console.error('❌ Cannot connect to Ahnlich:', error.message);
    return;
  }

  const stores = [
    {
      name: 'ahnlich_products',
      dimension: 384,
      data: generateProducts(150, 384),
      predicateIndices: ['id', 'name', 'category', 'brand', 'inStock'],
    },
    {
      name: 'ahnlich_documents',
      dimension: 768,
      data: generateDocuments(150, 768),
      predicateIndices: [
        'id',
        'title',
        'author',
        'docType',
        'language',
        'isPublic',
      ],
    },
  ];

  for (const store of stores) {
    try {
      console.log(`\n📦 Processing store: ${store.name}`);

      await client.dropStore(
        new DropStore({
          store: store.name,
          errorIfNotExists: false,
          schema: AHNLICH_SCHEMA,
        }),
      );

      await client.createStore(
        new CreateStore({
          store: store.name,
          dimension: store.dimension,
          createPredicates: store.predicateIndices,
          nonLinearIndices: [],
          errorIfExists: true,
          schema: AHNLICH_SCHEMA,
        }),
      );

      let insertedCount = 0;

      for (let index = 0; index < store.data.length; index += BATCH_SIZE) {
        const batch = store.data
          .slice(index, index + BATCH_SIZE)
          .map((item) => toStoreEntry(item, store.dimension));

        await client.set(
          new SetEntries({
            store: store.name,
            inputs: batch,
            schema: AHNLICH_SCHEMA,
          }),
        );

        insertedCount += batch.length;
      }

      console.log(`  ✓ Inserted ${insertedCount} entries`);
      console.log(
        `✅ Ahnlich: ${store.name} (${insertedCount} entries, ${store.dimension}D)`,
      );
    } catch (error) {
      console.error(`❌ Ahnlich ${store.name}:`, error.message);
    }
  }
}