const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseConnection {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '../../data/gasguard.db');
  }

  //Initialize database connection
  async initialize() {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Create/open database
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Database connection failed:', err.message);
          reject(err);
        } else {
          console.log('Connected to SQLite database:', this.dbPath);
          
          // Enable foreign keys and optimize database settings
          this.db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
              console.error('Failed to enable foreign keys:', err);
              reject(err);
            } else {
              // Apply all performance optimizations
              this.db.exec(`
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA cache_size = 10000;
                PRAGMA temp_store = MEMORY;
                PRAGMA busy_timeout = 5000;
                PRAGMA wal_autocheckpoint = 1000;
              `, (err) => {
                if (err) {
                  console.error('Failed to apply database optimizations:', err);
                  reject(err);
                } else {
              resolve();
                }
              });
            }
          });
        }
      });
    });
  }

  //Run a query
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  //Get single row
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  //Get all rows
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  //Execute multiple statements
  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  //Begin transaction
  beginTransaction() {
    return this.run('BEGIN TRANSACTION');
  }

  //Commit transaction
  commit() {
    return this.run('COMMIT');
  }

  //Rollback transaction
  rollback() {
    return this.run('ROLLBACK');
  }

  //Close database connection
  close() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
          reject(err);
        } else {
          console.log('Database connection closed');
          this.db = null;
          resolve();
        }
      });
    });
  }
}

// Database Connection Singleton
const dbConnection = new DatabaseConnection();

module.exports = dbConnection;


