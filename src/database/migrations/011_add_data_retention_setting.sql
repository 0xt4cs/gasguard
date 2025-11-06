-- Migration: Add configurable data retention setting
-- Description: Allows admin to configure data retention period (30, 90, 180, 365 days, or never)
-- Date: 2025-11-03

-- NOTE: Column may already exist from schema.sql - this migration ensures default values are set

-- Set default value for existing records where it's NULL
-- This is safe to run even if column already exists
UPDATE settings 
SET data_retention_days = 90 
WHERE data_retention_days IS NULL;

-- Log migration
INSERT INTO system_logs (timestamp, level, category, message, source, user)
VALUES (datetime('now', '+8 hours'), 'info', 'system', 'Migration 011: Configured data retention setting defaults', 'migration', 'system');
