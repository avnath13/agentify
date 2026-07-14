#!/usr/bin/env bash
# Build the distributable skill archive from the agentify/ folder.
# Usage: scripts/build-zip.sh [output.zip]
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$repo_root/agentify.zip}"

# Stage a clean copy: node_modules never ships; test/ is repo-only (the golden
# harness compares against ../examples at the repo root, which does not exist
# in an installed skill). Build-only npm scripts and devDependencies are
# stripped from the shipped package.json. Runtime schema validation uses the
# committed standalone validators, so installing the skill never requires
# npm install.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
if [[ ! -f "$repo_root/agentify/renderers/shared/generated-validators.mjs" ]]; then
  echo 'generated validators are missing: run npm run generate:validators in agentify/' >&2
  exit 1
fi
rsync -a \
  --exclude 'node_modules' \
  --exclude 'test' \
  --exclude 'scripts/generate-validators.mjs' \
  --exclude '.DS_Store' \
  "$repo_root/agentify/" "$stage/agentify/"
node -e "
  const fs = require('fs');
  const p = '$stage/agentify/package.json';
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete pkg.scripts;
  delete pkg.devDependencies;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"
rm -f "$stage/agentify/package-lock.json"

rm -f "$out"
(cd "$stage" && zip -r -X -q "$out" agentify)

unzip -l "$out" | tail -1
echo "built $out"
