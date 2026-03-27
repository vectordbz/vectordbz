# Development Guide

This guide covers everything you need to run VectorDBZ locally and contribute code.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Docker](https://www.docker.com/) — for running local database instances during development and testing

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/vectordbz/vectordbz.git
cd vectordbz

# Start all local databases (optional but recommended)
docker-compose up -d

# Install dependencies and start the app
cd app
npm ci
npm run start
```

The Electron app launches in development mode with hot-reload enabled.

---

## Available Scripts

All scripts run from the `app/` directory:

| Script | Description |
|--------|-------------|
| `npm run start` | Start in development mode (hot-reload) |
| `npm run build` | Build all targets (main, preload, renderer) |
| `npm run make` | Build and package for the current platform |
| `npm test` | Run integration tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |

---

## Local Databases

`docker-compose.yml` at the repo root runs all supported databases locally:

```bash
# Start everything
docker-compose up -d

# Start only specific databases
docker-compose up -d qdrant weaviate chromadb

# Stop everything
docker-compose down
```

Default ports:

| Database | Port |
|----------|------|
| Qdrant | `6333` |
| Weaviate | `8080` |
| ChromaDB | `8000` |
| Milvus | `19530` |
| Elasticsearch | `9200` |
| pgvector (PostgreSQL) | `5432` |
| RedisSearch | `6379` |

---

## Seeding Test Data

The `mocks/` directory contains seed scripts that populate each database with sample vector data.

```bash
cd mocks
npm ci

# Seed a specific database (the DB must be running)
node seeds/qdrant.js
node seeds/weaviate.js
node seeds/chromadb.js
node seeds/milvus.js
node seeds/pgvector.js
node seeds/elasticsearch.js
node seeds/redissearch.js

# Or seed all local databases at once
node seed.js

# Clean up all seeded data
node clean.js
```

For cloud databases (Pinecone), set the required environment variables first:

```bash
PINECONE_API_KEY=your-key node seeds/pinecone.js
```

See [`mocks/README.md`](../mocks/README.md) for the full list of environment variables.

---

## Local Embedding Server

A local mock HTTP server simulates an embedding API for testing custom embedding functions inside the app.

```bash
cd embedding-server
npm install
npm start   # starts on http://localhost:3005
```

See [`embedding-server/test-embedding-examples.md`](../embedding-server/test-embedding-examples.md) for request/response examples.

---

## Running Tests

Tests are integration tests that connect to real running database instances. Start the relevant containers before running:

```bash
docker-compose up -d
cd app
npm test
```

To run tests for a specific database only:

```bash
npm test -- qdrant
```
