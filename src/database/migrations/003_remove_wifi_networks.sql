-- Migration: Remove unused wifi_networks table
-- Date: 2025-10-09
-- Reason: WiFi management uses nmcli directly, table is not used anywhere in codebase

-- Drop trigger first
DROP TRIGGER IF EXISTS update_wifi_networks_timestamp;

-- Drop table
DROP TABLE IF EXISTS wifi_networks;

-- Verification query (should return 0)
-- SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='wifi_networks';
