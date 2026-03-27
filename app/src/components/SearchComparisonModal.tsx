import React from 'react';
import { Modal, Tag, Typography, Empty } from 'antd';
import {
  CheckOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { Document, SearchMetadata, COLLECTION_DEFAULT_VECTOR } from '../types';

const { Text, Title } = Typography;

interface SearchHistoryItem {
  id: string;
  timestamp: number;
  vector: number[] | { indices: number[]; values: number[] };
  vectorType: 'dense' | 'sparse' | 'binary';
  vectorField: string | null;
  topK: number;
  scoreThreshold: number | undefined;
  filter: any;
  documents: Document[];
  metadata: SearchMetadata | null;
}

interface SearchComparisonModalProps {
  open: boolean;
  onClose: () => void;
  currentSearch: SearchHistoryItem | null;
  previousSearch: SearchHistoryItem | null;
}

const SearchComparisonModal: React.FC<SearchComparisonModalProps> = ({
  open,
  onClose,
  currentSearch,
  previousSearch,
}) => {
  if (!currentSearch || !previousSearch) {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width={900}
        title="Compare Searches"
      >
        <Empty description="No searches to compare" />
      </Modal>
    );
  }

  // Calculate metrics
  const currentIds = new Set(currentSearch.documents.map(d => d.primary.value));
  const previousIds = new Set(previousSearch.documents.map(d => d.primary.value));
  const overlap = Array.from(currentIds).filter(id => previousIds.has(id)).length;
  
  const currentScores = currentSearch.documents.map(d => d.score || 0);
  const previousScores = previousSearch.documents.map(d => d.score || 0);
  
  const avgScore = (scores: number[]) => 
    scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4) : 'N/A';

  const formatDate = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const isDifferent = (val1: any, val2: any) => {
    return JSON.stringify(val1) !== JSON.stringify(val2);
  };

  const ComparisonRow = ({ 
    label, 
    currentValue, 
    previousValue, 
    isDiff,
    betterCurrent,
  }: { 
    label: string; 
    currentValue: React.ReactNode; 
    previousValue: React.ReactNode; 
    isDiff?: boolean;
    betterCurrent?: boolean | null;
  }) => (
    <div style={{ 
      display: 'flex', 
      borderBottom: '1px solid var(--border-color)',
      minHeight: 40,
    }}>
      <div style={{ 
        width: '30%', 
        padding: '10px 12px',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        borderRight: '1px solid var(--border-color)',
      }}>
        <Text style={{ fontSize: 12, fontWeight: 500 }}>{label}</Text>
      </div>
      <div style={{ 
        width: '35%', 
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRight: '1px solid var(--border-color)',
        background: isDiff && betterCurrent === true ? 'rgba(82, 196, 26, 0.08)' : 
                    isDiff && betterCurrent === false ? 'rgba(245, 34, 45, 0.08)' :
                    'transparent',
      }}>
        {isDiff && betterCurrent === true && (
          <ArrowUpOutlined style={{ fontSize: 11, color: '#52c41a' }} />
        )}
        {isDiff && betterCurrent === false && (
          <ArrowDownOutlined style={{ fontSize: 11, color: '#f5222d' }} />
        )}
        {currentValue}
      </div>
      <div style={{ 
        width: '35%', 
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: isDiff && betterCurrent === false ? 'rgba(82, 196, 26, 0.08)' : 
                    isDiff && betterCurrent === true ? 'rgba(245, 34, 45, 0.08)' :
                    'transparent',
      }}>
        {isDiff && betterCurrent === false && (
          <ArrowUpOutlined style={{ fontSize: 11, color: '#52c41a' }} />
        )}
        {isDiff && betterCurrent === true && (
          <ArrowDownOutlined style={{ fontSize: 11, color: '#f5222d' }} />
        )}
        {previousValue}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={850}
      title={<Title level={5} style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Search Comparison</Title>}
      styles={{
        body: {
          padding: 0,
        },
      }}
    >
      {/* Header Row */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '2px solid var(--border-color)',
        background: 'var(--bg-tertiary)',
      }}>
        <div style={{ 
          width: '30%', 
          padding: '12px', 
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
        }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
            Metric
          </Text>
        </div>
        <div style={{ 
          width: '35%', 
          padding: '12px',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Text strong style={{ fontSize: 13 }}>Latest</Text>
          <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
            {formatDate(currentSearch.timestamp)}
          </Tag>
        </div>
        <div style={{ 
          width: '35%', 
          padding: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Text strong style={{ fontSize: 13 }}>Previous</Text>
          <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
            {formatDate(previousSearch.timestamp)}
          </Tag>
        </div>
      </div>

      <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
        {/* Search Parameters */}
        <div style={{ padding: '16px 0 8px' }}>
          <div style={{ padding: '0 12px 8px' }}>
            <Text strong style={{ fontSize: 13, fontWeight: 600 }}>Search Parameters</Text>
          </div>

          <ComparisonRow
            label="Vector"
            currentValue={
              <>
                <Text style={{ fontSize: 13 }}>
                  {Array.isArray(currentSearch.vector) 
                    ? `${currentSearch.vector.length}D ${currentSearch.vectorType}`
                    : `${currentSearch.vector.indices.length} nnz (sparse)`}
                </Text>
                {!isDifferent(
                  Array.isArray(currentSearch.vector) ? currentSearch.vector.length : currentSearch.vector.indices.length,
                  Array.isArray(previousSearch.vector) ? previousSearch.vector.length : previousSearch.vector.indices.length
                ) && (
                  <CheckOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
                )}
              </>
            }
            previousValue={
              <Text style={{ fontSize: 13 }}>
                {Array.isArray(previousSearch.vector) 
                  ? `${previousSearch.vector.length}D ${previousSearch.vectorType}`
                  : `${previousSearch.vector.indices.length} nnz (sparse)`}
              </Text>
            }
            isDiff={isDifferent(
              Array.isArray(currentSearch.vector) ? currentSearch.vector.length : currentSearch.vector.indices.length,
              Array.isArray(previousSearch.vector) ? previousSearch.vector.length : previousSearch.vector.indices.length
            )}
          />

          <ComparisonRow
            label="Top K"
            currentValue={
              <>
                <Text style={{ fontSize: 13 }}>{currentSearch.topK}</Text>
                {!isDifferent(currentSearch.topK, previousSearch.topK) && (
                  <CheckOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
                )}
              </>
            }
            previousValue={<Text style={{ fontSize: 13 }}>{previousSearch.topK}</Text>}
            isDiff={isDifferent(currentSearch.topK, previousSearch.topK)}
          />

          {currentSearch.vectorField && currentSearch.vectorField !== COLLECTION_DEFAULT_VECTOR && (
          <ComparisonRow
            label="Vector Field"
            currentValue={
              <>
                <Tag style={{ fontSize: 11 }}>{currentSearch.vectorField}</Tag>
                {!isDifferent(currentSearch.vectorField, previousSearch.vectorField) && (
                  <CheckOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
                )}
              </>
            }
            previousValue={<Tag style={{ fontSize: 11 }}>{previousSearch.vectorField}</Tag>}
            isDiff={isDifferent(currentSearch.vectorField, previousSearch.vectorField)}
          />
          )}

          <ComparisonRow
            label="Score Threshold"
            currentValue={
              <>
                <Tag style={{ fontSize: 11 }}>{currentSearch.scoreThreshold ?? 'None'}</Tag>
                {!isDifferent(currentSearch.scoreThreshold, previousSearch.scoreThreshold) && (
                  <CheckOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
                )}
              </>
            }
            previousValue={<Tag style={{ fontSize: 11 }}>{previousSearch.scoreThreshold ?? 'None'}</Tag>}
            isDiff={isDifferent(currentSearch.scoreThreshold, previousSearch.scoreThreshold)}
          />

          <ComparisonRow
            label="Filter Applied"
            currentValue={
              <>
                {currentSearch.filter ? <Tag color="blue" style={{ fontSize: 11 }}>Yes</Tag> : <Tag style={{ fontSize: 11 }}>No</Tag>}
                {!isDifferent(!!currentSearch.filter, !!previousSearch.filter) && (
                  <CheckOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
                )}
              </>
            }
            previousValue={previousSearch.filter ? <Tag color="blue" style={{ fontSize: 11 }}>Yes</Tag> : <Tag style={{ fontSize: 11 }}>No</Tag>}
            isDiff={isDifferent(!!currentSearch.filter, !!previousSearch.filter)}
          />
        </div>

        <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 0' }} />

        {/* Results */}
        <div style={{ padding: '12px 0 8px' }}>
          <div style={{ padding: '0 12px 8px' }}>
            <Text strong style={{ fontSize: 13, fontWeight: 600 }}>Results</Text>
          </div>

          <ComparisonRow
            label="Results Count"
            currentValue={
              <>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>{currentSearch.documents.length}</Text>
                {!isDifferent(currentSearch.documents.length, previousSearch.documents.length) && (
                  <CheckOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
                )}
              </>
            }
            previousValue={<Text style={{ fontSize: 13, fontWeight: 500 }}>{previousSearch.documents.length}</Text>}
            isDiff={isDifferent(currentSearch.documents.length, previousSearch.documents.length)}
            betterCurrent={
              isDifferent(currentSearch.documents.length, previousSearch.documents.length)
                ? currentSearch.documents.length > previousSearch.documents.length
                : null
            }
          />

          <ComparisonRow
            label="Overlap"
            currentValue={
              <Text style={{ fontSize: 13 }}>
                {overlap}
                {currentSearch.documents.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                    ({((overlap / currentSearch.documents.length) * 100).toFixed(0)}%)
                  </Text>
                )}
              </Text>
            }
            previousValue={
              <Text style={{ fontSize: 13 }}>
                {overlap}
                {previousSearch.documents.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                    ({((overlap / previousSearch.documents.length) * 100).toFixed(0)}%)
                  </Text>
                )}
              </Text>
            }
          />

          <ComparisonRow
            label="Average Score"
            currentValue={<Tag color="blue" style={{ fontSize: 11 }}>{avgScore(currentScores)}</Tag>}
            previousValue={<Tag color="blue" style={{ fontSize: 11 }}>{avgScore(previousScores)}</Tag>}
            isDiff={isDifferent(avgScore(currentScores), avgScore(previousScores))}
            betterCurrent={
              isDifferent(avgScore(currentScores), avgScore(previousScores)) && 
              avgScore(currentScores) !== 'N/A' && avgScore(previousScores) !== 'N/A'
                ? parseFloat(avgScore(currentScores)) > parseFloat(avgScore(previousScores))
                : null
            }
          />

          <ComparisonRow
            label="Search Time"
            currentValue={
              <Text style={{ fontSize: 13 }}>
                {currentSearch.metadata?.searchTimeMs 
                  ? `${currentSearch.metadata.searchTimeMs.toFixed(1)}ms`
                  : 'N/A'}
              </Text>
            }
            previousValue={
              <Text style={{ fontSize: 13 }}>
                {previousSearch.metadata?.searchTimeMs 
                  ? `${previousSearch.metadata.searchTimeMs.toFixed(1)}ms`
                  : 'N/A'}
              </Text>
            }
            isDiff={isDifferent(
              currentSearch.metadata?.searchTimeMs, 
              previousSearch.metadata?.searchTimeMs
            )}
            betterCurrent={
              isDifferent(currentSearch.metadata?.searchTimeMs, previousSearch.metadata?.searchTimeMs) &&
              currentSearch.metadata?.searchTimeMs && previousSearch.metadata?.searchTimeMs
                ? currentSearch.metadata.searchTimeMs < previousSearch.metadata.searchTimeMs
                : null
            }
          />
        </div>

        <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 0' }} />

        {/* Top 5 */}
        <div style={{ padding: '12px 12px 12px' }}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12, fontWeight: 600 }}>Top 5</Text>
          
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentSearch.documents.slice(0, 5).map((doc, idx) => {
                  const isInPrevious = previousIds.has(doc.primary.value);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 10px',
                        background: isInPrevious ? 'rgba(82, 196, 26, 0.06)' : 'var(--bg-secondary)',
                        borderRadius: 6,
                        border: `1px solid ${isInPrevious ? '#52c41a' : 'var(--border-color)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: isInPrevious ? '0 1px 3px rgba(82, 196, 26, 0.1)' : 'none',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 10, minWidth: 18, fontWeight: 600 }}>
                        #{idx + 1}
                      </Text>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          ellipsis
                          style={{ 
                            display: 'block',
                            fontSize: 11,
                          }}
                        >
                          {String(doc.primary.value)}
                        </Text>
                      </div>
                      <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>
                        {doc.score?.toFixed(3) || 'N/A'}
                      </Tag>
                      {isInPrevious && (
                        <CheckOutlined style={{ color: '#52c41a', fontSize: 11 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ width: 1, background: 'var(--border-color)' }} />

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {previousSearch.documents.slice(0, 5).map((doc, idx) => {
                  const isInCurrent = currentIds.has(doc.primary.value);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 10px',
                        background: isInCurrent ? 'rgba(82, 196, 26, 0.06)' : 'var(--bg-secondary)',
                        borderRadius: 6,
                        border: `1px solid ${isInCurrent ? '#52c41a' : 'var(--border-color)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: isInCurrent ? '0 1px 3px rgba(82, 196, 26, 0.1)' : 'none',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 10, minWidth: 18, fontWeight: 600 }}>
                        #{idx + 1}
                      </Text>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          ellipsis
                          style={{ 
                            display: 'block',
                            fontSize: 11,
                          }}
                        >
                          {String(doc.primary.value)}
                        </Text>
                      </div>
                      <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>
                        {doc.score?.toFixed(3) || 'N/A'}
                      </Tag>
                      {isInCurrent && (
                        <CheckOutlined style={{ color: '#52c41a', fontSize: 11 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SearchComparisonModal;

