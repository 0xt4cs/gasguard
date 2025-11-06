-- Migration: Consolidate all global settings to admin user (user_id = 2)
-- Since admin was seeded as user_id = 2, we use that as the global settings holder
-- All hardware, GPS, thresholds, profile, and system configs are stored in user_id = 2

-- Check if user_id = 2 (admin) exists and has settings
-- If user_id = 1 has settings that user_id = 2 doesn't have, merge them

-- Step 1: Ensure admin user (user_id = 2) has a settings record
INSERT OR IGNORE INTO settings (
    user_id,
    low_level_threshold,
    critical_level_threshold,
    sms_alerts_enabled,
    buzz_on_low,
    buzz_on_critical,
    gps_enabled,
    data_retention_days
) VALUES (2, 300, 800, 0, 1, 1, 0, 90);

-- Step 2: If user_id = 1 has any non-default settings, copy them to user_id = 2
-- (Only if user_id = 2 doesn't have them set)
UPDATE settings
SET 
    full_name = COALESCE(
        (SELECT full_name FROM settings WHERE user_id = 2),
        (SELECT full_name FROM settings WHERE user_id = 1)
    ),
    address = COALESCE(
        (SELECT address FROM settings WHERE user_id = 2),
        (SELECT address FROM settings WHERE user_id = 1)
    ),
    landmark = COALESCE(
        (SELECT landmark FROM settings WHERE user_id = 2),
        (SELECT landmark FROM settings WHERE user_id = 1)
    ),
    phone = COALESCE(
        (SELECT phone FROM settings WHERE user_id = 2),
        (SELECT phone FROM settings WHERE user_id = 1)
    ),
    gps_latitude = COALESCE(
        (SELECT gps_latitude FROM settings WHERE user_id = 2),
        (SELECT gps_latitude FROM settings WHERE user_id = 1)
    ),
    gps_longitude = COALESCE(
        (SELECT gps_longitude FROM settings WHERE user_id = 2),
        (SELECT gps_longitude FROM settings WHERE user_id = 1)
    ),
    textbee_api_key = COALESCE(
        (SELECT textbee_api_key FROM settings WHERE user_id = 2),
        (SELECT textbee_api_key FROM settings WHERE user_id = 1)
    ),
    textbee_device_id = COALESCE(
        (SELECT textbee_device_id FROM settings WHERE user_id = 2),
        (SELECT textbee_device_id FROM settings WHERE user_id = 1)
    )
WHERE user_id = 2;

-- Step 3: Log the migration
INSERT INTO system_logs (level, category, message, data, created_at)
VALUES (
    'info',
    'system',
    'Settings consolidated to admin user (user_id = 2)',
    '{"migration": "012_consolidate_settings_to_user_2", "note": "All global settings now stored in user_id = 2 (admin)"}',
    datetime('now', '+8 hours')
);
