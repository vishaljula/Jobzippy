/**
 * WebSocket Logging Server + HTTP Clear Endpoint
 * Receives logs from Chrome extension and writes them to agent-logs.txt
 * Also provides HTTP endpoint to clear log files
 * Run with: npm run log-server
 */

import { WebSocketServer } from 'ws';
import http from 'http';
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

// === HTTP Server for Clear Logs Endpoint ===
const HTTP_PORT = 3001;
const MOCK_LOG_FILE = path.join(__dirname, 'public', 'mocks', 'mock-submissions.log');

const httpServer = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/clear-logs') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { files } = JSON.parse(body);
                const results = [];

                // Clear agent-logs.txt
                if (files.includes('agent-logs.txt')) {
                    fs.writeFileSync(LOG_FILE, `=== Agent Logs - ${new Date().toISOString()} ===\n\n`);
                    results.push('agent-logs.txt cleared');
                }

                // Clear mock-submissions.log
                if (files.includes('public/mocks/mock-submissions.log')) {
                    fs.writeFileSync(MOCK_LOG_FILE, '');
                    results.push('mock-submissions.log cleared');
                }

                console.log(`[HTTP Server] Cleared logs: ${results.join(', ')}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, cleared: results }));
            } catch (error) {
                console.error('[HTTP Server] Error clearing logs:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

httpServer.listen(HTTP_PORT, () => {
    console.log(`[HTTP Server] Listening on http://localhost:${HTTP_PORT}`);
    console.log(`[HTTP Server] POST /clear-logs to clear log files`);
});
