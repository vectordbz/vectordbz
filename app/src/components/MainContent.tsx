import React from 'react';
import { Tabs, Typography, Space } from 'antd';
import { TableOutlined } from '@ant-design/icons';
import { TabInfo } from '../types';
import CollectionTab from './CollectionTab';

const { Text, Title } = Typography;

interface MainContentProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  onChangeTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

const MainContent: React.FC<MainContentProps> = ({
  tabs,
  activeTabId,
  onChangeTab,
  onCloseTab,
}) => {
  // Early return check - must be after all hooks
  if (tabs.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-secondary) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            border: '1px solid var(--border-color)',
          }}
        >
          <TableOutlined style={{ fontSize: 36, color: 'var(--border-light)' }} />
        </div>
        <Title level={5} style={{ color: 'var(--text-primary)', margin: 0 }}>
          No Collections Open
        </Title>
        <Text type="secondary" style={{ marginTop: 8, fontSize: 13 }}>
          Select a collection from the sidebar
        </Text>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Tab bar */}
      <Tabs
        type="editable-card"
        destroyOnHidden={false}
        activeKey={activeTabId || undefined}
        onChange={onChangeTab}
        onEdit={(targetKey, action) => {
          if (action === 'remove' && typeof targetKey === 'string') {
            onCloseTab(targetKey);
          }
        }}
        hideAdd
        size="small"
        style={{
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
        }}
        tabBarStyle={{
          margin: 0,
          padding: '8px 12px 0',
        }}
        items={tabs.map((tab) => ({
          key: tab.id,
          label: (
            <Space size={8} align="center">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#6366f1',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 500, fontSize: 14 }}>{tab.collection.name}</span>
            </Space>
          ),
          closable: true,
        }))}
      />

      {/* Tab content - render all tabs but only show active to preserve state */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              display: tab.id === activeTabId ? 'block' : 'none',
              height: '100%',
              overflow: 'auto',
            }}
          >
            <CollectionTab tab={tab} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default MainContent;
