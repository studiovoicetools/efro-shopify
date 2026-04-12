#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d node_modules ]; then
  npm install --no-package-lock --no-audit --no-fund
fi
node --check server.js
