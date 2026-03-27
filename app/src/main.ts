import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as vm from 'vm';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { createClient } from './services';
import { VectorDBClient, DatabaseType, FilterQuery, ConnectionConfig, SavedConnection, SearchOptions, GetDocumentsOptions, Document, DocumentVector, CollectionSchema } from './types';
import { connectionStore } from './services/store';

// Production mode detection
const isProduction = app.isPackaged;

// Declare Vite plugin globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Configure auto-updater (only in production)
if (isProduction) {
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  
  // Disable automatic download - user must manually choose to update
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false; // Don't auto-install, user will choose when to restart
  
  // GitHub repository configuration is read from package.json "build.publish" section
  // No need to call setFeedURL() - electron-updater automatically uses package.json config

  // Auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    updateStatus.checking = true;
    updateStatus.available = false;
    updateStatus.downloading = false;
    updateStatus.downloaded = false;
    updateStatus.error = undefined;
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { ...updateStatus });
    }
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
    });
    updateStatus.checking = false;
    updateStatus.available = true;
    updateStatus.downloading = false; // Don't auto-download
    updateStatus.version = info.version;
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { ...updateStatus });
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseName: info.releaseName,
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No updates available. Current version:', info.version || app.getVersion());
    updateStatus.checking = false;
    updateStatus.available = false;
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { ...updateStatus });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${Math.round(progress.percent)}%`);
    updateStatus.progress = progress.percent;
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progress.percent);
      mainWindow.webContents.send('update-status', { ...updateStatus });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded successfully:', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
    });
    log.info('Update ready to install - waiting for user to restart');
    updateStatus.downloading = false;
    updateStatus.downloaded = true;
    updateStatus.progress = 100;
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { ...updateStatus });
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseName: info.releaseName,
      });
    }
  });

  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error:', error);
    updateStatus.checking = false;
    updateStatus.downloading = false;
    updateStatus.error = error.message || String(error);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { ...updateStatus });
      mainWindow.webContents.send('update-error', { error: updateStatus.error });
    }
    // Retry checking for updates after a delay on error
    setTimeout(() => {
      if (isProduction) {
        autoUpdater.checkForUpdates().catch((err) => {
          log.error('Retry check for updates failed:', err);
        });
      }
    }, 60000); // Retry after 1 minute
  });
}

// Active database clients (unified interface) - stored per connection ID
const clients = new Map<string, { client: VectorDBClient; type: DatabaseType }>();

// Store main window reference for IPC handlers
let mainWindow: BrowserWindow | null = null;

// Update status tracking
const updateStatus: {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  version?: string;
  error?: string;
} = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progress: 0,
};

const createWindow = () => {
  // Window icon path - works in both dev and production
  const iconPath = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(__dirname, '../src/assets/icon.png')
    : path.join(__dirname, '../assets/icon/icon.png');

  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0f0f14',
    icon: iconPath,
    // Cross-platform title bar customization
    ...(isMac ? {
      // macOS: Keep native traffic lights (red/yellow/green) - looks native
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 10 },
    } : {
      // Windows & Linux: Completely frameless for custom window controls
      frame: false,
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Disable DevTools in production
      devTools: !isProduction,
    },
  });

  // Production hardening
  if (isProduction) {
    // Remove application menu to hide DevTools/reload menu items
    Menu.setApplicationMenu(null);

    // Block keyboard shortcuts for refresh and DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // Block refresh shortcuts: Ctrl+R, Cmd+R, F5
      const isRefresh =
        (input.control && input.key.toLowerCase() === 'r') ||
        (input.meta && input.key.toLowerCase() === 'r') ||
        input.key === 'F5';

      // Block DevTools shortcuts: Ctrl+Shift+I, Cmd+Option+I, F12
      const isDevTools =
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.meta && input.alt && input.key.toLowerCase() === 'i') ||
        input.key === 'F12';

      if (isRefresh || isDevTools) {
        event.preventDefault();
      }
    });

    // Disable right-click context menu
    mainWindow.webContents.on('context-menu', (event) => {
      event.preventDefault();
    });
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Only open DevTools in development
  if (!isProduction && (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL)) {
    mainWindow.webContents.openDevTools();
  }
};

// ============================================
// IPC Handlers for Database Operations
// ============================================

// Connection management
ipcMain.handle('db:testConnection', async (_event, config: ConnectionConfig) => {
  try {
    log.info('Test connection request:', config);
    
    // Create client exactly like db:connect does
    const testClient = createClient(config.type, config);
    const result = await testClient.testConnection();
    
    log.info('Test connection result:', { 
      success: result.success, 
      version: result.version,
      error: result.error 
    });
    
    return { 
      success: result.success, 
      version: result.version, 
      error: result.error 
    };
  } catch (error) {
    log.error('Test connection exception (unexpected):', { 
      error: error instanceof Error ? error.message : String(error), 
      stack: error instanceof Error ? error.stack : undefined 
    });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection test failed' 
    };
  }
});

ipcMain.handle('db:connect', async (_event, connectionId: string, config: ConnectionConfig) => {
  try {
    const client = createClient(config.type, config);
    const result = await client.testConnection();
    
    if (result.success) {
      clients.set(connectionId, { client, type: config.type });
      return { success: true, type: config.type, version: result.version };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
});

ipcMain.handle('db:disconnect', async (_event, connectionId: string) => {
  clients.delete(connectionId);
  return { success: true };
});

ipcMain.handle('db:getConnectionStatus', async (_event, connectionId: string) => {
  const connection = clients.get(connectionId);
  return {
    connected: connection !== undefined,
    type: connection?.type || null,
  };
});

// Collections
ipcMain.handle('db:getCollections', async (_event, connectionId: string) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.getCollections();
});

ipcMain.handle('db:getCollectionInfo', async (_event, connectionId: string, collection: string) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.getCollectionInfo(collection);
});

ipcMain.handle('db:getCollectionSchema', async (_event, connectionId: string, collection: string) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.getCollectionSchema(collection);
});

ipcMain.handle('db:getSearchCapabilities', async (_event, connectionId: string, collection: string, schema?: CollectionSchema | null) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  try {
    const capabilities = await connection.client.getSearchCapabilities(collection, schema ?? undefined);
    return { success: true, capabilities };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get search capabilities';
    return { success: false, error: message };
  }
});

ipcMain.handle('db:getDocuments', async (_event, connectionId: string, params: {
  collection: string;
  options: GetDocumentsOptions;
}) => {
  const { collection, options } = params;
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  
  return connection.client.getDocuments(collection, options);
});

// Search
ipcMain.handle('db:search', async (_event, connectionId: string, params: {
  collection: string;
  vectors: Record<string, DocumentVector>;
  options: SearchOptions;
}) => {
  const { collection, vectors, options } = params;
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.search(collection, vectors, options);
});

// Delete Item
ipcMain.handle('db:deleteDocument', async (_event, connectionId: string, params: {
  collection: string;
  primary: Document['primary'];
  dataRequirements?: Record<string, string>;
}) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.deleteDocument(params.collection, params.primary, params.dataRequirements);
});

ipcMain.handle('db:deleteDocuments', async (_event, connectionId: string, params: {
  collection: string;
  filter: FilterQuery;
  dataRequirements?: Record<string, string>;
}) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.deleteDocuments(params.collection, params.filter, params.dataRequirements);
});


ipcMain.handle('db:dropCollection', async (_event, connectionId: string, collection: string) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.dropCollection(collection);
});

ipcMain.handle('db:truncateCollection', async (_event, connectionId: string, collection: string) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.truncateCollection(collection);
});

ipcMain.handle('db:createCollection', async (_event, connectionId: string, config: Record<string, unknown>) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.createCollection(config);
});

ipcMain.handle('db:getCreateCollectionSchema', async (_event, connectionId: string) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    throw new Error('No active connection');
  }
  return connection.client.getCreateCollectionSchema();
});

ipcMain.handle('db:upsertDocument', async (_event, connectionId: string, params: { collection: string; document: any; dataRequirements?: Record<string, string> }) => {
  const connection = clients.get(connectionId);
  if (!connection) {
    return { success: false, error: 'No active connection' };
  }
  return connection.client.upsertDocument(params.collection, { document: params.document }, params.dataRequirements);
});

// ============================================
// IPC Handlers for Local Storage
// ============================================

ipcMain.handle('store:getConnections', async () => {
  return connectionStore.getAll();
});

ipcMain.handle('store:saveConnection', async (_event, connection: SavedConnection) => {
  return connectionStore.save(connection);
});

ipcMain.handle('store:deleteConnection', async (_event, id: string) => {
  return connectionStore.delete(id);
});

// ============================================
// Window Operations
// ============================================

// Window control operations (for custom title bar on Windows)
ipcMain.handle('window:minimize', async () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', async () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', async () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', async () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ============================================
// IPC Handlers for Embedding Functions
// ============================================

ipcMain.handle('embedding:execute', async (_event, params: {
  code: string;
  text?: string;
  fileData?: { name: string; data: ArrayBuffer; type: string };
}) => {
  try {
    // Node.js 18+ has built-in fetch, otherwise use node-fetch
    let fetchFn: typeof globalThis.fetch;
    let FormDataClass: typeof FormData;
    
    if (globalThis.fetch) {
      fetchFn = globalThis.fetch;
      FormDataClass = globalThis.FormData;
    } else {
      // Fallback for older Node.js versions
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeFetch = require('node-fetch');
      fetchFn = nodeFetch.default || nodeFetch;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FormDataModule = require('form-data');
      FormDataClass = FormDataModule.default || FormDataModule;
    }

    // Convert file ArrayBuffer to File-like object if needed
    let file: any = undefined;
    if (params.fileData) {
      // Create a File-like object for Node.js
      const buffer = Buffer.from(params.fileData.data);
      file = {
        name: params.fileData.name,
        type: params.fileData.type,
        size: buffer.length,
        arrayBuffer: async () => params.fileData!.data,
        stream: () => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { Readable } = require('stream');
          return Readable.from(buffer);
        },
        // For FormData compatibility
        [Symbol.toStringTag]: 'File',
      };
    }

    // Security: Use vm.runInNewContext for proper sandboxing
    // This creates an isolated execution context without access to Node.js globals
    try {
      // Create a safe sandbox with only the necessary globals
      const sandbox = {
        text: params.text,
        file: file,
        fetch: fetchFn,
        FormData: FormDataClass,
        // Expose safe built-ins
        console: { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug },
        Promise,
        Array, Object, String, Number, Boolean, Symbol,
        JSON, Math, Date, RegExp, Map, Set, WeakMap, WeakSet,
        Error, TypeError, RangeError, ReferenceError, SyntaxError, URIError,
        ArrayBuffer, DataView, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, 
        Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
        // Allow globalThis/global to point to the sandbox itself (safe)
        global: {} as any,
        globalThis: {} as any,
      };
      
      // Make global and globalThis point to the sandbox
      sandbox.global = sandbox;
      sandbox.globalThis = sandbox;

      // Execute the embedding function in the sandboxed context
      // Wrap in an async IIFE to allow return statements
      const script = new vm.Script(`
        (async function() {
          'use strict';
          ${params.code}
          if (typeof embed === 'function') {
            return await embed(text, file, fetch, FormData);
          }
          throw new Error('Function must define an async function named "embed"');
        })();
      `);

      const result = await script.runInNewContext(sandbox, { timeout: 30000 }); // 30 second timeout

      // Validate result
      if (!Array.isArray(result)) {
        return {
          success: false,
          error: 'Embedding function must return an array of numbers',
        };
      }

      if (!result.every(n => typeof n === 'number' && Number.isFinite(n))) {
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
      log.error('Embedding execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error executing embedding function',
      };
    }
  } catch (error) {
    log.error('Embedding setup error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error setting up embedding execution',
    };
  }
});

// ============================================
// Update Operations
// ============================================

ipcMain.handle('update:getStatus', async () => {
  return { ...updateStatus, currentVersion: app.getVersion() };
});

ipcMain.handle('update:checkForUpdates', async () => {
  if (isProduction) {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { success: false, error: 'Updates only available in production' };
});

ipcMain.handle('update:getAppVersion', async () => {
  return app.getVersion();
});

ipcMain.handle('update:getLogPath', async () => {
  // electron-log stores logs in platform-specific locations
  const logPath = log.transports.file.getFile().path;
  return logPath;
});

// Manual download handler - user chooses to download update
ipcMain.handle('update:downloadUpdate', async () => {
  if (isProduction) {
    try {
      if (updateStatus.available && !updateStatus.downloading && !updateStatus.downloaded) {
        updateStatus.downloading = true;
        updateStatus.progress = 0;
        if (mainWindow) {
          mainWindow.webContents.send('update-status', { ...updateStatus });
        }
        await autoUpdater.downloadUpdate();
        return { success: true };
      }
      return { success: false, error: 'Update not available or already downloaded' };
    } catch (error) {
      updateStatus.downloading = false;
      updateStatus.error = error instanceof Error ? error.message : String(error);
      if (mainWindow) {
        mainWindow.webContents.send('update-status', { ...updateStatus });
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { success: false, error: 'Updates only available in production' };
});

// Restart and install handler - user chooses to restart and apply update
ipcMain.handle('update:restartAndInstall', async () => {
  if (isProduction && updateStatus.downloaded) {
    log.info('User requested restart to install update');
    // Quit and install will happen automatically
    autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
    return { success: true };
  }
  return { success: false, error: 'No update downloaded or not in production' };
});

// ============================================
// App Lifecycle
// ============================================

app.on('ready', () => {
  createWindow();
  
  // Check for updates on startup (only in production)
  if (isProduction) {
    // Wait a bit before first check to ensure app is fully loaded
    setTimeout(() => {
      log.info('Initializing auto-updater...');
      log.info('Current app version:', app.getVersion());
      
      // Use checkForUpdates() instead of checkForUpdatesAndNotify() for silent auto-updates
      autoUpdater.checkForUpdates().catch((error) => {
        log.error('Failed to check for updates on startup:', error);
      });
    }, 3000); // Wait 3 seconds after app ready
    
    // Check for updates periodically (every 4 hours)
    setInterval(() => {
      log.info('Periodic update check...');
      autoUpdater.checkForUpdates().catch((error) => {
        log.error('Failed to check for updates periodically:', error);
      });
    }, 4 * 60 * 60 * 1000); // 4 hours in milliseconds
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
