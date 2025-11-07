/**
 * Generate placeholder icons for the Chrome extension
 * These are simple colored squares with the "J" letter
 * Replace with proper icons from a designer later
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG icons for each size
sizes.forEach((size) => {
  const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <text 
    x="50%" 
    y="50%" 
    dominant-baseline="central" 
    text-anchor="middle" 
    font-family="Arial, sans-serif" 
    font-size="${size * 0.6}" 
    font-weight="bold" 
    fill="white"
  >J</text>
</svg>
  `.trim();

  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Generated ${filename}`);
});

console.log('Icons generated successfully!');
console.log('Note: For production, convert SVGs to PNGs or replace with professional icons.');

