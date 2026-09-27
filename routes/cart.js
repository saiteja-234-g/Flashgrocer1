/* ================================================================
   FlashGrocer – routes/cart.js
   Cart Routes (authenticated users)
   GET    /api/cart         – get cart
   POST   /api/cart         – add item
   PUT    /api/cart/:id     – update qty
   DELETE /api/cart/:id     – remove item
   DELETE /api/cart         – clear cart
   ================================================================ */

'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const { Cart, Product } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();

// All cart routes require authentication
router.use(authenticate);

/* ── GET CART ─────────────────────────────────────────────────── */
router.get('/', (req, res, next) => {
  try {
    const items = db.prepare(`
      SELECT c.id, c.qty, c.added_at,
             p.id as product_id, p.name, p.category, p.price, p.original_price,
             p.rating, p.img, p.delivery, p.badge, p.stock
      FROM cart c
      JOIN products p ON p.id = c.product_id
      WHERE c.user_id = ? AND p.is_active = 1
      ORDER BY c.added_at ASC
    `).all(req.user.id);

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    res.json({ success: true, data: items, subtotal });
  } catch (err) {
    next(err);
  }
});

/* ── ADD ITEM TO CART ─────────────────────────────────────────── */
router.post(
  '/',
  [
    body('product_id').isInt({ min: 1 }).withMessage('Valid product_id required').toInt(),
    body('qty').optional().isInt({ min: 1, max: 99 }).toInt(),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { product_id, qty = 1 } = req.body;

      // Validate product exists and has stock
      const product = db.prepare('SELECT id, name, stock FROM products WHERE id = ? AND is_active = 1').get(product_id);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

      // Check if already in cart
      const existing = db.prepare('SELECT id, qty FROM cart WHERE user_id = ? AND product_id = ?').get(req.user.id, product_id);

      if (existing) {
        const newQty = Math.min(existing.qty + qty, product.stock, 99);
        db.prepare('UPDATE cart SET qty = ? WHERE id = ?').run(newQty, existing.id);
      } else {
        db.prepare('INSERT INTO cart (user_id, product_id, qty) VALUES (?, ?, ?)').run(req.user.id, product_id, Math.min(qty, product.stock));
      }

      res.status(201).json({ success: true, message: `"${product.name}" added to cart ✅` });
    } catch (err) {
      next(err);
    }
  }
);

/* ── UPDATE CART ITEM QTY ─────────────────────────────────────── */
router.put(
  '/:id',
  [
    param('id').isInt().toInt(),
    body('qty').isInt({ min: 0, max: 99 }).withMessage('Quantity must be 0-99').toInt(),
  ],
  handleValidation,
  (req, res, next) => {
    try {
      const { qty } = req.body;
      const item = db.prepare('SELECT * FROM cart WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!item) return res.status(404).json({ success: false, message: 'Cart item not found.' });

      if (qty === 0) {
        db.prepare('DELETE FROM cart WHERE id = ?').run(req.params.id);
        return res.json({ success: true, message: 'Item removed from cart.' });
      }

      db.prepare('UPDATE cart SET qty = ? WHERE id = ?').run(qty, req.params.id);
      res.json({ success: true, message: 'Cart updated.' });
    } catch (err) {
      next(err);
    }
  }
);

/* ── REMOVE ITEM FROM CART ────────────────────────────────────── */
router.delete('/:id', param('id').isInt().toInt(), handleValidation, (req, res, next) => {
  try {
    const result = db.prepare('DELETE FROM cart WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Cart item not found.' });
    res.json({ success: true, message: 'Item removed from cart.' });
  } catch (err) {
    next(err);
  }
});

/* ── CLEAR ENTIRE CART ────────────────────────────────────────── */
router.delete('/', (req, res, next) => {
  try {
    db.prepare('DELETE FROM cart WHERE user_id = ?').run(req.user.id);
    res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
