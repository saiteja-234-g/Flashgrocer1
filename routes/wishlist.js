/* ================================================================
   FlashGrocer – routes/wishlist.js
   Wishlist Routes (authenticated)
   GET    /api/wishlist       – get wishlist
   POST   /api/wishlist       – add item
   DELETE /api/wishlist/:id   – remove item
   ================================================================ */

'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

/* ── GET WISHLIST ─────────────────────────────────────────────── */
router.get('/', (req, res, next) => {
  try {
    const items = db.prepare(`
      SELECT w.id, w.added_at,
             p.id as product_id, p.name, p.category, p.price, p.original_price,
             p.rating, p.img, p.delivery, p.badge
      FROM wishlist w
      JOIN products p ON p.id = w.product_id
      WHERE w.user_id = ? AND p.is_active = 1
      ORDER BY w.added_at DESC
    `).all(req.user.id);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

/* ── TOGGLE WISHLIST ITEM ─────────────────────────────────────── */
router.post(
  '/',
  [body('product_id').isInt({ min: 1 }).toInt()],
  handleValidation,
  (req, res, next) => {
    try {
      const { product_id } = req.body;
      const product = db.prepare('SELECT id, name FROM products WHERE id = ? AND is_active = 1').get(product_id);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

      const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?').get(req.user.id, product_id);

      if (existing) {
        db.prepare('DELETE FROM wishlist WHERE id = ?').run(existing.id);
        return res.json({ success: true, action: 'removed', message: `"${product.name}" removed from wishlist.` });
      } else {
        db.prepare('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)').run(req.user.id, product_id);
        return res.status(201).json({ success: true, action: 'added', message: `♥ "${product.name}" added to wishlist!` });
      }
    } catch (err) {
      next(err);
    }
  }
);

/* ── REMOVE WISHLIST ITEM ─────────────────────────────────────── */
router.delete('/:id', param('id').isInt().toInt(), handleValidation, (req, res, next) => {
  try {
    const result = db.prepare('DELETE FROM wishlist WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Wishlist item not found.' });
    res.json({ success: true, message: 'Removed from wishlist.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
