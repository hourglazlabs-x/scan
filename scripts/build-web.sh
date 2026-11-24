#!/usr/bin/env bash
# Builds the web version into dist-web/ for GitHub Pages
# (https://hourglazlabs-x.github.io/scan/):
# - the app exported for the web under the site's base path
# - sql.js beside it (the web build's storage, see src/data/webDb.tsx)
# - the barcode reader's decoder (see src/ui/scannerSetup.web.ts)
# - home-screen tags and a 404.html copy (scripts/web-html.ts)
# - .nojekyll, so GitHub Pages serves the _expo folder
# Usage: npm run build:web   (WEB_BASE_URL=/other-path to serve elsewhere)
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${WEB_BASE_URL:-/scan}"
rm -rf dist-web
WEB_BASE_URL="$BASE" npx expo export --platform web --output-dir dist-web
mkdir -p dist-web/sqljs dist-web/zxing
cp node_modules/sql.js/dist/sql-wasm.js node_modules/sql.js/dist/sql-wasm.wasm dist-web/sqljs/
# The barcode reader's decoder (see src/ui/scannerSetup.web.ts).
cp node_modules/zxing-wasm/dist/reader/zxing_reader.wasm dist-web/zxing/
node scripts/web-html.ts dist-web "$BASE"
touch dist-web/.nojekyll
echo "Built dist-web for $BASE/"
