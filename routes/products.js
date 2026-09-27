/* ================================================================
   FlashGrocer – routes/products.js
   Product Routes (public read, admin write)
   GET  /api/products          – list/filter/sort
   GET  /api/products/:id      – single product
   POST /api/products          – create (admin)
   PUT  /api/products/:id      – update (admin)
   DELETE /api/products/:id    – delete (admin)
   ================================================================ */

'use strict';

const express  = require('express');
const { body, query, param } = require('express-validator');
const { Product } = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation }        = require('../middleware/validate');

const router = express.Router();

/* ── GET ALL PRODUCTS (with optional filter/sort/search) ─────── */
router.get(
  '/',
  [
    query('category').optional().isIn(['all', 'grocery', 'food', 'drinks', 'snacks', 'icecream']),
    query('sort').optional().isIn(['default', 'price-asc', 'price-desc', 'rating']),
    query('q').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { category, sort, q, limit = 50, offset = 0 } = req.query;

      let query = { is_active: true };

      if (category && category !== 'all') {
        query.category = category;
      }

      if (q) {
        query.$or = [
          { name: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } }
        ];
      }

      let sortOption = {};
      if (sort === 'price-asc') sortOption = { price: 1 };
      else if (sort === 'price-desc') sortOption = { price: -1 };
      else if (sort === 'rating') sortOption = { rating: -1 };
      else sortOption = { _id: 1 };

      const products = await Product.find(query)
        .sort(sortOption)
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await Product.countDocuments(query);

      res.json({ success: true, data: products, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (err) {
      next(err);
    }
  }
);

/* ── GET SINGLE PRODUCT ──────────────────────────────────────── */
router.get('/:id', param('id').isMongoId(), handleValidation, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.is_active) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

/* ── CREATE PRODUCT (Admin only) ─────────────────────────────── */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  [
    body('name').trim().notEmpty().isLength({ max: 200 }),
    body('category').isIn(['grocery', 'food', 'drinks', 'snacks', 'icecream']),
    body('price').isFloat({ min: 0 }),
    body('original_price').isFloat({ min: 0 }),
    body('rating').optional().isFloat({ min: 0, max: 5 }),
    body('stock').optional().isInt({ min: 0 }),
    body('delivery').optional().isString(),
    body('img').optional().isString(),
    body('badge').optional().isString(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, category, price, original_price, rating = 4.0, reviews = 0, badge, img, delivery = 'In 30 min', stock = 100 } = req.body;
      const product = new Product({
        name,
        category,
        price,
        original_price,
        rating,
        reviews,
        badge,
        img,
        delivery,
        stock
      });

      await product.save();
      res.status(201).json({ success: true, message: 'Product created.', data: product });
    } catch (err) {
      next(err);
    }
  }
);

/* ── UPDATE PRODUCT (Admin only) ─────────────────────────────── */
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  param('id').isMongoId(),
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, category, price, original_price, rating, badge, img, delivery, stock, is_active } = req.body;
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

      // Update fields if provided
      if (name !== undefined) product.name = name;
      if (category !== undefined) product.category = category;
      if (price !== undefined) product.price = price;
      if (original_price !== undefined) product.original_price = original_price;
      if (rating !== undefined) product.rating = rating;
      if (badge !== undefined) product.badge = badge;
      if (img !== undefined) product.img = img;
      if (delivery !== undefined) product.delivery = delivery;
      if (stock !== undefined) product.stock = stock;
      if (is_active !== undefined) product.is_active = is_active;

      product.updated_at = new Date();
      await product.save();

      res.json({ success: true, message: 'Product updated.', data: product });
    } catch (err) {
      next(err);
    }
  }
);

/* ── DELETE PRODUCT (Admin – soft delete) ────────────────────── */
router.delete('/:id', authenticate, authorize('admin'), param('id').isMongoId(), handleValidation, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    product.is_active = false;
    product.updated_at = new Date();
    await product.save();

    res.json({ success: true, message: 'Product removed.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
