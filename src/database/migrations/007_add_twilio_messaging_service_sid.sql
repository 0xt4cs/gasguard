-- Migration: Add Twilio Messaging Service SID support
-- This allows using Twilio Messaging Services instead of a single phone number
-- Messaging Services are useful for:
-- - Better deliverability
-- - Load balancing across multiple numbers
-- - Geographic routing

ALTER TABLE settings ADD COLUMN twilio_messaging_service_sid TEXT;
