import Store from 'electron-store';
import { SavedConnection } from '../types';

interface StoreSchema {
  connections: SavedConnection[];
  settings: {
    theme: 'dark' | 'light';
  };
}

// Use type assertion to work with electron-store
const store = new Store<StoreSchema>({
  name: 'vectordbz-config',
  projectName: 'vectordbz', // Required for Node.js environments (tests)
  defaults: {
    connections: [],
    settings: {
      theme: 'light',
    },
  },
}) as Store<StoreSchema> & {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K];
  get<K extends keyof StoreSchema>(key: K, defaultValue: StoreSchema[K]): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
  set(key: string, value: unknown): void;
};

export const connectionStore = {
  getAll(): SavedConnection[] {
    return store.get('connections') || [];
  },

  getById(id: string): SavedConnection | undefined {
    const connections = store.get('connections') || [];
    return connections.find((c: SavedConnection) => c.id === id);
  },

  save(connection: Omit<SavedConnection, 'id' | 'createdAt'>): SavedConnection {
    const connections = store.get('connections') || [];
    const newConnection: SavedConnection = {
      ...connection,
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    connections.push(newConnection);
    store.set('connections', connections);
    return newConnection;
  },

  update(id: string, updates: Partial<SavedConnection>): SavedConnection | null {
    const connections = store.get('connections') || [];
    const index = connections.findIndex((c: SavedConnection) => c.id === id);
    if (index === -1) return null;
    
    connections[index] = { ...connections[index], ...updates };
    store.set('connections', connections);
    return connections[index];
  },

  delete(id: string): boolean {
    const connections = store.get('connections') || [];
    const filtered = connections.filter((c: SavedConnection) => c.id !== id);
    if (filtered.length === connections.length) return false;
    
    store.set('connections', filtered);
    return true;
  },
};

export const settingsStore = {
  get<K extends keyof StoreSchema['settings']>(key: K): StoreSchema['settings'][K] {
    const settings = store.get('settings');
    return settings[key];
  },

  set<K extends keyof StoreSchema['settings']>(key: K, value: StoreSchema['settings'][K]): void {
    const settings = store.get('settings');
    settings[key] = value;
    store.set('settings', settings);
  },

  getAll(): StoreSchema['settings'] {
    return store.get('settings');
  },
};

export default store;
