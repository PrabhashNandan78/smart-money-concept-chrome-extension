// Script to ZIP the dist/ folder for distribution
import { createWriteStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('❌ dist/ folder not found. Run npm run build:extension first.');
  process.exit(1);
}

const zipPath = join(root, 'smc-trading-extension.zip');

// Use PowerShell to zip on Windows
execSync(`powershell -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${zipPath}' -Force"`, {
  stdio: 'inherit',
});

console.log(`\n✓ Extension packaged: ${zipPath}`);

