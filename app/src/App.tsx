import React, { useState, useCallback, useEffect } from 'react';
import { Layout, message } from 'antd';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ConnectionModal from './components/ConnectionModal';
import UpdateNotification from './components/UpdateNotification';
import {
  ConnectionConfig,
  Collection,
  Document,
  AppState,
  ActiveConnection,
  TabInfo,
} from './types';
import MainContent from './components/MainContent';

const { Sider, Content } = Layout;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    connections: [],
    tabs: [],
    activeTabId: null,
  });
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Update notification state
  const [updateStatus, setUpdateStatus] = useState<{
    available: boolean;
    downloaded: boolean;
    downloading: boolean;
    progress: number;
    version?: string;
    updateInfo?: { version: string; releaseDate?: string; releaseName?: string };
  }>({
    available: false,
    downloaded: false,
    downloading: false,
    progress: 0,
  });



  const generateTabId = () => `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const onConnect = async (connectionId: string, connectionName: string, config: ConnectionConfig) => {
    const newConnection: ActiveConnection = {
      id: connectionId,
      name: connectionName,
      config,
      collections: [],
      isExpanded: true,
      isLoading: true,
    };

    setState(prev => ({
      ...prev,
      connections: [...prev.connections, newConnection],
    }));
    // Fetch collections - ensure we're connected to the right DB
    const collectionsResult = await window.electronAPI.db.getCollections(connectionId);
    if (collectionsResult.success && collectionsResult.collections) {
      setState(prev => ({
        ...prev,
        connections: prev.connections.map(c =>
          c.id === connectionId
            ? {
              ...c,
              collections: collectionsResult.collections as Collection[],
              isLoading: false
            }
            : c
        ),
      }));
      setConnectionModalOpen(false);
      message.success(`Connected to ${config.type}`);
    } else {
      // Remove failed connection
      setState(prev => ({
        ...prev,
        connections: prev.connections.filter(c => c.id !== connectionId),
      }));
      message.error(collectionsResult.error || 'Failed to fetch collections');
      throw new Error(collectionsResult.error || 'Failed to fetch collections');
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    const connection = state.connections.find(c => c.id === connectionId);
    if (!connection) return;

    // Close all tabs for this connection
    const tabsToClose = state.tabs.filter(t => t.connectionId === connectionId);

    setState(prev => {
      const remainingTabs = prev.tabs.filter(t => t.connectionId !== connectionId);
      const remainingConnections = prev.connections.filter(c => c.id !== connectionId);

      // Update active tab if needed
      let newActiveTabId = prev.activeTabId;
      if (tabsToClose.some(t => t.id === prev.activeTabId)) {
        newActiveTabId = remainingTabs.length > 0 ? remainingTabs[0].id : null;
      }

      return {
        connections: remainingConnections,
        tabs: remainingTabs,
        activeTabId: newActiveTabId,
      };
    });

    await window.electronAPI.db.disconnect(connectionId);
    message.info(`Disconnected from ${connection.name}`);
  };

  const handleToggleConnection = (connectionId: string) => {
    setState(prev => ({
      ...prev,
      connections: prev.connections.map(c =>
        c.id === connectionId ? { ...c, isExpanded: !c.isExpanded } : c
      ),
    }));
  };

  const handleRefreshConnection = async (connectionId: string) => {
    const connection = state.connections.find(c => c.id === connectionId);
    if (!connection) return;

    setState(prev => ({
      ...prev,
      connections: prev.connections.map(c =>
        c.id === connectionId ? { ...c, isLoading: true, collections: [] } : c
      ),
    }));

    try {
      // Reconnect to ensure we're talking to this DB
      await window.electronAPI.db.connect(connectionId, connection.config);

      // Verify connection status before fetching collections
      const status = await window.electronAPI.db.getConnectionStatus(connectionId);
      if (!status.connected || status.type !== connection.config.type) {
        throw new Error('Connection verification failed');
      }

      const result = await window.electronAPI.db.getCollections(connectionId);

      if (result.success && result.collections) {
        setState(prev => ({
          ...prev,
          connections: prev.connections.map(c =>
            c.id === connectionId
              ? { ...c, collections: result.collections as Collection[], isLoading: false }
              : c
          ),
        }));
        message.success('Collections refreshed');
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        connections: prev.connections.map(c =>
          c.id === connectionId ? { ...c, isLoading: false } : c
        ),
      }));
    }
  };

  const handleOpenCollection = useCallback(async (connectionId: string, collection: Collection) => {
    // Check if tab already exists
    const existingTab = state.tabs.find(
      t => t.connectionId === connectionId && t.collection.name === collection.name
    );

    if (existingTab) {
      setState(prev => ({ ...prev, activeTabId: existingTab.id }));
      return;
    }

    const connection = state.connections.find(c => c.id === connectionId);
    if (!connection) return;

    const tabId = generateTabId();
    const newTab: TabInfo = {
      id: tabId,
      connectionId,
      connectionName: connection.name,
      connectionType: connection.config.type,
      collection,
    };

    setState(prev => ({
      ...prev,
      tabs: [...prev.tabs, newTab],
      activeTabId: tabId,
    }));

  }, [state.tabs, state.connections]);

  const handleCloseTab = (tabId: string) => {
    setState(prev => {
      const remainingTabs = prev.tabs.filter(t => t.id !== tabId);
      let newActiveTabId = prev.activeTabId;

      if (prev.activeTabId === tabId) {
        newActiveTabId = remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null;
      }

      return {
        ...prev,
        tabs: remainingTabs,
        activeTabId: newActiveTabId,
      };
    });
  };

  const handleChangeTab = (tabId: string) => {
    setState(prev => ({ ...prev, activeTabId: tabId }));
  };


  const handleDropCollection = useCallback(async (connectionId: string, collectionName: string) => {
    const connection = state.connections.find(c => c.id === connectionId);
    if (!connection) return { success: false, error: 'Connection not found' };

    try {
      await window.electronAPI.db.connect(connectionId, {
        ...connection.config,
      });

      const result = await window.electronAPI.db.dropCollection(connectionId, collectionName);

      if (result.success) {
        // Close any tabs for this collection
        setState(prev => ({
          ...prev,
          tabs: prev.tabs.filter(t => !(t.connectionId === connectionId && t.collection.name === collectionName)),
        }));
        // Refresh collections
        handleRefreshConnection(connectionId);
      }

      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to drop collection' };
    }
  }, [state.connections, handleRefreshConnection]);

  const handleTruncateCollection = useCallback(async (connectionId: string, collectionName: string) => {
    const connection = state.connections.find(c => c.id === connectionId);
    if (!connection) return { success: false, error: 'Connection not found' };

    try {
      await window.electronAPI.db.connect(connectionId, {
        ...connection.config,
      });

      const result = await window.electronAPI.db.truncateCollection(connectionId, collectionName);

      if (result.success) {
        // Refresh collections to update count
        handleRefreshConnection(connectionId);
      }

      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to truncate collection' };
    }
  }, [state.connections, state.tabs, handleRefreshConnection]);

  const handleCreateCollection = useCallback(async (connectionId: string, config: Record<string, unknown>) => {
    const connection = state.connections.find(c => c.id === connectionId);
    if (!connection) return { success: false, error: 'Connection not found' };

    try {
      // Ensure we're connected
      await window.electronAPI.db.connect(connectionId, connection.config);

      const result = await window.electronAPI.db.createCollection(connectionId, config);

      if (result.success) {
        // Refresh collections to show the new one
        handleRefreshConnection(connectionId);
      }

      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create collection' };
    }
  }, [state.connections, handleRefreshConnection]);

  // Update notification handlers
  useEffect(() => {
    if (!window.electronAPI?.update) return;

    // Load initial status
    const loadStatus = async () => {
      const status = await window.electronAPI.update.getStatus();
      setUpdateStatus({
        available: status.available,
        downloaded: status.downloaded,
        downloading: status.downloading,
        progress: status.progress,
        version: status.version,
      });
    };
    loadStatus();

    // Listen for update events
    window.electronAPI.update.onStatus((status) => {
      setUpdateStatus({
        available: status.available,
        downloaded: status.downloaded,
        downloading: status.downloading,
        progress: status.progress,
        version: status.version,
      });
    });

    window.electronAPI.update.onAvailable((info) => {
      setUpdateStatus(prev => ({
        ...prev,
        available: true,
        downloading: false,
        version: info.version,
        updateInfo: {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseName: info.releaseName,
        },
      }));
    });

    window.electronAPI.update.onDownloaded((info) => {
      setUpdateStatus(prev => ({
        ...prev,
        downloaded: true,
        downloading: false,
        progress: 100,
        version: info.version,
        updateInfo: {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseName: info.releaseName,
        },
      }));
    });

    window.electronAPI.update.onDownloadProgress((progress) => {
      setUpdateStatus(prev => ({
        ...prev,
        downloading: true,
        progress,
      }));
    });

    return () => {
      // Cleanup listeners
      if (window.electronAPI?.update) {
        window.electronAPI.update.removeAllListeners('update-status');
        window.electronAPI.update.removeAllListeners('update-available');
        window.electronAPI.update.removeAllListeners('update-downloaded');
        window.electronAPI.update.removeAllListeners('update-download-progress');
      }
    };
  }, []);

  const handleUpdateNow = async () => {
    const result = await window.electronAPI?.update?.downloadUpdate();
    if (result?.success) {
      setUpdateStatus(prev => ({ ...prev, downloading: true, progress: 0 }));
    } else {
      message.error(result?.error || 'Failed to start download');
    }
  };

  const handleUpdateLater = () => {
    // User dismissed - do nothing, notification will be hidden
  };

  const handleRestartNow = async () => {
    const result = await window.electronAPI?.update?.restartAndInstall();
    if (!result?.success) {
      message.error(result?.error || 'Failed to restart');
    }
    // If successful, app will restart automatically
  };

  const handleRestartLater = () => {
    // User dismissed - do nothing, notification will be hidden
  };

  // Dev mode: Keyboard shortcuts to test update notifications
  // Always available in dev mode (when running from source)
  useEffect(() => {
    // Show available shortcuts in console
    console.log('%c🧪 Dev Mode: Update Notification Test Shortcuts', 'color: #4CAF50; font-weight: bold; font-size: 14px');
    console.log('%cCtrl+Shift+U - Show "Update Available"', 'color: #2196F3');
    console.log('%cCtrl+Shift+D - Show "Downloading" (with progress)', 'color: #2196F3');
    console.log('%cCtrl+Shift+R - Show "Update Downloaded"', 'color: #2196F3');
    console.log('%cCtrl+Shift+H - Hide all notifications', 'color: #2196F3');

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+Shift+U: Show "Update Available"
      if (e.ctrlKey && e.shiftKey && e.key === 'U') {
        e.preventDefault();
        console.log('🧪 Dev: Showing "Update Available" notification');
        setUpdateStatus({
          available: true,
          downloaded: false,
          downloading: false,
          progress: 0,
          version: '2.0.0',
          updateInfo: {
            version: '2.0.0',
            releaseName: 'Test Update - New Features',
            releaseDate: new Date().toISOString(),
          },
        });
      }
      
      // Ctrl+Shift+D: Show "Downloading" (simulate progress)
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        console.log('🧪 Dev: Showing "Downloading" notification with progress');
        setUpdateStatus(prev => ({
          ...prev,
          available: false,
          downloading: true,
          progress: 0,
        }));
        
        // Simulate download progress
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          if (progress >= 100) {
            clearInterval(interval);
            setUpdateStatus(prev => ({
              ...prev,
              downloading: false,
              downloaded: true,
              progress: 100,
            }));
          } else {
            setUpdateStatus(prev => ({
              ...prev,
              progress,
            }));
          }
        }, 200);
      }
      
      // Ctrl+Shift+R: Show "Update Downloaded"
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        console.log('🧪 Dev: Showing "Update Downloaded" notification');
        setUpdateStatus({
          available: false,
          downloaded: true,
          downloading: false,
          progress: 100,
          version: '2.0.0',
          updateInfo: {
            version: '2.0.0',
            releaseName: 'Test Update - New Features',
            releaseDate: new Date().toISOString(),
          },
        });
      }
      
      // Ctrl+Shift+H: Hide all notifications
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        console.log('🧪 Dev: Hiding all update notifications');
        setUpdateStatus({
          available: false,
          downloaded: false,
          downloading: false,
          progress: 0,
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <Layout style={{ height: '100vh' }}>
      <Header />
      <Layout>
        <Sider
          width={280}
          collapsible
          collapsed={sidebarCollapsed}
          onCollapse={setSidebarCollapsed}
          style={{
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-color)',
          }}
          trigger={null}
        >
          <Sidebar
            connections={state.connections}
            onToggleConnection={handleToggleConnection}
            onDisconnect={handleDisconnect}
            onRefresh={handleRefreshConnection}
            onOpenCollection={handleOpenCollection}
            onAddConnection={() => setConnectionModalOpen(true)}
            onDropCollection={handleDropCollection}
            onTruncateCollection={handleTruncateCollection}
            onCreateCollection={handleCreateCollection}
            collapsed={sidebarCollapsed}
            activeTabId={state.activeTabId}
            tabs={state.tabs}
          />
        </Sider>
        <Content style={{ overflow: 'hidden' }}>
          <MainContent
            tabs={state.tabs}
            activeTabId={state.activeTabId}
            onChangeTab={handleChangeTab}
            onCloseTab={handleCloseTab}
          />
        </Content>
      </Layout>
      <ConnectionModal
        open={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        onConnect={onConnect}
      />
      <UpdateNotification
        visible={updateStatus.available || updateStatus.downloaded || updateStatus.downloading}
        updateAvailable={updateStatus.available && !updateStatus.downloading && !updateStatus.downloaded}
        updateDownloaded={updateStatus.downloaded}
        downloading={updateStatus.downloading}
        progress={updateStatus.progress}
        version={updateStatus.version}
        updateInfo={updateStatus.updateInfo}
        onUpdateNow={handleUpdateNow}
        onLater={handleUpdateLater}
        onRestartNow={handleRestartNow}
        onRestartLater={handleRestartLater}
      />
    </Layout>
  );
};

export default App;
