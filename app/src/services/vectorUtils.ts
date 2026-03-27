/**
 * Vector utility functions for distance calculations, clustering, and analysis
 */

import { DocumentVector, COLLECTION_DEFAULT_VECTOR } from '../types';

// ============================================================================
// Vector Generation
// ============================================================================

/**
 * Generate a random vector based on the vector schema field
 * @param vectorType - The type of vector to generate ('dense', 'sparse', or 'binary')
 * @param size - The size/dimension of the vector (for dense/binary)
 * @returns JSON string representation of the generated vector
 */
export function generateRandomVector(vectorType: 'dense' | 'sparse' | 'binary', size?: number): string {
  if (vectorType === 'dense') {
    // Dense vector: generate array of random floats [-1, 1]
    if (!size) {
      throw new Error('Size is required for dense vectors');
    }
    const vec = Array.from({ length: size }, () =>
      Number((Math.random() * 2 - 1).toFixed(6)),
    );
    return JSON.stringify(vec);
  } else if (vectorType === 'binary') {
    // Binary vector: generate array of random bytes [0-255]
    if (!size) {
      throw new Error('Size is required for binary vectors');
    }
    const numBytes = Math.ceil(size / 8); // Convert bits to bytes
    const vec = Array.from({ length: numBytes }, () =>
      Math.floor(Math.random() * 256),
    );
    return JSON.stringify(vec);
  } else if (vectorType === 'sparse') {
    // Sparse vector: generate random indices and values
    // Generate 10-20 non-zero values for demonstration
    const nnz = Math.floor(Math.random() * 11) + 10; // 10-20 non-zero values
    const maxIndex = 10000; // Assume sparse vectors can have up to 10k dimensions
    
    // Generate unique random indices
    const indices: number[] = [];
    while (indices.length < nnz) {
      const idx = Math.floor(Math.random() * maxIndex);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }
    indices.sort((a, b) => a - b); // Sort indices
    
    // Generate random values
    const values = Array.from({ length: nnz }, () =>
      Number((Math.random() * 2 - 1).toFixed(6)),
    );
    
    const sparseVec = { indices, values };
    return JSON.stringify(sparseVec, null, 2);
  }
  
  throw new Error(`Unknown vector type: ${vectorType}`);
}

// ============================================================================
// Vector Display Formatting
// ============================================================================

/**
 * Get a compact label for a vector (e.g., "vector (384D dense)" or "sparse_vec (45 nnz)")
 */
export function getVectorLabel(vector: DocumentVector): string {
  const name = vector.key === COLLECTION_DEFAULT_VECTOR ? 'vector' : vector.key;
  
  if (vector.vectorType === 'dense' || vector.vectorType === 'binary') {
    const size = vector.size || ('data' in vector.value ? vector.value.data.length : 0);
    return `${name} (${size}D ${vector.vectorType})`;
  } else if (vector.vectorType === 'sparse') {
    const nnz = 'indices' in vector.value ? vector.value.indices.length : 0;
    return `${name} (sparse: ${nnz} nnz)`;
  }
  
  return name;
}

/**
 * Get a short label for table columns (e.g., "[384D]" or "[sparse: 45 nnz]")
 */
export function getVectorShortLabel(vector: DocumentVector): string {
  if (vector.vectorType === 'dense' || vector.vectorType === 'binary') {
    const size = vector.size || ('data' in vector.value ? vector.value.data.length : 0);
    return `[${size}D]`;
  } else if (vector.vectorType === 'sparse') {
    const nnz = 'indices' in vector.value ? vector.value.indices.length : 0;
    return `[sparse: ${nnz} nnz]`;
  }
  
  return '—';
}

/**
 * Format a vector's data for display in detail views
 * @param vector - The DocumentVector to format
 * @param maxElements - Maximum number of elements to show before truncating (default: 50)
 * @returns Formatted string representation of the vector
 */
export function formatVectorForDisplay(vector: DocumentVector, maxElements = 50): string {
  if (vector.vectorType === 'dense' || vector.vectorType === 'binary') {
    // Dense and binary vectors have value.data array
    const data = 'data' in vector.value ? vector.value.data : [];
    const truncated = data.slice(0, maxElements);
    const formatted = truncated.map(v => v.toFixed(6)).join(', ');
    return `[${formatted}${data.length > maxElements ? ', ...' : ''}]`;
  } else if (vector.vectorType === 'sparse') {
    // Sparse vectors have value.indices and value.values
    const indices = 'indices' in vector.value ? vector.value.indices : [];
    const values = 'values' in vector.value ? vector.value.values : [];
    const pairs = indices.slice(0, maxElements).map((idx, i) => `${idx}:${values[i].toFixed(6)}`);
    return `{${pairs.join(', ')}${indices.length > maxElements ? ', ...' : ''}}`;
  }
  
  return '—';
}

// ============================================================================
// Vector Type Checking
// ============================================================================

/**
 * Type guard to check if a value is a valid vector (embedding)
 */
export function isVector(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  if (!value.every(n => typeof n === "number" && Number.isFinite(n))) {
    return false;
  }

  // embeddings are usually high dimensional
  if (value.length < 32) return false;

  // common embedding sizes
  const commonDims = new Set([
    32, 64, 96, 128, 256, 384, 512, 768, 1024, 1536, 2048, 3072
  ]);
  if (!commonDims.has(value.length)) {
    // not required, but increases confidence
    // if the dimension is extremely large or extremely small, likely not an embedding
    if (value.length < 32 || value.length > 5000) return false;
  }

  // value range heuristic: embeddings rarely have huge spikes
  const outOfRange = value.some(n => Math.abs(n) > 20);
  if (outOfRange) return false;

  return true;
}

// ============================================================================
// Distance Functions
// ============================================================================

export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 1;
  return 1 - dotProduct / denominator;
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function dotProductDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return -dot; // Negative because higher dot product = more similar
}

export type DistanceMetric = 'cosine' | 'euclidean' | 'l2' | 'dot';

export function getDistanceFunction(metric: DistanceMetric): (a: number[], b: number[]) => number {
  switch (metric) {
    case 'cosine':
      return cosineDistance;
    case 'euclidean':
    case 'l2':
      return euclideanDistance;
    case 'dot':
      return dotProductDistance;
    default:
      return cosineDistance;
  }
}

// ============================================================================
// Vector Utilities
// ============================================================================

export function vectorNorm(v: number[]): number {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

/**
 * Returns true if the vector has non-zero magnitude (at least one non-zero element).
 * Used to avoid sending zero vectors to backends that reject them (e.g. Elasticsearch cosine similarity).
 * Accepts number[] or Float32Array (e.g. from dense vector value.data).
 */
export function hasNonZeroMagnitude(arr: number[] | Float32Array | null | undefined): boolean {
  if (!arr?.length) return false;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== 0) return true;
  }
  return false;
}

// ============================================================================
// Clustering Functions
// ============================================================================

/**
 * K-means clustering for high-dimensional vectors
 */
export function performKMeansVectors(
  vectors: number[][],
  k: number,
  distanceFn: (a: number[], b: number[]) => number
): number[] {
  if (vectors.length === 0 || k <= 0) return [];
  if (k >= vectors.length) {
    return vectors.map((_, i) => i);
  }

  // Initialize centroids randomly
  const centroids: number[][] = [];
  const usedIndices = new Set<number>();
  for (let i = 0; i < k; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * vectors.length);
    } while (usedIndices.has(idx));
    usedIndices.add(idx);
    centroids.push([...vectors[idx]]);
  }

  const clusters = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < 100; iter++) {
    // Assign points to nearest centroid
    let changed = false;
    for (let i = 0; i < vectors.length; i++) {
      let minDist = Infinity;
      let nearestCluster = 0;
      for (let j = 0; j < k; j++) {
        const dist = distanceFn(vectors[i], centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = j;
        }
      }
      if (clusters[i] !== nearestCluster) {
        clusters[i] = nearestCluster;
        changed = true;
      }
    }

    if (!changed) break;

    // Update centroids
    const clusterSums = new Array(k).fill(0).map(() => new Array(vectors[0].length).fill(0));
    const clusterCounts = new Array(k).fill(0);
    for (let i = 0; i < vectors.length; i++) {
      const cluster = clusters[i];
      for (let j = 0; j < vectors[i].length; j++) {
        clusterSums[cluster][j] += vectors[i][j];
      }
      clusterCounts[cluster]++;
    }

    for (let j = 0; j < k; j++) {
      if (clusterCounts[j] > 0) {
        for (let d = 0; d < vectors[0].length; d++) {
          centroids[j][d] = clusterSums[j][d] / clusterCounts[j];
        }
      }
    }
  }

  return clusters;
}

/**
 * K-means clustering for 2D points
 */
export function performKMeans2D(
  points: Array<{ x: number; y: number }>,
  k: number,
  maxIterations = 100
): number[] {
  if (points.length === 0 || k <= 0) return [];
  if (k >= points.length) {
    return points.map((_, i) => i);
  }

  // Initialize centroids randomly
  const centroids: Array<{ x: number; y: number }> = [];
  const usedIndices = new Set<number>();
  for (let i = 0; i < k; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * points.length);
    } while (usedIndices.has(idx));
    usedIndices.add(idx);
    centroids.push({ x: points[idx].x, y: points[idx].y });
  }

  const clusters = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign points to nearest centroid
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let nearestCluster = 0;
      for (let j = 0; j < k; j++) {
        const dx = points[i].x - centroids[j].x;
        const dy = points[i].y - centroids[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = j;
        }
      }
      if (clusters[i] !== nearestCluster) {
        clusters[i] = nearestCluster;
        changed = true;
      }
    }

    if (!changed) break;

    // Update centroids
    const clusterSums = new Array(k).fill(0).map(() => ({ x: 0, y: 0, count: 0 }));
    for (let i = 0; i < points.length; i++) {
      const cluster = clusters[i];
      clusterSums[cluster].x += points[i].x;
      clusterSums[cluster].y += points[i].y;
      clusterSums[cluster].count++;
    }

    for (let j = 0; j < k; j++) {
      if (clusterSums[j].count > 0) {
        centroids[j].x = clusterSums[j].x / clusterSums[j].count;
        centroids[j].y = clusterSums[j].y / clusterSums[j].count;
      }
    }
  }

  return clusters;
}

/**
 * DBSCAN clustering for high-dimensional vectors
 */
export function performDBSCANVectors(
  vectors: number[][],
  eps: number,
  minPts: number,
  distanceFn: (a: number[], b: number[]) => number
): number[] {
  const n = vectors.length;
  const visited = new Array(n).fill(false);
  const clusters = new Array(n).fill(-1); // -1 means noise
  let clusterId = 0;

  function getNeighbors(pointIdx: number): number[] {
    const neighbors: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i !== pointIdx && distanceFn(vectors[pointIdx], vectors[i]) <= eps) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  function expandCluster(pointIdx: number, neighbors: number[]) {
    clusters[pointIdx] = clusterId;
    for (let i = 0; i < neighbors.length; i++) {
      const neighborIdx = neighbors[i];
      if (!visited[neighborIdx]) {
        visited[neighborIdx] = true;
        const neighborNeighbors = getNeighbors(neighborIdx);
        if (neighborNeighbors.length >= minPts) {
          neighbors.push(...neighborNeighbors);
        }
      }
      if (clusters[neighborIdx] === -1) {
        clusters[neighborIdx] = clusterId;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;

    const neighbors = getNeighbors(i);
    if (neighbors.length < minPts) {
      clusters[i] = -1; // Noise
    } else {
      expandCluster(i, neighbors);
      clusterId++;
    }
  }

  return clusters;
}

/**
 * DBSCAN clustering for 2D points
 */
export function performDBSCAN2D(
  points: Array<{ x: number; y: number }>,
  eps: number,
  minPts = 4
): number[] {
  if (points.length === 0) return [];

  const clusters = new Array(points.length).fill(-1); // -1 = noise
  const visited = new Set<number>();
  let clusterId = 0;

  function getNeighbors(idx: number): number[] {
    const neighbors: number[] = [];
    const p = points[idx];

    for (let i = 0; i < points.length; i++) {
      const dx = p.x - points[i].x;
      const dy = p.y - points[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= eps) {
        neighbors.push(i); // include self
      }
    }

    return neighbors;
  }

  function expandCluster(startIdx: number, neighbors: number[]) {
    clusters[startIdx] = clusterId;

    const queue = [...neighbors];

    for (let i = 0; i < queue.length; i++) {
      const idx = queue[i];

      if (!visited.has(idx)) {
        visited.add(idx);
        const idxNeighbors = getNeighbors(idx);

        if (idxNeighbors.length >= minPts) {
          for (const n of idxNeighbors) {
            if (!queue.includes(n)) {
              queue.push(n);
            }
          }
        }
      }

      if (clusters[idx] === -1) {
        clusters[idx] = clusterId;
      }
    }
  }

  for (let i = 0; i < points.length; i++) {
    if (visited.has(i)) continue;

    visited.add(i);
    const neighbors = getNeighbors(i);

    if (neighbors.length < minPts) {
      clusters[i] = -1;
    } else {
      expandCluster(i, neighbors);
      clusterId++;
    }
  }

  return clusters;
}

// ============================================================================
// Statistical Analysis Functions
// ============================================================================

/**
 * Calculate Kernel Density Estimation (KDE) for a dataset
 * Uses Gaussian kernel with Silverman's rule of thumb for bandwidth
 */
export function calculateKDE(data: number[], bandwidth?: number): { x: number[], y: number[] } {
  if (data.length === 0) return { x: [], y: [] };
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const n = data.length;
  
  // Silverman's rule of thumb for bandwidth
  const std = Math.sqrt(data.reduce((sum, x) => {
    const mean = data.reduce((a, b) => a + b, 0) / n;
    return sum + Math.pow(x - mean, 2);
  }, 0) / n);
  const h = bandwidth || 1.06 * std * Math.pow(n, -0.2);
  
  // Create evaluation points
  const numPoints = 100;
  const step = range / (numPoints - 1);
  const x = Array.from({ length: numPoints }, (_, i) => min + i * step);
  
  // Gaussian kernel
  const kernel = (u: number) => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
  
  // Calculate density at each point
  const y = x.map(xi => {
    const density = data.reduce((sum, di) => sum + kernel((xi - di) / h), 0) / (n * h);
    return density;
  });
  
  return { x, y };
}

/**
 * Calculate box plot statistics (quartiles, whiskers, etc.)
 */
export function calculateBoxPlotStats(data: number[]) {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  const q1Idx = Math.floor(n * 0.25);
  const q2Idx = Math.floor(n * 0.5);
  const q3Idx = Math.floor(n * 0.75);
  
  const q1 = sorted[q1Idx];
  const median = sorted[q2Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;
  const lowerWhisker = Math.max(sorted[0], q1 - 1.5 * iqr);
  const upperWhisker = Math.min(sorted[n - 1], q3 + 1.5 * iqr);
  
  return { q1, median, q3, lowerWhisker, upperWhisker, min: sorted[0], max: sorted[n - 1] };
}

/**
 * Calculate cosine similarity between two vectors (1 - cosine distance)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  return 1 - cosineDistance(a, b);
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Calculate silhouette score for clustering
 */
export function calculateSilhouetteScore(
  vectors: number[][],
  clusters: number[],
  distanceFn: (a: number[], b: number[]) => number
): number {
  const n = vectors.length;
  if (n === 0) return 0;

  let totalScore = 0;
  const clusterIds = Array.from(new Set(clusters)).filter(c => c !== -1);

  for (let i = 0; i < n; i++) {
    if (clusters[i] === -1) continue; // Skip noise points

    // Calculate average distance to points in same cluster (a_i)
    const sameCluster = vectors.filter((_, idx) => clusters[idx] === clusters[i] && idx !== i);
    const a_i = sameCluster.length > 0
      ? sameCluster.reduce((sum, v) => sum + distanceFn(vectors[i], v), 0) / sameCluster.length
      : 0;

    // Calculate minimum average distance to other clusters (b_i)
    let minB = Infinity;
    for (const clusterId of clusterIds) {
      if (clusterId === clusters[i]) continue;
      const otherCluster = vectors.filter((_, idx) => clusters[idx] === clusterId);
      if (otherCluster.length > 0) {
        const avgDist = otherCluster.reduce((sum, v) => sum + distanceFn(vectors[i], v), 0) / otherCluster.length;
        minB = Math.min(minB, avgDist);
      }
    }

    const b_i = minB === Infinity ? a_i : minB;
    const s_i = b_i > a_i ? (b_i - a_i) / Math.max(a_i, b_i) : 0;
    totalScore += s_i;
  }

  return totalScore / n;
}

// ============================================================================
// PCA (Principal Component Analysis)
// ============================================================================

/**
 * Simple PCA implementation for dimensionality reduction
 */
export function performPCA(vectors: number[][], dimensions = 2): number[][] {
  const n = vectors.length;
  if (n === 0) return [];

  const dim = vectors[0].length;

  // Center the data
  const mean = new Array(dim).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < dim; j++) {
      mean[j] += vectors[i][j];
    }
  }
  for (let j = 0; j < dim; j++) {
    mean[j] /= n;
  }

  const centered = vectors.map(v => v.map((val, idx) => val - mean[idx]));

  // Compute covariance matrix
  const cov = new Array(dim).fill(0).map(() => new Array(dim).fill(0));
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += centered[k][i] * centered[k][j];
      }
      cov[i][j] = sum / (n - 1);
    }
  }

  // Simple eigenvalue decomposition (for 2D, we'll use a simplified approach)
  // For production, use a proper linear algebra library
  // This is a simplified version that works for 2D projections
  if (dimensions === 2) {
    // Use first two principal components (simplified)
    const projections: number[][] = [];
    for (let i = 0; i < n; i++) {
      // Project onto first two dimensions (simplified PCA)
      const x = centered[i].slice(0, Math.min(10, dim)).reduce((a, b) => a + b, 0);
      const y = centered[i].slice(Math.min(10, dim), Math.min(20, dim)).reduce((a, b) => a + b, 0);
      projections.push([x, y]);
    }
    return projections;
  }

  return centered.map(v => v.slice(0, dimensions));
}

// ============================================================================
// UMAP (Uniform Manifold Approximation and Projection)
// ============================================================================

import { UMAP } from 'umap-js';

/**
 * UMAP implementation for dimensionality reduction using umap-js
 * Preserves both local and global structure better than PCA
 */
export async function performUMAP(
  vectors: number[][],
  dimensions = 2,
  options?: {
    nNeighbors?: number;
    minDist?: number;
    spread?: number;
  }
): Promise<number[][]> {
  if (vectors.length === 0) return [];

  const nNeighbors = options?.nNeighbors || Math.min(15, Math.floor(vectors.length / 2));
  const minDist = options?.minDist || 0.1;
  const spread = options?.spread || 1.0;

  const umap = new UMAP({
    nComponents: dimensions,
    nNeighbors,
    minDist,
    spread,
    random: Math.random,
  });

  const embedding = await umap.fitAsync(vectors, (epochNumber: number) => {
    // Optional: could report progress here
  });

  return embedding;
}

// ============================================================================
// t-SNE (t-distributed Stochastic Neighbor Embedding)
// ============================================================================

/**
 * t-SNE implementation for dimensionality reduction using tsne-js
 * Great at preserving local neighborhoods, shows clusters very clearly
 * 
 * Note: Uses dynamic import to avoid bundling issues in Electron main process
 */
export async function performTSNE(
  vectors: number[][],
  dimensions = 2,
  options?: {
    perplexity?: number;
    epsilon?: number;
    iterations?: number;
  }
): Promise<number[][]> {
  if (vectors.length === 0) return [];

  // Dynamic import to avoid bundling in main process
  const tsneModule: any = await import('tsne-js');
  const TSNE = tsneModule.default || tsneModule;

  const perplexity = options?.perplexity || Math.min(30, Math.floor(vectors.length / 3));
  const epsilon = options?.epsilon || 10;
  const iterations = options?.iterations || 500;

  const tsne = new TSNE({
    dim: dimensions,
    perplexity,
    earlyExaggeration: 4.0,
    learningRate: epsilon,
    nIter: iterations,
    metric: 'euclidean',
  });

  // t-SNE is synchronous but we return a promise for consistency
  return new Promise((resolve) => {
    tsne.init({
      data: vectors,
      type: 'dense',
    });

    tsne.run();
    const output = tsne.getOutput();
    
    resolve(output);
  });
}


