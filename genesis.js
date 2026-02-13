/**
 * FlowPay Coin (FPC) — Genesis Block
 * 
 * Mined on: 2026-02-13T18:01:34.315Z
 * Message: "For Mom. For the family. Built from scratch."
 * Allocation: 1,000,000 FPC to Founder (b8c025bdeb9c2915c7d13a523d4a206937a4db1a)
 */

const GENESIS = {
    "height": 0,
    "timestamp": 1771005694054,
    "previousHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "hash": "000041d1864e338381728615daa0983460e14ccdf8563fc3d027582339e213f8",
    "nonce": 51110,
    "difficulty": 4,
    "merkleRoot": "d4abd0752a74ac903835613dc382a29a41ca9235770f09a41ad42afacceafb23",
    "miningTime": 260,
    "transaction": {
        "inputs": [
            {
                "txHash": "0000000000000000000000000000000000000000000000000000000000000000",
                "outputIndex": 0,
                "signature": "For Mom. For the family. Built from scratch."
            }
        ],
        "outputs": [
            {
                "address": "b8c025bdeb9c2915c7d13a523d4a206937a4db1a",
                "amount": 1000000
            }
        ],
        "isCoinbase": true,
        "timestamp": 1771005694054,
        "hash": "d4abd0752a74ac903835613dc382a29a41ca9235770f09a41ad42afacceafb23"
    }
};

// Seed nodes for P2P discovery
const SEED_NODES = [];

module.exports = { GENESIS, SEED_NODES };
