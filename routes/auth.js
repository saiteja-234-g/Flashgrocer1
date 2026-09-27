/* ================================================================
   FlashGrocer – routes/auth.js
   Authentication & Security Routes
   POST /api/auth/register
   POST /api/auth/login
   POST /api/auth/logout
   POST /api/auth/refresh
   GET  /api/auth/me
   PUT  /api/auth/profile
   PUT  /api/auth/change-password
   ================================================================ */

'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { body } = require('express-validator');
const { User, RefreshToken } = require('../database/db');
const { authenticate }    = require('../middleware/auth');
const { handleValidation, sanitizeString } = require('../middleware/validate');

const router = express.Router();

/* ── Helpers ─────────────────────────────────────────────────── */
async function generateTokens(user) {
  const payload = { id: user._id.toString(), email: user.email, role: user.role };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  const refreshToken = crypto.randomBytes(64).toString('hex');
  const refreshHash  = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // Store hashed refresh token in DB (expires in 30 days)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const refreshTokenDoc = new RefreshToken({
    user_id: user._id,
    token_hash: refreshHash,
    expires_at: expiresAt
  });

  await refreshTokenDoc.save();

  return { accessToken, refreshToken };
}

function setAuthCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('fg_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  });
  res.cookie('fg_refresh', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth/refresh',
  });
}

/* ── REGISTER ────────────────────────────────────────────────── */
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[0-9]/).withMessage('Password must contain a digit'),
    body('phone').optional().trim().isMobilePhone('en-IN').withMessage('Valid Indian phone number required'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email, password, phone } = req.body;
      const cleanName  = sanitizeString(name);
      const cleanEmail = email.toLowerCase().trim();

      // Check duplicate email
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email already registered. Please log in.' });
      }

      // Hash password (12 rounds)
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const user = new User({
        name: cleanName,
        email: cleanEmail,
        password_hash: passwordHash,
        phone: phone || null,
        role: 'customer'
      });

      await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = await generateTokens(user);
      setAuthCookies(res, accessToken, refreshToken);

      res.status(201).json({
        success: true,
        message: 'Account created successfully! Welcome to FlashGrocer ⚡',
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        accessToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── LOGIN ───────────────────────────────────────────────────── */
router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password, rememberMe } = req.body;
      const cleanEmail = email.toLowerCase().trim();

      // Find user
      const user = await User.findOne({ email: cleanEmail });
      if (!user || !user.is_active) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      // Update last_login
      user.last_login = new Date();
      await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = await generateTokens(user);
      setAuthCookies(res, accessToken, refreshToken);

      res.json({
        success: true,
        message: `Welcome back, ${user.name}! ⚡`,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, address: user.address },
        accessToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── LOGOUT ──────────────────────────────────────────────────── */
router.post('/logout', authenticate, async (req, res) => {
  // Revoke all refresh tokens for the user
  await RefreshToken.updateMany({ user_id: req.user.id }, { revoked: true });
  res.clearCookie('fg_token');
  res.clearCookie('fg_refresh', { path: '/api/auth/refresh' });
  res.json({ success: true, message: 'Logged out successfully.' });
});

/* ── REFRESH TOKEN ───────────────────────────────────────────── */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.fg_refresh || req.body?.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token provided.' });

    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await RefreshToken.findOne({
      token_hash: refreshHash,
      revoked: false,
      expires_at: { $gt: new Date() }
    }).populate('user_id');

    if (!stored || !stored.user_id.is_active) {
      res.clearCookie('fg_token');
      res.clearCookie('fg_refresh', { path: '/api/auth/refresh' });
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' });
    }

    // Rotate refresh token
    await RefreshToken.updateOne({ token_hash: refreshHash }, { revoked: true });

    const user = stored.user_id;
    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user);
    setAuthCookies(res, accessToken, newRefreshToken);

    res.json({ success: true, accessToken });
  } catch (err) {
    next(err);
  }
});

/* ── GET CURRENT USER ────────────────────────────────────────── */
router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select('name email phone address role email_verified created_at last_login');
  res.json({ success: true, user });
});

/* ── UPDATE PROFILE ──────────────────────────────────────────── */
router.put(
  '/profile',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('phone').optional().trim().isMobilePhone('en-IN').withMessage('Valid Indian phone number required'),
    body('address').optional().trim().isLength({ max: 500 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, phone, address } = req.body;
      const user = await User.findById(req.user.id);

      if (name !== undefined) user.name = sanitizeString(name);
      if (phone !== undefined) user.phone = phone;
      if (address !== undefined) user.address = sanitizeString(address);
      user.updated_at = new Date();

      await user.save();

      res.json({ success: true, message: 'Profile updated!', user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role
      } });
    } catch (err) {
      next(err);
    }
  }
);

/* ── CHANGE PASSWORD ─────────────────────────────────────────── */
router.put(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
      .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
      .matches(/[0-9]/).withMessage('Must contain a digit'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user.id);

      const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });

      const newHash = await bcrypt.hash(newPassword, 12);
      user.password_hash = newHash;
      user.updated_at = new Date();
      await user.save();

      // Revoke all refresh tokens (force re-login on all devices)
      await RefreshToken.updateMany({ user_id: req.user.id }, { revoked: true });
      res.clearCookie('fg_token');
      res.clearCookie('fg_refresh', { path: '/api/auth/refresh' });

      res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
