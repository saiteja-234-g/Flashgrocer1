/* ================================================================
   FlashGrocer – database/db.js
   MongoDB connection and schema setup with Mongoose
   Collections: users, products, cart, orders, wishlist, promo_codes
   ================================================================ */

'use strict';

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flashgrocer';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
.then(() => console.log('🗄️  MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Handle connection events
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('📡 MongoDB disconnected');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

/* ----------------------------------------------------------------
   MONGOOSE SCHEMAS & MODELS
   ---------------------------------------------------------------- */

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  phone: String,
  address: String,
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  is_active: { type: Boolean, default: true },
  email_verified: { type: Boolean, default: false },
  avatar: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  last_login: Date
});

// Refresh Token Schema
const refreshTokenSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token_hash: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true },
  created_at: { type: Date, default: Date.now },
  revoked: { type: Boolean, default: false }
});

// Product Schema
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  original_price: { type: Number, required: true },
  rating: { type: Number, default: 4.0 },
  reviews: { type: Number, default: 0 },
  badge: String,
  img: String,
  delivery: { type: String, default: 'In 30 min' },
  description: String,
  stock: { type: Number, default: 100 },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Cart Schema
const cartSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  qty: { type: Number, default: 1 },
  added_at: { type: Date, default: Date.now }
});

// Order Schema
const orderSchema = new mongoose.Schema({
  order_code: { type: String, required: true, unique: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  delivery_fee: { type: Number, default: 0 },
  gst: { type: Number, default: 0 },
  total: { type: Number, required: true },
  promo_code: String,
  status: {
    type: String,
    enum: ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'],
    default: 'placed'
  },
  payment_method: { type: String, default: 'cod' },
  payment_status: { type: String, default: 'pending' },
  delivery_address: String,
  estimated_delivery: String,
  notes: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Order Items Schema
const orderItemSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  qty: { type: Number, required: true },
  subtotal: { type: Number, required: true }
});

// Wishlist Schema
const wishlistSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  added_at: { type: Date, default: Date.now }
});

// Promo Code Schema
const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discount_pct: { type: Number, required: true },
  min_amount: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
  expires_at: Date,
  usage_limit: Number,
  usage_count: { type: Number, default: 0 }
});

// Create models
const User = mongoose.model('User', userSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
const Product = mongoose.model('Product', productSchema);
const Cart = mongoose.model('Cart', cartSchema);
const Order = mongoose.model('Order', orderSchema);
const OrderItem = mongoose.model('OrderItem', orderItemSchema);
const Wishlist = mongoose.model('Wishlist', wishlistSchema);
const PromoCode = mongoose.model('PromoCode', promoCodeSchema);

/* ----------------------------------------------------------------
   SEED DATA – Products + Promo Codes (only if collections are empty)
   ---------------------------------------------------------------- */

async function seedDatabase() {
  try {
    // Check if products exist
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      const products = [
        // Grocery
        { name: 'Fresh Red Apples (1kg)', category: 'grocery', price: 89, original_price: 120, rating: 4.8, reviews: 342, badge: 'Fresh', img: 'images/prod_apple.png', delivery: 'In 10 min', stock: 200 },
        { name: 'Full Cream Milk (1L)', category: 'grocery', price: 64, original_price: 75, rating: 4.6, reviews: 210, badge: 'Daily', img: 'images/prod_milk.png', delivery: 'In 10 min', stock: 150 },
        { name: 'Whole Wheat Bread', category: 'grocery', price: 45, original_price: 55, rating: 4.5, reviews: 190, badge: 'Fresh', img: 'images/prod_bread.png', delivery: 'In 10 min', stock: 120 },
        { name: 'Organic Bananas (Dozen)', category: 'grocery', price: 59, original_price: 70, rating: 4.7, reviews: 280, badge: 'Organic', img: 'images/cat_grocery.png', delivery: 'In 10 min', stock: 180 },
        // Food
        { name: 'Chicken Dum Biryani (Family Pack)', category: 'food', price: 699, original_price: 899, rating: 4.9, reviews: 2500, badge: 'Bestseller', img: 'images/cat_food.png', delivery: 'In 30 min', stock: 100 },
        { name: 'Mutton Biryani (Special)', category: 'food', price: 499, original_price: 599, rating: 4.8, reviews: 1800, badge: 'Premium', img: 'images/cat_food.png', delivery: 'In 30 min', stock: 100 },
        { name: 'Chicken 65 (Starter)', category: 'food', price: 249, original_price: 299, rating: 4.7, reviews: 1200, badge: 'Spicy', img: 'images/cat_food.png', delivery: 'In 20 min', stock: 150 },
        // Snacks & Drinks
        { name: 'Tandoori Chicken (Half)', category: 'food', price: 349, original_price: 450, rating: 4.8, reviews: 1500, badge: 'Hot', img: 'images/cat_food.png', delivery: 'In 25 min', stock: 80 },
        { name: 'Chicken Tikka Masala', category: 'food', price: 299, original_price: 399, rating: 4.6, reviews: 900, badge: 'Must Try', img: 'images/cat_food.png', delivery: 'In 25 min', stock: 90 },
        { name: 'Egg Biryani', category: 'food', price: 229, original_price: 279, rating: 4.5, reviews: 600, badge: 'Tasty', img: 'images/cat_food.png', delivery: 'In 30 min', stock: 120 },
        { name: 'Paradise Special Biryani', category: 'food', price: 399, original_price: 499, rating: 4.9, reviews: 3500, badge: 'Iconic', img: 'images/cat_food.png', delivery: 'In 30 min', stock: 200 },
      ];

      await Product.insertMany(products);
      console.log(`✅ Seeded ${products.length} products`);
    }

    // Check if promo codes exist
    const promoCount = await PromoCode.countDocuments();
    if (promoCount === 0) {
      const promoCodes = [
        { code: 'FLASH10', discount_pct: 10, min_amount: 0, is_active: true },
        { code: 'GROCER50', discount_pct: 50, min_amount: 499, is_active: true },
        { code: 'FIRST20', discount_pct: 20, min_amount: 0, is_active: true }
      ];

      await PromoCode.insertMany(promoCodes);
      console.log('✅ Seeded promo codes');
    }

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
}

// Run seeding when the module is loaded
seedDatabase();

console.log(`🗄️  FlashGrocer MongoDB ready → ${MONGODB_URI}`);

// Export models for use in routes
module.exports = {
  User,
  RefreshToken,
  Product,
  Cart,
  Order,
  OrderItem,
  Wishlist,
  PromoCode,
  mongoose
};
