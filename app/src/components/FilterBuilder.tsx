import React, { useState, useEffect } from 'react';
import {
  Select,
  Input,
  InputNumber,
  Button,
  Space,
  Tag,
  Switch,
  Typography,
  Popover,
  Divider,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  CloseOutlined,
  FilterOutlined,
  ReloadOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { CollectionSchema } from '../types';

const { Text } = Typography;

// Internal condition with id for React keys
interface InternalFilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean;
  valueType: 'string' | 'number' | 'boolean';
}

// Exported condition without id (for API)
export interface FilterCondition {
  field: string;
  operator: string;
  value: string | number | boolean;
  valueType: 'string' | 'number' | 'boolean';
}

export interface FilterQuery {
  conditions: FilterCondition[];
  logic: 'and' | 'or';
}

interface FilterBuilderProps {
  schema?: CollectionSchema;
  onApply: (filter: FilterQuery | undefined) => void;
}

const OPERATORS = {
  string: [
    { value: 'eq', label: 'equals', symbol: '=' },
    { value: 'neq', label: 'not equals', symbol: '≠' },
    // { value: 'contains', label: 'contains', symbol: '∋' },
    // { value: 'starts_with', label: 'starts with', symbol: '^' },
  ],
  number: [
    { value: 'eq', label: 'equals', symbol: '=' },
    { value: 'neq', label: 'not equals', symbol: '≠' },
    { value: 'gt', label: 'greater than', symbol: '>' },
    { value: 'gte', label: 'greater or equal', symbol: '≥' },
    { value: 'lt', label: 'less than', symbol: '<' },
    { value: 'lte', label: 'less or equal', symbol: '≤' },
  ],
  boolean: [{ value: 'eq', label: 'equals', symbol: '=' }],
};

const FilterBuilder: React.FC<FilterBuilderProps> = ({ schema, onApply }) => {
  const [conditions, setConditions] = useState<InternalFilterCondition[]>([]);
  const [logic, setLogic] = useState<'and' | 'or'>('and');
  const [fields, setFields] = useState<{ name: string; type: 'string' | 'number' | 'boolean' }[]>(
    [],
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [appliedConditions, setAppliedConditions] = useState<InternalFilterCondition[]>([]);
  const [appliedLogic, setAppliedLogic] = useState<'and' | 'or'>('and');

  useEffect(() => {
    if (!schema?.fields) return;

    const list: any = [];
    if (schema.primary) {
      list.push({ name: schema.primary.name, type: schema.primary.type });
    }
    Object.entries(schema.fields).forEach(([key, value]) => {
      if (value.type === 'string' || value.type === 'number' || value.type === 'boolean') {
        list.push({ name: value.name, type: value.type });
      }
    });
    setFields(list);
  }, [schema]);

  const addCondition = () => {
    if (fields.length === 0) return;

    const firstField = fields[0];
    setConditions([
      ...conditions,
      {
        id: `cond_${Date.now()}`,
        field: firstField.name,
        operator: 'eq',
        value: firstField.type === 'boolean' ? true : firstField.type === 'number' ? 0 : '',
        valueType: firstField.type,
      },
    ]);
  };

  const updateCondition = (id: string, updates: Partial<InternalFilterCondition>) => {
    setConditions(
      conditions.map((c) => {
        if (c.id !== id) return c;

        // If field changed, reset operator and value based on new field type
        if (updates.field) {
          const newField = fields.find((f) => f.name === updates.field);
          if (newField && newField.type !== c.valueType) {
            return {
              ...c,
              field: updates.field,
              operator: 'eq',
              value: newField.type === 'boolean' ? true : newField.type === 'number' ? 0 : '',
              valueType: newField.type,
            };
          }
        }

        return { ...c, ...updates };
      }),
    );
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id));
  };

  const clearAll = () => {
    setConditions([]);
    onApply(undefined);
    setAppliedConditions([]);
  };

  const applyFilter = () => {
    if (conditions.length === 0) {
      onApply(undefined);
      setAppliedConditions([]);
    } else {
      // Strip the internal 'id' field before sending to backend
      const cleanedConditions = conditions.map(({ field, operator, value, valueType }) => ({
        field,
        operator,
        value,
        valueType,
      }));
      onApply({ conditions: cleanedConditions, logic });
      // Store applied state
      setAppliedConditions([...conditions]);
      setAppliedLogic(logic);
    }
    setPopoverOpen(false);
  };

  const getFieldType = (fieldName: string) => {
    return fields.find((f) => f.name === fieldName)?.type || 'string';
  };

  const getOperatorSymbol = (type: 'string' | 'number' | 'boolean', op: string) => {
    return OPERATORS[type].find((o) => o.value === op)?.symbol || '=';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'number':
        return '#4fc3f7';
      case 'boolean':
        return '#81c784';
      default:
        return '#ffa726';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'number':
        return '#';
      case 'boolean':
        return '◐';
      default:
        return 'T';
    }
  };

  const renderConditionCard = (condition: InternalFilterCondition, index: number) => {
    const fieldType = getFieldType(condition.field);
    const operators = OPERATORS[fieldType];

    return (
      <div
        key={condition.id}
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          marginBottom: 8,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Field Selection */}
        <Select
          value={condition.field}
          onChange={(value) => updateCondition(condition.id, { field: value })}
          style={{ width: 120 }}
          size="small"
          styles={{ popup: { root: { background: 'var(--bg-elevated)' } } }}
        >
          {fields.map((f) => (
            <Select.Option key={f.name} value={f.name}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background: `${getTypeColor(f.type)}20`,
                    color: getTypeColor(f.type),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 600,
                  }}
                >
                  {getTypeIcon(f.type)}
                </span>
                <span>{f.name}</span>
              </div>
            </Select.Option>
          ))}
        </Select>

        {/* Operator Selection */}
        <Select
          value={condition.operator}
          onChange={(value) => updateCondition(condition.id, { operator: value })}
          style={{ width: 80 }}
          styles={{ popup: { root: { background: 'var(--bg-elevated)' } } }}
          size="small"
        >
          {operators.map((op) => (
            <Select.Option key={op.value} value={op.value}>
              {op.value}
            </Select.Option>
          ))}
        </Select>

        {/* Value Input */}
        <div style={{ flex: 1, minWidth: 100 }}>
          {fieldType === 'boolean' ? (
            <Select
              value={condition.value as boolean}
              onChange={(value) => updateCondition(condition.id, { value })}
              style={{ width: '100%' }}
              size="small"
            >
              <Select.Option value={true}>True</Select.Option>
              <Select.Option value={false}>False</Select.Option>
            </Select>
          ) : fieldType === 'number' ? (
            <InputNumber
              value={condition.value as number}
              onChange={(value) => updateCondition(condition.id, { value: value ?? 0 })}
              style={{ width: '100%' }}
              size="small"
              placeholder="Number..."
            />
          ) : (
            <Input
              value={condition.value as string}
              onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
              placeholder="Value..."
              size="small"
            />
          )}
        </div>

        {/* Remove button */}
        <Button
          type="text"
          size="small"
          danger
          icon={<CloseOutlined />}
          onClick={() => removeCondition(condition.id)}
          style={{ padding: '4px 8px', minWidth: 'auto' }}
        />
      </div>
    );
  };

  const activeCount = appliedConditions.length;

  // Active filter summary pills
  const renderActiveFilters = () => {
    if (conditions.length === 0) return null;

    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 8 }}>
        {conditions.map((c, i) => (
          <Tag
            key={c.id}
            closable
            onClose={() => {
              removeCondition(c.id);
              if (conditions.length === 1) onApply(undefined);
            }}
            style={{
              margin: 0,
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-light)',
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            {i > 0 && <span style={{ color: '#6366f1', marginRight: 4 }}>{logic}</span>}
            <span style={{ color: 'var(--text-secondary)' }}>{c.field}</span>
            <span style={{ color: '#6366f1', margin: '0 4px' }}>
              {getOperatorSymbol(c.valueType, c.operator)}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {typeof c.value === 'boolean' ? (c.value ? 'true' : 'false') : String(c.value)}
            </span>
          </Tag>
        ))}
      </div>
    );
  };

  const popoverContent = (
    <div style={{ width: 400, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
      {fields.length === 0 ? (
        <Empty
          description="No filterable fields detected"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 20, marginBottom: 20 }}
        />
      ) : (
        <>
          {/* Quick field buttons */}
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 6 }}>
              AVAILABLE FIELDS
            </Text>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {fields.map((f) => (
                <Tag
                  key={f.name}
                  style={{
                    cursor: 'pointer',
                    margin: 0,
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-light)',
                    borderRadius: 6,
                  }}
                  onClick={() => {
                    setConditions([
                      ...conditions,
                      {
                        id: `cond_${Date.now()}`,
                        field: f.name,
                        operator: 'eq',
                        value: f.type === 'boolean' ? true : f.type === 'number' ? 0 : '',
                        valueType: f.type,
                      },
                    ]);
                  }}
                >
                  <span
                    style={{
                      color: getTypeColor(f.type),
                      marginRight: 4,
                      fontSize: 10,
                    }}
                  >
                    {getTypeIcon(f.type)}
                  </span>
                  {f.name}
                </Tag>
              ))}
            </div>
          </div>

          <Divider style={{ margin: '8px 0', borderColor: 'var(--border-color)' }} />

          {/* Active conditions */}
          <div style={{ marginBottom: 12, flex: 1, overflow: 'auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <Text type="secondary" style={{ fontSize: 10 }}>
                ACTIVE FILTERS
              </Text>
              {conditions.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    Match:
                  </Text>
                  <Button
                    size="small"
                    type={logic === 'and' ? 'primary' : 'default'}
                    onClick={() => setLogic('and')}
                    style={{
                      fontSize: 10,
                      padding: '0 8px',
                      height: 22,
                      borderRadius: '4px 0 0 4px',
                      background: logic === 'and' ? '#6366f1' : 'var(--bg-elevated)',
                      borderColor: 'var(--border-light)',
                    }}
                  >
                    AND
                  </Button>
                  <Button
                    size="small"
                    type={logic === 'or' ? 'primary' : 'default'}
                    onClick={() => setLogic('or')}
                    style={{
                      fontSize: 10,
                      padding: '0 8px',
                      height: 22,
                      borderRadius: '0 4px 4px 0',
                      marginLeft: -1,
                      background: logic === 'or' ? '#f59e0b' : 'var(--bg-elevated)',
                      borderColor: 'var(--border-light)',
                    }}
                  >
                    OR
                  </Button>
                </div>
              )}
            </div>

            {conditions.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  border: '1px dashed var(--border-light)',
                }}
              >
                <FilterOutlined
                  style={{ fontSize: 20, color: 'var(--border-light)', marginBottom: 6 }}
                />
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                  No filters added yet
                </Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 10, marginTop: 2 }}>
                  Click a field above or add manually
                </Text>
              </div>
            ) : (
              <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                {conditions.map((condition, index) => renderConditionCard(condition, index))}
              </div>
            )}
          </div>

          {/* Add condition button */}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addCondition}
            style={{ width: '100%', borderRadius: 6, marginBottom: 12 }}
            size="small"
          >
            Add Filter Condition
          </Button>

          {/* Footer buttons */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderTop: '1px solid var(--border-color)',
              paddingTop: 12,
            }}
          >
            {conditions.length > 0 && (
              <Button icon={<ReloadOutlined />} onClick={clearAll} style={{ flex: 1 }} size="small">
                Reset
              </Button>
            )}
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={applyFilter}
              style={{
                flex: conditions.length > 0 ? 1 : undefined,
                width: conditions.length > 0 ? undefined : '100%',
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
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Popover
        destroyOnHidden={false}
        content={popoverContent}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FilterOutlined style={{ color: '#6366f1' }} />
            <span>Filters</span>
            {activeCount > 0 && (
              <Tag color="blue" style={{ margin: 0 }}>
                {activeCount}
              </Tag>
            )}
          </div>
        }
        trigger="click"
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          // When opening, load applied conditions into draft
          if (open) {
            setConditions([...appliedConditions]);
            setLogic(appliedLogic);
          }
        }}
        placement="bottomLeft"
        styles={{ root: { maxWidth: 'none' } }}
      >
        <Button
          size="small"
          icon={<FilterOutlined />}
          style={{
            borderColor: activeCount > 0 ? '#6366f1' : undefined,
            background: activeCount > 0 ? '#6366f115' : undefined,
          }}
        >
          <span style={{ color: activeCount > 0 ? '#6366f1' : undefined }}>
            {activeCount > 0 ? `${activeCount} Filter${activeCount > 1 ? 's' : ''}` : 'Filter'}
          </span>
        </Button>
      </Popover>
      {/* {renderActiveFilters()} */}
    </div>
  );
};

export default FilterBuilder;
