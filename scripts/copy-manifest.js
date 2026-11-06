// Script to copy manifest, icons, and CSS to dist/ after Vite build
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
}

// Read public/manifest.json and transform paths for production dist
const manifestRaw = readFileSync(join(root, 'public', 'manifest.json'), 'utf-8');
const manifest = JSON.parse(manifestRaw);

// Exact host permissions for persistent access on TradingView domains
manifest.host_permissions = [
  'https://in.tradingview.com/*',
  'https://www.tradingview.com/*',
];

// Update paths for production bundle
manifest.background = {
  service_worker: 'service-worker.js',
  type: 'module',
};

manifest.content_scripts = [
  {
    matches: [
      'https://in.tradingview.com/*',
      'https://www.tradingview.com/*',
    ],
    js: ['content-script.js'],
    css: ['overlay.css'],
    run_at: 'document_idle',
  },
];

manifest.side_panel = {
  default_path: 'index.html',
};

manifest.web_accessible_resources = [
  {
    resources: ['overlay.css'],
    matches: [
      'https://in.tradingview.com/*',
      'https://www.tradingview.com/*',
    ],
  },
];

writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('✓ Wrote production dist/manifest.json with in.tradingview.com and www.tradingview.com permissions');

// Copy overlay.css
const overlayCssSrc = join(root, 'src', 'content', 'overlay.css');
if (existsSync(overlayCssSrc)) {
  copyFileSync(overlayCssSrc, join(dist, 'overlay.css'));
  console.log('✓ Copied overlay.css');
}

// Copy icons if they exist
const iconsDir = join(root, 'public', 'icons');
const distIconsDir = join(dist, 'icons');
if (existsSync(iconsDir)) {
  if (!existsSync(distIconsDir)) mkdirSync(distIconsDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const src = join(iconsDir, `icon${size}.png`);
    if (existsSync(src)) {
      copyFileSync(src, join(distIconsDir, `icon${size}.png`));
      console.log(`✓ Copied icon${size}.png`);
    }
  }
}

console.log('\n✓ Extension build complete. Load dist/ as unpacked extension in Chrome.');
