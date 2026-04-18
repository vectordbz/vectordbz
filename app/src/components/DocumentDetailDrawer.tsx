import React from 'react';
import { Drawer, Space, Typography, Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { COLLECTION_DEFAULT_VECTOR, Document, DocumentVector } from '../types';
import { isImageUrl, getImages } from '../services/documentUtils';
import { getVectorLabel, formatVectorForDisplay } from '../services/vectorUtils';

const { Text } = Typography;

interface DocumentDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  document: Document | null;
}

const DocumentDetailDrawer: React.FC<DocumentDetailDrawerProps> = ({ open, onClose, document }) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        message.success(`${label} copied to clipboard`);
      })
      .catch(() => {
        message.error('Failed to copy to clipboard');
      });
  };

  const copyVectorToClipboard = (vector: DocumentVector) => {
    try {
      let textToCopy: string;

      if (vector.vectorType === 'dense' || vector.vectorType === 'binary') {
        // Copy dense/binary vector as JSON array
        const data = 'data' in vector.value ? vector.value.data : [];
        textToCopy = JSON.stringify(data);
      } else if (vector.vectorType === 'sparse') {
        // Copy sparse vector as JSON object with indices and values
        const indices = 'indices' in vector.value ? vector.value.indices : [];
        const values = 'values' in vector.value ? vector.value.values : [];
        textToCopy = JSON.stringify({ indices, values }, null, 2);
      } else {
        message.error('Unknown vector type');
        return;
      }

      copyToClipboard(textToCopy, 'Vector');
    } catch (error) {
      message.error('Failed to copy vector');
    }
  };

  const copyPayloadToClipboard = (key: string, value: unknown) => {
    try {
      let textToCopy: string;
      if (typeof value === 'object' && value !== null) {
        textToCopy = JSON.stringify(value, null, 2);
      } else {
        textToCopy = String(value);
      }
      copyToClipboard(textToCopy, key);
    } catch (error) {
      message.error('Failed to copy payload');
    }
  };

  const CopyButton: React.FC<{ onClick: () => void; title?: string }> = ({
    onClick,
    title = 'Copy to clipboard',
  }) => (
    <Button
      type="text"
      size="small"
      icon={<CopyOutlined />}
      onClick={onClick}
      style={{
        padding: 0,
        height: 'auto',
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}
      title={title}
    />
  );

  if (!document) return null;

  return (
    <Drawer
      title={
        <Space>
          <span>Document</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size={480}
      styles={{
        header: {
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          padding: '12px 16px',
        },
        body: { background: 'var(--bg-primary)', padding: 16 },
      }}
    >
      {document && (
        <div className="fade-in">
          {/* Image */}
          {(() => {
            const images = getImages(document.payload);
            if (images.length > 0) {
              const imageUrl = images[0].url;
              return (
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <img
                    src={imageUrl}
                    alt="Document image"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 200,
                      height: 'auto',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                    onClick={() => window.open(imageUrl, '_blank')}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              );
            }
            return null;
          })()}

          {/* Score */}
          {document.score !== undefined && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Similarity Score
                </Text>
                <CopyButton
                  onClick={() =>
                    copyToClipboard(Number(document.score).toFixed(6), 'Similarity Score')
                  }
                  title="Copy score to clipboard"
                />
              </div>
              <Text style={{ fontSize: 20, color: '#22c55e', fontWeight: 600 }}>
                {Number(document.score).toFixed(6)}
              </Text>
            </div>
          )}

          {/* Unified Data Section */}
          <div>
            {/* PRIMARY KEY */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {document.primary.name}
                </Text>
                <CopyButton
                  onClick={() =>
                    copyToClipboard(String(document.primary.value), document.primary.name)
                  }
                  title={`Copy ${document.primary.name} to clipboard`}
                />
              </div>
              <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {document.primary.value}
              </Text>
            </div>

            {/* Vectors */}
            {Object.values(document.vectors).map((vector, vectorIndex) => (
              <div key={vector.key || vectorIndex} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {getVectorLabel(vector)}
                  </Text>
                  <CopyButton
                    onClick={() => copyVectorToClipboard(vector)}
                    title="Copy vector to clipboard"
                  />
                </div>
                <div
                  style={{
                    maxHeight: 100,
                    overflow: 'auto',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    padding: 8,
                    background: 'var(--bg-secondary)',
                    borderRadius: 4,
                  }}
                >
                  {formatVectorForDisplay(vector, 50)}
                </div>
              </div>
            ))}

            {/* Payload */}
            {Object.entries(document.payload).map(([key, value]) => {
              // Skip image fields that are already displayed
              if (isImageUrl(value, key)) return null;

              return (
                <div key={key} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {key}
                    </Text>
                    <CopyButton
                      onClick={() => copyPayloadToClipboard(key, value)}
                      title={`Copy ${key} to clipboard`}
                    />
                  </div>
                  {typeof value === 'object' && value !== null ? (
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 11,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        padding: 8,
                        background: 'var(--bg-secondary)',
                        borderRadius: 4,
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <Text style={{ fontSize: 12, wordBreak: 'break-word' }}>{String(value)}</Text>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Drawer>
  );
};

export default DocumentDetailDrawer;
