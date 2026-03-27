import pg from 'pg';
import dotenv from 'dotenv';
import {
  generateProducts,
  generateDocuments,
  generateUsers,
  generateImages,
  generateMultiVectorProducts,
  generateMultiVectorDocuments,
  generatePapers,
  generateMusic,
  generateRealEstate,
} from '../generators.js';

const { Pool } = pg;
dotenv.config();

const POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
const POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres';
const POSTGRES_DB = process.env.POSTGRES_DB || 'vectordb';

const connectionString = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;

/**
 * Map distance metric to pgvector operator class
 */
function getOperatorClass(distanceMetric) {
  switch (distanceMetric) {
    case 'cosine':
      return 'vector_cosine_ops';
    case 'l2':
      return 'vector_l2_ops';
    case 'inner_product':
      return 'vector_ip_ops';
    default:
      return 'vector_cosine_ops';
  }
}

export async function seedPgVectorDB() {
  console.log('\n🚀 Seeding PostgreSQL with pgvector...\n');
  
  const pool = new Pool({
    connectionString,
  });

  try {
    await pool.query('SELECT 1');
    console.log(`✓ Connected to PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}`);
  } catch (error) {
    console.error('❌ Cannot connect to PostgreSQL:', error.message);
    console.error('\n   Make sure PostgreSQL is running. You can start it with:');
    console.error('   docker-compose up postgres');
    return;
  }

  try {
    // Enable pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✓ pgvector extension enabled');
  } catch (error) {
    console.error('❌ Failed to enable pgvector extension:', error.message);
    return;
  }

  // ============================================
  // Create non-vector reference tables first
  // ============================================
  console.log('\n📋 Creating reference tables (non-vector)...\n');

  // Categories table (for products)
  await pool.query(`
    DROP TABLE IF EXISTS categories CASCADE;
    CREATE TABLE categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      slug VARCHAR(100) UNIQUE,
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX categories_parent_id_idx ON categories(parent_id);
    CREATE INDEX categories_slug_idx ON categories(slug);
  `);
  
  const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys', 'Beauty', 'Automotive'];
  for (const cat of categories) {
    await pool.query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)`,
      [cat, cat.toLowerCase().replace(/\s+/g, '-')]
    );
  }
  console.log('  ✓ Created categories table with relationships');

  // Tags table (for documents/papers)
  await pool.query(`
    DROP TABLE IF EXISTS tags CASCADE;
    CREATE TABLE tags (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      color VARCHAR(7) DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX tags_name_idx ON tags(name);
  `);
  
  const tags = ['tech', 'business', 'science', 'health', 'finance', 'legal', 'marketing', 'design', 'machine learning', 'neural networks', 'data analysis'];
  for (const tag of tags) {
    await pool.query(`INSERT INTO tags (name) VALUES ($1)`, [tag]);
  }
  console.log('  ✓ Created tags table');

  // Users table (non-vector, for relationships)
  await pool.query(`
    DROP TABLE IF EXISTS users CASCADE;
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      full_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      is_active BOOLEAN DEFAULT true,
      CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
    );
    CREATE INDEX users_email_idx ON users(email);
    CREATE INDEX users_username_idx ON users(username);
    CREATE INDEX users_active_idx ON users(is_active);
  `);
  
  // Insert some users
  for (let i = 1; i <= 20; i++) {
    await pool.query(
      `INSERT INTO users (username, email, full_name, is_active) VALUES ($1, $2, $3, $4)`,
      [`user${i}`, `user${i}@example.com`, `User ${i}`, i % 3 !== 0]
    );
  }
  console.log('  ✓ Created users table with constraints');

  // Orders table (relating users and products)
  await pool.query(`
    DROP TABLE IF EXISTS orders CASCADE;
    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_number VARCHAR(20) UNIQUE NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
      total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX orders_user_id_idx ON orders(user_id);
    CREATE INDEX orders_status_idx ON orders(status);
    CREATE INDEX orders_created_at_idx ON orders(created_at);
  `);
  
  // Insert some orders
  for (let i = 1; i <= 15; i++) {
    await pool.query(
      `INSERT INTO orders (user_id, order_number, status, total_amount) VALUES ($1, $2, $3, $4)`,
      [
        (i % 20) + 1,
        `ORD-${String(i).padStart(6, '0')}`,
        ['pending', 'processing', 'shipped', 'delivered'][i % 4],
        Math.random() * 1000 + 10
      ]
    );
  }
  console.log('  ✓ Created orders table with foreign keys and constraints');

  // Reviews table (relating users and products)
  await pool.query(`
    DROP TABLE IF EXISTS reviews CASCADE;
    CREATE TABLE reviews (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      product_id INTEGER, -- Will reference ecommerce_products after creation
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      helpful_count INTEGER DEFAULT 0 CHECK (helpful_count >= 0),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX reviews_user_id_idx ON reviews(user_id);
    CREATE INDEX reviews_product_id_idx ON reviews(product_id);
    CREATE INDEX reviews_rating_idx ON reviews(rating);
  `);
  console.log('  ✓ Created reviews table (FK to products will be added later)');

  // Document tags junction table (many-to-many)
  await pool.query(`
    DROP TABLE IF EXISTS document_tags CASCADE;
    CREATE TABLE document_tags (
      document_id INTEGER, -- Will reference research_papers after creation
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (document_id, tag_id)
    );
    CREATE INDEX document_tags_document_id_idx ON document_tags(document_id);
    CREATE INDEX document_tags_tag_id_idx ON document_tags(tag_id);
  `);
  console.log('  ✓ Created document_tags junction table');

  // Settings/Config table (non-vector, key-value store)
  await pool.query(`
    DROP TABLE IF EXISTS app_settings CASCADE;
    CREATE TABLE app_settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) NOT NULL UNIQUE,
      value TEXT,
      type VARCHAR(20) DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
      description TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX app_settings_key_idx ON app_settings(key);
  `);
  
  await pool.query(`
    INSERT INTO app_settings (key, value, type, description) VALUES
    ('app_name', 'VectorDBZ', 'string', 'Application name'),
    ('max_upload_size', '10485760', 'number', 'Max file upload size in bytes'),
    ('enable_analytics', 'true', 'boolean', 'Enable analytics tracking'),
    ('default_vector_dim', '1536', 'number', 'Default vector dimension'),
    ('theme_config', '{"mode":"dark","primaryColor":"#6366f1"}', 'json', 'Theme configuration')
  `);
  console.log('  ✓ Created app_settings table');

  // Audit log table (non-vector, for tracking changes)
  await pool.query(`
    DROP TABLE IF EXISTS audit_log CASCADE;
    CREATE TABLE audit_log (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      record_id INTEGER,
      action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      old_data JSONB,
      new_data JSONB,
      changed_fields TEXT[],
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX audit_log_table_name_idx ON audit_log(table_name);
    CREATE INDEX audit_log_record_id_idx ON audit_log(record_id);
    CREATE INDEX audit_log_user_id_idx ON audit_log(user_id);
    CREATE INDEX audit_log_created_at_idx ON audit_log(created_at);
    CREATE INDEX audit_log_action_idx ON audit_log(action);
  `);
  
  // Insert some sample audit logs
  for (let i = 1; i <= 10; i++) {
    await pool.query(
      `INSERT INTO audit_log (table_name, record_id, action, user_id, new_data, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ['users', 'products', 'categories'][i % 3],
        i,
        ['INSERT', 'UPDATE', 'DELETE'][i % 3],
        (i % 20) + 1,
        JSON.stringify({ sample: 'data', timestamp: new Date().toISOString() }),
        `192.168.1.${i}`
      ]
    );
  }
  console.log('  ✓ Created audit_log table with sample data');

  // Additional regular tables (non-vector)
  
  // Sessions table (for user sessions)
  await pool.query(`
    DROP TABLE IF EXISTS sessions CASCADE;
    CREATE TABLE sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      session_token VARCHAR(255) UNIQUE NOT NULL,
      ip_address INET,
      user_agent TEXT,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX sessions_token_idx ON sessions(session_token);
    CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
  `);
  
  // Insert some sessions
  for (let i = 1; i <= 10; i++) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await pool.query(
      `INSERT INTO sessions (user_id, session_token, ip_address, expires_at) VALUES ($1, $2, $3, $4)`,
      [
        (i % 20) + 1,
        `token_${Math.random().toString(36).substring(2, 15)}`,
        `192.168.1.${i}`,
        expiresAt
      ]
    );
  }
  console.log('  ✓ Created sessions table');

  // Products inventory table (non-vector, for stock management)
  await pool.query(`
    DROP TABLE IF EXISTS inventory CASCADE;
    CREATE TABLE inventory (
      id SERIAL PRIMARY KEY,
      product_sku VARCHAR(50) UNIQUE NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
      warehouse_location VARCHAR(100),
      last_restocked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX inventory_sku_idx ON inventory(product_sku);
    CREATE INDEX inventory_quantity_idx ON inventory(quantity);
  `);
  
  // Insert inventory records
  for (let i = 1; i <= 20; i++) {
    await pool.query(
      `INSERT INTO inventory (product_sku, quantity, reserved_quantity, warehouse_location, last_restocked_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        `SKU-${String(i).padStart(6, '0')}`,
        Math.floor(Math.random() * 1000) + 10,
        Math.floor(Math.random() * 50),
        ['Warehouse A', 'Warehouse B', 'Warehouse C'][i % 3],
        new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      ]
    );
  }
  console.log('  ✓ Created inventory table');

  // Notifications table (non-vector, for user notifications)
  await pool.query(`
    DROP TABLE IF EXISTS notifications CASCADE;
    CREATE TABLE notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX notifications_user_id_idx ON notifications(user_id);
    CREATE INDEX notifications_is_read_idx ON notifications(is_read);
    CREATE INDEX notifications_created_at_idx ON notifications(created_at);
  `);
  
  // Insert some notifications
  const notificationTitles = [
    'Order Shipped',
    'Payment Received',
    'New Message',
    'Profile Updated',
    'Password Changed'
  ];
  for (let i = 1; i <= 25; i++) {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        (i % 20) + 1,
        notificationTitles[i % notificationTitles.length],
        `Notification message ${i}`,
        ['info', 'success', 'warning', 'error'][i % 4],
        i % 3 === 0,
        new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
      ]
    );
  }
  console.log('  ✓ Created notifications table');

  // Payments table (non-vector, for payment transactions)
  await pool.query(`
    DROP TABLE IF EXISTS payments CASCADE;
    CREATE TABLE payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) DEFAULT 'USD',
      payment_method VARCHAR(50) CHECK (payment_method IN ('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash')),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
      transaction_id VARCHAR(255) UNIQUE,
      processed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX payments_order_id_idx ON payments(order_id);
    CREATE INDEX payments_user_id_idx ON payments(user_id);
    CREATE INDEX payments_status_idx ON payments(status);
    CREATE INDEX payments_transaction_id_idx ON payments(transaction_id);
  `);
  
  // Insert some payments
  for (let i = 1; i <= 12; i++) {
    await pool.query(
      `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, status, transaction_id, processed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        i <= 10 ? i : null,
        (i % 20) + 1,
        Math.random() * 1000 + 10,
        'USD',
        ['credit_card', 'debit_card', 'paypal', 'bank_transfer'][i % 4],
        ['pending', 'processing', 'completed', 'failed'][i % 4],
        `TXN-${String(i).padStart(10, '0')}`,
        i % 4 !== 3 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : null
      ]
    );
  }
  console.log('  ✓ Created payments table');

  // Blog posts table (non-vector, content management)
  await pool.query(`
    DROP TABLE IF EXISTS blog_posts CASCADE;
    CREATE TABLE blog_posts (
      id SERIAL PRIMARY KEY,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      excerpt TEXT,
      content TEXT,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      view_count INTEGER DEFAULT 0 CHECK (view_count >= 0),
      published_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX blog_posts_author_id_idx ON blog_posts(author_id);
    CREATE INDEX blog_posts_slug_idx ON blog_posts(slug);
    CREATE INDEX blog_posts_status_idx ON blog_posts(status);
    CREATE INDEX blog_posts_published_at_idx ON blog_posts(published_at);
  `);
  
  // Insert some blog posts
  const blogTitles = [
    'Introduction to Vector Databases',
    'Understanding pgvector',
    'Best Practices for Embeddings',
    'Scaling Vector Search',
    'Vector Similarity Explained'
  ];
  for (let i = 1; i <= 8; i++) {
    const title = blogTitles[i % blogTitles.length] + (i > blogTitles.length ? ` ${Math.floor(i / blogTitles.length) + 1}` : '');
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    await pool.query(
      `INSERT INTO blog_posts (author_id, title, slug, excerpt, content, status, view_count, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        (i % 20) + 1,
        title,
        slug,
        `This is an excerpt for ${title}`,
        `Full content for ${title}. This is a sample blog post content.`,
        i % 3 === 0 ? 'draft' : 'published',
        Math.floor(Math.random() * 1000),
        i % 3 !== 0 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null
      ]
    );
  }
  console.log('  ✓ Created blog_posts table');

  // Comments table (non-vector, for blog posts)
  await pool.query(`
    DROP TABLE IF EXISTS comments CASCADE;
    CREATE TABLE comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_approved BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX comments_post_id_idx ON comments(post_id);
    CREATE INDEX comments_user_id_idx ON comments(user_id);
    CREATE INDEX comments_parent_id_idx ON comments(parent_id);
    CREATE INDEX comments_is_approved_idx ON comments(is_approved);
  `);
  
  // Insert some comments
  for (let i = 1; i <= 15; i++) {
    await pool.query(
      `INSERT INTO comments (post_id, user_id, parent_id, content, is_approved)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        (i % 8) + 1,
        (i % 20) + 1,
        i > 5 && i % 3 === 0 ? i - 3 : null,
        `This is a comment ${i}. Great article!`,
        i % 4 !== 0
      ]
    );
  }
  console.log('  ✓ Created comments table');

  // ============================================
  // Define tables with different pgvector features
  // ============================================
  const tables = [
    {
      name: 'ecommerce_products',
      description: 'E-commerce products with single vector and HNSW index',
      dimension: 384,
      data: generateProducts(30, 384),
      indexType: 'hnsw', // HNSW index for fast approximate search
      distanceMetric: 'cosine',
      foreignKeys: [
        { column: 'category_id', references: 'categories(id)', onDelete: 'SET NULL' }
      ],
      constraints: [
        { type: 'CHECK', condition: 'price >= 0', name: 'price_positive' },
        { type: 'CHECK', condition: 'rating >= 0 AND rating <= 5', name: 'rating_range' },
        { type: 'UNIQUE', columns: ['sku'], name: 'sku_unique' }
      ],
    },
    {
      name: 'research_papers',
      description: 'Research papers with IVFFlat index and full-text search',
      dimension: 768,
      data: generatePapers(25, 768),
      indexType: 'ivfflat', // IVFFlat index for balanced performance
      distanceMetric: 'cosine',
      hasFullText: true,
      foreignKeys: [
        { column: 'author_id', references: 'users(id)', onDelete: 'SET NULL' }
      ],
      constraints: [
        { type: 'CHECK', condition: 'year >= 1900 AND year <= EXTRACT(YEAR FROM CURRENT_DATE)', name: 'year_valid' },
        { type: 'CHECK', condition: 'citations >= 0', name: 'citations_positive' },
        { type: 'UNIQUE', columns: ['doi'], name: 'doi_unique' }
      ],
    },
    {
      name: 'user_profiles',
      description: 'User profiles with L2 distance metric',
      dimension: 256,
      data: generateUsers(20, 256), // Match number of users
      indexType: 'hnsw',
      distanceMetric: 'l2',
      foreignKeys: [
        { column: 'user_id', references: 'users(id)', onDelete: 'CASCADE', unique: true }
      ],
      constraints: [
        { type: 'CHECK', condition: 'followerCount >= 0', name: 'follower_count_positive' },
        { type: 'CHECK', condition: 'followingCount >= 0', name: 'following_count_positive' }
      ],
    },
    {
      name: 'photo_gallery',
      description: 'Photo gallery with cosine distance (inner_product not supported for HNSW)',
      dimension: 512,
      data: generateImages(35, 512),
      indexType: 'hnsw',
      distanceMetric: 'cosine', // Changed from inner_product - HNSW doesn't support inner_product ops
    },
    {
      name: 'multi_vector_products',
      description: 'Products with multiple vector columns (text + image embeddings)',
      dimension: null, // Multiple vectors
      data: generateMultiVectorProducts(20),
      indexType: 'hnsw',
      distanceMetric: 'cosine',
      multiVector: true,
      vectors: {
        text_embedding: 384,
        image_embedding: 512,
      },
    },
    {
      name: 'multi_vector_docs',
      description: 'Documents with multiple vector columns and JSONB metadata',
      dimension: null,
      data: generateMultiVectorDocuments(15),
      indexType: 'hnsw',
      distanceMetric: 'cosine',
      multiVector: true,
      vectors: {
        title_embedding: 256,
        content_embedding: 768,
        summary_embedding: 384,
      },
    },
    {
      name: 'music_tracks',
      description: 'Music tracks with vector and JSONB metadata',
      dimension: 256,
      data: generateMusic(30, 256),
      indexType: 'hnsw',
      distanceMetric: 'cosine',
    },
    {
      name: 'real_estate',
      description: 'Real estate listings with vector and rich metadata',
      dimension: 384,
      data: generateRealEstate(25, 384),
      indexType: 'ivfflat',
      distanceMetric: 'cosine',
    },
  ];

  for (const table of tables) {
    let tableCreated = false;
    try {
      console.log(`\n📦 Processing table: ${table.name}`);
      
      // Drop table if exists
      await pool.query(`DROP TABLE IF EXISTS ${table.name} CASCADE`);
      console.log(`  ✓ Dropped existing table`);
      
      // Create table schema
      let createTableSQL = `CREATE TABLE ${table.name} (
        id SERIAL PRIMARY KEY,
        external_id TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
      
      // Add foreign key columns before vectors
      if (table.foreignKeys) {
        for (const fk of table.foreignKeys) {
          const uniqueClause = fk.unique ? ' UNIQUE' : '';
          createTableSQL += `,\n        ${fk.column} INTEGER${uniqueClause}`;
        }
      }
      
      if (table.multiVector) {
        // Multiple vector columns
        for (const [vecName, dimension] of Object.entries(table.vectors)) {
          createTableSQL += `,\n        ${vecName} vector(${dimension})`;
        }
      } else {
        // Single vector column
        createTableSQL += `,\n        embedding vector(${table.dimension})`;
      }

      // Add metadata columns based on data structure
      const sampleItem = table.data[0];
      for (const [key, value] of Object.entries(sampleItem)) {
        if (key === 'id' || key === 'vector' || (table.multiVector && Object.keys(table.vectors).includes(key))) {
          continue;
        }
        
        if (typeof value === 'string') {
          if (key.includes('email') || key.includes('url') || key.includes('image_url')) {
            createTableSQL += `,\n        ${key} TEXT`;
          } else if (key.includes('content') || key.includes('description') || key.includes('abstract') || key.includes('bio')) {
            createTableSQL += `,\n        ${key} TEXT`;
          } else {
            createTableSQL += `,\n        ${key} VARCHAR(255)`;
          }
        } else if (typeof value === 'number') {
          // Check if this field can have decimal values by examining all items
          // Fields like bathrooms, rating, price, weight often have decimals
          const hasDecimals = table.data.some(item => {
            const val = item[key];
            return typeof val === 'number' && !Number.isInteger(val);
          });
          
          // Also check field name for common decimal fields
          const isDecimalField = key.toLowerCase().includes('bathroom') || 
                                 key.toLowerCase().includes('rating') || 
                                 key.toLowerCase().includes('price') || 
                                 key.toLowerCase().includes('weight') ||
                                 key.toLowerCase().includes('amount') ||
                                 key.toLowerCase().includes('cost');
          
          if (hasDecimals || isDecimalField) {
            createTableSQL += `,\n        ${key} REAL`;
          } else if (Number.isInteger(value)) {
            createTableSQL += `,\n        ${key} INTEGER`;
          } else {
            createTableSQL += `,\n        ${key} REAL`;
          }
        } else if (typeof value === 'boolean') {
          createTableSQL += `,\n        ${key} BOOLEAN`;
        } else if (Array.isArray(value)) {
          // Store arrays as JSONB for flexibility
          createTableSQL += `,\n        ${key} JSONB`;
        } else if (value && typeof value === 'object') {
          createTableSQL += `,\n        ${key} JSONB`;
        }
      }

      // Add JSONB metadata column for flexible storage
      createTableSQL += `,\n        metadata JSONB DEFAULT '{}'::jsonb`;
      
      // Add full-text search column if needed
      if (table.hasFullText) {
        // Check what text fields exist in the sample data
        const textFields = [];
        if (sampleItem.title) textFields.push("COALESCE(title, '')");
        if (sampleItem.abstract) textFields.push("COALESCE(abstract, '')");
        if (sampleItem.description) textFields.push("COALESCE(description, '')");
        if (sampleItem.content) textFields.push("COALESCE(content, '')");
        
        const searchTextExpr = textFields.length > 0 
          ? textFields.join(" || ' ' || ")
          : "COALESCE(title, '')";
        
        createTableSQL += `,\n        search_text TEXT GENERATED ALWAYS AS (${searchTextExpr}) STORED`;
      }

      createTableSQL += '\n      )';
      
      await pool.query(createTableSQL);
      console.log(`  ✓ Table created`);

      // Add foreign key constraints
      if (table.foreignKeys) {
        for (const fk of table.foreignKeys) {
          const onDelete = fk.onDelete || 'NO ACTION';
          await pool.query(`
            ALTER TABLE ${table.name}
            ADD CONSTRAINT ${table.name}_${fk.column}_fkey
            FOREIGN KEY (${fk.column}) REFERENCES ${fk.references}
            ON DELETE ${onDelete}
          `);
        }
        console.log(`  ✓ Added ${table.foreignKeys.length} foreign key constraint(s)`);
      }

      // Add CHECK and UNIQUE constraints
      if (table.constraints) {
        for (const constraint of table.constraints) {
          try {
            if (constraint.type === 'CHECK') {
              await pool.query(`
                ALTER TABLE ${table.name}
                ADD CONSTRAINT ${constraint.name || `${table.name}_${constraint.condition.replace(/[^a-zA-Z0-9]/g, '_')}_check`}
                CHECK (${constraint.condition})
              `);
            } else if (constraint.type === 'UNIQUE') {
              const columns = Array.isArray(constraint.columns) ? constraint.columns.join(', ') : constraint.columns;
              await pool.query(`
                ALTER TABLE ${table.name}
                ADD CONSTRAINT ${constraint.name || `${table.name}_${columns.replace(/,/g, '_')}_unique`}
                UNIQUE (${columns})
              `);
            }
          } catch (e) {
            // Constraint might already exist or fail
            console.warn(`    ⚠️  Could not add constraint ${constraint.name || constraint.type}: ${e.message}`);
          }
        }
        if (table.constraints.length > 0) {
          console.log(`  ✓ Added ${table.constraints.length} constraint(s)`);
        }
      }

      // Create indexes
      const ops = getOperatorClass(table.distanceMetric);
      
      // HNSW only supports cosine and l2, not inner_product
      if (table.indexType === 'hnsw' && table.distanceMetric === 'inner_product') {
        console.warn(`    ⚠️  HNSW doesn't support inner_product, using cosine instead`);
        const cosineOps = getOperatorClass('cosine');
        if (table.multiVector) {
          for (const [vecName] of Object.entries(table.vectors)) {
            await pool.query(`
              CREATE INDEX ${table.name}_${vecName}_idx 
              ON ${table.name} 
              USING hnsw (${vecName} ${cosineOps})
              WITH (m = 16, ef_construction = 64)
            `);
          }
        } else {
          await pool.query(`
            CREATE INDEX ${table.name}_embedding_idx 
            ON ${table.name} 
            USING hnsw (embedding ${cosineOps})
            WITH (m = 16, ef_construction = 64)
          `);
        }
      } else if (table.multiVector) {
        // Create indexes for each vector column
        for (const [vecName, dimension] of Object.entries(table.vectors)) {
          if (table.indexType === 'hnsw') {
            await pool.query(`
              CREATE INDEX ${table.name}_${vecName}_idx 
              ON ${table.name} 
              USING hnsw (${vecName} ${ops})
              WITH (m = 16, ef_construction = 64)
            `);
          } else if (table.indexType === 'ivfflat') {
            // IVFFlat requires specifying number of lists (typically sqrt of rows)
            const lists = Math.max(10, Math.floor(Math.sqrt(table.data.length)));
            await pool.query(`
              CREATE INDEX ${table.name}_${vecName}_idx 
              ON ${table.name} 
              USING ivfflat (${vecName} ${ops})
              WITH (lists = ${lists})
            `);
          }
        }
      } else {
        // Single vector index
        if (table.indexType === 'hnsw') {
          await pool.query(`
            CREATE INDEX ${table.name}_embedding_idx 
            ON ${table.name} 
            USING hnsw (embedding ${ops})
            WITH (m = 16, ef_construction = 64)
          `);
        } else if (table.indexType === 'ivfflat') {
          const lists = Math.max(10, Math.floor(Math.sqrt(table.data.length)));
          await pool.query(`
            CREATE INDEX ${table.name}_embedding_idx 
            ON ${table.name} 
            USING ivfflat (embedding ${ops})
            WITH (lists = ${lists})
          `);
        }
      }
      console.log(`  ✓ Created ${table.indexType.toUpperCase()} index(es)`);

      // Create full-text search index if needed
      if (table.hasFullText) {
        await pool.query(`
          CREATE INDEX ${table.name}_search_text_idx 
          ON ${table.name} 
          USING gin (to_tsvector('english', search_text))
        `);
        console.log(`  ✓ Created full-text search index`);
      }

      // Create additional indexes on common filter fields
      const filterFields = table.name === 'ecommerce_products' 
        ? ['category', 'brand', 'price', 'inStock', 'rating']
        : table.name === 'research_papers'
        ? ['field', 'year', 'citations', 'journal']
        : table.name === 'user_profiles'
        ? ['city', 'country', 'isPremium', 'isVerified']
        : table.name === 'photo_gallery'
        ? ['category', 'photographer', 'format']
        : table.name === 'multi_vector_products'
        ? ['category', 'brand', 'price']
        : table.name === 'multi_vector_docs'
        ? ['docType', 'author', 'wordCount']
        : table.name === 'music_tracks'
        ? ['genre', 'artist', 'year']
        : table.name === 'real_estate'
        ? ['propertyType', 'city', 'bedrooms', 'bathrooms', 'price']
        : [];

      for (const field of filterFields) {
        try {
          const sampleValue = sampleItem[field];
          if (typeof sampleValue === 'string') {
            await pool.query(`CREATE INDEX ${table.name}_${field}_idx ON ${table.name} (${field})`);
          } else if (typeof sampleValue === 'number') {
            await pool.query(`CREATE INDEX ${table.name}_${field}_idx ON ${table.name} (${field})`);
          } else if (typeof sampleValue === 'boolean') {
            await pool.query(`CREATE INDEX ${table.name}_${field}_idx ON ${table.name} (${field})`);
          }
        } catch (e) {
          // Field might not exist or index creation failed
        }
      }
      
      if (filterFields.length > 0) {
        console.log(`  ✓ Created ${filterFields.length} filter indexes`);
      }

      // Insert data in batches
      let insertedCount = 0;
      const insertedIds = []; // Track inserted IDs for relationships
      
      for (let i = 0; i < table.data.length; i += 20) {
        const batch = table.data.slice(i, i + 20);
        
        for (const item of batch) {
          const columns = [];
          const values = [];
          const placeholders = [];
          let paramIndex = 1;

          // Add external_id
          columns.push('external_id');
          values.push(item.id);
          placeholders.push(`$${paramIndex++}`);

          // Add foreign key values
          if (table.foreignKeys) {
            for (const fk of table.foreignKeys) {
              columns.push(fk.column);
              if (fk.column === 'category_id') {
                // Get random category ID (1-8)
                values.push(Math.floor(Math.random() * 8) + 1);
              } else if (fk.column === 'user_id') {
                // For unique user_id, assign sequentially to avoid duplicates
                if (fk.unique) {
                  // Assign user_id based on item index, wrapping around if needed
                  const userId = (insertedCount % 20) + 1;
                  values.push(userId);
                } else {
                  // Get random user ID (1-20)
                  values.push(Math.floor(Math.random() * 20) + 1);
                }
              } else if (fk.column === 'author_id') {
                // Get random user ID (1-20)
                values.push(Math.floor(Math.random() * 20) + 1);
              } else {
                values.push(null);
              }
              placeholders.push(`$${paramIndex++}`);
            }
          }

          // Add vector(s) - pgvector accepts vectors in '[1,2,3]' format
          if (table.multiVector) {
            for (const [vecName, dimension] of Object.entries(table.vectors)) {
              if (item[vecName] && Array.isArray(item[vecName])) {
                columns.push(vecName);
                // Format vector as PostgreSQL array string: '[1,2,3]'
                // pgvector will parse this when cast to vector type
                const vectorStr = '[' + item[vecName].map(v => typeof v === 'number' ? v : parseFloat(v)).join(',') + ']';
                values.push(vectorStr);
                placeholders.push(`$${paramIndex++}::vector`);
              }
            }
          } else {
            if (item.vector && Array.isArray(item.vector)) {
              columns.push('embedding');
              // Format vector as PostgreSQL array string: '[1,2,3]'
              const vectorStr = '[' + item.vector.map(v => typeof v === 'number' ? v : parseFloat(v)).join(',') + ']';
              values.push(vectorStr);
              placeholders.push(`$${paramIndex++}::vector`);
            }
          }

          // Add other fields
          for (const [key, value] of Object.entries(item)) {
            if (key === 'id' || key === 'vector' || (table.multiVector && Object.keys(table.vectors).includes(key))) {
              continue;
            }
            
            columns.push(key);
            if (Array.isArray(value)) {
              // Arrays stored as JSONB
              values.push(JSON.stringify(value));
              placeholders.push(`$${paramIndex++}::jsonb`);
            } else if (value && typeof value === 'object') {
              values.push(JSON.stringify(value));
              placeholders.push(`$${paramIndex++}::jsonb`);
            } else {
              values.push(value);
              placeholders.push(`$${paramIndex++}`);
            }
          }

          // Build metadata JSONB from any remaining fields
          const metadata = {};
          for (const [key, value] of Object.entries(item)) {
            if (!columns.includes(key) && key !== 'id' && key !== 'vector' && !(table.multiVector && Object.keys(table.vectors).includes(key))) {
              if (value !== null && value !== undefined) {
                metadata[key] = value;
              }
            }
          }
          
          if (Object.keys(metadata).length > 0) {
            columns.push('metadata');
            values.push(JSON.stringify(metadata));
            placeholders.push(`$${paramIndex++}::jsonb`);
          }

          const insertSQL = `
            INSERT INTO ${table.name} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING id
          `;
          
          const result = await pool.query(insertSQL, values);
          insertedIds.push(result.rows[0].id);
          insertedCount++;
        }
      }
      console.log(`  ✓ Inserted ${insertedCount} items`);

      // Store inserted IDs for later relationship creation
      table.insertedIds = insertedIds;

      tableCreated = true;
      console.log(`✅ PostgreSQL: ${table.name} (${insertedCount} items, ${table.indexType.toUpperCase()} index)`);
    } catch (error) {
      console.error(`❌ PostgreSQL ${table.name}:`, error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack.split('\n')[0]);
      }
      // Mark table as not created so we don't try to create relationships
      table.insertedIds = [];
      tableCreated = false;
    }
    
    // Only track created tables for relationships
    if (!tableCreated) {
      table.insertedIds = [];
    }
  }

  // ============================================
  // Create relationships after all tables exist
  // ============================================
  console.log('\n🔗 Creating relationships...\n');

  // Add foreign key from reviews to ecommerce_products
  const productsTable = tables.find(t => t.name === 'ecommerce_products');
  if (productsTable && productsTable.insertedIds) {
    try {
      await pool.query(`
        ALTER TABLE reviews
        ADD CONSTRAINT reviews_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES ecommerce_products(id)
        ON DELETE CASCADE
      `);
      
      // Insert some reviews
      for (let i = 0; i < 20; i++) {
        const productId = productsTable.insertedIds[Math.floor(Math.random() * productsTable.insertedIds.length)];
        const userId = Math.floor(Math.random() * 20) + 1;
        await pool.query(
          `INSERT INTO reviews (user_id, product_id, rating, comment, helpful_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            productId,
            Math.floor(Math.random() * 5) + 1,
            i % 3 === 0 ? `Great product! ${Math.random() > 0.5 ? 'Highly recommend.' : 'Would buy again.'}` : null,
            Math.floor(Math.random() * 50)
          ]
        );
      }
      console.log('  ✓ Added reviews with foreign keys to products');
    } catch (e) {
      console.warn('  ⚠️  Could not add reviews FK:', e.message);
    }
  }

  // Add foreign key from document_tags to research_papers
  const papersTable = tables.find(t => t.name === 'research_papers');
  if (papersTable && papersTable.insertedIds) {
    try {
      await pool.query(`
        ALTER TABLE document_tags
        ADD CONSTRAINT document_tags_document_id_fkey
        FOREIGN KEY (document_id) REFERENCES research_papers(id)
        ON DELETE CASCADE
      `);
      
      // Insert document-tag relationships
      const tagIds = await pool.query('SELECT id FROM tags');
      for (const paperId of papersTable.insertedIds) {
        // Each paper gets 2-5 random tags
        const numTags = Math.floor(Math.random() * 4) + 2;
        const selectedTags = tagIds.rows
          .sort(() => Math.random() - 0.5)
          .slice(0, numTags)
          .map(t => t.id);
        
        for (const tagId of selectedTags) {
          try {
            await pool.query(
              `INSERT INTO document_tags (document_id, tag_id) VALUES ($1, $2)
               ON CONFLICT (document_id, tag_id) DO NOTHING`,
              [paperId, tagId]
            );
          } catch (e) {
            // Ignore duplicates
          }
        }
      }
      console.log('  ✓ Added document-tag relationships');
    } catch (e) {
      console.warn('  ⚠️  Could not add document_tags FK:', e.message);
    }
  }

  // Create indexes on foreign keys in vector tables
  for (const table of tables) {
    if (table.foreignKeys) {
      for (const fk of table.foreignKeys) {
        try {
          await pool.query(`CREATE INDEX IF NOT EXISTS ${table.name}_${fk.column}_idx ON ${table.name} (${fk.column})`);
        } catch (e) {
          // Index might already exist
        }
      }
    }
  }

  // ============================================
  // Create some useful views
  // ============================================
  console.log('\n👁️  Creating views...\n');

  // View: Products with category names
  await pool.query(`
    DROP VIEW IF EXISTS products_with_categories CASCADE;
    CREATE VIEW products_with_categories AS
    SELECT 
      p.id,
      p.external_id,
      p.name,
      p.price,
      p.rating,
      p.inStock,
      c.name as category_name,
      c.slug as category_slug,
      p.created_at
    FROM ecommerce_products p
    LEFT JOIN categories c ON p.category_id = c.id;
  `);
  console.log('  ✓ Created products_with_categories view');

  // View: Research papers with authors and tag counts (only if table exists)
  // Reuse papersTable from above - check if it was successfully created
  if (papersTable && papersTable.insertedIds && papersTable.insertedIds.length > 0) {
    try {
      await pool.query(`
        DROP VIEW IF EXISTS papers_with_metadata CASCADE;
        CREATE VIEW papers_with_metadata AS
        SELECT 
          rp.id,
          rp.title,
          rp.field,
          rp.year,
          rp.citations,
          u.username as author_username,
          u.email as author_email,
          COUNT(DISTINCT dt.tag_id) as tag_count,
          rp.created_at
        FROM research_papers rp
        LEFT JOIN users u ON rp.author_id = u.id
        LEFT JOIN document_tags dt ON rp.id = dt.document_id
        GROUP BY rp.id, rp.title, rp.field, rp.year, rp.citations, u.username, u.email, rp.created_at;
      `);
      console.log('  ✓ Created papers_with_metadata view');
    } catch (e) {
      console.warn('  ⚠️  Could not create papers_with_metadata view:', e.message);
    }
  } else {
    console.log('  ⚠️  Skipped papers_with_metadata view (research_papers table not created)');
  }

  // View: User activity summary
  await pool.query(`
    DROP VIEW IF EXISTS user_activity_summary CASCADE;
    CREATE VIEW user_activity_summary AS
    SELECT 
      u.id,
      u.username,
      u.email,
      COUNT(DISTINCT o.id) as order_count,
      COUNT(DISTINCT r.id) as review_count,
      COALESCE(SUM(o.total_amount), 0) as total_spent,
      up.followerCount,
      up.followingCount,
      u.last_login
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    LEFT JOIN reviews r ON u.id = r.user_id
    LEFT JOIN user_profiles up ON u.id = up.user_id
    GROUP BY u.id, u.username, u.email, up.followerCount, up.followingCount, u.last_login;
  `);
  console.log('  ✓ Created user_activity_summary view');

  // View: Recent activity (combining multiple tables)
  await pool.query(`
    DROP VIEW IF EXISTS recent_activity CASCADE;
    CREATE VIEW recent_activity AS
    SELECT 
      'order' as activity_type,
      o.id as activity_id,
      o.order_number as title,
      u.username as user_name,
      o.created_at,
      o.status as metadata
    FROM orders o
    JOIN users u ON o.user_id = u.id
    UNION ALL
    SELECT 
      'review' as activity_type,
      r.id as activity_id,
      'Product Review' as title,
      u.username as user_name,
      r.created_at,
      r.rating::text as metadata
    FROM reviews r
    JOIN users u ON r.user_id = u.id
    ORDER BY created_at DESC
    LIMIT 50;
  `);
  console.log('  ✓ Created recent_activity view');

  // ============================================
  // Create some PostgreSQL functions
  // ============================================
  console.log('\n⚙️  Creating functions...\n');

  // Function: Get product recommendations based on category
  await pool.query(`
    CREATE OR REPLACE FUNCTION get_category_products(p_category_name VARCHAR)
    RETURNS TABLE (
      product_id INTEGER,
      product_name VARCHAR,
      price REAL,
      rating REAL,
      category_name VARCHAR
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        p.id,
        p.name::VARCHAR,
        p.price,
        p.rating,
        c.name::VARCHAR
      FROM ecommerce_products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.name = p_category_name
      ORDER BY p.rating DESC, p.price ASC;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('  ✓ Created get_category_products function');

  // Function: Update product rating based on reviews
  await pool.query(`
    CREATE OR REPLACE FUNCTION update_product_rating(product_id INTEGER)
    RETURNS REAL AS $$
    DECLARE
      avg_rating REAL;
    BEGIN
      SELECT AVG(rating) INTO avg_rating
      FROM reviews
      WHERE reviews.product_id = update_product_rating.product_id;
      
      UPDATE ecommerce_products
      SET rating = COALESCE(avg_rating, rating),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = product_id;
      
      RETURN avg_rating;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('  ✓ Created update_product_rating function');

  // Function: Get user statistics
  await pool.query(`
    CREATE OR REPLACE FUNCTION get_user_stats(user_id INTEGER)
    RETURNS TABLE (
      total_orders INTEGER,
      total_spent DECIMAL,
      total_reviews INTEGER,
      avg_review_rating REAL
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        COUNT(DISTINCT o.id)::INTEGER,
        COALESCE(SUM(o.total_amount), 0)::DECIMAL,
        COUNT(DISTINCT r.id)::INTEGER,
        AVG(r.rating)::REAL
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      LEFT JOIN reviews r ON u.id = r.user_id
      WHERE u.id = user_id
      GROUP BY u.id;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('  ✓ Created get_user_stats function');

  // ============================================
  // Create triggers for updated_at
  // ============================================
  console.log('\n🔄 Creating triggers...\n');

  // Function to update updated_at timestamp
  await pool.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Add triggers to tables with updated_at
  const tablesWithUpdatedAt = ['ecommerce_products', 'research_papers', 'user_profiles', 'orders', 'reviews'];
  for (const tableName of tablesWithUpdatedAt) {
    try {
      await pool.query(`
        DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON ${tableName};
        CREATE TRIGGER update_${tableName}_updated_at
        BEFORE UPDATE ON ${tableName}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      `);
    } catch (e) {
      // Table might not exist yet or trigger already exists
    }
  }
  console.log('  ✓ Created updated_at triggers');

  await pool.end();
  console.log('\n✅ PostgreSQL with pgvector seeding complete!');
  console.log('   📊 Created:');
  console.log('   - Reference tables (categories, tags, users, orders, reviews, settings, audit_log)');
  console.log('   - Vector tables with relationships and constraints');
  console.log('   - Foreign keys, CHECK constraints, and UNIQUE constraints');
  console.log('   - Junction tables for many-to-many relationships');
  console.log('   - Useful views for data aggregation');
  console.log('   - Indexes on foreign keys and common query fields');
}

