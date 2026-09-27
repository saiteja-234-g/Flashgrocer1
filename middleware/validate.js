/* ================================================================
   FlashGrocer – middleware/validate.js
   Input sanitization & validation helpers
   ================================================================ */

'use strict';

const { validationResult } = require('express-validator');

/**
 * Checks the result of express-validator chains.
 * Returns 422 with structured errors if validation fails.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
}

/**
 * Sanitize string – strip HTML tags, trim whitespace
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

module.exports = { handleValidation, sanitizeString };
