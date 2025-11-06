-- ============================================================================
-- Migration 005: Fix Timezone Timestamps
-- ============================================================================
-- Problem: CURRENT_TIMESTAMP stores UTC, showing "8h ago" for new alerts
-- Solution: Just update existing timestamps by adding 8 hours
-- ============================================================================

-- Update all existing timestamps: Add 8 hours to convert UTC -> Manila time
UPDATE alerts 
SET created_at = datetime(created_at, '+8 hours')
WHERE created_at < datetime('now');

UPDATE sensor_data 
SET timestamp = datetime(timestamp, '+8 hours'),
    created_at = datetime(created_at, '+8 hours')
WHERE timestamp < datetime('now');

UPDATE users
SET created_at = datetime(created_at, '+8 hours'),
    updated_at = datetime(updated_at, '+8 hours')
WHERE created_at < datetime('now');

UPDATE settings
SET created_at = datetime(created_at, '+8 hours'),
    updated_at = datetime(updated_at, '+8 hours')
WHERE created_at < datetime('now');

UPDATE contacts
SET created_at = datetime(created_at, '+8 hours'),
    updated_at = datetime(updated_at, '+8 hours')
WHERE created_at < datetime('now');

UPDATE system_logs
SET timestamp = datetime(timestamp, '+8 hours')
WHERE timestamp < datetime('now') AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='system_logs');

UPDATE calibration_history
SET timestamp = datetime(timestamp, '+8 hours')
WHERE timestamp < datetime('now') AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='calibration_history');

-- Verification
SELECT 'Migration 005 completed - Added 8 hours to all timestamps' AS status;
SELECT 'Latest alert now shows:', created_at FROM alerts ORDER BY id DESC LIMIT 1;
