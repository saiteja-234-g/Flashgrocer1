/* ================================================================
   FlashGrocer – routes/orders.js
   Order Routes (authenticated)
   POST /api/orders             – place order
   GET  /api/orders             – my orders
   GET  /api/orders/:id         – order detail
   PUT  /api/orders/:id/cancel  – cancel order
   GET  /api/orders/all         – all orders (admin)
   POST /api/orders/validate-promo – validate promo code
   ================================================================ */

'use strict';

const express  = require('express');
const crypto   = require('crypto');
const { body, param } = require('express-validator');
const db       = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation }        = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

const DELIVERY_FEE            = 40;
const FREE_DELIVERY_THRESHOLD = 299;
const GST_RATE                = 0.05;

/* ── VALIDATE PROMO CODE ─────────────────────────────────────── */
router.post('/validate-promo', [body('code').trim().notEmpty()], handleValidation, (req, res, next) => {
  try {
    const code = req.body.code.toUpperCase();
    const promo = db.prepare(`
      SELECT * FROM promo_codes
      WHERE code = ? AND is_active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      AND (usage_limit IS NULL OR usage_count < usage_limit)
    `).get(code);

    if (!promo) return res.status(400).json({ success: false, message: 'Invalid or expired promo code.' });

    res.json({
      success: true,
      message: `🎉 ${promo.discount_pct}% discount applied!`,
      promo: { code: promo.code, discount_pct: promo.discount_pct, min_amount: promo.min_amount }
    });
  } catch (err) {
    next(err);
  }
});

/* ── PLACE ORDER ─────────────────────────────────────────────── */
router.post(
  '/',
  [
    body('payment_method').optional().isIn(['cod', 'upi', 'card', 'paytm', 'netbanking']),
    body('promo_code').optional().isString(),
    body('delivery_address').optional().isString().isLength({ max: 500 }),
    body('notes').optional().isString().isLength({ max: 500 }),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { payment_method = 'cod', promo_code, delivery_address, notes } = req.body;

      // Get cart items
      const cartItems = db.prepare(`
        SELECT c.qty, p.id as product_id, p.name, p.price, p.stock
        FROM cart c
        JOIN products p ON p.id = c.product_id
        WHERE c.user_id = ? AND p.is_active = 1
      `).all(req.user.id);

      if (cartItems.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty. Add items before placing an order.' });
      }

      // Calculate totals
      let subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
      let discountPct = 0;

      // Apply promo code
      if (promo_code) {
        const code = promo_code.toUpperCase();
        const promo = db.prepare(`
          SELECT * FROM promo_codes WHERE code = ? AND is_active = 1
          AND (expires_at IS NULL OR expires_at > datetime('now'))
          AND (usage_limit IS NULL OR usage_count < usage_limit)
        `).get(code);

        if (promo) {
          if (subtotal >= promo.min_amount) {
            discountPct = promo.discount_pct;
            db.prepare('UPDATE promo_codes SET usage_count = usage_count + 1 WHERE code = ?').run(code);
          }
        }
      }

      const discountAmt = subtotal * (discountPct / 100);
      const afterDisc   = subtotal - discountAmt;
      const delivery    = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
      const gst         = afterDisc * GST_RATE;
      const total       = afterDisc + delivery + gst;

      // Generate unique order code
      const orderCode = 'FG-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

      // Insert order + items in a transaction
      const placeOrder = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO orders (order_code, user_id, subtotal, discount, delivery_fee, gst, total, promo_code, payment_method, delivery_address, notes, estimated_delivery)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
        `).run(orderCode, req.user.id, subtotal, discountAmt, delivery, gst, total, promo_code || null, payment_method, delivery_address || null, notes || null);

        const orderId = result.lastInsertRowid;

        for (const item of cartItems) {
          db.prepare(`
            INSERT INTO order_items (order_id, product_id, name, price, qty, subtotal)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(orderId, item.product_id, item.name, item.price, item.qty, item.price * item.qty);

          // Decrement stock
          db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(item.qty, item.product_id);
        }

        // Clear user's cart
        db.prepare('DELETE FROM cart WHERE user_id = ?').run(req.user.id);

        return orderId;
      });

      const orderId = placeOrder();
      const order   = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const items   = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

      res.status(201).json({
        success: true,
        message: `🎉 Order placed successfully! Estimated delivery in 10 minutes.`,
        data: { ...order, items }
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── MY ORDERS ───────────────────────────────────────────────── */
router.get('/', (req, res, next) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, 
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC
    `).all(req.user.id);

    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
});

/* ── ALL ORDERS (Admin) ──────────────────────────────────────── */
router.get('/all', authorize('admin'), (req, res, next) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, u.name as customer_name, u.email as customer_email,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
    `).all();
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
});

/* ── ORDER DETAIL ─────────────────────────────────────────────── */
router.get('/:id', param('id').isInt().toInt(), handleValidation, (req, res, next) => {
  try {
    const order = db.prepare(`
      SELECT o.*, u.name as customer_name, u.email as customer_email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.id = ?
    `).get(req.params.id);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Only owner or admin can see the order
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
    res.json({ success: true, data: { ...order, items } });
  } catch (err) {
    next(err);
  }
});

/* ── CANCEL ORDER ─────────────────────────────────────────────── */
router.put('/:id/cancel', param('id').isInt().toInt(), handleValidation, (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (!['placed', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel an order with status: ${order.status}` });
    }

    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: 'Order cancelled successfully.' });
  } catch (err) {
    next(err);
  }
});

/* ── UPDATE ORDER STATUS (Admin) ─────────────────────────────── */
router.put(
  '/:id/status',
  authorize('admin'),
  [param('id').isInt().toInt(), body('status').isIn(['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'])],
  handleValidation,
  (req, res, next) => {
    try {
      const result = db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(req.body.status, req.params.id);
      if (result.changes === 0) return res.status(404).json({ success: false, message: 'Order not found.' });
      res.json({ success: true, message: `Order status updated to "${req.body.status}".` });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
