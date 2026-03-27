import React, { useState, useEffect, useMemo } from 'react';
import {
    Modal,
    Input,
    InputNumber,
    Button,
    Space,
    Typography,
    message,
    Tooltip,
    Tag,
} from 'antd';
import {
    InfoCircleOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import {
    CollectionSchema,
    Document,
    DocumentVector,
    COLLECTION_DEFAULT_VECTOR,
} from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { generateRandomVector as generateRandomVectorUtil } from '../services/vectorUtils';

const { Text } = Typography;
const { TextArea } = Input;

interface UpsertDocumentModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (document: Partial<Document>) => Promise<{ success: boolean; error?: string }>;
    collectionSchema: CollectionSchema;
    editDocument?: Document | null;
}

const UpsertDocumentModal: React.FC<UpsertDocumentModalProps> = ({
    open,
    onClose,
    onSubmit,
    collectionSchema,
    editDocument,
}) => {
    const { mode } = useTheme();
    const [loading, setLoading] = useState(false);
    const [documentPrimary, setDocumentPrimary] = useState<{ name: string; value: string | number | null | undefined } | null>(null);
    const [vectors, setVectors] = useState<Record<string, string>>({});
    const [payloadJson, setPayloadJson] = useState('{}');
    const [payloadError, setPayloadError] = useState<string | null>(null);

    const isEditing = Boolean(editDocument);
    const vectorFields = useMemo(
        () => Object.values(collectionSchema.vectors || {}),
        [collectionSchema],
    );
    const schemaFields = useMemo(
        () => Object.values(collectionSchema.fields || {}),
        [collectionSchema],
    );
    const primaryKey = collectionSchema.primary;
    const isAutoID = primaryKey?.autoID === true;
    const monacoTheme = mode === 'dark' ? 'vs-dark' : 'vs';

    useEffect(() => {
        if (!open) return;

        if (editDocument) {
            setDocumentPrimary(editDocument.primary);

            const vectorStrings: Record<string, string> = {};
            Object.entries(editDocument.vectors || {}).forEach(([k, v]) => {
                // Format vector based on type
                if (v.vectorType === 'dense' || v.vectorType === 'binary') {
                    // Dense/binary: extract data array
                    vectorStrings[k] = 'data' in v.value ? JSON.stringify(v.value.data) : '[]';
                } else if (v.vectorType === 'sparse') {
                    // Sparse: use indices/values format
                    vectorStrings[k] = JSON.stringify(v.value);
                }
            });
            setVectors(vectorStrings);

            setPayloadJson(JSON.stringify(editDocument.payload || {}, null, 2));
        } else {
            setDocumentPrimary(null);

            const emptyVectors: Record<string, string> = {};
            vectorFields.forEach(f => {
                emptyVectors[f.name] = '';
            });
            setVectors(emptyVectors);

            setPayloadJson(generateDefaultPayload());
        }

        setPayloadError(null);
    }, [open, editDocument, vectorFields, schemaFields]);

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    // Generate default payload JSON based on schema
    const generateDefaultPayload = (): string => {
        const defaultPayload: Record<string, unknown> = {};
        schemaFields.forEach(field => {
            switch (field.type) {
                case 'number': defaultPayload[field.name] = 0; break;
                case 'boolean': defaultPayload[field.name] = false; break;
                case 'array': defaultPayload[field.name] = []; break;
                case 'object': defaultPayload[field.name] = {}; break;
                case 'date': defaultPayload[field.name] = new Date().toISOString(); break;
                case 'string': defaultPayload[field.name] = ''; break;
                case 'unknown': default: // Set unknown field types to null
                    defaultPayload[field.name] = null; break;
            }
        });
        return JSON.stringify(defaultPayload, null, 2);
    };

    const validatePayload = (json: string) => {
        try {
            JSON.parse(json);
            setPayloadError(null);
            return true;
        } catch {
            setPayloadError('Invalid JSON');
            return false;
        }
    };

    const generateRandomVector = (key: string) => {
        const field = collectionSchema.vectors[key];
        if (!field) {
            message.warning('Unknown vector field');
            return;
        }

        try {
            const vectorJson = generateRandomVectorUtil(field.vectorType, "size" in field ? field.size : undefined);
            setVectors(v => ({ ...v, [field.name]: vectorJson }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Failed to generate vector');
        }
    };

    const handleSubmit = async () => {
        if (!validatePayload(payloadJson)) {
            message.error('Fix payload JSON');
            return;
        }

        const parsedVectors: Record<string, DocumentVector> = {};
        for (const [k, v] of Object.entries(vectors)) {
            if (!v.trim()) continue;

            const field = collectionSchema.vectors[k];
            if (!field) {
                message.error(`Unknown vector field "${k}"`);
                return;
            }

            try {
                const parsed = JSON.parse(v);
                
                if (field.vectorType === 'dense') {
                    // Dense vector: expect array of numbers
                    if (!Array.isArray(parsed) || parsed.some(x => typeof x !== 'number')) {
                        message.error(`Dense vector "${k}" must be an array of numbers`);
                        return;
                    }
                    parsedVectors[k] = {
                        key: k,
                        vectorType: 'dense',
                        size: parsed.length,
                        value: { data: parsed },
                    };
                } else if (field.vectorType === 'binary') {
                    // Binary vector: expect array of numbers (bytes 0-255)
                    if (!Array.isArray(parsed) || parsed.some(x => typeof x !== 'number' || x < 0 || x > 255)) {
                        message.error(`Binary vector "${k}" must be an array of numbers (0-255)`);
                        return;
                    }
                    parsedVectors[k] = {
                        key: k,
                        vectorType: 'binary',
                        size: parsed.length * 8, // Size in bits
                        value: { data: parsed },
                    };
                } else if (field.vectorType === 'sparse') {
                    // Sparse vector: expect {indices: [], values: []}
                    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.indices) || !Array.isArray(parsed.values)) {
                        message.error(`Sparse vector "${k}" must be {indices: [...], values: [...]}`);
                        return;
                    }
                    if (parsed.indices.length !== parsed.values.length) {
                        message.error(`Sparse vector "${k}": indices and values must have same length`);
                        return;
                    }
                    if (parsed.indices.some((x: any) => typeof x !== 'number') || parsed.values.some((x: any) => typeof x !== 'number')) {
                        message.error(`Sparse vector "${k}": indices and values must be numeric`);
                        return;
                    }
                    parsedVectors[k] = {
                        key: k,
                        vectorType: 'sparse',
                        value: { indices: parsed.indices, values: parsed.values },
                    };
                }
            } catch {
                message.error(`Invalid JSON for vector "${k}"`);
                return;
            }
        }

        if (!Object.keys(parsedVectors).length) {
            message.error('At least one vector is required');
            return;
        }

        const doc: Partial<Document> = {
            vectors: parsedVectors,
            payload: JSON.parse(payloadJson),
        };

        // Handle primary key
        if (isEditing && editDocument?.primary) {
            // When editing, always include the primary key
            doc.primary = editDocument.primary;
        } else if (!isAutoID && documentPrimary?.value != null && documentPrimary.value !== '' && documentPrimary.value !== undefined) {
            // When creating without autoID, include primary key with user-provided value
            doc.primary = {
                name: primaryKey.name,
                value: primaryKey.type === 'number' 
                    ? (typeof documentPrimary.value === 'number' ? documentPrimary.value : Number(documentPrimary.value))
                    : String(documentPrimary.value),
            };
        }
        // If autoID and creating, don't set primary - database will generate it

        setLoading(true);
        try {
            const res = await onSubmit(doc);
            if (res.success) {
                message.success(isEditing ? 'Document updated' : 'Document created');
                onClose();
            } else {
                message.error(res.error || 'Save failed');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={<Text strong style={{ fontSize: 16 }}>{isEditing ? 'Edit Document' : 'Create Document'}</Text>}
            open={open}
            onCancel={onClose}
            width={880}
            centered
            maskClosable={false}
            destroyOnHidden
            styles={{
                body: {
                    padding: 0,
                },
            }}
            style={{ maxHeight: '100vh' }}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="danger" style={{ fontSize: 12 }}>
                        {payloadError}
                    </Text>
                    <Space>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button type="primary" loading={loading} onClick={handleSubmit}>
                            {isEditing ? 'Update' : 'Create'}
                        </Button>
                    </Space>
                </div>
            }
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 'calc(100vh - 120px)',
                }}
            >
                <div
                    style={{
                        padding: '20px 24px',
                        overflowY: 'auto',
                        flex: 1,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <Text strong style={{ minWidth: 90, fontSize: 12 }}>
                                {collectionSchema.primary.name}
                            </Text>
                            {primaryKey.type === 'number' ? (
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <InputNumber
                                        size="small"
                                        value={typeof documentPrimary?.value === 'number' ? documentPrimary.value : (documentPrimary?.value ? Number(documentPrimary.value) : undefined)}
                                        disabled={isEditing || isAutoID}
                                        onChange={value => setDocumentPrimary({ name: collectionSchema.primary.name, value: value ?? null })}
                                        style={{ width: '100%', paddingRight: 24 }}
                                    />
                                    <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
                                        <Tooltip title={isAutoID ? "Auto-generated by database" : "Auto-generated when empty"}>
                                            <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'help' }} />
                                        </Tooltip>
                                    </div>
                                </div>
                            ) : (
                                <Input
                                    size="small"
                                    value={documentPrimary?.value?.toString() || ''}
                                    disabled={isEditing || isAutoID}
                                    onChange={e => setDocumentPrimary({ name: collectionSchema.primary.name, value: e.target.value })}
                                    suffix={
                                        <Tooltip title={isAutoID ? "Auto-generated by database" : "Auto-generated when empty"}>
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    }
                                />
                            )}
                        </div>

                        {vectorFields.map(field => {
                            // Determine label and placeholder based on vector type
                            let sizeLabel = '';
                            let placeholder = '';
                            
                            if (field.vectorType === 'dense') {
                                sizeLabel = `${field.size}D dense`;
                                placeholder = `[0.1, 0.2, ...] (${field.size} dimensions)`;
                            } else if (field.vectorType === 'binary') {
                                sizeLabel = `${field.size} bits binary`;
                                placeholder = `[0, 255, 128, ...] (bytes 0-255)`;
                            } else if (field.vectorType === 'sparse') {
                                sizeLabel = 'sparse';
                                placeholder = `{"indices": [0, 5, 12], "values": [0.5, 0.3, 0.8]}`;
                            }
                            
                            return (
                                <div
                                    key={field.name}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 4,
                                        padding: 8,
                                        background: 'var(--bg-elevated)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <Text strong style={{ fontSize: 11 }}>
                                            {field.name === COLLECTION_DEFAULT_VECTOR ? 'vector' : field.name}
                                        </Text>
                                        <Tag 
                                            color={field.vectorType === 'sparse' ? 'orange' : 'blue'} 
                                            style={{ margin: 0, fontSize: 10, padding: '0 4px' }}
                                        >
                                            {sizeLabel}
                                        </Tag>
                                        <div style={{ flex: 1 }} />
                                        <Tooltip title="Generate random vector">
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<ThunderboltOutlined />}
                                                onClick={() => generateRandomVector(field.name)}
                                                style={{ padding: '0 4px', height: 20, fontSize: 11 }}
                                            />
                                        </Tooltip>
                                    </div>

                                    <TextArea
                                        autoSize={{ minRows: 2, maxRows: 3 }}
                                        value={vectors[field.name] || ''}
                                        onChange={e =>
                                            setVectors(v => ({ ...v, [field.name]: e.target.value }))
                                        }
                                        placeholder={placeholder}
                                        style={{ fontFamily: 'monospace', fontSize: 10 }}
                                    />
                                </div>
                            );
                        })}

                        <div>
                            <Text strong style={{ fontSize: 13 }}>Payload</Text>
                            <div style={{ marginTop: 8, border: '1px solid var(--border-color)', borderRadius: 6 }}>
                                <Editor
                                    height="260px"
                                    language="json"
                                    theme={monacoTheme}
                                    value={payloadJson}
                                    onChange={v => {
                                        setPayloadJson(v || '{}');
                                        validatePayload(v || '{}');
                                    }}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 12,
                                        wordWrap: 'on',
                                        automaticLayout: true,
                                        scrollBeyondLastLine: false,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default UpsertDocumentModal;
