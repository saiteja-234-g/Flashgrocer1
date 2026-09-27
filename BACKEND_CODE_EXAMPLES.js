/* ================================================================
   FlashGrocer – COMPLETE BACKEND REFERENCE EXAMPLES
   Ready-to-use code snippets for all backend operations
   ================================================================ */

'use strict';

/**
 * ================================================================
 * SECTION 1: COMPLETE AUTHENTICATION ROUTE EXAMPLE
 * ================================================================
 */

const authRouteExample = `
// routes/auth.js - COMPLETE IMPLEMENTATION

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { handleValidation, sanitizeString } = require('../middleware/validate');

const router = express.Router();

/* ── Token Generation Helpers ──────────────────────────────── */
function generateTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
  
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(user.id, refreshHash, expiresAt);
  
  return { accessToken, refreshToken };
}

function setAuthCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('fg_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie('fg_refresh', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

/* ── REGISTER ─────────────────────────────────────────────── */
router.post('/register',
  [
    body('name').trim().notEmpty().isLength({ min: 2, max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .matches(/[A-Z]/)
      .matches(/[0-9]/),
    body('phone').optional().isMobilePhone('en-IN'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email, password, phone } = req.body;
      const cleanEmail = email.toLowerCase().trim();
      
      // Check duplicate
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
      if (existing) {
        return res.status(409).json({ 
          success: false, 
          message: 'Email already registered' 
        });
      }
      
      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);
      
      // Insert user
      const result = db.prepare(\`
        INSERT INTO users (name, email, password_hash, phone, role)
        VALUES (?, ?, ?, ?, 'customer')
      \`).run(sanitizeString(name), cleanEmail, passwordHash, phone || null);
      
      // Get user
      const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?')
        .get(result.lastInsertRowid);
      
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user);
      setAuthCookies(res, accessToken, refreshToken);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: { user, accessToken },
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── LOGIN ────────────────────────────────────────────────── */
router.post('/login',
  [
    body('email').isEmail(),
    body('password').notEmpty(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      
      // Find user
      const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
        .get(email.toLowerCase());
      
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }
      
      // Compare password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }
      
      // Update last login
      db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);
      
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user);
      setAuthCookies(res, accessToken, refreshToken);
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── GET CURRENT USER ─────────────────────────────────────── */
router.get('/me', authenticate, (req, res, next) => {
  try {
    const user = db.prepare('SELECT id, name, email, phone, address, role FROM users WHERE id = ?')
      .get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/* ── LOGOUT ───────────────────────────────────────────────── */
router.post('/logout', authenticate, (req, res, next) => {
  try {
    // Invalidate refresh token
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);
    
    res.clearCookie('fg_token');
    res.clearCookie('fg_refresh');
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
`;

/**
 * ================================================================
 * SECTION 2: COMPLETE PRODUCT CRUD OPERATIONS
 * ================================================================
 */

const productCrudExample = `
// routes/products.js - COMPLETE CRUD IMPLEMENTATION

const express = require('express');
const { body, query, param } = require('express-validator');
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();

/* ────────────────────────────────────────────────────────────
   CREATE: POST /api/products
   ──────────────────────────────────────────────────────────── */
router.post('/',
  authenticate,
  authorize('admin'),
  [
    body('name').trim().notEmpty().isLength({ min: 3, max: 200 }),
    body('category').isIn(['grocery', 'food', 'drinks', 'snacks', 'icecream']),
    body('price').isFloat({ min: 0 }),
    body('original_price').isFloat({ min: 0 }),
    body('stock').isInt({ min: 0, max: 10000 }),
    body('description').optional().isString(),
    body('img').optional().isURL(),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { name, category, price, original_price, stock, description, img } = req.body;
      
      const result = db.prepare(\`
        INSERT INTO products 
        (name, category, price, original_price, stock, description, img, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      \`).run(name, category, price, original_price, stock, description, img);
      
      const product = db.prepare('SELECT * FROM products WHERE id = ?')
        .get(result.lastInsertRowid);
      
      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────
   READ: GET /api/products
   With filtering, search, sorting, pagination
   ──────────────────────────────────────────────────────────── */
router.get('/',
  [
    query('category').optional().isIn(['all', 'grocery', 'food', 'drinks', 'snacks', 'icecream']),
    query('sort').optional().isIn(['default', 'price-asc', 'price-desc', 'rating', 'newest']),
    query('q').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { category, sort, q, limit = 20, offset = 0 } = req.query;
      
      // Build WHERE clause
      let whereClauses = ['is_active = 1'];
      const params = [];
      
      if (category && category !== 'all') {
        whereClauses.push('category = ?');
        params.push(category);
      }
      
      if (q) {
        whereClauses.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)');
        params.push(\`%\${q.toLowerCase()}%\`, \`%\${q.toLowerCase()}%\`);
      }
      
      const whereClause = whereClauses.join(' AND ');
      
      // Build ORDER BY
      let orderBy = 'id DESC';
      if (sort === 'price-asc') orderBy = 'price ASC';
      else if (sort === 'price-desc') orderBy = 'price DESC';
      else if (sort === 'rating') orderBy = 'rating DESC';
      else if (sort === 'newest') orderBy = 'created_at DESC';
      
      // Get total count
      const countSql = \`SELECT COUNT(*) as total FROM products WHERE \${whereClause}\`;
      const { total } = db.prepare(countSql).get(...params);
      
      // Get paginated results
      const sql = \`
        SELECT * FROM products 
        WHERE \${whereClause}
        ORDER BY \${orderBy}
        LIMIT ? OFFSET ?
      \`;
      const products = db.prepare(sql).all(...params, limit, offset);
      
      res.status(200).json({
        success: true,
        data: products,
        pagination: { limit, offset, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────
   READ: GET /api/products/:id
   ──────────────────────────────────────────────────────────── */
router.get('/:id',
  param('id').isInt().toInt(),
  handleValidation,
  (req, res, next) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1')
        .get(req.params.id);
      
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Product not found' 
        });
      }
      
      res.status(200).json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────
   UPDATE: PUT /api/products/:id
   Only admin can update
   ──────────────────────────────────────────────────────────── */
router.put('/:id',
  authenticate,
  authorize('admin'),
  param('id').isInt().toInt(),
  [
    body('name').optional().trim().isLength({ min: 3 }),
    body('category').optional().isIn(['grocery', 'food', 'drinks', 'snacks', 'icecream']),
    body('price').optional().isFloat({ min: 0 }),
    body('stock').optional().isInt({ min: 0 }),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      // Verify product exists
      const existing = db.prepare('SELECT id FROM products WHERE id = ?')
        .get(req.params.id);
      
      if (!existing) {
        return res.status(404).json({ 
          success: false, 
          message: 'Product not found' 
        });
      }
      
      const { name, category, price, stock, description } = req.body;
      const updates = [];
      const values = [];
      
      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (category !== undefined) { updates.push('category = ?'); values.push(category); }
      if (price !== undefined) { updates.push('price = ?'); values.push(price); }
      if (stock !== undefined) { updates.push('stock = ?'); values.push(stock); }
      if (description !== undefined) { updates.push('description = ?'); values.push(description); }
      
      if (updates.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No fields to update' 
        });
      }
      
      updates.push('updated_at = datetime("now")');
      values.push(req.params.id);
      
      const sql = \`UPDATE products SET \${updates.join(', ')} WHERE id = ?\`;
      db.prepare(sql).run(...values);
      
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      
      res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: product,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────
   DELETE: DELETE /api/products/:id
   Soft delete (set is_active = 0)
   ──────────────────────────────────────────────────────────── */
router.delete('/:id',
  authenticate,
  authorize('admin'),
  param('id').isInt().toInt(),
  handleValidation,
  (req, res, next) => {
    try {
      const product = db.prepare('SELECT id FROM products WHERE id = ?')
        .get(req.params.id);
      
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Product not found' 
        });
      }
      
      // Soft delete
      db.prepare('UPDATE products SET is_active = 0, updated_at = datetime("now") WHERE id = ?')
        .run(req.params.id);
      
      res.status(200).json({
        success: true,
        message: 'Product deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
`;

/**
 * ================================================================
 * SECTION 3: CART OPERATIONS
 * ================================================================
 */

const cartOperationsExample = `
// routes/cart.js - SHOPPING CART CRUD

const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();

/* ── GET CART (all items for user) ────────────────────────── */
router.get('/', authenticate, (req, res, next) => {
  try {
    const cartItems = db.prepare(\`
      SELECT c.id, c.quantity, p.id as product_id, p.name, p.price, p.img, p.stock
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ? AND p.is_active = 1
    \`).all(req.user.id);
    
    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    res.json({
      success: true,
      data: cartItems,
      total,
      itemCount: cartItems.length,
    });
  } catch (err) {
    next(err);
  }
});

/* ── ADD TO CART ──────────────────────────────────────────── */
router.post('/',
  authenticate,
  [
    body('product_id').isInt(),
    body('quantity').isInt({ min: 1, max: 100 }),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { product_id, quantity } = req.body;
      
      // Check product exists and has stock
      const product = db.prepare('SELECT id, stock FROM products WHERE id = ? AND is_active = 1')
        .get(product_id);
      
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Product not found' 
        });
      }
      
      if (product.stock < quantity) {
        return res.status(400).json({ 
          success: false, 
          message: \`Only \${product.stock} items available\` 
        });
      }
      
      // Check if already in cart
      const existing = db.prepare(
        'SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?'
      ).get(req.user.id, product_id);
      
      if (existing) {
        // Update quantity
        const newQty = existing.quantity + quantity;
        if (newQty > product.stock) {
          return res.status(400).json({ 
            success: false, 
            message: \`Cannot add \${quantity}. Only \${product.stock - existing.quantity} available\` 
          });
        }
        
        db.prepare('UPDATE cart SET quantity = ? WHERE id = ?').run(newQty, existing.id);
        
        return res.status(200).json({
          success: true,
          message: 'Product quantity updated in cart',
        });
      }
      
      // Add new item
      db.prepare(
        'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)'
      ).run(req.user.id, product_id, quantity);
      
      res.status(201).json({
        success: true,
        message: 'Product added to cart',
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── UPDATE CART ITEM ────────────────────────────────────── */
router.put('/:id',
  authenticate,
  param('id').isInt(),
  body('quantity').isInt({ min: 1, max: 100 }),
  handleValidation,
  (req, res, next) => {
    try {
      const { quantity } = req.body;
      
      // Check ownership
      const cartItem = db.prepare('SELECT user_id, product_id FROM cart WHERE id = ?')
        .get(req.params.id);
      
      if (!cartItem || cartItem.user_id !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Not authorized' 
        });
      }
      
      // Check stock
      const { stock } = db.prepare('SELECT stock FROM products WHERE id = ?')
        .get(cartItem.product_id);
      
      if (quantity > stock) {
        return res.status(400).json({ 
          success: false, 
          message: \`Only \${stock} items available\` 
        });
      }
      
      db.prepare('UPDATE cart SET quantity = ? WHERE id = ?').run(quantity, req.params.id);
      
      res.json({ 
        success: true, 
        message: 'Cart updated' 
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── REMOVE FROM CART ────────────────────────────────────── */
router.delete('/:id',
  authenticate,
  param('id').isInt(),
  handleValidation,
  (req, res, next) => {
    try {
      // Check ownership
      const cartItem = db.prepare('SELECT user_id FROM cart WHERE id = ?')
        .get(req.params.id);
      
      if (!cartItem || cartItem.user_id !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Not authorized' 
        });
      }
      
      db.prepare('DELETE FROM cart WHERE id = ?').run(req.params.id);
      
      res.json({ 
        success: true, 
        message: 'Item removed from cart' 
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
`;

/**
 * ================================================================
 * SECTION 4: ORDER MANAGEMENT
 * ================================================================
 */

const orderManagementExample = `
// routes/orders.js - ORDER CRUD & MANAGEMENT

const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();

/* ── CREATE ORDER (from cart) ────────────────────────────── */
router.post('/',
  authenticate,
  [
    body('shipping_address').trim().notEmpty().isLength({ min: 10 }),
    body('payment_method').isIn(['cod', 'upi', 'card']),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { shipping_address, payment_method } = req.body;
      
      // Get cart items
      const cartItems = db.prepare(\`
        SELECT c.product_id, c.quantity, p.price, p.stock
        FROM cart c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ? AND p.is_active = 1
      \`).all(req.user.id);
      
      if (cartItems.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cart is empty' 
        });
      }
      
      // Verify stock for all items
      for (const item of cartItems) {
        if (item.quantity > item.stock) {
          return res.status(400).json({ 
            success: false, 
            message: \`Insufficient stock for product ID \${item.product_id}\` 
          });
        }
      }
      
      // Calculate total
      const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      // Create order (transaction)
      try {
        db.exec('BEGIN TRANSACTION');
        
        // Insert order
        const orderResult = db.prepare(\`
          INSERT INTO orders (user_id, total_price, status, shipping_address, payment_method)
          VALUES (?, ?, 'pending', ?, ?)
        \`).run(req.user.id, totalPrice, shipping_address, payment_method);
        
        const orderId = orderResult.lastInsertRowid;
        
        // Insert order items & update stock
        for (const item of cartItems) {
          db.prepare(\`
            INSERT INTO order_items (order_id, product_id, quantity, price)
            VALUES (?, ?, ?, ?)
          \`).run(orderId, item.product_id, item.quantity, item.price);
          
          db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
            .run(item.quantity, item.product_id);
        }
        
        // Clear cart
        db.prepare('DELETE FROM cart WHERE user_id = ?').run(req.user.id);
        
        db.exec('COMMIT');
        
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        
        res.status(201).json({
          success: true,
          message: 'Order created successfully',
          data: order,
        });
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

/* ── GET USER ORDERS ─────────────────────────────────────── */
router.get('/', authenticate, (req, res, next) => {
  try {
    const orders = db.prepare(\`
      SELECT * FROM orders 
      WHERE user_id = ?
      ORDER BY created_at DESC
    \`).all(req.user.id);
    
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
});

/* ── GET ORDER DETAILS ───────────────────────────────────── */
router.get('/:id',
  authenticate,
  param('id').isInt(),
  handleValidation,
  (req, res, next) => {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
        .get(req.params.id, req.user.id);
      
      if (!order) {
        return res.status(404).json({ 
          success: false, 
          message: 'Order not found' 
        });
      }
      
      const items = db.prepare(\`
        SELECT oi.*, p.name, p.img
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      \`).all(req.params.id);
      
      res.json({ 
        success: true, 
        data: { ...order, items } 
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── UPDATE ORDER STATUS (Admin only) ────────────────────── */
router.put('/:id/status',
  authenticate,
  authorize('admin'),
  param('id').isInt(),
  body('status').isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']),
  handleValidation,
  (req, res, next) => {
    try {
      const { status } = req.body;
      
      db.prepare('UPDATE orders SET status = ?, updated_at = datetime("now") WHERE id = ?')
        .run(status, req.params.id);
      
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      
      res.json({
        success: true,
        message: 'Order status updated',
        data: order,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
`;

/**
 * ================================================================
 * SECTION 5: ERROR HANDLING PATTERNS
 * ================================================================
 */

const errorHandlingPatterns = `
// middleware/errorHandler.js - COMPREHENSIVE ERROR HANDLING

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
function errorHandler(err, req, res, next) {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Specific error types
  if (err.name === 'ValidationError') {
    err.statusCode = 400;
  }

  if (err.name === 'JsonWebTokenError') {
    err.statusCode = 401;
    err.message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    err.statusCode = 401;
    err.message = 'Token expired';
  }

  // SQLite errors
  if (err.code === 'SQLITE_CANTOPEN') {
    err.statusCode = 500;
    err.message = 'Database connection failed';
  }

  // Log error
  if (process.env.NODE_ENV === 'development') {
    console.error('\\n[ERROR]');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Method:', req.method);
    console.error('Path:', req.path);
    console.error('Status:', err.statusCode);
    console.error('Message:', err.message);
    if (err.stack) console.error('Stack:', err.stack);
  }

  // Send response
  res.status(err.statusCode).json({
    success: false,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && {
      error: err.message,
      stack: err.stack,
    }),
  });
}

/**
 * 404 handler
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: \`Route \${req.method} \${req.url} not found\`,
  });
}

/**
 * Async error wrapper
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Try-catch wrapper for routes
 */
function tryCatch(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { errorHandler, notFound, AppError, asyncHandler, tryCatch };
`;

/**
 * ================================================================
 * SECTION 6: CLIENT-SIDE API CALLS (JavaScript)
 * ================================================================
 */

const clientSideApiExample = `
// JavaScript - API client code (Frontend)

const API_URL = 'http://localhost:3000/api';

class APIClient {
  static async request(endpoint, options = {}) {
    const url = \`\${API_URL}\${endpoint}\`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies
      ...options,
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'API error');
    }

    return data;
  }

  // AUTH
  static async register(userData) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  static async login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  static async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  static async getCurrentUser() {
    return this.request('/auth/me');
  }

  // PRODUCTS
  static async getProducts(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(\`/products?\${params}\`);
  }

  static async getProduct(id) {
    return this.request(\`/products/\${id}\`);
  }

  static async createProduct(productData) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    });
  }

  static async updateProduct(id, productData) {
    return this.request(\`/products/\${id}\`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    });
  }

  static async deleteProduct(id) {
    return this.request(\`/products/\${id}\`, { method: 'DELETE' });
  }

  // CART
  static async getCart() {
    return this.request('/cart');
  }

  static async addToCart(productId, quantity) {
    return this.request('/cart', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity }),
    });
  }

  static async updateCartItem(cartId, quantity) {
    return this.request(\`/cart/\${cartId}\`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
  }

  static async removeFromCart(cartId) {
    return this.request(\`/cart/\${cartId}\`, { method: 'DELETE' });
  }

  // ORDERS
  static async createOrder(shippingAddress, paymentMethod) {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ shipping_address: shippingAddress, payment_method: paymentMethod }),
    });
  }

  static async getOrders() {
    return this.request('/orders');
  }

  static async getOrder(id) {
    return this.request(\`/orders/\${id}\`);
  }
}

// Usage examples
async function exampleUsage() {
  try {
    // Login
    const loginRes = await APIClient.login('user@example.com', 'Password@123');
    console.log('Logged in:', loginRes.data.user);

    // Get products
    const productsRes = await APIClient.getProducts({ category: 'grocery', limit: 10 });
    console.log('Products:', productsRes.data);

    // Add to cart
    await APIClient.addToCart(1, 2);

    // Get cart
    const cartRes = await APIClient.getCart();
    console.log('Cart total:', cartRes.total);

    // Create order
    const orderRes = await APIClient.createOrder('123 Main St', 'cod');
    console.log('Order created:', orderRes.data);

  } catch (err) {
    console.error('Error:', err.message);
  }
}
`;

/**
 * ================================================================
 * SECTION 7: CURL EXAMPLES (Testing API)
 * ================================================================
 */

const curlExamples = \`
# AUTHENTICATION ENDPOINTS

# Register
curl -X POST http://localhost:3000/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "Password@123"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "admin@flashgrocer.com",
    "password": "Admin@12345"
  }'

# Get current user (requires token)
curl -X GET http://localhost:3000/api/auth/me \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# PRODUCT ENDPOINTS

# Get all products
curl http://localhost:3000/api/products

# Get products with filters
curl "http://localhost:3000/api/products?category=grocery&sort=price-asc&limit=10"

# Get single product
curl http://localhost:3000/api/products/1

# Create product (admin)
curl -X POST http://localhost:3000/api/products \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -d '{
    "name": "Fresh Milk",
    "category": "grocery",
    "price": 60,
    "original_price": 70,
    "stock": 100
  }'

# Update product (admin)
curl -X PUT http://localhost:3000/api/products/1 \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -d '{ "price": 55, "stock": 150 }'

# Delete product (admin)
curl -X DELETE http://localhost:3000/api/products/1 \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# CART ENDPOINTS

# Get cart
curl http://localhost:3000/api/cart \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Add to cart
curl -X POST http://localhost:3000/api/cart \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -d '{ "product_id": 1, "quantity": 2 }'

# ORDER ENDPOINTS

# Create order
curl -X POST http://localhost:3000/api/orders \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -d '{
    "shipping_address": "123 Main St, City, Pin",
    "payment_method": "cod"
  }'

# Get orders
curl http://localhost:3000/api/orders \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
\`;

module.exports = {
  authRouteExample,
  productCrudExample,
  cartOperationsExample,
  orderManagementExample,
  errorHandlingPatterns,
  clientSideApiExample,
  curlExamples,
};
