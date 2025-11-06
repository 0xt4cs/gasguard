const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const { SystemLog } = require('../database/models');

const router = express.Router();

// Get system logs
router.get('/', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const {
      level,
      category,
      startDate,
      endDate,
      search,
      limit = 500
    } = req.query;
    
    const options = {
      limit: parseInt(limit)
    };
    
    if (level) options.level = level;
    if (category) options.category = category;
    if (startDate) options.startDate = startDate;
    if (endDate) options.endDate = endDate;
    if (search) options.search = search;
    
    const logs = await SystemLog.getLogs(options);
    
    // Parse JSON data if it exists
    const formattedLogs = logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      level: log.level,
      category: log.category,
      message: log.message,
      source: log.source,
      user: log.user,
      data: log.data ? JSON.parse(log.data) : null
    }));
    
    res.json({
      success: true,
      logs: formattedLogs,
      count: formattedLogs.length
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Get log counts by level
router.get('/stats', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    const counts = await SystemLog.getCountsByLevel(parseInt(days));
    
    const stats = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };
    
    counts.forEach(item => {
      stats[item.level] = item.count;
    });
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get log stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve log statistics' });
  }
});

// Export logs as CSV
router.get('/export', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const {
      level,
      category,
      startDate,
      endDate,
      format = 'csv'
    } = req.query;
    
    console.log('[API] GET /api/logs/export - User:', req.user?.username);
    console.log('[API] Export params:', { level, category, startDate, endDate, format });
    
    const options = {};
    if (level) options.level = level;
    if (category) options.category = category;
    if (startDate) options.startDate = startDate;
    if (endDate) options.endDate = endDate;
    
    console.log('[API] Fetching logs with options:', options);
    const logs = await SystemLog.getForExport(options);
    console.log(`[API] Retrieved ${logs.length} logs for export`);
    
    if (format === 'csv') {
      // Generate CSV
      const csvHeader = 'Timestamp,Level,Category,Message,Source,User\n';
      const csvRows = logs.map(log => {
        return [
          log.timestamp || '',
          log.level || '',
          log.category || '',
          `"${(log.message || '').replace(/"/g, '""')}"`, // Escape quotes
          log.source || '',
          log.user || ''
        ].join(',');
      }).join('\n');
      
      const csv = csvHeader + (csvRows || '');
      console.log(`[API] Generated CSV with ${csv.length} bytes, ${logs.length} rows`);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="system-logs-${Date.now()}.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Unsupported format' });
    }
  } catch (error) {
    console.error('[API ERROR] Export logs error:', error);
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

// Cleanup old logs
router.post('/cleanup', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { days = 90 } = req.body;
    
    const deletedCount = await SystemLog.deleteOlderThan(parseInt(days));
    
    await SystemLog.info('system', `Log cleanup completed: ${deletedCount} logs deleted`, {
      source: 'logs.cleanup',
      user: req.user.username,
      data: { days, deletedCount }
    });
    
    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} old logs`,
      deletedCount
    });
  } catch (error) {
    console.error('Cleanup logs error:', error);
    res.status(500).json({ error: 'Failed to cleanup logs' });
  }
});

module.exports = (db = null) => router;
