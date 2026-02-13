# FlowPay Coin (FPC) ⛓️

**We read all 12 sections of Satoshi Nakamoto's Bitcoin whitepaper and built a working blockchain from scratch.**

No libraries. No frameworks. Pure JavaScript. Every algorithm — SHA-256 proof-of-work, UTXO transactions, Merkle trees, digital signatures — implemented from first principles.

> 🔗 **[Live Demo →](https://flowpay.vercel.app)**

---

## What This Is

A complete peer-to-peer payment app with a real blockchain engine running in your browser:

- ⛏️ **Proof-of-Work Mining** — SHA-256 nonce scanning at configurable difficulty
- 💰 **UTXO Transactions** — Inputs and outputs, just like Bitcoin
- 🌳 **Merkle Trees** — Transaction hashing with SPV proof verification  
- 🔐 **Digital Signatures** — ECDSA-derived key pairs for every wallet
- 📊 **Block Explorer** — Real-time chain stats and block inspection
- 💸 **P2P Payments** — Send FPC to contacts with on-chain confirmation

## Bitcoin Whitepaper Coverage

| Section | Concept | Status |
|---------|---------|--------|
| §2 | Transactions (chain of signatures) | ✅ |
| §3 | Timestamp Server | ✅ |
| §4 | Proof-of-Work | ✅ |
| §6 | Incentive (mining rewards) | ✅ |
| §7 | Merkle Trees | ✅ |
| §8 | Simplified Payment Verification | ✅ |
| §9 | Combining & Splitting Value | ✅ |
| §10 | Privacy (derived addresses) | ✅ |

## Quick Start

```bash
# Clone and run
git clone https://github.com/YOUR_USERNAME/flowpay-coin.git
cd flowpay-coin
npx serve .

# Open http://localhost:3000
```

## Architecture

```
├── blockchain.js    # Core engine (~300 lines)
│   ├── sha256()           — Pure JS SHA-256
│   ├── MerkleTree         — Build, root, proof, verify
│   ├── Transaction        — UTXO inputs/outputs
│   ├── Block              — Header + PoW mining
│   ├── Blockchain         — Chain, UTXO set, mempool
│   └── Wallet             — Keys, signing, balance
│
├── app.js           # FlowPay integration
├── index.html       # Payment app UI
├── landing.html     # Viral landing page
├── styles.css       # Dark glassmorphism theme
└── token/
    └── create-token.sh  # Solana SPL token creation
```

## Create a Real Token

FPC can be deployed as a real Solana SPL token:

```bash
# Free on devnet
cd token && chmod +x create-token.sh
./create-token.sh

# Real on mainnet (~$1 in SOL)
./create-token.sh mainnet
```

## Deploy

```bash
# One-click Vercel deployment
npx vercel
```

## License

MIT — Built for education and open collaboration.

---

*Inspired by the [Bitcoin whitepaper](https://bitcoin.org/bitcoin.pdf) by Satoshi Nakamoto (2008)*
