#!/usr/bin/env node
/**
 * FlowPay Coin — Standalone CLI Miner
 * 
 * Connects to a running FPC node and mines blocks.
 * 
 * Usage:
 *   node network/miner.js                          # Mine on localhost
 *   node network/miner.js --node http://localhost:7001  # Custom node
 *   node network/miner.js --blocks 10              # Mine N blocks then stop
 */

const http = require('http');

const args = process.argv.slice(2);
const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
};

const NODE_URL = getArg('--node', 'http://localhost:7001');
const MAX_BLOCKS = parseInt(getArg('--blocks', '0')); // 0 = unlimited
let blocksMined = 0;

function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
}

async function fetchJSON(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, NODE_URL);
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error(`Invalid response: ${data}`)); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function mine() {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║    FlowPay Coin (FPC) — CLI Miner       ║
  ║          ⛏️  Mining FPC...               ║
  ╚══════════════════════════════════════════╝
`);

    // Check node connection
    try {
        const info = await fetchJSON('/');
        log(`Connected to node: ${NODE_URL}`);
        log(`Chain: ${info.chain} blocks | Peers: ${info.peers} | Wallet: ${info.wallet.substring(0, 16)}...`);
    } catch (e) {
        log(`❌ Cannot connect to node at ${NODE_URL}`);
        log(`   Make sure a node is running: node network/node.js`);
        process.exit(1);
    }

    log(`Starting miner... ${MAX_BLOCKS > 0 ? `(${MAX_BLOCKS} blocks)` : '(unlimited)'}`);
    log('');

    while (true) {
        try {
            const result = await fetchJSON('/mine', 'POST', {});
            blocksMined++;
            log(`⛏️  Block #${result.height} | ${result.hash.substring(0, 20)}... | nonce: ${result.nonce} | ${result.time}ms | +${result.reward} FPC`);

            if (MAX_BLOCKS > 0 && blocksMined >= MAX_BLOCKS) {
                log(`\n🎉 Mined ${blocksMined} blocks. Done!`);
                const balance = await fetchJSON('/balance');
                log(`💰 Balance: ${balance.balance} FPC`);
                break;
            }

            // Small delay to let the node process
            await new Promise(r => setTimeout(r, 50));
        } catch (e) {
            log(`⚠️  Mining error: ${e.message}`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    log(`\n⏹️  Miner stopped. Mined ${blocksMined} blocks.`);
    try {
        const balance = await fetchJSON('/balance');
        log(`💰 Final balance: ${balance.balance} FPC`);
    } catch { }
    process.exit(0);
});

mine();
