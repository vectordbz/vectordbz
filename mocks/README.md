# Mocks

Seed scripts that populate each supported vector database with realistic sample data for local development and testing.

---

## Prerequisites

Start the databases using Docker Compose from the repo root:

```bash
docker-compose up -d
```

For cloud databases (Pinecone, Qdrant Cloud, etc.), create a `.env` file in this directory — see `.env.example` for all available variables.

---

## Setup

```bash
npm install
```

---

## Usage

### Seed all local databases

```bash
npm run seed
```

### Seed a specific database

```bash
npm run seed:qdrant
npm run seed:weaviate
npm run seed:chroma
npm run seed:milvus
npm run seed:pgvector
npm run seed:elasticsearch
npm run seed:redissearch
npm run seed:pinecone
```

### Clean all seeded data

```bash
npm run clean
```

---

## Collections per Database

Each database is seeded with several collections covering different schemas and vector types.

### Qdrant
| Collection | Items | Description |
|------------|-------|-------------|
| `ecommerce_products` | 30 | E-commerce products |
| `research_papers` | 25 | Scientific papers |
| `user_profiles` | 40 | User profile embeddings |
| `photo_gallery` | 35 | Photo metadata with image URLs |
| `multi_vector_products` | 20 | Products with `text_embedding` + `image_embedding` |
| `multi_vector_docs` | 15 | Documents with `title_embedding` + `content_embedding` + `summary_embedding` |
| `hybrid_products` | 25 | Products with dense + sparse vectors |
| `hybrid_documents` | 20 | Documents with dense + sparse vectors |
| `hybrid_papers` | 18 | Research papers with dense + sparse vectors |

### Weaviate
| Collection | Items | Description |
|------------|-------|-------------|
| `Article` | 30 | Article documents |
| `Researcher` | 35 | Researcher profiles |
| `MediaAsset` | 25 | Media assets with image URLs |
| `Publication` | 20 | Scientific publications |
| `Track` | 30 | Music tracks |
| `MultiVectorProduct` | 20 | Products with multiple named vectors |
| `MultiVectorDocument` | 15 | Documents with multiple named vectors |

### ChromaDB
| Collection | Items | Description |
|------------|-------|-------------|
| `product_catalog` | 35 | Product catalog |
| `content_library` | 30 | Content library documents |
| `customer_profiles` | 40 | Customer profile embeddings |
| `property_listings` | 25 | Real estate listings |
| `music_catalog` | 30 | Music track catalog |

### Milvus
| Collection | Items | Description |
|------------|-------|-------------|
| `store_inventory` | 30 | Store inventory products |
| `knowledge_base` | 25 | Knowledge base documents |
| `member_directory` | 35 | Member directory profiles |
| `media_archive` | 30 | Media archive with images |
| `academic_papers` | 20 | Academic research papers |
| `multi_vector_products` | 20 | Products with multiple vectors |
| `multi_vector_docs` | 15 | Documents with multiple vectors |
| `hybrid_products` | 25 | Products with dense + sparse vectors |
| `hybrid_documents` | 20 | Documents with dense + sparse vectors |
| `hybrid_papers` | 18 | Research papers with dense + sparse vectors |
| `binary_image_hashes` | 30 | Binary vectors for image hashing |
| `binary_document_fingerprints` | 25 | Binary vectors for near-duplicate detection |

### Pinecone
| Collection | Items | Description |
|------------|-------|-------------|
| `product-index` | 30 | Product search index |
| `content-index` | 25 | Content search index |
| `user-index` | 35 | User profile index |
| `media-index` | 30 | Media asset index |
| `property-index` | 20 | Real estate listing index |
| `hybrid-product-index` | 30 | Products with dense + sparse vectors |
| `hybrid-document-index` | 25 | Documents with dense + sparse vectors |
| `hybrid-paper-index` | 20 | Research papers with dense + sparse vectors |

### pgvector (PostgreSQL)
| Table | Items | Description |
|-------|-------|-------------|
| `ecommerce_products` | 30 | E-commerce products |
| `research_papers` | 25 | Scientific papers |
| `user_profiles` | 40 | User profiles |
| `media_assets` | 30 | Media assets |

### Elasticsearch
| Index | Items | Description |
|-------|-------|-------------|
| `ecommerce_products` | 30 | E-commerce products |
| `research_papers` | 25 | Scientific papers |
| `user_profiles` | 40 | User profiles |
| `media_assets` | 30 | Media assets |
| `multi_vector_products` | 20 | Products with multiple vectors |
| `multi_vector_docs` | 15 | Documents with multiple vectors |

### RedisSearch
| Index | Items | Description |
|-------|-------|-------------|
| `ecommerce_products` | 30 | E-commerce products |
| `research_papers` | 25 | Scientific papers |
| `user_profiles` | 40 | User profiles |
| `media_assets` | 30 | Media assets |
| `multi_vector_products` | 20 | Products with multiple vectors |
| `multi_vector_docs` | 15 | Documents with multiple vectors |

---

## Sparse Vector Support

Qdrant, Milvus, and Pinecone collections include both dense (semantic) and sparse (keyword/BM25-style) vectors, enabling hybrid search testing. ChromaDB, Weaviate, and pgvector use their own native mechanisms for keyword search and are not seeded with explicit sparse vectors.

---

## Data Generators

`data-generators.js` exports reusable faker-based generators used by all seed scripts:

| Function | Output |
|----------|--------|
| `generateProducts(count, dim)` | E-commerce products |
| `generateDocuments(count, dim)` | Text documents |
| `generateUsers(count, dim)` | User profiles |
| `generateImages(count, dim)` | Image metadata |
| `generatePapers(count, dim)` | Scientific papers |
| `generateMusic(count, dim)` | Music tracks |
| `generateRealEstate(count, dim)` | Real estate listings |
| `generateMultiVectorProducts(count)` | Products with `text_embedding` + `image_embedding` |
| `generateMultiVectorDocuments(count)` | Documents with 3 named vectors |
| `generateHybridProducts(count, dim)` | Products with dense + sparse vectors |
| `generateHybridDocuments(count, dim)` | Documents with dense + sparse vectors |
| `generateHybridPapers(count, dim)` | Research papers with dense + sparse vectors |
| `generateVector(dim)` | Random dense vector |
| `generateSparseVector(maxDim, nonZeroCount)` | Sparse vector (BM25-style) |
| `generateBinaryVector(bits)` | Binary vector (byte array) |
