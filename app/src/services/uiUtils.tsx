/**
 * UI utility functions for generating dynamic document table columns and other UI helpers
 */

import React from 'react';
import { ColumnsType } from 'antd/es/table';
import { Typography, Tag } from 'antd';
import { Document, CollectionSchema, COLLECTION_DEFAULT_VECTOR } from '../types';
import { isImageUrl } from './documentUtils';
import { getVectorShortLabel } from './vectorUtils';

const { Text } = Typography;

/**
 * Generate dynamic table columns based on Document structure: id, score, vectors (by key), payload (flattened)
 * @param collectionSchema - The collection schema containing primary field info
 * @param documents - Array of documents to analyze for column generation
 * @returns Array of Ant Design table columns
 */
export function generateDocumentDynamicTableColumns(
    collectionSchema: CollectionSchema,
    documents: Document[],
    options: { scoreColumn: boolean } = { scoreColumn: true }
): ColumnsType<Document> {
    const columns: ColumnsType<Document> = [];

    // Always add id column first
    columns.push({
        title: collectionSchema.primary.name,
        key: collectionSchema.primary.name,
        dataIndex: collectionSchema.primary.name,
        render: (_: unknown, record: Document) => (
            <Text code style={{ fontSize: 11 }}>
                {String(record.primary.value || '').length > 20 ? `${String(record.primary.value || '').slice(0, 20)}...` : String(record.primary.value || '')}
            </Text>
        ),
    });

    // Always add score column if any document has a score
    const hasScore = documents.some(doc => doc.score !== undefined);
    if (hasScore && options.scoreColumn) {
        columns.push({
            title: 'score',
            key: 'score',
            dataIndex: 'score',
            render: (value: unknown) => {
                if (value === undefined || value === null) {
                    return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
                }
                if (typeof value === 'number') {
                    return (
                        <Tag color="green" style={{ fontSize: 11, margin: 0 }}>
                            {value.toFixed(4)}
                        </Tag>
                    );
                }
                return <Text style={{ fontSize: 11 }}>{String(value)}</Text>;
            },
        });
    }

    // Collect all unique vector keys from all documents
    const vectorKeys = new Set<string>();
    documents.forEach(document => {
        Object.values(document.vectors).forEach(vector => {
            vectorKeys.add(vector.key);
        });
    });

    // Add columns for each vector key
    Array.from(vectorKeys).forEach(vectorKey => {
        columns.push({
            title: vectorKey === COLLECTION_DEFAULT_VECTOR ? 'vector' : vectorKey,
            key: `vector_${vectorKey}`,
            render: (_: unknown, record: Document) => {
                if (!record.vectors || Object.keys(record.vectors).length === 0) {
                    return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
                }
                const vector = record.vectors[vectorKey];
                if (!vector || !vector.value) {
                    return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
                }
                
                return (
                    <Text type="secondary" style={{ fontSize: 10 }}>
                        {getVectorShortLabel(vector)}
                    </Text>
                );
            },
        });
    });

    // Collect all unique payload keys from all documents and separate image keys
    const payloadKeys = new Set<string>();
    const imageKeys = new Set<string>();

    documents.forEach(document => {
        if (document.payload && typeof document.payload === 'object') {
            Object.keys(document.payload).forEach(key => {
                payloadKeys.add(key);
                // Check if this key contains an image
                const fieldValue = document.payload[key];
                if (isImageUrl(fieldValue, key)) {
                    imageKeys.add(key);
                }
            });
        }
    });

    // Helper function to create a payload column
    const createPayloadColumn = (payloadKey: string): ColumnsType<Document>[0] => ({
        title: payloadKey,
        key: `payload_${payloadKey}`,
        render: (_: unknown, record: Document) => {
            if (!record.payload || typeof record.payload !== 'object') {
                return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
            }
            const fieldValue = record.payload[payloadKey];

            // Handle undefined/null
            if (fieldValue === undefined || fieldValue === null) {
                return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
            }

            // Handle arrays
            if (Array.isArray(fieldValue)) {
                // Check if it's a vector (array of numbers)
                if (fieldValue.length > 0 && typeof fieldValue[0] === 'number') {
                    return (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                            [{fieldValue.length}D]
                        </Text>
                    );
                }
                // Regular array
                return (
                    <Text type="secondary" style={{ fontSize: 10 }}>
                        [{fieldValue.length} items]
                    </Text>
                );
            }

            // Handle objects
            if (typeof fieldValue === 'object') {
                return (
                    <Text type="secondary" style={{ fontSize: 10 }}>
                        {Object.keys(fieldValue).length} keys
                    </Text>
                );
            }

            // Handle strings - check if it's an image URL
            if (typeof fieldValue === 'string') {
                if (isImageUrl(fieldValue, payloadKey)) {
                    return (
                        <img
                            src={fieldValue}
                            alt=""
                            style={{
                                width: 50,
                                height: 50,
                                objectFit: 'cover',
                                borderRadius: 4,
                                cursor: 'pointer',
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(fieldValue, '_blank');
                            }}
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    );
                }

                // Regular string - truncate if long
                return (
                    <Text style={{ fontSize: 11 }}>
                        {fieldValue.length > 30 ? `${fieldValue.slice(0, 30)}...` : fieldValue}
                    </Text>
                );
            }

            // Handle numbers
            if (typeof fieldValue === 'number') {
                return <Text style={{ fontSize: 11 }}>{fieldValue}</Text>;
            }

            // Handle booleans
            if (typeof fieldValue === 'boolean') {
                return (
                    <Tag color={fieldValue ? 'green' : 'default'} style={{ fontSize: 11, margin: 0 }}>
                        {String(fieldValue)}
                    </Tag>
                );
            }

            // Fallback: convert to string
            const strValue = String(fieldValue);
            return (
                <Text style={{ fontSize: 11 }}>
                    {strValue.length > 30 ? `${strValue.slice(0, 30)}...` : strValue}
                </Text>
            );
        },
    });

    // Add image columns first (right after vectors)
    Array.from(imageKeys).forEach(payloadKey => {
        columns.push(createPayloadColumn(payloadKey));
    });

    // Add other payload columns (non-image, sorted)
    Array.from(payloadKeys)
        .filter(key => !imageKeys.has(key))
        .forEach(payloadKey => {
            columns.push(createPayloadColumn(payloadKey));
        });

    return columns;
}