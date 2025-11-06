const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const db = require('../database/connection');
const { Settings } = require('../database/models');

const router = express.Router();

// Helper function to get retention days from admin settings
async function getRetentionDays() {
  try {
    // Get admin user (user_id = 2) settings for global retention policy
    const adminSettings = await Settings.getByUserId(2);
    const retentionDays = adminSettings?.data_retention_days || 90;
    console.log('[DATA RETENTION] Retrieved from DB:', {
      user_id: 2,
      hasSettings: !!adminSettings,
      data_retention_days: adminSettings?.data_retention_days,
      returning: retentionDays
    });
    return retentionDays; // Default to 90 if not set
  } catch (error) {
    console.error('Error getting retention days:', error);
    return 90; // Fallback to 90 days
  }
}

// Check if data retention warning should be shown
router.get('/check-retention', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const RETENTION_DAYS = await getRetentionDays();
    const WARNING_DAYS = 14;
    
    const now = new Date();
    let warnings = [];
    
    // If retention is set to "Never" (-1), skip warning checks
    if (RETENTION_DAYS !== -1) {
      // Run both queries in parallel for better performance
      const [oldestSensorData, oldestLog] = await Promise.all([
        db.get(`
          SELECT 
            MIN(created_at) as oldest_date,
            COUNT(*) as total_records
          FROM sensor_data
        `),
        db.get(`
          SELECT 
            MIN(created_at) as oldest_date,
            COUNT(*) as total_records
          FROM system_logs
        `)
      ]);
      
      if (oldestSensorData && oldestSensorData.oldest_date) {
        const oldestDate = new Date(oldestSensorData.oldest_date);
        const ageInDays = Math.floor((now - oldestDate) / (1000 * 60 * 60 * 24));
        const daysUntilDeletion = RETENTION_DAYS - ageInDays;
        
        if (daysUntilDeletion <= WARNING_DAYS && daysUntilDeletion > 0) {
          warnings.push({
            type: 'sensor_data',
            daysUntilDeletion,
            recordCount: oldestSensorData.total_records,
            oldestDate: oldestDate.toISOString(),
            message: `${oldestSensorData.total_records} sensor record${oldestSensorData.total_records > 1 ? 's' : ''} will be automatically deleted in ${daysUntilDeletion} day${daysUntilDeletion > 1 ? 's' : ''}`
          });
        }
      }
      
      if (oldestLog && oldestLog.oldest_date) {
        const oldestDate = new Date(oldestLog.oldest_date);
        const ageInDays = Math.floor((now - oldestDate) / (1000 * 60 * 60 * 24));
        const daysUntilDeletion = RETENTION_DAYS - ageInDays;
        
        if (daysUntilDeletion <= WARNING_DAYS && daysUntilDeletion > 0) {
          warnings.push({
            type: 'system_logs',
            daysUntilDeletion,
            recordCount: oldestLog.total_records,
            oldestDate: oldestDate.toISOString(),
            message: `${oldestLog.total_records} system log${oldestLog.total_records > 1 ? 's' : ''} will be automatically deleted in ${daysUntilDeletion} day${daysUntilDeletion > 1 ? 's' : ''}`
          });
        }
      }
    }
    
    res.json({
      success: true,
      hasWarning: warnings.length > 0,
      warnings,
      retentionPolicy: {
        days: RETENTION_DAYS,
        warningThreshold: WARNING_DAYS,
        description: RETENTION_DAYS === -1 
          ? 'Data retention disabled - all data is kept indefinitely'
          : `Data older than ${RETENTION_DAYS} days is automatically deleted`
      }
    });
  } catch (error) {
    console.error('Data retention check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check data retention status' 
    });
  }
});

router.get('/stats', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    // Run all three queries in parallel for better performance
    const [sensorStats, logStats, alertStats] = await Promise.all([
      db.get(`
        SELECT 
          COUNT(*) as total,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM sensor_data
      `),
      db.get(`
        SELECT 
          COUNT(*) as total,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM system_logs
      `),
      db.get(`
        SELECT 
          COUNT(*) as total,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM alerts
      `)
    ]);
    
    res.json({
      success: true,
      stats: {
        sensorData: {
          totalRecords: sensorStats.total,
          oldestDate: sensorStats.oldest,
          newestDate: sensorStats.newest
        },
        systemLogs: {
          totalRecords: logStats.total,
          oldestDate: logStats.oldest,
          newestDate: logStats.newest
        },
        alerts: {
          totalRecords: alertStats.total,
          oldestDate: alertStats.oldest,
          newestDate: alertStats.newest
        }
      }
    });
  } catch (error) {
    console.error('Data retention stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch retention statistics' 
    });
  }
});

module.exports = () => router;

