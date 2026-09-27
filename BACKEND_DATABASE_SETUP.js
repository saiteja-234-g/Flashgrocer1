/* ================================================================
   FlashGrocer – COMPLETE DATABASE SETUP & CONFIGURATION
   SQLite with better-sqlite3 - Production Ready
   ================================================================ */

/**
 * ================================================================
 * DATABASE INITIALIZATION (database/db.js)
 * ================================================================
 */

const completeDbSetup = `
'use strict';

require('dotenv').config();

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure database directory exists
const dbDir = path.dirname(process.env.DB_PATH || './database/flashgrocer.db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const DB_PATH = path.resolve(process.env.DB_PATH || './database/flashgrocer.db');
const db = new Database(DB_PATH);

// Enable WAL for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

/* ════════════════════════════════════════════════════════════
   SCHEMA INITIALIZATION
   ════════════════════════════════════════════════════════════ */

db.exec(\`
  /* ─── USERS TABLE ─── */
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    phone         TEXT,
    address       TEXT,
    city          TEXT,
    state         TEXT,
    pin_code      TEXT,
    role          TEXT    NOT NULL DEFAULT 'customer',
    is_active     INTEGER NOT NULL DEFAULT 1,
    email_verified INTEGER NOT NULL DEFAULT 0,
    avatar        TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT
  );

  /* ─── REFRESH TOKENS TABLE ─── */
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ─── PRODUCTS TABLE ─── */
  CREATE TABLE IF NOT EXISTS products (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    category         TEXT    NOT NULL,
    description      TEXT,
    price            REAL    NOT NULL CHECK(price >= 0),
    original_price   REAL    CHECK(original_price >= 0),
    stock            INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    rating           REAL    DEFAULT 0 CHECK(rating >= 0 AND rating <= 5),
    reviews_count    INTEGER DEFAULT 0,
    img              TEXT,
    badge            TEXT,
    delivery_time    TEXT,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ─── CART TABLE ─── */
  CREATE TABLE IF NOT EXISTS cart (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL CHECK(quantity > 0),
    added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

  /* ─── ORDERS TABLE ─── */
  CREATE TABLE IF NOT EXISTS orders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_number     TEXT    NOT NULL UNIQUE,
    total_price      REAL    NOT NULL,
    tax              REAL    DEFAULT 0,
    discount         REAL    DEFAULT 0,
    shipping_cost    REAL    DEFAULT 0,
    status           TEXT    NOT NULL DEFAULT 'pending',
    shipping_address TEXT    NOT NULL,
    payment_method   TEXT,
    payment_status   TEXT    DEFAULT 'pending',
    notes            TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    delivered_at     TEXT
  );

  /* ─── ORDER ITEMS TABLE ─── */
  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity   INTEGER NOT NULL CHECK(quantity > 0),
    price      REAL    NOT NULL,
    discount   REAL    DEFAULT 0
  );

  /* ─── WISHLIST TABLE ─── */
  CREATE TABLE IF NOT EXISTS wishlist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

  /* ─── REVIEWS TABLE ─── */
  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, user_id)
  );

  /* ─── COUPONS TABLE ─── */
  CREATE TABLE IF NOT EXISTS coupons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL UNIQUE,
    discount    REAL    NOT NULL,
    max_uses    INTEGER,
    used_count  INTEGER DEFAULT 0,
    expires_at  TEXT,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ─── ACTIVITY LOG TABLE ─── */
  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT    NOT NULL,
    details    TEXT,
    ip_address TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ─── INDEXES ─── */
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
  CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
  CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
\`);

/* ════════════════════════════════════════════════════════════
   HELPER FUNCTIONS
   ════════════════════════════════════════════════════════════ */

/**
 * Generate unique order number
 */
function generateOrderNumber() {
  const date = new Date();
  const timestamp = date.getTime().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return \`ORD-\${timestamp}-\${random}\`;
}

/**
 * Log activity
 */
function logActivity(userId, action, details, ipAddress = null) {
  try {
    db.prepare(\`
      INSERT INTO activity_log (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    \`).run(userId, action, details, ipAddress);
  } catch (err) {
    console.error('Activity logging error:', err.message);
  }
}

/**
 * Get database statistics
 */
function getDBStats() {
  const stats = {
    users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
    products: db.prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1').get().count,
    orders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
    carts: db.prepare('SELECT COUNT(*) as count FROM cart').get().count,
    reviews: db.prepare('SELECT COUNT(*) as count FROM reviews').get().count,
  };
  return stats;
}

module.exports = { db, generateOrderNumber, logActivity, getDBStats };
\`;

/**
 * ================================================================
 * SEED ADMIN USER (database/seed-admin.js)
 * ================================================================
 */

const seedAdminScript = \`
'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { db } = require('./db');

async function seedAdminUser() {
  try {
    console.log('🌱 Seeding database...');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@flashgrocer.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';

    // Check if admin exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND role = ?')
      .get(adminEmail, 'admin');

    if (existing) {
      console.log('✅ Admin user already exists');
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    // Insert admin
    db.prepare(\`
      INSERT INTO users (name, email, password_hash, role, is_active)
      VALUES (?, ?, ?, 'admin', 1)
    \`).run('Admin', adminEmail, passwordHash);

    console.log('✅ Admin user created');
    console.log('📧 Email:', adminEmail);
    console.log('🔐 Password:', adminPassword);

    // Seed sample products
    const sampleProducts = [
      {
        name: 'Fresh Milk 1L',
        category: 'grocery',
        price: 60,
        original_price: 75,
        stock: 100,
        img: '/images/milk.jpg',
        badge: 'Sale',
      },
      {
        name: 'Whole Wheat Bread',
        category: 'food',
        price: 40,
        original_price: 50,
        stock: 50,
        img: '/images/bread.jpg',
      },
      {
        name: 'Carrots (1kg)',
        category: 'grocery',
        price: 35,
        original_price: 45,
        stock: 200,
        img: '/images/carrots.jpg',
      },
      {
        name: 'Chicken Breast (500g)',
        category: 'food',
        price: 250,
        original_price: 300,
        stock: 30,
        img: '/images/chicken.jpg',
        badge: 'Fresh',
      },
      {
        name: 'Cooking Oil 1L',
        category: 'grocery',
        price: 120,
        original_price: 150,
        stock: 80,
        img: '/images/oil.jpg',
      },
    ];

    const existingProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;

    if (existingProducts === 0) {
      for (const product of sampleProducts) {
        db.prepare(\`
          INSERT INTO products 
          (name, category, price, original_price, stock, img, badge, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        \`).run(
          product.name,
          product.category,
          product.price,
          product.original_price,
          product.stock,
          product.img,
          product.badge || null
        );
      }
      console.log('✅ Sample products created');
    }

    console.log('\\n✨ Database seeding complete!');
  } catch (err) {
    console.error('❌ Seeding error:', err.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedAdminUser().then(() => process.exit(0));
}

module.exports = seedAdminUser;
\`;

/**
 * ================================================================
 * COMMON DATABASE QUERIES
 * ================================================================
 */

const commonQueries = {
  // Users
  getUserById: \`SELECT * FROM users WHERE id = ? AND is_active = 1\`,
  getUserByEmail: \`SELECT * FROM users WHERE email = ? AND is_active = 1\`,
  getAllUsers: \`SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC\`,

  // Products
  getAllActiveProducts: \`SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC\`,
  getProductsByCategory: \`SELECT * FROM products WHERE category = ? AND is_active = 1\`,
  getProductsBySearch: \`SELECT * FROM products WHERE (LOWER(name) LIKE ? OR LOWER(description) LIKE ?) AND is_active = 1\`,
  getProductStats: \`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN stock = 0 THEN 1 END) as out_of_stock,
      AVG(price) as avg_price,
      MAX(price) as max_price,
      MIN(price) as min_price
    FROM products WHERE is_active = 1
  \`,

  // Orders
  getUserOrders: \`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC\`,
  getPendingOrders: \`SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at ASC\`,
  getOrderDetails: \`
    SELECT o.*, 
      COUNT(oi.id) as item_count,
      SUM(oi.quantity) as total_items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.id = ?
    GROUP BY o.id
  \`,
  getOrderRevenue: \`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as orders,
      SUM(total_price) as revenue
    FROM orders
    WHERE status != 'cancelled'
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  \`,

  // Cart
  getUserCart: \`
    SELECT c.id, c.user_id, c.quantity, 
      p.id as product_id, p.name, p.price, p.img, p.stock
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ? AND p.is_active = 1
  \`,
  getCartTotal: \`
    SELECT SUM(c.quantity * p.price) as total
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ?
  \`,

  // Wishlist
  getUserWishlist: \`
    SELECT p.* FROM wishlist w
    JOIN products p ON w.product_id = p.id
    WHERE w.user_id = ? AND p.is_active = 1
  \`,

  // Reviews & Rating
  getProductReviews: \`
    SELECT r.*, u.name, u.avatar
    FROM reviews r
    JOIN users u ON r.user_id = u.id
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC
  \`,
  getProductAvgRating: \`
    SELECT AVG(rating) as avg_rating, COUNT(*) as count
    FROM reviews WHERE product_id = ?
  \`,

  // Analytics
  getDashboardStats: \`
    SELECT 
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM products WHERE is_active = 1) as total_products,
      (SELECT COUNT(*) FROM orders) as total_orders,
      (SELECT SUM(total_price) FROM orders WHERE status != 'cancelled') as total_revenue,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
      (SELECT COUNT(*) FROM cart) as active_carts
  \`,
};

/**
 * ================================================================
 * TRANSACTION EXAMPLES
 * ================================================================
 */

const transactionExamples = \`
// Process order with transaction
function processOrder(userId, cartItems, shippingAddress) {
  try {
    db.exec('BEGIN TRANSACTION');

    // Calculate total
    const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create order
    const orderResult = db.prepare(\\\`
      INSERT INTO orders (user_id, order_number, total_price, shipping_address, status)
      VALUES (?, ?, ?, ?, 'pending')
    \\\`).run(userId, generateOrderNumber(), totalPrice, shippingAddress);

    const orderId = orderResult.lastInsertRowid;

    // Add items & update stock
    for (const item of cartItems) {
      db.prepare(\\\`
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
      \\\`).run(orderId, item.product_id, item.quantity, item.price);

      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
        .run(item.quantity, item.product_id);
    }

    // Clear cart
    db.prepare('DELETE FROM cart WHERE user_id = ?').run(userId);

    // Log activity
    logActivity(userId, 'ORDER_CREATED', \\\`Order ID: \${orderId}\\\`);

    db.exec('COMMIT');
    return orderId;

  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
\`;

/**
 * ================================================================
 * MIGRATION GUIDE
 * ================================================================
 */

const migrationGuide = \`
# Database Migrations

## Adding a new column:
\\\`\\\`\\\`sql
ALTER TABLE products ADD COLUMN discount_percentage REAL DEFAULT 0;
\\\`\\\`\\\`

## Adding a new table:
\\\`\\\`\\\`sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
\\\`\\\`\\\`

## Backup database:
\\\`\\\`\\\`bash
cp database/flashgrocer.db database/flashgrocer.backup.db
\\\`\\\`\\\`

## Restore database:
\\\`\\\`\\\`bash
cp database/flashgrocer.backup.db database/flashgrocer.db
\\\`\\\`\\\`
\`;

module.exports = {
  completeDbSetup,
  seedAdminScript,
  commonQueries,
  transactionExamples,
  migrationGuide,
};
