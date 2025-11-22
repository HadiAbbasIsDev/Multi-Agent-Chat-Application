const { body, param, query, validationResult } = require('express-validator');
const config = require('../config');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ 
      error: errors.array()[0]?.msg || 'Validation failed',
      errors: errors.array() 
    });
  }
  next();
};

// User validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required')
    .custom((value) => {
      if (!value.endsWith(config.constants.ALLOWED_EMAIL_DOMAIN)) {
        throw new Error(`Email must be from ${config.constants.ALLOWED_EMAIL_DOMAIN} domain`);
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('displayName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Display name must be between 2 and 100 characters'),
  validate
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

const updatePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  validate
];

const updateProfileValidation = [
  body('displayName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Display name must be between 2 and 100 characters'),
  body('avatarUrl')
    .optional()
    .custom((value) => {
      // Accept both regular URLs and data URLs (base64 images)
      if (typeof value !== 'string') {
        throw new Error('Avatar URL must be a string');
      }
      // Check if it's a data URL
      if (value.startsWith('data:image/')) {
        return true;
      }
      // Check if it's a valid URL
      try {
        new URL(value);
        return true;
      } catch {
        throw new Error('Avatar URL must be a valid URL or data URL');
      }
    })
    .withMessage('Avatar URL must be a valid URL or data URL'),
  validate
];

// Message validation rules
const sendMessageValidation = [
  body('body')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Message body cannot exceed 5000 characters'),
  body('body')
    .custom((value, { req }) => {
      if (!value && !req.files?.length) {
        throw new Error('Message must contain either text or an image');
      }
      return true;
    }),
  validate
];

const editMessageValidation = [
  body('body')
    .trim()
    .notEmpty()
    .withMessage('Message body is required')
    .isLength({ max: 5000 })
    .withMessage('Message body cannot exceed 5000 characters'),
  validate
];

// Group validation rules
const createGroupValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Group name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Group name must be between 2 and 100 characters'),
  body('memberIds')
    .isArray({ min: 1 })
    .withMessage('At least one member is required'),
  body('memberIds.*')
    .isUUID()
    .withMessage('Invalid member ID'),
  validate
];

const updateGroupValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Group name must be between 2 and 100 characters'),
  body('pictureUrl')
    .optional()
    .isURL()
    .withMessage('Picture URL must be a valid URL'),
  validate
];

// AI validation rules
const aiQueryValidation = [
  body('prompt')
    .trim()
    .notEmpty()
    .withMessage('Prompt is required')
    .isLength({ min: 3, max: 1000 })
    .withMessage('Prompt must be between 3 and 1000 characters'),
  validate
];

// UUID param validation
const uuidParamValidation = (paramName) => [
  param(paramName).isUUID().withMessage(`Invalid ${paramName}`),
  validate
];

module.exports = {
  registerValidation,
  loginValidation,
  updatePasswordValidation,
  updateProfileValidation,
  sendMessageValidation,
  editMessageValidation,
  createGroupValidation,
  updateGroupValidation,
  aiQueryValidation,
  uuidParamValidation
};