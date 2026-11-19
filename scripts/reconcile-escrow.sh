#!/bin/bash
# Daily reconciliation of the escrow ledger against the contract's on-chain USDC balance.
# Usage: ./scripts/reconcile-escrow.sh [testnet|mainnet|futurenet]
#
# Sums every open escrow (Funded or Disputed) from contract state, compares it
# with the contract's USDC balance and the `total_locked_escrow` counter in the
# config, writes a Markdown report and alerts on any non-zero drift.
#
# Environment (see scripts/ops-common.sh for the shared ones):
#   REPORT_DIR   Directory for reports (default: reports)
#
# Exit codes: 0 = balanced, 1 = error, 2 = drift detected.
# Response runbook: docs/ops/escrow-reconciliation.md

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/ops-common.sh"
ops_init "$1"

REPORT_DIR=${REPORT_DIR:-reports}
DATE=$(date -u +%Y-%m-%d)
REPORT_FILE="$REPORT_DIR/escrow-reconciliation-$NETWORK-$DATE.md"
mkdir -p "$REPORT_DIR"

echo -e "${YELLOW}🔍 Reconciling escrow for $CONTRACT_ID on $NETWORK...${NC}"

CONFIG=$(ops_view "$CONTRACT_ID" get_config)
USDC_TOKEN=$(echo "$CONFIG" | jq -r '.usdc_token')
TOTAL_LOCKED=$(ops_int "$(echo "$CONFIG" | jq -r '.total_locked_escrow')")

ops_scan_escrows

BALANCE=$(ops_int "$(ops_view "$USDC_TOKEN" balance --id "$CONTRACT_ID")")
BALANCE_DRIFT=$(( BALANCE - OPEN_SUM ))
COUNTER_DRIFT=$(( TOTAL_LOCKED - OPEN_SUM ))

if [ "$BALANCE_DRIFT" -eq 0 ] && [ "$COUNTER_DRIFT" -eq 0 ]; then
    RESULT="✅ Balanced"
else
    RESULT="🚨 Drift detected"
fi

{
    echo "# Escrow Reconciliation — $NETWORK — $DATE"
    echo ""
    echo "- Contract: \`$CONTRACT_ID\`"
    echo "- USDC token: \`$USDC_TOKEN\`"
    echo "- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- Result: **$RESULT**"
    echo ""
    echo "| Metric | USDC |"
    echo "| --- | --- |"
    echo "| Open escrows ($OPEN_COUNT) | $(ops_usdc "$OPEN_SUM") |"
    echo "| — Funded | $(ops_usdc "$FUNDED_SUM") |"
    echo "| — Disputed | $(ops_usdc "$DISPUTED_SUM") |"
    echo "| Contract USDC balance | $(ops_usdc "$BALANCE") |"
    echo "| \`total_locked_escrow\` counter | $(ops_usdc "$TOTAL_LOCKED") |"
    echo "| Balance drift (balance − open escrows) | $(ops_usdc "$BALANCE_DRIFT") |"
    echo "| Counter drift (counter − open escrows) | $(ops_usdc "$COUNTER_DRIFT") |"
    echo ""
    echo "## Open escrows"
    echo ""
    echo "| Job | Status | Amount (USDC) |"
    echo "| --- | --- | --- |"
    printf "%s" "$ESCROW_ROWS"
} > "$REPORT_FILE"

echo -e "${GREEN}📄 Report written to $REPORT_FILE${NC}"

if [ "$BALANCE_DRIFT" -ne 0 ] || [ "$COUNTER_DRIFT" -ne 0 ]; then
    ops_alert "Escrow drift on $CONTRACT_ID: balance drift $(ops_usdc "$BALANCE_DRIFT") USDC, counter drift $(ops_usdc "$COUNTER_DRIFT") USDC. See docs/ops/escrow-reconciliation.md"
    exit 2
fi

echo -e "${GREEN}✅ Escrow ledger matches on-chain balance${NC}"
