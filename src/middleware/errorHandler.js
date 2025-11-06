const { SystemLog } = require('../database/models');


 // Custom Application Error class
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

 // Centralized error handling middleware
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Log to database
  SystemLog.error('system', `API Error: ${err.message}`, {
    source: req.path,
    user: req.user?.username || 'anonymous',
    data: { 
      method: req.method, 
      statusCode: err.statusCode,
      ip: req.ip 
    }
  }).catch(logErr => {
    console.error('[ERROR] Failed to log error to database:', logErr);
  });

  // Default to 500 if statusCode not set
  const statusCode = err.statusCode || 500;

  // Determine if we should expose error details
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = !isProduction;

  // Prepare error response
  const errorResponse = {
    success: false,
    error: err.message || 'An unexpected error occurred'
  };

  // Add details in development mode or for operational errors
  if (isDevelopment || err.isOperational) {
    if (err.details) {
      errorResponse.details = err.details;
    }
  }

  // Add stack trace in development mode
  if (isDevelopment && err.stack) {
    errorResponse.stack = err.stack;
  }

  // Send response
  res.status(statusCode).json(errorResponse);
}

 // Async error wrapper for route handlers
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

 // Handle 404 - Route not found
function notFoundHandler(req, res, next) {
  const error = new AppError(
    `Route ${req.method} ${req.path} not found`,
    404
  );
  next(error);
}

 // Validation error helper
function validationError(message, details = null) {
  return new AppError(message, 400, details);
}

 // Authentication error helper
function authError(message = 'Authentication required') {
  return new AppError(message, 401);
}

 // Authorization error helper
function forbiddenError(message = 'Access forbidden') {
  return new AppError(message, 403);
}

 // Not found error helper
function notFoundError(message = 'Resource not found') {
  return new AppError(message, 404);
}

 // Conflict error helper
function conflictError(message = 'Resource conflict') {
  return new AppError(message, 409);
}

 // Database error helper
function databaseError(message = 'Database operation failed') {
  return new AppError(message, 500);
}

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  validationError,
  authError,
  forbiddenError,
  notFoundError,
  conflictError,
  databaseError
};

