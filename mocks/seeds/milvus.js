import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import dotenv from 'dotenv';
import {
  generateProducts,
  generateDocuments,
  generateUsers,
  generateImages,
  generatePapers,
  generateMultiVectorProducts,
  generateMultiVectorDocuments,
  generateHybridProducts,
  generateHybridDocuments,
  generateHybridPapers,
  generateBinaryImages,
  generateBinaryDocuments,
} from '../generators.js';

dotenv.config();

const MILVUS_HOST = process.env.MILVUS_HOST || 'localhost';
const MILVUS_PORT = process.env.MILVUS_PORT || '19530';
const MILVUS_TOKEN = process.env.MILVUS_TOKEN || '';
const MILVUS_USERNAME = process.env.MILVUS_USERNAME || '';
const MILVUS_PASSWORD = process.env.MILVUS_PASSWORD || '';
// Set to 'true' for Zilliz Cloud connections
const MILVUS_SSL = process.env.MILVUS_SSL === 'true';

export async function seedMilvusDB() {
  console.log('\n🚀 Seeding Milvus...\n');
  
  let client;
  try {
    // For Zilliz Cloud (SSL), don't include port - it uses 443 by default
    // For local Milvus, include the port (usually 19530)
    const address = MILVUS_SSL 
      ? MILVUS_HOST  // Zilliz Cloud: just hostname
      : `${MILVUS_HOST}:${MILVUS_PORT}`;  // Local: hostname:port
    
    console.log(`  Connecting to Milvus at ${address}...`);
    
    const connectionConfig = {
      address: address,
    };

    // Enable SSL for cloud connections
    if (MILVUS_SSL) {
      connectionConfig.ssl = true;
      console.log('  SSL enabled (Zilliz Cloud mode)');
    }
    
    if (MILVUS_TOKEN) {
      connectionConfig.token = MILVUS_TOKEN;
      console.log('  Using token authentication');
    } else if (MILVUS_USERNAME && MILVUS_PASSWORD) {
      connectionConfig.username = MILVUS_USERNAME;
      connectionConfig.password = MILVUS_PASSWORD;
      console.log('  Using username/password authentication');
    }
    
    client = new MilvusClient(connectionConfig);
    await client.listCollections();
    console.log('✓ Connected to Milvus');
  } catch (error) {
    console.error('❌ Cannot connect to Milvus:', error.message);
    return;
  }

  // Milvus-specific collections
  // Note: Milvus 2.4+ supports multiple vector fields per collection
  const collections = [
    {
      name: 'store_inventory',
      dimension: 384,
      data: generateProducts(30, 384),
      description: 'Store inventory products',
    },
    {
      name: 'knowledge_base',
      dimension: 768,
      data: generateDocuments(25, 768),
      description: 'Knowledge base documents',
    },
    {
      name: 'member_directory',
      dimension: 256,
      data: generateUsers(35, 256),
      description: 'Member directory profiles',
    },
    {
      name: 'media_archive',
      dimension: 512,
      data: generateImages(30, 512),
      description: 'Media archive with images',
    },
    {
      name: 'academic_papers',
      dimension: 768,
      data: generatePapers(20, 768),
      description: 'Academic research papers',
    },
    {
      name: 'multi_vector_products',
      data: generateMultiVectorProducts(20),
      description: 'Products with multiple vector fields (text_embedding, image_embedding)',
      multiVector: true,
      vectorFields: {
        text_embedding: 384,
        image_embedding: 512,
      },
    },
    {
      name: 'multi_vector_docs',
      data: generateMultiVectorDocuments(15),
      description: 'Documents with multiple vector fields (title_embedding, content_embedding, summary_embedding)',
      multiVector: true,
      vectorFields: {
        title_embedding: 256,
        content_embedding: 768,
        summary_embedding: 384,
      },
    },
    {
      name: 'hybrid_products',
      data: generateHybridProducts(25, 384),
      description: 'Products with hybrid search (dense semantic + sparse keyword vectors)',
      hybridVector: true,
      vectorFields: {
        dense_vector: { dimension: 384, type: 'FloatVector' },
        sparse_vector: { type: 'SparseFloatVector' },
      },
    },
    {
      name: 'hybrid_documents',
      data: generateHybridDocuments(20, 768),
      description: 'Documents with hybrid search (semantic + keyword/BM25)',
      hybridVector: true,
      vectorFields: {
        dense_vector: { dimension: 768, type: 'FloatVector' },
        sparse_vector: { type: 'SparseFloatVector' },
      },
    },
    {
      name: 'hybrid_papers',
      data: generateHybridPapers(18, 768),
      description: 'Research papers with hybrid search capabilities',
      hybridVector: true,
      vectorFields: {
        dense_vector: { dimension: 768, type: 'FloatVector' },
        sparse_vector: { type: 'SparseFloatVector' },
      },
    },
    {
      name: 'binary_image_hashes',
      data: generateBinaryImages(30, 256),
      description: 'Image perceptual hashes using binary vectors',
      binaryVector: true,
      vectorFields: {
        binary_vector: { dimension: 256, type: 'BinaryVector' },
      },
    },
    {
      name: 'binary_document_fingerprints',
      data: generateBinaryDocuments(25, 512),
      description: 'Document fingerprints for near-duplicate detection',
      binaryVector: true,
      vectorFields: {
        binary_vector: { dimension: 512, type: 'BinaryVector' },
      },
    },
  ];

  for (const col of collections) {
    try {
      console.log(`\n📦 Processing collection: ${col.name}`);
      
      // Drop if exists
      try {
        await client.dropCollection({ collection_name: col.name });
        console.log(`  ✓ Dropped existing collection`);
      } catch (e) {
        // Collection may not exist
      }

      // Create schema based on first item
      const sampleItem = col.data[0];
      
      const schema = [
        {
          name: 'id',
          data_type: 'VarChar',
          is_primary_key: true,
          max_length: 100,
        },
      ];
      
      // Add vector field(s)
      if (col.hybridVector && col.vectorFields) {
        // Hybrid search: dense + sparse vectors
        for (const [vectorName, config] of Object.entries(col.vectorFields)) {
          if (config.type === 'SparseFloatVector') {
            schema.push({
              name: vectorName,
              data_type: 'SparseFloatVector',
            });
          } else {
            schema.push({
              name: vectorName,
              data_type: 'FloatVector',
              dim: config.dimension,
            });
          }
        }
      } else if (col.binaryVector && col.vectorFields) {
        // Binary vectors
        for (const [vectorName, config] of Object.entries(col.vectorFields)) {
          schema.push({
            name: vectorName,
            data_type: 'BinaryVector',
            dim: config.dimension,
          });
        }
      } else if (col.multiVector && col.vectorFields) {
        // Multiple vector fields - add each as FloatVector
        for (const [vectorName, dimension] of Object.entries(col.vectorFields)) {
          schema.push({
            name: vectorName,
            data_type: 'FloatVector',
            dim: dimension,
          });
        }
      } else {
        // Single vector field
        schema.push({
          name: 'vector',
          data_type: 'FloatVector',
          dim: col.dimension,
        });
      }
      
      // Add all other non-vector, non-id fields
      const vectorFieldNames = (col.multiVector || col.hybridVector || col.binaryVector) && col.vectorFields 
        ? Object.keys(col.vectorFields)
        : ['vector'];
      
      // Only add fields that are not vectors and not id
      const otherFields = Object.keys(sampleItem).filter(k => {
        if (k === 'id') return false;
        if (vectorFieldNames.includes(k)) return false;
        // Skip arrays (they might be vectors we missed)
        const val = sampleItem[k];
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
          return false; // This is a vector, skip it
        }
        return true;
      });
      
      schema.push(...otherFields.map(key => {
        const value = sampleItem[key];
        if (typeof value === 'string') {
          return {
            name: key,
            data_type: 'VarChar',
            max_length: 1000,
          };
        } else if (typeof value === 'number') {
          // Detect if it's an integer or float
          if (Number.isInteger(value)) {
            return {
              name: key,
              data_type: 'Int64',
            };
          } else {
            return {
              name: key,
              data_type: 'Double',
            };
          }
        } else if (typeof value === 'boolean') {
          return {
            name: key,
            data_type: 'Bool',
          };
        } else {
          // For arrays, objects, etc., store as VarChar (JSON string)
          return {
            name: key,
            data_type: 'VarChar',
            max_length: 5000,
          };
        }
      }));

      try {
        await client.createCollection({
          collection_name: col.name,
          description: col.description,
          fields: schema,
        });
        const vectorCount = schema.filter(f => f.data_type === 'FloatVector').length;
        console.log(`  ✓ Collection created with ${schema.length} fields (${vectorCount} vector field${vectorCount > 1 ? 's' : ''})`);
      } catch (createError) {
        console.error(`  ❌ Collection creation failed:`, createError.message || createError.reason);
        if (createError.reason?.includes('multiple vector fields')) {
          console.error(`  ⚠️  Your Milvus version doesn't support multiple vector fields.`);
          console.error(`  ⚠️  Please upgrade to Milvus 2.4+ for multi-vector support.`);
        }
        throw createError;
      }

      // Create indexes on all vector fields BEFORE loading
      const schemaVectorFields = schema.filter(f => 
        f.data_type === 'FloatVector' || 
        f.data_type === 'SparseFloatVector' || 
        f.data_type === 'BinaryVector'
      );
      for (const vectorField of schemaVectorFields) {
        try {
          if (vectorField.data_type === 'SparseFloatVector') {
            // Sparse vector index
            await client.createIndex({
              collection_name: col.name,
              field_name: vectorField.name,
              index_type: 'SPARSE_INVERTED_INDEX',
              metric_type: 'IP', // Inner Product for sparse vectors
            });
            console.log(`  ✓ Sparse index created on ${vectorField.name}`);
          } else if (vectorField.data_type === 'BinaryVector') {
            // Binary vector index
            await client.createIndex({
              collection_name: col.name,
              field_name: vectorField.name,
              index_type: 'BIN_FLAT',
              metric_type: 'HAMMING', // Hamming distance for binary vectors
            });
            console.log(`  ✓ Binary index created on ${vectorField.name}`);
          } else {
            // Dense vector index
            await client.createIndex({
              collection_name: col.name,
              field_name: vectorField.name,
              index_type: 'AUTOINDEX',
              metric_type: 'COSINE',
            });
            console.log(`  ✓ Dense index created on ${vectorField.name}`);
          }
        } catch (e) {
          console.warn(`  ⚠️  Index creation failed for ${vectorField.name}:`, e.message);
        }
      }

      // Load collection BEFORE inserting data
      try {
        await client.loadCollection({
          collection_name: col.name,
        });
        console.log(`  ✓ Collection loaded`);
      } catch (e) {
        console.warn(`  ⚠️  Load failed:`, e.message);
      }

      // Insert data in batches - using object-based format
      let insertedCount = 0;
      for (let i = 0; i < col.data.length; i += 20) {
        const batch = col.data.slice(i, i + 20);
        
        if (batch.length === 0) continue;
        
        // Convert batch to object-based format (array of objects)
        const dataObjects = batch.map(p => {
          const obj = {
            id: String(p.id),
          };
          
          // Add all vector fields
          for (const vectorField of schemaVectorFields) {
            const vectorValue = p[vectorField.name];
            
            if (vectorField.data_type === 'SparseFloatVector') {
              // Handle sparse vectors
              if (vectorValue && vectorValue.indices && vectorValue.values) {
                // Milvus expects sparse vectors as objects with indices and values
                obj[vectorField.name] = {
                  indices: vectorValue.indices,
                  values: vectorValue.values,
                };
              } else {
                console.warn(`  ⚠️  Missing sparse vector field ${vectorField.name} for item ${p.id}, creating empty sparse vector`);
                obj[vectorField.name] = { indices: [], values: [] };
              }
            } else if (vectorField.data_type === 'BinaryVector') {
              // Handle binary vectors
              const expectedDim = vectorField.dim;
              const expectedBytes = expectedDim / 8;
              
              if (Array.isArray(vectorValue) && vectorValue.length > 0) {
                // Binary vectors are byte arrays
                if (vectorValue.length !== expectedBytes) {
                  console.warn(`  ⚠️  Binary vector ${vectorField.name} size mismatch for item ${p.id}: expected ${expectedBytes} bytes, got ${vectorValue.length}`);
                  // Truncate or pad
                  if (vectorValue.length > expectedBytes) {
                    obj[vectorField.name] = vectorValue.slice(0, expectedBytes);
                  } else {
                    obj[vectorField.name] = [...vectorValue, ...new Array(expectedBytes - vectorValue.length).fill(0)];
                  }
                } else {
                  obj[vectorField.name] = vectorValue;
                }
              } else {
                console.warn(`  ⚠️  Missing binary vector field ${vectorField.name} for item ${p.id}, creating zero vector`);
                obj[vectorField.name] = new Array(expectedBytes).fill(0);
              }
            } else {
              // Handle dense vectors
              const expectedDim = vectorField.dim;
              
              if (Array.isArray(vectorValue) && vectorValue.length > 0) {
                // Verify dimension matches
                if (vectorValue.length !== expectedDim) {
                  console.warn(`  ⚠️  Vector ${vectorField.name} dimension mismatch for item ${p.id}: expected ${expectedDim}, got ${vectorValue.length}`);
                  // Truncate or pad as needed
                  if (vectorValue.length > expectedDim) {
                    obj[vectorField.name] = vectorValue.slice(0, expectedDim);
                  } else {
                    obj[vectorField.name] = [...vectorValue, ...new Array(expectedDim - vectorValue.length).fill(0)];
                  }
                } else {
                  obj[vectorField.name] = vectorValue;
                }
              } else {
                console.warn(`  ⚠️  Missing vector field ${vectorField.name} for item ${p.id}, creating zero vector`);
                obj[vectorField.name] = new Array(expectedDim).fill(0);
              }
            }
          }
          
          // Add all other metadata fields (only those that exist in schema)
          const schemaFieldNames = schema
            .filter(f => f.name !== 'id' && f.data_type !== 'FloatVector')
            .map(f => f.name);
          
          for (const fieldName of schemaFieldNames) {
            const fieldSchema = schema.find(f => f.name === fieldName);
            const val = p[fieldName];
            
            if (val === null || val === undefined) {
              // Provide default based on field type
              if (fieldSchema?.data_type === 'Int64') {
                obj[fieldName] = 0;
              } else if (fieldSchema?.data_type === 'Double') {
                obj[fieldName] = 0.0;
              } else if (fieldSchema?.data_type === 'Bool') {
                obj[fieldName] = false;
              } else {
                obj[fieldName] = '';
              }
            } else {
              // Handle arrays - convert to JSON string for VarChar fields
              if (Array.isArray(val)) {
                obj[fieldName] = JSON.stringify(val);
              } else if (typeof val === 'object') {
                // Handle objects - convert to JSON string
                obj[fieldName] = JSON.stringify(val);
              } else if (fieldSchema?.data_type === 'Int64') {
                obj[fieldName] = typeof val === 'number' ? Math.floor(val) : parseInt(val, 10) || 0;
              } else if (fieldSchema?.data_type === 'Double') {
                obj[fieldName] = typeof val === 'number' ? val : parseFloat(val) || 0.0;
              } else if (fieldSchema?.data_type === 'Bool') {
                obj[fieldName] = Boolean(val);
              } else {
                obj[fieldName] = String(val);
              }
            }
          }
          
          return obj;
        });

        try {
          await client.insert({
            collection_name: col.name,
            data: dataObjects,
          });
          insertedCount += batch.length;
        } catch (insertError) {
          console.error(`  ❌ Insert error:`, insertError.message);
          console.error(`  Batch size:`, batch.length);
          console.error(`  Data objects count:`, dataObjects.length);
          if (dataObjects[0]) {
            console.error(`  Sample object keys:`, Object.keys(dataObjects[0]));
            console.error(`  Sample object (first item):`, JSON.stringify(dataObjects[0], null, 2).substring(0, 500));
          } else {
            console.error(`  No objects in batch`);
          }
          // Log schema for debugging
          console.error(`  Collection schema fields:`, schema.map(f => `${f.name} (${f.data_type}${f.dim ? `, dim=${f.dim}` : ''})`).join(', '));
          throw insertError;
        }
      }
      
      // Flush to ensure data is persisted
      await client.flush({ collection_names: [col.name] });
      console.log(`  ✓ Inserted ${insertedCount} items (flushed)`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`✅ Milvus: ${col.name} (${insertedCount} items)`);
    } catch (error) {
      console.error(`❌ Milvus ${col.name}:`, error.message);
    }
  }
  
  await client.closeConnection();
}

