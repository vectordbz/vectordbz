# Architecture

VectorDBZ is an Electron desktop app built with React and TypeScript. Every database integration is a self-contained TypeScript class — adding a new database means implementing one interface and registering it in a few places.

---

## Process Model

Electron runs three processes that communicate over IPC:

```
┌─────────────────────────────────────────────────────┐
│  Main Process (src/main.ts)                         │
│  - Window lifecycle                                 │
│  - IPC handlers                                     │
│  - Database client calls via createClient()         │
│  - Auto-updater                                     │
│  - Embedding execution (sandboxed Node vm)          │
└───────────────────┬─────────────────────────────────┘
                    │ contextBridge (IPC)
┌───────────────────▼─────────────────────────────────┐
│  Preload (src/preload.ts)                           │
│  - Exposes window.electronAPI to the renderer       │
└───────────────────┬─────────────────────────────────┘
                    │ window.electronAPI
┌───────────────────▼─────────────────────────────────┐
│  Renderer (src/renderer.tsx → src/App.tsx)          │
│  - React 19 + Ant Design UI                         │
│  - All user-facing components                       │
└─────────────────────────────────────────────────────┘
```

---

## Source Structure

```
app/src/
├── main.ts                     ← Electron main process
├── preload.ts                  ← contextBridge / IPC surface
├── renderer.tsx                ← React entry point
├── App.tsx                     ← Application shell
│
├── types/
│   └── index.ts                ← VectorDBClient interface + all shared types
│
├── services/
│   ├── index.ts                ← createClient() factory
│   ├── databases.ts            ← connection field config per DB (UI)
│   ├── searchCapabilities.ts   ← per-DB feature flags (sparse, lexical, hybrid)
│   ├── store.ts                ← electron-store: saved connections + settings
│   ├── documentUtils.ts        ← document sorting helpers
│   ├── embeddingService.ts     ← custom JS embedding execution
│   ├── vectorUtils.ts          ← vector math utilities
│   └── clients/                ← one file per database
│       ├── qdrant.ts
│       ├── weaviate.ts
│       ├── milvus.ts
│       ├── chromadb.ts
│       ├── pgvector.ts
│       ├── pinecone.ts
│       ├── elasticsearch.ts
│       └── redissearch.ts
│
└── components/
    ├── ConnectionModal.tsx
    ├── Sidebar.tsx
    ├── MainContent.tsx
    ├── CollectionTab.tsx
    ├── DocumentsTab.tsx
    ├── SearchTab.tsx
    ├── VisualizeTab/
    └── ...
```

---

## Database Client Plugin Pattern

The core abstraction is the `VectorDBClient` interface in `app/src/types/index.ts`. Every supported database is a class that implements this interface:

```
VectorDBClient (interface)
    │
    ├── QdrantClient
    ├── WeaviateClient
    ├── MilvusClient
    ├── ChromaDBClient
    ├── PgVectorClient
    ├── PineconeClient
    ├── ElasticsearchClient
    └── RedisSearchClient
```

The `createClient(type, config)` factory in `app/src/services/index.ts` instantiates the right class based on the connection type. The UI never imports database clients directly — it calls through `window.electronAPI` which invokes `createClient` in the main process.

---

## Key Types

All shared types live in `app/src/types/index.ts`:

| Type | Purpose |
|------|---------|
| `VectorDBClient` | The interface every DB client implements |
| `DatabaseType` | Union of all supported DB identifiers |
| `ConnectionConfig` | Connection parameters (host, port, apiKey, etc.) |
| `Collection` | A collection/index/table in a database |
| `Document` | A single record with primary key, vectors, and payload |
| `DocumentVector` | Dense, sparse, or binary vector — discriminated union |
| `CollectionSchema` | Describes primary key, payload fields, and vector fields |
| `SearchCapabilities` | Per-DB feature flags (dense, sparse, lexical, hybrid, filters) |
| `FilterQuery` | Portable filter format translated by each client |

---

## Search Capabilities

Each client declares what it supports via `getSearchCapabilities()`, which returns a `SearchCapabilities` object. The UI reads this to show/hide controls (e.g. the hybrid alpha slider, sparse vector input, lexical query field).

`mergeWithDefault()` in `searchCapabilities.ts` fills any unset flags with safe defaults so new integrations only need to declare what they support — everything else is assumed off.

---

## Adding a New Database

See **[ADDING_A_DATABASE.md](ADDING_A_DATABASE.md)** for the complete step-by-step guide.
