const EventEmitter = require('events');
const { SensorData, Alert, Contact } = require('../database/models');
const alertManager = require('../services/alertManager');

let MCP3008, GPS, LEDController, BuzzerController, GasSensor;

if (process.platform === 'linux') {
  // Only import hardware-specific modules on Linux/Raspberry Pi
  MCP3008 = require('./mcp3008');
  GPS = require('./gpsAsync'); 
  LEDController = require('./ledController');
  BuzzerController = require('./buzzerController');
  GasSensor = require('./gasSensor');
} else {
  // Use mock implementations for development
  MCP3008 = require('./mcp3008');
  GPS = require('./gpsAsync');
  LEDController = require('./ledController');
  BuzzerController = require('./buzzerController');
  GasSensor = require('./gasSensor');
}

class HardwareManager extends EventEmitter {
  constructor() {
    super();
    this.isInitialized = false;
    this.components = {
      mcp3008: null,
      gps: null,
      leds: null,
      buzzer: null,
      mq2: null,
      mq6: null
    };
    this.sensorData = {
      mq6: { raw: 0, ppm: 0, timestamp: null },
      mq2: { raw: 0, ppm: 0, timestamp: null }
    };
    this.gpsData = {
      latitude: null,
      longitude: null,
      accuracy: null,
      timestamp: null,
      address: null
    };
    this.systemStatus = {
      online: false,
      lastUpdate: null,
      errors: []
    };
    
    // Sensor reading interval
    this.readingInterval = null;
    this.readingIntervalMs = 2000;
    
    // Alert levels 
    this.alertLevels = {
      normal: { min: 0, max: 99, color: 'green' },
      low: { min: 100, max: 299, color: 'yellow' },
      critical: { min: 300, max: Infinity, color: 'red' }
    };
    
    this.currentAlertLevel = 'normal';
  }

  async initialize() {
    try {
      console.log('Initializing hardware components...');
      
      // Initialize MCP3008 ADC
      this.components.mcp3008 = new MCP3008();
      await this.components.mcp3008.initialize();
      console.log('MCP3008 ADC initialized');
      
      // Initialize GPS
      try {
        this.components.gps = new GPS();
        await this.components.gps.initialize();
        console.log('GPS module initialized');
      } catch (error) {
        console.log('[WARNING] GPS module not available currently:', error.message);
        this.components.gps = null;
      }
      
      // Initialize LED controller
      this.components.leds = new LEDController();
      await this.components.leds.initialize();
      console.log('LED controller initialized');
      
      // Initialize buzzer controller
      this.components.buzzer = new BuzzerController();
      await this.components.buzzer.initialize();
      console.log('Buzzer controller initialized');
      
      // Initialize gas sensors
      this.components.mq6 = new GasSensor('MQ6', 0, this.components.mcp3008); // Channel 0
      this.components.mq2 = new GasSensor('MQ2', 1, this.components.mcp3008); // Channel 1
      
      await this.components.mq6.initialize();
      await this.components.mq2.initialize();
      console.log('Gas sensors initialized');
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start sensor reading loop
      this.startSensorReading();
      
      this.isInitialized = true;
      this.systemStatus.online = true;
      this.systemStatus.lastUpdate = new Date();
      
      console.log(' All hardware components initialized successfully');
      this.emit('hardwareReady');
      
    } catch (error) {
      console.error('Hardware initialization failed:', error);
      this.systemStatus.errors.push({
        timestamp: new Date(),
        component: 'hardware',
        error: error.message
      });
      throw error;
    }
  }

  setupEventListeners() {
    // GPS data updates
    if (this.components.gps) {
      this.components.gps.on('data', (data) => {
        // Merge GPS position data with status
        const gpsStatus = this.components.gps.getStatus ? this.components.gps.getStatus() : {};
        this.gpsData = { 
          ...data, 
          timestamp: new Date(),
          satellites: gpsStatus.satellites || 0,
          fix: gpsStatus.fix || false,
          signalStrength: gpsStatus.signalStrength || 'none',
          connected: gpsStatus.connected || false
        };
        this.emit('gpsUpdate', this.gpsData);
      });

      // GPS error handling
      this.components.gps.on('error', (error) => {
        console.error('GPS error:', error);
        this.systemStatus.errors.push({
          timestamp: new Date(),
          component: 'gps',
          error: error.message
        });
      });
    } else {
      console.log('GPS event listeners skipped (GPS not available)');
    }
  }

  startSensorReading() {
    if (this.readingInterval) {
      clearInterval(this.readingInterval);
    }

    this.readingInterval = setInterval(async () => {
      try {
        await this.readSensorData();
      } catch (error) {
        console.error('Sensor reading error:', error);
        this.systemStatus.errors.push({
          timestamp: new Date(),
          component: 'sensors',
          error: error.message
        });
      }
    }, this.readingIntervalMs);
  }

  async readSensorData() {
    if (!this.isInitialized) return;

    try {
      // Check if sensors are preheated before reading
      const mq6Status = this.components.mq6.getCalibrationInfo();
      const mq2Status = this.components.mq2.getCalibrationInfo();
      
      if (!mq6Status.preheated || !mq2Status.preheated) {
        // Sensors still preheating, use raw ADC readings
        const mq6Raw = await this.components.mcp3008.readChannel(0);
        const mq2Raw = await this.components.mcp3008.readChannel(1);
        
        this.sensorData.mq6 = {
          raw: mq6Raw.raw,
          ppm: 0,
          timestamp: new Date()
        };
        
        this.sensorData.mq2 = {
          raw: mq2Raw.raw,
          ppm: 0,
          timestamp: new Date()
        };
        
        this.currentAlertLevel = 'normal';
        this.systemStatus.lastUpdate = new Date();
        this.emit('sensorData', this.sensorData);
        return;
      }

      // Read MQ6 sensor (Channel 0)
      let mq6Data = { raw: 0, ppm: 0 };
      try {
        mq6Data = await this.components.mq6.read();
        this.sensorData.mq6 = {
          raw: mq6Data.raw,
          ppm: mq6Data.ppm,
          timestamp: new Date()
        };
      } catch (error) {
        console.error('[MQ6 READ ERROR]:', error.message);
        // Keep last valid data or use zeros
        if (!this.sensorData.mq6) {
          this.sensorData.mq6 = { raw: 0, ppm: 0, timestamp: new Date() };
        }
      }

      // Read MQ2 sensor (Channel 1)
      let mq2Data = { raw: 0, ppm: 0 };
      try {
        mq2Data = await this.components.mq2.read();
        this.sensorData.mq2 = {
          raw: mq2Data.raw,
          ppm: mq2Data.ppm,
          timestamp: new Date()
        };
      } catch (error) {
        console.error('[MQ2 READ ERROR]:', error.message);
        // Keep last valid data or use zeros
        if (!this.sensorData.mq2) {
          this.sensorData.mq2 = { raw: 0, ppm: 0, timestamp: new Date() };
        }
      }

      // Sensor fusion and evaluation
      const fusedData = this.evaluateSensorData(mq6Data, mq2Data);
      this.sensorData.fused = fusedData;

      // Determine alert level using smart evaluation
      const newAlertLevel = this.determineSmartAlertLevel(fusedData);
      
      // Handle alert level changes
      if (newAlertLevel !== this.currentAlertLevel) {
        const previousLevel = this.currentAlertLevel;
        this.currentAlertLevel = newAlertLevel;
        
        // Log both sensor readings when alert level changes
        console.log(`[SENSORS] MQ6: ${mq6Data.ppm.toFixed(1)} PPM, MQ2: ${mq2Data.ppm.toFixed(1)} PPM, Gas Type: ${fusedData.gasType}`);
        
        // Process alert change
        setImmediate(() => {
          this.handleAlertLevelChange(newAlertLevel, previousLevel, fusedData.maxPpm);
        });
      }

      this.systemStatus.lastUpdate = new Date();
      
      // Emit sensor data
      setImmediate(() => {
        this.emit('sensorData', this.sensorData);
      });
      
    } catch (error) {
      // Only log preheating errors once
      if (!error.message.includes('preheating') || !this.lastPreheatLog) {
        console.error('Sensor reading error:', error.message);
        this.lastPreheatLog = error.message.includes('preheating');
      }
    }
  }

  determineAlertLevel(ppm) {
    if (ppm >= this.alertLevels.critical.min) return 'critical';
    if (ppm >= this.alertLevels.low.min) return 'low';
    return 'normal';
  }

  // Smart sensor fusion and evaluation
  evaluateSensorData(mq6Data, mq2Data) {
    const timestamp = new Date();
    
    // Basic statistics
    const maxPpm = Math.max(mq6Data.ppm, mq2Data.ppm);
    const avgPpm = (mq6Data.ppm + mq2Data.ppm) / 2;
    const minPpm = Math.min(mq6Data.ppm, mq2Data.ppm);
    
    // Gas type detection based on sensor characteristics
    const gasType = this.detectGasType(mq6Data, mq2Data);
    
    // Confidence scoring (0-100%)
    const confidence = this.calculateConfidence(mq6Data, mq2Data);
    
    // Risk assessment
    const riskLevel = this.assessRisk(mq6Data, mq2Data, gasType);
    
    // Sensor agreement analysis
    const agreement = this.analyzeSensorAgreement(mq6Data, mq2Data);
    
    return {
      timestamp,
      maxPpm,
      avgPpm,
      minPpm,
      gasType,
      confidence,
      riskLevel,
      agreement,
      mq6Contribution: this.calculateSensorContribution(mq6Data, 'mq6'),
      mq2Contribution: this.calculateSensorContribution(mq2Data, 'mq2'),
      recommendation: this.generateRecommendation(gasType, riskLevel, confidence)
    };
  }

  detectGasType(mq6Data, mq2Data) {
    const mq6Ratio = mq6Data.ppm / Math.max(mq2Data.ppm, 1);
    const mq2Ratio = mq2Data.ppm / Math.max(mq6Data.ppm, 1);
    
    // MQ6 is highly sensitive to LPG/Butane
    if (mq6Ratio > 1.5 && mq6Data.ppm > 50) {
      return 'LPG/Butane';
    }
    
    // MQ2 is better for smoke detection
    if (mq2Ratio > 2.0 && mq2Data.ppm > 30) {
      return 'Smoke/Fire';
    }
    
    // Both sensors detecting - likely LPG/Propane
    if (mq6Data.ppm > 20 && mq2Data.ppm > 20) {
      return 'LPG/Propane';
    }
    
    // MQ2 detecting alone - could be various gases
    if (mq2Data.ppm > 10 && mq6Data.ppm < 10) {
      return 'Other Gases';
    }
    
    return 'Clean Air';
  }

  calculateConfidence(mq6Data, mq2Data) {
    const maxPpm = Math.max(mq6Data.ppm, mq2Data.ppm);
    const minPpm = Math.min(mq6Data.ppm, mq2Data.ppm);
    
    // Base confidence on PPM levels
    let confidence = 0;
    if (maxPpm > 100) confidence += 40;
    else if (maxPpm > 50) confidence += 30;
    else if (maxPpm > 20) confidence += 20;
    else if (maxPpm > 5) confidence += 10;
    
    // Boost confidence if both sensors agree
    if (minPpm > 5 && maxPpm > 0) {
      const agreement = minPpm / maxPpm;
      confidence += agreement * 30;
    }
    
    // Boost confidence for high readings
    if (maxPpm > 200) confidence += 20;
    
    return Math.min(100, Math.max(0, confidence));
  }

  assessRisk(mq6Data, mq2Data, gasType) {
    const maxPpm = Math.max(mq6Data.ppm, mq2Data.ppm);
    
    // Risk multipliers
    const riskMultipliers = {
      'LPG/Butane': 1.2,
      'LPG/Propane': 1.1,
      'Smoke/Fire': 1.5,
      'Other Gases': 0.8,
      'Clean Air': 0.1
    };
    
    const baseRisk = maxPpm * (riskMultipliers[gasType] || 1.0);
    
    if (baseRisk > 300) return 'HIGH';
    if (baseRisk > 150) return 'MEDIUM';
    if (baseRisk > 50) return 'LOW';
    return 'MINIMAL';
  }

  analyzeSensorAgreement(mq6Data, mq2Data) {
    const maxPpm = Math.max(mq6Data.ppm, mq2Data.ppm);
    const minPpm = Math.min(mq6Data.ppm, mq2Data.ppm);
    
    if (maxPpm === 0) return 'PERFECT';
    
    const agreement = minPpm / maxPpm;
    
    if (agreement > 0.8) return 'EXCELLENT';
    if (agreement > 0.6) return 'GOOD';
    if (agreement > 0.4) return 'FAIR';
    if (agreement > 0.2) return 'POOR';
    return 'DISAGREEMENT';
  }

  calculateSensorContribution(sensorData, sensorType) {
    const ppm = sensorData.ppm;
    
    if (sensorType === 'mq6') {
      if (ppm > 100) return 'HIGH';
      if (ppm > 50) return 'MEDIUM';
      if (ppm > 20) return 'LOW';
      return 'NONE';
    } else {
      if (ppm > 80) return 'HIGH';
      if (ppm > 40) return 'MEDIUM';
      if (ppm > 15) return 'LOW';
      return 'NONE';
    }
  }

  generateRecommendation(gasType, riskLevel, confidence) {
    if (riskLevel === 'HIGH' && confidence > 70) {
      return 'IMMEDIATE_EVACUATION';
    }
    if (riskLevel === 'MEDIUM' && confidence > 60) {
      return 'INVESTIGATE_SOURCE';
    }
    if (riskLevel === 'LOW' && confidence > 50) {
      return 'MONITOR_CLOSELY';
    }
    if (confidence < 30) {
      return 'VERIFY_READING';
    }
    return 'NORMAL_OPERATION';
  }

  // Alert level determination
  determineSmartAlertLevel(fusedData) {
    const { maxPpm, gasType, riskLevel, confidence, agreement } = fusedData;
    
    // High confidence + high risk = critical
    if (confidence > 70 && riskLevel === 'HIGH') {
      return 'critical';
    }
    
    // Medium confidence + medium risk = low alert
    if (confidence > 50 && riskLevel === 'MEDIUM') {
      return 'low';
    }
    
    // High PPM with good sensor agreement = critical
    if (maxPpm > 200 && agreement === 'EXCELLENT') {
      return 'critical';
    }
    
    // Medium PPM with good agreement = low
    if (maxPpm > 100 && agreement === 'GOOD') {
      return 'low';
    }
    
    // Fallback to simple PPM-based detection
    return this.determineAlertLevel(maxPpm);
  }

  async handleAlertLevelChange(level, previousLevel, ppm) {
    console.log(`Alert: ${previousLevel} -> ${level} (${ppm.toFixed(1)} ppm)`);
    
    // Process changes
    try {
      // Update alert manager with current detection level
      alertManager.updateAlertLevel(level, {
        mq6: this.sensorData.mq6,
        mq2: this.sensorData.mq2,
        fused: this.sensorData.fused,
        gpsData: this.gpsData
      }).catch(err => {
        console.error('[ALERT MANAGER] Error:', err.message);
      });
      
      // Save sensor data and alert to database
      if (level === 'low' || level === 'critical') {
        this.saveSensorDataAndAlert(level).catch(err => {
          console.error('[DATABASE] Failed to save alert:', err.message);
        });
      }
      
      switch (level) {
        case 'normal':
          console.log('[REALTIME] Gas cleared - stopping buzzer and LED immediately (no hold time)');
          
          // Stop buzzer
          this.components.buzzer.stop().catch(e => console.error('Buzzer stop error:', e.message));
          
          // Change LED to green
          this.components.leds.setColor('green').catch(e => console.error('LED error:', e.message));
          console.log('[LED] Green LED ON (Normal) - INSTANT');
          break;
          
        case 'low':
          // LED change
          this.components.leds.setColor('yellow').catch(e => console.error('LED error:', e.message));
          
          // Start/continue low alert buzzer
          this.components.buzzer.start('low').catch(e => console.error('Buzzer error:', e.message));
          console.log('LOW ALERT: Rapid beeping (beep-beep-beep-beep)');
          break;
          
        case 'critical':
          // LED change
          this.components.leds.setColor('red').catch(e => console.error('LED error:', e.message));
          
          // Start/continue critical alert
          this.components.buzzer.start('critical').catch(e => console.error('Buzzer error:', e.message));
          console.log('CRITICAL ALERT: Long continuous beeping (BEEEEP-BEEEEP)');
          
          // Emit critical alert
          setImmediate(() => {
            this.emit('criticalAlert', {
              level: 'critical',
              ppm: ppm,
              timestamp: new Date(),
              gps: this.gpsData
            });
          });
          break;
      }
      
      // Emit alert level change
      setImmediate(() => {
        this.emit('alertLevelChange', {
          level: level,
          previousLevel: previousLevel,
          ppm: ppm,
          timestamp: new Date()
        });
      });
      
    } catch (error) {
      console.error('Alert handling error:', error.message);
    }
  }

  // Save sensor data and create alert in database
  async saveSensorDataAndAlert(alertLevel) {
    try {
      // Map risk level to database values
      const riskLevelMap = {
        'HIGH': 'critical',
        'MEDIUM': 'low',
        'LOW': 'low',
        'MINIMAL': 'normal'
      };
      
      const rawRiskLevel = this.sensorData.fused?.riskLevel || 'MINIMAL';
      const mappedRiskLevel = riskLevelMap[rawRiskLevel] || 'normal';
      
      // Save sensor reading to database
      const sensorDataRecord = await SensorData.create({
        mq6_ppm: this.sensorData.mq6?.ppm || 0,
        mq6_raw: this.sensorData.mq6?.raw || 0,
        mq2_ppm: this.sensorData.mq2?.ppm || 0,
        mq2_raw: this.sensorData.mq2?.raw || 0,
        gas_type: this.sensorData.fused?.gasType || 'Unknown',
        risk_level: mappedRiskLevel,
        alert_level: alertLevel,
        gps_latitude: this.gpsData.latitude,
        gps_longitude: this.gpsData.longitude
      });

      console.log(`[DATABASE] Sensor data saved (ID: ${sensorDataRecord.id})`);

      // Get emergency contacts for SMS notifications
      const contacts = await Contact.getEmergencyContacts();
      
      // Create alert record
      const alert = await Alert.createAlert(
        sensorDataRecord.id,
        alertLevel,
        contacts
      );

      console.log(`[DATABASE] Alert created (ID: ${alert.id}, Level: ${alertLevel})`);

      return { sensorDataRecord, alert };
    } catch (error) {
      console.error('[DATABASE] Error saving sensor data/alert:', error);
      throw error;
    }
  }

  // Set alert thresholds
  async setAlertThresholds(thresholds) {
    this.alertLevels = {
      normal: { min: 0, max: thresholds.low - 1, color: 'green' },
      low: { min: thresholds.low, max: thresholds.critical - 1, color: 'yellow' },
      critical: { min: thresholds.critical, max: Infinity, color: 'red' }
    };
  }

  async testHardware() {
    const results = {
      mcp3008: false,
      gps: false,
      leds: false,
      buzzer: false,
      mq2: false,
      mq6: false
    };

    try {
      // Test MCP3008
      await this.components.mcp3008.test();
      results.mcp3008 = true;
    } catch (error) {
      console.error('MCP3008 test failed:', error);
    }

    try {
      // Test GPS
      if (this.components.gps) {
        const gpsTest = await this.components.gps.getStatus();
        results.gps = gpsTest.connected;
      } else {
        results.gps = false;
      }
    } catch (error) {
      console.error('GPS test failed:', error);
    }

    try {
      // Test LEDs
      await this.components.leds.test();
      results.leds = true;
    } catch (error) {
      console.error('LED test failed:', error);
    }

    try {
      // Test buzzer
      await this.components.buzzer.test();
      results.buzzer = true;
    } catch (error) {
      console.error('Buzzer test failed:', error);
    }

    try {
      // Test gas sensors
      const mq6Status = this.components.mq6.getCalibrationInfo();
      if (mq6Status.preheated) {
        await this.components.mq6.read();
        results.mq6 = true;
      } else {
        console.log('MQ6 still preheating - skipping test');
        results.mq6 = false;
      }
    } catch (error) {
      console.error('MQ6 test failed:', error);
    }

    try {
      const mq2Status = this.components.mq2.getCalibrationInfo();
      if (mq2Status.preheated) {
        await this.components.mq2.read();
        results.mq2 = true;
      } else {
        console.log('MQ2 still preheating - skipping test');
        results.mq2 = false;
      }
    } catch (error) {
      console.error('MQ2 test failed:', error);
    }

    return results;
  }

  async acknowledgeAlert() {
    await this.components.buzzer.stop();
    this.emit('alertAcknowledged', {
      timestamp: new Date(),
      level: this.currentAlertLevel
    });
  }

  getAlertManagerState() {
    return alertManager.getState();
  }

  getSystemStatus() {
    const now = new Date();
    const timeSinceStart = this.startTime ? (now - this.startTime) / 1000 : 0;
    
    // Merge GPS data with GPS status
    let enhancedGpsData = { ...this.gpsData };
    if (this.components.gps && this.components.gps.getStatus) {
      const gpsStatus = this.components.gps.getStatus();
      enhancedGpsData = {
        ...enhancedGpsData,
        satellites: gpsStatus.satellites || 0,
        fix: gpsStatus.fix || false,
        signalStrength: gpsStatus.signalStrength || 'none',
        accuracy: gpsStatus.accuracy || enhancedGpsData.accuracy,
        connected: gpsStatus.connected || false,
        hdop: gpsStatus.hdop,
        fixQuality: gpsStatus.fixQuality
      };
      
      // Add last known location
      if (this.components.gps.lastKnownLocation) {
        enhancedGpsData.lastKnownLocation = this.components.gps.lastKnownLocation;
        enhancedGpsData.locationAge = gpsStatus.lastKnownAge;
      }
    }
    
    return {
      ...this.systemStatus,
      timestamp: now,
      currentAlertLevel: this.currentAlertLevel,
      sensorData: this.sensorData,
      gpsData: enhancedGpsData,
      alertLevels: this.alertLevels,
      hardwareStatus: {
        initialized: this.isInitialized,
        timeSinceStart: timeSinceStart,
        platform: process.platform,
        isDevelopment: process.platform !== 'linux',
        components: Object.keys(this.components).reduce((acc, key) => {
          const component = this.components[key];
          if (!component) {
            acc[key] = { status: 'not initialized', ready: false };
          } else if (component.getStatus) {
            acc[key] = { status: 'ready', ready: true, ...component.getStatus() };
          } else {
            acc[key] = { status: 'ready', ready: true };
          }
          return acc;
        }, {})
      },
      systemHealth: {
        overall: this.isInitialized ? 'healthy' : 'initializing',
        sensors: this.getSensorHealth(),
        gps: this.getGPSHealth(),
        alerts: this.getAlertHealth()
      }
    };
  }

  getSensorHealth() {
    const mq6Healthy = this.sensorData.mq6 && this.sensorData.mq6.ppm !== null;
    const mq2Healthy = this.sensorData.mq2 && this.sensorData.mq2.ppm !== null;
    
    if (mq6Healthy && mq2Healthy) return 'healthy';
    if (mq6Healthy || mq2Healthy) return 'partial';
    return 'unhealthy';
  }

  getGPSHealth() {
    if (!this.components.gps) return 'not_connected';
    
    const gpsStatus = this.components.gps.getStatus ? this.components.gps.getStatus() : {};
    
    if (gpsStatus.connected && gpsStatus.fix) return 'healthy';
    if (gpsStatus.connected && gpsStatus.signalStrength !== 'none') return 'acquiring';
    if (gpsStatus.connected) return 'connected';
    return 'disconnected';
  }

  getAlertHealth() {
    switch (this.currentAlertLevel) {
      case 'normal': return 'safe';
      case 'low': return 'warning';
      case 'critical': return 'danger';
      default: return 'unknown';
    }
  }

  async cleanup() {
    console.log('Cleaning up hardware...');
    
    if (this.readingInterval) {
      clearInterval(this.readingInterval);
      this.readingInterval = null;
    }

    if (this.components.leds) {
      await this.components.leds.cleanup();
    }

    if (this.components.buzzer) {
      await this.components.buzzer.cleanup();
    }

    if (this.components.gps) {
      await this.components.gps.cleanup();
    }

    if (this.components.mcp3008) {
      await this.components.mcp3008.cleanup();
    }

    this.isInitialized = false;
    console.log('Hardware cleanup completed');
  }
}

module.exports = HardwareManager;
