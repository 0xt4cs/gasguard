const jwt = require('jsonwebtoken');

// Ensure JWT_SECRET is loaded from environment variables
if (!process.env.JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is not set. Please configure .env file.');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

class AuthMiddleware {
  /**
   * Generate JWT token for authentication
   * @param {Object} payload - User data to encode in token
   * @returns {string} JWT token
   */
  static generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Generate JWT token for authentication
   * @param {Object} payload - User data to encode in token
   * @returns {string} JWT token
   */
  static generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Verify JWT token validity
   * @param {string} token - JWT token to verify
   * @returns {Object|null} Decoded payload or null if invalid
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  /**
   * Middleware to require authentication for protected routes
   * Validates JWT token from Authorization header
   */
  static requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = AuthMiddleware.verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
  }

  /**
   * Middleware to require admin role
   * Must be used after requireAuth middleware
   */
  static requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  }

  /**
   * Extract user information from token
   * Used for WebSocket authentication
   * @param {string} token - JWT token
   * @returns {Object|null} User data or null
   */
  static getUserFromToken(token) {
    return AuthMiddleware.verifyToken(token);
  }
}

module.exports = AuthMiddleware;
