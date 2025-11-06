-- ============================================================================
-- MIGRATION: Optimize Alerts Table
-- Date: October 6, 2025
-- Purpose: Remove duplication & unnecessary columns following SQL best practices
-- ============================================================================

-- CHANGES:
-- [REMOVE] REMOVE: Duplicate sensor data (already in sensor_data table)
-- [REMOVE] REMOVE: Acknowledgment columns (SMS is notification only)
-- [OK] ADD: Foreign key to sensor_data (single source of truth)
-- [OK] OPTIMIZE: Smaller, normalized table

-- ============================================================================
-- BEFORE (Bad - Duplicated Data):
-- ============================================================================
-- id, timestamp, alert_type, gas_type, mq6_ppm, mq2_ppm, gps_latitude, 
-- gps_longitude, sms_sent, sms_recipients, acknowledged, acknowledged_by, 
-- acknowledged_at, created_at
--
-- Problems:
-- 1. Duplicates sensor readings from sensor_data
-- 2. Acknowledgment feature not needed
-- 3. Larger table size
-- 4. Update anomalies (change sensor data but forget alert)

-- ============================================================================
-- AFTER (Good - Normalized):
-- ============================================================================
-- id, sensor_data_id, alert_type, sms_sent, sms_recipients, 
-- sms_sent_at, created_at
--
-- Benefits:
-- 1. No data duplication (follows 3NF)
-- 2. Smaller table size
-- 3. Faster queries
-- 4. Single source of truth
-- 5. Referential integrity with foreign key

-- ============================================================================
-- Step 1: Create optimized alerts table
-- ============================================================================
CREATE TABLE IF NOT EXISTS alerts_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_data_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('low', 'critical')),
    sms_sent BOOLEAN DEFAULT 0,
    sms_recipients TEXT,
    sms_sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_data_id) REFERENCES sensor_data(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 2: Migrate existing data (if any)
-- ============================================================================
-- If there are existing alerts, try to match them with sensor_data by timestamp
-- Otherwise, just drop old data (it's mock data anyway)
INSERT INTO alerts_new (sensor_data_id, alert_type, sms_sent, sms_recipients, created_at)
SELECT 
    sd.id as sensor_data_id,
    a.alert_type,
    a.sms_sent,
    a.sms_recipients,
    a.created_at
FROM alerts a
LEFT JOIN sensor_data sd 
    ON abs(strftime('%s', a.timestamp) - strftime('%s', sd.timestamp)) < 5
    AND a.gas_type = sd.gas_type
WHERE sd.id IS NOT NULL;

-- Note: Only migrates alerts that have matching sensor data within 5 seconds

-- ============================================================================
-- Step 3: Drop old table
-- ============================================================================
DROP TABLE IF EXISTS alerts;

-- ============================================================================
-- Step 4: Rename new table
-- ============================================================================
ALTER TABLE alerts_new RENAME TO alerts;

-- ============================================================================
-- Step 5: Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_alerts_sensor_data ON alerts(sensor_data_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Check new schema:
-- PRAGMA table_info(alerts);

-- Expected columns:
-- id, sensor_data_id, alert_type, sms_sent, sms_recipients, sms_sent_at, created_at

-- Test foreign key:
-- SELECT a.*, sd.timestamp, sd.mq6_ppm, sd.mq2_ppm, sd.gas_type
-- FROM alerts a
-- JOIN sensor_data sd ON a.sensor_data_id = sd.id
-- LIMIT 5;
