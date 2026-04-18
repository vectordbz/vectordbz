import React, { useState } from 'react';
import { Tag, Typography, Space, Modal, Divider } from 'antd';
import { InfoCircleOutlined, FilterOutlined } from '@ant-design/icons';
import { SearchMetadata } from '../types';

const { Text } = Typography;

interface SearchStatisticsProps {
  metadata: SearchMetadata;
}

const SearchStatistics: React.FC<SearchStatisticsProps> = ({ metadata }) => {
  const [modalOpen, setModalOpen] = useState(false);

  if (!metadata) return null;

  const scoreDist = metadata.scoreDistribution;
  const confidenceColor = {
    high: '#52c41a',
    medium: '#faad14',
    low: '#ff4d4f',
  }[metadata.confidenceLevel || 'low'];

  const confidenceBgColor = {
    high: 'rgba(82, 196, 26, 0.1)',
    medium: 'rgba(250, 173, 20, 0.1)',
    low: 'rgba(255, 77, 79, 0.1)',
  }[metadata.confidenceLevel || 'low'];

  // Generate confidence explanation
  const getConfidenceExplanation = (): string => {
    if (!metadata.confidenceLevel || !scoreDist) {
      return 'Confidence cannot be determined without score data.';
    }

    const scores = scoreDist.scores;
    if (scores.length === 0) {
      return 'No scores available.';
    }

    if (scores.length === 1) {
      const score = scores[0];
      if (score > 0.7) {
        return 'High confidence: Single result has a strong similarity score (>0.7).';
      } else if (score > 0.4) {
        return 'Medium confidence: Single result has a moderate similarity score (0.4-0.7).';
      } else {
        return 'Low confidence: Single result has a weak similarity score (<0.4).';
      }
    }

    const gap = metadata.scoreGapRank1Rank2 || 0;
    const topScore = typeof scores[0] === 'number' ? scores[0] : Number(scores[0]);
    const avgScore = typeof scoreDist.avg === 'number' ? scoreDist.avg : 0;
    const relativeScore = avgScore > 0 && Number.isFinite(topScore) ? topScore / avgScore : 0;

    const reasons: string[] = [];

    if (typeof gap === 'number' && Number.isFinite(gap)) {
      if (gap > 0.1) {
        reasons.push(`large score gap between rank 1 and 2 (${gap.toFixed(3)})`);
      } else if (gap > 0.05) {
        reasons.push(`moderate score gap between rank 1 and 2 (${gap.toFixed(3)})`);
      } else {
        reasons.push(`small score gap between rank 1 and 2 (${gap.toFixed(3)})`);
      }
    }

    if (Number.isFinite(relativeScore)) {
      if (relativeScore > 1.5) {
        reasons.push(
          `top score is significantly higher than average (${relativeScore.toFixed(2)}x)`,
        );
      } else if (relativeScore > 1.2) {
        reasons.push(`top score is moderately higher than average (${relativeScore.toFixed(2)}x)`);
      } else {
        reasons.push(`top score is close to average (${relativeScore.toFixed(2)}x)`);
      }
    }

    if (Number.isFinite(topScore) && topScore < 0.4) {
      reasons.push(`low absolute similarity score (${topScore.toFixed(3)})`);
    }

    if (metadata.confidenceLevel === 'high') {
      return `High confidence: ${reasons.join(', ')}. The top result is clearly the best match.`;
    } else if (metadata.confidenceLevel === 'medium') {
      return `Medium confidence: ${reasons.join(', ')}. The top result is reasonably distinct but not strongly separated.`;
    } else {
      return `Low confidence: ${reasons.join(', ')}. Results are too similar or scores are too low, indicating weak semantic match.`;
    }
  };

  const detailsContent = (
    <div style={{ fontSize: 12 }}>
      {/* Summary Section */}
      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          Summary
        </Text>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8,
          }}
        >
          {metadata.searchTimeMs !== undefined && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Time
              </Text>
              <div>
                <Text strong style={{ fontSize: 13 }}>
                  {metadata.searchTimeMs.toFixed(0)}ms
                </Text>
              </div>
            </div>
          )}
          {metadata.returnedCount !== undefined && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Results
              </Text>
              <div>
                <Text strong style={{ fontSize: 13 }}>
                  {metadata.returnedCount}/{metadata.requestedTopK || '?'}
                </Text>
              </div>
            </div>
          )}
          {scoreDist && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Score
              </Text>
              <div>
                <Text strong style={{ fontSize: 13 }}>
                  {typeof scoreDist.max === 'number' ? scoreDist.max.toFixed(3) : 'N/A'}
                </Text>
              </div>
            </div>
          )}
          {metadata.confidenceLevel && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Confidence
              </Text>
              <div>
                <Text
                  strong
                  style={{
                    fontSize: 13,
                    color: confidenceColor,
                    textTransform: 'capitalize',
                  }}
                >
                  {metadata.confidenceLevel}
                </Text>
              </div>
            </div>
          )}
        </div>
        {metadata.confidenceLevel && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: confidenceBgColor,
              borderRadius: 4,
              border: '1px solid var(--border-color)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }}>
              {getConfidenceExplanation()}
            </Text>
          </div>
        )}
      </div>

      {scoreDist && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              Score Distribution
            </Text>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 0,
                marginBottom: 8,
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Min
                </Text>
                <div>
                  <Text strong>
                    {typeof scoreDist.min === 'number' ? scoreDist.min.toFixed(4) : 'N/A'}
                  </Text>
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Max
                </Text>
                <div>
                  <Text strong>
                    {typeof scoreDist.max === 'number' ? scoreDist.max.toFixed(4) : 'N/A'}
                  </Text>
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Avg
                </Text>
                <div>
                  <Text strong>
                    {typeof scoreDist.avg === 'number' ? scoreDist.avg.toFixed(4) : 'N/A'}
                  </Text>
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Median
                </Text>
                <div>
                  <Text strong>
                    {typeof scoreDist.median === 'number' ? scoreDist.median.toFixed(4) : 'N/A'}
                  </Text>
                </div>
              </div>
            </div>
            {(metadata.scoreGapRank1Rank2 !== undefined || metadata.scoreEntropy !== undefined) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                {metadata.scoreEntropy !== undefined ? (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Entropy
                    </Text>
                    <div>
                      <Text strong>{metadata.scoreEntropy.toFixed(3)}</Text>
                    </div>
                  </div>
                ) : (
                  <div></div>
                )}
                {metadata.scoreGapRank1Rank2 !== undefined ? (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Gap (R1→R2)
                    </Text>
                    <div>
                      <Text strong>{metadata.scoreGapRank1Rank2.toFixed(4)}</Text>
                    </div>
                  </div>
                ) : (
                  <div></div>
                )}
                <div></div>
                <div></div>
              </div>
            )}
          </div>
        </>
      )}

      {metadata.queryVectorDimension && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              Query Embedding
            </Text>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 8,
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Dimension
                </Text>
                <div>
                  <Text strong>{metadata.queryVectorDimension}</Text>
                </div>
              </div>
              {metadata.queryVectorNorm !== undefined && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    L2 Norm
                  </Text>
                  <div>
                    <Text strong>{metadata.queryVectorNorm.toFixed(4)}</Text>
                    {metadata.queryVectorNormalized && (
                      <Text type="secondary" style={{ marginLeft: 4 }}>
                        ✓
                      </Text>
                    )}
                  </div>
                </div>
              )}
              {metadata.queryVectorMean !== undefined && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Mean
                  </Text>
                  <div>
                    <Text strong>{metadata.queryVectorMean.toFixed(4)}</Text>
                  </div>
                </div>
              )}
              {metadata.queryVectorVariance !== undefined && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Variance
                  </Text>
                  <div>
                    <Text strong>{metadata.queryVectorVariance.toFixed(4)}</Text>
                  </div>
                </div>
              )}
            </div>
            {metadata.queryVectorNormalized === false && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>
                  Not normalized
                </Tag>
              </div>
            )}
          </div>
        </>
      )}

      {metadata.filterApplied && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              Filters
            </Text>
            {metadata.filterConditions && metadata.filterConditions.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <Space wrap size={[4, 4]}>
                  {metadata.filterConditions.map((cond, idx) => (
                    <Tag key={idx} style={{ fontSize: 10, margin: 0 }}>
                      {cond.field} {cond.operator} {String(cond.value)}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
            {metadata.candidatesBeforeFilter !== undefined &&
              metadata.candidatesAfterFilter !== undefined && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Before:{' '}
                  </Text>
                  <Text>{metadata.candidatesBeforeFilter}</Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                    After:{' '}
                  </Text>
                  <Text>{metadata.candidatesAfterFilter}</Text>
                </div>
              )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 8 }}>
      {metadata.searchTimeMs !== undefined && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Time:
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {metadata.searchTimeMs.toFixed(0)}ms
            </Text>
          </div>
        </>
      )}
      {metadata.returnedCount !== undefined && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Results:
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {metadata.returnedCount}/{metadata.requestedTopK || '?'}
            </Text>
          </div>
        </>
      )}
      {scoreDist && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Score:
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {typeof scoreDist.max === 'number' ? scoreDist.max.toFixed(3) : 'N/A'}
            </Text>
          </div>
        </>
      )}
      {metadata.confidenceLevel && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Confidence:
            </Text>
            <Text
              type="secondary"
              style={{
                fontSize: 11,
                color: confidenceColor,
                textTransform: 'capitalize',
              }}
            >
              {metadata.confidenceLevel}
            </Text>
          </div>
        </>
      )}
      {metadata.filterApplied && (
        <>
          <Tag
            icon={<FilterOutlined />}
            style={{ fontSize: 10, margin: 0, height: 20, lineHeight: '18px' }}
          >
            Filtered
          </Tag>
        </>
      )}
      <InfoCircleOutlined
        onClick={() => setModalOpen(true)}
        style={{
          fontSize: 14,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          opacity: 0.7,
        }}
      />
      <Modal
        title="Search Statistics"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
        styles={{
          body: {
            padding: '16px 24px',
          },
        }}
      >
        {detailsContent}
      </Modal>
    </div>
  );
};

export default SearchStatistics;
