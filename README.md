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

| Database | Status | Minimum Version |
|:--------:|:------:|:---------------:|
| **Qdrant** | ✅ Supported | `v1.7+` |
| **Weaviate** | ✅ Supported | `v1.19+` |
| **Milvus** | ✅ Supported | `v2.3+` |
| **ChromaDB** | ✅ Supported | `v0.4+` |
| **Pinecone** | ✅ Supported | Latest |
| **pgvector (PostgreSQL)** | ✅ Supported | `PostgreSQL 11+` with `pgvector` extension |

---

## Features

- **Multiple Database Support** — Connect to Qdrant, Weaviate, Milvus, ChromaDB, Pinecone, and pgvector
- **Data Explorer** — Browse collections, view documents with pagination, and inspect payloads
- **Vector Search** — Find similar vectors with advanced filtering and multi-vector support
- **Embedding Functions** — Generate embeddings from text or files using custom JavaScript functions with pre-built templates for OpenAI, Cohere, Hugging Face, and more
- **Visualization** — 2D/3D scatter plots with PCA, t-SNE, and UMAP dimensionality reduction
- **Collection Management** — View collection info, drop/truncate collections, and delete documents
- **Dark/Light Themes** — Modern UI with multi-tab interface and responsive layout
- **Cross-Platform** — Windows, macOS, and Linux support

---

## Installation

Download the latest release for your platform from the [Releases](https://github.com/vectordbz/vectordbz/releases) page.

| Platform | Download |
|:--------:|:--------:|
| **Windows** | `VectorDBZ-x.x.x-Setup.exe` |
| **macOS** (Intel) | `VectorDBZ-darwin-x64-x.x.x.zip` |
| **macOS** (Apple Silicon) | `VectorDBZ-darwin-arm64-x.x.x.zip` |
| **Linux** | `vectordbz_x.x.x_amd64.deb` or `.rpm` |

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

## Feedback

This project is in active development. Contributions, bug reports, and feature requests are welcome.

### Contributing

- **Bug Reports** — [Open an issue](https://github.com/vectordbz/vectordbz/issues/new?labels=bug)
- **Feature Requests** — [Start a discussion](https://github.com/vectordbz/vectordbz/discussions/new?category=ideas)

### Roadmap

We are actively working on:
- Additional vector database integrations
- Enhanced analysis capabilities
- Improved visualization tools
- Performance optimizations for large datasets

