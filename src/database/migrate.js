const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./connection');

class DatabaseMigration {
  constructor() {
    this.schemaPath = path.join(__dirname, 'schema.sql');
  }

  //Run all migrations
  async run() {
    try {
      console.log(' Starting database migration...');

      // Initialize connection
      await db.initialize();

      // Run schema
      await this.runSchema();

      // Seed default users
      await this.seedUsers();

      // Seed default settings
      await this.seedSettings();

      console.log('[OK] Database migration completed successfully!');
      return true;
    } catch (error) {
      console.error('[ERROR] Migration failed:', error);
      throw error;
    }
  }

  //Run schema SQL file
  async runSchema() {
    console.log(' Running schema...');
    
    const schema = fs.readFileSync(this.schemaPath, 'utf8');
    await db.exec(schema);
    
    console.log('[OK] Schema created successfully');
  }

  //Seed default users
  async seedUsers() {
    console.log('👥 Seeding default users...');

    // Check if users already exist
    const existingUsers = await db.all('SELECT * FROM users');
    if (existingUsers.length > 0) {
      console.log('[INFO]  Users already exist, skipping seed');
      return;
    }

    // Hash passwords
    const userPassword = await bcrypt.hash('user123', 10);
    const adminPassword = await bcrypt.hash('admin123', 10);

    // Insert users
    await db.run(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      ['user', userPassword, 'user']
    );

    await db.run(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      ['admin', adminPassword, 'admin']
    );

    console.log('[OK] Default users created:');
    console.log('   👤 user/user123');
    console.log('   👤 admin/admin123');
  }

  //Seed default settings for users
  async seedSettings() {
    console.log('  Seeding default settings...');

    // Check if settings already exist
    const existingSettings = await db.all('SELECT * FROM settings');
    if (existingSettings.length > 0) {
      console.log('[INFO]  Settings already exist, skipping seed');
      return;
    }

    // Get user IDs
    const users = await db.all('SELECT id FROM users');

    // Insert default settings for each user
    for (const user of users) {
      await db.run(
        `INSERT INTO settings (
          user_id, 
          low_level_threshold, 
          critical_level_threshold, 
          sms_alerts_enabled, 
          buzz_on_low, 
          buzz_on_critical,
          gps_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, 300, 800, 0, 1, 1, 0]
      );
    }

    console.log('[OK] Default settings created for all users');
  }

  //Reset database (DROP ALL TABLES - USE WITH CAUTION)
  async reset() {
    console.log('[WARNING]  RESETTING DATABASE - ALL DATA WILL BE LOST!');

    try {
      await db.initialize();

      // Drop all tables
      const tables = [
        'alerts',
        'system_logs',
        'calibration_history',
        'calibration_data',
        'sensor_data',
        'contacts_external',
        'contacts_internal',
        'contacts',
        'settings',
        'users'
      ];

      for (const table of tables) {
        try {
          await db.run(`DROP TABLE IF EXISTS ${table}`);
          console.log(`[OK] Dropped table: ${table}`);
        } catch (error) {
          console.log(`[WARNING]  Could not drop table ${table}:`, error.message);
        }
      }

      console.log('[OK] Database reset complete');
      return true;
    } catch (error) {
      console.error('[ERROR] Reset failed:', error);
      throw error;
    }
  }

  //Check database status
  async status() {
    try {
      await db.initialize();

      console.log('\n Database Status:\n');

      const tables = [
        'users',
        'settings',
        'contacts',
        'contacts_internal',
        'contacts_external',
        'sensor_data',
        'calibration_data',
        'calibration_history',
        'system_logs',
        'alerts'
      ];

      for (const table of tables) {
        try {
          const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
          console.log(`  ${table.padEnd(25)} : ${result.count} rows`);
        } catch (error) {
          console.log(`  ${table.padEnd(25)} : [ERROR] Not found`);
        }
      }

      console.log('\n');
      return true;
    } catch (error) {
      console.error('[ERROR] Status check failed:', error);
      throw error;
    }
  }
}

// Command Line Interface
if (require.main === module) {
  const migration = new DatabaseMigration();
  const command = process.argv[2] || 'run';

  (async () => {
    try {
      switch (command) {
        case 'run':
          await migration.run();
          break;
        case 'reset':
          await migration.reset();
          await migration.run();
          break;
        case 'status':
          await migration.status();
          break;
        default:
          console.log('Usage: node migrate.js [run|reset|status]');
          process.exit(1);
      }
      
      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Migration error:', error);
      await db.close();
      process.exit(1);
    }
  })();
}

module.exports = DatabaseMigration;


