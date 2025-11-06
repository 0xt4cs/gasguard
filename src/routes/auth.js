const express = require('express');
const bcrypt = require('bcryptjs');
const AuthMiddleware = require('../middleware/auth');
const { loginRateLimitMiddleware } = require('../middleware/rateLimiter');
const { User, SystemLog } = require('../database/models');

const router = express.Router();

// Login route with rate limiting
router.post('/login', loginRateLimitMiddleware, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user in database
    const user = await User.findByUsername(username);
    if (!user) {
      // Record failed attempt in rate limiter
      const result = req.rateLimiter.recordFailedAttempt(req.rateLimiterIp, username);
      
      await SystemLog.warning('auth', 'Failed login attempt - user not found', {
        source: 'auth.login',
        user: username
      });
      
      // Include lockout info if triggered
      if (result.locked) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          lockout: {
            locked: true,
            duration: result.durationMinutes,
            message: `Too many failed attempts. Account locked for ${result.durationMinutes} minute${result.durationMinutes > 1 ? 's' : ''}.`
          }
        });
      }
      
      return res.status(401).json({ 
        error: 'Invalid credentials',
        attemptsRemaining: result.attemptsRemaining 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // Record failed attempt in rate limiter
      const result = req.rateLimiter.recordFailedAttempt(req.rateLimiterIp, username);
      
      await SystemLog.warning('auth', 'Failed login attempt - invalid password', {
        source: 'auth.login',
        user: username
      });
      
      // Include lockout info if triggered
      if (result.locked) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          lockout: {
            locked: true,
            duration: result.durationMinutes,
            message: `Too many failed attempts. Account locked for ${result.durationMinutes} minute${result.durationMinutes > 1 ? 's' : ''}.`
          }
        });
      }
      
      return res.status(401).json({ 
        error: 'Invalid credentials',
        attemptsRemaining: result.attemptsRemaining 
      });
    }

    // Record successful login
    req.rateLimiter.recordSuccess(req.rateLimiterIp, username);
    
    // Generate token
    const token = AuthMiddleware.generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    // Log successful login
    await SystemLog.info('auth', `User logged in: ${user.username}`, {
      source: 'auth.login',
      user: user.username
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    await SystemLog.error('auth', 'Login error: ' + error.message, {
      source: 'auth.login'
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Logout
router.post('/logout', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    await SystemLog.info('auth', `User logged out: ${req.user.username}`, {
      source: 'auth.logout',
      user: req.user.username
    });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.json({ message: 'Logged out successfully' });
  }
});

// Change password
router.post('/change-password', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, targetUsername } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }
    
    // Determine which user's password to change
    let targetUser;
    
    if (targetUsername && targetUsername !== req.user.username) {
      // Admin is trying to change another user's password
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can change other users passwords' });
      }
      
      // Find the target user
      targetUser = await User.findByUsername(targetUsername);
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
      }
      
      // Verify the target user's current password
      const isValidPassword = await bcrypt.compare(currentPassword, targetUser.password);
      if (!isValidPassword) {
        await SystemLog.warning('auth', `Failed password change - incorrect current password for user: ${targetUsername}`, {
          source: 'auth.change-password',
          user: req.user.username,
          targetUser: targetUsername
        });
        return res.status(401).json({ error: `Current password for ${targetUsername} is incorrect` });
      }
    } else {
      // User is changing their own password
      targetUser = await User.findById(req.user.id);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, targetUser.password);
      if (!isValidPassword) {
        await SystemLog.warning('auth', 'Failed password change - incorrect current password', {
          source: 'auth.change-password',
          user: req.user.username
        });
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password in database
    await User.update(targetUser.id, { password: hashedPassword });
    
    // Log password change
    const logMessage = targetUsername && targetUsername !== req.user.username 
      ? `Admin ${req.user.username} changed password for user: ${targetUsername}`
      : `Password changed for user: ${req.user.username}`;
    
    await SystemLog.info('auth', logMessage, {
      source: 'auth.change-password',
      user: req.user.username,
      targetUser: targetUser.username
    });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    await SystemLog.error('auth', 'Password change error: ' + error.message, {
      source: 'auth.change-password',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = (db = null) => router;
