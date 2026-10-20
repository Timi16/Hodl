#!/usr/bin/env bash
# Regenerates the TypeScript client for hodl-escrow into web/contract.
#
#   scripts/bindings.sh [CONTRACT_ID]
#
# CONTRACT_ID defaults to NEXT_PUBLIC_HODL_CONTRACT_ID in deployments/<network>.env.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTRACT_ID="${1:-}"
if [ -z "$CONTRACT_ID" ] && [ -f "deployments/$NETWORK.env" ]; then
  CONTRACT_ID="$(grep '^NEXT_PUBLIC_HODL_CONTRACT_ID=' "deployments/$NETWORK.env" | cut -d= -f2)"
fi
[ -n "$CONTRACT_ID" ] || {
  echo "usage: scripts/bindings.sh <CONTRACT_ID>  (or run scripts/deploy.sh first)" >&2
  exit 1
}

# The JS SDK's generator (pinned in scripts/package.json) replaces the
# deprecated `stellar contract bindings typescript`.
[ -d scripts/node_modules ] || npm install --prefix scripts --silent
npx --prefix scripts stellar-js generate \
  --network "$NETWORK" \
  --contract-id "$CONTRACT_ID" \
  --contract-name hodl-escrow \
  --output-dir web/contract \
  --overwrite

echo "Bindings written to web/contract for $CONTRACT_ID"
