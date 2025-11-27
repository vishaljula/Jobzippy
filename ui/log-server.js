/**
 * WebSocket Logging Server
 * Receives logs from Chrome extension and writes them to agent-logs.txt
 * Run with: npm run log-server
 */

import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 9999;
const LOG_FILE = path.join(__dirname, 'agent-logs.txt');

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`[Log Server] Starting on ws://localhost:${PORT}`);
console.log(`[Log Server] Writing logs to: ${LOG_FILE}`);

// Clear log file on startup
fs.writeFileSync(LOG_FILE, `=== Agent Logs - ${new Date().toISOString()} ===\n\n`);

wss.on('connection', (ws) => {
    console.log('[Log Server] Extension connected');

    ws.on('message', (message) => {
        const logEntry = message.toString();

        // Write to file
        fs.appendFileSync(LOG_FILE, logEntry + '\n');

        // Also echo to console
        console.log(logEntry);
    });

    ws.on('close', () => {
        console.log('[Log Server] Extension disconnected');
    });

    ws.on('error', (error) => {
        console.error('[Log Server] WebSocket error:', error);
    });
});

wss.on('error', (error) => {
    console.error('[Log Server] Server error:', error);
});

console.log('[Log Server] Ready! Waiting for extension to connect...');
