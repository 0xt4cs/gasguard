-- GasGuard Database Schema
-- SQLite3 Database for IoT Gas Leak Detection System

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- Create default users (hashed passwords will be inserted by migration)
-- Default: user/user123 and admin/admin123

-- ============================================================================
-- SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT,
    address TEXT,
    landmark TEXT,
    phone TEXT,
    gps_enabled BOOLEAN DEFAULT 0,
    gps_latitude REAL,
    gps_longitude REAL,
    low_level_threshold INTEGER DEFAULT 300,
    critical_level_threshold INTEGER DEFAULT 800,
    sms_enabled BOOLEAN DEFAULT 0,
    sms_alerts_enabled INTEGER DEFAULT 0,
    textbee_api_key TEXT,
    textbee_device_id TEXT,
    buzz_on_low BOOLEAN DEFAULT 1,
    buzz_on_critical BOOLEAN DEFAULT 1,
    data_retention_days INTEGER DEFAULT 90,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- CONTACTS TABLE - Unified (Internal + External)
-- ============================================================================
-- INTERNAL: People within/nearby home to respond (family, neighbors)
-- EXTERNAL: Emergency responders/services (emergency servvices)
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,  -- NULL for public/external emergency contacts
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    type TEXT NOT NULL CHECK(type IN ('INTERNAL', 'EXTERNAL')),
    is_public BOOLEAN DEFAULT 0,  -- TRUE for default emergency services
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_contacts_is_public ON contacts(is_public);
CREATE INDEX IF NOT EXISTS idx_contacts_user_type ON contacts(user_id, type);

-- ============================================================================
-- SENSOR DATA HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now', '+8 hours')),
    mq6_ppm REAL NOT NULL,
    mq6_raw INTEGER NOT NULL,
    mq2_ppm REAL NOT NULL,
    mq2_raw INTEGER NOT NULL,
    gas_type TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK(risk_level IN ('normal', 'low', 'critical')),
    alert_level TEXT NOT NULL CHECK(alert_level IN ('normal', 'low', 'critical')),
    gps_latitude REAL,
    gps_longitude REAL,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_alert_level ON sensor_data(alert_level);

-- ============================================================================
-- CALIBRATION DATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS calibration_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor TEXT NOT NULL CHECK(sensor IN ('mq6', 'mq2')),
    baseline_resistance REAL NOT NULL,
    sensitivity_factor REAL NOT NULL,
    drift REAL DEFAULT 0,
    degradation TEXT DEFAULT 'Normal',
    status TEXT DEFAULT 'good' CHECK(status IN ('good', 'warning', 'critical')),
    auto_calibration_enabled BOOLEAN DEFAULT 0,
    last_calibration DATETIME DEFAULT (datetime('now', '+8 hours')),
    manual_calibration_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- ============================================================================
-- CALIBRATION HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS calibration_history (
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
    timestamp DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (calibration_id) REFERENCES calibration_data(id) ON DELETE SET NULL,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- SYSTEM LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now', '+8 hours')),
    level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error', 'critical')),
    category TEXT NOT NULL CHECK(category IN ('system', 'sensor', 'auth', 'calibration', 'alert', 'network', 'sms')),
    message TEXT NOT NULL,
    source TEXT,
    user TEXT,
    data TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- Index for faster log queries
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_category ON system_logs(category);

-- ============================================================================
-- ALERTS TABLE - Simplified & Optimized
-- ============================================================================
-- References sensor_data to avoid duplication (normalized)
-- SMS notification tracking only (no acknowledgment needed)
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_data_id INTEGER NOT NULL,  -- Foreign key to sensor_data
    alert_type TEXT NOT NULL CHECK(alert_type IN ('low', 'critical')),
    sms_sent BOOLEAN DEFAULT 0,
    sms_recipients TEXT,  -- JSON array of contacts notified
    sms_sent_at DATETIME,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (sensor_data_id) REFERENCES sensor_data(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_alerts_sensor_data ON alerts(sensor_data_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

-- ============================================================================
-- TRIGGERS for updated_at timestamps
-- ============================================================================

-- Users
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = datetime('now', '+8 hours') WHERE id = NEW.id;
END;

-- Settings
CREATE TRIGGER IF NOT EXISTS update_settings_timestamp 
AFTER UPDATE ON settings
BEGIN
    UPDATE settings SET updated_at = datetime('now', '+8 hours') WHERE id = NEW.id;
END;

-- Contacts (unified table)
CREATE TRIGGER IF NOT EXISTS update_contacts_timestamp 
AFTER UPDATE ON contacts
BEGIN
    UPDATE contacts SET updated_at = datetime('now', '+8 hours') WHERE id = NEW.id;
END;

-- Calibration Data
CREATE TRIGGER IF NOT EXISTS update_calibration_data_timestamp 
AFTER UPDATE ON calibration_data
BEGIN
    UPDATE calibration_data SET updated_at = datetime('now', '+8 hours') WHERE id = NEW.id;
END;

-- ============================================================================
-- TIMEZONE CONFIGURATION
-- ============================================================================
-- IMPORTANT: Raspberry Pi timezone set to Asia/Manila (UTC+8)
-- Run: sudo timedatectl set-timezone Asia/Manila
-- 
-- NOTE: SQLite's localtime modifier doesn't work reliably on all systems
-- Solution: Explicitly add +8 hours to UTC time for Manila timezone
-- This ensures consistent Manila time regardless of SQLite compilation options
-- ============================================================================


