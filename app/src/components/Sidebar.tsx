import React, { useState } from 'react';
import { Typography, Button, Tooltip, Spin, Dropdown, Modal, message } from 'antd';
import {
  DatabaseOutlined,
  PlusOutlined,
  ReloadOutlined,
  DisconnectOutlined,
  MoreOutlined,
  RightOutlined,
  DownOutlined,
  DeleteOutlined,
  ClearOutlined,
  ExclamationCircleOutlined,
  FolderAddOutlined,
} from '@ant-design/icons';
import { ActiveConnection, Collection, TabInfo } from '../types';
import CreateCollectionModal from './CreateCollectionModal';
import { getDatabaseColor } from '../services/databases';

const { Text } = Typography;

interface SidebarProps {
  connections: ActiveConnection[];
  onToggleConnection: (connectionId: string) => void;
  onDisconnect: (connectionId: string) => void;
  onRefresh: (connectionId: string) => void;
  onOpenCollection: (connectionId: string, collection: Collection) => void;
  onAddConnection: () => void;
  onDropCollection: (
    connectionId: string,
    collectionName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onTruncateCollection: (
    connectionId: string,
    collectionName: string,
  ) => Promise<{ success: boolean; deletedCount?: number; error?: string }>;
  onCreateCollection: (
    connectionId: string,
    config: Record<string, unknown>,
  ) => Promise<{ success: boolean; error?: string }>;
  collapsed: boolean;
  activeTabId: string | null;
  tabs: TabInfo[];
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const Sidebar: React.FC<SidebarProps> = ({
  connections,
  onToggleConnection,
  onDisconnect,
  onRefresh,
  onOpenCollection,
  onAddConnection,
  onDropCollection,
  onTruncateCollection,
  onCreateCollection,
  collapsed,
  activeTabId,
  tabs,
}) => {
  const [createCollectionModal, setCreateCollectionModal] = useState<{
    open: boolean;
    connectionId: string;
    connectionName: string;
  } | null>(null);

  // Collapsed view
  if (collapsed) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 0',
        }}
      >
        {/* Add button at top */}
        <div style={{ padding: '0 12px', marginBottom: 16 }}>
          <Tooltip title="New Connection" placement="right">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onAddConnection}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                border: 'none',
              }}
            />
          </Tooltip>
        </div>

        {/* Connection icons */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {connections.map((conn) => (
            <Tooltip key={conn.id} title={conn.name} placement="right">
              <div
                style={{
                  width: 40,
                  height: 40,
                  margin: '4px 12px',
                  borderRadius: 10,
                  background: 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: `2px solid ${getDatabaseColor(conn.config.type)}40`,
                  transition: 'all 0.15s ease',
                }}
                onClick={() => onToggleConnection(conn.id)}
              >
                {/* Remove the icon span, just keep the colored background/border */}
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
    );
  }

  // Expanded view
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onAddConnection}
          block
          style={{
            height: 38,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
            border: 'none',
            fontWeight: 500,
          }}
        >
          New Connection
        </Button>
      </div>

      {/* Connections list */}
      {connections.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <DatabaseOutlined style={{ fontSize: 28, color: 'var(--border-light)' }} />
          </div>
          <Text type="secondary" style={{ fontSize: 13, textAlign: 'center' }}>
            No connections yet
          </Text>
          <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            Click above to connect to a database
          </Text>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {connections.map((conn) => (
            <ConnectionItem
              key={conn.id}
              connection={conn}
              onToggle={() => onToggleConnection(conn.id)}
              onDisconnect={() => onDisconnect(conn.id)}
              onRefresh={() => onRefresh(conn.id)}
              onOpenCollection={(collection) => onOpenCollection(conn.id, collection)}
              onDropCollection={(name) => onDropCollection(conn.id, name)}
              onTruncateCollection={(name) => onTruncateCollection(conn.id, name)}
              onCreateCollection={() =>
                setCreateCollectionModal({
                  open: true,
                  connectionId: conn.id,
                  connectionName: conn.name,
                })
              }
              activeTabId={activeTabId}
              tabs={tabs}
            />
          ))}
        </div>
      )}

      {/* Footer stats */}
      {connections.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              fontSize: 11,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#6366f1', fontWeight: 600, fontSize: 14 }}>
                {connections.length}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>Connections</div>
            </div>
            <div style={{ width: 1, background: 'var(--border-color)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#22c55e', fontWeight: 600, fontSize: 14 }}>
                {connections.reduce((sum, c) => sum + c.collections.length, 0)}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>Collections</div>
            </div>
          </div>
        </div>
      )}

      {/* Create Collection Modal */}
      {createCollectionModal && (
        <CreateCollectionModal
          open={createCollectionModal.open}
          connectionId={createCollectionModal.connectionId}
          connectionName={createCollectionModal.connectionName}
          onClose={() => setCreateCollectionModal(null)}
          onSubmit={(config) => onCreateCollection(createCollectionModal.connectionId, config)}
        />
      )}
    </div>
  );
};

// Connection item component
interface ConnectionItemProps {
  connection: ActiveConnection;
  onToggle: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onOpenCollection: (collection: Collection) => void;
  onDropCollection: (collectionName: string) => Promise<{ success: boolean; error?: string }>;
  onTruncateCollection: (
    collectionName: string,
  ) => Promise<{ success: boolean; deletedCount?: number; error?: string }>;
  onCreateCollection: () => void;
  activeTabId: string | null;
  tabs: TabInfo[];
}

const ConnectionItem: React.FC<ConnectionItemProps> = ({
  connection,
  onToggle,
  onDisconnect,
  onRefresh,
  onOpenCollection,
  onDropCollection,
  onTruncateCollection,
  onCreateCollection,
  activeTabId,
  tabs,
}) => {
  const color = getDatabaseColor(connection.config.type);

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Connection header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          margin: '0 8px',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'background 0.2s',
          background: connection.isExpanded ? 'var(--bg-elevated)' : 'transparent',
        }}
        onClick={onToggle}
        onMouseEnter={(e) => {
          if (!connection.isExpanded) {
            e.currentTarget.style.background = 'var(--bg-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!connection.isExpanded) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Expand icon */}
        <div
          style={{
            width: 16,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
            marginRight: 8,
          }}
        >
          {connection.isExpanded ? (
            <DownOutlined style={{ fontSize: 10 }} />
          ) : (
            <RightOutlined style={{ fontSize: 10 }} />
          )}
        </div>
        {/* Name and info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {connection.name.split('@')[0] || connection.config.type}
          </div>
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: 10,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {connection.config.host}
            {connection.config.port ? `:${connection.config.port}` : ''}{' '}
            {connection.config.tenant && connection.config.database
              ? `@${connection.config.tenant}/${connection.config.database}`
              : `${connection.config.database ? ` (${connection.config.database})` : ''}`}
          </div>
        </div>

        {/* Loading indicator */}
        {connection.isLoading && <Spin size="small" style={{ marginRight: 8 }} />}

        {/* Actions menu */}
        <Dropdown
          menu={{
            items: [
              {
                key: 'create',
                icon: <FolderAddOutlined />,
                label: 'Create Collection',
                onClick: (e) => {
                  e.domEvent.stopPropagation();
                  onCreateCollection();
                },
              },
              {
                key: 'refresh',
                icon: <ReloadOutlined />,
                label: 'Refresh',
                onClick: (e) => {
                  e.domEvent.stopPropagation();
                  onRefresh();
                },
              },
              { type: 'divider' },
              {
                key: 'disconnect',
                icon: <DisconnectOutlined />,
                label: 'Disconnect',
                danger: true,
                onClick: (e) => {
                  e.domEvent.stopPropagation();
                  onDisconnect();
                },
              },
            ],
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            onClick={(e) => e.stopPropagation()}
            style={{
              opacity: 0.5,
              width: 24,
              height: 24,
            }}
          />
        </Dropdown>
      </div>

      {/* Collections list */}
      {connection.isExpanded && !connection.isLoading && (
        <div style={{ marginTop: 4 }}>
          {connection.collections.length === 0 ? (
            <div
              style={{
                padding: '12px 20px 12px 20px',
                color: 'var(--text-muted)',
                fontSize: 12,
                fontStyle: 'italic',
              }}
            >
              No collections found
            </div>
          ) : (
            connection.collections
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((collection) => {
                const isOpen = tabs.some(
                  (t) => t.connectionId === connection.id && t.collection.name === collection.name,
                );
                const isActive =
                  tabs.find((t) => t.id === activeTabId)?.collection.name === collection.name &&
                  tabs.find((t) => t.id === activeTabId)?.connectionId === connection.id;

                return (
                  <div
                    key={collection.name}
                    onClick={() => onOpenCollection(collection)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '6px 12px 6px 24px',
                      margin: '2px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      background: isActive ? `${color}20` : 'transparent',
                      borderLeft: isActive ? `2px solid ${color}` : '2px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {/* Collection icon */}
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        marginRight: 10,
                        borderRadius: '50%',
                        background: isActive || isOpen ? color : 'var(--border-light)',
                        opacity: isActive ? 1 : 0.4,
                      }}
                    />

                    {/* Collection name */}
                    <div
                      style={{
                        flex: 1,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: isActive ? 500 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {collection.name}
                    </div>

                    {/* Count badge */}
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-elevated)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        marginLeft: 8,
                      }}
                    >
                      {formatNumber(collection.count)}
                    </div>

                    {/* Collection actions menu */}
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: 'truncate',
                            icon: <ClearOutlined />,
                            label: 'Truncate Collection',
                            onClick: (e) => {
                              e.domEvent.stopPropagation();
                              Modal.confirm({
                                title: 'Truncate Collection',
                                icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
                                content: (
                                  <div>
                                    <p>
                                      Are you sure you want to truncate the collection{' '}
                                      <strong>{collection.name}</strong>?
                                    </p>
                                    <p>
                                      <Text type="secondary">
                                        Current items: {collection.count.toLocaleString()}
                                      </Text>
                                    </p>
                                    <p style={{ color: '#ff7875', fontSize: 12 }}>
                                      ⚠️ This action cannot be undone!
                                    </p>
                                  </div>
                                ),
                                okText: 'Truncate Collection',
                                okType: 'danger',
                                cancelText: 'Cancel',
                                async onOk() {
                                  const result = await onTruncateCollection(collection.name);
                                  if (result.success) {
                                    message.success(
                                      `Truncated ${result.deletedCount || 0} documents`,
                                    );
                                  } else {
                                    message.error(result.error || 'Failed to truncate');
                                  }
                                },
                              });
                            },
                          },
                          { type: 'divider' },
                          {
                            key: 'drop',
                            icon: <DeleteOutlined />,
                            label: 'Drop Collection',
                            danger: true,
                            onClick: (e) => {
                              e.domEvent.stopPropagation();
                              Modal.confirm({
                                title: 'Drop Collection',
                                icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
                                content: (
                                  <div>
                                    <p style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                                      Are you sure you want to DROP the collection "
                                      {collection.name}"?
                                    </p>
                                    <p>
                                      <Text type="secondary">This will permanently delete:</Text>
                                    </p>
                                    <ul style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                      <li>All {collection.count.toLocaleString()} vectors</li>
                                      <li>All metadata and indexes</li>
                                      <li>The collection itself</li>
                                    </ul>
                                    <p style={{ color: '#ff7875', fontSize: 12, marginTop: 12 }}>
                                      ⚠️ This action CANNOT be undone!
                                    </p>
                                  </div>
                                ),
                                okText: 'DROP Collection',
                                okType: 'danger',
                                cancelText: 'Cancel',
                                async onOk() {
                                  const result = await onDropCollection(collection.name);
                                  if (result.success) {
                                    message.success(`Collection "${collection.name}" dropped`);
                                  } else {
                                    message.error(result.error || 'Failed to drop');
                                  }
                                },
                              });
                            },
                          },
                        ],
                      }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        onClick={(ev) => ev.stopPropagation()}
                        style={{
                          opacity: 0.4,
                          width: 20,
                          height: 20,
                          marginLeft: 4,
                        }}
                        onMouseEnter={(ev) => {
                          ev.currentTarget.style.opacity = '1';
                        }}
                        onMouseLeave={(ev) => {
                          ev.currentTarget.style.opacity = '0.4';
                        }}
                      />
                    </Dropdown>
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
