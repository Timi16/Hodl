#!/usr/bin/env bash
# Upgrades the deployed hodl-escrow in place, UUPS-style: the address, storage
# and locked funds stay the same, only the code changes.
#
#   scripts/upgrade.sh [CONTRACT_ID]           # build the current source and upgrade to it
#   WASM=path/to.wasm scripts/upgrade.sh       # upgrade to a specific wasm
#
# SOURCE (default: deployer) must be the contract admin. CONTRACT_ID defaults to
# deployments/<network>.env. SKIP_BINDINGS=1 skips regenerating web/contract.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
SOURCE="${SOURCE:-deployer}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

CONTRACT_ID="${1:-}"
if [ -z "$CONTRACT_ID" ] && [ -f "deployments/$NETWORK.env" ]; then
  CONTRACT_ID="$(grep '^NEXT_PUBLIC_HODL_CONTRACT_ID=' "deployments/$NETWORK.env" | cut -d= -f2)"
fi
[ -n "$CONTRACT_ID" ] || { echo "usage: scripts/upgrade.sh <CONTRACT_ID>" >&2; exit 1; }

view() {
  stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" \
    --send=no -- "$@"
}

step "Checks"
ADMIN="$(view admin | tr -d '"')"
[ "$ADMIN" = "$(stellar keys address "$SOURCE")" ] || {
  echo "$SOURCE is not the admin of $CONTRACT_ID (admin is $ADMIN)" >&2
  exit 1
}
[ "$(view upgrades_enabled)" = "true" ] || {
  echo "Upgrades are locked on $CONTRACT_ID; its code is final." >&2
  exit 1
}
BEFORE="$(view version)"
echo "contract: $CONTRACT_ID (version $BEFORE)"

if [ -z "${WASM:-}" ]; then
  step "Build"
  stellar contract build --package hodl-escrow
  WASM="target/wasm32v1-none/release/hodl_escrow.wasm"
fi

step "Upload $WASM"
HASH="$(stellar contract upload --wasm "$WASM" --source "$SOURCE" --network "$NETWORK")"
echo "wasm hash: $HASH"

step "Upgrade"
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" \
  -- upgrade --new_wasm_hash "$HASH"
AFTER="$(view version 2>/dev/null || echo "unknown (new code has no version())")"
echo "version: $BEFORE → $AFTER"

if [ -z "${SKIP_BINDINGS:-}" ]; then
  step "TypeScript bindings"
  NETWORK="$NETWORK" "$ROOT/scripts/bindings.sh" "$CONTRACT_ID"
fi

step "Done"
echo "Same address, new code: https://stellar.expert/explorer/$NETWORK/contract/$CONTRACT_ID"
echo "If this version changes the storage layout, run its migrate function now."
