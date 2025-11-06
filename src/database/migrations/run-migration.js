/**
 * Database Migration Runner
 * Runs pending database migrations in order
 * 
 * Usage:
 *   node run-migration.js              # Run all pending migrations
 *   node run-migration.js --latest     # Run latest migration only
 *   node run-migration.js 003          # Run specific migration by number
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../../data/gasguard.db');
const MIGRATIONS_DIR = __dirname;

// Available migrations in order
const MIGRATIONS = [
    {
        id: 1,
        file: '001_refactor_internal_contacts.sql',
        description: 'Refactor internal contacts table'
    },
    {
        id: 2,
        file: '002_optimize_alerts_table.sql',
        description: 'Optimize alerts table with indexes'
    },
    {
        id: 3,
        file: '003_remove_wifi_networks.sql',
        description: 'Remove unused wifi_networks table'
    },
    {
        id: 4,
        file: '004_add_calibration_history_fks.sql',
        description: 'Add foreign keys to calibration_history'
    },
    {
        id: 5,
        file: '005_fix_timezone_timestamps.sql',
        description: 'Fix timezone - Store Manila time (GMT+8) not UTC'
    },
    {
        id: 6,
        file: '006_add_twilio_sms_config.sql',
        description: 'Add Twilio SMS configuration settings'
    },
    {
        id: 7,
        file: '007_add_twilio_messaging_service_sid.sql',
        description: 'Add Twilio Messaging Service SID in setting'
    },
    {
        id: 8,
        file: '008_add_sms_category_to_logs.sql',
        description: 'Add SMS category to system logs'
    },
    {
        id: 9,
        file: '009_replace_twilio_with_textbee.sql',
        description: 'Replace Twilio with TextBee SMS settings'
    },
    {
        id: 10,
        file: '010_fix_contacts_constraints.sql',
        description: 'Fix contacts table constraints and types'
    },
    {
        id: 11,
        file: '011_add_data_retention_setting.sql',
        description: 'Add data retention settings to database'
    },
    {
        id: 12,
        file: '012_consolidate_settings_to_user_2.sql',
        description: 'Consolidate settings to admin user (user_id = 2)'
    }
];

console.log('====================================');
console.log('📦 GasGuard Database Migration Runner');
console.log('====================================\n');

// Connect to database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[ERROR] Error opening database:', err.message);
        process.exit(1);
    }
    console.log(`[OK] Connected to database: ${DB_PATH}\n`);
    
    // Create migrations tracking table if it doesn't exist
    db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY,
            migration_file TEXT NOT NULL,
            description TEXT,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('[ERROR] Failed to create migrations table:', err.message);
            db.close();
            process.exit(1);
        }
        
        // Get already applied migrations
        db.all("SELECT id FROM schema_migrations ORDER BY id", (err, appliedMigrations) => {
            if (err) {
                console.error('[ERROR] Failed to get applied migrations:', err.message);
                db.close();
                process.exit(1);
            }
            
            const appliedIds = appliedMigrations.map(m => m.id);
            console.log('📊 Migration Status:');
            console.log(`   Applied: ${appliedIds.length} migration(s)`);
            if (appliedIds.length > 0) {
                console.log(`   Last applied: Migration ${Math.max(...appliedIds)}`);
            }
            console.log('');
            
            // Parse command line arguments
            const args = process.argv.slice(2);
            let migrationsToRun = [];
            
            if (args.includes('--latest')) {
                // Run only the latest migration
                const latest = MIGRATIONS[MIGRATIONS.length - 1];
                if (!appliedIds.includes(latest.id)) {
                    migrationsToRun = [latest];
                }
            } else if (args.length > 0 && !isNaN(args[0])) {
                // Run specific migration
                const migrationId = parseInt(args[0]);
                const migration = MIGRATIONS.find(m => m.id === migrationId);
                if (migration && !appliedIds.includes(migration.id)) {
                    migrationsToRun = [migration];
                } else if (!migration) {
                    console.error(`[ERROR] Migration ${migrationId} not found`);
                    db.close();
                    process.exit(1);
                } else {
                    console.log(`✅ Migration ${migrationId} already applied`);
                    db.close();
                    return;
                }
            } else {
                // Run all pending migrations
                migrationsToRun = MIGRATIONS.filter(m => !appliedIds.includes(m.id));
            }
            
            if (migrationsToRun.length === 0) {
                console.log('✅ All migrations are up to date!');
                console.log('');
                console.table(MIGRATIONS.map(m => ({
                    ID: m.id,
                    Status: appliedIds.includes(m.id) ? '✅ Applied' : '⏳ Pending',
                    Description: m.description
                })));
                db.close();
                return;
            }
            
            console.log(`🔄 Running ${migrationsToRun.length} migration(s):\n`);
            
            // Run migrations sequentially
            runMigrationsSequentially(migrationsToRun, 0);
        });
    });
});

function runMigrationsSequentially(migrations, index) {
    if (index >= migrations.length) {
        // All migrations complete
        console.log('\n====================================');
        console.log('✅ All migrations completed successfully!');
        console.log('====================================\n');
        
        db.close((err) => {
            if (err) {
                console.error('[ERROR] Error closing database:', err.message);
            }
            process.exit(0);
        });
        return;
    }
    
    const migration = migrations[index];
    const migrationPath = path.join(MIGRATIONS_DIR, migration.file);
    
    console.log(`[${index + 1}/${migrations.length}] Running: ${migration.file}`);
    console.log(`    ${migration.description}`);
    
    // Read migration SQL
    let migrationSQL;
    try {
        migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    } catch (err) {
        console.error(`[ERROR] Failed to read migration file: ${err.message}`);
        db.close();
        process.exit(1);
    }
    
    // Execute migration
    db.exec(migrationSQL, (err) => {
        if (err) {
            console.error(`[ERROR] Migration ${migration.id} failed: ${err.message}`);
            db.close();
            process.exit(1);
        }
        
        // Record migration as applied
        db.run(
            "INSERT INTO schema_migrations (id, migration_file, description) VALUES (?, ?, ?)",
            [migration.id, migration.file, migration.description],
            (err) => {
                if (err) {
                    console.error(`[ERROR] Failed to record migration: ${err.message}`);
                    db.close();
                    process.exit(1);
                }
                
                console.log(`    ✅ Success!\n`);
                
                // Run next migration
                runMigrationsSequentially(migrations, index + 1);
            }
        );
    });
}
