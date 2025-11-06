const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

// GPS Handling with async non-blocking operations
class GPSAsync extends EventEmitter {
  constructor() {
    super();
    this.isInitialized = false;
    this.isShuttingDown = false;
    this.port = null;
    this.parser = null;
    
    // Current GPS data
    this.currentData = {
      latitude: null,
      longitude: null,
      altitude: null,
      speed: null,
      course: null,
      timestamp: null,
      accuracy: null,
      hdop: null, // Horizontal Dilution of Precision (lower is better)
      satellites: 0,
      fix: false,
      fixQuality: 0 // 0=invalid, 1=GPS, 2=DGPS, 3=PPS, 4=RTK, 5=Float RTK
    };
    
    // Last known good location (persisted)
    this.lastKnownLocation = null;
    
    // GPS state
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 10;
    this.reconnectDelay = 5000; // 5 seconds
    this.reconnectTimer = null;
    
    this.signalStrength = 'none';
    this.acquisitionStartTime = null;
    this.timeToFirstFix = null;
    
    // Persistence
    this.persistenceFile = path.join(__dirname, '../../data/gps-last-known.json');
    this.autoSaveInterval = null;
    this.autoSaveDelay = 30000;
    
    this.nmeaBuffer = [];
    this.lastNMEATime = null;
    
    // GPS device paths
    this.possibleDevices = [
      '/dev/ttyAMA0',
      '/dev/serial0',
      '/dev/ttyUSB0',
      '/dev/ttyUSB1',
      '/dev/ttyACM0',
      '/dev/ttyS0'
    ];
  }


   // Initialize GPS with async non-blocking operations
  async initialize() {
    try {
      console.log(' Initializing GPS (async, non-blocking)...');
      
      // Load last known location from persistence
      await this.loadPersistedLocation();
      
      if (this.lastKnownLocation) {
        const age = this.getLocationAge();
        console.log(`Loaded last known location: ${this.lastKnownLocation.latitude.toFixed(6)}, ${this.lastKnownLocation.longitude.toFixed(6)} (${age} old)`);
      }
      
      // Start async GPS connection (non-blocking)
      this.startAsyncConnection();
      
      // Start auto-save interval
      this.startAutoSave();
      
      this.isInitialized = true;
      console.log('GPS initialized (connecting in background)');
      
    } catch (error) {
      console.error('GPS initialization error:', error.message);
      this.isInitialized = true;
      this.scheduleReconnect();
    }
  }

  // Start async GPS connection attempt (non-blocking)
  startAsyncConnection() {
    setImmediate(async () => {
      try {
        await this.connectToGPS();
      } catch (error) {
        console.log(`GPS connection attempt ${this.connectionAttempts} failed:`, error.message);
        this.scheduleReconnect();
      }
    });
  }

  // Attempt to connect to GPS device
  async connectToGPS() {
    this.connectionAttempts++;
    
    // Try each possible device
    for (const device of this.possibleDevices) {
      try {
        await fs.access(device);
        
        console.log(` Trying GPS device: ${device}`);
        
        this.port = new SerialPort({
          path: device,
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          autoOpen: false
        });
        
        // Set up parser
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        
        await new Promise((resolve, reject) => {
          this.port.open((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        console.log(` GPS connected on ${device}`);
        this.isConnected = true;
        this.connectionAttempts = 0;
        this.acquisitionStartTime = Date.now();
        
        // Set up NMEA parsing (async)
        this.setupNMEAParser();
        
        // Set up error handlers
        this.setupErrorHandlers();
        
        this.emit('connected', { device });
        return; // Success!
        
      } catch (error) {
        // Try next device
        continue;
      }
    }
    
    // No devices found
    throw new Error('No GPS device found on any serial port');
  }

  // Set up NMEA sentence parser (non-blocking async)
  setupNMEAParser() {
    this.parser.on('data', (line) => {
      setImmediate(() => {
        this.processNMEASentence(line);
      });
    });
  }

  // Process NMEA sentence (async, non-blocking)
  processNMEASentence(sentence) {
    try {
      this.lastNMEATime = Date.now();
      
      // Parse different NMEA sentence types
      if (sentence.startsWith('$GPGGA') || sentence.startsWith('$GNGGA')) {
        this.parseGGA(sentence);
      } else if (sentence.startsWith('$GPRMC') || sentence.startsWith('$GNRMC')) {
        this.parseRMC(sentence);
      } else if (sentence.startsWith('$GPGSA') || sentence.startsWith('$GNGSA')) {
        this.parseGSA(sentence);
      } else if (sentence.startsWith('$GPGSV') || sentence.startsWith('$GNGSV')) {
        this.parseGSV(sentence);
      }
      
      // Emit raw NMEA for debugging
      this.emit('nmea', sentence);
      
    } catch (error) {
      // Silently ignore parse errors (bad checksum, etc.)
    }
  }

  // Parse GGA sentence
  parseGGA(sentence) {
    const parts = sentence.split(',');
    if (parts.length < 15) return;
    
    const time = parts[1];
    const lat = parts[2];
    const latDir = parts[3];
    const lon = parts[4];
    const lonDir = parts[5];
    const quality = parseInt(parts[6]) || 0;
    const satellites = parseInt(parts[7]) || 0;
    const hdop = parseFloat(parts[8]) || null;
    const altitude = parseFloat(parts[9]) || null;
    
    // Convert lat/lon from DDMM.MMMM to decimal degrees
    const latitude = this.convertToDecimalDegrees(lat, latDir);
    const longitude = this.convertToDecimalDegrees(lon, lonDir);
    
    if (latitude !== null && longitude !== null) {
      const hasFix = quality > 0 && satellites >= 3;
      
      // Update current data
      this.currentData = {
        ...this.currentData,
        latitude,
        longitude,
        altitude,
        hdop,
        satellites,
        fixQuality: quality,
        fix: hasFix,
        timestamp: new Date()
      };
      
      // Calculate accuracy from HDOP
      if (hdop) {
        this.currentData.accuracy = this.calculateAccuracy(hdop, satellites);
      }
      
      // Update signal strength
      this.updateSignalStrength(quality, satellites, hdop);
      
      // If good fix, update last known location
      if (hasFix && this.isGoodFix()) {
        this.updateLastKnownLocation();
        
        // Track time to first fix
        if (!this.timeToFirstFix && this.acquisitionStartTime) {
          this.timeToFirstFix = Date.now() - this.acquisitionStartTime;
          console.log(` GPS first fix acquired in ${(this.timeToFirstFix / 1000).toFixed(1)}s`);
        }
      }
      
      // Emit update (non-blocking)
      setImmediate(() => {
        this.emit('data', this.getCurrentLocation());
      });
    }
  }

  // Parse RMC sentence
  parseRMC(sentence) {
    const parts = sentence.split(',');
    if (parts.length < 12) return;
    
    const status = parts[2]; // A=active, V=void
    const speed = parseFloat(parts[7]) || 0; // Speed in knots
    const course = parseFloat(parts[8]) || 0; // Course in degrees
    
    if (status === 'A') {
      this.currentData.speed = speed * 1.852; // Convert knots to km/h
      this.currentData.course = course;
    }
  }

  // Parse GSA sentence
  parseGSA(sentence) {
    const parts = sentence.split(',');
    if (parts.length < 18) return;
    
    const fixType = parseInt(parts[2]) || 0;
    const pdop = parseFloat(parts[15]) || null;
    const hdop = parseFloat(parts[16]) || null;
    const vdop = parseFloat(parts[17].split('*')[0]) || null;
    
    this.currentData.fix = fixType >= 2;
    if (hdop) this.currentData.hdop = hdop;
  }

  // Parse GSV sentence
  parseGSV(sentence) {
    // Track total satellites in view for signal strength calculation
    const parts = sentence.split(',');
    if (parts.length >= 4) {
      const totalSats = parseInt(parts[3]) || 0;
      if (totalSats > this.currentData.satellites) {
        this.currentData.satellites = totalSats;
      }
    }
  }

  // Convert NMEA lat/lon to decimal degrees
  convertToDecimalDegrees(coord, direction) {
    if (!coord || coord.length < 4) return null;
    
    // NMEA format: DDMM.MMMM or DDDMM.MMMM
    const dotIndex = coord.indexOf('.');
    if (dotIndex === -1) return null;
    
    let degrees, minutes;
    if (dotIndex === 4) {
      // Latitude: DDMM.MMMM
      degrees = parseInt(coord.substring(0, 2));
      minutes = parseFloat(coord.substring(2));
    } else if (dotIndex === 5) {
      // Longitude: DDDMM.MMMM
      degrees = parseInt(coord.substring(0, 3));
      minutes = parseFloat(coord.substring(3));
    } else {
      return null;
    }
    
    let decimal = degrees + (minutes / 60);
    
    // Apply direction
    if (direction === 'S' || direction === 'W') {
      decimal = -decimal;
    }
    
    return decimal;
  }

  // Calculate accuracy in meters from HDOP
  calculateAccuracy(hdop, satellites) {
    let baseAccuracy = hdop * 3;
    
    if (satellites >= 8) baseAccuracy *= 0.8;
    else if (satellites >= 6) baseAccuracy *= 1.0;
    else if (satellites >= 4) baseAccuracy *= 1.5;
    else baseAccuracy *= 2.0;
    
    return Math.round(baseAccuracy);
  }

  // Update signal strength assessment
  updateSignalStrength(quality, satellites, hdop) {
    if (quality === 0 || satellites < 3) {
      this.signalStrength = 'none';
    } else if (satellites >= 8 && hdop && hdop < 2) {
      this.signalStrength = 'excellent';
    } else if (satellites >= 6 && hdop && hdop < 3) {
      this.signalStrength = 'good';
    } else if (satellites >= 4 && hdop && hdop < 5) {
      this.signalStrength = 'fair';
    } else {
      this.signalStrength = 'poor';
    }
  }

  // Check if current fix is good enough to save
  isGoodFix() {
    return (
      this.currentData.fix &&
      this.currentData.satellites >= 4 &&
      this.currentData.fixQuality >= 1 &&
      this.currentData.hdop && this.currentData.hdop < 5 &&
      this.currentData.accuracy && this.currentData.accuracy < 50
    );
  }

  // Update last known good location
  updateLastKnownLocation() {
    this.lastKnownLocation = {
      latitude: this.currentData.latitude,
      longitude: this.currentData.longitude,
      altitude: this.currentData.altitude,
      accuracy: this.currentData.accuracy,
      satellites: this.currentData.satellites,
      hdop: this.currentData.hdop,
      signalStrength: this.signalStrength,
      timestamp: new Date()
    };
    
    setImmediate(() => {
      this.savePersistedLocation();
    });
  }

  // Get current location (with fallback to last known)
  getCurrentLocation() {
    if (this.currentData.fix && this.currentData.latitude && this.currentData.longitude) {
      return {
        ...this.currentData,
        source: 'live',
        signalStrength: this.signalStrength
      };
    } else if (this.lastKnownLocation) {
      return {
        ...this.lastKnownLocation,
        source: 'cached',
        age: this.getLocationAge()
      };
    } else {
      return null;
    }
  }

  // Get age of last known location
  getLocationAge() {
    if (!this.lastKnownLocation || !this.lastKnownLocation.timestamp) {
      return null;
    }
    
    const ageMs = Date.now() - new Date(this.lastKnownLocation.timestamp).getTime();
    const ageSeconds = Math.floor(ageMs / 1000);
    const ageMinutes = Math.floor(ageSeconds / 60);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);
    
    if (ageDays > 0) return `${ageDays}d`;
    if (ageHours > 0) return `${ageHours}h`;
    if (ageMinutes > 0) return `${ageMinutes}m`;
    return `${ageSeconds}s`;
  }

  // Load persisted location from disk (async)
  async loadPersistedLocation() {
    try {
      const data = await fs.readFile(this.persistenceFile, 'utf8');
      const parsed = JSON.parse(data);
      
      // Validate data
      if (parsed.latitude && parsed.longitude) {
        this.lastKnownLocation = {
          ...parsed,
          timestamp: new Date(parsed.timestamp)
        };
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  // Save current location to disk (async, non-blocking)
  async savePersistedLocation() {
    if (!this.lastKnownLocation) return;
    
    try {
      const data = JSON.stringify(this.lastKnownLocation, null, 2);
      await fs.writeFile(this.persistenceFile, data, 'utf8');
    } catch (error) {
      console.error('GPS persistence save error:', error.message);
    }
  }

  // Start auto-save interval
  startAutoSave() {
    this.autoSaveInterval = setInterval(() => {
      if (this.lastKnownLocation) {
        this.savePersistedLocation();
      }
    }, this.autoSaveDelay);
  }

  // Set up error handlers
  setupErrorHandlers() {
    if (!this.port) return;
    
    this.port.on('error', (error) => {
      console.error('GPS serial port error:', error.message);
      this.handleDisconnect();
    });
    
    this.port.on('close', () => {
      console.log(' GPS port closed');
      this.handleDisconnect();
    });
    
    this.staleCheckInterval = setInterval(() => {
      if (this.lastNMEATime && Date.now() - this.lastNMEATime > 30000) {
        console.log('[WARNING]  GPS data stale (no NMEA for 30s)');
        this.currentData.fix = false;
      }
    }, 10000);
  }

  // Handle GPS disconnect
  handleDisconnect() {
    this.isConnected = false;
    this.currentData.fix = false;
    
    if (this.port) {
      try {
        this.port.close();
      } catch (e) {}
      this.port = null;
    }
    
    this.parser = null;
    this.emit('disconnected');
    this.scheduleReconnect();
  }

  // Schedule reconnection attempt (non-blocking)
  scheduleReconnect() {
    if (this.isShuttingDown || this.reconnectTimer || this.connectionAttempts >= this.maxConnectionAttempts) {
      return;
    }
    
    console.log(`GPS reconnection attempt ${this.connectionAttempts + 1}/${this.maxConnectionAttempts} in ${this.reconnectDelay/1000}s`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startAsyncConnection();
    }, this.reconnectDelay);
  }

  // Get system status
  getStatus() {
    return {
      connected: this.isConnected,
      fix: this.currentData.fix,
      satellites: this.currentData.satellites,
      signalStrength: this.signalStrength,
      accuracy: this.currentData.accuracy,
      hdop: this.currentData.hdop,
      fixQuality: this.currentData.fixQuality,
      hasLastKnown: !!this.lastKnownLocation,
      lastKnownAge: this.getLocationAge(),
      timeToFirstFix: this.timeToFirstFix
    };
  }

  // Cleanup on shutdown
  async shutdown() {
    console.log('Shutting down GPS...');
    
    // Set shutdown flag to prevent reconnection
    this.isShuttingDown = true;
    
    // Save final location
    if (this.lastKnownLocation) {
      await this.savePersistedLocation();
    }
    
    // Clear intervals
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Close port
    if (this.port && this.port.isOpen) {
      await new Promise((resolve) => {
        this.port.close(() => resolve());
      });
    }
    
    console.log('GPS shutdown complete');
  }

  // Alias for shutdown() - for compatibility
  async cleanup() {
    return this.shutdown();
  }
}

module.exports = GPSAsync;
