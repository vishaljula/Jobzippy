#!/usr/bin/env node

/**
 * Dev server for serving mock job platform pages
 * Serves mock HTML files on localhost for testing
 */

import { createServer } from 'http';
import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.VITE_MOCK_PORT || 3000;
const MOCKS_DIR = join(__dirname, '../public/mocks');
const SUBMISSIONS_FILE = join(MOCKS_DIR, 'mock-submissions.log');

// Platform configuration
const PLATFORMS = [
  { name: 'linkedin', path: 'linkedin-jobs.html' },
  { name: 'indeed', path: 'indeed-jobs.html' },
];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Capture mock form submissions as real HTTP POSTs
  if (pathname === '/mock-submissions' && req.method === 'POST') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      // Basic safeguard against very large payloads
      if (body.length > 1e6) {
        req.socket.destroy();
      }
    });

    req.on('end', () => {
      const timestamp = new Date().toISOString();
      let payload;

      try {
        const json = JSON.parse(body || '{}');
        payload = JSON.stringify(json, null, 2);
      } catch {
        payload = body || '{}';
      }

      const logEntry = `=== Mock Submission @ ${timestamp} ===\n${payload}\n\n`;

      try {
        appendFileSync(SUBMISSIONS_FILE, logEntry, 'utf-8');
        console.log('[Mock Server] Recorded mock submission');
      } catch (err) {
        console.error('[Mock Server] Failed to write mock submission:', err);
      }

      res.writeHead(204);
      res.end();
    });

    return;
  }

  // Serve mock pages
  if (pathname.startsWith('/mocks/')) {
    const fileName = pathname.replace('/mocks/', '');
    const filePath = join(MOCKS_DIR, fileName);

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      console.log(`[Mock Server] Served: ${pathname}`);
      return;
    }
  }

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', platforms: PLATFORMS.map(p => p.name) }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[Mock Server] Running on http://localhost:${PORT}`);
  console.log(`[Mock Server] Available mock pages:`);
  PLATFORMS.forEach((platform) => {
    console.log(`  - http://localhost:${PORT}/mocks/${platform.path}`);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Mock Server] Port ${PORT} is already in use. Set VITE_MOCK_PORT to use a different port.`);
  } else {
    console.error('[Mock Server] Error:', err);
  }
  process.exit(1);
});

