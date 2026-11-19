#!/bin/bash
# Monitor the marketplace contract and alert on risky activity.
# Usage: ./scripts/monitor-contract.sh [testnet|mainnet|futurenet]
#
# Each run:
#   - indexes contract events over the last WINDOW_LEDGERS ledgers
#   - alerts when the contract is paused
#   - alerts on a spike of disputes in the window
#   - alerts on escrows larger than LARGE_ESCROW_STROOPS
#   - alerts when recorded escrow does not match the contract's USDC balance
#   - writes a Markdown dashboard of escrow totals
#
# Environment (see scripts/ops-common.sh for the shared ones):
#   WINDOW_LEDGERS           Event window in ledgers (default: 720, about 1 hour)
#   DISPUTE_SPIKE_THRESHOLD  Disputes in the window that trigger an alert (default: 5)
#   LARGE_ESCROW_STROOPS     Escrow size that triggers an alert (default: 10000000000 = 1,000 USDC)
#   REPORT_DIR               Directory for the dashboard (default: reports)
#
# Exit codes: 0 = no alerts, 1 = error, 2 = one or more alerts raised.
# Alert runbook: docs/ops/monitoring.md

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/ops-common.sh"
ops_init "$1"

WINDOW_LEDGERS=${WINDOW_LEDGERS:-720}
DISPUTE_SPIKE_THRESHOLD=${DISPUTE_SPIKE_THRESHOLD:-5}
LARGE_ESCROW_STROOPS=${LARGE_ESCROW_STROOPS:-10000000000}
REPORT_DIR=${REPORT_DIR:-reports}
DASHBOARD_FILE="$REPORT_DIR/escrow-dashboard-$NETWORK.md"
mkdir -p "$REPORT_DIR"

ALERTS=0
raise() {
    ALERTS=$(( ALERTS + 1 ))
    ops_alert "$1"
}

echo -e "${YELLOW}📡 Monitoring $CONTRACT_ID on $NETWORK...${NC}"

# ---- Contract events -------------------------------------------------------
LATEST=$(ops_latest_ledger)
START=$(( LATEST - WINDOW_LEDGERS ))
[ "$START" -lt 1 ] && START=1

EVENT_ROWS=""
for TOPIC in job_post bid_accept approved dispute dispute_res refund reclaim claimable pause; do
    COUNT=$(ops_count_events "$TOPIC" "$START")
    EVENT_ROWS="$EVENT_ROWS| \`$TOPIC\` | $COUNT |"$'\n'
    case $TOPIC in
        dispute) DISPUTES=$COUNT ;;
        pause) PAUSE_EVENTS=$COUNT ;;
    esac
done

if [ "$DISPUTES" -ge "$DISPUTE_SPIKE_THRESHOLD" ]; then
    raise "Dispute spike: $DISPUTES disputes in the last $WINDOW_LEDGERS ledgers (threshold $DISPUTE_SPIKE_THRESHOLD)"
fi

# ---- Paused state ------------------------------------------------------------
PAUSED=$(ops_view "$CONTRACT_ID" is_paused)
if [ "$PAUSED" = "true" ]; then
    raise "Contract $CONTRACT_ID is paused"
elif [ "$PAUSE_EVENTS" -gt 0 ]; then
    raise "Contract pause state changed $PAUSE_EVENTS time(s) in the last $WINDOW_LEDGERS ledgers"
fi

# ---- Escrow state ------------------------------------------------------------
CONFIG=$(ops_view "$CONTRACT_ID" get_config)
USDC_TOKEN=$(echo "$CONFIG" | jq -r '.usdc_token')
TOTAL_LOCKED=$(ops_int "$(echo "$CONFIG" | jq -r '.total_locked_escrow')")
MAX_TOTAL=$(ops_int "$(echo "$CONFIG" | jq -r '.max_total_escrow')")
STATS=$(ops_view "$CONTRACT_ID" get_platform_stats)

ops_scan_escrows

LARGE_ROWS=""
while read -r JOB_ID STATUS AMOUNT; do
    [ -z "$JOB_ID" ] && continue
    if [ "$AMOUNT" -ge "$LARGE_ESCROW_STROOPS" ]; then
        LARGE_ROWS="$LARGE_ROWS| $JOB_ID | $STATUS | $(ops_usdc "$AMOUNT") |"$'\n'
        raise "Large escrow: job $JOB_ID holds $(ops_usdc "$AMOUNT") USDC ($STATUS)"
    fi
done <<< "$ESCROW_LIST"

BALANCE=$(ops_int "$(ops_view "$USDC_TOKEN" balance --id "$CONTRACT_ID")")
BALANCE_DRIFT=$(( BALANCE - OPEN_SUM ))
if [ "$BALANCE_DRIFT" -ne 0 ]; then
    raise "Escrow/balance mismatch: open escrows $(ops_usdc "$OPEN_SUM") USDC, contract balance $(ops_usdc "$BALANCE") USDC. See docs/ops/escrow-reconciliation.md"
fi

# ---- Dashboard ---------------------------------------------------------------
{
    echo "# Escrow Dashboard — $NETWORK"
    echo ""
    echo "- Contract: \`$CONTRACT_ID\`"
    echo "- Updated: $(date -u +%Y-%m-%dT%H:%M:%SZ) (ledger $LATEST)"
    echo "- Paused: **$PAUSED**"
    echo "- Alerts raised this run: **$ALERTS**"
    echo ""
    echo "## Escrow totals"
    echo ""
    echo "| Metric | Value |"
    echo "| --- | --- |"
    echo "| Open escrows | $OPEN_COUNT |"
    echo "| Locked in open escrows | $(ops_usdc "$OPEN_SUM") USDC |"
    echo "| — Funded | $(ops_usdc "$FUNDED_SUM") USDC |"
    echo "| — Disputed | $(ops_usdc "$DISPUTED_SUM") USDC |"
    echo "| Contract USDC balance | $(ops_usdc "$BALANCE") USDC |"
    echo "| Balance drift | $(ops_usdc "$BALANCE_DRIFT") USDC |"
    echo "| \`total_locked_escrow\` / \`max_total_escrow\` | $(ops_usdc "$TOTAL_LOCKED") / $(ops_usdc "$MAX_TOTAL") USDC |"
    echo "| Total jobs | $(echo "$STATS" | jq -r '.total_jobs') |"
    echo "| Total volume | $(ops_usdc "$(ops_int "$(echo "$STATS" | jq -r '.total_volume')")") USDC |"
    echo "| Total disputes | $(echo "$STATS" | jq -r '.total_disputes') |"
    echo ""
    echo "## Events in the last $WINDOW_LEDGERS ledgers"
    echo ""
    echo "| Event | Count |"
    echo "| --- | --- |"
    printf "%s" "$EVENT_ROWS"
    echo ""
    echo "## Large escrows (≥ $(ops_usdc "$LARGE_ESCROW_STROOPS") USDC)"
    echo ""
    echo "| Job | Status | Amount (USDC) |"
    echo "| --- | --- | --- |"
    printf "%s" "$LARGE_ROWS"
} > "$DASHBOARD_FILE"

echo -e "${GREEN}📊 Dashboard written to $DASHBOARD_FILE${NC}"

if [ "$ALERTS" -gt 0 ]; then
    echo -e "${RED}🚨 $ALERTS alert(s) raised${NC}"
    exit 2
fi

echo -e "${GREEN}✅ No alerts${NC}"
