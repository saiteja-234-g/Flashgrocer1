/* ================================================================
   FlashGrocer – middleware/auth.js
   JWT Authentication Middleware
   ================================================================ */

'use strict';

const jwt  = require('jsonwebtoken');
const db   = require('../database/db');

/**
 * Verifies the JWT from Authorization header or cookie.
 * Attaches req.user = { id, email, role, name } on success.
 */
function authenticate(req, res, next) {
  try {
    // 1. Try Authorization: Bearer <token>
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // 2. Fallback to httpOnly cookie
    if (!token && req.cookies && req.cookies.fg_token) {
      token = req.cookies.fg_token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }

    // 3. Verify
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Check user still exists & is active
    const user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

/**
 * Optional auth – attaches user if token is present but doesn't block unauthenticated requests.
 */
function optionalAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
    if (!token && req.cookies?.fg_token) token = req.cookies.fg_token;

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(decoded.id);
      if (user && user.is_active) req.user = user;
    }
  } catch (_) { /* ignore */ }
  next();
}

/**
 * Role-based authorization – call after authenticate()
 * Usage: authorize('admin') or authorize('admin', 'customer')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authenticate, optionalAuth, authorize };
