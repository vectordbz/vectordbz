<p align="center">
  <img src="assets/icon.png" width="120" alt="VectorDBZ Logo" />
</p>

<h1 align="center">VectorDBZ</h1>

<p align="center">
  <strong>A modern desktop application for exploring, managing, and analyzing vector databases</strong>
</p>

<p align="center">
  <img src="assets/app.gif" alt="VectorDBZ Application" />
</p>

---

## Supported Databases

| Database | Minimum Version |
|:--------:|:---------------:|
| **Qdrant** | `v1.7+` |
| **Weaviate** | `v1.19+` |
| **Milvus** | `v2.3+` |
| **ChromaDB** | `v0.4+` |
| **Pinecone** | Latest |
| **pgvector (PostgreSQL)** | `PostgreSQL 11+` with `pgvector` extension |
| **Elasticsearch** | `v8.x` |

---

## Features

- **Multiple Database Support** — Connect to Qdrant, Weaviate, Milvus, ChromaDB, Pinecone, pgvector, and Elasticsearch
- **Data Explorer** — Browse collections, view documents with pagination, and inspect payloads
- **Vector Search** — Find similar vectors with advanced filtering and multi-vector support
- **Search History & Comparison** — Track and compare search results with detailed analytics
- **Embedding Functions** — Generate embeddings from text or files using custom JavaScript functions with pre-built templates for OpenAI, Cohere, Hugging Face, and more
- **Advanced Visualization** — Interactive scatter plots with UMAP, t-SNE, and PCA dimensionality reduction
- **Clustering Analysis** — High-dimensional clustering with K-means and DBSCAN algorithms
- **Collection Management** — View collection info, drop/truncate collections, and delete documents
- **Dark/Light Themes** — Modern UI with multi-tab interface and responsive layout
- **Cross-Platform** — Windows, macOS, and Linux support

---

## Installation

Download the latest version for your platform:

**[Download VectorDBZ →](https://github.com/vectordbz/vectordbz/releases/latest)**

| Platform | Package |
|----------|---------|
| **Windows** | `.exe` installer |
| **macOS** (Intel) | `darwin-x64` package |
| **macOS** (Apple Silicon) | `darwin-arm64` package |
| **Linux** | `.deb` or `.rpm` package |

### macOS Installation Note

The macOS app is not code-signed (requires Apple Developer account). After downloading:

1. Extract the `.zip` file
2. Move `VectorDBZ.app` to your Applications folder
3. **First launch**: Right-click → "Open" → Click "Open" in the dialog

If you see **"VectorDBZ is damaged"** error, open Terminal and run:

```bash
xattr -cr /Applications/VectorDBZ.app
```

Then try opening the app again.

---

## Platform Support

- **Windows** — 10 and later
- **macOS** — 10.15 (Catalina) and later
- **Linux** — Ubuntu 18.04+, Fedora 32+, or equivalent

---

## Support

- **Issues & Questions** — [GitHub Issues](https://github.com/vectordbz/vectordbz/issues)
- **Release Notes** — [Changelog](https://github.com/vectordbz/vectordbz/releases)

