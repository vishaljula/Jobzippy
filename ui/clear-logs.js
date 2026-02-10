#!/usr/bin/env node
/**
 * Clear log files for fresh test run
 * Usage: node clear-logs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENT_LOG_FILE = path.join(__dirname, 'agent-logs.txt');
const MOCK_LOG_FILE = path.join(__dirname, 'public', 'mocks', 'mock-submissions.log');

console.log('🧹 Clearing log files...\n');

// Clear agent-logs.txt
try {
    fs.writeFileSync(AGENT_LOG_FILE, `=== Agent Logs - ${new Date().toISOString()} ===\n\n`);
    console.log('✅ Cleared: agent-logs.txt');
} catch (error) {
    console.error('❌ Failed to clear agent-logs.txt:', error.message);
}

// Clear mock-submissions.log
try {
    fs.writeFileSync(MOCK_LOG_FILE, '');
    console.log('✅ Cleared: public/mocks/mock-submissions.log');
} catch (error) {
    console.error('❌ Failed to clear mock-submissions.log:', error.message);
}

console.log('\n🎉 Done! Log files cleared.');
console.log('💡 Now run your browser console script to clear chrome.storage and IndexedDB');
