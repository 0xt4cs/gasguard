-- Migration: Add foreign keys to calibration_history
-- Date: 2025-10-09
-- Purpose: Enforce relationships between calibration_history, calibration_data, and users

-- Step 1: Create new table with proper foreign keys
CREATE TABLE IF NOT EXISTS calibration_history_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calibration_id INTEGER,
    sensor TEXT NOT NULL CHECK(sensor IN ('mq6', 'mq2')),
    type TEXT NOT NULL CHECK(type IN ('manual', 'automatic')),
    baseline_resistance REAL NOT NULL,
    sensitivity_factor REAL NOT NULL,
    drift_before REAL NOT NULL,
    drift_after REAL NOT NULL,
    performed_by INTEGER,
    status TEXT DEFAULT 'success',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (calibration_id) REFERENCES calibration_data(id) ON DELETE SET NULL,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Step 2: Copy existing data from old table (if it exists)
INSERT INTO calibration_history_new (
    id, sensor, type, baseline_resistance, sensitivity_factor, 
    drift_before, drift_after, status, timestamp
)
SELECT 
    id, sensor, type, baseline_resistance, sensitivity_factor,
    drift_before, drift_after, status, timestamp
FROM calibration_history
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='calibration_history');

-- Step 3: Drop old table
DROP TABLE IF EXISTS calibration_history;

-- Step 4: Rename new table to original name
ALTER TABLE calibration_history_new RENAME TO calibration_history;

-- Verification queries (commented out - run manually to verify)
-- SELECT COUNT(*) FROM calibration_history;
-- SELECT * FROM calibration_history LIMIT 5;
-- PRAGMA foreign_key_list(calibration_history);
