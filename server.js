/**
 * GasGuard - IoT Gas Leak Detection System
 * Main server entry point
 * 
 * Initializes Express server, WebSocket, hardware, and database
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cron = require('node-cron');

// Application modules
const HardwareManager = require('./src/hardware/hardwareManager');
const AuthMiddleware = require('./src/middleware/auth');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const WebSocketHandler = require('./src/websocket/websocketHandler');
const db = require('./src/database/connection');
const { SensorData, SystemLog } = require('./src/database/models');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware configuration
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static file serving with caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Hardware and WebSocket initialization
const hardwareManager = new HardwareManager();
const wsHandler = new WebSocketHandler(io, hardwareManager, db);

// API route configuration
app.use('/api/auth', require('./src/routes/auth')());
app.use('/api/dashboard', require('./src/routes/dashboard')(db, hardwareManager));
app.use('/api/config', require('./src/routes/config')(db, hardwareManager));
app.use('/api/alerts', require('./src/routes/alerts')(db, hardwareManager));
app.use('/api/settings', require('./src/routes/settings')());
app.use('/api/contacts', require('./src/routes/contacts')());
app.use('/api/history', require('./src/routes/history')());
app.use('/api/wifi', require('./src/routes/wifi')(db));
app.use('/api/calibration', require('./src/routes/calibration')());
app.use('/api/logs', require('./src/routes/logs')());
app.use('/api/retention', require('./src/routes/dataRetention')());

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

app.get('/dashboard', AuthMiddleware.requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/settings', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Error handling
app.use('/api/*', notFoundHandler);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    next();
  }
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

/**
 * Initialize application components
 * - Database connection and schema
 * - Hardware components
 * - SMS service
 * - Scheduled tasks
 */
async function initialize() {
  try {
    console.log('Initializing GasGuard System...\n');

    const isDevelopment = process.platform !== 'linux';
    if (isDevelopment) {
      console.log('WARNING: Development mode - Mock hardware enabled');
    }

    // Initialize database
    console.log('Initializing database...');
    await db.initialize();
    
    // Check if database schema exists
    try {
      await db.get('SELECT COUNT(*) as count FROM users');
      console.log('Database connected\n');
    } catch (error) {
      // Initialize database schema
      console.log('Creating database schema...');
      const DatabaseMigration = require('./src/database/migrate');
      const migration = new DatabaseMigration();
      await migration.runSchema();
      await migration.seedUsers();
      await migration.seedSettings();
      console.log('Database initialized\n');
    }

    // Log system startup
    await SystemLog.info('system', 'GasGuard system starting up', {
      source: 'server.initialize',
      data: { mode: isDevelopment ? 'development' : 'production' }
    });

    // Initialize hardware components
    console.log('Initializing hardware...');
    await hardwareManager.initialize();
    console.log('Hardware initialized\n');

    // Initialize SMS service
    console.log('Initializing SMS service...');
    const textbeeService = require('./src/services/textbeeService');
    await textbeeService.initialize();
    console.log('');

    // Schedule daily data cleanup (2 AM)
    cron.schedule('0 2 * * *', async () => {
      try {
        console.log('Running data retention cleanup...');
        
        const [sensorDeleted, logsDeleted] = await Promise.all([
          SensorData.deleteOlderThan(90),
          SystemLog.deleteOlderThan(90)
        ]);
        
        console.log(`Deleted ${sensorDeleted} old sensor records`);
        console.log(`Deleted ${logsDeleted} old log records`);
        
        await SystemLog.info('system', 'Data retention cleanup completed', {
          source: 'cron.cleanup',
          data: { sensorRecords: sensorDeleted, logRecords: logsDeleted }
        });
      } catch (error) {
        console.error('Cleanup job error:', error);
        await SystemLog.error('system', 'Data cleanup failed: ' + error.message, {
          source: 'cron.cleanup'
        });
      }
    });
    console.log('Data retention cleanup scheduled (daily at 2 AM)\n');

    // Start HTTP server
    server.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════════════════');
      console.log(`GasGuard Server running on http://0.0.0.0:${PORT}`);
      console.log('═══════════════════════════════════════════════════');
      if (isDevelopment) {
        console.log('Development Mode: Mock hardware active');
      } else {
        console.log('Production Mode: Real hardware active');
      }
      console.log(`\nWeb Interface: http://0.0.0.0:${PORT}/`);
      console.log(`Dashboard: http://0.0.0.0:${PORT}/dashboard`);
      console.log('═══════════════════════════════════════════════════\n');
    });

  } catch (error) {
    console.error('Failed to initialize system:', error);
    try {
      await SystemLog.error('system', 'System initialization failed: ' + error.message, {
        source: 'server.initialize'
      });
    } catch (logError) {
      // Silently fail if logging is unavailable
    }
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 * Ensures proper cleanup of resources
 */
process.on('SIGINT', async () => {
  console.log('\n\nShutting down gracefully...');
  
  try {
    await SystemLog.info('system', 'GasGuard system shutting down', {
      source: 'server.shutdown'
    });
  } catch (error) {
    console.error('Error logging shutdown:', error);
  }
  
  // Close WebSocket connections
  console.log('Closing WebSocket connections...');
  io.close(() => {
    console.log('WebSockets closed');
  });
  
  // Close HTTP server
  console.log('Closing HTTP server...');
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Cleanup hardware
    console.log('Cleaning up hardware...');
    await hardwareManager.cleanup();
    console.log('Hardware cleanup complete');
    
    // Close database
    console.log('Closing database...');
    await db.close();
    console.log('Database closed');
    
    console.log('Shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
});

// Start application
initialize();
