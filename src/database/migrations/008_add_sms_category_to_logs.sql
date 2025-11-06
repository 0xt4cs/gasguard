-- Migration: Add 'sms' category to system_logs
-- This migration adds 'sms' to the allowed categories for system logging
-- SQLite doesn't support ALTER TABLE to modify CHECK constraints
-- So we drop and recreate the table

-- Drop any partial tables from failed migrations
DROP TABLE IF EXISTS system_logs_new;

-- Drop existing table for fresh start
DROP TABLE IF EXISTS system_logs;

-- Create new table with 'sms' category included
CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error', 'critical')),
    category TEXT NOT NULL CHECK(category IN ('system', 'sensor', 'auth', 'calibration', 'alert', 'network', 'sms')),
    message TEXT NOT NULL,
    source TEXT,
    user TEXT,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_category ON system_logs(category);
