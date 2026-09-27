/* ================================================================
   FlashGrocer – middleware/errorHandler.js
   Global error handling middleware
   ================================================================ */

'use strict';

function errorHandler(err, req, res, next) {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${message}`);
    if (err.stack) console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found` });
}

module.exports = { errorHandler, notFound };
