import React, { useState, useEffect } from 'react';
import { Spin, Space, Typography, Tag, Select, Button } from 'antd';
import {
  InfoCircleOutlined,
  DotChartOutlined,
  TableOutlined,
  BarChartOutlined,
  SearchOutlined,
  BorderlessTableOutlined,
  FundOutlined,
} from '@ant-design/icons';
import { CollectionSchema, Document, TabInfo } from '../types';
import InfoTab from './InfoTab';
import VisualizeTab from './VisualizeTab';
import DocumentsTab from './DocumentsTab';
import SearchTab from './SearchTab';
const { Text, Title } = Typography;

interface CollectionTabProps {
  tab: TabInfo;
}

// Navigation state for cross-tab communication
export interface NavigationState {
  targetTab?: 'visualize' | 'search';
  highlightDocument?: Document;
  vectorField?: string;
}

type ActiveViewTab = 'documents' | 'search' | 'visualize' | 'info';

const CollectionTab: React.FC<CollectionTabProps> = ({ tab }) => {
  const [activeViewTab, setActiveViewTab] = useState<ActiveViewTab>('documents');
  const [loading, setLoading] = useState<boolean>(true);
  const [collectionSchema, setCollectionSchema] = useState<CollectionSchema | undefined>();
  const [navigationState, setNavigationState] = useState<NavigationState | null>(null);
  const [selectedDataRequirements, setSelectedDataRequirements] = useState<
    Record<string, string> | undefined
  >();

  useEffect(() => {
    getSchema();
  }, []);

  // Handle navigation requests
  useEffect(() => {
    if (navigationState?.targetTab) {
      setActiveViewTab(navigationState.targetTab);
      // Clear navigation state after switching (give more time for tab to render)
      setTimeout(() => setNavigationState(null), 500);
    }
  }, [navigationState]);

  const getSchema = async () => {
    setLoading(true);
    const result = await window.electronAPI.db.getCollectionSchema(
      tab.connectionId,
      tab.collection.name,
    );
    if (result.success && result.schema) {
      checkForDataRequirements(result.schema);
      setCollectionSchema(result.schema);
    }
    setLoading(false);
  };

  const checkForDataRequirements = (schema: CollectionSchema) => {
    if (schema.dataRequirements) {
      const dataRequirements = schema.dataRequirements;
      const selectedDataRequirements: Record<string, string> = {};
      Object.keys(dataRequirements).forEach((key) => {
        selectedDataRequirements[key] = dataRequirements[key].value[0];
      });
      setSelectedDataRequirements(selectedDataRequirements);
    }
  };

  const renderDocumentsTab = () => {
    if (!collectionSchema) {
      return;
    }
    return (
      <DocumentsTab
        key={tab.id}
        tab={tab}
        collectionSchema={collectionSchema}
        dataRequirements={selectedDataRequirements}
        onNavigateToVisualize={(document, vectorField) => {
          setNavigationState({
            targetTab: 'visualize',
            highlightDocument: document,
            vectorField,
          });
        }}
        onNavigateToSearch={(document, vectorField) => {
          setNavigationState({
            targetTab: 'search',
            highlightDocument: document,
            vectorField,
          });
        }}
      />
    );
  };

  const renderSearchTab = () => {
    if (!collectionSchema?.hasVectors) {
      return;
    }
    return (
      <SearchTab
        key={tab.id}
        tab={tab}
        collectionSchema={collectionSchema}
        dataRequirements={selectedDataRequirements}
        navigationState={navigationState?.targetTab === 'search' ? navigationState : null}
        onNavigateToVisualize={(document, vectorField) => {
          setNavigationState({
            targetTab: 'visualize',
            highlightDocument: document,
            vectorField,
          });
        }}
      />
    );
  };

  const renderVisualizeTab = () => {
    if (!collectionSchema?.hasVectors) {
      return;
    }
    return (
      <VisualizeTab
        key={tab.id}
        tab={tab}
        collectionSchema={collectionSchema}
        dataRequirements={selectedDataRequirements}
        navigationState={navigationState?.targetTab === 'visualize' ? navigationState : null}
      />
    );
  };

  const renderInfoTab = () => {
    return <InfoTab key={tab.id} tab={tab} />;
  };

  const renderDataRequirements = () => {
    if (!collectionSchema?.dataRequirements) {
      return;
    }
    const dataRequirements = collectionSchema.dataRequirements;
    return (
      <Space size={16} align="end">
        {Object.keys(dataRequirements).map((key) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
              {key.toUpperCase()}
            </Text>
            <Select
              showSearch
              value={selectedDataRequirements?.[key] || ''}
              onChange={(value) =>
                setSelectedDataRequirements({ ...selectedDataRequirements, [key]: value })
              }
              size="small"
            >
              {dataRequirements[key].value.map((value) => (
                <Select.Option key={value} value={value}>
                  {value}
                </Select.Option>
              ))}
            </Select>
          </div>
        ))}
      </Space>
    );
  };

  if (loading) {
    return (
      <div
        style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      >
        <Spin />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with collection info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <Space size={12}>
          <Title level={5} style={{ margin: 0, color: 'var(--text-primary)' }}>
            {tab.collection.name}
          </Title>
          <Tag style={{ margin: 0 }}>{tab.collection.count.toLocaleString()} documents</Tag>
        </Space>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {tab.connectionName}
        </Text>
      </div>

      {/* Data requirements row */}
      {collectionSchema?.dataRequirements && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
          }}
        >
          {renderDataRequirements()}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Navigation Buttons */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            padding: '0 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
          }}
        >
          {[
            { key: 'documents', icon: <BorderlessTableOutlined />, label: 'Documents' },
            {
              key: 'search',
              icon: <SearchOutlined />,
              label: 'Search',
              hidden: !collectionSchema?.hasVectors,
            },
            {
              key: 'visualize',
              icon: <DotChartOutlined />,
              label: 'Visualize',
              hidden: !collectionSchema?.hasVectors,
            },
            { key: 'info', icon: <InfoCircleOutlined />, label: 'Collection Info' },
          ]
            .filter((tab) => !tab.hidden)
            .map((tab) => (
              <Button
                key={tab.key}
                type="text"
                icon={React.cloneElement(tab.icon, { style: { fontSize: 12 } })}
                onClick={() => setActiveViewTab(tab.key as ActiveViewTab)}
                style={{
                  borderRadius: 0,
                  border: 'none',
                  borderBottom:
                    activeViewTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: activeViewTab === tab.key ? '#6366f1' : 'var(--text-secondary)',
                  transition: 'color 0.2s ease, border-bottom 0.2s ease',
                }}
              >
                {tab.label}
              </Button>
            ))}
        </div>

        {/* Tab Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: activeViewTab === 'documents' ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            {renderDocumentsTab()}
          </div>
          <div
            style={{
              display: activeViewTab === 'search' ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            {renderSearchTab()}
          </div>
          <div
            style={{
              display: activeViewTab === 'visualize' ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            {renderVisualizeTab()}
          </div>
          <div
            style={{
              display: activeViewTab === 'info' ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            {renderInfoTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollectionTab;
