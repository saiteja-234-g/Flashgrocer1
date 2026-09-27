/* ================================================================
   FlashGrocer – routes/admin.js
   Admin Dashboard Routes
   GET /api/admin/stats      – platform statistics
   GET /api/admin/users      – all users
   PUT /api/admin/users/:id  – toggle user active/role
   ================================================================ */

'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, param } = require('express-validator');
const db      = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation }        = require('../middleware/validate');

const router = express.Router();
router.use(authenticate, authorize('admin'));

/* ── PLATFORM STATS ──────────────────────────────────────────── */
router.get('/stats', (req, res, next) => {
  try {
    const stats = {
      users:     db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'").get().cnt,
      products:  db.prepare('SELECT COUNT(*) as cnt FROM products WHERE is_active = 1').get().cnt,
      orders:    db.prepare('SELECT COUNT(*) as cnt FROM orders').get().cnt,
      revenue:   db.prepare("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE status != 'cancelled'").get().total,
      pending:   db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'placed'").get().cnt,
      delivered: db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'delivered'").get().cnt,
      cancelled: db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'cancelled'").get().cnt,
      lowStock:  db.prepare('SELECT COUNT(*) as cnt FROM products WHERE stock < 10 AND is_active = 1').get().cnt,
    };

    const recentOrders = db.prepare(`
      SELECT o.id, o.order_code, o.total, o.status, o.created_at, u.name as customer
      FROM orders o JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT 10
    `).all();

    const topProducts = db.prepare(`
      SELECT p.name, p.category, SUM(oi.qty) as sold
      FROM order_items oi JOIN products p ON p.id = oi.product_id
      GROUP BY oi.product_id ORDER BY sold DESC LIMIT 5
    `).all();

    res.json({ success: true, data: { stats, recentOrders, topProducts } });
  } catch (err) {
    next(err);
  }
});

/* ── LIST ALL USERS ──────────────────────────────────────────── */
router.get('/users', (req, res, next) => {
  try {
    const users = db.prepare(`
      SELECT id, name, email, phone, role, is_active, email_verified, created_at, last_login
      FROM users ORDER BY created_at DESC
    `).all();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

/* ── UPDATE USER (activate/deactivate/role) ───────────────────── */
router.put(
  '/users/:id',
  [
    param('id').isInt().toInt(),
    body('is_active').optional().isBoolean(),
    body('role').optional().isIn(['customer', 'admin']),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { is_active, role } = req.body;
      // Prevent admin from deactivating themselves
      if (req.params.id === req.user.id && is_active === false) {
        return res.status(400).json({ success: false, message: 'Cannot deactivate your own account.' });
      }
      db.prepare(`
        UPDATE users SET
          is_active  = COALESCE(?, is_active),
          role       = COALESCE(?, role),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(is_active != null ? (is_active ? 1 : 0) : null, role || null, req.params.id);
      const updated = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(req.params.id);
      res.json({ success: true, message: 'User updated.', data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/* ── CREATE ADMIN USER ────────────────────────────────────────── */
router.post(
  '/create-admin',
  [
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });

      const hash = await bcrypt.hash(password, 12);
      const result = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run(name, email, hash);
      const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ success: true, message: 'Admin account created.', data: user });
    } catch (err) {
      next(err);
    }
  }
);

/* ── LOW STOCK PRODUCTS ───────────────────────────────────────── */
router.get('/low-stock', (req, res, next) => {
  try {
    const products = db.prepare('SELECT id, name, category, stock FROM products WHERE stock < 10 AND is_active = 1 ORDER BY stock ASC').all();
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
