/**
 * FlowPay Coin — Canonical Genesis Block
 * 
 * This is Block #0 of the FPC network.
 * Every node starts from this exact block.
 * 
 * Mined: February 13, 2026
 * "For Mom. For the family. Built from the whitepaper."
 */

const GENESIS = {
    height: 0,
    previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
    timestamp: 1770969189273,
    merkleRoot: 'bf6e856e15f62523cc87336de5c8d62518f4a69d844e6d628d102fca949c1f78',
    nonce: 168039,
    hash: '0000ad97e4a235d6bd115f460eba4ce1422b202a66a285aec945ee46de78d59a',
    difficulty: 4,
    miningTime: 771,
    transaction: {
        inputs: [{ txHash: '0'.repeat(64), outputIndex: 0 }],
        outputs: [{ address: 'e15c65c6268f49044d423f71cfab78c271c6543a', amount: 5000 }],
        signatures: [],
        isCoinbase: true,
        timestamp: 1770969189273,
        hash: 'bf6e856e15f62523cc87336de5c8d62518f4a69d844e6d628d102fca949c1f78'
    },
    // The address that received the genesis coinbase
    founderAddress: 'e15c65c6268f49044d423f71cfab78c271c6543a',
    // FPC network parameters
    networkId: 'flowpay-mainnet',
    maxSupply: 21_000_000,
    initialReward: 50,
    halvingInterval: 210_000 // halve reward every 210K blocks
};

// Seed nodes — always-on nodes for peer discovery
const SEED_NODES = [
    // Add your deployed seed node URL here after Railway/Render deployment
    // 'wss://flowpay-node.up.railway.app'
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GENESIS, SEED_NODES };
}
