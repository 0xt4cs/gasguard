class WebSocketHandler {
  constructor(io, hardwareManager, db = null) {
    this.io = io;
    this.hardwareManager = hardwareManager;
    this.db = db;
    this.connectedClients = new Set();

    this.setupSocketHandlers();
    this.setupHardwareListeners();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      this.connectedClients.add(socket.id);

      // Send initial status
      this.sendSystemStatus(socket);

      // Handle client requests
      socket.on('get-system-status', () => {
        this.sendSystemStatus(socket);
      });

      socket.on('test-hardware', async () => {
        try {
          const results = await this.hardwareManager.testHardware();
          socket.emit('hardware-test-results', results);
        } catch (error) {
          socket.emit('hardware-error', { error: error.message });
        }
      });

      socket.on('acknowledge-alert', async () => {
        try {
          await this.hardwareManager.acknowledgeAlert();
          this.broadcastSystemStatus();
        } catch (error) {
          socket.emit('error', { message: 'Failed to acknowledge alert' });
        }
      });

      // Development mode simulation
      socket.on('simulate-sensor-data', (data) => {
        this.handleSensorSimulation(data);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.connectedClients.delete(socket.id);
      });
    });
  }

  setupHardwareListeners() {
    // Listen for hardware events and broadcast to clients
    this.hardwareManager.on('sensorData', (data) => {
      // Emit sensor data with current alert level for real-time frontend updates
      this.io.emit('sensor-data', {
        sensorData: data,
        currentAlertLevel: this.hardwareManager.currentAlertLevel,
        timestamp: new Date()
      });
    });

    this.hardwareManager.on('alertLevelChange', (data) => {
      // Emit alert level changes immediately
      this.io.emit('alert-level-change', data);
      // Also broadcast full system status
      this.broadcastSystemStatus();
    });

    this.hardwareManager.on('gpsUpdate', (data) => {
      this.io.emit('gps-update', data);
    });

    this.hardwareManager.on('criticalAlert', (data) => {
      // Critical alerts need immediate attention
      this.io.emit('critical-alert', data);
      this.broadcastSystemStatus();
    });

    this.hardwareManager.on('hardwareReady', () => {
      this.broadcastSystemStatus();
    });
  }

  sendSystemStatus(socket) {
    const status = this.hardwareManager.getSystemStatus();
    socket.emit('hardware-status', status);
  }

  broadcastSystemStatus() {
    const status = this.hardwareManager.getSystemStatus();
    this.io.emit('hardware-status', status);
  }

  handleSensorSimulation(data) {
    const { level } = data;

    let mockData;

    switch (level) {
      case 'normal':
        mockData = this.generateNormalData();
        break;
      case 'low':
        mockData = this.generateLowData();
        break;
      case 'critical':
        mockData = this.generateCriticalData();
        break;
      default:
        return;
    }

    this.io.emit('sensor-data', mockData);

    setTimeout(() => {
      this.broadcastSystemStatus();
    }, 100);
  }

  generateNormalData() {
    const timestamp = new Date();
    return {
      sensorData: {
        mq6: {
          raw: Math.floor(Math.random() * 50) + 100, // 100-150
          ppm: Math.random() * 5, // 0-5 ppm
          timestamp
        },
        mq2: {
          raw: Math.floor(Math.random() * 50) + 100, // 100-150
          ppm: Math.random() * 5, // 0-5 ppm
          timestamp
        },
        fused: {
          timestamp,
          maxPpm: Math.random() * 5,
          avgPpm: Math.random() * 3,
          minPpm: 0,
          gasType: 'Clean Air',
          confidence: Math.floor(Math.random() * 30) + 70, // 70-100%
          riskLevel: 'MINIMAL',
          agreement: 'EXCELLENT',
          mq6Contribution: 'NONE',
          mq2Contribution: 'NONE',
          recommendation: 'NORMAL_OPERATION'
        }
      },
      currentAlertLevel: 'normal',
      gpsData: this.hardwareManager.gpsData
    };
  }

  generateLowData() {
    const timestamp = new Date();
    return {
      sensorData: {
        mq6: {
          raw: Math.floor(Math.random() * 100) + 200, // 200-300
          ppm: Math.random() * 50 + 100, // 100-150 ppm
          timestamp
        },
        mq2: {
          raw: Math.floor(Math.random() * 100) + 200, // 200-300
          ppm: Math.random() * 30 + 70, // 70-100 ppm
          timestamp
        },
        fused: {
          timestamp,
          maxPpm: Math.random() * 50 + 100,
          avgPpm: Math.random() * 30 + 85,
          minPpm: Math.random() * 20 + 60,
          gasType: 'LPG/Propane',
          confidence: Math.floor(Math.random() * 20) + 60, // 60-80%
          riskLevel: 'LOW',
          agreement: 'GOOD',
          mq6Contribution: 'MEDIUM',
          mq2Contribution: 'LOW',
          recommendation: 'MONITOR_CLOSELY'
        }
      },
      currentAlertLevel: 'low',
      gpsData: this.hardwareManager.gpsData
    };
  }

  generateCriticalData() {
    const timestamp = new Date();
    return {
      sensorData: {
        mq6: {
          raw: Math.floor(Math.random() * 200) + 400, // 400-600
          ppm: Math.random() * 200 + 300, // 300-500 ppm
          timestamp
        },
        mq2: {
          raw: Math.floor(Math.random() * 200) + 400, // 400-600
          ppm: Math.random() * 150 + 250, // 250-400 ppm
          timestamp
        },
        fused: {
          timestamp,
          maxPpm: Math.random() * 200 + 300,
          avgPpm: Math.random() * 150 + 275,
          minPpm: Math.random() * 100 + 200,
          gasType: 'LPG/Butane',
          confidence: Math.floor(Math.random() * 20) + 80, // 80-100%
          riskLevel: 'HIGH',
          agreement: 'EXCELLENT',
          mq6Contribution: 'HIGH',
          mq2Contribution: 'HIGH',
          recommendation: 'IMMEDIATE_EVACUATION'
        }
      },
      currentAlertLevel: 'critical',
      gpsData: this.hardwareManager.gpsData
    };
  }
}

module.exports = WebSocketHandler;