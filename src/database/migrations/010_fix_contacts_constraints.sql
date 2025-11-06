-- Migration: Fix contacts table constraints
-- Purpose: Allow NULL user_id for emergency contacts (public contacts have no owner)
-- Date: 2025-10-14

-- SQLite doesn't support ALTER TABLE ... MODIFY COLUMN
-- We need to recreate the table with correct constraints

PRAGMA foreign_keys=OFF;

-- Create backup of existing contacts
CREATE TABLE contacts_backup AS SELECT * FROM contacts;

-- Drop the old table
DROP TABLE contacts;

-- Recreate with correct constraints
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,  -- Allow NULL for emergency contacts
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    type TEXT NOT NULL CHECK(type IN ('internal', 'emergency')),
    is_public BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Restore data from backup
INSERT INTO contacts SELECT * FROM contacts_backup;

-- Drop backup table
DROP TABLE contacts_backup;

PRAGMA foreign_keys=ON;
