import React, { useState, useEffect } from 'react';
import {
  Table,
  Typography,
  Button,
  Input,
  Tooltip,
  InputNumber,
  message,
  Select,
  Card,
  Upload,
  Radio,
  Collapse,
  Space,
  Tag,
  Popover,
  List,
} from 'antd';
import {
  SearchOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  FileOutlined,
  UploadOutlined,
  ApiOutlined,
  SettingOutlined,
  PlusOutlined,
  EditOutlined,
  InfoCircleOutlined,
  EyeOutlined,
  DotChartOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DiffOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { TabInfo, Document, CollectionSchema, FilterQuery, SearchMetadata, COLLECTION_DEFAULT_VECTOR, DocumentVector, SearchCapabilities } from '../types';
import DocumentDetailDrawer from './DocumentDetailDrawer';
import { generateDocumentDynamicTableColumns } from '../services/uiUtils';
import { generateRandomVector as generateRandomVectorUtil } from '../services/vectorUtils';
import { EmbeddingFunction, embeddingStore, executeEmbedding } from '../services/embeddingService';
import EmbeddingConfigModal from './EmbeddingConfigModal';
import FilterBuilder from './FilterBuilder';
import SearchStatistics from './SearchStatistics';
import { computeSearchStatistics } from '../services/searchStatistics';
import ContextMenu from './ContextMenu';
import { NavigationState } from './CollectionTab';
import SearchComparisonModal from './SearchComparisonModal';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { Panel } = Collapse;

interface SearchTabProps {
  tab: TabInfo;
  collectionSchema: CollectionSchema;
  dataRequirements?: Record<string, string>;
  navigationState?: NavigationState | null;
  onNavigateToVisualize?: (document: Document, vectorField?: string) => void;
}

type InputMode = 'text' | 'file';

interface SearchHistoryItem {
  id: string;
  timestamp: number;
  vector: number[] | { indices: number[]; values: number[] }; // Support both dense and sparse
  vectorType: 'dense' | 'sparse' | 'binary';
  vectorField: string | null;
  topK: number;
  scoreThreshold: number | undefined;
  filter: FilterQuery | undefined;
  documents: Document[];
  metadata: SearchMetadata | null;
  lexicalQuery?: string;
  hybridAlpha?: number;
}

const SearchTab: React.FC<SearchTabProps> = ({ tab, collectionSchema, dataRequirements, navigationState, onNavigateToVisualize }) => {
  // Search state
  const [searchInput, setSearchInput] = useState<string>('');
  const [topK, setTopK] = useState<number>(10);
  const [scoreThreshold, setScoreThreshold] = useState<number | undefined>(undefined);
  const [selectedVectorField, setSelectedVectorField] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterQuery | undefined>(undefined);
  const [searchMetadata, setSearchMetadata] = useState<SearchMetadata | null>(null);
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; document: Document } | null>(null);
  // Search history state
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [comparisonModalOpen, setComparisonModalOpen] = useState<boolean>(false);
  const [comparisonItem, setComparisonItem] = useState<SearchHistoryItem | null>(null);

  // Input mode and embedding state
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [embeddingText, setEmbeddingText] = useState<string>('');
  const [embeddingFile, setEmbeddingFile] = useState<File | null>(null);
  const [selectedEmbeddingFunction, setSelectedEmbeddingFunction] = useState<string | null>(null);
  const [embeddingFunctions, setEmbeddingFunctions] = useState<EmbeddingFunction[]>([]);
  const [embeddingLoading, setEmbeddingLoading] = useState<boolean>(false);
  const [embeddingModalOpen, setEmbeddingModalOpen] = useState<boolean>(false);
  const [editingEmbeddingFunction, setEditingEmbeddingFunction] = useState<EmbeddingFunction | null>(null);

  // Search capabilities (lexical/BM25, hybrid alpha) – from backend
  const [searchCapabilities, setSearchCapabilities] = useState<SearchCapabilities | null>(null);
  const [lexicalQuery, setLexicalQuery] = useState<string>('');
  const [hybridAlpha, setHybridAlpha] = useState<number>(0.75);

  useEffect(() => {
    const firstVectorKey = Object.keys(collectionSchema.vectors)[0];
    if (firstVectorKey && !selectedVectorField) {
      setSelectedVectorField(firstVectorKey);
    }
  }, [collectionSchema.vectors, selectedVectorField]);

  // Fetch search capabilities when tab or collection changes
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.db
      .getSearchCapabilities(tab.connectionId, tab.collection.name, collectionSchema)
      .then((res) => {
        if (!cancelled && res.success && res.capabilities) {
          setSearchCapabilities(res.capabilities);
          if (res.capabilities.supportsHybridAlpha && res.capabilities.hybridAlphaDefault != null) {
            setHybridAlpha(res.capabilities.hybridAlphaDefault);
          }
        } else if (!cancelled) {
          setSearchCapabilities(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSearchCapabilities(null);
      });
    return () => { cancelled = true; };
  }, [tab.connectionId, tab.collection.name, collectionSchema]);

  // Load embedding functions
  useEffect(() => {
    const functions = embeddingStore.getAll();
    setEmbeddingFunctions(functions);

    // Auto-select first function if available and none selected
    if (!selectedEmbeddingFunction && functions.length > 0) {
      setSelectedEmbeddingFunction(functions[0].id);
    }
  }, []);

  // Load search history from localStorage
  useEffect(() => {
    const storageKey = `search_history_${tab.connectionId}_${tab.collection.name}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const history = JSON.parse(stored);
        setSearchHistory(history.slice(0, 10)); // Keep only last 10
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }, [tab.connectionId, tab.collection.name]);

  // Save search history to localStorage
  const saveSearchHistory = (item: SearchHistoryItem) => {
    const storageKey = `search_history_${tab.connectionId}_${tab.collection.name}`;
    try {
      const newHistory = [item, ...searchHistory.filter(h => h.id !== item.id)].slice(0, 10);
      setSearchHistory(newHistory);
      localStorage.setItem(storageKey, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  };

  const clearSearchHistory = () => {
    const storageKey = `search_history_${tab.connectionId}_${tab.collection.name}`;
    setSearchHistory([]);
    localStorage.removeItem(storageKey);
  };

  const restoreSearchFromHistory = (item: SearchHistoryItem) => {
    setSearchInput(JSON.stringify(item.vector));
    setSelectedVectorField(item.vectorField);
    setTopK(item.topK);
    setScoreThreshold(item.scoreThreshold);
    setActiveFilter(item.filter);
    setLexicalQuery(item.lexicalQuery ?? '');
    setHybridAlpha(item.hybridAlpha ?? 0.75);
    setDocuments(item.documents);
    setSearchMetadata(item.metadata);
    message.success('Search restored from history');
  };

  // Reload functions when modal closes (in case of save/delete)
  const handleEmbeddingModalClose = () => {
    setEmbeddingModalOpen(false);
    setEditingEmbeddingFunction(null);
    const functions = embeddingStore.getAll();
    setEmbeddingFunctions(functions);
  };

  const handleSaveEmbeddingFunction = (func: EmbeddingFunction) => {
    embeddingStore.save(func);
    handleEmbeddingModalClose();
  };

  const handleEditEmbeddingFunction = () => {
    if (selectedEmbeddingFunction) {
      const func = embeddingStore.getById(selectedEmbeddingFunction);
      if (func) {
        setEditingEmbeddingFunction(func);
        setEmbeddingModalOpen(true);
      }
    }
  };

  const handleEmbed = async () => {
    if (!selectedEmbeddingFunction) {
      message.error('Please select an embedding function');
      return;
    }

    if (inputMode === 'text' && !embeddingText.trim()) {
      message.warning('Enter text to embed');
      return;
    }
    if (inputMode === 'file' && !embeddingFile) {
      message.warning('Upload a file to embed');
      return;
    }

    const embeddingFunc = embeddingStore.getById(selectedEmbeddingFunction);
    if (!embeddingFunc) {
      message.error('Embedding function not found');
      return;
    }

    setEmbeddingLoading(true);
    try {
      const result = await executeEmbedding(embeddingFunc.code, {
        text: inputMode === 'text' ? embeddingText : undefined,
        file: inputMode === 'file' ? (embeddingFile || undefined) : undefined,
        fetch: fetch,
        FormData: FormData,
      });

      if (!result.success || !result.vector) {
        message.error(result.error || 'Failed to generate embedding');
        setEmbeddingLoading(false);
        return;
      }

      // Copy result to vector field
      setSearchInput(JSON.stringify(result.vector));
      message.success(`Embedding generated! Vector copied to search field (${result.vector.length}D)`);
      setEmbeddingLoading(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to generate embedding');
      setEmbeddingLoading(false);
    }
  };

  const performSearch = async (vectorData: DocumentVector | null, vectorField?: string | null) => {
    const lexicalOnly = vectorData === null;
    console.log('[SearchTab] performSearch called', {
      lexicalOnly,
      vectorType: vectorData?.vectorType,
      vectorField,
      vectorDataKey: vectorData?.key,
    });

    setLoading(true);
    setDocuments([]);
    setSearchMetadata(null);

    try {
      const availableVectorFields = Object.keys(collectionSchema.vectors);
      if (availableVectorFields.length === 0) {
        console.error('[SearchTab] No vector fields available');
        message.error('No vector fields available in collection');
        setLoading(false);
        return;
      }

      let vectors: Record<string, DocumentVector>;
      let targetField: string | undefined;

      if (lexicalOnly) {
        // Keyword-only: pass empty vectors so backends don't receive a zero vector (e.g. Elasticsearch cosine rejects zero magnitude)
        vectors = {};
        targetField = undefined;
        console.log('[SearchTab] Lexical-only search, vectors: {}');
      } else {
        targetField = vectorField ?? (vectorData!.key && availableVectorFields.includes(vectorData!.key) ? vectorData!.key : undefined);
        if (!targetField) {
          targetField = selectedVectorField || availableVectorFields[0] || COLLECTION_DEFAULT_VECTOR;
        }
        const finalVectorData: DocumentVector = { ...vectorData!, key: targetField };
        vectors = { [targetField]: finalVectorData };
        if (!collectionSchema.vectors[targetField]) {
          message.error(`Vector field "${targetField}" not found in collection schema`);
          setLoading(false);
          return;
        }
        console.log('[SearchTab] Final vectors object:', {
          vectorKey: targetField,
          vectorType: finalVectorData.vectorType,
          vectorSize: finalVectorData.vectorType === 'dense' && 'data' in finalVectorData.value ? finalVectorData.value.data.length : 'N/A',
        });
      }

      // Build search options
      const searchOptions: any = {
        limit: topK,
        scoreThreshold: scoreThreshold,
        vectorKey: targetField !== undefined && targetField !== COLLECTION_DEFAULT_VECTOR ? targetField : undefined,
        dataRequirements,
        filter: activeFilter,
      };
      if (searchCapabilities?.lexical && lexicalQuery.trim()) {
        searchOptions.lexicalQuery = lexicalQuery.trim();
      }
      if (searchCapabilities?.supportsHybridAlpha) {
        searchOptions.hybridAlpha = hybridAlpha;
      }

      console.log('[SearchTab] Calling search API:', {
        collection: tab.collection.name,
        vectorKeys: Object.keys(vectors),
        options: searchOptions,
      });

      const result = await window.electronAPI.db.search(tab.connectionId, {
        collection: tab.collection.name,
        vectors,
        options: searchOptions,
      });

      console.log('[SearchTab] Search result:', { success: result.success, error: result.error, documentCount: result.documents?.length });

      if (result.success && result.documents !== undefined) {
        console.log('[SearchTab] Search successful, got', result.documents.length, 'documents');
        setDocuments(result.documents);

        // Show info message if no results found
        if (result.documents.length === 0) {
          message.info('No results found. The search vector may not match any documents in the collection.');
        }

        // Extract vector for statistics (dense vector only for now)
        let vectorForStats: number[] = [];
        if (vectorData?.vectorType === 'dense' && vectorData?.value && 'data' in vectorData.value) {
          vectorForStats = vectorData.value.data;
        } else if (vectorData?.vectorType === 'binary' && vectorData?.value && 'data' in vectorData.value) {
          vectorForStats = vectorData.value.data;
        }

        // Compute statistics using metadata from the service
        const metadata = computeSearchStatistics(
          result.documents,
          vectorForStats,
          topK,
          activeFilter,
          result.metadata?.searchTimeMs
        );

        // Merge with any backend-specific metadata from result
        if (result.metadata) {
          Object.assign(metadata, result.metadata);
        }

        setSearchMetadata(metadata);

        // Save to search history
        const historyItem: SearchHistoryItem = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          vector: vectorData == null
            ? []
            : vectorData.vectorType === 'sparse' && 'indices' in vectorData.value && 'values' in vectorData.value
              ? { indices: vectorData.value.indices, values: vectorData.value.values }
              : ('data' in vectorData.value ? vectorData.value.data : []),
          vectorType: vectorData?.vectorType ?? 'dense',
          vectorField: targetField ?? null,
          topK,
          scoreThreshold,
          filter: activeFilter,
          documents: result.documents,
          metadata,
          lexicalQuery: lexicalQuery?.trim() || undefined,
          hybridAlpha,
        };
        saveSearchHistory(historyItem);
      } else {
        console.error('[SearchTab] Search failed:', result.error);
        message.error(result.error || 'Search failed');
      }
    } catch (error) {
      console.error('[SearchTab] Exception in performSearch:', error);
      message.error(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    console.log('[SearchTab] handleSearch called', { searchInput: searchInput.substring(0, 50), selectedVectorField });

    const vectorField = selectedVectorField || Object.keys(collectionSchema.vectors)[0];
    if (!vectorField) {
      message.error('No vector field selected');
      return;
    }

    const fieldSchema = collectionSchema.vectors[vectorField];
    if (!fieldSchema) {
      message.error('Vector field not found in schema');
      return;
    }

    // Lexical-only: server supports hybrid and user entered keywords but no vector. Pass empty vectors so backends (e.g. Elasticsearch) don't receive a zero-magnitude vector.
    const lexicalOnly = searchCapabilities?.lexical && lexicalQuery.trim() && !searchInput.trim();
    if (lexicalOnly) {
      await performSearch(null, null);
      return;
    }

    if (!searchInput.trim()) {
      message.warning('Enter a vector to search, or use keywords when the server supports hybrid search.');
      return;
    }

    try {
      const cleanedText = searchInput.trim();
      let vectorData: DocumentVector;

      // Check if it's a sparse vector (JSON object with indices and values)
      if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
        const parsed = JSON.parse(cleanedText);
        if (parsed.indices && parsed.values && Array.isArray(parsed.indices) && Array.isArray(parsed.values)) {
          if (fieldSchema.vectorType !== 'sparse') {
            message.error('Sparse vector format detected but selected field is not sparse');
            return;
          }
          if (parsed.indices.length !== parsed.values.length) {
            message.error('Sparse vector indices and values must have the same length');
            return;
          }
          vectorData = {
            key: vectorField,
            vectorType: 'sparse',
            value: {
              indices: parsed.indices,
              values: parsed.values,
            },
          };
        } else {
          message.error('Invalid sparse vector format. Expected {indices: [], values: []}');
          return;
        }
      } else {
        // Parse as dense or binary vector
        let vector: number[];
        if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
          vector = JSON.parse(cleanedText);
        } else {
          vector = cleanedText.split(/[,\s]+/).filter(Boolean).map(Number);
        }

        if (vector.some(isNaN)) {
          message.error('Invalid search vector');
          return;
        }

        if (fieldSchema.vectorType === 'binary') {
          vectorData = {
            key: vectorField,
            vectorType: 'binary',
            size: fieldSchema.size,
            value: {
              data: vector,
            },
          };
        } else {
          // Dense vector
          vectorData = {
            key: vectorField,
            vectorType: 'dense',
            size: vector.length,
            value: {
              data: vector,
            },
          };
        }
      }

      console.log('[SearchTab] Calling performSearch with:', {
        vectorType: vectorData.vectorType,
        vectorField,
        vectorSize: vectorData.vectorType === 'dense' ? vectorData.value.data.length : 'N/A',
        key: vectorData.key
      });

      await performSearch(vectorData, vectorField);
    } catch (error) {
      console.error('[SearchTab] Error in handleSearch:', error);
      if (error instanceof SyntaxError) {
        message.error('Invalid JSON format');
      } else {
        message.error(error instanceof Error ? error.message : 'Invalid vector format');
      }
    }
  };

  const handleSearchWithVector = async (vector: number[] | { indices: number[]; values: number[] }, vectorField?: string | null, vectorType: 'dense' | 'sparse' | 'binary' = 'dense') => {
    const targetField = vectorField || selectedVectorField || COLLECTION_DEFAULT_VECTOR;
    const fieldSchema = collectionSchema.vectors[targetField];

    if (!fieldSchema) {
      message.error('Vector field not found');
      return;
    }

    let vectorData: DocumentVector;
    if (vectorType === 'sparse' && 'indices' in vector && 'values' in vector) {
      vectorData = {
        key: targetField,
        vectorType: 'sparse',
        value: {
          indices: vector.indices,
          values: vector.values,
        },
      };
    } else if (Array.isArray(vector)) {
      if (fieldSchema.vectorType === 'binary') {
        vectorData = {
          key: targetField,
          vectorType: 'binary',
          size: fieldSchema.size,
          value: {
            data: vector,
          },
        };
      } else {
        vectorData = {
          key: targetField,
          vectorType: 'dense',
          size: vector.length,
          value: {
            data: vector,
          },
        };
      }
    } else {
      message.error('Invalid vector format');
      return;
    }

    await performSearch(vectorData, targetField);
  };

  // Handle navigation from other tabs (e.g. Find Similar from DocumentsTab)
  useEffect(() => {
    if (navigationState?.highlightDocument) {
      const document = navigationState.highlightDocument;
      const vectorField = navigationState.vectorField;

      if (document.vectors) {
        // Determine which vector to use
        let targetVectorKey: string | undefined;
        let targetVector: DocumentVector | undefined;

        if (vectorField && document.vectors[vectorField]) {
          // Use specified vector field
          targetVectorKey = vectorField;
          targetVector = document.vectors[vectorField];
        } else {
          // Use first available vector
          const firstVectorKey = Object.keys(document.vectors)[0];
          targetVectorKey = firstVectorKey;
          targetVector = document.vectors[firstVectorKey];
        }

        if (targetVector && targetVectorKey) {
          setLexicalQuery('');
          // Pre-populate search input based on vector type
          if (targetVector.vectorType === 'sparse' && 'indices' in targetVector.value) {
            setSearchInput(JSON.stringify({ indices: targetVector.value.indices, values: targetVector.value.values }));
          } else if ('data' in targetVector.value) {
            setSearchInput(JSON.stringify(targetVector.value.data));
          }
          setSelectedVectorField(targetVectorKey);

          // Automatically trigger search
          performSearch(targetVector, targetVectorKey);
        }
      }
    }
  }, [navigationState]);

  const generateRandomVector = () => {
    if (!selectedVectorField) {
      message.error('No default vector field selected');
      return;
    }
    const vectorField = collectionSchema?.vectors[selectedVectorField];
    if (!vectorField) {
      message.error('No vector field selected');
      return;
    }

    try {
      // For dense and binary vectors, size is required
      const size = vectorField.vectorType !== 'sparse' && 'size' in vectorField ? vectorField.size : undefined;
      const vectorJson = generateRandomVectorUtil(vectorField.vectorType, size);
      setSearchInput(vectorJson);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to generate vector');
    }
  };

  const handleFileUpload = (file: File) => {
    setEmbeddingFile(file);
    setEmbeddingText(''); // Clear text when file is uploaded
    return false; // Prevent default upload
  };

  const closeContextMenu = () => setContextMenu(null);

  // Build context menu items for a document
  const getContextMenuItems = (record: Document): any[] => {
    const menuItems: any[] = [
      {
        key: 'view',
        label: 'View',
        icon: <EyeOutlined />,
        onClick: () => {
          setSelectedDocument(record);
          closeContextMenu();
        },
      },
    ];

    // Add "Find Similar" options for each vector
    if (record.vectors) {
      const vectorsLength = Object.keys(record.vectors).length;
      if (vectorsLength === 1) {
        // Single vector - simple "Find Similar"
        menuItems.push({
          key: 'find-similar',
          label: 'Find Similar',
          icon: <SearchOutlined />,
          onClick: () => {
            const vectorKey = Object.keys(record.vectors)[0];
            const vector = record.vectors[vectorKey];
            if (vector && vector.value) {
              if (vector.vectorType === 'sparse' && 'indices' in vector.value) {
                setSearchInput(JSON.stringify({ indices: vector.value.indices, values: vector.value.values }));
                setSelectedVectorField(vectorKey);
                handleSearchWithVector({ indices: vector.value.indices, values: vector.value.values }, vectorKey, 'sparse');
              } else if ('data' in vector.value) {
                setSearchInput(JSON.stringify(vector.value.data));
                setSelectedVectorField(vectorKey);
                handleSearchWithVector(vector.value.data, vectorKey, vector.vectorType);
              } else {
                message.warning('Unsupported vector format');
              }
            } else {
              message.warning('No vector found in this document');
            }
            closeContextMenu();
          },
        });
      } else {
        // Multiple vectors - nested menu with submenu items (use Object.entries to get correct vectorKey from record)
        const findSimilarChildren = Object.entries(record.vectors)
          .filter(([, vector]) => vector && vector.value)
          .map(([vectorKey, vector]) => ({
            key: `find-similar-${vectorKey}`,
            label: vectorKey === COLLECTION_DEFAULT_VECTOR ? 'vector' : vectorKey,
            onClick: () => {
              if (vector.vectorType === 'sparse' && 'indices' in vector.value) {
                setSearchInput(JSON.stringify({ indices: vector.value.indices, values: vector.value.values }));
                setSelectedVectorField(vectorKey);
                handleSearchWithVector({ indices: vector.value.indices, values: vector.value.values }, vectorKey, 'sparse');
                closeContextMenu();
              } else if ('data' in vector.value) {
                setSearchInput(JSON.stringify(vector.value.data));
                setSelectedVectorField(vectorKey);
                handleSearchWithVector(vector.value.data, vectorKey, vector.vectorType);
                closeContextMenu();
              } else {
                message.warning('Unsupported vector format');
                closeContextMenu();
              }
            },
          }));

        if (findSimilarChildren.length > 0) {
          menuItems.push({
            key: 'find-similar',
            label: 'Find Similar',
            icon: <SearchOutlined />,
            children: findSimilarChildren,
          });
        }
      }
    }

    // Add "Visualize" option
    if (onNavigateToVisualize && record.vectors) {
      const vectorsLength = Object.keys(record.vectors).length;
      if (vectorsLength === 1) {
        // Single vector - simple option
        menuItems.push({
          key: 'view-in-visualize',
          label: 'Visualize',
          icon: <DotChartOutlined />,
          onClick: () => {
            onNavigateToVisualize(record, Object.keys(record.vectors)[0]);
            closeContextMenu();
          },
        });
      } else {
        // Multiple vectors - nested menu with submenu items (use Object.entries to get correct vectorKey from record)
        const visualizeChildren = Object.entries(record.vectors)
          .filter(([, v]) => v && v.value)
          .map(([vectorKey]) => ({
            key: `view-in-visualize-${vectorKey}`,
            label: vectorKey === COLLECTION_DEFAULT_VECTOR ? 'vector' : vectorKey,
            onClick: () => {
              onNavigateToVisualize(record, vectorKey);
              closeContextMenu();
            },
          }));

        if (visualizeChildren.length > 0) {
          menuItems.push({
            key: 'view-in-visualize',
            label: 'Visualize',
            icon: <DotChartOutlined />,
            children: visualizeChildren,
          });
        }
      }
    }

    return menuItems;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16 }}>

      {/* Item Detail Drawer */}
      <DocumentDetailDrawer
        open={Boolean(selectedDocument)}
        onClose={() => setSelectedDocument(null)}
        document={selectedDocument}
      />

      {/* Embedding Config Modal */}
      <EmbeddingConfigModal
        open={embeddingModalOpen}
        onClose={handleEmbeddingModalClose}
        onSave={handleSaveEmbeddingFunction}
        editingFunction={editingEmbeddingFunction}
      />

      {/* Search Comparison Modal */}
      <SearchComparisonModal
        open={comparisonModalOpen}
        onClose={() => {
          setComparisonModalOpen(false);
          setComparisonItem(null);
        }}
        currentSearch={searchHistory[0] || null}
        previousSearch={comparisonItem}
      />

      {/* Search Controls Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexShrink: 0, alignItems: 'stretch' }}>
        {/* Main Search Controls Card */}
        <Card
          size="small"
          style={{
            flex: 1,
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
          }}
          styles={{
            body: {
              padding: '16px 20px',
            },
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Embedding Section */}
            <Collapse
              defaultActiveKey={[]}
              ghost
              style={{ background: 'transparent' }}
              expandIconPlacement="start"
              className="embedding-collapse"
            >
              <style>{`
              .embedding-collapse .ant-collapse-content-box {
                padding: 0 !important;
              }
              .embedding-collapse .ant-collapse-header {
                padding: 0 !important;
              }
              .embedding-collapse .ant-collapse-body {
                padding: 12px 0 0 0 !important;
              }
            `}</style>
              <Panel
                key="embedding"
                header={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13 }}>
                      Generate Embedding
                    </Text>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Popover
                        content={
                          <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>How Embedding Functions Work</Text>
                              <Text style={{ fontSize: 12, lineHeight: 1.6, display: 'block' }}>
                                Embedding functions convert your text or files into vector embeddings that can be used for semantic search.
                                You can create custom functions that connect to any embedding API or service.
                              </Text>
                            </div>

                            <div>
                              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Workflow</Text>
                              <ol style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.7 }}>
                                <li>Select or create an embedding function (defines how to call your API)</li>
                                <li>Choose input type: Text or File</li>
                                <li>Enter your text or upload a file</li>
                                <li>Click "Generate Embedding" to create the vector</li>
                                <li>The generated vector is automatically copied to the search field below</li>
                                <li>Click "Search" to find similar documents</li>
                              </ol>
                            </div>

                            <div>
                              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Privacy & Security</Text>
                              <Text style={{ fontSize: 12, lineHeight: 1.6, display: 'block' }}>
                                All embedding functions and API keys are stored locally on your computer. Your data never leaves your device when generating embeddings.
                              </Text>
                            </div>
                          </div>
                        }
                        title="About Embedding Generation"
                        trigger="click"
                        placement="rightTop"
                      >
                        <InfoCircleOutlined
                          style={{
                            fontSize: 14,
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary-color)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                        />
                      </Popover>
                    </span>
                  </div>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Input Type Selection */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>INPUT TYPE</Text>
                      <Radio.Group
                        value={inputMode}
                        onChange={(e) => {
                          setInputMode(e.target.value);
                          // Clear the other input when switching
                          if (e.target.value === 'text') {
                            setEmbeddingFile(null);
                          } else {
                            setEmbeddingText('');
                          }
                        }}
                        size="small"
                      >
                        <Radio.Button value="text">Text</Radio.Button>
                        <Radio.Button value="file">File</Radio.Button>
                      </Radio.Group>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>FUNCTION</Text>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <Select
                            value={selectedEmbeddingFunction}
                            onChange={(value) => setSelectedEmbeddingFunction(value)}
                            placeholder="Embedding function"
                            style={{ width: 120 }}
                            size="small"
                            notFoundContent={
                              <div style={{ padding: 8, textAlign: 'center' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>No functions</Text>
                              </div>
                            }
                          >
                            {embeddingFunctions.map(func => (
                              <Option key={func.id} value={func.id}>
                                {func.name}
                              </Option>
                            ))}
                          </Select>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={handleEditEmbeddingFunction}
                            disabled={!selectedEmbeddingFunction}
                          />
                          <Button
                            type="text"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              setEditingEmbeddingFunction(null);
                              setEmbeddingModalOpen(true);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input Content */}
                  {inputMode === 'text' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <TextArea
                        placeholder="Enter text to embed..."
                        value={embeddingText}
                        onChange={(e) => setEmbeddingText(e.target.value)}
                        rows={3}
                        size="small"
                      />
                    </div>
                  )}

                  {inputMode === 'file' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Upload
                          beforeUpload={handleFileUpload}
                          showUploadList={false}
                        >
                          <Button size="small">
                            {embeddingFile ? embeddingFile.name : 'Upload File'}
                          </Button>
                        </Upload>
                        {embeddingFile && (
                          <Button
                            type="link"
                            size="small"
                            danger
                            onClick={() => setEmbeddingFile(null)}
                            style={{ padding: 0, height: 'auto' }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Embed Button */}
                  <div style={{ display: 'flex' }}>
                    <Button
                      type="primary"
                      onClick={handleEmbed}
                      disabled={embeddingLoading || !selectedEmbeddingFunction || (inputMode === 'text' && !embeddingText.trim()) || (inputMode === 'file' && !embeddingFile)}
                      loading={embeddingLoading}
                      size="small"
                      icon={<ApiOutlined />}
                    >
                      Generate Embedding
                    </Button>
                  </div>
                </div>
              </Panel>
            </Collapse>

            {/* Divider */}
            <div style={{
              height: 1,
              background: 'var(--border-color)',
              margin: '4px 0',
            }} />

            {/* Search support (what this collection supports) */}
            {/* {searchCapabilities && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <Tooltip title="Semantic similarity using dense vectors (e.g. from embeddings). Default for most collections.">
                  <Tag color="blue">Dense</Tag>
                </Tooltip>
                {searchCapabilities.sparse && (
                  <Tooltip title="Keyword-style similarity using sparse vectors. Good for exact term matching alongside semantic search.">
                    <Tag color="green">Sparse</Tag>
                  </Tooltip>
                )}
                {searchCapabilities.lexical && (
                  <Tooltip title="Full-text / BM25 search. Use the keywords field below to combine with vector search for hybrid results.">
                    <Tag color="orange">Lexical</Tag>
                  </Tooltip>
                )}
              </div>
            )} */}

            {/* Keywords + Alpha (when backend supports lexical / BM25) */}
            {searchCapabilities?.lexical && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                      KEYWORDS
                      <Tooltip title="Keyword / full-text search (BM25 or FTS). Enter text to combine with vector search for hybrid results.">
                        <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'help' }} />
                      </Tooltip>
                    </Text>
                  </div>
                  {searchCapabilities?.supportsHybridAlpha && (
                    <div style={{ width: 80 }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>Alpha</Text>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <Input
                    placeholder="Optional keywords for hybrid search"
                    value={lexicalQuery}
                    onChange={(e) => setLexicalQuery(e.target.value)}
                    size="small"
                    allowClear
                    style={{ flex: 1, minWidth: 120 }}
                  />
                  {searchCapabilities?.supportsHybridAlpha && (
                    <InputNumber
                      min={0}
                      max={1}
                      step={0.05}
                      value={hybridAlpha}
                      onChange={(v) => setHybridAlpha(v != null ? Number(v) : 0.75)}
                      size="small"
                      style={{ width: 80 }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Vector Search Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Search Vector Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                    SEARCH VECTOR
                    <Tooltip title="Generate random vector">
                      <ThunderboltOutlined
                        style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => generateRandomVector()}
                      />
                    </Tooltip>
                  </Text>
                  <TextArea
                    placeholder={selectedVectorField && collectionSchema.vectors[selectedVectorField]?.vectorType === 'sparse'
                      ? '{indices: [0, 5, 10], values: [0.1, 0.2, 0.3]} or [0.1, 0.2, ...] for dense'
                      : '[0.1, 0.2, ...] or comma-separated values. For sparse: {indices: [], values: []}'}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    rows={4}
                    size="small"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* Show vector field selector if there are multiple vectors OR if there are named vectors (not default) */}
                {(collectionSchema.multipleVectors ||
                  (Object.keys(collectionSchema.vectors).length > 0 &&
                    !Object.keys(collectionSchema.vectors).includes(COLLECTION_DEFAULT_VECTOR))) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>VECTOR FIELD</Text>
                      <Select
                        value={selectedVectorField}
                        onChange={(value) => {
                          console.log('[SearchTab] Vector field changed:', value);
                          setSelectedVectorField(value);
                        }}
                        style={{ width: 160 }}
                        size="small"
                      >
                        {Object.values(collectionSchema.vectors).map(field => {
                          let label = field.name;
                          if (field.vectorType === 'sparse') {
                            label += ' (sparse)';
                          } else if ('size' in field) {
                            label += ` (${field.size}D)`;
                          }
                          return (
                            <Option key={field.name} value={field.name}>
                              {label}
                            </Option>
                          );
                        })}
                      </Select>
                    </div>
                  )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>TOP K</Text>
                  <InputNumber
                    min={1}
                    max={100}
                    value={topK}
                    onChange={(v) => setTopK(v || 10)}
                    size="small"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>THRESHOLD</Text>
                  <InputNumber
                    min={0.001}
                    max={1}
                    step={0.001}
                    value={scoreThreshold}
                    onChange={(v) => setScoreThreshold(v || undefined)}
                    placeholder="None"
                    size="small"
                    style={{ width: 100 }}
                  />
                </div>

                <FilterBuilder
                  schema={collectionSchema}
                  onApply={(filter) => {
                    setActiveFilter(filter);
                  }}
                />

                <Button
                  type="primary"
                  onClick={() => handleSearch()}
                  disabled={loading || (!searchInput.trim() && !(searchCapabilities?.lexical && lexicalQuery.trim()))}
                  loading={loading}
                  size="small"
                  icon={<SearchOutlined />}
                >
                  Search
                </Button>
                {searchMetadata && (
                  <SearchStatistics metadata={searchMetadata} />
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Search History Card */}
        {searchHistory.length > 0 && (
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>
                  <ClockCircleOutlined style={{ marginRight: 6 }} />
                  Search History
                </Text>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={clearSearchHistory}
                  style={{ fontSize: 11 }}
                >
                  Clear
                </Button>
              </div>
            }
            style={{
              width: 360,
              maxHeight: 285,
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
            }}
            styles={{
              header: {
                padding: '8px 12px',
                minHeight: 'auto',
                borderBottom: '1px solid var(--border-color)',
                flexShrink: 0,
              },
              body: {
                padding: 0,
                overflowY: 'auto',
                flex: 1,
                minHeight: 0,
              },
            }}
          >
            <List
              size="small"
              dataSource={searchHistory}
              renderItem={(item) => {
                const timeAgo = Date.now() - item.timestamp;
                const minutes = Math.floor(timeAgo / 60000);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                let timeText = '';
                if (days > 0) timeText = `${days}d ago`;
                else if (hours > 0) timeText = `${hours}h ago`;
                else if (minutes > 0) timeText = `${minutes}m ago`;
                else timeText = 'Just now';

                return (
                  <List.Item
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          cursor: 'pointer',
                        }}
                        onClick={() => restoreSearchFromHistory(item)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {timeText}
                          </Text>
                          <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                            {item.documents.length} results
                          </Tag>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                            {Array.isArray(item.vector)
                              ? `${item.vector.length}D ${item.vectorType}`
                              : `${item.vector.indices.length} nnz (sparse)`}
                          </Tag>
                          <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                            Top {item.topK}
                          </Tag>
                          {item.vectorField && item.vectorField !== COLLECTION_DEFAULT_VECTOR && (
                            <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                              {item.vectorField}
                            </Tag>
                          )}
                          {item.lexicalQuery && (
                            <Tag color="orange" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                              Keywords
                            </Tag>
                          )}
                          {item.filter && (
                            <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                              Filtered
                            </Tag>
                          )}
                          {item.scoreThreshold && (
                            <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                              ≥{item.scoreThreshold}
                            </Tag>
                          )}
                        </div>
                      </div>
                      <div style={{ width: 28, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                        <Tooltip title="Compare with latest search">
                          <Button
                            type="text"
                            size="small"
                            icon={<DiffOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setComparisonItem(item);
                              setComparisonModalOpen(true);
                            }}
                            style={{
                              padding: '2px 4px',
                              height: 'auto',
                            }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          </Card>
        )}
      </div>

      {/* Table */}
      <div
        className="data-table-container"
        style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
      >
        <Table
          sticky={true}
          columns={generateDocumentDynamicTableColumns(collectionSchema, documents)}
          dataSource={documents}
          rowKey={(record) => String(record.primary.value || Math.random())}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
          onRow={(record) => ({
            onClick: () => {
              setSelectedDocument(record);
            },
            onContextMenu: (e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, document: record });
            },
            style: { cursor: 'pointer' },
          })}
        />
      </div>

      {/* Context Menu */}
      <ContextMenu
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        items={contextMenu ? getContextMenuItems(contextMenu.document) : []}
        onClose={closeContextMenu}
      />

    </div>
  );
};

export default SearchTab;

