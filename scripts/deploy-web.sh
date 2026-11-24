#!/usr/bin/env bash
# Builds the web version and publishes it to the gh-pages branch, which GitHub
# Pages serves at https://hourglazlabs-x.github.io/scan/ (Settings → Pages →
# Deploy from a branch → gh-pages, / (root)). The branch holds only build
# output and is replaced on every deploy.
# Usage: npm run deploy:web
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/build-web.sh
remote="$(git remote get-url origin)"
sha="$(git rev-parse --short HEAD)"
work="$(mktemp -d)"
cp -R dist-web/. "$work"
cd "$work"
git init -q
git checkout -q -b gh-pages
git add -A
git commit -q -m "Web build of $sha" ${DEPLOY_COMMIT_TRAILER:+-m "$DEPLOY_COMMIT_TRAILER"}
git push -q -f "$remote" gh-pages
echo "Published the web build of $sha to gh-pages."
