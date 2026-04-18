/**
 * Embedding Service - Executes user-defined embedding functions
 */

export interface EmbeddingFunction {
  id: string;
  name: string;
  description?: string;
  code: string; // User-defined function code
  createdAt: number;
  updatedAt: number;
}

export interface EmbeddingExecutionContext {
  text?: string; // Text input for embedding
  file?: File; // File input for embedding
  fetch: typeof fetch; // Fetch API for HTTP requests
  FormData: typeof FormData; // Required for file uploads (multipart/form-data)
}

export interface EmbeddingResult {
  success: boolean;
  vector?: number[];
  error?: string;
}

/**
 * Execute an embedding function
 * Uses main process (Node.js) if available to avoid CORS issues, otherwise falls back to browser execution
 * Security: Code is executed in a sandboxed context that blocks access to Node.js APIs
 */
export async function executeEmbedding(
  functionCode: string,
  context: EmbeddingExecutionContext,
): Promise<EmbeddingResult> {
  // Try to use main process (Electron) to avoid CORS issues
  if (typeof window !== 'undefined' && (window as any).electronAPI?.embedding?.execute) {
    try {
      // Convert file to ArrayBuffer if present
      let fileData: { name: string; data: ArrayBuffer; type: string } | undefined;
      if (context.file) {
        const arrayBuffer = await context.file.arrayBuffer();
        fileData = {
          name: context.file.name,
          data: arrayBuffer,
          type: context.file.type,
        };
      }

      const result = await (window as any).electronAPI.embedding.execute({
        code: functionCode,
        text: context.text,
        fileData,
      });

      return result;
    } catch (error) {
      // Fall back to browser execution if main process fails
      console.warn('Main process execution failed, falling back to browser:', error);
    }
  }

  // Browser execution (fallback or non-Electron environment)
  // Browser execution is already sandboxed by the browser itself (no Node.js APIs available)
  try {
    const func = new Function(
      'text',
      'file',
      'fetch',
      'FormData',
      `
      ${functionCode}
      if (typeof embed === 'function') {
        return embed(text, file, fetch, FormData);
      }
      throw new Error('Function must define an async function named "embed"');
    `,
    );

    const result = await func(context.text, context.file, context.fetch, context.FormData);

    // Validate result is a vector
    if (!Array.isArray(result)) {
      return {
        success: false,
        error: 'Embedding function must return an array of numbers',
      };
    }

    if (!result.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return {
        success: false,
        error: 'Embedding function must return an array of numbers',
      };
    }

    return {
      success: true,
      vector: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error executing embedding function',
    };
  }
}

/**
 * Storage for embedding functions
 */
const STORAGE_KEY = 'vectordbz_embedding_functions';

export const embeddingStore = {
  getAll(): EmbeddingFunction[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load embedding functions:', e);
      return [];
    }
  },

  getById(id: string): EmbeddingFunction | undefined {
    return this.getAll().find((f) => f.id === id);
  },

  save(function_: EmbeddingFunction): void {
    try {
      const functions = this.getAll();
      const existingIndex = functions.findIndex((f) => f.id === function_.id);

      if (existingIndex >= 0) {
        functions[existingIndex] = { ...function_, updatedAt: Date.now() };
      } else {
        functions.push({
          ...function_,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(functions));
    } catch (e) {
      console.error('Failed to save embedding function:', e);
      throw e;
    }
  },

  delete(id: string): boolean {
    try {
      const functions = this.getAll().filter((f) => f.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(functions));
      return true;
    } catch (e) {
      console.error('Failed to delete embedding function:', e);
      return false;
    }
  },
};

/**
 * Example embedding functions
 */
export const EMBEDDING_EXAMPLES: Record<
  string,
  { name: string; description: string; code: string }
> = {
  text: {
    name: 'Text',
    description: 'Simple text embedding template',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('https://your-api.com/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY',
    },
    body: JSON.stringify({ text: text }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API error');
  return data.embedding || data.vector || data;
}`,
  },
  file_upload: {
    name: 'File Upload',
    description: 'Upload file to API',
    code: `async function embed(text, file, fetch, FormData) {
  if (!file) throw new Error('File is required');
  
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('https://your-api.com/embed', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
    body: formData,
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API error');
  return data.embedding || data.vector || data;
}`,
  },
  openai: {
    name: 'OpenAI',
    description: 'OpenAI embeddings API',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'API error');
  return data.data[0].embedding;
}`,
  },
  cohere: {
    name: 'Cohere',
    description: 'Cohere embed API',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('https://api.cohere.ai/v1/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY',
    },
    body: JSON.stringify({
      texts: [text],
      model: 'embed-english-v3.0',
      input_type: 'search_document',
    }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'API error');
  return data.embeddings[0];
}`,
  },
  anthropic: {
    name: 'Anthropic',
    description: 'Anthropic Claude embeddings',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'YOUR_API_KEY',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: text }],
    }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'API error');
  // Note: Anthropic doesn't have direct embeddings, this is a placeholder
  return data.content[0].text.split('').map(c => c.charCodeAt(0) / 255);
}`,
  },
  google: {
    name: 'Google',
    description: 'Google Gemini embeddings',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=YOUR_API_KEY', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text: text }] } }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'API error');
  return data.embedding.values;
}`,
  },
  ollama: {
    name: 'Ollama',
    description: 'Local Ollama instance',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error('Ollama API error');
  return data.embedding;
}`,
  },
  huggingface: {
    name: 'Hugging Face',
    description: 'HF Inference API',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_HF_TOKEN',
    },
    body: JSON.stringify({ inputs: text }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API error');
  return Array.isArray(data) ? data : data[0];
}`,
  },
  jina: {
    name: 'Jina AI',
    description: 'Jina embeddings API',
    code: `async function embed(text, file, fetch, FormData) {
  if (!text) throw new Error('Text is required');
  
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY',
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: [text],
    }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'API error');
  return data.data[0].embedding;
}`,
  },
};
