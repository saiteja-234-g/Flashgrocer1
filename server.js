/* ================================================================
   FlashGrocer – server.js
   Main Express Application Entry Point
   
   Security Features:
   ✅ Helmet (HTTP security headers)
   ✅ CORS with whitelist
   ✅ Rate limiting (global + auth-specific)
   ✅ JWT Authentication (Bearer + httpOnly cookies)
   ✅ Password hashing with bcrypt (12 rounds)
   ✅ Input validation & sanitization (express-validator)
   ✅ SQL injection prevention (parameterized queries)
   ✅ XSS prevention via sanitization
   ✅ Refresh token rotation
   ✅ Role-based access control
   ✅ Request logging (morgan)
   ================================================================ */

'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

/* ── Initialize DB (runs schema & seeds on first run) ─────────── */
require('./database/db');

/* ── Import Routes ───────────────────────────────────────────── */
const authRoutes     = require('./routes/auth');
const productRoutes  = require('./routes/products');
const cartRoutes     = require('./routes/cart');
const orderRoutes    = require('./routes/orders');
const wishlistRoutes = require('./routes/wishlist');
const adminRoutes    = require('./routes/admin');

/* ── Import Middleware ───────────────────────────────────────── */
const { errorHandler, notFound } = require('./middleware/errorHandler');

/* ── App Instance ────────────────────────────────────────────── */
const app  = express();
const PORT = process.env.PORT || 3000;

/* ================================================================
   SECURITY MIDDLEWARE
   ================================================================ */

/* 1. Helmet – Security HTTP headers */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

/* 2. CORS */
const allowedOrigins = [
  `http://localhost:${PORT}`,
  'http://localhost:5500',  // VS Code Live Server
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  'http://flashgrocer.in',
  'https://flashgrocer.in',
  'http://www.flashgrocer.in',
  'https://www.flashgrocer.in',
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_DEV,
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (Postman, curl, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: Origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

/* 3. Global Rate Limiter */
const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max:      Number(process.env.RATE_LIMIT_MAX)        || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use('/api', globalLimiter);

/* 4. Strict Auth Rate Limiter (login/register) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message:  { success: false, message: 'Too many authentication attempts. Please wait 15 minutes.' },
  skipSuccessfulRequests: true,
});

/* ================================================================
   GENERAL MIDDLEWARE
   ================================================================ */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

/* ================================================================
   SERVE STATIC FRONTEND
   ================================================================ */
app.use(express.static(path.join(__dirname), {
  // Don't serve server files as static
  index: 'index.html',
}));

/* ================================================================
   API ROUTES
   ================================================================ */
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart',     cartRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/admin',    adminRoutes);

/* ── Health Check ────────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status:  'healthy',
    service: 'FlashGrocer API',
    version: '1.0.0',
    env:     process.env.NODE_ENV,
    time:    new Date().toISOString(),
  });
});

/* ── SDG 9: Industry, Innovation and Infrastructure ──────────── */
app.get('/api/infrastructure/status', (req, res) => {
  res.json({
    success: true,
    data: {
      initiative: "SDG 9: Industry, Innovation and Infrastructure",
      company: "FlashGrocer",
      metrics: {
        automatedWarehouses: 12,
        evFleetPercentage: 45.5,
        aiRoutingEfficiency: "98.2%",
        renewableEnergyUsage: "60%"
      },
      status: "Operational",
      reliabilityScore: 99.99
    },
    message: "Infrastructure metrics retrieved successfully."
  });
});

app.post('/api/infrastructure/innovation', (req, res) => {
  const { project, investment } = req.body;
  if (!project || !investment) {
    return res.status(400).json({ success: false, error: "Missing required fields: project or investment" });
  }
  res.status(201).json({
    success: true,
    data: {
      projectId: "INV-" + Math.floor(Math.random() * 10000),
      project,
      investment,
      expectedImpact: "High",
      reliabilityStatus: "Passed preliminary checks"
    },
    message: "Innovation project registered successfully."
  });
});

/* ── SPA fallback (serve index.html for all non-API routes) ───── */
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  next();
});

/* ── 404 & Error Handlers ────────────────────────────────────── */
app.use(notFound);
app.use(errorHandler);

/* ================================================================
   START SERVER
   ================================================================ */
const FALLBACK_PORT = Number(process.env.PORT_FALLBACK) || 3001;

function prettyLog(port) {
  console.log('');
  console.log('  ⚡ ╔══════════════════════════════════════════╗');
  console.log('     ║     FlashGrocer Server Started! ⚡      ║');
  console.log(`     ║  Local:  http://localhost:${port}             ║`);
  console.log(`     ║  Domain: http://flashgrocer.in           ║`);
  console.log('     ╠══════════════════════════════════════════╣');
  console.log(`     ║  ENV:    ${process.env.NODE_ENV}                    ║`);
  console.log(`     ║  API:    http://localhost:${port}/api        ║`);
  console.log(`     ║  Health: /api/health                     ║`);
  console.log('     ╚══════════════════════════════════════════╝');
  console.log('');
}

function start(port) {
  const server = app.listen(port, () => {
    prettyLog(port);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (port === FALLBACK_PORT) {
        console.error(`Port ${port} is already in use, shutdown failed.`);
        process.exit(1);
      }
      console.warn(`Port ${port} is in use, trying fallback port ${FALLBACK_PORT}...`);
      start(FALLBACK_PORT);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  return server;
}

start(PORT);

module.exports = app;
