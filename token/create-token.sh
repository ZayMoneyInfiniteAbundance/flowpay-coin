#!/bin/bash
# ============================================
# FlowPay Coin (FPC) — Solana SPL Token Setup
# ============================================
#
# This script creates a real SPL token on Solana.
# Default: devnet (free) — pass "mainnet" to go live.
#
# Prerequisites:
#   brew install solana-cli spl-token-cli
#   (or: sh -c "$(curl -sSfL https://release.solana.com/stable/install)")
#
# Usage:
#   ./create-token.sh           # Creates on devnet (free)
#   ./create-token.sh mainnet   # Creates on mainnet (~$1-2 in SOL)
# ============================================

set -e

NETWORK="${1:-devnet}"
TOTAL_SUPPLY=21000000  # 21 million — Bitcoin-inspired
DECIMALS=9             # Standard SPL token decimals

echo "================================================="
echo "  FlowPay Coin (FPC) — Token Creation"
echo "  Network: $NETWORK"
echo "  Supply:  $TOTAL_SUPPLY FPC"
echo "================================================="
echo ""

# 1. Configure Solana CLI for the target network
if [ "$NETWORK" = "mainnet" ]; then
    solana config set --url https://api.mainnet-beta.solana.com
    echo "⚠️  MAINNET MODE — This will cost real SOL (~0.01 SOL)"
    read -p "Continue? (y/N): " confirm
    if [ "$confirm" != "y" ]; then echo "Aborted."; exit 1; fi
else
    solana config set --url https://api.devnet.solana.com
    echo "📡 Using devnet (free)"
fi

# 2. Generate a new keypair (wallet) if none exists
if [ ! -f ~/.config/solana/id.json ]; then
    echo ""
    echo "🔑 Generating new Solana keypair..."
    solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json
fi

WALLET=$(solana address)
echo "👛 Wallet: $WALLET"

# 3. Airdrop SOL on devnet (free)
if [ "$NETWORK" = "devnet" ]; then
    echo ""
    echo "💧 Requesting devnet SOL airdrop..."
    solana airdrop 2
    sleep 2
fi

echo ""
echo "💰 Balance: $(solana balance)"

# 4. Create the SPL token (this is the mint)
echo ""
echo "🪙 Creating FPC token mint..."
TOKEN_MINT=$(spl-token create-token --decimals $DECIMALS 2>&1 | grep "Creating token" | awk '{print $3}')
echo "✅ Token Mint: $TOKEN_MINT"

# 5. Create a token account to hold the supply
echo ""
echo "📦 Creating token account..."
TOKEN_ACCOUNT=$(spl-token create-account $TOKEN_MINT 2>&1 | grep "Creating account" | awk '{print $3}')
echo "✅ Token Account: $TOKEN_ACCOUNT"

# 6. Mint the total supply
echo ""
echo "⛏️  Minting $TOTAL_SUPPLY FPC..."
spl-token mint $TOKEN_MINT $TOTAL_SUPPLY
echo "✅ Minted!"

# 7. Display summary
echo ""
echo "================================================="
echo "  🎉 FPC TOKEN CREATED SUCCESSFULLY"
echo "================================================="
echo ""
echo "  Token Mint:    $TOKEN_MINT"
echo "  Token Account: $TOKEN_ACCOUNT"
echo "  Total Supply:  $TOTAL_SUPPLY FPC"
echo "  Decimals:      $DECIMALS"
echo "  Network:       $NETWORK"
echo "  Owner Wallet:  $WALLET"
echo ""
echo "  View on Solana Explorer:"
if [ "$NETWORK" = "mainnet" ]; then
    echo "  https://explorer.solana.com/address/$TOKEN_MINT"
else
    echo "  https://explorer.solana.com/address/$TOKEN_MINT?cluster=devnet"
fi
echo ""
echo "  Next steps:"
echo "  1. Add metadata (name, symbol, logo) via Metaplex"
echo "  2. Share the token mint address"
echo "  3. People can add FPC to Phantom/Solflare wallets"
echo "================================================="

# Save token info to a file
cat > token-info.json << EOF
{
    "name": "FlowPay Coin",
    "symbol": "FPC",
    "decimals": $DECIMALS,
    "totalSupply": $TOTAL_SUPPLY,
    "network": "$NETWORK",
    "mint": "$TOKEN_MINT",
    "account": "$TOKEN_ACCOUNT",
    "owner": "$WALLET",
    "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "📄 Saved token info to token-info.json"
