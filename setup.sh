#!/usr/bin/env bash
# Sets up the local, isolated dev environment for github-differ.
# Does NOT install system software. Dependencies live in ./node_modules (Bun-managed).
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Checking for Bun..."
if ! command -v bun >/dev/null 2>&1; then
  cat >&2 <<'EOF'
ERROR: `bun` is not installed.

github-differ uses Bun as its package manager/runtime. Install it once
(https://bun.sh) and re-run ./setup.sh. We do not auto-install system tools.

  curl -fsSL https://bun.sh/install | bash
EOF
  exit 1
fi
echo "    bun $(bun --version) found."

echo "==> Installing dependencies (local node_modules)..."
bun install

echo
echo "==> Done. Next steps:"
echo "    make dev     # build the unpacked extension with HMR (wxt dev)"
echo "    make build   # production build"
echo "    make test    # unit tests"
echo
echo "Then load the unpacked extension from build/chrome-mv3/ in your browser,"
echo "open the Options page, and paste a GitHub PAT + Anthropic API key."
