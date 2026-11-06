// Generate valid PNG icons for Chrome Extension
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Minimal valid 1x1 green RGBA PNG base64
// We can use a simple valid canvas-free PNG generator for solid color with SMC symbol
function createSolidPNG(size) {
  // A simple 1-pixel PNG stretched or raw valid PNG
  // Base64 of a minimal 1x1 green (#00d4aa) PNG
  const greenPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return Buffer.from(greenPngBase64, 'base64');
}

for (const size of [16, 32, 48, 128]) {
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, createSolidPNG(size));
  console.log(`Generated ${filePath}`);
}

