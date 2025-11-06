class GasSensor {
  constructor(type, channel, adc) {
    this.type = type; // 'MQ2' or 'MQ6'
    this.channel = channel;
    this.adc = adc;
    this.isInitialized = false;
    
    // Calibration parameters
    this.calibration = {
      ro: 5000,
      slope: -0.5,
      intercept: 1.0,
      lastCalibrated: null
    };
    
    this.sensorParams = this.getSensorParams(type);
    
    // Preheating
    this.preheatTime = 60000; 
    this.preheatStartTime = null;
    this.isPreheated = false;
  }

  getSensorParams(type) {
    const params = {
      MQ2: {
        name: 'MQ-2 (LPG, Propane, Hydrogen, General Gases)',
        targetGas: 'LPG',
        sensitivity: 0.3,
        responseTime: 5, // seconds
        recoveryTime: 30, // seconds
        operatingVoltage: 5.0,
        heatingResistance: 44, // ohms
        loadResistance: 5 // kohms
      },
      MQ6: {
        name: 'MQ-6 (LPG, Butane)',
        targetGas: 'LPG',
        sensitivity: 0.3,
        responseTime: 5,
        recoveryTime: 30,
        operatingVoltage: 5.0,
        heatingResistance: 44,
        loadResistance: 5
      }
    };
    
    return params[type] || params.MQ2;
  }

  async initialize() {
    try {
      console.log(`Initializing ${this.type} sensor on channel ${this.channel}...`);
      
      // Start preheating
      this.startPreheating();
      
      this.isInitialized = true;
      console.log(`[OK] ${this.type} sensor initialized (preheating for ${this.preheatTime/1000}s)`);
      
    } catch (error) {
      console.error(`${this.type} sensor initialization failed:`, error);
      throw error;
    }
  }

  startPreheating() {
    this.preheatStartTime = new Date();
    this.isPreheated = false;
    
    setTimeout(() => {
      this.isPreheated = true;
      console.log(`[OK] ${this.type} sensor preheating completed`);
    }, this.preheatTime);
  }

  async read() {
    if (!this.isInitialized) {
      throw new Error(`${this.type} sensor not initialized`);
    }

    if (!this.isPreheated) {
      const elapsed = new Date() - this.preheatStartTime;
      const remaining = Math.max(0, this.preheatTime - elapsed);
      throw new Error(`${this.type} sensor still preheating. ${Math.ceil(remaining/1000)}s remaining`);
    }

    try {
      // Read raw ADC value
      const adcReading = await this.adc.readChannel(this.channel);
      const rawValue = adcReading.raw;
      const voltage = adcReading.voltage;
      
      // Convert to resistance
      const resistance = this.calculateResistance(voltage);
      
      // Convert to PPM using calibration curve
      const ppm = this.calculatePPM(resistance);
      
      // Apply sensor-specific corrections
      const correctedPpm = this.applySensorCorrections(ppm);
      
      return {
        raw: rawValue,
        voltage: voltage,
        resistance: resistance,
        ppm: Math.max(0, correctedPpm), // Ensure non-negative
        timestamp: new Date(),
        sensor: this.type,
        preheated: this.isPreheated
      };
      
    } catch (error) {
      throw new Error(`Failed to read ${this.type} sensor: ${error.message}`);
    }
  }

  calculateResistance(voltage) {
    // RL = (Vc - Vout) * RL / Vout
    // Where Vc is the circuit voltage (5V), Vout is the measured voltage
    const vc = 5.0; // Circuit voltage
    const rl = this.calibration.ro; // Load resistance (5kΩ for MQ sensors)
    
    // Handle edge cases properly
    if (voltage <= 0.01) return 1000000; // Very high resistance (no gas)
    if (voltage >= 4.9) return 100; // Very low resistance (high gas)
    
    const resistance = ((vc - voltage) * rl) / voltage;
    return Math.max(100, Math.min(1000000, resistance)); // Clamp between 100Ω and 1MΩ
  }

  calculatePPM(resistance) {
    // MQ sensors have inverse relationship: lower resistance = higher gas concentration
    
    if (resistance <= 0 || resistance >= 1000000) return 0;
    
    // Calculate Rs/Ro ratio
    const ratio = resistance / this.calibration.ro;
    
    // Prevent division by zero
    if (ratio <= 0) return 0;
    
    let ppm = 0;
    
    if (this.type === 'MQ6') {
      // MQ6: LPG, Butane detection
      // Simplified curve: PPM = a / (Rs/Ro)^b
      // When Rs/Ro = 1 (clean air), PPM should be ~0
      // When Rs/Ro = 0.1 (high gas), PPM should be ~1000+
      const a = 1000;  // Scaling factor
      const b = 2.5;   // Power factor
      ppm = a / Math.pow(ratio, b);
      
    } else if (this.type === 'MQ2') {
      // MQ2: LPG, Propane, Hydrogen, Smoke detection
      // Similar curve but different parameters
      const a = 800;   // Scaling factor
      const b = 2.2;   // Power factor
      ppm = a / Math.pow(ratio, b);
    }
    
    // Clamp PPM to reasonable range (0-10000 ppm)
    return Math.max(0, Math.min(10000, ppm));
  }

  applySensorCorrections(ppm) {
    // Apply sensor-specific sensitivity and environmental corrections
    const corrected = ppm * this.sensorParams.sensitivity;
    
    // Temperature compensation
    const tempCompensation = 1.0;
    
    return corrected * tempCompensation;
  }

  async calibrate(cleanAirResistance) {
    if (!this.isInitialized) {
      throw new Error(`${this.type} sensor not initialized`);
    }

    if (!this.isPreheated) {
      throw new Error(`${this.type} sensor must be preheated before calibration`);
    }

    try {
      // Update calibration parameters
      this.calibration.ro = cleanAirResistance;
      this.calibration.lastCalibrated = new Date();
      
      console.log(`[OK] ${this.type} sensor calibrated with Ro = ${cleanAirResistance} ohms`);
      
      return {
        ro: this.calibration.ro,
        timestamp: this.calibration.lastCalibrated,
        sensor: this.type
      };
      
    } catch (error) {
      throw new Error(`Calibration failed for ${this.type} sensor: ${error.message}`);
    }
  }

  async autoCalibrate() {
    if (!this.isInitialized || !this.isPreheated) {
      throw new Error(`${this.type} sensor not ready for calibration`);
    }

    console.log(`Auto-calibrating ${this.type} sensor in clean air...`);
    
    // Take multiple readings and average them
    const readings = [];
    const numReadings = 10;
    
    for (let i = 0; i < numReadings; i++) {
      const reading = await this.read();
      readings.push(reading.resistance);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between readings
    }
    
    // Calculate average resistance in clean air
    const avgResistance = readings.reduce((sum, r) => sum + r, 0) / readings.length;
    
    // Calibrate with the average
    await this.calibrate(avgResistance);
    
    return {
      ro: this.calibration.ro,
      readings: readings,
      average: avgResistance,
      timestamp: new Date()
    };
  }

  getCalibrationInfo() {
    return {
      sensor: this.type,
      calibration: this.calibration,
      preheated: this.isPreheated,
      preheatProgress: this.isPreheated ? 100 : 
        Math.min(100, ((new Date() - this.preheatStartTime) / this.preheatTime) * 100)
    };
  }

  async test() {
    if (!this.isInitialized) {
      throw new Error(`${this.type} sensor not initialized`);
    }

    console.log(`Testing ${this.type} sensor...`);
    
    try {
      const reading = await this.read();
      console.log(`${this.type} reading: ${reading.ppm.toFixed(2)} ppm (${reading.voltage.toFixed(2)}V)`);
      return reading;
    } catch (error) {
      if (error.message.includes('preheating')) {
        console.log(`[WARNING]  ${this.type} sensor still preheating`);
        return { preheating: true, remaining: error.message };
      }
      throw error;
    }
  }

  async cleanup() {
    this.isInitialized = false;
    this.isPreheated = false;
    console.log(`[OK] ${this.type} sensor cleanup completed`);
  }
}

module.exports = GasSensor;
