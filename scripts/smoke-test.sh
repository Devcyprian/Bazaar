#!/bin/bash
# smoke-test.sh - Post-deploy smoke test for the AI Agent Marketplace contract
# Usage: ./scripts/smoke-test.sh [testnet|mainnet|futurenet] [test-account]
#
# Runs read-only checks against the deployed contract, then a tiny job
# lifecycle (post_job at the minimum budget -> get_job -> cancel_job) from a
# dedicated test account. post_job does not move funds, so the only cost is
# transaction fees. Exits non-zero if any check fails.

NETWORK=${1:-testnet}
TEST_ACCOUNT=${2:-smoke-tester}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONTRACT_FILE=".contract-id-$NETWORK"
if [ ! -f "$CONTRACT_FILE" ]; then
    echo -e "${RED}❌ Contract ID file not found: $CONTRACT_FILE${NC}"
    echo "Run deploy-contract.sh first"
    exit 1
fi

CONTRACT_ID=$(cat "$CONTRACT_FILE")
TEST_ADDRESS=$(stellar keys address "$TEST_ACCOUNT") || {
    echo -e "${RED}❌ Test account not found: $TEST_ACCOUNT${NC}"
    echo "Create it with: stellar keys generate --global $TEST_ACCOUNT --network $NETWORK"
    exit 1
}

echo -e "${GREEN}🧪 Smoke testing $CONTRACT_ID on $NETWORK${NC}"
echo "Test account: $TEST_ACCOUNT ($TEST_ADDRESS)"
echo ""

PASSED=0
FAILED=0

invoke() {
    stellar contract invoke \
      --id "$CONTRACT_ID" \
      --source-account "$TEST_ACCOUNT" \
      --network "$NETWORK" \
      -- \
      "$@" 2>&1
}

check() {
    local name=$1
    shift
    local output
    if output=$("$@"); then
        echo -e "${GREEN}✅ PASS${NC} $name"
        PASSED=$((PASSED + 1))
        LAST_OUTPUT=$output
        return 0
    fi
    echo -e "${RED}❌ FAIL${NC} $name"
    echo "$output" | sed 's/^/    /'
    FAILED=$((FAILED + 1))
    LAST_OUTPUT=""
    return 1
}

# ---------- Read-only checks ----------
echo -e "${YELLOW}🔍 Read-only checks...${NC}"
check "get_config" invoke get_config
CONFIG=$LAST_OUTPUT
check "get_platform_stats" invoke get_platform_stats
check "is_paused" invoke is_paused
if [ "$LAST_OUTPUT" = "true" ]; then
    echo -e "${RED}❌ FAIL${NC} contract is paused"
    FAILED=$((FAILED + 1))
fi
check "get_all_agents" invoke get_all_agents --offset 0 --limit 1
check "get_all_jobs" invoke get_all_jobs --offset 0 --limit 1

# ---------- Capped job lifecycle ----------
# Use the contract's configured minimum budget so the job is as small as allowed.
BUDGET=$(echo "$CONFIG" | grep -o '"min_job_budget":"\?[0-9]*' | grep -o '[0-9]*$')
BUDGET=${BUDGET:-10000000}

echo ""
echo -e "${YELLOW}🔁 Job lifecycle (budget: $BUDGET stroops)...${NC}"
if check "post_job" invoke post_job \
    --client "$TEST_ADDRESS" \
    --title "Smoke test" \
    --description "Automated post-deploy smoke test; cancelled immediately" \
    --required_skills '[]' \
    --budget "$BUDGET" \
    --deadline_days 1; then
    JOB_ID=$(echo "$LAST_OUTPUT" | tail -1 | tr -d '"')
    echo "    job_id: $JOB_ID"
    check "get_job" invoke get_job --job_id "$JOB_ID"
    check "cancel_job" invoke cancel_job --client "$TEST_ADDRESS" --job_id "$JOB_ID"
fi

echo ""
echo "Passed: $PASSED  Failed: $FAILED"
if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}❌ Smoke test FAILED${NC}"
    exit 1
fi
echo -e "${GREEN}🎉 Smoke test PASSED${NC}"
