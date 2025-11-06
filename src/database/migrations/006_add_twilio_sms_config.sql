-- Migration: Add Twilio SMS configuration to settings
-- Description: Adds columns for SMS alert configuration using Twilio API
-- Date: 2025-10-13

-- Add Twilio SMS configuration columns
ALTER TABLE settings ADD COLUMN sms_alerts_enabled INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN twilio_account_sid TEXT;
ALTER TABLE settings ADD COLUMN twilio_auth_token TEXT;
ALTER TABLE settings ADD COLUMN twilio_phone_number TEXT;

-- Update existing settings to have SMS disabled by default
UPDATE settings SET sms_alerts_enabled = 0 WHERE sms_alerts_enabled IS NULL;

-- Log migration
INSERT INTO system_logs (timestamp, level, category, message, source, user)
VALUES (datetime('now'), 'info', 'system', 'Migration 006: Added Twilio SMS configuration columns', 'migration', 'system');
