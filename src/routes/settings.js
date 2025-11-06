const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const { Settings, SystemLog } = require('../database/models');
const textbeeService = require('../services/textbeeService');

const router = express.Router();

// Get all settings (GLOBAL: profile, GPS, thresholds are shared across all users)
router.get('/', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    // Always use user_id = 2 (admin) for global/shared settings (hardware, GPS, thresholds, profile)
    const settings = await Settings.getByUserId(2);
    
    if (!settings) {
      return res.json({
        success: true,
        settings: {
          profile: {
            fullName: '',
            address: '',
            landmark: '',
            phone: ''
          },
          gps: {
            enabled: false,
            latitude: null,
            longitude: null
          },
          alerts: {
            lowLevelThreshold: 300,
            criticalLevelThreshold: 800,
            smsEnabled: false,
            buzzOnLow: true,
            buzzOnCritical: true
          }
        }
      });
    }
    
    res.json({
      success: true,
      settings: {
        profile: {
          fullName: settings.full_name || '',
          address: settings.address || '',
          landmark: settings.landmark || '',
          phone: settings.phone || ''
        },
        gps: {
          enabled: Boolean(settings.gps_enabled),
          latitude: settings.gps_latitude,
          longitude: settings.gps_longitude
        },
        alerts: {
          lowLevelThreshold: settings.low_level_threshold,
          criticalLevelThreshold: settings.critical_level_threshold,
          smsEnabled: Boolean(settings.sms_alerts_enabled),
          buzzOnLow: Boolean(settings.buzz_on_low),
          buzzOnCritical: Boolean(settings.buzz_on_critical)
        }
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

// Update profile settings (GLOBAL: profile is shared/unified across all users)
router.put('/profile', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { fullName, address, landmark, phone } = req.body;
    
    // Always use user_id = 2 (admin) for global profile settings
    const updatedSettings = await Settings.updateByUserId(2, {
      full_name: fullName || '',
      address: address || '',
      landmark: landmark || '',
      phone: phone || ''
    });
    
    await SystemLog.info('system', `Profile updated by user: ${req.user.username}`, {
      source: 'settings.profile',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        fullName: updatedSettings.full_name,
        address: updatedSettings.address,
        landmark: updatedSettings.landmark,
        phone: updatedSettings.phone
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    await SystemLog.error('system', 'Profile update error: ' + error.message, {
      source: 'settings.profile',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update GPS settings (GLOBAL: GPS location is shared/unified across all users)
router.put('/gps', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { enabled, latitude, longitude } = req.body;
    
    const updateData = {
      gps_enabled: enabled !== undefined ? (enabled ? 1 : 0) : undefined
    };
    
    if (latitude !== undefined) updateData.gps_latitude = latitude;
    if (longitude !== undefined) updateData.gps_longitude = longitude;
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });
    
    // Always use user_id = 2 (admin) for global GPS settings
    const updatedSettings = await Settings.updateByUserId(2, updateData);
    
    await SystemLog.info('system', `GPS settings updated by user: ${req.user.username}`, {
      source: 'settings.gps',
      user: req.user.username,
      data: { enabled: Boolean(enabled) }
    });
    
    res.json({
      success: true,
      message: 'GPS settings updated successfully',
      gps: {
        enabled: Boolean(updatedSettings.gps_enabled),
        latitude: updatedSettings.gps_latitude,
        longitude: updatedSettings.gps_longitude
      }
    });
  } catch (error) {
    console.error('Update GPS settings error:', error);
    await SystemLog.error('system', 'GPS settings update error: ' + error.message, {
      source: 'settings.gps',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to update GPS settings' });
  }
});

// Update alert preferences (Admin only - GLOBAL: thresholds and hardware settings are shared)
router.put('/alerts', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { 
      lowLevelThreshold, 
      criticalLevelThreshold, 
      smsEnabled,
      buzzOnLow,
      buzzOnCritical
    } = req.body;
    
    const updateData = {};
    
    if (lowLevelThreshold !== undefined) updateData.low_level_threshold = lowLevelThreshold;
    if (criticalLevelThreshold !== undefined) updateData.critical_level_threshold = criticalLevelThreshold;
    if (smsEnabled !== undefined) updateData.sms_alerts_enabled = smsEnabled ? 1 : 0;
    if (buzzOnLow !== undefined) updateData.buzz_on_low = buzzOnLow ? 1 : 0;
    if (buzzOnCritical !== undefined) updateData.buzz_on_critical = buzzOnCritical ? 1 : 0;
    
    // Always use user_id = 2 (admin) for global alert/hardware settings
    const updatedSettings = await Settings.updateByUserId(2, updateData);
    
    await SystemLog.info('system', `Alert preferences updated by user: ${req.user.username}`, {
      source: 'settings.alerts',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Alert preferences updated successfully',
      alerts: {
        lowLevelThreshold: updatedSettings.low_level_threshold,
        criticalLevelThreshold: updatedSettings.critical_level_threshold,
        smsEnabled: Boolean(updatedSettings.sms_alerts_enabled),
        buzzOnLow: Boolean(updatedSettings.buzz_on_low),
        buzzOnCritical: Boolean(updatedSettings.buzz_on_critical)
      }
    });
  } catch (error) {
    console.error('Update alert preferences error:', error);
    await SystemLog.error('system', 'Alert preferences update error: ' + error.message, {
      source: 'settings.alerts',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to update alert preferences' });
  }
});

// Get TextBee SMS configuration (Admin only - GLOBAL: SMS config is shared)
router.get('/sms-config', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    // Always use user_id = 2 (admin) for global SMS configuration
    const settings = await Settings.getByUserId(2);
    
    res.json({
      success: true,
      smsConfig: {
        enabled: Boolean(settings?.sms_alerts_enabled),
        apiKey: settings?.textbee_api_key || '',
        deviceId: settings?.textbee_device_id || ''
      }
    });
  } catch (error) {
    console.error('Get SMS config error:', error);
    res.status(500).json({ error: 'Failed to retrieve SMS configuration' });
  }
});

// Update TextBee SMS configuration (Admin only - GLOBAL: SMS config is shared)
router.put('/sms-config', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { enabled, apiKey, deviceId } = req.body;
    
    // Debug logging
    console.log('[SMS CONFIG] Received request body:', JSON.stringify(req.body, null, 2));
    console.log('[SMS CONFIG] Using global user_id = 2 (admin) for SMS config');
    console.log('[SMS CONFIG] Enabled:', enabled);
    console.log('[SMS CONFIG] API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'null/empty');
    console.log('[SMS CONFIG] Device ID:', deviceId ? `${deviceId.substring(0, 8)}...` : 'null/empty');
    
    const updateData = {};
    
    if (enabled !== undefined) {
      updateData.sms_alerts_enabled = enabled ? 1 : 0;
    }
    
    if (apiKey !== undefined) {
      updateData.textbee_api_key = apiKey;
    }
    
    if (deviceId !== undefined) {
      updateData.textbee_device_id = deviceId;
    }
    
    console.log('[SMS CONFIG] Update data:', JSON.stringify(updateData, null, 2));
    
    // Always use user_id = 2 (admin) for global SMS configuration
    const updatedSettings = await Settings.updateByUserId(2, updateData);
    
    console.log('[SMS CONFIG] Updated settings:', JSON.stringify(updatedSettings, null, 2));
    
    // Validate credentials if both API Key and Device ID are provided (non-blocking warning)
    let validationWarning = null;
    if (apiKey && deviceId && apiKey !== '' && enabled) {
      const validation = await textbeeService.validateCredentials(apiKey, deviceId);
      if (!validation.valid) {
        validationWarning = validation.error;
        console.warn('[TextBee] Credentials validation warning:', validation.error);
      }
    }
    
    // Reinitialize TextBee service with new credentials
    if (enabled && apiKey && deviceId) {
      await textbeeService.initialize();
    }
    
    await SystemLog.info('system', `SMS configuration updated by user: ${req.user.username}`, {
      source: 'settings.sms',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: validationWarning 
        ? 'SMS configuration saved (Warning: ' + validationWarning + ')'
        : 'SMS configuration updated successfully',
      warning: validationWarning,
      smsConfig: {
        enabled: Boolean(updatedSettings.sms_alerts_enabled),
        apiKey: updatedSettings.textbee_api_key,
        deviceId: updatedSettings.textbee_device_id
      }
    });
  } catch (error) {
    console.error('Update SMS config error:', error);
    await SystemLog.error('system', 'SMS configuration update error: ' + error.message, {
      source: 'settings.sms',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to update SMS configuration' });
  }
});

// Send test SMS via TextBee (Admin only)
router.post('/sms-test', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { testPhoneNumber } = req.body;
    
    if (!testPhoneNumber) {
      return res.status(400).json({ error: 'Test phone number is required' });
    }
    
    // Ensure TextBee service is initialized
    await textbeeService.initialize();
    if (!textbeeService.isConfigured()) {
      return res.status(400).json({ 
        error: 'SMS service not configured. Please configure TextBee settings first.' 
      });
    }
    
    const testMessage = `TEST SMS from GasGuard\n\n` +
      `This is a test message to verify your TextBee SMS gateway configuration.\n\n` +
      `Time: ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}\n\n` +
      `If you received this message, your SMS alerts are working correctly!\n\n` +
      `- GasGuard IoT System`;
    
    const result = await textbeeService.sendSMS(testPhoneNumber, testMessage);
    
    if (result.success) {
      await SystemLog.info('system', `Test SMS sent to ${testPhoneNumber} by user: ${req.user.username}`, {
        source: 'settings.sms-test',
        user: req.user.username
      });
      
      res.json({
        success: true,
        message: 'Test SMS sent successfully via TextBee!',
        details: {
          messageId: result.messageId,
          to: result.recipients,
          status: result.status
        }
      });
    } else {
      await SystemLog.error('system', `Test SMS failed to ${testPhoneNumber}`, {
        source: 'settings.sms-test',
        user: req.user.username
      });
      
      res.status(400).json({
        success: false,
        error: 'Failed to send test SMS'
      });
    }
  } catch (error) {
    console.error('Send test SMS error:', error);
    await SystemLog.error('system', 'Test SMS error: ' + error.message, {
      source: 'settings.sms-test',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to send test SMS: ' + error.message });
  }
});

// Get data retention settings (Admin only)
router.get('/data-retention', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    // CRITICAL: Always read from admin user (user_id = 2) for global retention policy
    const settings = await Settings.getByUserId(2);
    
    console.log('[DATA RETENTION] Retrieved global retention setting:', {
      user_id: 2,
      data_retention_days: settings?.data_retention_days || 90
    });
    
    res.json({
      success: true,
      retentionDays: settings?.data_retention_days || 90
    });
  } catch (error) {
    console.error('Get data retention error:', error);
    res.status(500).json({ error: 'Failed to retrieve data retention settings' });
  }
});

// Update data retention settings (Admin only)
router.put('/data-retention', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { retentionDays } = req.body;
    
    // Validate retention days
    const validValues = [30, 90, 180, 365, -1]; // -1 means "never delete"
    if (!validValues.includes(retentionDays)) {
      return res.status(400).json({ error: 'Invalid retention period. Must be 30, 90, 180, 365, or -1 (never)' });
    }
    
    // CRITICAL: Always update admin user (user_id = 2) settings for global retention policy
    // This ensures all pages read from the same source
    const updatedSettings = await Settings.updateByUserId(2, {
      data_retention_days: retentionDays
    });
    
    const retentionLabel = retentionDays === -1 ? 'Never (keep all data)' : `${retentionDays} days`;
    
    console.log('[DATA RETENTION] Updated global retention setting:', {
      user_id: 2,
      data_retention_days: retentionDays,
      label: retentionLabel
    });
    
    await SystemLog.info('system', `Data retention period changed to: ${retentionLabel}`, {
      source: 'settings.data-retention',
      user: req.user.username,
      oldValue: 90,
      newValue: retentionDays
    });
    
    res.json({
      success: true,
      message: 'Data retention settings updated successfully',
      retentionDays: updatedSettings.data_retention_days
    });
  } catch (error) {
    console.error('Update data retention error:', error);
    await SystemLog.error('system', 'Data retention update error: ' + error.message, {
      source: 'settings.data-retention',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to update data retention settings' });
  }
});

// Get data statistics (Admin only)
router.get('/data-statistics', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const db = require('../database/connection');
    
    const [sensorStats, alertStats, logStats] = await Promise.all([
      db.get('SELECT COUNT(*) as count, MIN(created_at) as oldest, MAX(created_at) as newest FROM sensor_data'),
      db.get('SELECT COUNT(*) as count, MIN(created_at) as oldest, MAX(created_at) as newest FROM alerts'),
      db.get('SELECT COUNT(*) as count, MIN(created_at) as oldest, MAX(created_at) as newest FROM system_logs')
    ]);
    
    res.json({
      success: true,
      statistics: {
        sensorData: {
          count: sensorStats?.count || 0,
          oldest: sensorStats?.oldest,
          newest: sensorStats?.newest
        },
        alerts: {
          count: alertStats?.count || 0,
          oldest: alertStats?.oldest,
          newest: alertStats?.newest
        },
        systemLogs: {
          count: logStats?.count || 0,
          oldest: logStats?.oldest,
          newest: logStats?.newest
        }
      }
    });
  } catch (error) {
    console.error('Get data statistics error:', error);
    res.status(500).json({ error: 'Failed to retrieve data statistics' });
  }
});

// Manual delete all historical data (Admin only)
router.delete('/delete-all-data', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { confirmation } = req.body;
    
    // Require exact confirmation text
    if (confirmation !== 'DELETE ALL DATA') {
      return res.status(400).json({ error: 'Confirmation text does not match. Please type "DELETE ALL DATA" exactly.' });
    }
    
    const db = require('../database/connection');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Get counts before deletion
    const [sensorCount, alertCount, logCount] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM sensor_data WHERE created_at < ?', [sevenDaysAgo]),
      db.get('SELECT COUNT(*) as count FROM alerts WHERE created_at < ?', [sevenDaysAgo]),
      db.get('SELECT COUNT(*) as count FROM system_logs WHERE created_at < ? AND category != "auth"', [sevenDaysAgo])
    ]);
    
    // Delete data older than 7 days (safety buffer - keep recent data)
    await Promise.all([
      db.run('DELETE FROM sensor_data WHERE created_at < ?', [sevenDaysAgo]),
      db.run('DELETE FROM alerts WHERE created_at < ?', [sevenDaysAgo]),
      db.run('DELETE FROM system_logs WHERE created_at < ? AND category != "auth"', [sevenDaysAgo]) // Keep auth logs
    ]);
    
    const deletedTotal = (sensorCount?.count || 0) + (alertCount?.count || 0) + (logCount?.count || 0);
    
    await SystemLog.warning('system', `Manual data deletion performed by admin: ${req.user.username}. Deleted ${deletedTotal} records`, {
      source: 'settings.manual-delete',
      user: req.user.username,
      deleted: {
        sensorData: sensorCount?.count || 0,
        alerts: alertCount?.count || 0,
        systemLogs: logCount?.count || 0
      }
    });
    
    res.json({
      success: true,
      message: 'Historical data deleted successfully',
      deleted: {
        sensorData: sensorCount?.count || 0,
        alerts: alertCount?.count || 0,
        systemLogs: logCount?.count || 0,
        total: deletedTotal
      }
    });
  } catch (error) {
    console.error('Delete all data error:', error);
    await SystemLog.error('system', 'Manual data deletion error: ' + error.message, {
      source: 'settings.manual-delete',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to delete historical data' });
  }
});

module.exports = (db = null) => router;
