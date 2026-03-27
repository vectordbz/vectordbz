import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Button,
  Space,
  Typography,
  Divider,
  Switch,
  List,
  Popconfirm,
  Tabs,
  message,
} from 'antd';
import {
  CloudOutlined,
  LockOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlusOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ApartmentOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ConnectionConfig, DatabaseType, DatabaseOption, SavedConnection } from '../types';
import { databaseOptions } from '../services/databases';

const { Text, Title } = Typography;

interface ConnectionModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (connectionId: string, connectionName: string, config: ConnectionConfig) => void;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({
  open,
  onClose,
  onConnect,
}) => {
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [form] = Form.useForm();
  const [selectedType, setSelectedType] = useState<DatabaseType>('qdrant');
  const [useHttps, setUseHttps] = useState(false);
  const [saveConnection, setSaveConnection] = useState(false);
  const [connectionName, setConnectionName] = useState('');
  const [activeTab, setActiveTab] = useState('new');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingConnectionId, setLoadingConnectionId] = useState<string | null>(null);


  const loadSavedConnections = async () => {
    try {
      const connections = await window.electronAPI.store.getConnections();
      setSavedConnections(connections as SavedConnection[]);
    } catch (error) {
      console.error('Failed to load saved connections:', error);
    }
  };

  // Reset form and state when modal opens
  useEffect(() => {
    if (open) {
      // Reset form to initial values
      form.resetFields();
      // Reset all state to initial values
      setSelectedType('qdrant');
      handleDatabaseTypeChange(databaseOptions.find(db => db.value === 'qdrant')!);
      setUseHttps(false);
      setSaveConnection(false);
      setConnectionName('');
      setActiveTab('new');
      setTestingConnection(false);
      setTestResult(null);
      setLoading(false);
      setLoadingConnectionId(null);
      loadSavedConnections();
    }
  }, [open, form]);

  const handleTestConnection = async () => {
    try {
      await form.validateFields(['host', 'port']);
      // Get all form values (including optional fields like apiKey)
      const values = form.getFieldsValue();

      setTestingConnection(true);
      setTestResult(null);

      const config: ConnectionConfig = {
        type: selectedType,
        apiKey: values.apiKey?.trim() || undefined,
        https: useHttps,
        host: values.host?.trim() || '',
        port: values.port,
        tenant: values.tenant?.trim() || undefined,
        database: values.database?.trim() || undefined,
        user: values.user?.trim() || undefined,
        password: values.password?.trim() || undefined,
      };


      const result = await window.electronAPI.db.testConnection(config);

      if (result.success) {
        setTestResult({
          success: true,
          message: `Connection successful${result.version ? ` (${result.version})` : ''}`,
        });
        message.success('Connection test successful!');
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Connection test failed',
        });
        message.error(result.error || 'Connection test failed');
      }
    } catch (error: any) {
      if (error.errorFields) {
        // Form validation error
        message.error('Please fill in all required fields');
      } else {
        setTestResult({
          success: false,
          message: error instanceof Error ? error.message : 'Connection test failed',
        });
        message.error('Connection test failed');
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const handleDeleteSavedConnection = async (id: string) => {
    try {
      await window.electronAPI.store.deleteConnection(id);
      await loadSavedConnections();
      message.success('Connection deleted');
    } catch (error) {
      message.error('Failed to delete connection');
    }
  };

  const handleUseSavedConnection = async (connection: SavedConnection) => {
    setLoadingConnectionId(connection.id);
    try {
      await handleConnect(connection.id, connection, connection.name, false);
    } finally {
      setLoadingConnectionId(null);
    }
  };

  const generateConnectionId = () => `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const handleSubmit = async (values: { host?: string; port?: number; apiKey?: string; tenant?: string; database?: string; user?: string; password?: string; }) => {
    let displayName = connectionName;
    if (!displayName) {
      if (selectedType === 'pinecone') {
        displayName = `pinecone@cloud`;
      } else if (values.tenant && values.database) {
        displayName = `${selectedType}@${values.tenant}/${values.database}`;
      } else {
        displayName = `${selectedType}@${values.host}${values.port ? `:${values.port}` : ''}`;
      }
    }

    const connectionId = generateConnectionId();
    const config: ConnectionConfig = {
      ...values,
      type: selectedType,
      https: useHttps,
    };
    await handleConnect(connectionId, config, displayName, saveConnection);
  };

  const handleConnect = async (connectionId: string, config: ConnectionConfig, connectionDisplayName: string, saveConnection: boolean) => {
    try {
      setLoading(true);
      const result = await window.electronAPI.db.connect(connectionId, {
        ...config,
      });

      if (result.success) {
        // Verify connection status before fetching collections
        const status = await window.electronAPI.db.getConnectionStatus(connectionId);
        if (!status.connected || status.type !== config.type) {
          throw new Error('Connection verification failed');
        }

        // Save connection only if explicitly requested
        if (saveConnection && connectionDisplayName) {
          await window.electronAPI.store.saveConnection({
            name: connectionDisplayName,
            ...config,
          });
        }
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error) {
      message.error('Connection failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
    finally {
      setLoading(false);
    }

    onConnect(
      connectionId,
      connectionDisplayName,
      config,
    );
  }

  const handleDatabaseTypeChange = (db: DatabaseOption) => {
    form.setFieldsValue(db.presets);
    setSelectedType(db.value);
  };

  const shouldShowField = (field: string) => {
    return databaseOptions.find(db => db.value === selectedType)?.fields.includes(field);
  }

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      centered
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 16,
        border: '1px solid var(--border-color)',
      }}
    >
      <div style={{ padding: '8px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 0 30px rgba(99, 102, 241, 0.4)',
            }}
          >
            <CloudOutlined style={{ fontSize: 28, color: 'white' }} />
          </div>
          <Title level={4} style={{ margin: 0, color: 'var(--text-primary)' }}>
            Connect to Database
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Connect to a vector database to explore your data
          </Text>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'new',
              label: (
                <Space>
                  <PlusOutlined />
                  New Connection
                </Space>
              ),
              children: (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
                      Database Type
                    </Text>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {databaseOptions.map((db) => (
                        <Button
                          key={db.value}
                          size="small"
                          onClick={() => handleDatabaseTypeChange(db)}
                          style={{
                            borderRadius: 6,
                            fontSize: 12,
                            padding: '4px 6px',
                            background: selectedType === db.value ? db.color : 'var(--bg-elevated)',
                            borderColor: selectedType === db.value ? db.color : 'var(--border-color)',
                            color: selectedType === db.value ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          {db.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{}}
                  >
                    {shouldShowField('host') && (
                      <>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <Form.Item
                            name="host"
                            label={<Text type="secondary" style={{ fontSize: 12 }}>Host</Text>}
                            rules={[{ required: false, message: 'Required' }]}
                            style={{ flex: 1, marginBottom: 16 }}
                          >
                            <Input
                              prefix={<DatabaseOutlined style={{ color: 'var(--text-muted)' }} />}
                              placeholder="localhost"
                              style={{ borderRadius: 8 }}
                            />
                          </Form.Item>

                          <Form.Item
                            name="port"
                            label={<Text type="secondary" style={{ fontSize: 12 }}>Port</Text>}
                            rules={[{ required: false, message: 'Required' }]}
                            style={{ width: 100, marginBottom: 16 }}
                          >
                            <InputNumber
                              min={1}
                              max={65535}
                              style={{ width: '100%', borderRadius: 8 }}
                            />
                          </Form.Item>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, marginLeft: 0 }}>
                          <SafetyOutlined style={{ color: 'var(--text-muted)' }} />
                          <Text type="secondary" style={{ fontSize: 12 }}>Use HTTPS</Text>
                          <Switch
                            size="small"
                            checked={useHttps}
                            onChange={setUseHttps}
                          />
                        </div>
                      </>
                    )}

                    {
                      shouldShowField('apiKey') && (
                        <Form.Item
                          name="apiKey"
                          label={<Text type="secondary" style={{ fontSize: 12 }}>API Key</Text>}
                          style={{ marginBottom: 16 }}
                        >
                          <Input.Password
                            prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
                            placeholder="Enter API key if required"
                            style={{ borderRadius: 8 }}
                          />
                        </Form.Item>
                      )
                    }
                    <div style={{ display: 'flex', gap: 12 }}>
                      {shouldShowField('tenant') && (
                        <Form.Item
                          name="tenant"
                          label={<Text type="secondary" style={{ fontSize: 12 }}>Tenant</Text>}
                          rules={[{ required: false, message: 'Required' }]}
                          style={{ flex: 1, marginBottom: 16 }}
                        >
                          <Input
                            prefix={<ApartmentOutlined style={{ color: 'var(--text-muted)' }} />}
                            placeholder="Enter tenant if required"
                            style={{ borderRadius: 8 }}
                          />
                        </Form.Item>
                      )}
                      {shouldShowField('database') && (
                        <Form.Item
                          name="database"
                          label={<Text type="secondary" style={{ fontSize: 12 }}>Database</Text>}
                          rules={[{ required: false, message: 'Required' }]}
                          style={{ flex: 1, marginBottom: 16 }}
                        >
                          <Input
                            prefix={<DatabaseOutlined style={{ color: 'var(--text-muted)' }} />}
                            placeholder="Enter database if required"
                            style={{ borderRadius: 8 }}
                          />
                        </Form.Item>
                      )}
                      {shouldShowField('user') && (
                        <Form.Item
                          name="user"
                          label={<Text type="secondary" style={{ fontSize: 12 }}>User</Text>}
                          rules={[{ required: false, message: 'Required' }]}
                          style={{ flex: 1, marginBottom: 16 }}
                        >
                          <Input
                            prefix={<UserOutlined style={{ color: 'var(--text-muted)' }} />}
                            placeholder="Enter user if required"
                            style={{ borderRadius: 8 }}
                          />
                        </Form.Item>
                      )}
                      {shouldShowField('password') && (
                        <Form.Item
                          name="password"
                          label={<Text type="secondary" style={{ fontSize: 12 }}>Password</Text>}
                          rules={[{ required: false, message: 'Required' }]}
                          style={{ flex: 1, marginBottom: 16 }}
                        >
                          <Input.Password
                            prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
                            placeholder="Enter password if required"
                            style={{ borderRadius: 8 }}
                          />
                        </Form.Item>
                      )}
                    </div>
                    <Divider style={{ margin: '16px 0', borderColor: 'var(--border-color)' }} />

                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                      <Switch
                        size="small"
                        checked={saveConnection}
                        onChange={setSaveConnection}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>Save this connection</Text>
                    </div>

                    {saveConnection && (
                      <Form.Item style={{ marginBottom: 16 }}>
                        <Input
                          placeholder="Connection name (optional)"
                          value={connectionName}
                          onChange={(e) => setConnectionName(e.target.value)}
                          style={{ borderRadius: 8 }}
                        />
                      </Form.Item>
                    )}

                    <Form.Item style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={loading}
                          size="large"
                          style={{
                            flex: 1,
                            height: 44,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                            border: 'none',
                            fontWeight: 500,
                            boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)',
                          }}
                        >
                          Connect
                        </Button>
                        <Button
                          type="text"
                          onClick={handleTestConnection}
                          loading={testingConnection}
                          icon={
                            testResult?.success ? (
                              <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            ) : testResult?.success === false ? (
                              <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                            ) : (
                              <ThunderboltOutlined />
                            )
                          }
                          style={{
                            height: 44,
                            borderRadius: 10,
                            color: testResult?.success ? '#52c41a' : testResult?.success === false ? '#ff4d4f' : 'var(--text-secondary)',
                          }}
                          title={testResult?.message || 'Test connection'}
                        >
                          Test
                        </Button>
                      </div>
                    </Form.Item>
                  </Form>
                </>
              ),
            },
            {
              key: 'saved',
              label: (
                <Space>
                  <HistoryOutlined />
                  Saved ({savedConnections.length})
                </Space>
              ),
              children: (
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {savedConnections.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <HistoryOutlined style={{ fontSize: 48, color: 'var(--border-light)', marginBottom: 16 }} />
                      <Text type="secondary" style={{ display: 'block' }}>
                        No saved connections yet
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Save a connection to quickly reconnect later
                      </Text>
                    </div>
                  ) : (
                    <List
                      dataSource={savedConnections}
                      renderItem={(conn) => (
                        <List.Item
                          style={{
                            padding: '12px 16px',
                            background: 'var(--bg-elevated)',
                            borderRadius: 8,
                            marginBottom: 8,
                            border: '1px solid var(--border-color)',
                          }}
                          actions={[
                            <Button
                              key="connect"
                              type="primary"
                              size="small"
                              onClick={() => handleUseSavedConnection(conn)}
                              loading={loadingConnectionId === conn.id}
                              disabled={loadingConnectionId !== null && loadingConnectionId !== conn.id}
                            >
                              Connect
                            </Button>,
                            <Popconfirm
                              key="delete"
                              title="Delete this connection?"
                              onConfirm={() => handleDeleteSavedConnection(conn.id)}
                              okText="Delete"
                              cancelText="Cancel"
                            >
                              <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                              />
                            </Popconfirm>,
                          ]}
                        >
                          <List.Item.Meta
                            title={
                              <Text style={{ color: 'var(--text-primary)' }}>
                                {conn.name}
                              </Text>
                            }
                            description={
                              <Space orientation="vertical" size={0}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {conn.type} • {conn.host}{conn.port ? `:${conn.port}` : ''} {conn.tenant && conn.database ? `@${conn.tenant}/${conn.database}` : ''}
                                </Text>
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
};

export default ConnectionModal;
