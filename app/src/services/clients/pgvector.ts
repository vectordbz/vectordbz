import { Pool } from 'pg';
import log from 'electron-log';
import {
    VectorDBClient,
    ConnectionConfig,
    ConnectionResult,
    GetCollectionsResult,
    GetCollectionInfoResult,
    SearchResult,
    SearchOptions,
    FilterQuery,
    DeleteDocumentResult,
    DeleteDocumentsResult,
    DropCollectionResult,
    TruncateCollectionResult,
    CreateCollectionResult,
    Collection,
    GetDocumentsOptions,
    GetDocumentsResult,
    Document,
    DocumentVector,
    GetCollectionSchemaResult,
    SchemaField,
    VectorSchemaField,
    COLLECTION_DEFAULT_VECTOR,
    UpsertDocumentData,
    UpsertDocumentResult,
    CollectionSchema,
    SearchCapabilities,
} from '../../types';
import { DynamicFormSchema } from '../../components/DynamicForm/types';
import { mergeWithDefault } from '../searchCapabilities';

type PoolClient = any;

// ============================================
// pgvector Constants
// ============================================

export const PGVECTOR_DISTANCE_METRICS = [
    { label: 'Cosine', value: 'cosine', description: 'Best for normalized vectors' },
    { label: 'L2 (Euclidean)', value: 'l2', description: 'Euclidean distance' },
    { label: 'Inner Product', value: 'inner_product', description: 'For non-normalized vectors' },
] as const;

export const PGVECTOR_INDEX_TYPES = [
    { label: 'HNSW', value: 'hnsw', description: 'Fast approximate search, best for large datasets' },
    { label: 'IVFFlat', value: 'ivfflat', description: 'Balanced performance, good for medium datasets' },
] as const;

export const PGVECTOR_DEFAULTS = {
    vectorSize: 1536,
    distance: 'cosine',
    indexType: 'hnsw',
    hnswM: 16,
    hnswEfConstruction: 64,
    ivfflatLists: 100,
} as const;

// ============================================
// pgvector Create Collection Schema
// ============================================

export const pgvectorCreateCollectionSchema: DynamicFormSchema = {
    title: 'Create PostgreSQL Table with pgvector',
    description: 'Configure your new vector table in PostgreSQL with pgvector extension',
    sections: [
        {
            key: 'table',
            title: 'Table Configuration',
            description: 'Basic PostgreSQL table settings',
            items: [
                {
                    key: 'name',
                    label: 'Table Name',
                    type: 'text',
                    required: true,
                    placeholder: 'my_vector_table',
                    description: 'Unique name for your table (PostgreSQL identifier)',
                    rules: [
                        { type: 'minLength', value: 1, message: 'Table name is required' },
                        { type: 'pattern', value: '^[a-zA-Z_][a-zA-Z0-9_]*$', message: 'Must start with letter or underscore, only alphanumeric and underscores allowed' },
                    ],
                },
                {
                    key: 'description',
                    label: 'Description',
                    type: 'textarea',
                    rows: 2,
                    placeholder: 'Optional description of the table',
                },
            ],
        },
        {
            key: 'primaryKey',
            title: 'Primary Key',
            description: 'Primary key configuration',
            collapsible: true,
            defaultCollapsed: true,
            items: [
                {
                    key: 'primaryKeyName',
                    label: 'Primary Key Column Name',
                    type: 'text',
                    defaultValue: 'id',
                    placeholder: 'id',
                    description: 'Name of the primary key column',
                },
                {
                    key: 'primaryKeyType',
                    label: 'Primary Key Type',
                    type: 'select',
                    defaultValue: 'serial',
                    options: [
                        { label: 'SERIAL (Auto-increment Integer)', value: 'serial' },
                        { label: 'BIGSERIAL (Auto-increment Big Integer)', value: 'bigserial' },
                        { label: 'UUID (Requires uuid-ossp extension)', value: 'uuid' },
                        { label: 'TEXT (Manual ID)', value: 'text' },
                    ],
                    description: 'Data type for the primary key',
                },
            ],
        },
        {
            key: 'vectors',
            title: 'Vector Columns',
            description: 'Configure vector storage columns',
            items: [
                {
                    key: 'vectorType',
                    label: 'Vector Configuration',
                    type: 'radio',
                    direction: 'vertical',
                    defaultValue: 'single',
                    options: [
                        { label: 'Single Vector Column', value: 'single', description: 'One vector column named "embedding" (most common)' },
                        { label: 'Multiple Vector Columns', value: 'multiple', description: 'Multiple named vector columns per row' },
                    ],
                },
                {
                    key: 'size',
                    label: 'Vector Dimensions',
                    type: 'number',
                    required: true,
                    defaultValue: PGVECTOR_DEFAULTS.vectorSize,
                    min: 1,
                    max: 16000,
                    description: 'Number of dimensions (e.g., 1536 for OpenAI, 768 for many models)',
                    showWhen: { field: 'vectorType', operator: 'equals', value: 'single' },
                },
                {
                    key: 'distance',
                    label: 'Distance Metric',
                    type: 'select',
                    required: true,
                    defaultValue: PGVECTOR_DEFAULTS.distance,
                    options: [...PGVECTOR_DISTANCE_METRICS],
                    description: 'Distance function for similarity search (used for index)',
                    showWhen: { field: 'vectorType', operator: 'equals', value: 'single' },
                },
                {
                    key: 'namedVectors',
                    label: 'Named Vector Columns',
                    type: 'array',
                    itemType: 'object',
                    itemLabel: 'Vector Column',
                    showWhen: { field: 'vectorType', operator: 'equals', value: 'multiple' },
                    minItems: 1,
                    itemFields: [
                        { key: 'name', label: 'Column Name', type: 'text', required: true, placeholder: 'embedding' },
                        { key: 'size', label: 'Dimensions', type: 'number', required: true, defaultValue: PGVECTOR_DEFAULTS.vectorSize, min: 1, max: 16000 },
                        { key: 'distance', label: 'Distance Metric', type: 'select', required: true, defaultValue: PGVECTOR_DEFAULTS.distance, options: [...PGVECTOR_DISTANCE_METRICS] },
                    ],
                    addButtonText: 'Add Vector Column',
                },
            ],
        },
        {
            key: 'columns',
            title: 'Additional Columns',
            description: 'Optional scalar columns for metadata and filtering',
            collapsible: true,
            defaultCollapsed: true,
            items: [
                {
                    key: 'includeMetadata',
                    label: 'Include Metadata Column',
                    type: 'checkbox',
                    defaultValue: true,
                    description: 'Add a JSONB metadata column for flexible data storage',
                },
                {
                    key: 'includeTimestamps',
                    label: 'Include Timestamp Columns',
                    type: 'checkbox',
                    defaultValue: true,
                    description: 'Add created_at and updated_at timestamp columns',
                },
                {
                    key: 'includeExternalId',
                    label: 'Include External ID Column',
                    type: 'checkbox',
                    defaultValue: true,
                    description: 'Add external_id TEXT column for external references',
                },
                {
                    key: 'scalarColumns',
                    label: 'Custom Scalar Columns',
                    type: 'array',
                    itemType: 'object',
                    itemLabel: 'Column',
                    minItems: 0,
                    itemFields: [
                        { key: 'name', label: 'Column Name', type: 'text', required: true, placeholder: 'title' },
                        {
                            key: 'type',
                            label: 'Data Type',
                            type: 'select',
                            required: true,
                            defaultValue: 'text',
                            options: [
                                { label: 'TEXT', value: 'text' },
                                { label: 'VARCHAR(n)', value: 'varchar' },
                                { label: 'INTEGER', value: 'integer' },
                                { label: 'BIGINT', value: 'bigint' },
                                { label: 'REAL', value: 'real' },
                                { label: 'DOUBLE PRECISION', value: 'double precision' },
                                { label: 'BOOLEAN', value: 'boolean' },
                                { label: 'TIMESTAMP', value: 'timestamp' },
                                { label: 'DATE', value: 'date' },
                                { label: 'JSONB', value: 'jsonb' },
                            ],
                        },
                        { key: 'length', label: 'Length (for VARCHAR)', type: 'number', min: 1, max: 65535, showWhen: { field: 'type', operator: 'equals', value: 'varchar' } },
                        { key: 'nullable', label: 'Nullable', type: 'checkbox', defaultValue: true },
                        { key: 'defaultValue', label: 'Default Value', type: 'text', placeholder: 'Optional default value' },
                    ],
                    addButtonText: 'Add Column',
                },
            ],
        },
        {
            key: 'indexing',
            title: 'Vector Index Configuration',
            description: 'Configure vector indexes for fast similarity search',
            collapsible: true,
            defaultCollapsed: false,
            items: [
                {
                    key: 'indexType',
                    label: 'Index Type',
                    type: 'select',
                    required: true,
                    defaultValue: PGVECTOR_DEFAULTS.indexType,
                    options: [...PGVECTOR_INDEX_TYPES],
                    description: 'Index algorithm for vector search. HNSW is faster but uses more memory. IVFFlat is more memory-efficient.',
                },
                {
                    key: 'hnsw_m',
                    label: 'HNSW M (Max Connections)',
                    type: 'number',
                    defaultValue: PGVECTOR_DEFAULTS.hnswM,
                    min: 4,
                    max: 128,
                    description: 'Number of edges per node. Higher = better recall but slower build and more memory',
                    showWhen: { field: 'indexType', operator: 'equals', value: 'hnsw' },
                },
                {
                    key: 'hnsw_ef_construction',
                    label: 'HNSW EF Construction',
                    type: 'number',
                    defaultValue: PGVECTOR_DEFAULTS.hnswEfConstruction,
                    min: 4,
                    max: 512,
                    description: 'Search width during index build. Higher = better quality but slower build',
                    showWhen: { field: 'indexType', operator: 'equals', value: 'hnsw' },
                },
                {
                    key: 'ivfflat_lists',
                    label: 'IVFFlat Lists',
                    type: 'number',
                    defaultValue: PGVECTOR_DEFAULTS.ivfflatLists,
                    min: 1,
                    max: 1000,
                    description: 'Number of clusters. Typically sqrt(total_rows). Higher = better recall but slower. Create index after inserting some data.',
                    showWhen: { field: 'indexType', operator: 'equals', value: 'ivfflat' },
                },
            ],
        },
    ],
};

// ============================================
// Helper Functions
// ============================================

/**
 * Build SQL WHERE clause from filter query
 */
function buildFilterSQL(filter: FilterQuery, paramIndex: { value: number }, schemaFields?: Record<string, any>): string {
    if (!filter.conditions || filter.conditions.length === 0) {
        return '';
    }

    const conditions = filter.conditions.map((condition) => {
        const param = `$${paramIndex.value++}`;
        const { field, operator, value, valueType } = condition;

        // Handle JSONB fields (metadata)
        // If field starts with 'metadata.', use it directly
        // Otherwise, check if field exists as a column in schema, if not, assume it's in metadata
        let fieldRef: string;
        if (field.startsWith('metadata.')) {
            fieldRef = `metadata->>'${field.replace('metadata.', '')}'`;
        } else if (schemaFields && !schemaFields[field]) {
            // Field doesn't exist as a column, assume it's in metadata
            fieldRef = `metadata->>'${field}'`;
        } else {
            // Field exists as a column, use it directly
            fieldRef = field;
        }

        switch (operator) {
            case 'equals':
                if (valueType === 'string') {
                    return `${fieldRef} = ${param}::text`;
                } else if (valueType === 'number') {
                    return `${fieldRef} = ${param}::numeric`;
                } else {
                    return `${fieldRef} = ${param}::boolean`;
                }
            case 'not_equals':
                if (valueType === 'string') {
                    return `${fieldRef} != ${param}::text`;
                } else if (valueType === 'number') {
                    return `${fieldRef} != ${param}::numeric`;
                } else {
                    return `${fieldRef} != ${param}::boolean`;
                }
            case 'greater_than':
                return `${fieldRef} > ${param}::numeric`;
            case 'greater_than_equal':
                return `${fieldRef} >= ${param}::numeric`;
            case 'less_than':
                return `${fieldRef} < ${param}::numeric`;
            case 'less_than_equal':
                return `${fieldRef} <= ${param}::numeric`;
            case 'contains':
                return `${fieldRef} ILIKE ${param}`;
            case 'starts_with':
                return `${fieldRef} ILIKE ${param}`;
            case 'ends_with':
                return `${fieldRef} ILIKE ${param}`;
            case 'in':
                if (Array.isArray(value)) {
                    const placeholders = value.map(() => `$${paramIndex.value++}`).join(', ');
                    return `${fieldRef} IN (${placeholders})`;
                }
                return `${fieldRef} = ${param}`;
            default:
                return `${fieldRef} = ${param}`;
        }
    });

    const logic = filter.logic === 'or' ? ' OR ' : ' AND ';
    return `WHERE ${conditions.join(logic)}`;
}

/**
 * Extract filter values for parameterized queries
 */
function extractFilterValues(filter: FilterQuery): any[] {
    if (!filter.conditions || filter.conditions.length === 0) {
        return [];
    }

    const values: any[] = [];
    for (const condition of filter.conditions) {
        if (condition.operator === 'in' && Array.isArray(condition.value)) {
            values.push(...condition.value);
        } else {
            values.push(condition.value);
        }
    }
    return values;
}

/**
 * Build full-text search condition for lexicalQuery (PostgreSQL FTS).
 * Uses searchable string columns from schema; returns empty string if none.
 */
function buildFTSCondition(
    schema: CollectionSchema,
    paramIndex: { value: number },
    config: { lexicalQuery: string }
): string {
    const searchableColumns: string[] = [];
    if (schema.primary?.searchable && schema.primary.name) {
        searchableColumns.push(schema.primary.name);
    }
    Object.entries(schema.fields || {}).forEach(([name, field]) => {
        if (field.searchable && name) {
            searchableColumns.push(name);
        }
    });
    if (searchableColumns.length === 0 || !config.lexicalQuery?.trim()) {
        return '';
    }
    const quotedCols = searchableColumns.map((c) => `coalesce("${c}", '')`).join(" || ' ' || ");
    const param = `$${paramIndex.value++}`;
    return `to_tsvector('english', ${quotedCols}) @@ plainto_tsquery('english', ${param})`;
}

/**
 * Convert PostgreSQL row to Document format
 */
function rowToDocument(
    row: any,
    vectorColumns: string[],
    primaryKey: string = 'id'
): Document {
    const vectors: Record<string, DocumentVector> = {};
    // Extract vectors - pgvector only supports dense vectors
    for (const vecCol of vectorColumns) {
        if (row[vecCol]) {
            const vectorData = JSON.parse(row[vecCol]);
            vectors[vecCol] = {
                key: vecCol,
                vectorType: 'dense',
                size: Array.isArray(vectorData) ? vectorData.length : 0,
                value: {
                    data: Array.isArray(vectorData) ? vectorData : [],
                },
            };
        }
    }
    // Build payload (all non-vector, non-primary fields)
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (key !== primaryKey && !vectorColumns.includes(key) && key !== 'distance' && key !== 'hybrid_score' && key !== 'text_rank' && key !== 'vector_distance') {
            // Stringify Date objects
            if (value instanceof Date) {
                payload[key] = value.toISOString();
            } else {
                payload[key] = value;
            }
        }
    }

    return {
        primary: {
            name: primaryKey,
            value: row[primaryKey],
        },
        vectors,
        payload,
    };
}

// ============================================
// pgvector Client
// ============================================

export class PgVectorClient implements VectorDBClient {
    private pool: Pool;

    constructor(config: ConnectionConfig) {
        if (!config.host) {
            throw new Error('Host is required for PostgreSQL connection');
        }

        // Build connection config
        const connectionConfig: any = {
            host: config.host,
            port: config.port || 5432,
            user: config.user || 'postgres',
            database: config.database || 'postgres',
            max: 20, // Maximum pool size
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };

        // Only include password if it's provided and is a non-empty string
        if (config.password && typeof config.password === 'string' && config.password.trim() !== '') {
            connectionConfig.password = config.password;
        }

        if (config.https) {
            connectionConfig.ssl = { rejectUnauthorized: false };
        }

        // Initialize pool
        this.pool = new Pool(connectionConfig);

        // Handle pool errors
        this.pool.on('error', (err: Error) => {
            log.error('[pgvector] Unexpected error on idle client', err);
        });

        log.info('[pgvector] Client initialized', {
            host: config.host,
            port: connectionConfig.port,
            database: connectionConfig.database,
        });
    }

    /**
     * Get a client from the pool.
     * Remember to call client.release() when done.
     */
    private async getClient(): Promise<PoolClient> {
        return await this.pool.connect();
    }

    async testConnection(): Promise<ConnectionResult> {
        const client = await this.getClient();
        try {
            // Check if pgvector extension is installed
            const extResult = await client.query(
                "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as exists"
            );

            if (!extResult.rows[0]?.exists) {
                return {
                    success: false,
                    error: 'pgvector extension is not installed. Run: CREATE EXTENSION vector;',
                };
            }

            // Get PostgreSQL version
            const versionResult = await client.query('SELECT version()');
            const version = versionResult.rows[0]?.version || 'PostgreSQL';

            log.info('[pgvector] Connection test successful');
            return { success: true, version };
        } catch (error: any) {
            log.warn('[pgvector] Connection test failed:', error.message);
            return {
                success: false,
                error: `Failed to connect to PostgreSQL: ${error.message}`,
            };
        } finally {
            client.release();
        }
    }

    async getCollections(withVectors: boolean = false): Promise<GetCollectionsResult> {
        const client = await this.getClient();
        try {
            // Build query - conditionally filter by vector columns
            // If withVectors is true, only show tables WITH vectors
            // If withVectors is false (default), show ALL tables
            const vectorFilter = withVectors ? `
            AND EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_name = t.table_name
                AND c.data_type = 'USER-DEFINED'
                AND c.udt_name = 'vector'
            )` : '';

            const result = await client.query(`
          SELECT 
            t.table_name as name,
            (SELECT COUNT(*) FROM information_schema.columns 
             WHERE table_name = t.table_name 
             AND data_type = 'USER-DEFINED' 
             AND udt_name = 'vector') as vector_count
          FROM information_schema.tables t
          WHERE t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
            ${vectorFilter}
          ORDER BY t.table_name
        `);

            const collections: Collection[] = await Promise.all(
                result.rows.map(async (row: { name: string }) => {
                    try {
                        const countResult = await client.query(
                            `SELECT COUNT(*) as count FROM ${row.name}`
                        );
                        return {
                            name: row.name,
                            count: parseInt(countResult.rows[0]?.count || '0', 10),
                        };
                    } catch (e) {
                        log.warn(`[pgvector] Failed to get count for ${row.name}:`, e);
                        return {
                            name: row.name,
                            count: 0,
                        };
                    }
                })
            );

            return { success: true, collections };
        } catch (error: any) {
            log.error('[pgvector] Failed to get collections:', error);
            return {
                success: false,
                error: error.message || 'Failed to fetch collections',
            };
        } finally {
            client.release();
        }
    }

    async getCollectionInfo(collection: string): Promise<GetCollectionInfoResult> {
        const client = await this.getClient();
        try {
            // Get table info
            const tableInfo = await client.query(`
          SELECT 
            COUNT(*) as row_count,
            pg_size_pretty(pg_total_relation_size($1::regclass)) as size
          FROM ${collection}
        `, [collection]);

            // Get vector columns with proper type information
            const vectorCols = await client.query(`
          SELECT 
            c.column_name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as type
          FROM information_schema.columns c
          JOIN pg_catalog.pg_class cls ON cls.relname = c.table_name
          JOIN pg_catalog.pg_attribute a ON a.attrelid = cls.oid
            AND a.attname = c.column_name::text
            AND a.attnum > 0
            AND NOT a.attisdropped
          WHERE c.table_schema = 'public'
            AND c.table_name = $1
            AND c.data_type = 'USER-DEFINED'
            AND c.udt_name = 'vector'
        `, [collection]);

            // Get indexes
            const indexes = await client.query(`
          SELECT 
            indexname,
            indexdef
          FROM pg_indexes
          WHERE tablename = $1
        `, [collection]);

            return {
                success: true,
                data: {
                    name: collection,
                    rowCount: parseInt(tableInfo.rows[0]?.row_count || '0', 10),
                    size: tableInfo.rows[0]?.size || '0 bytes',
                    vectorColumns: vectorCols.rows.map((r: { column_name: string; type: string }) => ({
                        name: r.column_name,
                        type: r.type,
                    })),
                    indexes: indexes.rows.map((r: { indexname: string; indexdef: string }) => ({
                        name: r.indexname,
                        definition: r.indexdef,
                    })),
                },
            };
        } catch (error: any) {
            log.error(`[pgvector] Failed to get collection info for ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to fetch collection info',
            };
        } finally {
            client.release();
        }
    }

    async getCollectionSchema(collection: string): Promise<GetCollectionSchemaResult> {
        const client = await this.getClient();
        try {
            // Get all columns with proper type information using pg_catalog
            const columns = await client.query(`
          SELECT 
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.column_default,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as full_type
          FROM information_schema.columns c
          JOIN pg_catalog.pg_class cls ON cls.relname = c.table_name
          JOIN pg_catalog.pg_attribute a ON a.attrelid = cls.oid
            AND a.attname = c.column_name::text
            AND a.attnum > 0
            AND NOT a.attisdropped
          WHERE c.table_schema = 'public'
            AND c.table_name = $1
          ORDER BY c.ordinal_position
        `, [collection]);

            if (columns.rows.length === 0) {
                return {
                    success: false,
                    error: `Table ${collection} does not exist`,
                };
            }

            const fields: Record<string, SchemaField> = {};
            const vectors: Record<string, VectorSchemaField> = {};
            let primary: SchemaField | null = null;

            // Get primary key
            const pkResult = await client.query(`
          SELECT a.attname
          FROM pg_index i
          JOIN pg_class cls ON cls.relname = $1
          JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = cls.oid
            AND i.indisprimary
        `, [collection]);

            const primaryKey = pkResult.rows[0]?.attname || 'id';

            for (const col of columns.rows) {
                const colName = col.column_name;
                const fullType = col.full_type || '';

                // Handle vector columns - check udt_name and extract dimension from full_type
                // pgvector only supports dense vectors
                if (col.udt_name === 'vector') {
                    // Extract dimension from full_type (e.g., "vector(1536)")
                    const typeMatch = fullType.match(/vector\((\d+)\)/);
                    const dimension = typeMatch ? parseInt(typeMatch[1], 10) : 0;

                    vectors[colName] = {
                        name: colName,
                        type: 'vector',
                        vectorType: 'dense',
                        size: dimension,
                    };
                    continue;
                }

                // Map PostgreSQL data types to schema field types
                // Use known column names and data types for better mapping
                let type: SchemaField['type'] = 'unknown';
                switch (col.data_type) {
                    // Integer types
                    case 'integer':
                    case 'bigint':
                    case 'smallint':
                    case 'serial':
                    case 'bigserial':
                        type = 'number';
                        break;

                    // Floating point types
                    case 'real':
                    case 'double precision':
                    case 'numeric':
                        type = 'number';
                        break;

                    // Boolean type
                    case 'boolean':
                        type = 'boolean';
                        break;

                    // Text types
                    case 'text':
                    case 'character varying':
                    case 'character':
                        type = 'string';
                        break;

                    // JSON types
                    case 'jsonb':
                    case 'json':
                        type = 'object';
                        break;

                    // Array type
                    case 'ARRAY':
                        type = 'array';
                        break;

                    // Timestamp types - explicitly map to date
                    case 'timestamp without time zone':
                    case 'timestamp with time zone':
                    case 'date':
                        type = 'date';
                        break;

                    // UUID type
                    case 'uuid':
                        type = 'string';
                        break;

                    default:
                        break;
                }

                // Check if field is searchable (text fields can be used for full-text search)
                const isSearchable = type === 'string';

                // Assign to primary or fields
                if (colName === primaryKey) {
                    primary = {
                        name: colName,
                        type,
                        autoID: col.column_default?.includes('nextval') || col.column_default?.includes('uuid_generate') || false,
                        searchable: isSearchable,
                    };
                } else {
                    fields[colName] = {
                        name: colName,
                        type,
                        searchable: isSearchable,
                    };
                }
            }

            if (!primary) {
                primary = { name: primaryKey, type: 'number' };
            }

            // Check if collection has searchable text fields for hybrid search
            const hasSearchableTextFields = Object.values(fields).some(field => field.searchable === true) ||
                (primary.searchable === true);

            const totalVectors = Object.keys(vectors).length;

            // PgVector supports hybrid search (PostgreSQL full-text search + vector similarity)
            // Only if collection has both vectors and searchable text fields
            const supportsHybridSearch = totalVectors > 0 && hasSearchableTextFields;

            return {
                success: true,
                schema: {
                    primary,
                    fields,
                    vectors,
                    multipleVectors: totalVectors > 1,
                    hasVectors: totalVectors > 0,
                },
            };
        } catch (error: any) {
            log.error(`[pgvector] Failed to get collection schema for ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to fetch collection schema',
            };
        } finally {
            client.release();
        }
    }

    async getSearchCapabilities(_collection: string, schema?: CollectionSchema | null): Promise<SearchCapabilities> {
        return mergeWithDefault(
            {
                lexical: true,
                fusionStrategies: ['rrf', 'weighted'],
            },
            schema
        );
    }

    async getDocuments(
        collection: string,
        options?: GetDocumentsOptions
    ): Promise<GetDocumentsResult> {
        try {
            // Get vector columns and primary key
            const schemaResult = await this.getCollectionSchema(collection);
            if (!schemaResult.success || !schemaResult.schema) {
                return {
                    success: false,
                    error: schemaResult.error || 'Failed to get schema',
                };
            }

            const client = await this.getClient();
            try {
                const vectorColumns = Object.keys(schemaResult.schema!.vectors);
                const primaryKey = schemaResult.schema!.primary.name;
                const limit = options?.limit || 50;
                const offset = typeof options?.offset === 'number' ? options.offset : 0;

                // Build query
                const paramIndex = { value: 1 };
                const schemaFields = schemaResult.schema!.fields || {};
                const filterSQL = options?.filter
                    ? buildFilterSQL(options.filter, paramIndex, schemaFields)
                    : '';
                const filterValues = options?.filter ? extractFilterValues(options.filter) : [];

                // Get all columns dynamically from schema (primary key, fields, and vectors)
                // Only include columns that actually exist in the schema
                const allColumns = [
                    primaryKey,
                    ...Object.keys(schemaResult.schema!.fields),
                    ...vectorColumns,
                ].filter(Boolean);

                // Build ORDER BY clause
                let orderByClause = `ORDER BY ${primaryKey}`;
                if (options?.sort && options.sort.length > 0) {
                    const sortFields = options.sort.map((sort, idx) => {
                        const fieldName = sort.field;
                        // Validate field exists in schema
                        if (!schemaFields[fieldName] && fieldName !== primaryKey && !vectorColumns.includes(fieldName)) {
                            throw new Error(`Sort field "${fieldName}" not found in collection schema`);
                        }
                        return `${fieldName} ${sort.order.toUpperCase()}`;
                    });
                    orderByClause = `ORDER BY ${sortFields.join(', ')}`;
                }

                const query = `
          SELECT ${allColumns.join(', ')}
          FROM ${collection}
          ${filterSQL}
          ${orderByClause}
          LIMIT $${paramIndex.value} OFFSET $${paramIndex.value + 1}
        `;

                const result = await client.query(query, [
                    ...filterValues,
                    limit,
                    offset,
                ]);

                // Get total count
                const countQuery = `
          SELECT COUNT(*) as total
          FROM ${collection}
          ${filterSQL}
        `;
                const countResult = await client.query(countQuery, filterValues);
                const totalCount = parseInt(countResult.rows[0]?.total || '0', 10);

                const documents = result.rows.map((row: Record<string, any>) =>
                    rowToDocument(row, vectorColumns, primaryKey)
                );

                return {
                    success: true,
                    documents,
                    totalCount,
                    nextOffset: offset + documents.length < totalCount ? offset + documents.length : null,
                };
            } finally {
                client.release();
            }
        } catch (error: any) {
            log.error(`[pgvector] Failed to get documents from ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to fetch documents',
            };
        }
    }

    async search(
        collection: string,
        vectors: Record<string, DocumentVector>,
        options?: SearchOptions
    ): Promise<SearchResult> {
        const startTime = Date.now();

        try {
            // Extract dense vector (pgvector only supports dense vectors)
            let denseVector: number[] | undefined;
            let vectorKey: string | undefined;

            for (const [key, vectorData] of Object.entries(vectors)) {
                if (vectorData.vectorType === 'dense') {
                    denseVector = vectorData.value.data;
                    vectorKey = key !== COLLECTION_DEFAULT_VECTOR ? key : undefined;
                    break; // Use first dense vector found
                }
            }

            if (!denseVector) {
                return { success: false, error: 'Dense vector is required for pgvector search' };
            }

            // Get schema to determine vector columns
            const schemaResult = await this.getCollectionSchema(collection);
            if (!schemaResult.success || !schemaResult.schema) {
                return {
                    success: false,
                    error: schemaResult.error || 'Failed to get schema',
                };
            }

            const client = await this.getClient();
            try {
                const vectorColumns = Object.keys(schemaResult.schema!.vectors);
                const primaryKey = schemaResult.schema!.primary.name;

                // Determine which vector column to search
                const vectorColumn = vectorKey || vectorColumns[0] || 'embedding';
                if (!vectorColumns.includes(vectorColumn) && vectorColumn !== 'embedding') {
                    return {
                        success: false,
                        error: `Vector column ${vectorColumn} not found. Available: ${vectorColumns.join(', ')}`,
                    };
                }

                // Get distance metric from index or default to cosine
                const indexInfo = await client.query(`
        SELECT indexdef
        FROM pg_indexes
        WHERE tablename = $1
          AND indexdef LIKE '%${vectorColumn}%'
        LIMIT 1
      `, [collection]);

                let distanceMetric = 'cosine';
                if (indexInfo.rows.length > 0) {
                    const indexDef = indexInfo.rows[0].indexdef;
                    if (indexDef.includes('vector_cosine_ops')) {
                        distanceMetric = 'cosine';
                    } else if (indexDef.includes('vector_l2_ops')) {
                        distanceMetric = 'l2';
                    } else if (indexDef.includes('vector_inner_product_ops')) {
                        distanceMetric = 'inner_product';
                    }
                }

                // Build distance function
                const vectorStr = `[${denseVector.join(',')}]`;
                let distanceFunc: string;
                switch (distanceMetric) {
                    case 'l2':
                        distanceFunc = `${vectorColumn} <-> $1::vector`;
                        break;
                    case 'inner_product':
                        distanceFunc = `${vectorColumn} <#> $1::vector`;
                        break;
                    case 'cosine':
                    default:
                        distanceFunc = `1 - (${vectorColumn} <=> $1::vector)`;
                        break;
                }

                const limit = options?.limit || 10;
                const paramIndex = { value: 2 };
                const schemaFields = schemaResult.schema!.fields || {};
                const filterSQL = options?.filter
                    ? buildFilterSQL(options.filter, paramIndex, schemaFields)
                    : '';
                const filterValues = options?.filter ? extractFilterValues(options.filter) : [];

                // Full-text search condition when lexicalQuery is provided
                const ftsCondition = options?.lexicalQuery?.trim()
                    ? buildFTSCondition(schemaResult.schema!, paramIndex, { lexicalQuery: options.lexicalQuery.trim() })
                    : '';
                const effectiveWhere = filterSQL
                    ? (ftsCondition ? `${filterSQL} AND ${ftsCondition}` : filterSQL)
                    : (ftsCondition ? `WHERE ${ftsCondition}` : '');

                // Build query - get all columns dynamically from schema
                const allColumns = [
                    primaryKey,
                    ...Object.keys(schemaResult.schema!.fields),
                    ...vectorColumns,
                ].filter(Boolean);

                // Vector search, optionally constrained by FTS when lexicalQuery is set
                const query = `
            SELECT 
              ${allColumns.join(', ')},
              ${distanceFunc} as distance
            FROM ${collection}
            ${effectiveWhere}
            ORDER BY ${vectorColumn} <-> $1::vector
            LIMIT $${paramIndex.value}
          `;

                const queryParams = [vectorStr, ...filterValues, ...(options?.lexicalQuery?.trim() ? [options.lexicalQuery.trim()] : []), limit];

                const result = await client.query(query, queryParams);

                // Convert distance to similarity score
                const documents = result.rows
                    .map((row: Record<string, any> & { distance?: string; hybrid_score?: string; vector_distance?: string; text_rank?: string }) => {
                        let score: number;

                        // Use vector distance
                        const distance = parseFloat(row.distance || '0');
                        score = distanceMetric === 'cosine' ? distance : 1 - distance;

                        if (options?.scoreThreshold && score < options.scoreThreshold) {
                            return null;
                        }

                        const doc = rowToDocument(row, vectorColumns, primaryKey);
                        doc.score = score;
                        return doc;
                    })
                    .filter((doc: Document | null): doc is Document => doc !== null);

                const searchTimeMs = Date.now() - startTime;

                return {
                    success: true,
                    documents,
                    metadata: {
                        searchTimeMs,
                        requestedTopK: limit,
                        returnedCount: documents.length,
                        effectiveTopK: documents.length,
                        queryVectorDimension: denseVector.length,
                        filterApplied: !!options?.filter,
                    },
                };
            } finally {
                client.release();
            }
        } catch (error: any) {
            log.error(`[pgvector] Search failed for ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Search failed',
            };
        }
    }

    async deleteDocument(
        collection: string,
        primary: Document['primary'],
        dataRequirements?: Record<string, string>
    ): Promise<DeleteDocumentResult> {
        const client = await this.getClient();
        try {
            const query = `DELETE FROM ${collection} WHERE ${primary.name} = $1`;
            await client.query(query, [primary.value]);
            return { success: true };
        } catch (error: any) {
            log.error(`[pgvector] Failed to delete document from ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to delete document',
            };
        } finally {
            client.release();
        }
    }

    async deleteDocuments(
        collection: string,
        filter: FilterQuery,
        dataRequirements?: Record<string, string>
    ): Promise<DeleteDocumentsResult> {
        const client = await this.getClient();
        try {
            // Get schema to determine which fields are columns vs metadata
            const schemaResult = await this.getCollectionSchema(collection);
            const schemaFields = schemaResult.success && schemaResult.schema
                ? schemaResult.schema.fields || {}
                : {};

            const paramIndex = { value: 1 };
            const filterSQL = buildFilterSQL(filter, paramIndex, schemaFields);
            const filterValues = extractFilterValues(filter);

            const query = `DELETE FROM ${collection} ${filterSQL}`;
            const result = await client.query(query, filterValues);

            return {
                success: true,
                deletedCount: result.rowCount || 0,
            };
        } catch (error: any) {
            log.error(`[pgvector] Failed to delete documents from ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to delete documents',
            };
        } finally {
            client.release();
        }
    }

    async dropCollection(collection: string): Promise<DropCollectionResult> {
        const client = await this.getClient();
        try {
            await client.query(`DROP TABLE IF EXISTS ${collection} CASCADE`);
            log.info(`[pgvector] Dropped table ${collection}`);
            return { success: true };
        } catch (error: any) {
            log.error(`[pgvector] Failed to drop table ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to drop table',
            };
        } finally {
            client.release();
        }
    }

    async truncateCollection(collection: string): Promise<TruncateCollectionResult> {
        const client = await this.getClient();
        try {
            // Get count before truncate
            const countResult = await client.query(`SELECT COUNT(*) as count FROM ${collection}`);
            const deletedCount = parseInt(countResult.rows[0]?.count || '0', 10);

            await client.query(`TRUNCATE TABLE ${collection}`);

            log.info(`[pgvector] Truncated table ${collection} (${deletedCount} rows)`);
            return { success: true, deletedCount };
        } catch (error: any) {
            log.error(`[pgvector] Failed to truncate table ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to truncate table',
            };
        } finally {
            client.release();
        }
    }

    async createCollection(config: Record<string, unknown>): Promise<CreateCollectionResult> {
        const client = await this.getClient();
        try {
            // Ensure pgvector extension exists
            await client.query('CREATE EXTENSION IF NOT EXISTS vector');

            const tableName = config.name as string;
            if (!tableName) {
                return { success: false, error: 'Table name is required' };
            }

            const vectorType = (config.vectorType as string) || 'single';
            const indexType = (config.indexType as string) || PGVECTOR_DEFAULTS.indexType;

            // Primary key configuration
            const primaryKeyName = (config.primaryKeyName as string) || 'id';
            const primaryKeyType = (config.primaryKeyType as string) || 'serial';

            let primaryKeyDef: string;
            switch (primaryKeyType) {
                case 'bigserial':
                    primaryKeyDef = `${primaryKeyName} BIGSERIAL PRIMARY KEY`;
                    break;
                case 'uuid':
                    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
                    primaryKeyDef = `${primaryKeyName} UUID PRIMARY KEY DEFAULT uuid_generate_v4()`;
                    break;
                case 'text':
                    primaryKeyDef = `${primaryKeyName} TEXT PRIMARY KEY`;
                    break;
                case 'serial':
                default:
                    primaryKeyDef = `${primaryKeyName} SERIAL PRIMARY KEY`;
                    break;
            }

            // Build CREATE TABLE statement
            let createTableSQL = `CREATE TABLE ${tableName} (\n        ${primaryKeyDef}`;

            // Optional columns
            const includeExternalId = config.includeExternalId !== false;
            const includeTimestamps = config.includeTimestamps !== false;
            const includeMetadata = config.includeMetadata !== false;

            if (includeExternalId) {
                createTableSQL += `,\n        external_id TEXT UNIQUE`;
            }

            if (includeTimestamps) {
                createTableSQL += `,\n        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
                createTableSQL += `,\n        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
            }

            // Vector columns
            if (vectorType === 'single') {
                const size = (config.size as number) || PGVECTOR_DEFAULTS.vectorSize;
                createTableSQL += `,\n        embedding vector(${size})`;
            } else {
                const namedVectors = (config.namedVectors as Array<{ name: string; size: number }>) || [];
                if (namedVectors.length === 0) {
                    return { success: false, error: 'At least one named vector column is required for multiple vector configuration' };
                }
                for (const vec of namedVectors) {
                    if (!vec.name || !vec.size) {
                        return { success: false, error: 'All vector columns must have a name and size' };
                    }
                    createTableSQL += `,\n        ${vec.name} vector(${vec.size})`;
                }
            }

            // Custom scalar columns
            const scalarColumns = (config.scalarColumns as Array<{
                name: string;
                type: string;
                length?: number;
                nullable?: boolean;
                defaultValue?: string;
            }>) || [];

            for (const col of scalarColumns) {
                if (!col.name || !col.type) {
                    continue;
                }

                let colDef = col.name;

                // Build type definition
                switch (col.type) {
                    case 'varchar':
                        const length = col.length || 255;
                        colDef += ` VARCHAR(${length})`;
                        break;
                    case 'text':
                        colDef += ' TEXT';
                        break;
                    case 'integer':
                        colDef += ' INTEGER';
                        break;
                    case 'bigint':
                        colDef += ' BIGINT';
                        break;
                    case 'real':
                        colDef += ' REAL';
                        break;
                    case 'double precision':
                        colDef += ' DOUBLE PRECISION';
                        break;
                    case 'boolean':
                        colDef += ' BOOLEAN';
                        break;
                    case 'timestamp':
                        colDef += ' TIMESTAMP';
                        break;
                    case 'date':
                        colDef += ' DATE';
                        break;
                    case 'jsonb':
                        colDef += ' JSONB';
                        break;
                    default:
                        colDef += ` ${col.type.toUpperCase()}`;
                        break;
                }

                // Nullable
                if (col.nullable === false) {
                    colDef += ' NOT NULL';
                }

                // Default value
                if (col.defaultValue) {
                    colDef += ` DEFAULT ${col.defaultValue}`;
                }

                createTableSQL += `,\n        ${colDef}`;
            }

            // Metadata column
            if (includeMetadata) {
                createTableSQL += `,\n        metadata JSONB DEFAULT '{}'::jsonb`;
            }

            createTableSQL += '\n      )';

            await client.query(createTableSQL);

            // Create vector indexes
            if (vectorType === 'single') {
                const distance = (config.distance as string) || PGVECTOR_DEFAULTS.distance;
                await this.createVectorIndex(
                    client,
                    tableName,
                    'embedding',
                    distance,
                    indexType,
                    config
                );
            } else {
                const namedVectors = (config.namedVectors as Array<{ name: string; size: number; distance: string }>) || [];
                for (const vec of namedVectors) {
                    await this.createVectorIndex(
                        client,
                        tableName,
                        vec.name,
                        vec.distance || PGVECTOR_DEFAULTS.distance,
                        indexType,
                        config
                    );
                }
            }

            // Create trigger for updated_at if timestamps are included
            if (includeTimestamps) {
                await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
          `);

                await client.query(`
            DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON ${tableName};
            CREATE TRIGGER update_${tableName}_updated_at
            BEFORE UPDATE ON ${tableName}
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
          `);
            }

            log.info(`[pgvector] Created table ${tableName}`);
            return { success: true };
        } catch (error: any) {
            log.error('[pgvector] Failed to create table:', error);
            return {
                success: false,
                error: error.message || 'Failed to create table',
            };
        } finally {
            client.release();
        }
    }

    private async createVectorIndex(
        client: PoolClient,
        tableName: string,
        columnName: string,
        distance: string,
        indexType: string,
        config: Record<string, unknown>
    ): Promise<void> {
        const indexName = `${tableName}_${columnName}_idx`;

        // Map distance to pgvector ops
        let ops: string;
        switch (distance) {
            case 'l2':
                ops = 'vector_l2_ops';
                break;
            case 'inner_product':
                ops = 'vector_ip_ops'; // Correct operator class name
                break;
            case 'cosine':
            default:
                ops = 'vector_cosine_ops';
                break;
        }

        if (indexType === 'hnsw') {
            const m = (config.hnsw_m as number) || PGVECTOR_DEFAULTS.hnswM;
            const efConstruction = (config.hnsw_ef_construction as number) || PGVECTOR_DEFAULTS.hnswEfConstruction;

            await client.query(`
        CREATE INDEX ${indexName}
        ON ${tableName}
        USING hnsw (${columnName} ${ops})
        WITH (m = ${m}, ef_construction = ${efConstruction})
      `);
        } else if (indexType === 'ivfflat') {
            // For IVFFlat, we need some data first, but we'll create it anyway
            // In production, you'd want to create this after inserting some data
            const lists = (config.ivfflat_lists as number) || PGVECTOR_DEFAULTS.ivfflatLists;

            await client.query(`
        CREATE INDEX ${indexName}
        ON ${tableName}
        USING ivfflat (${columnName} ${ops})
        WITH (lists = ${lists})
      `);
        }
    }

    getCreateCollectionSchema(): DynamicFormSchema {
        return pgvectorCreateCollectionSchema;
    }

    async upsertDocument(
        collection: string,
        data: UpsertDocumentData,
        dataRequirements?: Record<string, string>
    ): Promise<UpsertDocumentResult> {
        try {
            // Get schema
            const schemaResult = await this.getCollectionSchema(collection);
            if (!schemaResult.success || !schemaResult.schema) {
                return {
                    success: false,
                    error: schemaResult.error || 'Failed to get schema',
                };
            }

            const client = await this.getClient();
            try {
                const vectorColumns = Object.keys(schemaResult.schema!.vectors);
                const primaryKey = schemaResult.schema!.primary.name;
                const document = data.document;

                // Build INSERT ... ON CONFLICT UPDATE statement
                const columns: string[] = [];
                const values: any[] = [];
                const placeholders: string[] = [];
                let paramIndex = 1;

                // Handle primary key - only include if value is provided (not null/undefined)
                // For SERIAL/auto-increment columns, omit the primary key to allow auto-generation
                if (document.primary && document.primary.value !== null && document.primary.value !== undefined) {
                    columns.push(primaryKey);
                    values.push(document.primary.value);
                    placeholders.push(`$${paramIndex++}`);
                }

                // Get schema fields to check which columns exist
                const schemaFields = schemaResult.schema!.fields || {};

                // Handle vectors (only dense vectors supported by pgvector)
                if (document.vectors) {
                    for (const [vecKey, vecData] of Object.entries(document.vectors)) {
                        // Only process dense vectors
                        if (vecData.vectorType !== 'dense') {
                            continue;
                        }

                        const vecCol = vectorColumns.includes(vecKey) ? vecKey : 'embedding';
                        if (vecData.value && 'data' in vecData.value && Array.isArray(vecData.value.data)) {
                            columns.push(vecCol);
                            const vectorStr = `[${vecData.value.data.join(',')}]`;
                            values.push(vectorStr);
                            placeholders.push(`$${paramIndex++}::vector`);
                        }
                    }
                }

                // Handle payload/metadata - all fields are handled here
                const metadataFields: Record<string, unknown> = {};

                if (document.payload) {
                    for (const [key, value] of Object.entries(document.payload)) {
                        // Skip if already in columns or is a vector column
                        if (columns.includes(key) || vectorColumns.includes(key)) {
                            continue;
                        }

                        // If the field exists in the schema as a column, add it as a column
                        if (schemaFields[key]) {
                            columns.push(key);
                            if (typeof value === 'object' && value !== null) {
                                values.push(JSON.stringify(value));
                                placeholders.push(`$${paramIndex++}::jsonb`);
                            } else {
                                values.push(value);
                                placeholders.push(`$${paramIndex++}`);
                            }
                        } else {
                            // Field doesn't exist as a column, store in metadata
                            metadataFields[key] = value;
                        }
                    }
                }

                // If we have metadata fields and metadata column exists, add/merge with metadata
                if (Object.keys(metadataFields).length > 0 && schemaFields.metadata) {
                    // Get existing metadata if provided
                    const existingMetadata = document.payload?.metadata as Record<string, unknown> || {};
                    const mergedMetadata = { ...existingMetadata, ...metadataFields };

                    if (!columns.includes('metadata')) {
                        columns.push('metadata');
                        values.push(JSON.stringify(mergedMetadata));
                        placeholders.push(`$${paramIndex++}::jsonb`);
                    } else {
                        // Metadata column already in columns, merge with existing
                        const metadataIndex = columns.indexOf('metadata');
                        const existingValue = values[metadataIndex];
                        let existingMeta: Record<string, unknown> = {};
                        if (existingValue) {
                            try {
                                existingMeta = typeof existingValue === 'string'
                                    ? JSON.parse(existingValue)
                                    : existingValue;
                            } catch {
                                existingMeta = {};
                            }
                        }
                        values[metadataIndex] = JSON.stringify({ ...existingMeta, ...mergedMetadata });
                    }
                }

                // Build upsert query
                // For ON CONFLICT UPDATE, we need to reference the EXCLUDED values
                // Exclude primary key and auto-generated timestamp fields from UPDATE SET
                // created_at should never be updated, updated_at is handled by trigger but we set it manually for ON CONFLICT
                const excludedFromUpdate = [primaryKey, 'created_at', 'updated_at'];
                const updateColumns = columns.filter((col) => !excludedFromUpdate.includes(col));
                const updateSet = updateColumns
                    .map((col) => `${col} = EXCLUDED.${col}`)
                    .join(', ');

                // Check if updated_at column exists in the table schema
                // Note: Trigger handles updated_at on regular UPDATE, but for ON CONFLICT UPDATE we set it manually
                const hasUpdatedAt = schemaResult.schema!.fields?.updated_at !== undefined;

                // Build the UPDATE SET clause
                const updateParts: string[] = [];
                if (updateSet) {
                    updateParts.push(updateSet);
                }
                if (hasUpdatedAt) {
                    updateParts.push('updated_at = CURRENT_TIMESTAMP');
                }
                const finalUpdateSet = updateParts.join(', ');

                const query = `
        INSERT INTO ${collection} (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (${primaryKey}) 
        DO UPDATE SET ${finalUpdateSet}
        RETURNING *
      `;

                const result = await client.query(query, values);

                return {
                    success: true,
                    document: result.rows[0] || {},
                };
            } finally {
                client.release();
            }
        } catch (error: any) {
            log.error(`[pgvector] Failed to upsert document in ${collection}:`, error);
            return {
                success: false,
                error: error.message || 'Failed to upsert document',
            };
        }
    }

    /**
     * Clean up connection pool
     */
    async disconnect(): Promise<void> {
        await this.pool.end();
    }
}

