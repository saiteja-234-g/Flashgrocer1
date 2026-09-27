const { validationResult, body } = require('express-validator');
const express = require('express');

// Validation API Middleware
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed - Invalid input data',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
}

/**
 * Example usage in an API Route:
 * Validating an incoming registration request
 */
const app = express();
app.use(express.json());

const registerValidationRules = [
    body('email').isEmail().withMessage('Must be a valid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('username').notEmpty().withMessage('Username is required')
];

app.post('/api/auth/register', registerValidationRules, handleValidation, (req, res) => {
    // If we reach here, the validation passed successfully.
    res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: { username: req.body.username, email: req.body.email }
    });
});

module.exports = { handleValidation, registerValidationRules };
