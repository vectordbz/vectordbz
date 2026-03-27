import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Select,
  Button,
  Space,
  Card,
  Typography,
  Slider,
  Spin,
  message,
  Tag,
  Empty,
  Switch,
  InputNumber,
  Tooltip,
  Segmented,
} from 'antd';
import {
  SyncOutlined,
  CloseOutlined,
  DownOutlined,
  RightOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { Document, TabInfo, FilterQuery, CollectionSchema, COLLECTION_DEFAULT_VECTOR, DocumentVector, ProjectedPoint } from '../../types';
import FilterBuilder from '../FilterBuilder';
import { useTheme } from '../../contexts/ThemeContext';
import PlotlyScatterView from './PlotlyScatterView';
import {
  performPCA,
  performUMAP,
  performTSNE,
  performKMeansVectors,
  performDBSCANVectors,
  cosineDistance,
} from '../../services/vectorUtils';
import { getFirstImageUrl } from '../../services/documentUtils';
import { NavigationState } from '../CollectionTab';

const { Text } = Typography;

interface VisualizeTabProps {
  tab: TabInfo;
  collectionSchema: CollectionSchema;
  dataRequirements?: Record<string, string>;
  navigationState: NavigationState | null;
}

// Projection method configuration
type ProjectionMethod = 'pca' | 'umap' | 'tsne';

interface ProjectionParam {
  key: string;
  label: string;
  tooltip: string;
  min: number;
  max: number;
  step: number;
  default: number;
  width?: number;
}

interface ProjectionConfig {
  label: string;
  description: string;
  async: boolean;
  showProgress: boolean;
  params: ProjectionParam[];
  tooltipInfo: string;
  perform: (vectors: number[][], dimensions: number, params: Record<string, number>) => Promise<number[][]> | number[][];
}

const PROJECTION_CONFIGS: Record<ProjectionMethod, ProjectionConfig> = {
  pca: {
    label: 'PCA',
    description: 'Fast, linear projection',
    async: false,
    showProgress: false,
    params: [],
    tooltipInfo: 'Points that are close in the original space may appear far apart in this 2D projection because PCA reduces dimensions and loses information. The green lines show true neighbors from the vector database. Consider using UMAP or t-SNE for better cluster visualization.',
    perform: (vectors, dimensions) => Promise.resolve(performPCA(vectors, dimensions)),
  },
  umap: {
    label: 'UMAP',
    description: 'Preserves both local and global structure',
    async: true,
    showProgress: true,
    params: [
      {
        key: 'nNeighbors',
        label: 'N NEIGHBORS',
        tooltip: 'Number of neighbors to consider. Higher values preserve more global structure, lower values preserve more local structure.',
        min: 5,
        max: 50,
        step: 5,
        default: 15,
        width: 80,
      },
      {
        key: 'minDist',
        label: 'MIN DIST',
        tooltip: 'Minimum distance between points in the projection. Lower values create tighter clusters.',
        min: 0.0,
        max: 1.0,
        step: 0.05,
        default: 0.1,
        width: 80,
      },
    ],
    tooltipInfo: 'UMAP preserves neighborhood structure better than PCA. Points that are close in this 2D projection should also be close in the original high-dimensional space. Green lines show true neighbors from the vector database.',
    perform: (vectors, dimensions, params) =>
      performUMAP(vectors, dimensions, {
        nNeighbors: params.nNeighbors,
        minDist: params.minDist,
      }),
  },
  tsne: {
    label: 't-SNE',
    description: 'Great at revealing local cluster structure',
    async: true,
    showProgress: true,
    params: [
      {
        key: 'perplexity',
        label: 'PERPLEXITY',
        tooltip: 'Balance between local and global structure. Higher values consider more neighbors.',
        min: 5,
        max: 50,
        step: 5,
        default: 30,
        width: 80,
      },
      {
        key: 'epsilon',
        label: 'LEARNING RATE',
        tooltip: 'Learning rate for optimization. Higher values may converge faster but be less stable.',
        min: 1,
        max: 200,
        step: 10,
        default: 10,
        width: 80,
      },
      {
        key: 'iterations',
        label: 'ITERATIONS',
        tooltip: 'Number of optimization iterations. More iterations = better quality but slower.',
        min: 250,
        max: 1000,
        step: 250,
        default: 500,
        width: 80,
      },
    ],
    tooltipInfo: 't-SNE excels at revealing local cluster structure. Points that are close together form tight, well-separated clusters. However, distances between clusters are not meaningful. Green lines show true neighbors from the vector database.',
    perform: (vectors, dimensions, params) =>
      performTSNE(vectors, dimensions, {
        perplexity: params.perplexity,
        epsilon: params.epsilon,
        iterations: params.iterations,
      }),
  },
};

// Generate color palette for clusters
function generateClusterColors(numClusters: number): string[] {
  const colors: string[] = [];
  const hueStep = 360 / Math.max(numClusters, 1);
  for (let i = 0; i < numClusters; i++) {
    const hue = (i * hueStep) % 360;
    colors.push(`hsl(${hue}, 70%, 50%)`);
  }
  return colors;
}


const VisualizeTab: React.FC<VisualizeTabProps> = ({
  tab,
  collectionSchema,
  dataRequirements,
  navigationState,
}) => {
  const { mode } = useTheme();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectedPoints, setProjectedPoints] = useState<ProjectedPoint[]>([]);
  const [colorBy, setColorBy] = useState<string>('none');
  const [pointSize, setPointSize] = useState(10);
  const [selectedPoint, setSelectedPoint] = useState<ProjectedPoint | null>(null);
  const [nearestNeighbors, setNearestNeighbors] = useState<Array<{ point: ProjectedPoint; distance: number; similarity: number }>>([]);
  const [hoveredNeighbor, setHoveredNeighbor] = useState<ProjectedPoint | null>(null);
  const [showFullPayload, setShowFullPayload] = useState(false);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [filter, setFilter] = useState<FilterQuery | null>(null);
  const [sampleSize, setSampleSize] = useState(500);
  const [showClusterPreview, setShowClusterPreview] = useState(false);
  const [clusteringMethod, setClusteringMethod] = useState<'kmeans' | 'dbscan'>('kmeans');
  const [numClusters, setNumClusters] = useState(5);
  const [dbscanEps, setDbscanEps] = useState(0.3);
  const [dbscanMinPts, setDbscanMinPts] = useState(4);
  const [selectedVectorField, setSelectedVectorField] = useState<string | null>(Object.keys(collectionSchema.vectors)?.[0] || null);
  const [clusteringLoading, setClusteringLoading] = useState(false);
  const [projectionMethod, setProjectionMethod] = useState<ProjectionMethod>('umap');
  const [viewMode, setViewMode] = useState<'scatter2d' | 'scatter3d'>('scatter3d');
  const projectionDimension = viewMode === 'scatter3d' ? 3 : 2;
  const [projectionParams, setProjectionParams] = useState<Record<string, number>>(() => {
    // Initialize with default values from config
    const params: Record<string, number> = {};
    Object.entries(PROJECTION_CONFIGS).forEach(([method, config]) => {
      config.params.forEach(param => {
        params[`${method}_${param.key}`] = param.default;
      });
    });
    return params;
  });

  const projectionCache = useRef<Map<string, ProjectedPoint[]>>(new Map());
  const isInitialMount = useRef(true);
  const lastNavigationStateRef = useRef<string | null>(null);

  // Helper function to convert sparse vector to dense format (for visualization)
  // Note: This is a pragmatic approach. Sparse vectors are converted to dense format
  // because PCA/UMAP/t-SNE require dense vectors. The dimension is computed from
  // all loaded documents to ensure consistency. For very high-dimensional sparse vectors,
  // consider using only non-zero dimensions or sparse-aware dimensionality reduction.
  const sparseToDense = (sparseVector: { indices: number[]; values: number[] }, maxDimension: number): number[] => {
    if (!sparseVector || !sparseVector.indices || !sparseVector.values || maxDimension <= 0) {
      return [];
    }

    const dense = new Array(maxDimension).fill(0);

    for (let i = 0; i < sparseVector.indices.length; i++) {
      const idx = sparseVector.indices[i];
      const val = sparseVector.values[i];
      if (idx >= 0 && idx < maxDimension) {
        dense[idx] = val;
      }
    }

    return dense;
  };

  // Compute the maximum dimension for sparse vectors from all documents
  const computeSparseMaxDimension = (documents: Document[], vectorKey: string): number => {
    let maxDim = 0;
    for (const doc of documents) {
      const vector = doc.vectors[vectorKey];
      if (vector && vector.vectorType === 'sparse' && 'indices' in vector.value) {
        const indices = vector.value.indices;
        if (indices && indices.length > 0) {
          const maxIdx = Math.max(...indices);
          maxDim = Math.max(maxDim, maxIdx + 1);
        }
      }
    }
    return maxDim;
  };

  // Helper function to get the vector for a document
  const getVectorForDocument = (document: Document, sparseMaxDimension = 0): number[] | null => {
    const vectorsLength = Object.keys(document.vectors).length;
    if (!document.vectors || vectorsLength === 0) {
      return null;
    }

    let vector;
    if (selectedVectorField && vectorsLength > 1) {
      vector = document.vectors[selectedVectorField];
    } else {
      vector = document.vectors[Object.keys(document.vectors)[0]];
    }

    if (!vector || !vector.value) {
      return null;
    }

    // Extract data array from DocumentVector format
    if (vector.vectorType === 'dense') {
      return 'data' in vector.value ? vector.value.data : null;
    } else if (vector.vectorType === 'binary') {
      // Binary vectors: normalize bytes (0-255) to [-1, 1] range for visualization
      if ('data' in vector.value && Array.isArray(vector.value.data)) {
        return vector.value.data.map(byte => (byte / 127.5) - 1);
      }
      return null;
    } else if (vector.vectorType === 'sparse') {
      // Convert sparse vector to dense format for visualization
      // Requires sparseMaxDimension to be computed from all documents first
      if ('indices' in vector.value && 'values' in vector.value) {
        if (sparseMaxDimension <= 0) {
          // Fallback: compute from this vector's max index (not ideal, but better than nothing)
          const indices = vector.value.indices;
          if (indices && indices.length > 0) {
            const fallbackDim = Math.max(...indices) + 1;
            return sparseToDense(vector.value, fallbackDim);
          }
          return null;
        }
        return sparseToDense(vector.value, sparseMaxDimension);
      }
      return null;
    }

    return null;
  };

  // Perform dimensionality reduction using configured method
  const performProjection = async (documentsToProject: Document[]) => {
    if (documentsToProject.length === 0) return;

    const config = PROJECTION_CONFIGS[projectionMethod];
    const progressKey = 'projection-progress';

    try {
      // Check cache (include dimension so 2D and 3D projections are cached separately)
      const vectorFieldKey = selectedVectorField || 'default';
      const currentParams = config.params.map(p => projectionParams[`${projectionMethod}_${p.key}`]).join('-');
      const cacheKey = `${projectionMethod}-${projectionDimension}-${currentParams}-${vectorFieldKey}-${documentsToProject.length}-${documentsToProject.map(i => i.primary.value).join(',')}`;

      if (projectionCache.current.has(cacheKey)) {
        const cachedPoints = projectionCache.current.get(cacheKey)!;
        setProjectedPoints(cachedPoints);
        return;
      }

      // Extract vectors and compute sparse dimension if needed
      const vectors: number[][] = [];
      const validDocs: Document[] = [];

      // First, determine if we're dealing with sparse vectors and compute max dimension
      let sparseMaxDimension = 0;
      const vectorField = selectedVectorField || Object.keys(documentsToProject[0]?.vectors || {})[0];
      if (vectorField) {
        const firstVector = documentsToProject[0]?.vectors[vectorField];
        if (firstVector?.vectorType === 'sparse') {
          sparseMaxDimension = computeSparseMaxDimension(documentsToProject, vectorField);
          if (sparseMaxDimension === 0) {
            message.error('Unable to determine sparse vector dimension');
            return;
          }
        }
      }

      for (const doc of documentsToProject) {
        const vector = getVectorForDocument(doc, sparseMaxDimension);
        if (vector) {
          vectors.push(vector);
          validDocs.push(doc);
        }
      }

      if (vectors.length === 0) {
        message.error('No vectors found for the selected vector field');
        return;
      }

      // Show progress message if configured
      if (config.showProgress) {
        message.loading({
          content: `Computing ${config.label} projection...`,
          key: progressKey,
          duration: 0
        });
      }

      // Gather parameters for this method
      const methodParams: Record<string, number> = {};
      config.params.forEach(param => {
        methodParams[param.key] = projectionParams[`${projectionMethod}_${param.key}`];
      });

      // Perform dimensionality reduction (2 or 3 dimensions based on view mode)
      const projections = await config.perform(vectors, projectionDimension, methodParams);

      if (config.showProgress) {
        message.destroy(progressKey);
      }

      const points: ProjectedPoint[] = [];
      let vectorIdx = 0;
      for (let docIdx = 0; docIdx < validDocs.length; docIdx++) {
        const doc = validDocs[docIdx];
        const vector = getVectorForDocument(doc, sparseMaxDimension);
        if (vector && vectorIdx < projections.length) {
          const proj = projections[vectorIdx];
          points.push({
            id: doc.primary.value.toString(),
            x: proj[0],
            y: proj[1],
            z: projectionDimension === 3 ? proj[2] : undefined,
            originalIndex: docIdx,
            document: doc,
          });
          vectorIdx++;
        }
      }

      projectionCache.current.set(cacheKey, points);
      setProjectedPoints(points);
    } catch (error) {
      console.error('Projection error:', error);
      message.error('Failed to perform dimensionality reduction');
      message.destroy(progressKey);
    }
  }

  const loadDocuments = async (): Promise<Document[]> => {
    let result: any;
    if (navigationState?.highlightDocument) {
      // Get the vector from the highlighted document in proper DocumentVector format
      const vectorsLength = Object.keys(navigationState.highlightDocument.vectors).length;
      if (vectorsLength === 0) {
        message.error('No vector found for the selected document');
        return [];
      }

      let vector: DocumentVector | undefined;
      const vectorField = selectedVectorField || navigationState.vectorField;
      if (vectorField && vectorsLength > 1) {
        vector = navigationState.highlightDocument.vectors[vectorField];
      } else {
        vector = navigationState.highlightDocument.vectors[Object.keys(navigationState.highlightDocument.vectors)[0]];
      }

      if (!vector) {
        message.error('No vector found for the selected document');
        return [];
      }

      // Use proper DocumentVector format for search
      const searchVectors: Record<string, DocumentVector> = {
        [vector.key]: vector,
      };

      result = await window.electronAPI.db.search(tab.connectionId, {
        collection: tab.collection.name,
        vectors: searchVectors,
        options: {
          limit: sampleSize,
          filter: filter || undefined,
          vectorKey: vector.key,
          dataRequirements,
        },
      });
    } else {
      result = await window.electronAPI.db.getDocuments(tab.connectionId, {
        collection: tab.collection.name,
        options: {
          limit: sampleSize,
          filter: filter || undefined,
          dataRequirements,
        },
      });
    }
    if (result.success && result.documents) {
      const loadedDocuments = result.documents;
      setDocuments(loadedDocuments);
      return loadedDocuments;
    } else {
      message.error(result.error || 'Failed to load documents');
      return [];
    }
  }

  // Handle load button click - loads and visualizes
  const handleLoad = async () => {
    setLoading(true);
    const loadedDocs = await loadDocuments();
    if (loadedDocs.length > 0) {
      await performProjection(loadedDocs);
    }
    // Wait for the projection to complete, timeout to handle double render issue
    setTimeout(() => {
      setLoading(false);
    }, 100);
  }

  // Auto re-project when vector field, projection method, params, or view dimension change (if documents are loaded)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (documents.length > 0) {
      setLoading(true);
      performProjection(documents).finally(() => {
        setLoading(false);
      });
    }
  }, [selectedVectorField, projectionMethod, projectionParams, projectionDimension]);

  const resetState = () => {
    setDocuments([]);
    setProjectedPoints([]);
    setSelectedPoint(null);
    setNearestNeighbors([]);
    setHoveredNeighbor(null);
  }

  // Handle navigation state - set vector field and trigger load if needed
  useEffect(() => {
    if (navigationState?.vectorField) {
      setSelectedVectorField(navigationState.vectorField);
    }
    if (navigationState?.highlightDocument) {
      // Create a unique key for this navigation state to avoid double-loading
      const navKey = `${navigationState.highlightDocument.primary.value}-${navigationState.vectorField || 'default'}`;
      if (lastNavigationStateRef.current !== navKey) {
        lastNavigationStateRef.current = navKey;
        resetState();
        // Trigger load after a short delay to ensure state is reset
        const timer = setTimeout(() => {
          handleLoad();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [navigationState?.highlightDocument?.primary.value, navigationState?.vectorField]);

  // Select highlighted document once projectedPoints are available
  useEffect(() => {
    if (navigationState?.highlightDocument && projectedPoints.length > 0) {
      const projectedPoint = projectedPoints.find(
        p => String(p.id) === String(navigationState.highlightDocument?.primary.value)
      );
      if (projectedPoint) {
        setSelectedPoint(projectedPoint);
        computeNearestNeighbors(projectedPoint);
      }
    }
  }, [projectedPoints, navigationState]);

  // Compute clusters on original high-dimensional vectors
  const pointClusters = useMemo(() => {
    if (!showClusterPreview || projectedPoints.length === 0) {
      return [];
    }

    setClusteringLoading(true);

    try {
      // Extract original high-dimensional vectors
      // First compute sparse max dimension if needed
      const vectorField = selectedVectorField || Object.keys(projectedPoints[0]?.document.vectors || {})[0];
      let sparseMaxDimension = 0;
      if (vectorField) {
        const firstVector = projectedPoints[0]?.document.vectors[vectorField];
        if (firstVector?.vectorType === 'sparse') {
          const allDocs = projectedPoints.map(p => p.document);
          sparseMaxDimension = computeSparseMaxDimension(allDocs, vectorField);
        }
      }

      const vectors: number[][] = [];
      for (const point of projectedPoints) {
        const vector = getVectorForDocument(point.document, sparseMaxDimension);
        if (vector) {
          vectors.push(vector);
        }
      }

      if (vectors.length === 0) {
        return [];
      }

      // Perform clustering on original high-dimensional vectors
      let clusters: number[];
      if (clusteringMethod === 'kmeans') {
        clusters = performKMeansVectors(vectors, numClusters, cosineDistance);
      } else {
        clusters = performDBSCANVectors(vectors, dbscanEps, dbscanMinPts, cosineDistance);
      }

      return clusters;
    } finally {
      // Use setTimeout to ensure UI updates after clustering completes
      setTimeout(() => setClusteringLoading(false), 100);
    }
  }, [showClusterPreview, projectedPoints, clusteringMethod, numClusters, dbscanEps, dbscanMinPts, selectedVectorField]);

  // Compute nearest neighbors using database search (original vector space, not 2D projection)
  const computeNearestNeighbors = async (point: ProjectedPoint) => {
    // Get the vector from the document in proper DocumentVector format
    const vectorsLength = Object.keys(point.document.vectors).length;
    if (vectorsLength === 0) {
      setNearestNeighbors([]);
      return;
    }

    let vector: DocumentVector | undefined;
    if (selectedVectorField && vectorsLength > 1) {
      vector = point.document.vectors[selectedVectorField];
    } else {
      vector = point.document.vectors[Object.keys(point.document.vectors)[0]];
    }

    if (!vector) {
      setNearestNeighbors([]);
      return;
    }

    try {
      // Use database search with proper DocumentVector format - this is accurate!
      const searchVectors: Record<string, DocumentVector> = {
        [vector.key]: vector,
      };

      const searchResult = await window.electronAPI.db.search(tab.connectionId, {
        collection: tab.collection.name,
        vectors: searchVectors,
        options: {
          limit: 11, // Get top 10 neighbors (excluding self)
          vectorKey: vector.key,
          dataRequirements,
        },
      });

      if (searchResult.success && searchResult.documents) {
        // Map search results to projected points
        const neighbors = searchResult.documents
          .slice(1) // Skip first (self)
          .map(doc => {
            // Find the corresponding projected point
            const projectedPoint = projectedPoints.find(
              p => String(p.document.primary.value) === String(doc.primary.value)
            );

            if (projectedPoint) {
              // Database returns similarity score (0-1, higher = more similar)
              const similarity = doc.score !== undefined ? doc.score : 0;
              const distance = 1 - similarity; // Convert similarity to distance

              return {
                point: projectedPoint,
                distance,
                similarity,
              };
            }
            return null;
          })
          .filter((n): n is NonNullable<typeof n> => n !== null)
          .slice(0, 5); // Take top 5

        setNearestNeighbors(neighbors);
      } else {
        setNearestNeighbors([]);
      }
    } catch (error) {
      console.error('Failed to compute nearest neighbors:', error);
      setNearestNeighbors([]);
    }
  };

  // Get color for a point
  const getPointColor = (point: ProjectedPoint, pointIndex: number): string => {
    if (showClusterPreview && pointClusters.length > 0 && pointClusters[pointIndex] !== undefined) {
      const clusterId = pointClusters[pointIndex];
      if (clusterId === -1) {
        return '#999999';
      }
      const uniqueClusterIds = Array.from(new Set(pointClusters.filter(c => c !== -1))).sort((a, b) => a - b);
      if (uniqueClusterIds.length > 0) {
        const clusterIndex = uniqueClusterIds.indexOf(clusterId);
        if (clusterIndex >= 0) {
          const colors = generateClusterColors(uniqueClusterIds.length);
          return colors[clusterIndex] || '#1890ff';
        }
        return '#1890ff';
      }
      return '#999999';
    }

    if (colorBy === 'none') {
      return '#1890ff';
    }

    const value = point.document.payload[colorBy];
    if (value === undefined || value === null) {
      return '#d9d9d9';
    }

    if (typeof value === 'number') {
      const min = Math.min(...documents.map(i => (i.payload[colorBy] as number) || 0));
      const max = Math.max(...documents.map(i => (i.payload[colorBy] as number) || 0));
      const normalized = (value - min) / (max - min || 1);
      const hue = (1 - normalized) * 240;
      return `hsl(${hue}, 70%, 50%)`;
    } else if (typeof value === 'boolean') {
      return value ? '#52c41a' : '#ff4d4f';
    } else {
      const hash = String(value).split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
      }, 0);
      const hue = Math.abs(hash) % 360;
      return `hsl(${hue}, 70%, 50%)`;
    }
  };

  const handleSelectPoint = async (point: ProjectedPoint) => {
    setSelectedPoint(point);
    await computeNearestNeighbors(point);
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: 16,
      gap: 12,
      background: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Compact Header Controls */}
      <Card
        size="small"
        style={{
          flexShrink: 0,
          border: '1px solid var(--border-color)',
          borderRadius: 8,
        }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* Sample Size */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>SAMPLE SIZE</Text>
            <Select
              value={sampleSize}
              onChange={setSampleSize}
              style={{ width: 140 }}
              size="small"
              options={[
                { label: '100', value: 100 },
                { label: '500', value: 500 },
                { label: '1K', value: 1000 },
                { label: '5K', value: 5000 },
                { label: '10K', value: 10000 },
              ]}
            />
          </div>

          {/* Filter */}
          <FilterBuilder
            schema={collectionSchema}
            onApply={(f) => {
              setFilter(f || null);
            }}
          />

          {/* View mode */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>VIEW</Text>
            <Segmented
              value={viewMode}
              onChange={(v) => v && setViewMode(v as 'scatter2d' | 'scatter3d')}
              size="small"
              options={[
                { label: 'Scatter 2D', value: 'scatter2d' },
                { label: 'Scatter 3D', value: 'scatter3d' },
              ]}
            />
          </div>

          {/* Actions */}
          <Button
            icon={<SyncOutlined />}
            onClick={handleLoad}
            loading={loading}
            size="small"
            type="primary"
          >
            Load
          </Button>
        </div>

        {/* Advanced Controls Panel */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Vector Field Selector */}
            {collectionSchema?.multipleVectors && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>VECTOR FIELD</Text>
                <Select
                  value={selectedVectorField}
                  onChange={setSelectedVectorField}
                  style={{ width: 180 }}
                  size="small"
                  options={Object.values(collectionSchema.vectors).map(field => {
                    if (field.vectorType === 'sparse') {
                      return {
                        label: `${field.name} (sparse)`,
                        value: field.name,
                      };
                    } else if (field.vectorType === 'binary') {
                      return {
                        label: `${field.name} (binary, ${field.size} bits)`,
                        value: field.name,
                      };
                    } else {
                      // Dense vector
                      return {
                        label: `${field.name} (${field.size}D)`,
                        value: field.name,
                      };
                    }
                  })}
                />
              </div>
            )}

            {/* Projection Method Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                PROJECTION METHOD
                <Tooltip title={Object.entries(PROJECTION_CONFIGS).map(([k, v]) => `${v.label}: ${v.description}`).join('. ')}>
                  <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }} />
                </Tooltip>
              </Text>
              <Select
                value={projectionMethod}
                onChange={setProjectionMethod}
                style={{ width: 120 }}
                size="small"
                options={Object.entries(PROJECTION_CONFIGS).map(([key, config]) => ({
                  label: config.label,
                  value: key,
                }))}
              />
            </div>

            {/* Dynamic Method Parameters */}
            {PROJECTION_CONFIGS[projectionMethod].params.map(param => (
              <div key={param.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                  {param.label}
                  <Tooltip title={param.tooltip}>
                    <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }} />
                  </Tooltip>
                </Text>
                <InputNumber
                  value={projectionParams[`${projectionMethod}_${param.key}`]}
                  onChange={(v) => v !== null && setProjectionParams(prev => ({
                    ...prev,
                    [`${projectionMethod}_${param.key}`]: v,
                  }))}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  size="small"
                  style={{ width: param.width || 80 }}
                />
              </div>
            ))}

            {/* Color By */}
            {Object.keys(collectionSchema.fields).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>COLOR BY
                  <Tooltip title="Disabled when cluster preview is shown">
                    <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }} />
                  </Tooltip>
                </Text>
                <Select
                  value={colorBy}
                  onChange={setColorBy}
                  disabled={showClusterPreview}
                  style={{ width: 140 }}
                  size="small"
                  options={[
                    { label: 'None', value: 'none' },
                    ...Object.values(collectionSchema.fields).map(field => ({ label: field.name, value: field.name })),
                  ]}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>POINT SIZE</Text>
              <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
                <Slider
                  min={2}
                  max={20}
                  value={pointSize}
                  onChange={setPointSize}
                  style={{ margin: 0, flex: 1 }}
                />
              </div>
            </div>

            {/* Clustering */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                CLUSTERING (HD)
                <Tooltip title="Clustering is performed on original high-dimensional vectors, not the 2D projection. This provides semantically meaningful clusters.">
                  <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }} />
                </Tooltip>
              </Text>
              <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch
                  checked={showClusterPreview}
                  onChange={setShowClusterPreview}
                  size="small"
                  loading={clusteringLoading}
                />
                {clusteringLoading && <Text type="secondary" style={{ fontSize: 10 }}>Computing...</Text>}
              </div>
            </div>

            {showClusterPreview && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>METHOD</Text>
                  <Select
                    value={clusteringMethod}
                    onChange={setClusteringMethod}
                    style={{ width: 100 }}
                    size="small"
                    options={[
                      { label: 'K-means', value: 'kmeans' },
                      { label: 'DBSCAN', value: 'dbscan' },
                    ]}
                  />
                </div>
                {clusteringMethod === 'kmeans' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>CLUSTERS</Text>
                    <InputNumber
                      value={numClusters}
                      onChange={(v) => v && setNumClusters(v)}
                      min={2}
                      max={20}
                      size="small"
                      style={{ width: 80 }}
                    />
                  </div>
                )}
                {clusteringMethod === 'dbscan' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                        EPS
                        <Tooltip title="Maximum distance for points to be considered neighbors (cosine distance)">
                          <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }} />
                        </Tooltip>
                      </Text>
                      <InputNumber
                        value={dbscanEps}
                        onChange={(v) => v && setDbscanEps(v)}
                        min={0.01}
                        max={2}
                        step={0.05}
                        size="small"
                        style={{ width: 90 }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                        MIN PTS
                        <Tooltip title="Minimum points required to form a cluster">
                          <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }} />
                        </Tooltip>
                      </Text>
                      <InputNumber
                        value={dbscanMinPts}
                        onChange={(v) => v && setDbscanMinPts(v)}
                        min={2}
                        max={20}
                        step={1}
                        size="small"
                        style={{ width: 80 }}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Chart Area */}
      <div style={{
        flex: '1 1 auto',
        display: 'flex',
        gap: 12,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Text strong style={{ fontSize: 14 }}>
                {viewMode === 'scatter2d' && `${PROJECTION_CONFIGS[projectionMethod].label} (2D)`}
                {viewMode === 'scatter3d' && `${PROJECTION_CONFIGS[projectionMethod].label} (3D)`}
              </Text>
              <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                {projectedPoints.length} points
              </Tag>
              <Tooltip
                title={
                  <div style={{ maxWidth: 300 }}>
                    <Text style={{ fontSize: 12, color: 'white', display: 'block', marginBottom: 8 }}>
                      <strong>Important:</strong> Nearest neighbors are computed in the original high-dimensional space (e.g., 1536D).
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', display: 'block' }}>
                      {PROJECTION_CONFIGS[projectionMethod].tooltipInfo}
                    </Text>
                  </div>
                }
                placement="bottom"
              >
                <InfoCircleOutlined style={{ fontSize: 14, color: 'var(--text-muted)', cursor: 'help' }} />
              </Tooltip>
            </div>
          }
          style={{
            flex: '1 1 0%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
          bodyStyle={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            padding: 16,
            background: mode === 'dark' ? '#16161e' : '#ffffff',
            overflow: 'hidden',
          }}
        >
          <div style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            height: '100%',
            position: 'relative',
          }}>
            {loading ? (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}>
                <Spin size="large" tip="Loading..." />
              </div>
            ) : projectedPoints.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}>
                <Empty description="No data to visualize" />
              </div>
            ) : (
              <PlotlyScatterView
                projectedPoints={projectedPoints}
                dimension={viewMode === 'scatter3d' ? 3 : 2}
                selectedPoint={selectedPoint}
                nearestNeighbors={nearestNeighbors}
                getPointColor={getPointColor}
                pointSize={pointSize}
                onSelectPoint={handleSelectPoint}
                theme={mode}
              />
            )}
          </div>
        </Card>

        {/* Selected Point Details Panel */}
        {selectedPoint && (
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: 13 }}>Details</Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setSelectedPoint(null);
                    setNearestNeighbors([]);
                  }}
                />
              </div>
            }
            style={{
              width: 320,
              flexShrink: 0,
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              alignSelf: 'flex-start',
              display: 'flex',
              flexDirection: 'column',
            }}
            bodyStyle={{
              flex: 1,
              padding: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: 16,
            }}>
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {/* Image */}
                {(() => {
                  const payload = selectedPoint.document.payload;
                  const imageUrl = getFirstImageUrl(payload);

                  if (imageUrl) {
                    return (
                      <div style={{
                        marginBottom: 12,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        <img
                          src={imageUrl}
                          alt="Point image"
                          style={{
                            maxWidth: '100%',
                            maxHeight: 120,
                            height: 'auto',
                            objectFit: 'contain',
                            borderRadius: 8,
                            cursor: 'pointer',
                            border: '1px solid var(--border-color)',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
                            transition: 'all 0.2s ease',
                          }}
                          onClick={() => window.open(imageUrl, '_blank')}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.12)';
                            e.currentTarget.style.transform = 'scale(1.02)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.08)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Document ID */}
                <div>
                  <Text code style={{ fontSize: 12 }}>{selectedPoint.document.primary.value}</Text>
                  {Object.keys(selectedPoint.document.vectors).length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {Object.values(selectedPoint.document.vectors).map((v, idx) => {
                        let label = v.key === COLLECTION_DEFAULT_VECTOR ? 'vector' : v.key;
                        if (v.vectorType === 'dense' || v.vectorType === 'binary') {
                          const size = v.vectorType === 'dense' ? v.size : (v.size ? `${v.size} bits` : 'binary');
                          label += ` (${size})`;
                        } else if (v.vectorType === 'sparse') {
                          const nnz = 'indices' in v.value ? v.value.indices.length : 0;
                          label += ` (sparse: ${nnz} nnz)`;
                        }
                        return (
                          <Tag key={idx} style={{ marginTop: 2, fontSize: 10 }}>
                            {label}
                          </Tag>
                        );
                      })}
                    </div>
                  )}
                </div>


                {/* Payload */}
                <div>
                  <div
                    onClick={() => setShowFullPayload(!showFullPayload)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      padding: '4px 0',
                      userSelect: 'none',
                    }}
                  >
                    {showFullPayload ? (
                      <DownOutlined style={{ fontSize: 10, color: 'var(--text-secondary)' }} />
                    ) : (
                      <RightOutlined style={{ fontSize: 10, color: 'var(--text-secondary)' }} />
                    )}
                    <Text style={{ fontSize: 12 }}>Payload</Text>
                  </div>
                  {showFullPayload && (
                    <pre style={{
                      background: 'var(--bg-secondary)',
                      padding: 10,
                      borderRadius: 6,
                      fontSize: 10,
                      overflow: 'auto',
                      marginTop: 8,
                      maxHeight: 300,
                    }}>
                      {JSON.stringify(selectedPoint.document.payload, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Nearest Neighbors */}
                {nearestNeighbors.length > 0 && (
                  <div>
                    <div
                      onClick={() => setShowNeighbors(!showNeighbors)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        padding: '4px 0',
                        userSelect: 'none',
                      }}
                    >
                      {showNeighbors ? (
                        <DownOutlined style={{ fontSize: 10, color: 'var(--text-secondary)' }} />
                      ) : (
                        <RightOutlined style={{ fontSize: 10, color: 'var(--text-secondary)' }} />
                      )}
                      <Text style={{ fontSize: 12 }}>Nearest Neighbors (HD Space)</Text>
                      <Tooltip
                        title="Computed in original high-dimensional vector space, not 2D projection. Green lines show connections."
                        placement="right"
                      >
                        <InfoCircleOutlined style={{ fontSize: 10, color: 'var(--text-muted)' }} />
                      </Tooltip>
                    </div>
                    {showNeighbors && (
                      <div
                        style={{
                          background: 'var(--bg-secondary)',
                          padding: 10,
                          borderRadius: 6,
                          marginTop: 8,
                          maxHeight: 200,
                          overflow: 'auto',
                          fontFamily: 'monospace',
                          fontSize: 10,
                          lineHeight: 1.6,
                        }}
                      >
                        <pre style={{ margin: 0 }}>
                          {'{\n'}
                          {nearestNeighbors.map((neighbor, idx) => {
                            const primaryValue = String(neighbor.point.document.primary.value);
                            const isHovered = hoveredNeighbor?.id === neighbor.point.id;
                            return (
                              <div
                                key={neighbor.point.id}
                                onClick={async () => {
                                  setSelectedPoint(neighbor.point);
                                  await computeNearestNeighbors(neighbor.point);
                                }}
                                onMouseEnter={() => {
                                  setHoveredNeighbor(neighbor.point);
                                }}
                                onMouseLeave={() => {
                                  setHoveredNeighbor(null);
                                }}
                                style={{
                                  padding: '2px 4px',
                                  margin: '-2px -4px',
                                  borderRadius: 3,
                                  background: isHovered ? 'rgba(255, 77, 79, 0.15)' : 'transparent',
                                  color: isHovered ? '#ff4d4f' : 'inherit',
                                  transition: 'all 0.15s',
                                  cursor: 'pointer',
                                  fontWeight: isHovered ? 600 : 'normal',
                                }}
                              >
                                {`  ${JSON.stringify(primaryValue)}: ${neighbor.similarity.toFixed(4)}${idx < nearestNeighbors.length - 1 ? ',' : ''}`}
                              </div>
                            );
                          })}
                          {'\n}'}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Space>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VisualizeTab;
