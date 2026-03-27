import React, { useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Checkbox,
  Radio,
  Slider,
  DatePicker,
  TimePicker,
  ColorPicker,
  Button,
  Space,
  Typography,
  Collapse,
  Divider,
  Tooltip,
  Row,
  Col,
  Card,
} from 'antd';
import {
  PlusOutlined,
  MinusCircleOutlined,
  QuestionCircleOutlined,
  HolderOutlined,
  CaretRightOutlined,
} from '@ant-design/icons';
import type {
  DynamicFormSchema,
  DynamicFormProps,
  DynamicFormInstance,
  FormField,
  FormSection,
  ConditionalRule,
  SelectOption,
} from './types';

const { Text, Title, Paragraph } = Typography;
const { TextArea, Password } = Input;

// ============================================
// Utility Functions
// ============================================

const evaluateCondition = (
  condition: ConditionalRule,
  formValues: Record<string, unknown>
): boolean => {
  const fieldValue = getNestedValue(formValues, condition.field);
  
  let result = false;
  
  switch (condition.operator) {
    case 'equals':
      result = fieldValue === condition.value;
      break;
    case 'notEquals':
      result = fieldValue !== condition.value;
      break;
    case 'contains':
      result = Array.isArray(fieldValue) 
        ? fieldValue.includes(condition.value)
        : String(fieldValue).includes(String(condition.value));
      break;
    case 'notContains':
      result = Array.isArray(fieldValue)
        ? !fieldValue.includes(condition.value)
        : !String(fieldValue).includes(String(condition.value));
      break;
    case 'greaterThan':
      result = Number(fieldValue) > Number(condition.value);
      break;
    case 'lessThan':
      result = Number(fieldValue) < Number(condition.value);
      break;
    case 'isEmpty':
      result = fieldValue === undefined || fieldValue === null || fieldValue === '' || 
        (Array.isArray(fieldValue) && fieldValue.length === 0);
      break;
    case 'isNotEmpty':
      result = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0);
      break;
    case 'in':
      result = condition.values?.includes(fieldValue) ?? false;
      break;
    case 'notIn':
      result = !(condition.values?.includes(fieldValue) ?? false);
      break;
    default:
      result = true;
  }
  
  // Handle AND conditions
  if (condition.and && condition.and.length > 0) {
    result = result && condition.and.every(c => evaluateCondition(c, formValues));
  }
  
  // Handle OR conditions
  if (condition.or && condition.or.length > 0) {
    result = result || condition.or.some(c => evaluateCondition(c, formValues));
  }
  
  return result;
};

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
};

const setNestedValue = (obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> => {
  const result = { ...obj };
  const parts = path.split('.');
  let current: Record<string, unknown> = result;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    } else {
      current[part] = { ...(current[part] as Record<string, unknown>) };
    }
    current = current[part] as Record<string, unknown>;
  }
  
  current[parts[parts.length - 1]] = value;
  return result;
};

// ============================================
// Field Renderer Component
// ============================================

interface FieldRendererProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  formValues: Record<string, unknown>;
  disabled?: boolean;
  readOnly?: boolean;
  size?: 'small' | 'middle' | 'large';
  parentPath?: string;
}

const FieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  formValues,
  disabled,
  readOnly,
  size,
  parentPath,
}) => {
  const isDisabled = disabled || field.disabled;
  const isReadOnly = readOnly || field.readOnly;
  const fieldPath = parentPath ? `${parentPath}.${field.key}` : field.key;
  
  // Handle custom render
  if (field.type === 'custom' && field.render) {
    return <>{field.render({ value, onChange, field, formValues })}</>;
  }

  // Common input style
  const inputStyle: React.CSSProperties = {
    width: '100%',
  };

  switch (field.type) {
    case 'text':
      return (
        <Input
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={isDisabled}
          readOnly={isReadOnly}
          maxLength={field.maxLength}
          showCount={field.showCount}
          allowClear={field.allowClear}
          prefix={field.prefix}
          suffix={field.suffix}
          addonBefore={field.addonBefore}
          addonAfter={field.addonAfter}
          size={size}
          style={inputStyle}
        />
      );

    case 'password':
      return (
        <Password
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={isDisabled}
          readOnly={isReadOnly}
          maxLength={field.maxLength}
          prefix={field.prefix}
          size={size}
          style={inputStyle}
        />
      );

    case 'number':
      return (
        <InputNumber
          value={value as number}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={isDisabled}
          readOnly={isReadOnly}
          min={field.min}
          max={field.max}
          step={field.step}
          precision={field.precision}
          prefix={field.prefix}
          addonBefore={field.addonBefore}
          addonAfter={field.addonAfter}
          size={size}
          style={inputStyle}
        />
      );

    case 'textarea':
      return (
        <TextArea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={isDisabled}
          readOnly={isReadOnly}
          rows={field.rows || 4}
          autoSize={field.autoSize}
          maxLength={field.maxLength}
          showCount={field.showCount}
          style={inputStyle}
        />
      );

    case 'select':
      return (
        <Select
          value={value}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={isDisabled}
          allowClear={field.allowClear}
          showSearch={field.showSearch}
          filterOption={field.showSearch ? true : undefined}
          loading={field.loading}
          size={size}
          style={inputStyle}
          options={field.options?.map((opt: SelectOption) => ({
            label: opt.label,
            value: opt.value,
            disabled: opt.disabled,
          }))}
        />
      );

    case 'multiselect':
      return (
        <Select
          mode={field.mode || 'multiple'}
          value={value as unknown[]}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={isDisabled}
          allowClear={field.allowClear}
          showSearch={field.showSearch}
          filterOption={field.showSearch ? true : undefined}
          loading={field.loading}
          size={size}
          style={inputStyle}
          options={field.options?.map((opt: SelectOption) => ({
            label: opt.label,
            value: opt.value,
            disabled: opt.disabled,
          }))}
        />
      );

    case 'boolean':
    case 'switch':
      return (
        <Switch
          checked={value as boolean}
          onChange={onChange}
          disabled={isDisabled}
          size={size === 'large' ? 'default' : 'small'}
        />
      );

    case 'checkbox':
      if (field.options && field.options.length > 0) {
        return (
          <Checkbox.Group
            value={value as (string | number | boolean)[]}
            onChange={onChange}
            disabled={isDisabled}
            style={{ display: 'flex', flexDirection: field.direction === 'horizontal' ? 'row' : 'column', gap: 8 }}
          >
            {field.options.map((opt: SelectOption) => (
              <Checkbox key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </Checkbox>
            ))}
          </Checkbox.Group>
        );
      }
      return (
        <Checkbox
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
          disabled={isDisabled}
        >
          {field.label}
        </Checkbox>
      );

    case 'radio':
      return (
        <Radio.Group
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          buttonStyle={field.buttonStyle}
          style={{ display: 'flex', flexDirection: field.direction === 'horizontal' ? 'row' : 'column', gap: 8 }}
        >
          {field.options?.map((opt: SelectOption) => (
            field.buttonStyle ? (
              <Radio.Button key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </Radio.Button>
            ) : (
              <Radio key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                {opt.label}
                {opt.description && (
                  <Text type="secondary" style={{ display: 'block', fontSize: 12, marginLeft: 22 }}>
                    {opt.description}
                  </Text>
                )}
              </Radio>
            )
          ))}
        </Radio.Group>
      );

    case 'slider':
      if (field.range) {
        return (
          <Slider
            range
            value={value as [number, number]}
            onChange={onChange}
            disabled={isDisabled}
            min={field.min}
            max={field.max}
            step={field.step}
            marks={field.marks}
            style={inputStyle}
          />
        );
      }
      return (
        <Slider
          value={value as number}
          onChange={onChange}
          disabled={isDisabled}
          min={field.min}
          max={field.max}
          step={field.step}
          marks={field.marks}
          style={inputStyle}
        />
      );

    case 'tags':
      return (
        <Select
          mode="tags"
          value={value as string[]}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={isDisabled}
          tokenSeparators={field.tokenSeparators || [',', ' ']}
          maxCount={field.maxTags}
          size={size}
          style={inputStyle}
          options={field.options?.map((opt: SelectOption) => ({
            label: opt.label,
            value: opt.value,
          }))}
        />
      );

    case 'date':
      return (
        <DatePicker
          value={value as any}
          onChange={(date) => onChange(date)}
          placeholder={field.placeholder}
          disabled={isDisabled}
          format={field.format}
          showTime={field.showTime}
          picker={field.picker}
          size={size}
          style={inputStyle}
        />
      );

    case 'daterange':
      return (
        <DatePicker.RangePicker
          value={value as any}
          onChange={(dates) => onChange(dates)}
          disabled={isDisabled}
          format={field.format}
          showTime={field.showTime}
          size={size}
          style={inputStyle}
        />
      );

    case 'time':
      return (
        <TimePicker
          value={value as any}
          onChange={(time) => onChange(time)}
          placeholder={field.placeholder}
          disabled={isDisabled}
          format={field.format || 'HH:mm:ss'}
          size={size}
          style={inputStyle}
        />
      );

    case 'color':
      return (
        <ColorPicker
          value={value as string}
          onChange={(_, hex) => onChange(hex)}
          disabled={isDisabled}
          showText
          size={size}
        />
      );

    case 'code':
    case 'json':
      return (
        <TextArea
          value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          onChange={(e) => {
            if (field.type === 'json') {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
                onChange(e.target.value);
              }
            } else {
              onChange(e.target.value);
            }
          }}
          placeholder={field.placeholder}
          disabled={isDisabled}
          readOnly={isReadOnly}
          rows={field.rows || 6}
          style={{
            ...inputStyle,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            minHeight: field.minHeight,
            maxHeight: field.maxHeight,
          }}
        />
      );

    case 'object':
      return (
        <ObjectField
          field={field}
          value={(value as Record<string, unknown>) || {}}
          onChange={onChange}
          formValues={formValues}
          disabled={isDisabled}
          readOnly={isReadOnly}
          size={size}
          parentPath={fieldPath}
        />
      );

    case 'array':
      return (
        <ArrayField
          field={field}
          value={(value as unknown[]) || []}
          onChange={onChange}
          formValues={formValues}
          disabled={isDisabled}
          readOnly={isReadOnly}
          size={size}
          parentPath={fieldPath}
        />
      );

    case 'divider':
      return <Divider style={{ margin: '8px 0' }}>{field.label}</Divider>;

    default:
      return (
        <Input
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={isDisabled}
          size={size}
          style={inputStyle}
        />
      );
  }
};

// ============================================
// Object Field Component
// ============================================

interface ObjectFieldProps {
  field: FormField;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  formValues: Record<string, unknown>;
  disabled?: boolean;
  readOnly?: boolean;
  size?: 'small' | 'middle' | 'large';
  parentPath: string;
}

const ObjectField: React.FC<ObjectFieldProps> = ({
  field,
  value,
  onChange,
  formValues,
  disabled,
  readOnly,
  size,
  parentPath,
}) => {
  const [collapsed, setCollapsed] = useState(field.defaultCollapsed ?? false);
  
  const handleFieldChange = (fieldKey: string, fieldValue: unknown) => {
    onChange({ ...value, [fieldKey]: fieldValue });
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {field.fields?.map((subField) => {
        // Check visibility condition
        if (subField.showWhen && !evaluateCondition(subField.showWhen, formValues)) {
          return null;
        }
        if (subField.hidden) return null;

        return (
          <div key={subField.key}>
            {subField.label && subField.type !== 'checkbox' && (
              <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 13 }}>
                  {subField.label}
                  {subField.required && <span style={{ color: 'var(--accent-error)', marginLeft: 2 }}>*</span>}
                </Text>
                {subField.tooltip && (
                  <Tooltip title={subField.tooltip}>
                    <QuestionCircleOutlined style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                  </Tooltip>
                )}
              </div>
            )}
            <FieldRenderer
              field={subField}
              value={value[subField.key]}
              onChange={(v) => handleFieldChange(subField.key, v)}
              formValues={formValues}
              disabled={disabled}
              readOnly={readOnly}
              size={size}
              parentPath={parentPath}
            />
            {subField.description && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                {subField.description}
              </Text>
            )}
          </div>
        );
      })}
    </div>
  );

  if (field.collapsible) {
    return (
      <Card
        size="small"
        style={{
          background: 'var(--bg-primary)',
          border: field.bordered !== false ? '1px solid var(--border-color)' : 'none',
        }}
      >
        <div
          onClick={() => setCollapsed(!collapsed)}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: collapsed ? 0 : 12,
          }}
        >
          <CaretRightOutlined
            style={{
              transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
              transition: 'transform 0.2s',
            }}
          />
          <Text strong>{field.label}</Text>
        </div>
        {!collapsed && content}
      </Card>
    );
  }

  if (field.bordered !== false) {
    return (
      <Card
        size="small"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
        }}
      >
        {content}
      </Card>
    );
  }

  return content;
};

// ============================================
// Array Field Component
// ============================================

interface ArrayFieldProps {
  field: FormField;
  value: unknown[];
  onChange: (value: unknown[]) => void;
  formValues: Record<string, unknown>;
  disabled?: boolean;
  readOnly?: boolean;
  size?: 'small' | 'middle' | 'large';
  parentPath: string;
}

const ArrayField: React.FC<ArrayFieldProps> = ({
  field,
  value,
  onChange,
  formValues,
  disabled,
  readOnly,
  size,
  parentPath,
}) => {
  const [collapsedItems, setCollapsedItems] = useState<Set<number>>(new Set());

  const handleAdd = () => {
    if (field.maxItems && value.length >= field.maxItems) return;
    
    const newItem = field.itemType === 'object' && field.itemFields
      ? field.itemFields.reduce((acc, f) => ({ ...acc, [f.key]: f.defaultValue }), {})
      : field.itemOptions?.defaultValue ?? '';
    
    onChange([...value, newItem]);
  };

  const handleRemove = (index: number) => {
    if (field.minItems && value.length <= field.minItems) return;
    onChange(value.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, itemValue: unknown) => {
    const newValue = [...value];
    newValue[index] = itemValue;
    onChange(newValue);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newValue = [...value];
    [newValue[index - 1], newValue[index]] = [newValue[index], newValue[index - 1]];
    onChange(newValue);
  };

  const handleMoveDown = (index: number) => {
    if (index === value.length - 1) return;
    const newValue = [...value];
    [newValue[index], newValue[index + 1]] = [newValue[index + 1], newValue[index]];
    onChange(newValue);
  };

  const toggleCollapse = (index: number) => {
    const newCollapsed = new Set(collapsedItems);
    if (newCollapsed.has(index)) {
      newCollapsed.delete(index);
    } else {
      newCollapsed.add(index);
    }
    setCollapsedItems(newCollapsed);
  };

  const isObjectArray = field.itemType === 'object' && field.itemFields;
  const canAdd = !field.maxItems || value.length < field.maxItems;
  const canRemove = !field.minItems || value.length > field.minItems;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.map((item, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: isObjectArray ? 'flex-start' : 'center',
          }}
        >
          {field.allowReorder && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                type="text"
                size="small"
                icon={<HolderOutlined />}
                disabled={disabled}
                onClick={() => handleMoveUp(index)}
                style={{ padding: 2 }}
              />
            </div>
          )}
          
          <div style={{ flex: 1 }}>
            {isObjectArray ? (
              <Card
                size="small"
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {field.collapsible && (
                  <div
                    onClick={() => toggleCollapse(index)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: collapsedItems.has(index) ? 0 : 12,
                    }}
                  >
                    <CaretRightOutlined
                      style={{
                        transform: collapsedItems.has(index) ? 'rotate(0deg)' : 'rotate(90deg)',
                        transition: 'transform 0.2s',
                      }}
                    />
                    <Text strong>
                      {field.itemLabel || 'Item'} {index + 1}
                    </Text>
                  </div>
                )}
                {!field.collapsible || !collapsedItems.has(index) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {field.itemFields?.map((subField) => {
                      const itemValue = item as Record<string, unknown>;
                      
                      if (subField.showWhen && !evaluateCondition(subField.showWhen, formValues)) {
                        return null;
                      }
                      if (subField.hidden) return null;

                      return (
                        <div key={subField.key}>
                          {subField.label && subField.type !== 'checkbox' && (
                            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Text style={{ fontSize: 13 }}>
                                {subField.label}
                                {subField.required && <span style={{ color: 'var(--accent-error)', marginLeft: 2 }}>*</span>}
                              </Text>
                              {subField.tooltip && (
                                <Tooltip title={subField.tooltip}>
                                  <QuestionCircleOutlined style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                                </Tooltip>
                              )}
                            </div>
                          )}
                          <FieldRenderer
                            field={subField}
                            value={itemValue[subField.key]}
                            onChange={(v) => handleItemChange(index, { ...itemValue, [subField.key]: v })}
                            formValues={formValues}
                            disabled={disabled}
                            readOnly={readOnly}
                            size={size}
                            parentPath={`${parentPath}[${index}]`}
                          />
                          {subField.description && (
                            <Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                              {subField.description}
                            </Text>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </Card>
            ) : (
              <FieldRenderer
                field={{
                  key: `${field.key}[${index}]`,
                  type: field.itemType || 'text',
                  ...field.itemOptions,
                }}
                value={item}
                onChange={(v) => handleItemChange(index, v)}
                formValues={formValues}
                disabled={disabled}
                readOnly={readOnly}
                size={size}
                parentPath={parentPath}
              />
            )}
          </div>

          {canRemove && !readOnly && (
            <Button
              type="text"
              danger
              icon={<MinusCircleOutlined />}
              onClick={() => handleRemove(index)}
              disabled={disabled}
              style={{ marginTop: isObjectArray ? 8 : 0 }}
            />
          )}
        </div>
      ))}

      {canAdd && !readOnly && (
        <Button
          type="dashed"
          onClick={handleAdd}
          icon={<PlusOutlined />}
          disabled={disabled}
          block
        >
          {field.addButtonText || `Add ${field.itemLabel || 'Item'}`}
        </Button>
      )}
    </div>
  );
};

// ============================================
// Section Renderer Component
// ============================================

interface SectionRendererProps {
  section: FormSection;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  formValues: Record<string, unknown>;
  disabled?: boolean;
  readOnly?: boolean;
  size?: 'small' | 'middle' | 'large';
  layout?: 'vertical' | 'horizontal' | 'inline';
  labelSpan?: number;
}

const SectionRenderer: React.FC<SectionRendererProps> = ({
  section,
  values,
  onChange,
  formValues,
  disabled,
  readOnly,
  size,
  layout,
  labelSpan,
}) => {
  const [collapsed, setCollapsed] = useState(section.defaultCollapsed ?? false);

  // Check visibility condition
  if (section.showWhen && !evaluateCondition(section.showWhen, formValues)) {
    return null;
  }

  const columns = section.columns || 1;
  const colSpan = Math.floor(24 / columns);

  const content = (
    <Row gutter={[16, 0]}>
      {section.items.map((field) => {
        // Check visibility condition
        if (field.showWhen && !evaluateCondition(field.showWhen, formValues)) {
          return null;
        }
        if (field.hidden) return null;

        const fieldSpan = field.span || colSpan;

        return (
          <Col key={field.key} span={fieldSpan}>
            <Form.Item
              label={field.type !== 'checkbox' || (field.options && field.options.length > 0) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{field.label}</span>
                  {field.tooltip && (
                    <Tooltip title={field.tooltip}>
                      <QuestionCircleOutlined style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                    </Tooltip>
                  )}
                </div>
              ) : undefined}
              required={field.required}
              help={field.description}
              labelCol={layout === 'horizontal' ? { span: field.labelSpan || labelSpan || 8 } : undefined}
              wrapperCol={layout === 'horizontal' ? { span: 24 - (field.labelSpan || labelSpan || 8) } : undefined}
              style={{ marginBottom: 16 }}
            >
              <FieldRenderer
                field={field}
                value={values[field.key] ?? field.defaultValue}
                onChange={(v) => onChange(field.key, v)}
                formValues={formValues}
                disabled={disabled}
                readOnly={readOnly}
                size={size}
              />
            </Form.Item>
          </Col>
        );
      })}
    </Row>
  );

  if (!section.title && !section.description) {
    return content;
  }

  if (section.collapsible) {
    return (
      <Collapse
        ghost
        activeKey={collapsed ? [] : ['section']}
        onChange={() => setCollapsed(!collapsed)}
        expandIcon={({ isActive }) => (
          <CaretRightOutlined rotate={isActive ? 90 : 0} />
        )}
        items={[
          {
            key: 'section',
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {section.icon}
                <span style={{ fontWeight: 600 }}>{section.title}</span>
              </div>
            ),
            children: (
              <>
                {section.description && (
                  <Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
                    {section.description}
                  </Paragraph>
                )}
                {content}
              </>
            ),
          },
        ]}
        style={{ marginBottom: 8 }}
      />
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {section.icon}
          <Title level={5} style={{ margin: 0 }}>{section.title}</Title>
        </div>
        {section.description && (
          <Text type="secondary" style={{ fontSize: 13 }}>{section.description}</Text>
        )}
      </div>
      {content}
    </div>
  );
};

// ============================================
// Main DynamicForm Component
// ============================================

const DynamicForm = forwardRef<DynamicFormInstance, DynamicFormProps>(({
  schema,
  initialValues = {},
  onSubmit,
  onCancel,
  onValuesChange,
  loading,
  disabled,
  readOnly,
  footer,
  className,
  style,
}, ref) => {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // Initialize with default values from schema, then override with initialValues
    const defaults: Record<string, unknown> = {};
    schema.sections.forEach(section => {
      section.items.forEach(field => {
        if (field.defaultValue !== undefined) {
          defaults[field.key] = field.defaultValue;
        }
        // Initialize array fields with minItems
        if (field.type === 'array' && field.minItems && field.minItems > 0 && !field.defaultValue) {
          const createDefaultItem = () => {
            if (field.itemType === 'object' && field.itemFields) {
              return field.itemFields.reduce((acc, f) => ({ ...acc, [f.key]: f.defaultValue }), {});
            }
            return field.itemOptions?.defaultValue ?? '';
          };
          defaults[field.key] = Array(field.minItems).fill(null).map(() => createDefaultItem());
        }
      });
    });
    return { ...defaults, ...initialValues };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues(prev => {
      const newValues = setNestedValue(prev, key, value);
      onValuesChange?.({ [key]: value }, newValues);
      return newValues;
    });
    // Clear error when value changes
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  }, [onValuesChange, errors]);

  const validateFields = useCallback(async (): Promise<Record<string, unknown>> => {
    const newErrors: Record<string, string> = {};
    
    // Validate all fields
    for (const section of schema.sections) {
      for (const field of section.items) {
        // Skip if hidden or conditional not met
        if (field.hidden) continue;
        if (field.showWhen && !evaluateCondition(field.showWhen, values)) continue;
        
        const value = getNestedValue(values, field.key);
        
        // Check required
        if (field.required) {
          const isEmpty = value === undefined || value === null || value === '' ||
            (Array.isArray(value) && value.length === 0);
          if (isEmpty) {
            newErrors[field.key] = `${field.label || field.key} is required`;
            continue;
          }
        }
        
        // Check custom rules
        if (field.rules) {
          for (const rule of field.rules) {
            let isValid = true;
            
            switch (rule.type) {
              case 'required':
                isValid = value !== undefined && value !== null && value !== '';
                break;
              case 'min':
                isValid = Number(value) >= (rule.value as number);
                break;
              case 'max':
                isValid = Number(value) <= (rule.value as number);
                break;
              case 'minLength':
                isValid = String(value).length >= (rule.value as number);
                break;
              case 'maxLength':
                isValid = String(value).length <= (rule.value as number);
                break;
              case 'pattern':
                isValid = new RegExp(rule.value as string).test(String(value));
                break;
              case 'email':
                isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
                break;
              case 'url':
                isValid = /^https?:\/\/.+/.test(String(value));
                break;
              case 'custom':
                if (rule.validator) {
                  isValid = await rule.validator(value, values);
                }
                break;
            }
            
            if (!isValid) {
              newErrors[field.key] = rule.message;
              break;
            }
          }
        }
      }
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      throw new Error('Validation failed');
    }
    
    return values;
  }, [schema, values]);

  const handleSubmit = useCallback(async () => {
    try {
      const validatedValues = await validateFields();
      await onSubmit?.(validatedValues);
    } catch {
      // Validation errors are already set
      if (schema.scrollToFirstError) {
        const firstErrorKey = Object.keys(errors)[0];
        if (firstErrorKey) {
          document.querySelector(`[data-field-key="${firstErrorKey}"]`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }
    }
  }, [validateFields, onSubmit, schema.scrollToFirstError, errors]);

  const handleReset = useCallback(() => {
    const defaults: Record<string, unknown> = {};
    schema.sections.forEach(section => {
      section.items.forEach(field => {
        if (field.defaultValue !== undefined) {
          defaults[field.key] = field.defaultValue;
        }
      });
    });
    setValues({ ...defaults, ...initialValues });
    setErrors({});
  }, [schema, initialValues]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getValues: () => values,
    setValues: (newValues) => setValues(prev => ({ ...prev, ...newValues })),
    resetValues: handleReset,
    validateFields,
    setFieldValue: (key, value) => handleChange(key, value),
    getFieldValue: (key) => getNestedValue(values, key),
    setFieldError: (key, error) => setErrors(prev => ({ ...prev, [key]: error })),
    clearFieldError: (key) => setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    }),
  }), [values, handleChange, handleReset, validateFields]);

  const showFooter = footer !== null && (footer || schema.showSubmit !== false || schema.showCancel || schema.showReset);

  return (
    <div className={className} style={style}>
      {/* Header */}
      {(schema.title || schema.description) && (
        <div style={{ marginBottom: 24 }}>
          {schema.title && (
            <Title level={4} style={{ margin: 0, marginBottom: schema.description ? 4 : 0 }}>
              {schema.title}
            </Title>
          )}
          {schema.description && (
            <Text type="secondary">{schema.description}</Text>
          )}
        </div>
      )}

      {/* Form */}
      <Form
        layout={schema.layout || 'vertical'}
        labelAlign={schema.labelAlign || 'left'}
        size={schema.size || 'middle'}
        colon={schema.colon ?? false}
        requiredMark={schema.requiredMark ?? true}
        disabled={disabled || loading}
      >
        {schema.sections.map((section) => (
          <SectionRenderer
            key={section.key}
            section={section}
            values={values}
            onChange={handleChange}
            formValues={values}
            disabled={disabled}
            readOnly={readOnly}
            size={schema.size}
            layout={schema.layout}
            labelSpan={schema.labelSpan}
          />
        ))}
      </Form>

      {/* Footer */}
      {showFooter && (
        <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {footer || (
            <>
              {schema.showReset && (
                <Button onClick={handleReset} disabled={loading}>
                  {schema.resetText || 'Reset'}
                </Button>
              )}
              {schema.showCancel && (
                <Button onClick={onCancel} disabled={loading}>
                  {schema.cancelText || 'Cancel'}
                </Button>
              )}
              {schema.showSubmit !== false && (
                <Button type="primary" onClick={handleSubmit} loading={loading}>
                  {schema.submitText || 'Submit'}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

DynamicForm.displayName = 'DynamicForm';

export default DynamicForm;

