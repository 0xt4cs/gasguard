const express = require('express');
const AuthMiddleware = require('../middleware/auth');

const router = express.Router();

// Get dashboard data
router.get('/', AuthMiddleware.requireAuth, (req, res) => {
  // Mock dashboard data
  const dashboardData = {
    systemStatus: {
      online: true,
      lastUpdate: new Date(),
      uptime: process.uptime()
    },
    alerts: {
      active: 0,
      today: 2,
      thisWeek: 5
    },
    sensors: {
      mq6: { status: 'online', lastReading: '2.3 ppm' },
      mq2: { status: 'online', lastReading: '1.8 ppm' }
    },
    gps: {
      status: 'online',
      location: '40.7128, -74.0060'
    }
  };

  res.json(dashboardData);
});

// Get sensor history (mock data)
router.get('/sensor-history', AuthMiddleware.requireAuth, (req, res) => {
  const { hours = 24 } = req.query;

  // Generate mock sensor history
  const history = [];
  const now = new Date();

  for (let i = hours * 4; i >= 0; i--) { // Every 15 minutes
    const timestamp = new Date(now.getTime() - i * 15 * 60 * 1000);
    history.push({
      timestamp,
      mq6: {
        ppm: Math.random() * 10 + Math.sin(i * 0.1) * 5,
        raw: Math.floor(Math.random() * 100) + 100
      },
      mq2: {
        ppm: Math.random() * 8 + Math.cos(i * 0.1) * 3,
        raw: Math.floor(Math.random() * 100) + 100
      }
    });
  }

  res.json(history);
});

// Get system logs
router.get('/logs', AuthMiddleware.requireAuth, (req, res) => {
  const { limit = 50 } = req.query;

  // Mock logs
  const logs = [
    { timestamp: new Date(Date.now() - 1000 * 60 * 5), level: 'info', message: 'System startup completed' },
    { timestamp: new Date(Date.now() - 1000 * 60 * 10), level: 'warning', message: 'GPS signal weak' },
    { timestamp: new Date(Date.now() - 1000 * 60 * 15), level: 'info', message: 'Sensor calibration completed' },
    { timestamp: new Date(Date.now() - 1000 * 60 * 30), level: 'error', message: 'Network connection lost temporarily' },
    { timestamp: new Date(Date.now() - 1000 * 60 * 45), level: 'info', message: 'Daily maintenance check passed' }
  ];

  res.json(logs.slice(0, limit));
});

// Get alert manager state (for monitoring SMS trigger status)
router.get('/alert-manager-state', AuthMiddleware.requireAuth, (req, res) => {
  try {
    // Get hardware manager from app locals if available
    const hardwareManager = req.app.locals.hardwareManager;
    
    if (!hardwareManager || typeof hardwareManager.getAlertManagerState !== 'function') {
      return res.json({
        available: false,
        message: 'Alert manager not available'
      });
    }

    const state = hardwareManager.getAlertManagerState();
    res.json({
      available: true,
      state: state
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get alert manager state',
      message: error.message 
    });
  }
});

module.exports = (db = null, hardwareManager = null) => router;

