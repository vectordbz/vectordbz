/**
 * Document utility functions for image detection, payload processing, and document set management
 */

import { Document, SortField } from '../types';

/**
 * Check if a value is an image URL
 * @param value - The value to check
 * @param key - Optional field name/key that may contain image-related keywords
 * @returns true if the value appears to be an image URL
 */
export function isImageUrl(value: unknown, key?: string): boolean {
    if (typeof value !== 'string') return false;

    // Check for data:image URLs (always images)
    if (value.startsWith('data:image')) return true;

    // Check for http/https URLs
    const isUrl = value.startsWith('http://') || value.startsWith('https://');
    if (!isUrl) return false;

    // Check for image file extensions
    const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(value);

    // Check for image keywords in field name
    const imageUrlFields = ['image_url', 'imageUrl', 'image', 'img_url', 'imgUrl', 'photo_url', 'photoUrl'];
    const hasImageKeyword = imageUrlFields.some(field => key === field);

    return hasImageExtension || hasImageKeyword;
}

/**
 * Extract all image URLs from a document payload
 * @param payload - The document payload object
 * @returns Array of image objects with key and url
 */
export function getImages(payload: Record<string, unknown>): Array<{ key: string; url: string }> {
    const images: Array<{ key: string; url: string }> = [];
    Object.entries(payload).forEach(([key, value]) => {
        if (isImageUrl(value, key)) {
            images.push({ key, url: value as string });
        }
    });
    return images;
}

/**
 * Get the first image URL from a document payload
 * @param payload - The document payload object
 * @returns The first image URL found, or null if none
 */
export function getFirstImageUrl(payload: Record<string, unknown>): string | null {
    const images = getImages(payload);
    return images.length > 0 ? images[0].url : null;
}

/**
 * Get document ID as string
 * @param doc - The document
 * @returns Document ID as string
 */
export function getDocId(doc: Document): string {
    return String(doc.primary.value);
}

/**
 * Create a unique hash for a document set to ensure statuses are isolated per dataset
 * @param documents - Array of documents
 * @returns A unique hash string for the document set
 */
export function getDocumentSetHash(documents: Document[]): string {
    if (documents.length === 0) return 'empty';
    // Sort IDs to ensure consistent hash regardless of order
    const sortedIds = documents.map(d => getDocId(d)).sort();
    // Simple hash function (FNV-1a inspired)
    let hash = 2166136261;
    for (const id of sortedIds) {
        for (let i = 0; i < id.length; i++) {
            hash ^= id.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
    }
    return hash.toString(36);
}

/**
 * Get field value from a document (checks primary key and payload)
 * @param doc - The document
 * @param field - The field name to retrieve
 * @returns The field value or undefined if not found
 */
export function getDocumentFieldValue(doc: Document, field: string): any {
    // Check primary key
    if (doc.primary.name === field) {
        return doc.primary.value;
    }
    // Check payload
    if (doc.payload && field in doc.payload) {
        return doc.payload[field];
    }
    return undefined;
}

/**
 * Sort documents client-side (used for databases that don't support native sorting)
 * @param documents - Array of documents to sort
 * @param sortFields - Array of sort field specifications
 * @returns New sorted array of documents
 */
export function sortDocuments(documents: Document[], sortFields: SortField[]): Document[] {
    return [...documents].sort((a, b) => {
        for (const sort of sortFields) {
            const aValue = getDocumentFieldValue(a, sort.field);
            const bValue = getDocumentFieldValue(b, sort.field);

            // Handle null/undefined values
            if (aValue == null && bValue == null) continue;
            if (aValue == null) return sort.order === 'asc' ? 1 : -1;
            if (bValue == null) return sort.order === 'asc' ? -1 : 1;

            // Compare values
            let comparison = 0;
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                comparison = aValue - bValue;
            } else {
                comparison = String(aValue).localeCompare(String(bValue));
            }

            if (comparison !== 0) {
                return sort.order === 'asc' ? comparison : -comparison;
            }
        }
        return 0;
    });
}

