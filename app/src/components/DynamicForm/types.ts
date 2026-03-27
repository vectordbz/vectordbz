// ============================================
// Dynamic Form Schema Types
// ============================================

export type FieldType =
  | 'text'
  | 'number'
  | 'password'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'switch'
  | 'checkbox'
  | 'radio'
  | 'slider'
  | 'tags'
  | 'date'
  | 'daterange'
  | 'time'
  | 'color'
  | 'code'
  | 'json'
  | 'object'
  | 'array'
  | 'divider'
  | 'custom';

export interface SelectOption {
  label: string;
  value: string | number | boolean;
  disabled?: boolean;
  description?: string;
  icon?: React.ReactNode;
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'email' | 'url' | 'custom';
  value?: number | string | RegExp;
  message: string;
  validator?: (value: unknown, formValues: Record<string, unknown>) => boolean | Promise<boolean>;
}

export interface ConditionalRule {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty' | 'in' | 'notIn';
  value?: unknown;
  values?: unknown[]; // for 'in' and 'notIn' operators
  and?: ConditionalRule[];
  or?: ConditionalRule[];
}

export interface BaseFormField {
  key: string;
  label?: string;
  type: FieldType;
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  rules?: ValidationRule[];
  showWhen?: ConditionalRule;
  span?: number; // Grid span (1-24), default 24 (full width)
  labelSpan?: number; // Label column span for horizontal layout
  tooltip?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  addonBefore?: React.ReactNode;
  addonAfter?: React.ReactNode;
  onChange?: (value: unknown, formValues: Record<string, unknown>) => void;
}

// Text field specific options
export interface TextFieldOptions {
  maxLength?: number;
  showCount?: boolean;
  allowClear?: boolean;
}

// Number field specific options
export interface NumberFieldOptions {
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  formatter?: (value: number | undefined) => string;
  parser?: (value: string | undefined) => number;
}

// Textarea field specific options
export interface TextareaFieldOptions {
  rows?: number;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  maxLength?: number;
  showCount?: boolean;
}

// Select field specific options
export interface SelectFieldOptions {
  options: SelectOption[];
  allowClear?: boolean;
  showSearch?: boolean;
  filterOption?: boolean | ((input: string, option: SelectOption) => boolean);
  loading?: boolean;
  mode?: 'multiple' | 'tags'; // for multiselect
}

// Radio/Checkbox field specific options
export interface RadioCheckboxFieldOptions {
  options: SelectOption[];
  direction?: 'horizontal' | 'vertical';
  buttonStyle?: 'outline' | 'solid'; // for radio buttons
}

// Slider field specific options
export interface SliderFieldOptions {
  min?: number;
  max?: number;
  step?: number;
  marks?: Record<number, string | { label: string; style?: React.CSSProperties }>;
  range?: boolean;
  vertical?: boolean;
  tooltip?: boolean;
}

// Tags field specific options
export interface TagsFieldOptions {
  maxTags?: number;
  allowDuplicates?: boolean;
  tokenSeparators?: string[];
  options?: SelectOption[]; // Predefined suggestions
}

// Date field specific options
export interface DateFieldOptions {
  format?: string;
  showTime?: boolean | { format?: string };
  picker?: 'date' | 'week' | 'month' | 'quarter' | 'year';
  disabledDate?: (current: Date) => boolean;
}

// Code/JSON field specific options
export interface CodeFieldOptions {
  language?: string;
  lineNumbers?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

// Object field specific options (nested fields)
export interface ObjectFieldOptions {
  fields: FormField[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  bordered?: boolean;
}

// Array field specific options
export interface ArrayFieldOptions {
  itemType: FieldType;
  itemLabel?: string;
  itemFields?: FormField[]; // For array of objects
  itemOptions?: Partial<FormField>; // For array of primitives
  minItems?: number;
  maxItems?: number;
  allowReorder?: boolean;
  allowDuplicate?: boolean;
  addButtonText?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

// Custom field options
export interface CustomFieldOptions {
  render: (props: {
    value: unknown;
    onChange: (value: unknown) => void;
    field: FormField;
    formValues: Record<string, unknown>;
  }) => React.ReactNode;
}

// Union type for field-specific options
export type FieldOptions =
  | TextFieldOptions
  | NumberFieldOptions
  | TextareaFieldOptions
  | SelectFieldOptions
  | RadioCheckboxFieldOptions
  | SliderFieldOptions
  | TagsFieldOptions
  | DateFieldOptions
  | CodeFieldOptions
  | ObjectFieldOptions
  | ArrayFieldOptions
  | CustomFieldOptions;

// Complete FormField type
export interface FormField extends BaseFormField {
  // Field-specific options (type-safe based on field type)
  options?: SelectOption[];
  
  // Text/Textarea options
  maxLength?: number;
  showCount?: boolean;
  allowClear?: boolean;
  rows?: number;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  
  // Number/Slider options
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  marks?: Record<number, string | { label: string; style?: React.CSSProperties }>;
  range?: boolean;
  
  // Select options
  showSearch?: boolean;
  filterOption?: boolean | ((input: string, option: SelectOption) => boolean);
  loading?: boolean;
  mode?: 'multiple' | 'tags';
  
  // Radio/Checkbox options
  direction?: 'horizontal' | 'vertical';
  buttonStyle?: 'outline' | 'solid';
  
  // Tags options
  maxTags?: number;
  allowDuplicates?: boolean;
  tokenSeparators?: string[];
  
  // Date options
  format?: string;
  showTime?: boolean | { format?: string };
  picker?: 'date' | 'week' | 'month' | 'quarter' | 'year';
  disabledDate?: (current: Date) => boolean;
  
  // Code/JSON options
  language?: string;
  lineNumbers?: boolean;
  minHeight?: number;
  maxHeight?: number;
  
  // Object/Array options
  fields?: FormField[];
  itemType?: FieldType;
  itemLabel?: string;
  itemFields?: FormField[];
  itemOptions?: Partial<FormField>;
  minItems?: number;
  maxItems?: number;
  allowReorder?: boolean;
  allowDuplicate?: boolean;
  addButtonText?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  bordered?: boolean;
  
  // Custom render
  render?: (props: {
    value: unknown;
    onChange: (value: unknown) => void;
    field: FormField;
    formValues: Record<string, unknown>;
  }) => React.ReactNode;
}

// Form Section
export interface FormSection {
  key: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  showWhen?: ConditionalRule;
  items: FormField[];
  columns?: number; // Number of columns in grid (1-4), default 1
}

// Complete Form Schema
export interface DynamicFormSchema {
  title?: string;
  description?: string;
  sections: FormSection[];
  layout?: 'vertical' | 'horizontal' | 'inline';
  labelAlign?: 'left' | 'right';
  labelSpan?: number; // Default label span for horizontal layout
  size?: 'small' | 'middle' | 'large';
  colon?: boolean;
  requiredMark?: boolean | 'optional';
  scrollToFirstError?: boolean;
  submitText?: string;
  cancelText?: string;
  showSubmit?: boolean;
  showCancel?: boolean;
  showReset?: boolean;
  resetText?: string;
}

// Form Props
export interface DynamicFormProps {
  schema: DynamicFormSchema;
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  onValuesChange?: (changedValues: Record<string, unknown>, allValues: Record<string, unknown>) => void;
  loading?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  footer?: React.ReactNode | null;
  className?: string;
  style?: React.CSSProperties;
}

// Form Instance (ref)
export interface DynamicFormInstance {
  getValues: () => Record<string, unknown>;
  setValues: (values: Record<string, unknown>) => void;
  resetValues: () => void;
  validateFields: () => Promise<Record<string, unknown>>;
  setFieldValue: (key: string, value: unknown) => void;
  getFieldValue: (key: string) => unknown;
  setFieldError: (key: string, error: string) => void;
  clearFieldError: (key: string) => void;
}

