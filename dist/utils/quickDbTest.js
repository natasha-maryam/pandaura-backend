"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../db"));
// Simple queries to test data
console.log('=== QUICK DATABASE TESTS ===\n');
// Test 1: Count all records
console.log('📊 Record Counts:');
const tables = ['users', 'organizations', 'team_members', 'invites', 'audit_logs', 'device_bindings'];
tables.forEach(table => {
    try {
        const result = db_1.default.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        console.log(`   ${table}: ${result.count} records`);
    }
    catch (error) {
        console.log(`   ${table}: ERROR - ${error.message}`);
    }
});
console.log('\n📋 Latest Activity:');
// Test 2: Latest user
try {
    const latestUser = db_1.default.prepare(`
    SELECT full_name, email, created_at 
    FROM users 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get();
    console.log('   Latest user:', latestUser);
}
catch (error) {
    console.log('   Latest user: ERROR');
}
// Test 3: Latest organization
try {
    const latestOrg = db_1.default.prepare(`
    SELECT name, industry, created_at 
    FROM organizations 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get();
    console.log('   Latest org:', latestOrg);
}
catch (error) {
    console.log('   Latest org: ERROR');
}
// Test 4: Latest audit log
try {
    const latestAudit = db_1.default.prepare(`
    SELECT action, created_at 
    FROM audit_logs 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get();
    console.log('   Latest audit:', latestAudit);
}
catch (error) {
    console.log('   Latest audit: ERROR');
}
console.log('\n✅ Database tests completed!');
