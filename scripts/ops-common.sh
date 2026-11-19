#!/bin/bash
# Shared helpers for the ops scripts (reconciliation, monitoring).
# Source this file; do not execute it directly.
#
# Environment:
#   CONTRACT_ID       Marketplace contract ID (defaults to .contract-id-$NETWORK)
#   SOURCE_ACCOUNT    Identity or secret key used to simulate read-only calls (default: deployer)
#   ALERT_WEBHOOK_URL Slack/Discord-compatible incoming webhook for alerts (optional)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ops_init() {
    NETWORK=${1:-testnet}

    case $NETWORK in
        testnet)
            RPC_URL="https://soroban-testnet.stellar.org"
            NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
            ;;
        mainnet)
            RPC_URL="https://soroban-mainnet.stellar.org"
            NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
            ;;
        futurenet)
            RPC_URL="https://rpc-futurenet.stellar.org"
            NETWORK_PASSPHRASE="Test SDF Future Network ; October 2022"
            ;;
        *)
            echo -e "${RED}❌ Unknown network: $NETWORK${NC}"
            exit 1
            ;;
    esac
    RPC_URL=${RPC_URL_OVERRIDE:-$RPC_URL}

    if [ -z "$CONTRACT_ID" ]; then
        CONTRACT_FILE=".contract-id-$NETWORK"
        if [ ! -f "$CONTRACT_FILE" ]; then
            echo -e "${RED}❌ CONTRACT_ID not set and $CONTRACT_FILE not found${NC}"
            exit 1
        fi
        CONTRACT_ID=$(cat "$CONTRACT_FILE")
    fi

    SOURCE_ACCOUNT=${SOURCE_ACCOUNT:-deployer}
}

# Simulate a read-only call and print the JSON result.
# Usage: ops_view <contract-id> <function> [args...]
ops_view() {
    local id=$1
    shift
    stellar contract invoke \
      --id "$id" \
      --source-account "$SOURCE_ACCOUNT" \
      --network "$NETWORK" \
      --rpc-url "$RPC_URL" \
      --network-passphrase "$NETWORK_PASSPHRASE" \
      -- \
      "$@"
}

# Strip surrounding quotes from an i128 JSON value ("123" -> 123).
ops_int() {
    echo "$1" | tr -d '"'
}

# Format a 7-decimal USDC amount in stroops as a decimal string.
ops_usdc() {
    local value=$1 sign=""
    if [ "$value" -lt 0 ]; then
        sign="-"
        value=$(( -value ))
    fi
    printf "%s%d.%07d" "$sign" $(( value / 10000000 )) $(( value % 10000000 ))
}

# Post an alert to ALERT_WEBHOOK_URL (no-op when unset).
# The payload carries both `text` (Slack) and `content` (Discord).
ops_alert() {
    local message="[$NETWORK] $1"
    echo -e "${RED}🚨 $message${NC}"
    if [ -n "$ALERT_WEBHOOK_URL" ]; then
        local payload
        payload=$(jq -n --arg m "$message" '{text: $m, content: $m}')
        curl -sS -X POST -H "Content-Type: application/json" -d "$payload" "$ALERT_WEBHOOK_URL" > /dev/null \
            || echo -e "${YELLOW}⚠️  Failed to deliver alert to webhook${NC}"
    fi
}
