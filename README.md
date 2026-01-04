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
| **pgvector (PostgreSQL)** | ✅ Supported | `PostgreSQL 11+` with `pgvector` extension |

---

## Features

### Connection Management
- **Multiple Connections** — Connect to multiple databases simultaneously
- **Saved Connections** — Save and organize your database connections locally
- **Connection Testing** — Verify connectivity before establishing connections
- **Secure** — Support for API keys and HTTPS connections

### Data Explorer
- **Browse Collections** — View all collections with document counts
- **Paginated Data View** — Navigate through large datasets with forward/backward pagination
- **Document Details** — Inspect full document payloads and vector data
- **Dynamic Columns** — Automatically detect and display payload fields

### Search & Filter
- **Vector Search** — Find similar vectors using sample documents
- **Embedding Functions** — Generate embeddings from text or files using custom JavaScript functions
  - **Custom Functions** — Create your own embedding functions to connect to any API or service
  - **Text & File Input** — Generate embeddings from text strings or uploaded files
  - **Pre-built Templates** — Quick-start templates for OpenAI, Cohere, Hugging Face, Ollama, Jina AI, and more
  - **Seamless Integration** — Generated embeddings are automatically copied to the search field
  - **Privacy First** — All embedding functions and API keys are stored locally on your device
- **Filter Builder** — Build complex filters with AND/OR logic
- **Multiple Operators** — Support for equals, contains, greater than, less than, and more
- **Multi-Vector Support** — Search across collections with named vectors

### Visualization
- **2D/3D Scatter Plots** — Visualize vector embeddings in reduced dimensions
- **Dimensionality Reduction** — PCA, t-SNE, and UMAP algorithms
- **Interactive Charts** — Zoom, pan, and hover for details
- **Color by Field** — Color-code points by payload values
- **Export** — Download visualizations as PNG images

### Collection Management
- **Collection Info** — View detailed collection configuration and statistics
- **Drop Collection** — Delete collections with confirmation
- **Truncate Collection** — Clear all documents while preserving schema
- **Delete Documents** — Remove individual documents or filter-based batch deletion

### Analysis & Quality Metrics
- **Embedding Quality Overview** — Analyze vector quality with dimensionality, norm distribution, and distance metrics
- **Distance Distribution** — Compare k-nearest neighbor distances vs random pairs
- **Cluster Analysis** — Perform K-Means or DBSCAN clustering with silhouette scores
- **Metadata Separation** — Evaluate how well metadata labels are separated in vector space
- **Outlier Detection** — Identify anomalous documents using statistical methods
- **Duplicate Detection** — Find near-duplicate vectors with configurable similarity thresholds
- **Embedding Comparison** — Compare multiple vector fields using rank correlation and neighbor overlap
- **Multiple Distance Metrics** — Support for cosine, euclidean, and dot product distances
- **Interactive Charts** — Visualize analysis results with responsive charts

### User Experience
- **Dark/Light Themes** — Switch between dark and light modes
- **Multi-Tab Interface** — Open multiple collections in separate tabs
- **Responsive Layout** — Collapsible sidebar for more workspace
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
- **General Feedback** — [Open an issue](https://github.com/vectordbz/vectordbz/issues) or [start a discussion](https://github.com/vectordbz/vectordbz/discussions)

### Roadmap

We are actively working on:
- Additional vector database integrations
- Enhanced analysis capabilities
- Improved visualization tools
- Performance optimizations for large datasets

