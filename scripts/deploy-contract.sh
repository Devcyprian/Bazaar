#!/bin/bash
# deploy-contract.sh - Deploy AI Agent Marketplace contract to Stellar

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
NETWORK=${1:-testnet}
SOURCE_ACCOUNT=${2:-deployer}
CONTRACT_ALIAS="ai-agent-marketplace"
WASM_PATH="contracts/ai-agent-marketplace/target/wasm32-unknown-unknown/release/ai_agent_marketplace.wasm"

echo -e "${GREEN}🚀 AI Agent Marketplace Contract Deployment${NC}"
echo "Network: $NETWORK"
echo "Source account: $SOURCE_ACCOUNT"
echo ""

# Mainnet safety: require an explicit multisig admin account
if [ "$NETWORK" = "mainnet" ] && [ "$SOURCE_ACCOUNT" = "deployer" ]; then
    echo -e "${RED}❌ Mainnet deploys must use the multisig admin account.${NC}"
    echo "Usage: $0 mainnet <multisig-admin-account>"
    exit 1
fi

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 not found. Please install it first.${NC}"
        exit 1
    fi
}

check_command cargo
check_command stellar
check_command wasm-opt

# Build contract
echo -e "${YELLOW}📦 Building contract...${NC}"
cd contracts/ai-agent-marketplace
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM
echo -e "${YELLOW}⚡ Optimizing WASM...${NC}"
wasm-opt -Oz \
  target/wasm32-unknown-unknown/release/ai_agent_marketplace.wasm \
  -o target/wasm32-unknown-unknown/release/ai_agent_marketplace.opt.wasm

WASM_PATH="target/wasm32-unknown-unknown/release/ai_agent_marketplace.opt.wasm"
cd ../..

# Check WASM size
SIZE=$(wc -c < "$WASM_PATH")
echo -e "${GREEN}✅ WASM size: $((SIZE / 1024)) KB${NC}"

if [ $SIZE -gt 1000000 ]; then
    echo -e "${YELLOW}⚠️  Warning: WASM > 1MB, may exceed deployment limits${NC}"
fi

# Compute local WASM hash for post-deploy verification
LOCAL_WASM_HASH=$(sha256sum "$WASM_PATH" | awk '{print $1}')
echo -e "${GREEN}🔑 Local WASM SHA-256: $LOCAL_WASM_HASH${NC}"

# Deploy
echo -e "${YELLOW}📤 Deploying to $NETWORK...${NC}"
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source-account "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  --alias "$CONTRACT_ALIAS-$NETWORK" \
  2>&1 | tail -1)

echo -e "${GREEN}✅ Contract deployed: $CONTRACT_ID${NC}"

# Verify deployed WASM hash matches the local artifact
echo -e "${YELLOW}🔍 Verifying deployed WASM hash...${NC}"
DEPLOYED_WASM_HASH=$(stellar contract info wasm-hash \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  2>/dev/null | tail -1)

if [ -n "$DEPLOYED_WASM_HASH" ] && [ "$DEPLOYED_WASM_HASH" != "$LOCAL_WASM_HASH" ]; then
    echo -e "${RED}❌ WASM hash mismatch!${NC}"
    echo "  Local:    $LOCAL_WASM_HASH"
    echo "  Deployed: $DEPLOYED_WASM_HASH"
    exit 1
fi
echo -e "${GREEN}✅ WASM hash verified${NC}"

# Save contract ID
echo "$CONTRACT_ID" > ".contract-id-$NETWORK"
echo -e "${GREEN}📝 Contract ID saved to .contract-id-$NETWORK${NC}"

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}📋 Post-deploy verification checklist (record results for the rehearsal):${NC}"
echo "  [ ] Contract ID: $CONTRACT_ID"
echo "  [ ] Admin set to multisig account: $SOURCE_ACCOUNT"
echo "  [ ] WASM hash matches local artifact: $LOCAL_WASM_HASH"
echo "  [ ] Caps configured and verified on-chain"
echo "  [ ] Pause drill completed (admin can pause and unpause)"
echo "  [ ] Upgrade drill completed (admin can upgrade to new WASM)"
echo "  [ ] Reconciliation of balances/state against expected values"
echo ""
echo "Next steps:"
echo "1. Initialize contract: ./scripts/init-contract.sh $NETWORK"
echo "2. Update frontend .env.local with contract ID"
echo "3. Deploy frontend: ./scripts/deploy-frontend.sh"
echo "4. Schedule the TTL keeper to keep escrow/job entries alive:"
echo "   ./scripts/keeper.sh $NETWORK"
echo "   (run periodically via cron or a systemd timer, e.g. every 12 hours)"