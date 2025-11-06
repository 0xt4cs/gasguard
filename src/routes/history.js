const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const { SensorData } = require('../database/models');

const router = express.Router();

// Get statistics
router.get('/stats', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    console.log('[API] GET /api/history/stats - User:', req.user?.username);
    const stats = await SensorData.getStatistics(90);
    console.log('[API] Stats retrieved:', stats);
    
    const response = {
      success: true,
      stats: {
        totalRecords: stats.total_records || 0,
        averages: {
          mq6: Math.round(stats.avg_mq6 || 0),
          mq2: Math.round(stats.avg_mq2 || 0)
        },
        maximums: {
          mq6: Math.round(stats.max_mq6 || 0),
          mq2: Math.round(stats.max_mq2 || 0)
        },
        alerts: {
          normal: stats.normal_count || 0,
          low: stats.low_count || 0,
          critical: stats.critical_count || 0
        },
        oldestRecord: stats.oldest_record
      }
    };
    console.log('[API] Sending stats response:', response);
    res.json(response);
  } catch (error) {
    console.error('[API ERROR] Get stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

// Get historical data
router.get('/data', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      alertLevel,
      limit = 100,
      offset = 0,
      sortOrder = 'desc'
    } = req.query;

    let data;
    
    if (startDate && endDate) {
      // Query by date range
      data = await SensorData.getByDateRange(startDate, endDate, {
        alertLevel,
        limit: parseInt(limit)
      });
    } else {
      // Get recent readings
      data = await SensorData.getRecentReadings(parseInt(limit));
    }
    
    // Format the data for frontend
    const formattedData = data.map(record => ({
      timestamp: record.timestamp,
      mq6: {
        ppm: record.mq6_ppm,
        raw: record.mq6_raw
      },
      mq2: {
        ppm: record.mq2_ppm,
        raw: record.mq2_raw
      },
      gasType: record.gas_type,
      riskLevel: record.risk_level,
      alertLevel: record.alert_level,
      gpsLocation: record.gps_latitude && record.gps_longitude ? {
        latitude: record.gps_latitude,
        longitude: record.gps_longitude
      } : null
    }));
    
    res.json({
      success: true,
      data: formattedData,
      count: formattedData.length
    });
  } catch (error) {
    console.error('Get history data error:', error);
    res.status(500).json({ error: 'Failed to retrieve historical data' });
  }
});

// Export data as CSV 
router.get('/export', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv', includeAlerts = 'true' } = req.query;
    
    // Default: last 30 days to capture more data
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Extend end date to include full day
    end.setHours(23, 59, 59, 999);
    
    const data = await SensorData.getForExport(start.toISOString(), end.toISOString());
    
    if (format === 'csv') {
      const csvHeader = 'Timestamp,MQ6 (ppm),MQ2 (ppm),Gas Type,Alert Level,Latitude,Longitude\n';
      const csvRows = data.map(record => {
        const mq6 = typeof record.mq6_ppm === 'number' ? record.mq6_ppm.toFixed(2) : (record.mq6_ppm || '');
        const mq2 = typeof record.mq2_ppm === 'number' ? record.mq2_ppm.toFixed(2) : (record.mq2_ppm || '');
        const gasType = (record.gas_type || '').toString().replace(/"/g, '""');
        const alertLevel = (record.alert_level || '').toString();
        const lat = record.gps_latitude || '';
        const lng = record.gps_longitude || '';
        return [
          record.timestamp || '',
          mq6,
          mq2,
          `"${gasType}"`,
          alertLevel,
          lat,
          lng
        ].join(',');
      }).join('\n');

      const csv = csvHeader + (csvRows || '');
      
      // Better filename: gasguard-history-YYYYMMDD-HHMMSS.csv
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
      const filename = `gasguard-history-${dateStr}-${timeStr}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Unsupported format' });
    }
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = (db = null) => router;
