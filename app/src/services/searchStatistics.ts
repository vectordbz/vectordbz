import { Document, SearchMetadata, FilterQuery } from '../types';
import { vectorNorm } from './vectorUtils';

/**
 * Compute statistics from search results and query vector
 */
export function computeSearchStatistics(
  documents: Document[],
  queryVector: number[],
  requestedTopK: number,
  filter?: FilterQuery,
  searchTimeMs?: number,
): SearchMetadata {
  const metadata: SearchMetadata = {
    requestedTopK,
    returnedCount: documents.length,
    searchTimeMs,
    filterApplied: !!filter && filter.conditions.length > 0,
    filterConditions: filter?.conditions,
  };

  // Embedding statistics
  if (queryVector && queryVector.length > 0) {
    metadata.queryVectorDimension = queryVector.length;
    metadata.queryVectorNorm = vectorNorm(queryVector);
    metadata.queryVectorMean = computeMean(queryVector);
    metadata.queryVectorVariance = computeVariance(queryVector);
    metadata.queryVectorNormalized = Math.abs(metadata.queryVectorNorm - 1.0) < 0.01;
  }

  // Score statistics
  const scores = documents
    .map((doc) => doc.score)
    .filter((score): score is number => score !== undefined);

  if (scores.length > 0) {
    metadata.scoreDistribution = {
      min: Math.min(...scores),
      max: Math.max(...scores),
      avg: computeMean(scores),
      median: computeMedian(scores),
      scores: [...scores],
    };

    // Score gap between rank 1 and 2
    if (scores.length >= 2) {
      metadata.scoreGapRank1Rank2 = scores[0] - scores[1];
    }

    // Score entropy
    metadata.scoreEntropy = computeEntropy(scores);

    // Effective top-K (scores above a reasonable threshold)
    const threshold = metadata.scoreDistribution.avg * 0.5; // 50% of average
    metadata.effectiveTopK = scores.filter((s) => s >= threshold).length;

    // Confidence level
    const confidence = computeConfidence(scores);
    metadata.confidenceLevel = confidence.level;
    metadata.confidenceScore = confidence.score;
  }

  return metadata;
}

/**
 * Compute mean of an array
 */
function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Compute variance of an array
 */
function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = computeMean(values);
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  return computeMean(squaredDiffs);
}

/**
 * Compute median of an array
 */
function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Compute entropy of score distribution
 * Low entropy = clear semantic intent
 * High entropy = ambiguous query
 */
function computeEntropy(scores: number[]): number {
  if (scores.length === 0) return 0;

  // Normalize scores to probabilities
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  if (range === 0) return 0;

  const normalized = scores.map((s) => (s - min) / range);
  const sum = normalized.reduce((a, b) => a + b, 0);
  const probabilities = normalized.map((p) => p / sum);

  // Compute Shannon entropy
  let entropy = 0;
  for (const p of probabilities) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Compute confidence level from scores
 */
function computeConfidence(scores: number[]): { level: 'high' | 'medium' | 'low'; score: number } {
  if (scores.length === 0) {
    return { level: 'low', score: 0 };
  }

  if (scores.length === 1) {
    return {
      level: scores[0] > 0.7 ? 'high' : scores[0] > 0.4 ? 'medium' : 'low',
      score: scores[0],
    };
  }

  // Heuristic 1: Gap between rank 1 and 2
  const gap = scores[0] - scores[1];
  const gapScore = Math.min(gap / 0.2, 1.0); // Normalize to 0-1

  // Heuristic 2: Top score relative to average
  const avg = computeMean(scores);
  const topScore = scores[0];
  const relativeScore = avg > 0 ? Math.min(topScore / avg, 2.0) / 2.0 : 0;

  // Combined confidence score
  const confidenceScore = gapScore * 0.6 + relativeScore * 0.4;

  let level: 'high' | 'medium' | 'low';
  if (confidenceScore > 0.7) {
    level = 'high';
  } else if (confidenceScore > 0.4) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { level, score: confidenceScore };
}
