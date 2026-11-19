#!/bin/bash
# Shared helpers for the ops scripts (reconciliation, monitoring).
# Source this file; do not execute it directly.
#
# Environment:
#   CONTRACT_ID       Marketplace contract ID (defaults to .contract-id-$NETWORK)
#   SOURCE_ACCOUNT    Identity or secret key used to simulate read-only calls (default: deployer)
#   ALERT_WEBHOOK_URL Slack/Discord-compatible incoming webhook for alerts (optional)
#   PAGE_SIZE         Jobs fetched per get_all_jobs call (default: 50)

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

# Walk every job and collect the escrows that still hold funds (Funded or Disputed).
# Requires CONTRACT_ID. Sets:
#   OPEN_SUM, OPEN_COUNT, FUNDED_SUM, DISPUTED_SUM  totals in stroops
#   ESCROW_LIST  one "job_id status amount" line per open escrow
#   ESCROW_ROWS  the same as Markdown table rows
ops_scan_escrows() {
    local page_size=${PAGE_SIZE:-50} offset=0 page page_len job_id escrow status amount
    OPEN_SUM=0
    OPEN_COUNT=0
    FUNDED_SUM=0
    DISPUTED_SUM=0
    ESCROW_LIST=""
    ESCROW_ROWS=""
    while true; do
        page=$(ops_view "$CONTRACT_ID" get_all_jobs --offset "$offset" --limit "$page_size")
        page_len=$(echo "$page" | jq 'length')
        [ "$page_len" -eq 0 ] && break

        for job_id in $(echo "$page" | jq -r '.[] | select((.escrow_amount | tostring) != "0") | .id'); do
            escrow=$(ops_view "$CONTRACT_ID" get_escrow_by_job --job_id "$job_id")
            [ "$escrow" = "null" ] && continue

            status=$(echo "$escrow" | jq -r '.status')
            amount=$(ops_int "$(echo "$escrow" | jq -r '.amount')")
            case $status in
                Funded) FUNDED_SUM=$(( FUNDED_SUM + amount )) ;;
                Disputed) DISPUTED_SUM=$(( DISPUTED_SUM + amount )) ;;
                *) continue ;;
            esac
            OPEN_SUM=$(( OPEN_SUM + amount ))
            OPEN_COUNT=$(( OPEN_COUNT + 1 ))
            ESCROW_LIST="$ESCROW_LIST$job_id $status $amount"$'\n'
            ESCROW_ROWS="$ESCROW_ROWS| $job_id | $status | $(ops_usdc "$amount") |"$'\n'
        done

        offset=$(( offset + page_size ))
    done
}

# Base64 XDR of an ScVal Symbol, used as an event topic filter.
ops_symbol_xdr() {
    local s=$1 len=${#1} pad hex i
    pad=$(( (4 - len % 4) % 4 ))
    hex=$(printf '0000000f%08x' "$len")$(printf '%s' "$s" | od -An -tx1 | tr -d ' \n')
    for ((i = 0; i < pad; i++)); do hex="${hex}00"; done
    for ((i = 0; i < ${#hex}; i += 2)); do printf "\x${hex:i:2}"; done | base64 -w0
}

# Latest ledger sequence known to the RPC.
ops_latest_ledger() {
    curl -sS -X POST "$RPC_URL" -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | jq -r '.result.sequence'
}

# Count contract events with the given topic symbol since a ledger.
# Usage: ops_count_events <symbol> <start-ledger>
ops_count_events() {
    local topic request
    topic=$(ops_symbol_xdr "$1")
    request=$(jq -n --arg id "$CONTRACT_ID" --arg topic "$topic" --argjson start "$2" '{
        jsonrpc: "2.0", id: 1, method: "getEvents",
        params: {
            startLedger: $start,
            filters: [{type: "contract", contractIds: [$id], topics: [[$topic]]}],
            pagination: {limit: 1000}
        }
    }')
    curl -sS -X POST "$RPC_URL" -H "Content-Type: application/json" -d "$request" \
        | jq '.result.events | length'
}
