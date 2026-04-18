import React, { useState, useEffect } from 'react';
import {
  Modal,
  Input,
  Button,
  Typography,
  message,
  Space,
  Tag,
  Collapse,
  Alert,
  Divider,
  Popover,
} from 'antd';
import {
  SaveOutlined,
  DeleteOutlined,
  CodeOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import {
  EmbeddingFunction,
  embeddingStore,
  EMBEDDING_EXAMPLES,
} from '../services/embeddingService';
import { useTheme } from '../contexts/ThemeContext';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface EmbeddingConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (func: EmbeddingFunction) => void;
  editingFunction?: EmbeddingFunction | null;
}

const EmbeddingConfigModal: React.FC<EmbeddingConfigModalProps> = ({
  open,
  onClose,
  onSave,
  editingFunction,
}) => {
  const { mode } = useTheme();
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [selectedExample, setSelectedExample] = useState<string>('');

  const isEditing = Boolean(editingFunction);
  const monacoTheme = mode === 'dark' ? 'vs-dark' : 'vs';

  useEffect(() => {
    if (open) {
      if (editingFunction) {
        setName(editingFunction.name);
        setDescription(editingFunction.description || '');
        setCode(editingFunction.code);
        setSelectedExample('');
      } else {
        setName('');
        setDescription('');
        setCode('');
        setSelectedExample('');
      }
    }
  }, [open, editingFunction]);

  const handleLoadExample = (exampleKey: string) => {
    const example = EMBEDDING_EXAMPLES[exampleKey];
    if (example) {
      setName(example.name);
      setDescription(example.description);
      setCode(example.code);
      setSelectedExample(exampleKey);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      message.error('Name is required');
      return;
    }
    if (!code.trim()) {
      message.error('Code is required');
      return;
    }

    // Basic validation - check if code contains embed function
    if (!code.includes('async function embed') && !code.includes('function embed')) {
      message.warning('Code should contain an async function named "embed"');
    }

    const func: EmbeddingFunction = {
      id: editingFunction?.id || `embed_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      code: code.trim(),
      createdAt: editingFunction?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSave(func);
    message.success(isEditing ? 'Embedding function updated' : 'Embedding function saved');
    onClose();
  };

  const handleDelete = () => {
    if (!editingFunction) return;

    if (window.confirm(`Delete "${editingFunction.name}"?`)) {
      embeddingStore.delete(editingFunction.id);
      message.success('Embedding function deleted');
      onClose();
    }
  };

  const exampleKeys = Object.keys(EMBEDDING_EXAMPLES);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CodeOutlined style={{ fontSize: 18 }} />
          <Text strong style={{ fontSize: 16 }}>
            {isEditing ? 'Edit' : 'Create'} Embedding Function
          </Text>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={1000}
      centered
      maskClosable={false}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEditing && (
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                Delete
              </Button>
            )}
          </div>
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
              {isEditing ? 'Update' : 'Save'}
            </Button>
          </Space>
        </div>
      }
      styles={{
        body: {
          padding: 0,
        },
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 200px)',
        }}
      >
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Info Alert */}
            {!isEditing && (
              <Alert
                message="What are Embedding Functions?"
                description={
                  <div style={{ marginTop: 8 }}>
                    <Paragraph style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                      Embedding functions allow you to generate vector embeddings from text or files
                      using any API or service. They run in a secure sandbox and can integrate with
                      OpenAI, Hugging Face, local models, or any custom endpoint.
                    </Paragraph>
                  </div>
                }
                type="info"
                icon={<InfoCircleOutlined />}
                showIcon
                style={{ borderRadius: 6 }}
              />
            )}

            {/* Basic Info Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Name
                </Text>
                <Input
                  placeholder="e.g., OpenAI Embeddings"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  size="small"
                  style={{ borderRadius: 6 }}
                />
              </div>

              <div>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Description{' '}
                  <Text type="secondary" style={{ fontWeight: 400 }}>
                    (optional)
                  </Text>
                </Text>
                <Input
                  placeholder="Brief description of what this function does"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  size="small"
                  style={{ borderRadius: 6 }}
                />
              </div>
            </div>

            <Divider style={{ margin: '8px 0' }} />

            {/* Examples Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <BulbOutlined style={{ color: 'var(--text-muted)', fontSize: 14 }} />
                <Text
                  type="secondary"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Quick Start Examples
                </Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {exampleKeys.map((key) => {
                  const example = EMBEDDING_EXAMPLES[key];
                  return (
                    <Button
                      key={key}
                      size="small"
                      type={selectedExample === key ? 'primary' : 'default'}
                      onClick={() => handleLoadExample(key)}
                      style={{ fontSize: 11, borderRadius: 4 }}
                    >
                      {example.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Divider style={{ margin: '8px 0' }} />

            {/* Code Editor Section */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CodeOutlined style={{ color: 'var(--text-muted)', fontSize: 14 }} />
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Function Code
                  </Text>
                  <Popover
                    content={
                      <div
                        style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}
                      >
                        <div>
                          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            Function Signature
                          </Text>
                          <Paragraph style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                            Your function must be named{' '}
                            <code
                              style={{
                                background: 'var(--bg-elevated)',
                                padding: '2px 6px',
                                borderRadius: 3,
                                fontSize: 11,
                              }}
                            >
                              embed
                            </code>{' '}
                            and accept four parameters:
                          </Paragraph>
                          <ul
                            style={{
                              margin: '6px 0 0 18px',
                              padding: 0,
                              fontSize: 12,
                              lineHeight: 1.7,
                            }}
                          >
                            <li>
                              <code
                                style={{
                                  background: 'var(--bg-elevated)',
                                  padding: '2px 6px',
                                  borderRadius: 3,
                                  fontSize: 11,
                                }}
                              >
                                text
                              </code>{' '}
                              - String input (undefined if using file)
                            </li>
                            <li>
                              <code
                                style={{
                                  background: 'var(--bg-elevated)',
                                  padding: '2px 6px',
                                  borderRadius: 3,
                                  fontSize: 11,
                                }}
                              >
                                file
                              </code>{' '}
                              - File object (undefined if using text)
                            </li>
                            <li>
                              <code
                                style={{
                                  background: 'var(--bg-elevated)',
                                  padding: '2px 6px',
                                  borderRadius: 3,
                                  fontSize: 11,
                                }}
                              >
                                fetch
                              </code>{' '}
                              - Fetch API for HTTP requests
                            </li>
                            <li>
                              <code
                                style={{
                                  background: 'var(--bg-elevated)',
                                  padding: '2px 6px',
                                  borderRadius: 3,
                                  fontSize: 11,
                                }}
                              >
                                FormData
                              </code>{' '}
                              - For file uploads
                            </li>
                          </ul>
                        </div>

                        <div>
                          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            Return Value
                          </Text>
                          <Paragraph style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                            Return an array of numbers representing the embedding vector. The array
                            length should match your collection's vector dimension.
                          </Paragraph>
                        </div>

                        <div>
                          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            Security & Privacy
                          </Text>
                          <Paragraph style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                            Functions run in a secure sandbox. They can make HTTP requests but
                            cannot access the filesystem or Node.js APIs. All functions and API keys
                            are saved locally on your computer only and never leave your device.
                          </Paragraph>
                        </div>
                      </div>
                    }
                    title="How to write an embedding function"
                    trigger="click"
                    placement="rightTop"
                  >
                    <QuestionCircleOutlined
                      style={{
                        fontSize: 14,
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary-color)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    />
                  </Popover>
                </div>
                <Tag
                  color="blue"
                  style={{ fontSize: 10, margin: 0, borderRadius: 4, padding: '2px 8px' }}
                >
                  async function embed(text, file, fetch, FormData)
                </Tag>
              </div>

              <div
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <Editor
                  height="380px"
                  language="javascript"
                  theme={monacoTheme}
                  value={code}
                  onChange={(value) => {
                    setCode(value || '');
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                    lineNumbers: 'on',
                    folding: true,
                    padding: { top: 12, bottom: 12 },
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

export default EmbeddingConfigModal;
