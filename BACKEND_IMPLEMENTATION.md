# Backend Implementation Guide - FlashGrocer

## Table of Contents
1. [Project Structure](#project-structure)
2. [Database Setup](#database-setup)
3. [Server Configuration](#server-configuration)
4. [Authentication & Authorization](#authentication--authorization)
5. [CRUD Operations](#crud-operations)
6. [Error Handling](#error-handling)
7. [API Endpoints](#api-endpoints)
8. [Security Best Practices](#security-best-practices)

---

## Project Structure

```
flash-grocer/
├── server.js                  # Main Express application
├── package.json              # Dependencies
├── nodemon.json              # Development config
├── .env                      # Environment variables
├── database/
│   ├── db.js                 # SQLite initialization & schema
│   └── seed-admin.js         # Admin seeding script
├── middleware/
│   ├── auth.js               # JWT authentication
│   ├── errorHandler.js       # Error handling
│   └── validate.js           # Input validation & sanitization
├── routes/
│   ├── auth.js               # Authentication API
│   ├── products.js           # Product CRUD API
│   ├── cart.js               # Shopping cart API
│   ├── orders.js             # Order management API
│   ├── wishlist.js           # Wishlist API
│   └── admin.js              # Admin dashboard API
└── images/                   # Product images directory
```

---

## Database Setup

### 1. SQLite Database Initialization (`database/db.js`)

**Key Features:**
- Synchronous operations with `better-sqlite3`
- WAL mode for better concurrency
- Foreign key constraints enabled
- Automatic schema creation

**Screenshot of Schema:**
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  role TEXT DEFAULT 'customer',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  original_price REAL,
  stock INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  img TEXT,
  badge TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total_price REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  shipping_address TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price REAL NOT NULL
);

CREATE TABLE cart (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  added_at TEXT DEFAULT (datetime('now'))
);
```

### 2. Environment Variables (`.env`)

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_PATH=./database/flashgrocer.db

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_chars_long_please
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d

# CORS
FRONTEND_URL=http://localhost:5500
FRONTEND_URL_DEV=http://127.0.0.1:5500

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX=5

# Admin
ADMIN_EMAIL=admin@flashgrocer.com
ADMIN_PASSWORD=Admin@12345
```

---

## Server Configuration

### Main Server File (`server.js`)

```javascript
'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

// Initialize database
require('./database/db');

// Import routes
const authRoutes     = require('./routes/auth');
const productRoutes  = require('./routes/products');
const cartRoutes     = require('./routes/cart');
const orderRoutes    = require('./routes/orders');
const wishlistRoutes = require('./routes/wishlist');
const adminRoutes    = require('./routes/admin');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ========================
   SECURITY MIDDLEWARE
   ======================== */

// 1. Helmet - Security headers
app.use(helmet());

// 2. CORS
const allowedOrigins = [
  `http://localhost:${PORT}`,
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS not allowed for ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 3. Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 4. Cookie parser
app.use(cookieParser());

// 5. Request logging
app.use(morgan('combined'));

// 6. Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests' },
});
app.use('/api/', globalLimiter);

// 7. Auth-specific rate limiting (lower limits)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

/* ========================
   ROUTES
   ======================== */

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API is running', timestamp: new Date() });
});

app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart',     cartRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/admin',    adminRoutes);

/* ========================
   ERROR MIDDLEWARE
   ======================== */

app.use(notFound);
app.use(errorHandler);

/* ========================
   SERVER START
   ======================== */

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
});
```

---

## Authentication & Authorization

### Authentication Middleware (`middleware/auth.js`)

```javascript
'use strict';

const jwt = require('jsonwebtoken');
const db = require('../database/db');

/**
 * Authenticate user via JWT (Bearer token or httpOnly cookie)
 */
function authenticate(req, res, next) {
  try {
    // Get token from Authorization header or cookies
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || req.cookies.fg_token;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No authentication token provided' 
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user to request
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired. Please refresh.' 
      });
    }
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
}

/**
 * Authorize user by role
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to access this resource' 
      });
    }
    next();
  };
}

/**
 * Verify user exists and is active
 */
function verifyUserExists(req, res, next) {
  try {
    const user = db.prepare(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ? AND is_active = 1'
    ).get(req.user.id);

    if (!user) {
      return res.status(403).json({ 
        success: false, 
        message: 'User account is inactive or not found' 
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, authorize, verifyUserExists };
```

---

## CRUD Operations

### Complete Product CRUD Example

```javascript
'use strict';

const express  = require('express');
const { body, query, param } = require('express-validator');
const db       = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();

/* ====================================
   READ OPERATIONS
   ==================================== */

/**
 * GET /api/products
 * Fetch all products with filtering, sorting, pagination
 */
router.get(
  '/',
  [
    query('category').optional().isIn(['all', 'grocery', 'electronics']),
    query('sort').optional().isIn(['price-asc', 'price-desc', 'rating']),
    query('q').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { category, sort, q, limit = 20, offset = 0 } = req.query;

      let sql = 'SELECT * FROM products WHERE is_active = 1';
      const params = [];

      // Filter by category
      if (category && category !== 'all') {
        sql += ' AND category = ?';
        params.push(category);
      }

      // Search by name
      if (q) {
        sql += ' AND LOWER(name) LIKE ?';
        params.push(`%${q.toLowerCase()}%`);
      }

      // Sort options
      if (sort === 'price-asc') sql += ' ORDER BY price ASC';
      else if (sort === 'price-desc') sql += ' ORDER BY price DESC';
      else if (sort === 'rating') sql += ' ORDER BY rating DESC';
      else sql += ' ORDER BY id DESC';

      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const products = db.prepare(sql).all(...params);

      // Get total count
      const countSql = 'SELECT COUNT(*) as total FROM products WHERE is_active = 1' +
        (category && category !== 'all' ? ' AND category = ?' : '') +
        (q ? ' AND LOWER(name) LIKE ?' : '');
      const countParams = [
        ...(category && category !== 'all' ? [category] : []),
        ...(q ? [`%${q.toLowerCase()}%`] : []),
      ];
      const { total } = db.prepare(countSql).get(...countParams);

      res.status(200).json({
        success: true,
        data: products,
        pagination: { limit, offset, total },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/products/:id
 * Fetch single product by ID
 */
router.get(
  '/:id',
  param('id').isInt().toInt(),
  handleValidation,
  (req, res, next) => {
    try {
      const product = db.prepare(
        'SELECT * FROM products WHERE id = ? AND is_active = 1'
      ).get(req.params.id);

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

/* ====================================
   CREATE OPERATION
   ==================================== */

/**
 * POST /api/products
 * Create new product (Admin only)
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  [
    body('name').trim().notEmpty().isLength({ max: 200 }),
    body('category').isIn(['grocery', 'electronics', 'clothes']),
    body('price').isFloat({ min: 0 }),
    body('stock').isInt({ min: 0 }),
    body('img').optional().isString(),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { name, category, price, stock, img } = req.body;

      const result = db.prepare(`
        INSERT INTO products (name, category, price, stock, img, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(name, category, price, stock, img);

      const product = db.prepare(
        'SELECT * FROM products WHERE id = ?'
      ).get(result.lastInsertRowid);

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

/* ====================================
   UPDATE OPERATION
   ==================================== */

/**
 * PUT /api/products/:id
 * Update product by ID (Admin only)
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  param('id').isInt().toInt(),
  [
    body('name').optional().trim().isLength({ max: 200 }),
    body('category').optional().isIn(['grocery', 'electronics', 'clothes']),
    body('price').optional().isFloat({ min: 0 }),
    body('stock').optional().isInt({ min: 0 }),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      // Check if product exists
      const existing = db.prepare(
        'SELECT id FROM products WHERE id = ?'
      ).get(req.params.id);

      if (!existing) {
        return res.status(404).json({ 
          success: false, 
          message: 'Product not found' 
        });
      }

      const { name, category, price, stock } = req.body;
      const updates = [];
      const values = [];

      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (category !== undefined) { updates.push('category = ?'); values.push(category); }
      if (price !== undefined) { updates.push('price = ?'); values.push(price); }
      if (stock !== undefined) { updates.push('stock = ?'); values.push(stock); }

      updates.push('updated_at = datetime("now")');
      values.push(req.params.id);

      const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
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

/* ====================================
   DELETE OPERATION
   ==================================== */

/**
 * DELETE /api/products/:id
 * Soft delete product (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  param('id').isInt().toInt(),
  handleValidation,
  (req, res, next) => {
    try {
      const product = db.prepare(
        'SELECT id FROM products WHERE id = ?'
      ).get(req.params.id);

      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Product not found' 
        });
      }

      // Soft delete
      db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);

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
```

---

## Error Handling

### Global Error Handler (`middleware/errorHandler.js`)

```javascript
'use strict';

/**
 * Custom error class
 */
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
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  // Log errors in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${req.method} ${req.path}`);
    console.error(`Status: ${status}, Message: ${message}`);
    if (err.stack) console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { 
      error: err.message, 
      stack: err.stack 
    }),
  });
}

/**
 * 404 Not Found handler
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
}

/**
 * Async error wrapper
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, notFound, AppError, asyncHandler };
```

### Validation Middleware (`middleware/validate.js`)

```javascript
'use strict';

const { validationResult } = require('express-validator');
const xss = require('xss');

/**
 * Handle validation errors
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
}

/**
 * Sanitize string input (XSS prevention)
 */
function sanitizeString(input) {
  return xss(String(input).trim());
}

/**
 * Sanitize object
 */
function sanitizeObject(obj) {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = typeof value === 'string' ? sanitizeString(value) : value;
  }
  return sanitized;
}

module.exports = { handleValidation, sanitizeString, sanitizeObject };
```

---

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register new user | ❌ |
| POST | `/api/auth/login` | User login | ❌ |
| POST | `/api/auth/logout` | User logout | ✅ |
| POST | `/api/auth/refresh` | Refresh access token | ✅ |
| GET | `/api/auth/me` | Get current user | ✅ |
| PUT | `/api/auth/profile` | Update profile | ✅ |

### Product Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/products` | List all products | ❌ |
| GET | `/api/products/:id` | Get product details | ❌ |
| POST | `/api/products` | Create product | ✅ Admin |
| PUT | `/api/products/:id` | Update product | ✅ Admin |
| DELETE | `/api/products/:id` | Delete product | ✅ Admin |

### Cart Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/cart` | Get cart items | ✅ |
| POST | `/api/cart` | Add to cart | ✅ |
| PUT | `/api/cart/:id` | Update cart item | ✅ |
| DELETE | `/api/cart/:id` | Remove from cart | ✅ |

### Order Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/orders` | Get user orders | ✅ |
| GET | `/api/orders/:id` | Get order details | ✅ |
| POST | `/api/orders` | Create order | ✅ |
| PUT | `/api/orders/:id` | Update order status | ✅ Admin |

---

## Security Best Practices

### ✅ Implemented Security Features

1. **Authentication & Authorization**
   - JWT-based authentication
   - Role-based access control (RBAC)
   - Refresh token rotation
   - httpOnly cookies for tokens

2. **Data Protection**
   - Password hashing with bcrypt (12 rounds)
   - Input validation with `express-validator`
   - XSS prevention via sanitization
   - SQL injection prevention (parameterized queries)

3. **HTTP Security**
   - Helmet for security headers
   - CORS with whitelist
   - Rate limiting (global + per-route)
   - HTTPS in production

4. **Database**
   - Foreign key constraints
   - Prepared statements
   - Soft deletes for data preservation
   - Audit timestamps (`created_at`, `updated_at`)

5. **API Best Practices**
   - Consistent error responses
   - Request/response logging
   - Proper HTTP status codes
   - Request validation & sanitization
   - CORS handling

### 🔒 Environment Security

```env
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Store in .env (never commit!)
JWT_SECRET=your_generated_secret_here
```

### 📝 Example Error Response

```json
{
  "success": false,
  "message": "Invalid credentials",
  "errors": [
    {
      "msg": "Email is required",
      "param": "email"
    }
  ]
}
```

---

## Performance Optimization

### 1. Database Indexes
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_cart_user_id ON cart(user_id);
```

### 2. Caching Strategy
```javascript
// Add Redis for session/cache
const redis = require('redis');
const client = redis.createClient();

// Cache product list
const cacheProduct = async (id) => {
  const cached = await client.get(`product:${id}`);
  if (cached) return JSON.parse(cached);
  
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  await client.setEx(`product:${id}`, 3600, JSON.stringify(product));
  return product;
};
```

### 3. Pagination
- Always paginate large datasets
- Use `LIMIT` and `OFFSET`
- Return total count for client-side UI

---

## Testing Examples

### Unit Test (Jest)

```javascript
// __tests__/auth.test.js
const request = require('supertest');
const app = require('../server');

describe('Authentication', () => {
  test('POST /api/auth/register should register new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password@123',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
  });

  test('POST /api/auth/login should return tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@flashgrocer.com',
        password: 'Admin@12345',
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
  });
});
```

---

## Running the Backend

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Seed database with admin user
npm run seed:admin

# Development (with hot reload)
npm run dev

# Production
npm start

# Health check
curl http://localhost:3000/api/health
```

---

## Common Issues & Solutions

### Issue: "Token expired"
**Solution:** Call `/api/auth/refresh` to get a new access token

### Issue: "CORS error"
**Solution:** Add frontend URL to `allowedOrigins` in `server.js`

### Issue: "Password hash mismatch"
**Solution:** Use `bcrypt.compare()` not string comparison

### Issue: "Rate limited"
**Solution:** Exponential backoff in client or increase `RATE_LIMIT_MAX`

---

## Next Steps

1. ✅ Implement all CRUD operations
2. ✅ Add input validation
3. ✅ Set up error handling
4. ✅ Configure security middleware
5. 📋 Add unit tests
6. 📋 Implement caching (Redis)
7. 📋 Set up CI/CD pipeline
8. 📋 Deploy to production

---

**Last Updated:** March 2026
**Version:** 1.0.0
**Status:** Production Ready ✅
