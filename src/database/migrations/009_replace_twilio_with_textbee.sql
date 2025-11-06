-- Migration: Replace Twilio with TextBee SMS Gateway
-- Description: Replaces expensive Twilio service with TextBee (open-source, uses your Android phone as SMS gateway)
-- Date: 2025-10-14

-- TextBee is a FREE alternative to Twilio
-- Uses your Android phone as an SMS gateway
-- Repository: https://github.com/vernu/textbee
-- Documentation: https://api.textbee.dev/

-- Drop existing Twilio columns
ALTER TABLE settings DROP COLUMN twilio_account_sid;
ALTER TABLE settings DROP COLUMN twilio_auth_token;
ALTER TABLE settings DROP COLUMN twilio_phone_number;
ALTER TABLE settings DROP COLUMN twilio_messaging_service_sid;

-- Add TextBee columns
ALTER TABLE settings ADD COLUMN textbee_api_key TEXT;
ALTER TABLE settings ADD COLUMN textbee_device_id TEXT;

-- sms_alerts_enabled column already exists, just keep it

-- Update existing settings to have SMS disabled by default
UPDATE settings SET sms_alerts_enabled = 0 WHERE sms_alerts_enabled IS NULL;

-- Clear any existing Twilio-related data (if columns still exist somehow)
UPDATE settings SET textbee_api_key = NULL, textbee_device_id = NULL;

-- Log migration
INSERT INTO system_logs (timestamp, level, category, message, source, user)
VALUES (datetime('now'), 'info', 'system', 'Migration 009: Replaced Twilio with TextBee SMS gateway', 'migration', 'system');
