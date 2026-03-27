import React, { useState, useCallback, useEffect } from 'react';
import {
  Table,
  Typography,
  Space,
  Button,
  Dropdown,
  message,
  Modal,
  Select,
  Popover,
  Tag,
  Empty,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  MoreOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
  EditOutlined,
  DotChartOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { TabInfo, Document, FilterQuery, CollectionSchema, COLLECTION_DEFAULT_VECTOR } from '../types';
import FilterBuilder from './FilterBuilder';
import SortBuilder from './SortBuilder';
import DocumentDetailDrawer from './DocumentDetailDrawer';
import ContextMenu from './ContextMenu';
import UpsertDocumentModal from './UpsertDocumentModal';
import { generateDocumentDynamicTableColumns } from '../services/uiUtils';

const { Text } = Typography;
const { Option } = Select;

interface DocumentsTabProps {
  tab: TabInfo;
  collectionSchema: CollectionSchema;
  dataRequirements?: Record<string, string>;
  onNavigateToVisualize?: (document: Document, vectorField?: string) => void;
  onNavigateToSearch?: (document: Document, vectorField?: string) => void;
}

const DocumentsTab: React.FC<DocumentsTabProps> = ({
  tab,
  collectionSchema,
  dataRequirements,
  onNavigateToVisualize,
  onNavigateToSearch,
}) => {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  // Upsert modal state
  const [upsertModalOpen, setUpsertModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  // Limit (page size)
  const [limit, setLimit] = useState<number>(50);
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; document: Document } | null>(null);

  // Filter state
  const [activeFilter, setActiveFilter] = useState<FilterQuery | undefined>();
  // Sort state
  const [activeSort, setActiveSort] = useState<Array<{ field: string; order: 'asc' | 'desc' }> | undefined>();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [nextOffset, setNextOffset] = useState<string | number | null>(null);
  const [currentOffset, setCurrentOffset] = useState<string | number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasMore, setHasMore] = useState<boolean>(true);
  // Track previous batches for backward navigation
  // Each batch stores: documents, offset used to fetch it, and nextOffset that was returned
  const [previousBatches, setPreviousBatches] = useState<Array<{ documents: Document[], offset: string | number | null, nextOffset: string | number | null }>>([]);
  useEffect(() => {
    getDocuments({ limit }, true);
  }, []);

  const getDocuments = async (
    options?: { filter?: FilterQuery, limit?: number, offset?: string | number, sort?: Array<{ field: string; order: 'asc' | 'desc' }> },
    reset = false
  ) => {
    const { filter, limit, offset, sort } = options || {};

    if (reset) {
      setLoading(true);
      setDocuments([]);
      setNextOffset(null);
      setCurrentOffset(null);
      setHasMore(true);
      setPreviousBatches([]);
    } else {
      setLoading(true);
    }

    const result = await window.electronAPI.db.getDocuments(tab.connectionId, {
      collection: tab.collection.name,
      options: {
        limit: limit,
        offset: offset,
        filter: filter,
        sort: sort,
        dataRequirements,
      },
    });

    if (result.success && result.documents) {
      setDocuments(result.documents);

      // Update nextOffset and hasMore based on response
      const hasNextOffset = result.nextOffset !== null && result.nextOffset !== undefined;
      setNextOffset(result.nextOffset || null);
      setCurrentOffset(offset || null);
      setHasMore(hasNextOffset);
    }

    setLoading(false);
  };

  const handleApplyFilter = (filter: FilterQuery | undefined) => {
    setActiveFilter(filter);
    setPreviousBatches([]);
    getDocuments({ filter, limit, sort: activeSort }, true);
  };


  const handleDeleteDocument = async (primary: Document['primary']) => {
    const result = await window.electronAPI.db.deleteDocument(tab.connectionId, {
      collection: tab.collection.name,
      primary,
      dataRequirements,
    });
    if (result.success) {
      message.success(`Deleted document ${primary.value}`);
      const newDocuments = documents.filter(document => document.primary.value !== primary.value);
      setDocuments(newDocuments);
    }
  };

  const handleDeleteDocuments = async (filter: FilterQuery) => {
    const result = await window.electronAPI.db.deleteDocuments(tab.connectionId, {
      collection: tab.collection.name,
      filter: filter,
      dataRequirements,
    });
    if (result.success) {
      message.success(`Deleted ${result.deletedCount || 0} documents`);
      getDocuments({ filter, limit }, true);
    } else {
      message.error(result.error || 'Failed to delete documents');
    }
  };

  const handleUpsertDocument = async (document: Partial<Document>): Promise<{ success: boolean; error?: string }> => {
    const result = await window.electronAPI.db.upsertDocument(tab.connectionId, {
      collection: tab.collection.name,
      document,
      dataRequirements,
    });
    if (result.success) {
      // Refresh documents after successful upsert
      getDocuments({ filter: activeFilter, limit, sort: activeSort }, true);
    }
    return result;
  };

  const openUpsertModal = (document?: Document) => {
    setEditingDocument(document || null);
    setUpsertModalOpen(true);
  };

  const closeUpsertModal = () => {
    setUpsertModalOpen(false);
    setEditingDocument(null);
  };

  const handleNextPage = () => {
    if (nextOffset === null || !hasMore) return;

    // Save current batch to history before moving forward
    setPreviousBatches(prev => [...prev, { documents, offset: currentOffset, nextOffset }]);
    getDocuments({ filter: activeFilter, limit, offset: nextOffset, sort: activeSort }, false);
  };

  const handlePreviousPage = () => {
    if (previousBatches.length === 0) return;

    // Get the last batch from history
    const lastBatch = previousBatches[previousBatches.length - 1];
    const newPreviousBatches = previousBatches.slice(0, -1);

    setPreviousBatches(newPreviousBatches);
    setDocuments(lastBatch.documents);
    setCurrentOffset(lastBatch.offset);
    setNextOffset(lastBatch.nextOffset);
    setHasMore(lastBatch.nextOffset !== null);
  };

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
      {
        key: 'edit',
        label: 'Edit',
        icon: <EditOutlined />,
        onClick: () => {
          openUpsertModal(record);
          closeContextMenu();
        },
      },
    ];

    // Add "Find Similar" options for each vector
    if (record.vectors) {
      const vectorsLength = Object.keys(record.vectors).length;
      if (vectorsLength === 1) {
        // Single vector - simple "Find Similar"
        if (onNavigateToSearch) {
          menuItems.push({
            key: 'find-similar',
            label: 'Find Similar',
            icon: <SearchOutlined />,
            onClick: () => {
              const vectorKey = Object.keys(record.vectors)[0];
              onNavigateToSearch(record, vectorKey);
              closeContextMenu();
            },
          });
        }
      } else {
        // Multiple vectors - nested menu with submenu items (use Object.entries to get correct vectorKey from record)
        if (onNavigateToSearch) {
          const findSimilarChildren = Object.entries(record.vectors)
            .filter(([, vector]) => vector && vector.value)
            .map(([vectorKey]) => ({
              key: `find-similar-${vectorKey}`,
              label: vectorKey === COLLECTION_DEFAULT_VECTOR ? 'vector' : vectorKey,
              onClick: () => {
                onNavigateToSearch(record, vectorKey);
                closeContextMenu();
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
      if (onNavigateToVisualize) {
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
    }

    // Add divider and delete
    menuItems.push({
      type: 'divider',
    });
    menuItems.push({
      key: 'delete',
      label: 'Delete',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => {
        handleDeleteDocument(record.primary);
        closeContextMenu();
      },
    });

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

      {/* Upsert Document Modal */}
      <UpsertDocumentModal
        open={upsertModalOpen}
        onClose={closeUpsertModal}
        onSubmit={handleUpsertDocument}
        collectionSchema={collectionSchema}
        editDocument={editingDocument}
      />

      {/* Filter and actions bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <Space size={8}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => getDocuments({ limit, sort: activeSort }, true)}
            loading={loading}
          >Reload</Button>
          <FilterBuilder
            schema={collectionSchema}
            onApply={(filter) => {
              setActiveFilter(filter);
              handleApplyFilter(filter);
            }}
          />
          <SortBuilder
            collectionSchema={collectionSchema}
            documents={documents}
            activeSort={activeSort}
            onSortChange={(sort: Array<{ field: string; order: 'asc' | 'desc' }> | undefined) => {
              setActiveSort(sort);
              setPreviousBatches([]);
              getDocuments({ filter: activeFilter, limit, sort }, true);
            }}
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: 'add-document',
                  icon: <PlusOutlined />,
                  label: 'Add Document',
                  onClick: () => openUpsertModal(),
                },
                { type: 'divider' },
                {
                  key: 'bulk-delete',
                  icon: <DeleteOutlined />,
                  label: activeFilter?.conditions?.length ? 'Delete Filtered Documents' : 'Delete All Documents',
                  danger: true,
                  onClick: () => {
                    const hasFilter = activeFilter && activeFilter.conditions.length > 0;
                    Modal.confirm({
                      title: hasFilter ? 'Bulk Delete (Filtered)' : '⚠️ Delete ALL Documents',
                      icon: <ExclamationCircleOutlined style={{ color: hasFilter ? undefined : '#ff4d4f' }} />,
                      content: (
                        <div>
                          {hasFilter ? (
                            <>
                              <p>Are you sure you want to delete all documents matching the current filter?</p>
                              <p style={{ marginTop: 8 }}>
                                <Text type="secondary">
                                  Filter: {activeFilter.conditions.length} condition{activeFilter.conditions.length > 1 ? 's' : ''} ({activeFilter.logic.toUpperCase()})
                                </Text>
                              </p>
                              <p style={{ marginTop: 4 }}>
                                <Text strong style={{ color: '#ff4d4f' }}>
                                  Currently showing {documents.length} documents that may be affected
                                </Text>
                              </p>
                            </>
                          ) : (
                            <>
                              <p style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                                You are about to delete ALL documents in this collection!
                              </p>
                              <p style={{ marginTop: 8 }}>
                                <Text strong style={{ color: '#ff4d4f' }}>
                                  Collection: {tab.collection.name} {dataRequirements ? `(${JSON.stringify(dataRequirements)})` : ''}
                                </Text>
                              </p>
                              {!dataRequirements && <p style={{ marginTop: 4 }}>
                                <Text strong style={{ color: '#ff4d4f' }}>
                                  Total documents: {tab.collection.count.toLocaleString()}
                                </Text>
                              </p>}
                            </>
                          )}
                          <p style={{ marginTop: 12, fontSize: 12, padding: '8px', background: 'var(--bg-elevated)', borderRadius: 4 }}>
                            <Text style={{ color: '#ff7875' }}>⚠️ This action cannot be undone!</Text>
                          </p>
                        </div>
                      ),
                      okText: hasFilter ? 'Delete Matching' : 'Delete ALL',
                      okType: 'danger',
                      cancelText: 'Cancel',
                      async onOk() {
                        const filterToUse = hasFilter ? activeFilter : { conditions: [], logic: 'and' as const };
                        await handleDeleteDocuments(filterToUse);
                      },
                    });
                  },
                },
              ],
            }}
            trigger={['click']}
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
        <Space size={8}>
          <Button
            size="small"
            icon={<LeftOutlined />}
            onClick={handlePreviousPage}
            disabled={previousBatches.length === 0 || loading}
          ></Button>
          {/* Page size select */}
          <Select
            size="small"
            value={limit}
            style={{ width: 70 }}
            onChange={(value: number) => {
              setLimit(value);
              getDocuments({ limit: value, sort: activeSort }, true);
            }}
          >
            <Option value={10}>10</Option>
            <Option value={25}>25</Option>
            <Option value={50}>50</Option>
            <Option value={100}>100</Option>
            <Option value={250}>250</Option>
            <Option value={500}>500</Option>
          </Select>
          <Button
            size="small"
            icon={<RightOutlined />}
            onClick={handleNextPage}
            disabled={!hasMore || nextOffset === null || loading}
          ></Button>
        </Space>
      </div>

      {/* Table */}
      <div
        className="data-table-container"
        style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
      >
        <Table
          sticky={true}
          columns={generateDocumentDynamicTableColumns(collectionSchema, documents, {
            scoreColumn: false,
          })}
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

export default DocumentsTab;

