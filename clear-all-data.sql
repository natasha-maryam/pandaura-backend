-- Delete all data from all tables
-- Run this with: sqlite3 pandaura.db < clear-all-data.sql

BEGIN TRANSACTION;

-- Disable foreign key constraints temporarily
PRAGMA foreign_keys = OFF;

-- Delete all data from tables in correct order (respecting foreign keys)
DELETE FROM audit_logs;
DELETE FROM temp_device_bindings;
DELETE FROM device_bindings;
DELETE FROM invites;
DELETE FROM team_members;
DELETE FROM users;
DELETE FROM organizations;
DELETE FROM session_policy;

-- Reset auto-increment sequences
DELETE FROM sqlite_sequence WHERE name = 'session_policy';

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

COMMIT;

-- Show the results
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL  
SELECT 'team_members', COUNT(*) FROM team_members
UNION ALL
SELECT 'invites', COUNT(*) FROM invites
UNION ALL
SELECT 'device_bindings', COUNT(*) FROM device_bindings
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs
UNION ALL
SELECT 'session_policy', COUNT(*) FROM session_policy
UNION ALL
SELECT 'temp_device_bindings', COUNT(*) FROM temp_device_bindings;
