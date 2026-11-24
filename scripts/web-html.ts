// Finishes the web build's HTML (run by scripts/build-web.sh):
// - home-screen tags, so "Add to Home Screen" on an iPhone gives the app icon
//   and opens without Safari's toolbars
// - noindex, while the rubric is a draft
// - a 404.html copy, so GitHub Pages serves the app for deep links such as
//   /scan/product/5449000000996
// Usage: node scripts/web-html.ts <dist-dir> [base-url]

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, base = ''] = process.argv.slice(2);
if (dir === undefined) throw new Error('Usage: node scripts/web-html.ts <dist-dir> [base-url]');

const file = join(dir, 'index.html');
const html = readFileSync(file, 'utf8');
if (!html.includes('</head>')) throw new Error(`${file} has no </head>`);

const tags = [
  '<meta name="robots" content="noindex">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="MINDMODX Scan">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="theme-color" content="#F2F4F7">',
  `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">`,
].join('');

writeFileSync(file, html.replace('</head>', `${tags}</head>`));
copyFileSync(file, join(dir, '404.html'));
console.log(`web-html: home-screen tags and 404.html written in ${dir}`);
