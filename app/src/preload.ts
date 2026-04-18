import { contextBridge, ipcRenderer } from 'electron';
import {
  ConnectionConfig,
  DatabaseType,
  GetDocumentsOptions,
  GetCollectionInfoResult,
  FilterQuery,
  ConnectionResult,
  GetCollectionsResult,
  GetDocumentsResult,
  SearchOptions,
  SearchResult,
  DeleteDocumentResult,
  DeleteDocumentsResult,
  DropCollectionResult,
  TruncateCollectionResult,
  CreateCollectionResult,
  SavedConnection,
  GetCollectionSchemaResult,
  GetSearchCapabilitiesResult,
  Document,
  DocumentVector,
  UpsertDocumentResult,
  CollectionSchema,
} from './types';
import { DynamicFormSchema } from './components/DynamicForm/types';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  db: {
    connect: (connectionId: string, config: ConnectionConfig) =>
      ipcRenderer.invoke('db:connect', connectionId, config),

    testConnection: (config: ConnectionConfig) => ipcRenderer.invoke('db:testConnection', config),

    disconnect: (connectionId: string) => ipcRenderer.invoke('db:disconnect', connectionId),

    getConnectionStatus: (connectionId: string) =>
      ipcRenderer.invoke('db:getConnectionStatus', connectionId),

    getCollections: (connectionId: string) => ipcRenderer.invoke('db:getCollections', connectionId),

    getCollectionInfo: (connectionId: string, collection: string) =>
      ipcRenderer.invoke('db:getCollectionInfo', connectionId, collection),

    getCollectionSchema: (connectionId: string, collection: string) =>
      ipcRenderer.invoke('db:getCollectionSchema', connectionId, collection),

    getSearchCapabilities: (
      connectionId: string,
      collection: string,
      schema?: CollectionSchema | null,
    ) =>
      ipcRenderer.invoke(
        'db:getSearchCapabilities',
        connectionId,
        collection,
        schema ?? null,
      ) as Promise<GetSearchCapabilitiesResult>,

    getDocuments: (
      connectionId: string,
      params: {
        collection: string;
        options: GetDocumentsOptions;
      },
    ) => ipcRenderer.invoke('db:getDocuments', connectionId, params),

    search: (
      connectionId: string,
      params: {
        collection: string;
        vectors: Record<string, DocumentVector>;
        options: SearchOptions;
      },
    ) => ipcRenderer.invoke('db:search', connectionId, params),

    deleteDocument: (
      connectionId: string,
      params: {
        collection: string;
        primary: Document['primary'];
        dataRequirements?: Record<string, string>;
      },
    ) => ipcRenderer.invoke('db:deleteDocument', connectionId, params),

    deleteDocuments: (
      connectionId: string,
      params: {
        collection: string;
        filter: FilterQuery;
        dataRequirements?: Record<string, string>;
      },
    ) => ipcRenderer.invoke('db:deleteDocuments', connectionId, params),

    dropCollection: (connectionId: string, collection: string) =>
      ipcRenderer.invoke('db:dropCollection', connectionId, collection),

    truncateCollection: (connectionId: string, collection: string) =>
      ipcRenderer.invoke('db:truncateCollection', connectionId, collection),

    createCollection: (connectionId: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke('db:createCollection', connectionId, config),

    getCreateCollectionSchema: (connectionId: string) =>
      ipcRenderer.invoke('db:getCreateCollectionSchema', connectionId),

    upsertDocument: (
      connectionId: string,
      params: {
        collection: string;
        document: Partial<Document>;
        dataRequirements?: Record<string, string>;
      },
    ) => ipcRenderer.invoke('db:upsertDocument', connectionId, params),
  },

  // Local storage operations
  store: {
    getConnections: () => ipcRenderer.invoke('store:getConnections'),

    saveConnection: (connection: {
      name: string;
      type: DatabaseType;
      host: string;
      port: number;
      apiKey?: string;
      https?: boolean;
    }) => ipcRenderer.invoke('store:saveConnection', connection),

    deleteConnection: (id: string) => ipcRenderer.invoke('store:deleteConnection', id),
  },

  // Window control operations (for custom title bar)
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Embedding operations
  embedding: {
    execute: (params: {
      code: string;
      text?: string;
      fileData?: { name: string; data: ArrayBuffer; type: string };
    }) => ipcRenderer.invoke('embedding:execute', params),
  },

  // Update operations
  update: {
    getStatus: () => ipcRenderer.invoke('update:getStatus'),
    checkForUpdates: () => ipcRenderer.invoke('update:checkForUpdates'),
    getAppVersion: () => ipcRenderer.invoke('update:getAppVersion'),
    getLogPath: () => ipcRenderer.invoke('update:getLogPath'),
    downloadUpdate: () => ipcRenderer.invoke('update:downloadUpdate'),
    restartAndInstall: () => ipcRenderer.invoke('update:restartAndInstall'),
    onStatus: (callback: (status: any) => void) => {
      ipcRenderer.on('update-status', (_event, status) => callback(status));
    },
    onAvailable: (callback: (info: any) => void) => {
      ipcRenderer.on('update-available', (_event, info) => callback(info));
    },
    onDownloaded: (callback: (info: any) => void) => {
      ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
    },
    onError: (callback: (error: any) => void) => {
      ipcRenderer.on('update-error', (_event, error) => callback(error));
    },
    onDownloadProgress: (callback: (progress: number) => void) => {
      ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress));
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
  },
});

// Type declarations for the renderer process
export interface ElectronAPI {
  db: {
    connect: (connectionId: string, config: ConnectionConfig) => Promise<ConnectionResult>;
    testConnection: (config: ConnectionConfig) => Promise<ConnectionResult>;
    disconnect: (connectionId: string) => Promise<{ success: boolean }>;
    getConnectionStatus: (
      connectionId: string,
    ) => Promise<{ connected: boolean; type: string | null }>;
    getCollections: (connectionId: string) => Promise<GetCollectionsResult>;
    getCollectionInfo: (
      connectionId: string,
      collection: string,
    ) => Promise<{
      success: boolean;
      data?: Record<string, unknown>;
      error?: string;
    }>;
    getCollectionSchema: (
      connectionId: string,
      collection: string,
    ) => Promise<GetCollectionSchemaResult>;
    getSearchCapabilities: (
      connectionId: string,
      collection: string,
      schema?: CollectionSchema | null,
    ) => Promise<GetSearchCapabilitiesResult>;
    getDocuments: (
      connectionId: string,
      params: {
        collection: string;
        options: GetDocumentsOptions;
      },
    ) => Promise<GetDocumentsResult>;
    search: (
      connectionId: string,
      params: {
        collection: string;
        vectors: Record<string, DocumentVector>;
        options: SearchOptions;
      },
    ) => Promise<SearchResult>;
    deleteDocument: (
      connectionId: string,
      params: {
        collection: string;
        primary: Document['primary'];
        dataRequirements?: Record<string, string>;
      },
    ) => Promise<DeleteDocumentResult>;
    deleteDocuments: (
      connectionId: string,
      params: {
        collection: string;
        filter: FilterQuery;
        dataRequirements?: Record<string, string>;
      },
    ) => Promise<DeleteDocumentsResult>;
    dropCollection: (connectionId: string, collection: string) => Promise<DropCollectionResult>;
    truncateCollection: (
      connectionId: string,
      collection: string,
    ) => Promise<TruncateCollectionResult>;
    createCollection: (
      connectionId: string,
      config: Record<string, unknown>,
    ) => Promise<CreateCollectionResult>;
    getCreateCollectionSchema: (connectionId: string) => Promise<DynamicFormSchema>;
    upsertDocument: (
      connectionId: string,
      params: {
        collection: string;
        document: Partial<Document>;
        dataRequirements?: Record<string, string>;
      },
    ) => Promise<UpsertDocumentResult>;
  };
  store: {
    getConnections: () => Promise<SavedConnection[]>;
    saveConnection: (
      connection: Omit<SavedConnection, 'id' | 'createdAt'>,
    ) => Promise<SavedConnection>;
    deleteConnection: (id: string) => Promise<boolean>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  embedding: {
    execute: (params: {
      code: string;
      text?: string;
      fileData?: { name: string; data: ArrayBuffer; type: string };
    }) => Promise<{ success: boolean; vector?: number[]; error?: string }>;
  };
  update: {
    getStatus: () => Promise<{
      checking: boolean;
      available: boolean;
      downloading: boolean;
      downloaded: boolean;
      progress: number;
      version?: string;
      error?: string;
      currentVersion: string;
    }>;
    checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
    getAppVersion: () => Promise<string>;
    getLogPath: () => Promise<string>;
    downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
    restartAndInstall: () => Promise<{ success: boolean; error?: string }>;
    onStatus: (callback: (status: any) => void) => void;
    onAvailable: (callback: (info: any) => void) => void;
    onDownloaded: (callback: (info: any) => void) => void;
    onError: (callback: (error: any) => void) => void;
    onDownloadProgress: (callback: (progress: number) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
