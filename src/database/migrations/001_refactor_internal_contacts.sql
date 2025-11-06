-- ============================================================================
-- MIGRATION: Merge Internal and External Contacts into Single Table
-- Date: October 6, 2025
-- Purpose: Unify contacts into one logical table with type distinction
-- ============================================================================

-- CONCEPT:
-- - INTERNAL contacts: People within/nearby home (family, neighbors)
-- - EXTERNAL contacts: Emergency responders (fire, police, ambulance)
-- - Both are just contacts with different types - should be in same table!

-- CHANGES:
-- 1. Create unified 'contacts' table
-- 2. Merge contacts_internal + contacts_external
-- 3. Use type: 'INTERNAL' or 'EXTERNAL' (uppercase for clarity)
-- 4. Add user_id (NULL for external/public emergency contacts)
-- 5. Drop old separate tables

-- ============================================================================
-- Step 1: Create unified contacts table
-- ============================================================================
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    type TEXT NOT NULL CHECK(type IN ('INTERNAL', 'EXTERNAL')),
    is_public BOOLEAN DEFAULT 0, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 2: Migrate internal contacts (map old fields)
-- ============================================================================
INSERT INTO contacts (
    user_id,
    name,
    phone,
    alternate_phone,
    type,
    is_public,
    created_at,
    updated_at
)
SELECT 
    user_id,
    name,
    phone,
    email AS alternate_phone,
    'INTERNAL' AS type,
    0 AS is_public,
    created_at,
    updated_at
FROM contacts_internal;

-- ============================================================================
-- Step 3: Migrate external contacts (emergency services)
-- ============================================================================
INSERT INTO contacts (
    user_id,
    name,
    phone,
    alternate_phone,
    type,
    is_public,
    created_at,
    updated_at
)
SELECT 
    NULL AS user_id,
    name,
    phone,
    alternate_phone,
    'EXTERNAL' AS type,
    1 AS is_public,
    created_at,
    updated_at
FROM contacts_external;

-- ============================================================================
-- Step 4: Drop old tables
-- ============================================================================
DROP TABLE IF EXISTS contacts_internal;
DROP TABLE IF EXISTS contacts_external;

-- ============================================================================
-- Step 5: Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_contacts_is_public ON contacts(is_public);
CREATE INDEX IF NOT EXISTS idx_contacts_user_type ON contacts(user_id, type);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check internal contacts:
-- SELECT id, user_id, name, phone, alternate_phone, type, is_public FROM contacts WHERE type = 'INTERNAL';

-- Check external contacts:
-- SELECT id, user_id, name, phone, alternate_phone, type, is_public FROM contacts WHERE type = 'EXTERNAL';

-- Count by type:
-- SELECT type, is_public, COUNT(*) as count FROM contacts GROUP BY type, is_public;

-- Expected schema:
-- id, user_id, name, phone, alternate_phone, type, is_public, created_at, updated_at
