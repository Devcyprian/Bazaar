#!/bin/bash
# Initialize the AI Agent Marketplace contract
# Usage: ./scripts/init-contract.sh [testnet|mainnet|futurenet]

set -e

NETWORK=${1:-testnet}
CONTRACT_ALIAS="ai-agent-marketplace"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load contract ID
CONTRACT_FILE=".contract-id-$NETWORK"
if [ ! -f "$CONTRACT_FILE" ]; then
    echo -e "${RED}❌ Contract ID file not found: $CONTRACT_FILE${NC}"
    echo "Run deploy-contract.sh first"
    exit 1
fi

CONTRACT_ID=$(cat "$CONTRACT_FILE")
echo -e "${YELLOW}🔧 Initializing contract $CONTRACT_ID on $NETWORK...${NC}"

# Network-specific config
case $NETWORK in
    testnet)
        RPC_URL="https://soroban-testnet.stellar.org"
        NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
        USDC_CONTRACT="CBIELSO6KZLFBUSGZ47QRYCYMHK4D2H5IMKBORJGUJVAVKZOQK4D7IAJ"
        ;;
    mainnet)
        RPC_URL="https://soroban-mainnet.stellar.org"
        NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
        USDC_CONTRACT="CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
        ;;
    futurenet)
        RPC_URL="https://rpc-futurenet.stellar.org"
        NETWORK_PASSPHRASE="Test SDF Future Network ; October 2022"
        USDC_CONTRACT="CBIELSO6KZLFBUSGZ47QRYCYMHK4D2H5IMKBORJGUJVAVKZOQK4D7IAJ"
        ;;
    *)
        echo -e "${RED}❌ Unknown network: $NETWORK${NC}"
        exit 1
        ;;
esac

# Resolve admin address: prefer explicit ADMIN_ADDRESS (e.g. multisig), else deployer key
if [ -n "$ADMIN_ADDRESS" ]; then
    ADMIN="$ADMIN_ADDRESS"
    echo -e "${YELLOW}👤 Using admin from ADMIN_ADDRESS: $ADMIN${NC}"
else
    ADMIN=$(stellar keys address deployer)
    echo -e "${YELLOW}👤 Using deployer key as admin: $ADMIN${NC}"
fi

# Conservative caps: tighter on mainnet, looser on test networks
case $NETWORK in
    mainnet)
        PLATFORM_FEE_BPS=100
        MIN_JOB_BUDGET=10000000
        MAX_JOB_DEADLINE_DAYS=30
        DISPUTE_WINDOW_DAYS=7
        PLATFORM_FEE_BPS_DISPUTE=200
        ESCROW_EXPIRY_DAYS=30
        REQUIRE_SKILL_VERIFICATION=true
        ;;
    *)
        PLATFORM_FEE_BPS=100
        MIN_JOB_BUDGET=10000000
        MAX_JOB_DEADLINE_DAYS=30
        DISPUTE_WINDOW_DAYS=7
        PLATFORM_FEE_BPS_DISPUTE=200
        ESCROW_EXPIRY_DAYS=30
        REQUIRE_SKILL_VERIFICATION=false
        ;;
esac

# Initialize
echo -e "${YELLOW}⚙️  Calling initialize()...${NC}"
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source-account deployer \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- \
  initialize \
  --admin "$ADMIN" \
  --usdc_token "$USDC_CONTRACT" \
  --platform_fee_bps "$PLATFORM_FEE_BPS" \
  --min_job_budget "$MIN_JOB_BUDGET" \
  --max_job_deadline_days "$MAX_JOB_DEADLINE_DAYS" \
  --dispute_window_days "$DISPUTE_WINDOW_DAYS" \
  --min_agent_reputation 0 \
  --platform_fee_recipient "$ADMIN" \
  --dispute_resolver "$ADMIN" \
  --min_agent_reputation_to_bid 0 \
  --platform_fee_bps_dispute "$PLATFORM_FEE_BPS_DISPUTE" \
  --escrow_expiry_days "$ESCROW_EXPIRY_DAYS" \
  --skill_verifiers '[]' \
  --require_skill_verification "$REQUIRE_SKILL_VERIFICATION"

echo -e "${GREEN}✅ Contract initialized successfully!${NC}"
echo ""
echo "Configuration (network: $NETWORK):"
echo "  Contract ID: $CONTRACT_ID"
echo "  Admin: $ADMIN"
echo "  USDC: $USDC_CONTRACT"
echo "  Platform Fee: $PLATFORM_FEE_BPS bps"
echo "  Min Job Budget: $MIN_JOB_BUDGET (stroops)"
echo "  Max Deadline: $MAX_JOB_DEADLINE_DAYS days"
echo "  Dispute Window: $DISPUTE_WINDOW_DAYS days"
echo "  Dispute Fee: $PLATFORM_FEE_BPS_DISPUTE bps"
echo "  Escrow Expiry: $ESCROW_EXPIRY_DAYS days"
echo "  Require Skill Verification: $REQUIRE_SKILL_VERIFICATION"
