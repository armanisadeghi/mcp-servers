#!/usr/bin/env bash
# Matrx Ship CLI wrapper for non-Node projects
# This script invokes ship.ts via npx tsx so you don't need pnpm/package.json.
#
# Usage:
#   bash scripts/matrx/ship.sh setup --token YOUR_TOKEN
#   bash scripts/matrx/ship.sh init my-project "My Project"
#   bash scripts/matrx/ship.sh "commit message"
#   bash scripts/matrx/ship.sh --minor "commit message"
#   bash scripts/matrx/ship.sh history
#   bash scripts/matrx/ship.sh update
#   bash scripts/matrx/ship.sh status
#   bash scripts/matrx/ship.sh help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIP_TS="${SCRIPT_DIR}/ship.ts"

if [ ! -f "$SHIP_TS" ]; then
  echo "❌ ship.ts not found at ${SHIP_TS}"
  echo "   Re-run the installer:"
  echo "   curl -sL https://raw.githubusercontent.com/armanisadeghi/matrx-ship/main/cli/install.sh | bash"
  exit 1
fi

# Use npx tsx to run the TypeScript CLI
exec npx tsx "$SHIP_TS" "$@"
