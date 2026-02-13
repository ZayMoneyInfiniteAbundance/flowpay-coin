# 🚀 FlowPay Coin (FPC) — Launch & Marketing Pack

## 1. The Narrative
**"I read Satoshi's Bitcoin whitepaper and built it from scratch in JavaScript."**

This is your hook. It's educational, impressive, and authentic. It's not "buy my coin," it's "look what I built."

---

## 2. Reddit Strategy
Post to these subreddits in this order. Space them out by ~4 hours.

### r/programming or r/javascript (The Technical Angle)
**Title:** I implemented the entire Bitcoin whitepaper from scratch in pure JavaScript (No libraries)

**Body:**
> I wanted to truly understand how Bitcoin works, so I read Satoshi's 2008 whitepaper and implemented every section from first principles.
>
> **The Stack:**
> - Node.js + WebSocket for the P2P network
> - Vanilla JS for SHA-256, Merkle Trees, and ECDSA-like logic
> - No crypto libraries, no frameworks.
>
> It’s a fully functional P2P cryptocurrency. You can run a node, mine blocks, and send transactions.
>
> **Live Web Demo:** [https://p2p-money-app.vercel.app/landing](https://p2p-money-app.vercel.app/landing)
> **GitHub:** [https://github.com/ZayMoneyInfiniteAbundance/flowpay-coin](https://github.com/ZayMoneyInfiniteAbundance/flowpay-coin)
>
> The hardest part was getting the P2P handshake to stop infinite looping. Let me know what you think of the code!

### r/SideProject (The "Cool Factor" Angle)
**Title:** I built a working cryptocurrency in my browser. You can mine it right now.

**Body:**
> Hey everyone, just finished my latest project. It's a full implementation of the Bitcoin protocol running in JavaScript.
>
> Features:
> - Real Proof-of-Work mining in the browser
> - Full P2P network (nodes talk to each other)
> - persistent blockchain
>
> It isn't just a simulation — if you run a node, you're actually securing the network.
>
> **Try mining a block here:** [https://p2p-money-app.vercel.app/landing](https://p2p-money-app.vercel.app/landing)
>
> Open source here: [GitHub Link]

---

## 3. Launch Checklist

### ✅ Phase 1: Tech Ready (Done)
- [x] Blockchain engine complete
- [x] P2P Node server built
- [x] Standard genesis block hardcoded
- [x] Web demo deployed to Vercel
- [x] GitHub repo public

### 🚀 Phase 2: Go Live (Now)
1.  **Deploy Seed Node:** Use the [Deployment Guide](DEPLOY_SEED_NODE.md) to put a node on Railway.
2.  **Update Genesis:** If you deploy a seed node, add its URL to `genesis.js` and push to GitHub.
3.  **Create Token (Optional):** Run `./token/create-token.sh mainnet` if you want a Solana asset representation.

### 📢 Phase 3: Viral Push
1.  Post to **r/programming** (Best time: 8-10 AM EST)
2.  Reply to every comment explaining technical details.
3.  Post to **Hacker News** (news.ycombinator.com) with the title: *"Show HN: Bitcoin implemented from scratch in pure JavaScript"*

---

## 4. Twitter / X Draft
> "I read the Bitcoin whitepaper and turned it into code. 
> 
> Pure JavaScript. No libraries. Real P2P network.
> 
> You can mine the genesis era right now in your browser:
> [Link]
> 
> Code: [GitHub Link]
> 
> #Bitcoin #JavaScript #OpenSource #Crypto"
