#!/usr/bin/env bash
# Print CONF ARMADURA versionName from package.json (0.mid.last-YYYYMMDD).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node -p "require('$ROOT/package.json').version"
