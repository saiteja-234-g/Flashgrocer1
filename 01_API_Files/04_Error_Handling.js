// Global Error Handling Middleware for APIs
function errorHandler(err, req, res, next) {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
  
    // Log error details securely on the server
    console.error(`[ERROR] ${req.method} ${req.path} -> ${status}: ${message}`);
    if (err.stack) {
        console.error(err.stack);
    }
  
    // Standardized error response structure
    res.status(status).json({
      success: false,
      error: {
        code: status,
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) // Hide stack in production
      }
    });
}
  
// 404 Not Found Middleware
function notFoundHandler(req, res, next) {
    res.status(404).json({ 
        success: false, 
        error: {
            code: 404,
            message: `Route ${req.method} ${req.url} not found in the API`
        }
    });
}

// Example Error triggering route
const express = require('express');
const app = express();
app.get('/api/faulty-route', (req, res, next) => {
    const error = new Error('Database connection lost');
    error.status = 503;
    next(error); // Passes to errorHandler
});

// Apply handlers to app
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { errorHandler, notFoundHandler };
