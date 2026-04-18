import React, { useState, useEffect } from 'react';
import { Spin, Space, Button } from 'antd';
import { CopyOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import { TabInfo } from '../types';

interface InfoTabProps {
  tab: TabInfo;
}

interface JsonViewerProps {
  data: unknown;
  level?: number;
  collapsed?: Set<string>;
  onToggle?: (path: string) => void;
  path?: string;
}

const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  level = 0,
  collapsed = new Set(),
  onToggle,
  path = '',
}) => {
  const isCollapsed = collapsed.has(path);
  const isFirstLevel = level === 0;
  const shouldCollapse = !isFirstLevel && isCollapsed;

  const handleToggle = () => {
    if (onToggle) {
      onToggle(path);
    }
  };

  if (data === null) {
    return <span style={{ color: '#9ca3af' }}>null</span>;
  }

  if (data === undefined) {
    return <span style={{ color: '#9ca3af' }}>undefined</span>;
  }

  if (typeof data === 'string') {
    return <span style={{ color: '#10b981' }}>"{data}"</span>;
  }

  if (typeof data === 'number') {
    return <span style={{ color: '#3b82f6' }}>{data}</span>;
  }

  if (typeof data === 'boolean') {
    return <span style={{ color: '#f59e0b' }}>{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span style={{ color: '#9ca3af' }}>[]</span>;
    }

    return (
      <div style={{ marginLeft: level > 0 ? 16 : 0 }}>
        <span
          onClick={handleToggle}
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {shouldCollapse ? <RightOutlined /> : <DownOutlined />}
          <span style={{ color: '#8b5cf6' }}>[</span>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>
            {data.length} {data.length === 1 ? 'item' : 'items'}
          </span>
          {shouldCollapse && <span style={{ color: '#8b5cf6' }}>]</span>}
        </span>
        {!shouldCollapse && (
          <div style={{ marginLeft: 20, marginTop: 4 }}>
            {data.map((item, index) => (
              <div key={index} style={{ marginBottom: 4 }}>
                <span style={{ color: '#6b7280', fontSize: 11 }}>{index}:</span>{' '}
                <JsonViewer
                  data={item}
                  level={level + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  path={`${path}[${index}]`}
                />
              </div>
            ))}
            <span style={{ color: '#8b5cf6' }}>]</span>
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return <span style={{ color: '#9ca3af' }}>{'{}'}</span>;
    }

    return (
      <div style={{ marginLeft: level > 0 ? 16 : 0 }}>
        <span
          onClick={handleToggle}
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {shouldCollapse ? <RightOutlined /> : <DownOutlined />}
          <span style={{ color: '#ef4444' }}>{'{'}</span>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>
            {entries.length} {entries.length === 1 ? 'key' : 'keys'}
          </span>
          {shouldCollapse && <span style={{ color: '#ef4444' }}>{'}'}</span>}
        </span>
        {!shouldCollapse && (
          <div style={{ marginLeft: 20, marginTop: 4 }}>
            {entries.map(([key, value], index) => {
              const keyPath = path ? `${path}.${key}` : key;
              const isValueCollapsed = collapsed.has(keyPath);
              const isValueObject =
                typeof value === 'object' && value !== null && !Array.isArray(value);
              const isValueArray = Array.isArray(value);

              return (
                <div key={key} style={{ marginBottom: 4 }}>
                  <span
                    onClick={() => {
                      if ((isValueObject || isValueArray) && onToggle) {
                        onToggle(keyPath);
                      }
                    }}
                    style={{
                      cursor: isValueObject || isValueArray ? 'pointer' : 'default',
                      userSelect: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {(isValueObject || isValueArray) &&
                      (isValueCollapsed ? (
                        <RightOutlined style={{ fontSize: 10 }} />
                      ) : (
                        <DownOutlined style={{ fontSize: 10 }} />
                      ))}
                    <span style={{ color: '#eab308', fontWeight: 500 }}>"{key}"</span>
                    <span style={{ color: '#9ca3af' }}>:</span>{' '}
                  </span>
                  {isValueCollapsed ? (
                    <span style={{ color: '#9ca3af', fontSize: 11 }}>
                      {isValueArray ? '[...]' : '{...}'}
                    </span>
                  ) : (
                    <JsonViewer
                      data={value}
                      level={level + 1}
                      collapsed={collapsed}
                      onToggle={onToggle}
                      path={keyPath}
                    />
                  )}
                  {index < entries.length - 1 && <span style={{ color: '#9ca3af' }}>,</span>}
                </div>
              );
            })}
            <span style={{ color: '#ef4444' }}>{'}'}</span>
          </div>
        )}
      </div>
    );
  }

  return <span>{String(data)}</span>;
};

const InfoTab: React.FC<InfoTabProps> = ({ tab }) => {
  const [infoData, setInfoData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electronAPI.db.getCollectionInfo(
          tab.connectionId,
          tab.collection.name,
        );
        if (result.success && result.data) {
          setInfoData(result.data);
        } else {
          setError(result.error || 'Failed to fetch collection info');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch collection info');
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [tab.connectionId, tab.collection.name]);

  const handleToggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const jsonString = infoData ? JSON.stringify(infoData, null, 2) : '';

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}
    >
      {/* JSON Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 20,
        }}
      >
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 60,
              color: 'var(--text-secondary)',
            }}
          >
            <Spin size="large" />
            <div style={{ marginTop: 16, fontSize: 13 }}>Loading collection information...</div>
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: 'center',
              padding: 60,
              color: 'var(--error-color, #ff4d4f)',
            }}
          >
            {error}
          </div>
        ) : infoData ? (
          <div
            style={{
              padding: 16,
              background: 'var(--bg-secondary)',
              borderRadius: 6,
              border: '1px solid var(--border-color)',
              fontSize: 13,
              fontFamily: 'monospace',
              overflow: 'auto',
              lineHeight: 1.6,
              position: 'relative',
            }}
          >
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              onClick={() => navigator.clipboard.writeText(jsonString)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 10,
              }}
            >
              Copy JSON
            </Button>
            <JsonViewer data={infoData} collapsed={collapsed} onToggle={handleToggle} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InfoTab;
