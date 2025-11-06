const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class GPS extends EventEmitter {
  constructor() {
    super();
    this.isInitialized = false;
    this.port = null;
    this.parser = null;
    this.currentData = {
      latitude: null,
      longitude: null,
      altitude: null,
      speed: null,
      course: null,
      timestamp: null,
      accuracy: null,
      satellites: 0,
      fix: false
    };
    this.lastValidFix = null;
    this.lastKnownLocation = {
      latitude: null,
      longitude: null,
      altitude: null,
      timestamp: null,
      accuracy: null
    };
    this.fixTimeout = 30000;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.reconnectInterval = null;
    this.isConnected = false;
    this.signalStrength = 'none';
    this.acquisitionTime = null;
    this.startTime = new Date();
    this.persistenceFile = path.join(__dirname, '../../data/gps-persistence.json');
  }

  async initialize() {
    try {
      if (process.platform !== 'linux') {
        console.log('[WARNING]  Running in development mode - GPS using mock implementation');
        this.isInitialized = true;
        this.isConnected = true;
        this.startTime = new Date();

        // Set up mock GPS data
        this.startMockGPS();
        console.log('[OK] GPS initialized (mock mode)');

        this.currentData = {
          latitude: 14.654103,
          longitude: 120.960309,
          altitude: 0,
          speed: 0,
          course: 0,
          timestamp: new Date(),
          accuracy: 0,
          satellites: 3,
          fix: true
        };

        this.lastKnownLocation = { ...this.currentData };
        console.log(`Mock GPS location: ${this.currentData.latitude.toFixed(6)}, ${this.currentData.longitude.toFixed(6)}`);
        return;
      }

      await this.loadPersistedData();

      await this.connectToGPS();
      this.isInitialized = true;
      this.isConnected = true;
      this.startTime = new Date();
      console.log(`[OK] GPS initialized and connected`);

      if (this.lastKnownLocation.latitude && this.lastKnownLocation.longitude) {
        const age = this.getLocationAge();
        console.log(`Last known location: ${this.lastKnownLocation.latitude.toFixed(6)}, ${this.lastKnownLocation.longitude.toFixed(6)} (${age})`);
      }

    } catch (error) {
      console.error('GPS initialization failed:', error);
      this.isConnected = false;
      this.scheduleReconnect();
      throw error;
    }
  }

  startMockGPS() {
    this.mockInterval = setInterval(() => {
      const latVariation = (Math.random() - 0.5) * 0.001;
      const lngVariation = (Math.random() - 0.5) * 0.001;

      this.currentData.latitude += latVariation;
      this.currentData.longitude += lngVariation;
      this.currentData.timestamp = new Date();

      this.emit('data', {
        latitude: this.currentData.latitude,
        longitude: this.currentData.longitude,
        altitude: this.currentData.altitude,
        accuracy: this.currentData.accuracy,
        timestamp: this.currentData.timestamp,
        satellites: this.currentData.satellites,
        fix: this.currentData.fix,
        address: 'Mock Location - Development Mode'
      });
    }, 5000);
  }

  async connectToGPS() {
    // Find GPS device
    const gpsDevice = await this.findGPSDevice();
    
    if (!gpsDevice) {
      throw new Error('GPS device not found. Please check connections.');
    }

    // Initialize serial port
    this.port = new SerialPort({
      path: gpsDevice,
      baudRate: 9600, // Standard GPS baud rate
      autoOpen: false
    });

    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    // Set up event listeners
    this.setupEventListeners();

    // Open the port
    await new Promise((resolve, reject) => {
      this.port.open((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    console.log(`[OK] GPS connected on ${gpsDevice}`);
  }

  scheduleReconnect() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }

    if (this.connectionAttempts < this.maxConnectionAttempts) {
      const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
      this.reconnectInterval = setTimeout(async () => {
        this.connectionAttempts++;
        console.log(`GPS reconnection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}`);
        try {
          await this.connectToGPS();
          this.isConnected = true;
          this.connectionAttempts = 0;
          console.log('[OK] GPS reconnected successfully');
        } catch (error) {
          console.error('GPS reconnection failed:', error.message);
          this.scheduleReconnect();
        }
      }, delay);
    } else {
      console.error('[ERROR] GPS max reconnection attempts reached');
    }
  }

  async findGPSDevice() {
    // GPS device paths
    const possiblePaths = [
      '/dev/ttyUSB0',
      '/dev/ttyUSB1',
      '/dev/ttyAMA0',
      '/dev/serial0',
      '/dev/serial1'
    ];

    for (const path of possiblePaths) {
      try {
        const testPort = new SerialPort({ path, baudRate: 9600, autoOpen: false });
        await new Promise((resolve, reject) => {
          testPort.open((error) => {
            if (error) {
              reject(error);
            } else {
              testPort.close();
              resolve();
            }
          });
        });
        return path;
      } catch (error) {
        // Device doesn't exist or can't be opened
        continue;
      }
    }
    
    return null;
  }

  setupEventListeners() {
    this.parser.on('data', (data) => {
      this.parseNMEAData(data);
    });

    this.port.on('error', (error) => {
      console.error('GPS port error:', error);
      this.emit('error', error);
    });

    this.port.on('close', () => {
      console.log('GPS port closed');
    });
  }

  parseNMEAData(data) {
    try {
      const sentence = data.trim();
      
      // Parse GGA sentence (Global Positioning System Fix Data)
      if (sentence.startsWith('$GPGGA')) {
        this.parseGGA(sentence);
      }
      // Parse RMC sentence (Recommended Minimum)
      else if (sentence.startsWith('$GPRMC')) {
        this.parseRMC(sentence);
      }
    } catch (error) {
      console.error('GPS parsing error:', error);
    }
  }

  parseGGA(sentence) {
    const fields = sentence.split(',');
    
    if (fields.length >= 15) {
      const fixQuality = parseInt(fields[6]);
      const satellites = parseInt(fields[7]);
      const hdop = parseFloat(fields[8]);
      
      this.updateSignalStrength(satellites, fixQuality, hdop);
      
      if (fixQuality > 0) {
        const latitude = this.parseCoordinate(fields[2], fields[3]);
        const longitude = this.parseCoordinate(fields[4], fields[5]);
        const altitude = parseFloat(fields[9]);
        
        this.currentData = {
          latitude,
          longitude,
          altitude,
          timestamp: new Date(),
          accuracy: hdop,
          satellites,
          fix: true
        };
        
        // Store as last known location
        this.lastKnownLocation = {
          latitude,
          longitude,
          altitude,
          timestamp: new Date(),
          accuracy: hdop
        };
        
        // Persist the location data (fire and forget)
        this.persistLocationData().catch(err => 
          console.error('Failed to persist GPS data:', err)
        );
        
        this.lastValidFix = new Date();
        if (!this.acquisitionTime) {
          this.acquisitionTime = new Date();
          console.log(' GPS first fix acquired!');
        }
        
        this.emit('data', this.currentData);
      } else {
        this.currentData.fix = false;
        this.currentData.satellites = satellites;
      }
    }
  }

  updateSignalStrength(satellites, fixQuality, hdop) {
    if (satellites === 0) {
      this.signalStrength = 'none';
    } else if (satellites < 4) {
      this.signalStrength = 'weak';
    } else if (satellites >= 4 && satellites < 8) {
      this.signalStrength = 'good';
    } else {
      this.signalStrength = 'strong';
    }
  }

  parseRMC(sentence) {
    const fields = sentence.split(',');
    
    if (fields.length >= 12) {
      const status = fields[2];
      
      if (status === 'A') { // Active
        const latitude = this.parseCoordinate(fields[3], fields[4]);
        const longitude = this.parseCoordinate(fields[5], fields[6]);
        const speed = parseFloat(fields[7]);
        const course = parseFloat(fields[8]);
        
        this.currentData = {
          ...this.currentData,
          latitude,
          longitude,
          speed,
          course,
          timestamp: new Date(),
          fix: true
        };
        
        this.lastValidFix = new Date();
        this.emit('data', this.currentData);
      }
    }
  }

  parseCoordinate(coord, direction) {
    if (!coord || coord === '') return null;
    
    const degrees = Math.floor(parseFloat(coord) / 100);
    const minutes = parseFloat(coord) - (degrees * 100);
    let decimal = degrees + (minutes / 60);
    
    if (direction === 'S' || direction === 'W') {
      decimal = -decimal;
    }
    
    return decimal;
  }


  async getStatus() {
    if (!this.isInitialized) {
      return { 
        connected: false, 
        error: 'Not initialized',
        signalStrength: 'none',
        lastKnownLocation: null
      };
    }

    const now = new Date();
    const timeSinceLastFix = this.lastValidFix ? 
      (now - this.lastValidFix) / 1000 : Infinity;
    const timeSinceStart = (now - this.startTime) / 1000;

    return {
      connected: this.isConnected,
      fix: this.currentData.fix,
      satellites: this.currentData.satellites,
      accuracy: this.currentData.accuracy,
      lastFix: this.lastValidFix,
      timeSinceLastFix: timeSinceLastFix,
      timeSinceStart: timeSinceStart,
      signalStrength: this.signalStrength,
      acquisitionTime: this.acquisitionTime,
      lastKnownLocation: this.lastKnownLocation,
      locationAge: this.getLocationAge(),
      isLocationStale: this.isLocationStale(),
      data: this.currentData
    };
  }

  async getCurrentLocation() {
    if (!this.isInitialized) {
      throw new Error('GPS not initialized');
    }

    const now = new Date();
    const timeSinceLastFix = this.lastValidFix ? 
      (now - this.lastValidFix) / 1000 : Infinity;

    if (timeSinceLastFix > this.fixTimeout / 1000) {
      throw new Error('GPS fix timeout - no recent valid location');
    }

    return this.currentData;
  }

  // GPS Persistence Methods
  async loadPersistedData() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.persistenceFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Try to read persisted data
      const data = await fs.readFile(this.persistenceFile, 'utf8');
      const persisted = JSON.parse(data);
      
      // Validate and load persisted data
      if (persisted.lastKnownLocation && 
          persisted.lastKnownLocation.latitude && 
          persisted.lastKnownLocation.longitude) {
        
        this.lastKnownLocation = {
          latitude: persisted.lastKnownLocation.latitude,
          longitude: persisted.lastKnownLocation.longitude,
          altitude: persisted.lastKnownLocation.altitude,
          timestamp: new Date(persisted.lastKnownLocation.timestamp),
          accuracy: persisted.lastKnownLocation.accuracy
        };
        
        if (persisted.lastValidFix) {
          this.lastValidFix = new Date(persisted.lastValidFix);
        }
        
        if (persisted.acquisitionTime) {
          this.acquisitionTime = new Date(persisted.acquisitionTime);
        }
        
        console.log('Loaded persisted GPS data');
      }
      
    } catch (error) {
      console.log('No persisted GPS data found, starting fresh');
    }
  }

  async persistLocationData() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.persistenceFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Prepare data for persistence
      const dataToPersist = {
        lastKnownLocation: this.lastKnownLocation,
        lastValidFix: this.lastValidFix,
        acquisitionTime: this.acquisitionTime,
        timestamp: new Date().toISOString()
      };
      
      // Write to file
      await fs.writeFile(this.persistenceFile, JSON.stringify(dataToPersist, null, 2));
      
    } catch (error) {
      console.error('Failed to persist GPS data:', error);
    }
  }

  getLocationAge() {
    if (!this.lastKnownLocation.timestamp) return 'Unknown';
    
    const now = new Date();
    const age = now - this.lastKnownLocation.timestamp;
    const minutes = Math.floor(age / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  isLocationStale(maxAgeHours = 24) {
    if (!this.lastKnownLocation.timestamp) return true;
    
    const now = new Date();
    const age = now - this.lastKnownLocation.timestamp;
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    
    return age > maxAge;
  }

  async cleanup() {
    // Clear mock GPS interval if running
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }

    if (this.port && this.port.isOpen) {
      await new Promise((resolve) => {
        this.port.close(() => {
          resolve();
        });
      });
    }

    // Persist final data before cleanup (only on Linux)
    if (process.platform === 'linux') {
      await this.persistLocationData();
    }

    this.isInitialized = false;
    if (process.platform !== 'linux') {
      console.log('[OK] GPS cleanup completed (mock mode)');
    } else {
      console.log('[OK] GPS cleanup completed');
    }
  }
}

module.exports = GPS;
