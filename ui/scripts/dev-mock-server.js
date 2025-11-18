#!/usr/bin/env node

/**
 * Dev server for serving mock job platform pages
 * Serves mock HTML files on localhost for testing
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.VITE_MOCK_PORT || 3000;
const MOCKS_DIR = join(__dirname, '../public/mocks');

// Platform configuration
const PLATFORMS = [
  { name: 'linkedin', path: 'linkedin-jobs.html' },
  { name: 'indeed', path: 'indeed-jobs.html' },
];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

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

