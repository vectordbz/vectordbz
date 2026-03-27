import { faker } from '@faker-js/faker';

// Generate a random vector of given dimension
export function generateVector(dimension) {
  return Array.from({ length: dimension }, () => (Math.random() * 2 - 1));
}

// Generate a sparse vector (for text/keyword search)
// Returns indices and values arrays for non-zero elements
// Used for hybrid search (BM25-style sparse vectors)
export function generateSparseVector(maxDimension = 30000, nonZeroCount = 50) {
  const indices = [];
  const values = [];
  
  // Generate random unique indices
  const usedIndices = new Set();
  while (usedIndices.size < nonZeroCount) {
    usedIndices.add(Math.floor(Math.random() * maxDimension));
  }
  
  // Sort indices and generate corresponding values
  const sortedIndices = Array.from(usedIndices).sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    indices.push(idx);
    // Generate positive values (typical for BM25/TF-IDF style sparse vectors)
    values.push(Math.random() * 5);
  }
  
  return { indices, values };
}

// Convert sparse vector to object format (some DBs prefer this)
export function sparseToDictFormat(sparse) {
  const dict = {};
  for (let i = 0; i < sparse.indices.length; i++) {
    dict[sparse.indices[i]] = sparse.values[i];
  }
  return dict;
}

// Generate a binary vector (for image hashing, near-duplicate detection)
// Returns array of bytes representing packed bits
export function generateBinaryVector(dimensionBits = 256) {
  const numBytes = Math.ceil(dimensionBits / 8);
  const bytes = [];
  for (let i = 0; i < numBytes; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return bytes;
}

// Generate multiple vectors for multi-vector collections
export function generateVectors(dimensions) {
  return Object.fromEntries(
    Object.entries(dimensions).map(([name, dim]) => [name, generateVector(dim)])
  );
}

// ============================================
// E-commerce Data
// ============================================

export function generateProducts(count, dimension = 384) {
  const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys', 'Beauty', 'Automotive'];
  const brands = ['TechCorp', 'StyleCo', 'HomeMax', 'SportPro', 'BookWorld', 'PlayTime', 'BeautyPlus', 'AutoDrive'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `prod_${i + 1}`,
    vector: generateVector(dimension),
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    price: parseFloat(faker.commerce.price({ min: 10, max: 2000 })),
    category: faker.helpers.arrayElement(categories),
    brand: faker.helpers.arrayElement(brands),
    sku: faker.string.alphanumeric(8).toUpperCase(),
    inStock: faker.datatype.boolean(),
    rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
    reviewCount: faker.number.int({ min: 0, max: 1000 }),
    weight: faker.number.float({ min: 0.1, max: 50, fractionDigits: 2 }),
    dimensions: `${faker.number.int({ min: 5, max: 100 })}x${faker.number.int({ min: 5, max: 100 })}x${faker.number.int({ min: 5, max: 100 })}`,
    color: faker.color.human(),
    material: faker.helpers.arrayElement(['Cotton', 'Plastic', 'Metal', 'Wood', 'Leather', 'Synthetic']),
    createdAt: faker.date.past({ years: 2 }).toISOString(),
    updatedAt: faker.date.recent().toISOString(),
  }));
}

// ============================================
// Document/Content Data
// ============================================

export function generateDocuments(count, dimension = 768) {
  const docTypes = ['article', 'report', 'memo', 'manual', 'guide', 'tutorial', 'whitepaper', 'blog'];
  const languages = ['en', 'es', 'fr', 'de', 'it', 'pt'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `doc_${i + 1}`,
    vector: generateVector(dimension),
    title: faker.lorem.sentence({ min: 3, max: 8 }),
    content: faker.lorem.paragraphs(faker.number.int({ min: 2, max: 5 })),
    excerpt: faker.lorem.sentence({ min: 10, max: 20 }),
    author: faker.person.fullName(),
    authorEmail: faker.internet.email(),
    docType: faker.helpers.arrayElement(docTypes),
    tags: faker.helpers.arrayElements(['tech', 'business', 'science', 'health', 'finance', 'legal', 'marketing', 'design'], { min: 2, max: 5 }),
    wordCount: faker.number.int({ min: 500, max: 10000 }),
    language: faker.helpers.arrayElement(languages),
    readingTime: faker.number.int({ min: 2, max: 30 }),
    publishedAt: faker.date.past({ years: 1 }).toISOString(),
    updatedAt: faker.date.recent().toISOString(),
    isPublic: faker.datatype.boolean(),
    viewCount: faker.number.int({ min: 0, max: 50000 }),
  }));
}

// ============================================
// User/Profile Data
// ============================================

export function generateUsers(count, dimension = 256) {
  const interests = ['technology', 'music', 'sports', 'travel', 'food', 'art', 'gaming', 'reading', 'photography', 'fitness'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `user_${i + 1}`,
    vector: generateVector(dimension),
    userId: faker.string.uuid(),
    username: faker.internet.username(),
    email: faker.internet.email(),
    fullName: faker.person.fullName(),
    bio: faker.person.bio(),
    city: faker.location.city(),
    country: faker.location.country(),
    timezone: faker.location.timeZone(),
    interests: faker.helpers.arrayElements(interests, { min: 2, max: 6 }),
    joinedAt: faker.date.past({ years: 3 }).toISOString(),
    lastActive: faker.date.recent().toISOString(),
    isPremium: faker.datatype.boolean(),
    isVerified: faker.datatype.boolean({ probability: 0.3 }),
    followerCount: faker.number.int({ min: 0, max: 100000 }),
    followingCount: faker.number.int({ min: 0, max: 5000 }),
  }));
}

// ============================================
// Image/Media Data
// ============================================

export function generateImages(count, dimension = 512) {
  const categories = ['nature', 'city', 'portrait', 'abstract', 'architecture', 'food', 'travel', 'art', 'wildlife', 'sports'];
  const imageSizes = [
    { width: 800, height: 600 },
    { width: 1024, height: 768 },
    { width: 1200, height: 800 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ];
  
  return Array.from({ length: count }, (_, i) => {
    const size = faker.helpers.arrayElement(imageSizes);
    const category = faker.helpers.arrayElement(categories);
    const imageUrl = `https://picsum.photos/seed/${i + 1000}/${size.width}/${size.height}`;
    
    return {
      id: `img_${i + 1}`,
      vector: generateVector(dimension),
      title: faker.lorem.sentence({ min: 3, max: 6 }),
      description: faker.lorem.paragraph(),
      image_url: imageUrl,
      category: category,
      photographer: faker.person.fullName(),
      photographerEmail: faker.internet.email(),
      tags: faker.helpers.arrayElements(['landscape', 'portrait', 'urban', 'nature', 'abstract', 'colorful', 'minimalist', 'vibrant', 'bw', 'hd'], { min: 3, max: 6 }),
      width: size.width,
      height: size.height,
      fileSize: faker.number.int({ min: 50000, max: 5000000 }),
      format: faker.helpers.arrayElement(['jpg', 'jpeg', 'png', 'webp', 'heic']),
      createdAt: faker.date.past({ years: 1 }).toISOString(),
      views: faker.number.int({ min: 0, max: 500000 }),
      likes: faker.number.int({ min: 0, max: 10000 }),
      downloads: faker.number.int({ min: 0, max: 5000 }),
      license: faker.helpers.arrayElement(['CC0', 'CC-BY', 'CC-BY-SA', 'Commercial', 'Rights Managed']),
      location: faker.location.city() + ', ' + faker.location.country(),
    };
  });
}

// ============================================
// Multi-Vector Collections
// ============================================

// Products with multiple vectors (text + image embeddings)
export function generateMultiVectorProducts(count) {
  const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports'];
  
  return Array.from({ length: count }, (_, i) => {
    const vectors = generateVectors({
      text_embedding: 384,  // Text description embedding
      image_embedding: 512, // Product image embedding
    });
    
    return {
      id: `mv_prod_${i + 1}`,
      ...vectors,
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price({ min: 50, max: 1500 })),
      category: faker.helpers.arrayElement(categories),
      brand: faker.company.name(),
      sku: faker.string.alphanumeric(8).toUpperCase(),
      inStock: faker.datatype.boolean(),
      rating: faker.number.float({ min: 3, max: 5, fractionDigits: 1 }),
      reviewCount: faker.number.int({ min: 10, max: 500 }),
      imageUrl: `https://picsum.photos/seed/product_${i + 1}/400/400`,
      createdAt: faker.date.past().toISOString(),
    };
  });
}

// Documents with multiple vectors (title + content embeddings)
export function generateMultiVectorDocuments(count) {
  return Array.from({ length: count }, (_, i) => {
    const vectors = generateVectors({
      title_embedding: 256,    // Title embedding
      content_embedding: 768,   // Full content embedding
      summary_embedding: 384,  // Summary embedding
    });
    
    return {
      id: `mv_doc_${i + 1}`,
      ...vectors,
      title: faker.lorem.sentence({ min: 4, max: 10 }),
      content: faker.lorem.paragraphs(5),
      summary: faker.lorem.paragraph(),
      author: faker.person.fullName(),
      docType: faker.helpers.arrayElement(['article', 'report', 'whitepaper']),
      tags: faker.helpers.arrayElements(['tech', 'business', 'science'], { min: 1, max: 3 }),
      wordCount: faker.number.int({ min: 1000, max: 8000 }),
      publishedAt: faker.date.past().toISOString(),
    };
  });
}

// ============================================
// Specialized Collections
// ============================================

// Scientific papers
export function generatePapers(count, dimension = 768) {
  const fields = ['Computer Science', 'Biology', 'Physics', 'Chemistry', 'Mathematics', 'Medicine'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `paper_${i + 1}`,
    vector: generateVector(dimension),
    title: faker.lorem.sentence({ min: 5, max: 12 }),
    abstract: faker.lorem.paragraphs(2),
    authors: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => faker.person.fullName()),
    field: faker.helpers.arrayElement(fields),
    journal: faker.company.name() + ' Journal',
    year: faker.number.int({ min: 2018, max: 2024 }),
    citations: faker.number.int({ min: 0, max: 500 }),
    doi: `10.1000/${faker.string.alphanumeric(8)}`,
    keywords: faker.helpers.arrayElements(['machine learning', 'neural networks', 'data analysis', 'experimental', 'theoretical'], { min: 3, max: 6 }),
    publishedAt: faker.date.past({ years: 3 }).toISOString(),
  }));
}

// Music tracks
export function generateMusic(count, dimension = 256) {
  const genres = ['Pop', 'Rock', 'Jazz', 'Classical', 'Electronic', 'Hip-Hop', 'Country', 'Blues'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `track_${i + 1}`,
    vector: generateVector(dimension),
    title: faker.music.songName(),
    artist: faker.person.fullName(),
    album: faker.music.genre() + ' Collection',
    genre: faker.helpers.arrayElement(genres),
    duration: faker.number.int({ min: 120, max: 360 }), // seconds
    year: faker.number.int({ min: 2010, max: 2024 }),
    plays: faker.number.int({ min: 0, max: 1000000 }),
    likes: faker.number.int({ min: 0, max: 50000 }),
    bpm: faker.number.int({ min: 60, max: 180 }),
    key: faker.helpers.arrayElement(['C', 'D', 'E', 'F', 'G', 'A', 'B']),
    createdAt: faker.date.past({ years: 2 }).toISOString(),
  }));
}

// Real estate listings
export function generateRealEstate(count, dimension = 384) {
  const propertyTypes = ['Apartment', 'House', 'Condo', 'Townhouse', 'Studio'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `property_${i + 1}`,
    vector: generateVector(dimension),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zipCode: faker.location.zipCode(),
    propertyType: faker.helpers.arrayElement(propertyTypes),
    bedrooms: faker.number.int({ min: 1, max: 5 }),
    bathrooms: faker.number.float({ min: 1, max: 4, fractionDigits: 1 }),
    squareFeet: faker.number.int({ min: 500, max: 5000 }),
    price: faker.number.int({ min: 100000, max: 2000000 }),
    yearBuilt: faker.number.int({ min: 1950, max: 2024 }),
    listingDate: faker.date.recent().toISOString(),
    status: faker.helpers.arrayElement(['For Sale', 'Pending', 'Sold', 'Off Market']),
    imageUrl: `https://picsum.photos/seed/property_${i + 1}/800/600`,
  }));
}

// ============================================
// Hybrid Search Collections (Dense + Sparse)
// ============================================

// Products with both dense and sparse vectors for hybrid search
export function generateHybridProducts(count, denseDimension = 384) {
  const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys'];
  const brands = ['TechCorp', 'StyleCo', 'HomeMax', 'SportPro', 'BookWorld', 'PlayTime'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `hybrid_prod_${i + 1}`,
    dense_vector: generateVector(denseDimension),
    sparse_vector: generateSparseVector(30000, faker.number.int({ min: 20, max: 80 })),
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    price: parseFloat(faker.commerce.price({ min: 10, max: 2000 })),
    category: faker.helpers.arrayElement(categories),
    brand: faker.helpers.arrayElement(brands),
    sku: faker.string.alphanumeric(8).toUpperCase(),
    inStock: faker.datatype.boolean(),
    rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
    reviewCount: faker.number.int({ min: 0, max: 1000 }),
    createdAt: faker.date.past({ years: 1 }).toISOString(),
  }));
}

// Documents with both dense (semantic) and sparse (keyword/BM25) vectors
export function generateHybridDocuments(count, denseDimension = 768) {
  const docTypes = ['article', 'report', 'memo', 'manual', 'guide', 'tutorial'];
  const languages = ['en', 'es', 'fr', 'de'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `hybrid_doc_${i + 1}`,
    dense_vector: generateVector(denseDimension),
    sparse_vector: generateSparseVector(50000, faker.number.int({ min: 40, max: 120 })),
    title: faker.lorem.sentence({ min: 3, max: 8 }),
    content: faker.lorem.paragraphs(faker.number.int({ min: 2, max: 5 })),
    excerpt: faker.lorem.sentence({ min: 10, max: 20 }),
    author: faker.person.fullName(),
    docType: faker.helpers.arrayElement(docTypes),
    tags: faker.helpers.arrayElements(['tech', 'business', 'science', 'health', 'finance'], { min: 2, max: 4 }),
    wordCount: faker.number.int({ min: 500, max: 10000 }),
    language: faker.helpers.arrayElement(languages),
    publishedAt: faker.date.past({ years: 1 }).toISOString(),
    viewCount: faker.number.int({ min: 0, max: 50000 }),
  }));
}

// Research papers with hybrid search (semantic + keyword matching)
export function generateHybridPapers(count, denseDimension = 768) {
  const fields = ['Computer Science', 'Biology', 'Physics', 'Chemistry', 'Mathematics'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `hybrid_paper_${i + 1}`,
    dense_vector: generateVector(denseDimension),
    sparse_vector: generateSparseVector(40000, faker.number.int({ min: 50, max: 150 })),
    title: faker.lorem.sentence({ min: 5, max: 12 }),
    abstract: faker.lorem.paragraphs(2),
    authors: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => faker.person.fullName()),
    field: faker.helpers.arrayElement(fields),
    journal: faker.company.name() + ' Journal',
    year: faker.number.int({ min: 2020, max: 2024 }),
    citations: faker.number.int({ min: 0, max: 500 }),
    doi: `10.1000/${faker.string.alphanumeric(8)}`,
    keywords: faker.helpers.arrayElements(['machine learning', 'neural networks', 'data analysis', 'quantum', 'experimental'], { min: 3, max: 6 }),
    publishedAt: faker.date.past({ years: 2 }).toISOString(),
  }));
}

// ============================================
// Binary Vector Collections (for image hashing, near-duplicate detection)
// ============================================

// Images with binary perceptual hash vectors
export function generateBinaryImages(count, binaryDimension = 256) {
  const categories = ['nature', 'city', 'portrait', 'abstract', 'architecture'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `binary_img_${i + 1}`,
    binary_vector: generateBinaryVector(binaryDimension),
    title: faker.lorem.sentence({ min: 3, max: 6 }),
    description: faker.lorem.paragraph(),
    image_url: `https://picsum.photos/seed/${i + 5000}/800/600`,
    category: faker.helpers.arrayElement(categories),
    photographer: faker.person.fullName(),
    width: faker.helpers.arrayElement([800, 1024, 1200, 1920]),
    height: faker.helpers.arrayElement([600, 768, 800, 1080]),
    fileSize: faker.number.int({ min: 50000, max: 5000000 }),
    format: faker.helpers.arrayElement(['jpg', 'png', 'webp']),
    hash: faker.string.alphanumeric(16).toUpperCase(),
    createdAt: faker.date.past({ years: 1 }).toISOString(),
    views: faker.number.int({ min: 0, max: 100000 }),
  }));
}

// Documents with binary fingerprints (for near-duplicate detection)
export function generateBinaryDocuments(count, binaryDimension = 512) {
  const docTypes = ['article', 'report', 'manual', 'guide'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `binary_doc_${i + 1}`,
    binary_vector: generateBinaryVector(binaryDimension),
    title: faker.lorem.sentence({ min: 4, max: 10 }),
    content: faker.lorem.paragraphs(3),
    author: faker.person.fullName(),
    docType: faker.helpers.arrayElement(docTypes),
    wordCount: faker.number.int({ min: 500, max: 8000 }),
    fingerprint: faker.string.alphanumeric(32).toUpperCase(),
    publishedAt: faker.date.past({ years: 1 }).toISOString(),
    language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de']),
  }));
}

