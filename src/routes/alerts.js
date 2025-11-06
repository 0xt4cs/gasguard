const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const { Alert } = require('../database/models');

const router = express.Router();

// Get recent alerts
router.get('/active', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    console.log('[API] GET /api/alerts/active - User:', req.user?.username);
    const alerts = await Alert.getRecentAlerts(1); // Last 1 day
    console.log(`[API] Found ${alerts?.length || 0} recent alerts`);
    res.json({
      success: true,
      alerts: alerts || []
    });
  } catch (error) {
    console.error('[API ERROR] Get active alerts error:', error);
    res.status(500).json({ error: 'Failed to retrieve active alerts' });
  }
});

// Get alert history
router.get('/history', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { 
      limit = 20, 
      offset = 0, 
      type = null,
      startDate = null,
      endDate = null
    } = req.query;

    const alerts = await Alert.getAllWithSensorData({
      limit: parseInt(limit),
      offset: parseInt(offset),
      alertType: type,
      startDate,
      endDate
    });

    // Get total count for pagination
    const total = await Alert.count();
    
    res.json({
      success: true,
      alerts: alerts || [],
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get alert history error:', error);
    res.status(500).json({ error: 'Failed to retrieve alert history' });
  }
});

// Get single alert by ID with full sensor data
router.get('/:id', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    console.log(`[API] GET /api/alerts/${alertId} - User:`, req.user?.username);
    
    if (isNaN(alertId)) {
      console.log(`[API ERROR] Invalid alert ID: ${req.params.id}`);
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await Alert.getAlertWithSensorData(alertId);
    
    if (!alert) {
      console.log(`[API ERROR] Alert ${alertId} not found`);
      return res.status(404).json({ error: 'Alert not found' });
    }

    console.log(`[API] Alert ${alertId} retrieved successfully`);
    res.json({
      success: true,
      alert: alert
    });
  } catch (error) {
    console.error(`[API ERROR] Get alert by ID (${req.params.id}) error:`, error);
    console.error('[API ERROR] Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to retrieve alert', details: error.message });
  }
});

// Get alert statistics
router.get('/stats', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await Alert.getStatistics(parseInt(days));
    
    res.json({
      success: true,
      stats: {
        total: stats.total || 0,
        low_count: stats.low_count || 0,
        critical_count: stats.critical_count || 0,
        sms_sent_count: stats.sms_sent_count || 0,
        avg_mq6_ppm: stats.avg_mq6_ppm || 0,
        avg_mq2_ppm: stats.avg_mq2_ppm || 0,
        max_mq6_ppm: stats.max_mq6_ppm || 0,
        max_mq2_ppm: stats.max_mq2_ppm || 0,
        period_days: parseInt(days)
      }
    });
  } catch (error) {
    console.error('Get alert statistics error:', error);
    res.status(500).json({ error: 'Failed to retrieve alert statistics' });
  }
});

// Export alerts data
router.get('/export', AuthMiddleware.requireAdmin, (req, res) => {
  const { format = 'json', startDate, endDate } = req.query;

  // Mock export
  const exportData = {
    format,
    dateRange: { start: startDate, end: endDate },
    recordCount: 25,
    downloadUrl: '/api/alerts/download/export-2024-01-15.json'
  };

  res.json(exportData);
});

module.exports = (db = null, hardwareManager = null) => router;

