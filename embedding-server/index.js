const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = 3005;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Configure multer for file uploads (store in memory)
const upload = multer({ storage: multer.memoryStorage() });

// Generate a mock vector of specified dimension
function generateMockVector(dimension = 384) {
  return Array.from({ length: dimension }, () => 
    parseFloat((Math.random() * 2 - 1).toFixed(6))
  );
}

// Text embedding route
app.post('/embed/text', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ 
        error: 'Text is required',
        message: 'Please provide a text field in the request body'
      });
    }

    // Generate a mock embedding vector
    const vector = generateMockVector(384);
    
    console.log(`[TEXT] Received text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    console.log(`[TEXT] Generated vector of dimension: ${vector.length}`);
    
    res.json({
      success: true,
      embedding: vector,
      vector: vector, // Support both field names
      dimension: vector.length,
      text_length: text.length
    });
  } catch (error) {
    console.error('[TEXT] Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// File upload embedding route
app.post('/embed/file', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'File is required',
        message: 'Please upload a file with the field name "file"'
      });
    }

    const file = req.file;
    
    // Generate a mock embedding vector
    const vector = generateMockVector(384);
    
    console.log(`[FILE] Received file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    console.log(`[FILE] Generated vector of dimension: ${vector.length}`);
    
    res.json({
      success: true,
      embedding: vector,
      vector: vector, // Support both field names
      dimension: vector.length,
      file_name: file.originalname,
      file_size: file.size,
      file_type: file.mimetype
    });
  } catch (error) {
    console.error('[FILE] Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Embedding test server is running',
    routes: {
      text: 'POST /embed/text',
      file: 'POST /embed/file'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Embedding Test Server running on http://localhost:${PORT}`);
  console.log(`\n📝 Available routes:`);
  console.log(`   POST http://localhost:${PORT}/embed/text - Text embedding`);
  console.log(`   POST http://localhost:${PORT}/embed/file - File upload embedding`);
  console.log(`   GET  http://localhost:${PORT}/health - Health check\n`);
});

