import React, { useState, useEffect } from 'react';
import { Modal, message, Spin } from 'antd';
import { DynamicForm, DynamicFormSchema } from './DynamicForm';

interface CreateCollectionModalProps {
  open: boolean;
  connectionId: string;
  connectionName: string;
  onClose: () => void;
  onSubmit: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
}

const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({
  open,
  connectionId,
  connectionName,
  onClose,
  onSubmit,
}) => {
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState<DynamicFormSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Fetch schema from main process when modal opens
  useEffect(() => {
    if (open && !schema) {
      setSchemaLoading(true);
      window.electronAPI.db
        .getCreateCollectionSchema(connectionId)
        .then(setSchema)
        .catch((err) => {
          console.error('Failed to load schema:', err);
          message.error('Failed to load form schema');
        })
        .finally(() => setSchemaLoading(false));
    }
  }, [open, connectionId, schema]);

  // Reset schema when connection changes
  useEffect(() => {
    setSchema(null);
  }, [connectionId]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const result = await onSubmit(values);
      if (result.success) {
        message.success(`Collection created successfully`);
        onClose();
      } else {
        message.error(result.error || 'Failed to create collection');
      }
    } catch (error) {
      message.error('Failed to create collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      centered
      destroyOnHidden
      style={{ maxHeight: '90vh', top: 20 }}
      styles={{
        body: {
          maxHeight: 'calc(90vh - 120px)',
          overflowY: 'auto',
          padding: '16px 24px',
        },
        header: {
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          padding: '16px 24px',
        },
        wrapper: {
          overflow: 'hidden',
        },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{connectionName}</span>
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <span>New Collection</span>
        </div>
      }
    >
      {schemaLoading || !schema ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 200,
          }}
        >
          <Spin size="large" />
        </div>
      ) : (
        <DynamicForm
          schema={{
            ...schema,
            title: undefined, // Remove title since we have it in modal header
            showSubmit: true,
            showCancel: true,
          }}
          onSubmit={handleSubmit}
          onCancel={onClose}
          loading={loading}
        />
      )}
    </Modal>
  );
};

export default CreateCollectionModal;
