import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    // Don't minify - helps with debugging and preserves module structure
    minify: false,
    rollupOptions: {
      external: [
        // Electron must be external
        'electron',
        // Externalize optional chromadb dependencies that aren't installed
        'chromadb-default-embed',
        '@xenova/transformers',
        // pg-native is optional and not installed - externalize to avoid resolution errors
        'pg-native',
      ],
      output: {
        // Preserve module structure for better CommonJS compatibility
        preserveModules: false,
        // Use CommonJS format for Node.js compatibility
        format: 'cjs',
      },
    },
    // Ensure CommonJS modules are handled properly
    commonjsOptions: {
      // Include all node_modules for CommonJS transformation
      include: [/node_modules/],
      // Don't ignore any modules
      ignoreDynamicRequires: false,
      // Transform all CommonJS modules
      transformMixedEsModules: true,
      // Explicitly include pg and its dependencies
      requireReturnsDefault: 'auto',
    },
  },
  // Optimize deps settings
  optimizeDeps: {
    // Don't pre-bundle these - let them be processed at build time
    exclude: ['@zilliz/milvus2-sdk-node'],
  },
});
