# Local Embedding Test Server

A minimal Node.js server that returns random mock vectors, useful for testing embedding workflows in VectorDBZ without an external API.

## Setup

```bash
cd embedding-server
npm install
npm start
```

The server starts on `http://localhost:3005`.

---

## API Endpoints

### POST `/embed/text`

Generate an embedding from a text string.

**Request:**
```json
{ "text": "Your text here" }
```

**Response:**
```json
{
  "success": true,
  "embedding": [0.123, -0.456, "..."],
  "dimension": 384,
  "text_length": 15
}
```

---

### POST `/embed/file`

Generate an embedding from a file upload.

**Request:** `multipart/form-data` with a `file` field.

**Response:**
```json
{
  "success": true,
  "embedding": [0.123, -0.456, "..."],
  "dimension": 384,
  "file_name": "example.txt",
  "file_size": 1024,
  "file_type": "text/plain"
}
```

---

### GET `/health`

Returns server status and available routes.

---

## Using with VectorDBZ

Paste one of these into the **Embedding Function** editor in the app.

### Text embedding

```javascript
async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  const response = await fetch('http://localhost:3005/embed/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API error');
  return data.embedding;
}
```

### File upload embedding

```javascript
async function embed(text, file, fetch, FormData) {
  if (!file) throw new Error('File is required');
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('http://localhost:3005/embed/file', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API error');
  return data.embedding;
}
```

---

## Notes

- Returns random mock vectors of 384 dimensions — not semantically meaningful, but useful for testing the embedding pipeline end-to-end.
- CORS is enabled for all origins.
- File content is processed in memory and not saved to disk.
