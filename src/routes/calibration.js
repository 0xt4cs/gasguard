const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const { CalibrationData, CalibrationHistory, SystemLog } = require('../database/models');

const router = express.Router();

// Get calibration status for all sensors
router.get('/status', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const mq6 = await CalibrationData.getBySensor('mq6');
    const mq2 = await CalibrationData.getBySensor('mq2');
    
    const formatCalibration = (data) => ({
      sensor: data.sensor,
      baselineResistance: data.baseline_resistance,
      sensitivityFactor: data.sensitivity_factor,
      drift: data.drift,
      degradation: data.degradation,
      status: data.status,
      autoCalibrationEnabled: Boolean(data.auto_calibration_enabled),
      lastCalibration: data.last_calibration,
      manualCalibrationCount: data.manual_calibration_count
    });
    
    res.json({
      success: true,
      calibration: {
        mq6: mq6 ? formatCalibration(mq6) : null,
        mq2: mq2 ? formatCalibration(mq2) : null
      }
    });
  } catch (error) {
    console.error('Get calibration status error:', error);
    res.status(500).json({ error: 'Failed to retrieve calibration status' });
  }
});

// Get calibration status for specific sensor
router.get('/status/:sensor', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { sensor } = req.params;
    
    if (!['mq6', 'mq2'].includes(sensor)) {
      return res.status(400).json({ error: 'Invalid sensor' });
    }
    
    const data = await CalibrationData.getBySensor(sensor);
    
    if (!data) {
      return res.status(404).json({ error: 'Calibration data not found' });
    }
    
    res.json({
      success: true,
      calibration: {
        sensor: data.sensor,
        baselineResistance: data.baseline_resistance,
        sensitivityFactor: data.sensitivity_factor,
        drift: data.drift,
        degradation: data.degradation,
        status: data.status,
        autoCalibrationEnabled: Boolean(data.auto_calibration_enabled),
        lastCalibration: data.last_calibration,
        manualCalibrationCount: data.manual_calibration_count
      }
    });
  } catch (error) {
    console.error('Get calibration status error:', error);
    res.status(500).json({ error: 'Failed to retrieve calibration status' });
  }
});

// Run manual calibration
router.post('/calibrate/:sensor', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { sensor } = req.params;
    const { baselineResistance, sensitivityFactor } = req.body;
    
    if (!['mq6', 'mq2'].includes(sensor)) {
      return res.status(400).json({ error: 'Invalid sensor' });
    }
    
    const existing = await CalibrationData.getBySensor(sensor);
    const driftBefore = existing ? existing.drift : 0;
    
    // Update calibration data
    const updatedCalibration = await CalibrationData.updateCalibration(sensor, {
      baseline_resistance: baselineResistance,
      sensitivity_factor: sensitivityFactor,
      drift: 0, // Reset drift after calibration
      status: 'good'
    });
    
    // Increment manual calibration count
    await CalibrationData.incrementCalibrationCount(sensor);
    
    // Add to history with user tracking
    await CalibrationHistory.addRecord(sensor, {
      calibrationId: updatedCalibration.id,
      type: 'manual',
      baselineResistance,
      sensitivityFactor,
      driftBefore,
      driftAfter: 0,
      performedBy: req.user.id,
      status: 'success'
    });
    
    // Log the calibration
    await SystemLog.info('calibration', `Manual calibration completed for ${sensor.toUpperCase()}`, {
      source: 'calibration.calibrate',
      user: req.user.username,
      data: { sensor, baselineResistance, sensitivityFactor }
    });
    
    const finalData = await CalibrationData.getBySensor(sensor);
    
    res.json({
      success: true,
      message: 'Calibration completed successfully',
      calibration: {
        sensor: finalData.sensor,
        baselineResistance: finalData.baseline_resistance,
        sensitivityFactor: finalData.sensitivity_factor,
        drift: finalData.drift,
        degradation: finalData.degradation,
        status: finalData.status,
        autoCalibrationEnabled: Boolean(finalData.auto_calibration_enabled),
        lastCalibration: finalData.last_calibration,
        manualCalibrationCount: finalData.manual_calibration_count
      }
    });
  } catch (error) {
    console.error('Calibration error:', error);
    await SystemLog.error('calibration', 'Calibration error: ' + error.message, {
      source: 'calibration.calibrate',
      user: req.user.username
    });
    res.status(500).json({ error: 'Failed to perform calibration' });
  }
});

// Update calibration settings
router.put('/settings/:sensor', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { sensor } = req.params;
    const { baselineResistance, sensitivityFactor, autoCalibrationEnabled } = req.body;
    
    if (!['mq6', 'mq2'].includes(sensor)) {
      return res.status(400).json({ error: 'Invalid sensor' });
    }
    
    const updateData = {};
    if (baselineResistance !== undefined) updateData.baseline_resistance = baselineResistance;
    if (sensitivityFactor !== undefined) updateData.sensitivity_factor = sensitivityFactor;
    if (autoCalibrationEnabled !== undefined) updateData.auto_calibration_enabled = autoCalibrationEnabled ? 1 : 0;
    
    const updatedCalibration = await CalibrationData.updateCalibration(sensor, updateData);
    
    await SystemLog.info('calibration', `Calibration settings updated for ${sensor.toUpperCase()}`, {
      source: 'calibration.settings',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      calibration: {
        sensor: updatedCalibration.sensor,
        baselineResistance: updatedCalibration.baseline_resistance,
        sensitivityFactor: updatedCalibration.sensitivity_factor,
        drift: updatedCalibration.drift,
        degradation: updatedCalibration.degradation,
        status: updatedCalibration.status,
        autoCalibrationEnabled: Boolean(updatedCalibration.auto_calibration_enabled),
        lastCalibration: updatedCalibration.last_calibration,
        manualCalibrationCount: updatedCalibration.manual_calibration_count
      }
    });
  } catch (error) {
    console.error('Update calibration settings error:', error);
    res.status(500).json({ error: 'Failed to update calibration settings' });
  }
});

// Reset to factory defaults
router.post('/reset/:sensor', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { sensor } = req.params;
    
    if (!['mq6', 'mq2'].includes(sensor)) {
      return res.status(400).json({ error: 'Invalid sensor' });
    }
    
    // Reset to defaults
    const resetCalibration = await CalibrationData.updateCalibration(sensor, {
      baseline_resistance: 10.0,
      sensitivity_factor: 1.0,
      drift: 0,
      degradation: 'Normal',
      status: 'good',
      auto_calibration_enabled: 0,
      manual_calibration_count: 0
    });
    
    await SystemLog.warning('calibration', `Calibration reset to factory defaults for ${sensor.toUpperCase()}`, {
      source: 'calibration.reset',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Calibration reset to factory defaults',
      calibration: {
        sensor: resetCalibration.sensor,
        baselineResistance: resetCalibration.baseline_resistance,
        sensitivityFactor: resetCalibration.sensitivity_factor,
        drift: resetCalibration.drift,
        degradation: resetCalibration.degradation,
        status: resetCalibration.status,
        autoCalibrationEnabled: Boolean(resetCalibration.auto_calibration_enabled),
        lastCalibration: resetCalibration.last_calibration,
        manualCalibrationCount: resetCalibration.manual_calibration_count
      }
    });
  } catch (error) {
    console.error('Reset calibration error:', error);
    res.status(500).json({ error: 'Failed to reset calibration' });
  }
});

// Get calibration history
router.get('/history/:sensor', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { sensor } = req.params;
    const { limit = 10 } = req.query;
    
    if (!['mq6', 'mq2'].includes(sensor)) {
      return res.status(400).json({ error: 'Invalid sensor' });
    }
    
    // Use the new method that includes user information
    const allHistory = await CalibrationHistory.getHistoryWithUsers(100);
    const history = allHistory.filter(h => h.sensor === sensor).slice(0, parseInt(limit));
    
    const formattedHistory = history.map(record => ({
      timestamp: record.timestamp,
      type: record.type,
      baselineResistance: record.baseline_resistance,
      sensitivityFactor: record.sensitivity_factor,
      driftBefore: record.drift_before,
      driftAfter: record.drift_after,
      performedBy: record.performed_by_username || 'System',
      status: record.status
    }));
    
    res.json({
      success: true,
      history: formattedHistory
    });
  } catch (error) {
    console.error('Get calibration history error:', error);
    res.status(500).json({ error: 'Failed to retrieve calibration history' });
  }
});

module.exports = (db = null) => router;
