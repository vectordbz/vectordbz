import React, { useState, useEffect } from 'react';
import { Button, Popover, Select, Typography, Tag, Empty, Space } from 'antd';
import {
  SortAscendingOutlined,
  SortDescendingOutlined,
  ReloadOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { CollectionSchema, Document } from '../types';

const { Text } = Typography;
const { Option } = Select;

interface SortBuilderProps {
  collectionSchema: CollectionSchema;
  documents: Document[];
  activeSort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  onSortChange: (sort: Array<{ field: string; order: 'asc' | 'desc' }> | undefined) => void;
}

const SortBuilder: React.FC<SortBuilderProps> = ({
  collectionSchema,
  documents,
  activeSort,
  onSortChange,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<string>(activeSort?.[0]?.field || '');
  const [selectedOrder, setSelectedOrder] = useState<'asc' | 'desc'>(
    activeSort?.[0]?.order || 'desc',
  );

  // Sync local state when activeSort changes externally
  useEffect(() => {
    if (activeSort && activeSort.length > 0) {
      setSelectedField(activeSort[0].field);
      setSelectedOrder(activeSort[0].order);
    } else {
      setSelectedField('');
      setSelectedOrder('desc');
    }
  }, [activeSort]);

  // Get all sortable fields
  const getSortableFields = (): string[] => {
    if (!collectionSchema?.fields) return [];
    const fields: string[] = [];
    if (collectionSchema.primary) {
      fields.push(collectionSchema.primary.name);
    }
    Object.entries(collectionSchema.fields).forEach(([key, value]) => {
      if (
        value.type === 'string' ||
        value.type === 'number' ||
        value.type === 'boolean' ||
        value.type === 'date'
      ) {
        fields.push(value.name);
      }
    });
    return fields;
  };

  const sortableFields = getSortableFields();
  const hasActiveSort = activeSort && activeSort.length > 0;

  const handleApply = () => {
    if (selectedField) {
      onSortChange([{ field: selectedField, order: selectedOrder }]);
    } else {
      onSortChange(undefined);
    }
    setPopoverOpen(false);
  };

  const handleClear = () => {
    setSelectedField('');
    setSelectedOrder('desc');
    onSortChange(undefined);
    setPopoverOpen(false);
  };

  const popoverContent = (
    <div style={{ width: 300 }}>
      {sortableFields.length === 0 ? (
        <Empty
          description="No sortable fields detected"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 20, marginBottom: 20 }}
        />
      ) : (
        <>
          {/* Field selection */}
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 6 }}>
              SORT BY FIELD
            </Text>
            <Select
              style={{ width: '100%' }}
              size="small"
              placeholder="Select field to sort by"
              value={selectedField || undefined}
              onChange={setSelectedField}
            >
              {sortableFields.map((field) => (
                <Option key={field} value={field}>
                  {field}
                </Option>
              ))}
            </Select>
          </div>

          {/* Order selection - always show */}
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 6 }}>
              ORDER
            </Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="small"
                type={selectedOrder === 'asc' ? 'primary' : 'default'}
                icon={<SortAscendingOutlined />}
                onClick={() => setSelectedOrder('asc')}
                style={{
                  flex: 1,
                  background:
                    selectedOrder === 'asc'
                      ? 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)'
                      : undefined,
                  border: selectedOrder === 'asc' ? 'none' : undefined,
                }}
              >
                Ascending
              </Button>
              <Button
                size="small"
                type={selectedOrder === 'desc' ? 'primary' : 'default'}
                icon={<SortDescendingOutlined />}
                onClick={() => setSelectedOrder('desc')}
                style={{
                  flex: 1,
                  background:
                    selectedOrder === 'desc'
                      ? 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)'
                      : undefined,
                  border: selectedOrder === 'desc' ? 'none' : undefined,
                }}
              >
                Descending
              </Button>
            </div>
          </div>

          {/* Footer buttons */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderTop: '1px solid var(--border-color)',
              paddingTop: 12,
            }}
          >
            {hasActiveSort && (
              <Button
                icon={<ReloadOutlined />}
                onClick={handleClear}
                style={{ flex: 1 }}
                size="small"
              >
                Clear
              </Button>
            )}
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleApply}
              style={{
                flex: hasActiveSort ? 1 : undefined,
                width: hasActiveSort ? undefined : '100%',
                background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                border: 'none',
              }}
              size="small"
            >
              Apply
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <Popover
      destroyOnHidden={false}
      content={popoverContent}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SortAscendingOutlined style={{ color: '#6366f1' }} />
          <span>Sort</span>
          {hasActiveSort && (
            <Tag color="blue" style={{ margin: 0 }}>
              1
            </Tag>
          )}
        </div>
      }
      trigger="click"
      open={popoverOpen}
      onOpenChange={(open) => {
        setPopoverOpen(open);
        // When opening, load current sort into draft
        if (open && activeSort && activeSort.length > 0) {
          setSelectedField(activeSort[0].field);
          setSelectedOrder(activeSort[0].order);
        }
      }}
      placement="bottomLeft"
      styles={{ root: { maxWidth: 'none' } }}
    >
      <Button
        size="small"
        icon={<SortAscendingOutlined />}
        style={{
          borderColor: hasActiveSort ? '#6366f1' : undefined,
          background: hasActiveSort ? '#6366f115' : undefined,
        }}
      >
        <span style={{ color: hasActiveSort ? '#6366f1' : undefined }}>
          {hasActiveSort ? `Sort (${activeSort[0].field})` : 'Sort'}
        </span>
      </Button>
    </Popover>
  );
};

export default SortBuilder;
