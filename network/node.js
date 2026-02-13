#!/usr/bin/env node
/**
 * FlowPay P2P Node — The Satoshi Way
 * 
 * Runs a full FPC node with:
 *   - WebSocket P2P networking (peer discovery, block/tx propagation)
 *   - REST API for wallets and external interaction
 *   - Built-in miner (optional)
 *   - Blockchain persistence to disk
 * 
 * Usage:
 *   node network/node.js                    # Start node on default port
 *   node network/node.js --port 6001        # Custom port
 *   node network/node.js --peers ws://localhost:6001  # Connect to peer
 *   node network/node.js --mine             # Start mining immediately
 */

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const {
    sha256, Blockchain, Wallet, Transaction, Block, MerkleTree,
    MINING_REWARD, WALLET_REGISTRY, generatePrivateKey, derivePublicKey, deriveAddress
} = require('../blockchain.js');
const { GENESIS, SEED_NODES } = require('../genesis.js');

// ============================================================
// Configuration
// ============================================================
const args = process.argv.slice(2);
const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
};

const P2P_PORT = parseInt(getArg('--port', '6001'));
const API_PORT = parseInt(getArg('--api', String(P2P_PORT + 1000)));
const SEED_PEERS = [
    ...SEED_NODES,
    ...getArg('--peers', '').split(',').filter(Boolean)
];
const AUTO_MINE = args.includes('--mine');
const DATA_DIR = getArg('--data', path.join(process.cwd(), '.flowpay-data'));
const DIFFICULTY = parseInt(getArg('--difficulty', '4'));

// ============================================================
// Blockchain + Wallet Init
// ============================================================
const blockchain = new Blockchain(DIFFICULTY);
let nodeWallet;

function initNode() {
    // Try to load persisted state
    const chainFile = path.join(DATA_DIR, 'chain.json');
    const walletFile = path.join(DATA_DIR, 'wallet.json');

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(walletFile)) {
        const walletData = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
        nodeWallet = new Wallet('Node', blockchain);
        // Override with saved keys
        nodeWallet.privateKey = walletData.privateKey;
        nodeWallet.publicKey = derivePublicKey(walletData.privateKey);
        nodeWallet.address = deriveAddress(nodeWallet.publicKey);
        WALLET_REGISTRY.set(nodeWallet.publicKey, nodeWallet);
        log(`♻️  Loaded wallet: ${nodeWallet.address.substring(0, 12)}...`);
    } else {
        nodeWallet = new Wallet('Node', blockchain);
        fs.writeFileSync(walletFile, JSON.stringify({
            privateKey: nodeWallet.privateKey,
            address: nodeWallet.address
        }, null, 2));
        log(`🔑 New wallet: ${nodeWallet.address.substring(0, 12)}...`);
    }

    if (fs.existsSync(chainFile)) {
        try {
            const chainData = JSON.parse(fs.readFileSync(chainFile, 'utf8'));
            rebuildChainFromData(chainData);
            log(`♻️  Loaded chain: ${blockchain.chain.length} blocks`);
        } catch (e) {
            log(`⚠️  Chain file corrupt, loading canonical genesis`);
            loadCanonicalGenesis();
        }
    } else {
        loadCanonicalGenesis();
        log(`📦 Loaded canonical genesis: ${GENESIS.hash.substring(0, 16)}...`);
    }

    saveChain();
}

function rebuildChainFromData(data) {
    // Reconstruct the chain from serialized data
    for (const blockData of data) {
        const txs = blockData.transactions.map(txd => {
            const tx = new Transaction(txd.inputs, txd.outputs, txd.isCoinbase);
            tx.timestamp = txd.timestamp;
            tx.hash = txd.hash;
            tx.signatures = txd.signatures || [];
            return tx;
        });
        const block = new Block(blockData.height, blockData.previousHash, txs, blockData.difficulty);
        block.timestamp = blockData.timestamp;
        block.merkleRoot = blockData.merkleRoot;
        block.nonce = blockData.nonce;
        block.hash = blockData.hash;
        block.miningTime = blockData.miningTime || 0;
        blockchain.chain.push(block);
        blockchain._processBlockUTXOs(block);
    }
}

function loadCanonicalGenesis() {
    // Load the hardcoded genesis block — same for ALL FPC nodes
    const g = GENESIS;
    const tx = new Transaction(
        g.transaction.inputs,
        g.transaction.outputs,
        g.transaction.isCoinbase
    );
    tx.timestamp = g.transaction.timestamp;
    tx.hash = g.transaction.hash;
    tx.signatures = g.transaction.signatures || [];

    const block = new Block(g.height, g.previousHash, [tx], g.difficulty);
    block.timestamp = g.timestamp;
    block.merkleRoot = g.merkleRoot;
    block.nonce = g.nonce;
    block.hash = g.hash;
    block.miningTime = g.miningTime;

    blockchain.chain.push(block);
    blockchain._processBlockUTXOs(block);
}

function saveChain() {
    const chainFile = path.join(DATA_DIR, 'chain.json');
    const data = blockchain.chain.map(block => ({
        height: block.height,
        previousHash: block.previousHash,
        timestamp: block.timestamp,
        merkleRoot: block.merkleRoot,
        nonce: block.nonce,
        hash: block.hash,
        difficulty: block.difficulty,
        miningTime: block.miningTime,
        transactions: block.transactions.map(tx => ({
            inputs: tx.inputs,
            outputs: tx.outputs,
            signatures: tx.signatures,
            isCoinbase: tx.isCoinbase,
            timestamp: tx.timestamp,
            hash: tx.hash
        }))
    }));
    fs.writeFileSync(chainFile, JSON.stringify(data, null, 2));
}

// ============================================================
// P2P Network — WebSocket Peer-to-Peer
// ============================================================
const peers = new Map(); // ws → { address, lastSeen }

// Message types (the Bitcoin protocol, simplified)
const MSG = {
    HANDSHAKE: 'HANDSHAKE',
    PEER_LIST: 'PEER_LIST',
    NEW_BLOCK: 'NEW_BLOCK',
    NEW_TX: 'NEW_TX',
    REQUEST_CHAIN: 'REQUEST_CHAIN',
    CHAIN_RESPONSE: 'CHAIN_RESPONSE',
    PING: 'PING',
    PONG: 'PONG'
};

function broadcast(type, data, excludeWs = null) {
    const msg = JSON.stringify({ type, data, sender: `ws://localhost:${P2P_PORT}` });
    for (const [ws] of peers) {
        if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
        }
    }
}

function handleMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
        case MSG.HANDSHAKE: {
            const existingPeer = peers.get(ws);
            const alreadyHandshook = existingPeer && existingPeer.handshakeDone;
            peers.set(ws, { address: msg.sender, lastSeen: Date.now(), chainLength: msg.data?.chainLength || 0, handshakeDone: true });
            // Only reply with handshake if we haven't already (prevent loop)
            if (!alreadyHandshook) {
                ws.send(JSON.stringify({
                    type: MSG.HANDSHAKE,
                    sender: `ws://localhost:${P2P_PORT}`,
                    data: { chainLength: blockchain.chain.length }
                }));
                log(`🤝 Peer connected: ${msg.sender} (chain: ${msg.data?.chainLength || '?'})`);
            }
            // If they have a longer chain, request it
            if (msg.data?.chainLength > blockchain.chain.length) {
                log(`📥 Peer has longer chain (${msg.data.chainLength} vs ${blockchain.chain.length}), requesting...`);
                ws.send(JSON.stringify({ type: MSG.REQUEST_CHAIN, sender: `ws://localhost:${P2P_PORT}` }));
            }
            break;
        }

        case MSG.NEW_BLOCK:
            handleNewBlock(msg.data, ws);
            break;

        case MSG.NEW_TX:
            handleNewTx(msg.data);
            break;

        case MSG.REQUEST_CHAIN:
            const chainData = blockchain.chain.map(block => serializeBlock(block));
            ws.send(JSON.stringify({ type: MSG.CHAIN_RESPONSE, data: chainData, sender: `ws://localhost:${P2P_PORT}` }));
            break;

        case MSG.CHAIN_RESPONSE:
            handleChainResponse(msg.data);
            break;

        case MSG.PEER_LIST:
            // Connect to any new peers
            if (Array.isArray(msg.data)) {
                for (const addr of msg.data) {
                    if (addr !== `ws://localhost:${P2P_PORT}` && !isPeerConnected(addr)) {
                        connectToPeer(addr);
                    }
                }
            }
            break;

        case MSG.PING:
            ws.send(JSON.stringify({ type: MSG.PONG, sender: `ws://localhost:${P2P_PORT}` }));
            break;
    }
}

function serializeBlock(block) {
    return {
        height: block.height,
        previousHash: block.previousHash,
        timestamp: block.timestamp,
        merkleRoot: block.merkleRoot,
        nonce: block.nonce,
        hash: block.hash,
        difficulty: block.difficulty,
        miningTime: block.miningTime,
        transactions: block.transactions.map(tx => ({
            inputs: tx.inputs,
            outputs: tx.outputs,
            signatures: tx.signatures,
            isCoinbase: tx.isCoinbase,
            timestamp: tx.timestamp,
            hash: tx.hash
        }))
    };
}

function handleNewBlock(blockData, fromWs) {
    // Validate the block
    const lastBlock = blockchain.chain[blockchain.chain.length - 1];
    if (blockData.previousHash !== lastBlock.hash) {
        // Not building on our chain tip — might need chain sync
        if (blockData.height > blockchain.chain.length) {
            // They're ahead, request their full chain
            fromWs.send(JSON.stringify({ type: MSG.REQUEST_CHAIN, sender: `ws://localhost:${P2P_PORT}` }));
        }
        return;
    }
    if (!blockData.hash.startsWith('0'.repeat(blockData.difficulty))) {
        log(`❌ Rejected block #${blockData.height}: invalid PoW`);
        return;
    }

    // Reconstruct and add the block
    const txs = blockData.transactions.map(txd => {
        const tx = new Transaction(txd.inputs, txd.outputs, txd.isCoinbase);
        tx.timestamp = txd.timestamp;
        tx.hash = txd.hash;
        tx.signatures = txd.signatures || [];
        return tx;
    });
    const block = new Block(blockData.height, blockData.previousHash, txs, blockData.difficulty);
    block.timestamp = blockData.timestamp;
    block.merkleRoot = blockData.merkleRoot;
    block.nonce = blockData.nonce;
    block.hash = blockData.hash;
    block.miningTime = blockData.miningTime || 0;

    blockchain.chain.push(block);
    blockchain._processBlockUTXOs(block);
    // Remove confirmed txs from mempool
    const confirmedHashes = new Set(block.transactions.map(t => t.hash));
    blockchain.mempool = blockchain.mempool.filter(t => !confirmedHashes.has(t.hash));

    saveChain();
    log(`✅ Block #${block.height} received | ${block.hash.substring(0, 16)}... | ${block.transactions.length} txs`);

    // Propagate to other peers
    broadcast(MSG.NEW_BLOCK, blockData, fromWs);
}

function handleChainResponse(chainData) {
    if (!Array.isArray(chainData) || chainData.length <= blockchain.chain.length) return;

    log(`📥 Received chain of length ${chainData.length} (ours: ${blockchain.chain.length})`);

    // Validate the incoming chain
    const tempBlockchain = new Blockchain(DIFFICULTY);
    try {
        rebuildChainFromData.call({ blockchain: tempBlockchain }, chainData);
        // Overwrite our shorter chain
        blockchain.chain = [];
        blockchain.utxoSet = new Map();
        rebuildChainFromData(chainData);
        saveChain();
        log(`🔄 Chain replaced: now ${blockchain.chain.length} blocks`);
    } catch (e) {
        log(`❌ Invalid chain received: ${e.message}`);
    }
}

function handleNewTx(txData) {
    // Check if we already have it
    const existing = blockchain.mempool.find(t => t.hash === txData.hash);
    if (existing) return;

    const tx = new Transaction(txData.inputs, txData.outputs, txData.isCoinbase);
    tx.timestamp = txData.timestamp;
    tx.hash = txData.hash;
    tx.signatures = txData.signatures || [];

    try {
        blockchain.addToMempool(tx);
        log(`📨 TX received: ${tx.hash.substring(0, 16)}... (${tx.outputs.map(o => o.amount + ' FPC').join(', ')})`);
        broadcast(MSG.NEW_TX, txData);
    } catch (e) {
        log(`❌ TX rejected: ${e.message}`);
    }
}

function isPeerConnected(address) {
    for (const [, info] of peers) {
        if (info.address === address) return true;
    }
    return false;
}

function connectToPeer(address) {
    if (isPeerConnected(address)) return;
    try {
        const ws = new WebSocket(address);
        ws.on('open', () => {
            peers.set(ws, { address, lastSeen: Date.now() });
            ws.send(JSON.stringify({
                type: MSG.HANDSHAKE,
                sender: `ws://localhost:${P2P_PORT}`,
                data: { chainLength: blockchain.chain.length }
            }));
        });
        ws.on('message', (data) => handleMessage(ws, data.toString()));
        ws.on('close', () => {
            peers.delete(ws);
            log(`📤 Peer disconnected: ${address}`);
        });
        ws.on('error', () => {
            peers.delete(ws);
        });
    } catch (e) {
        log(`⚠️  Failed to connect to ${address}`);
    }
}

// ============================================================
// REST API — For wallets, explorers, and external tools
// ============================================================
function startAPI() {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        const url = new URL(req.url, `http://localhost:${API_PORT}`);
        const route = url.pathname;

        // GET routes
        if (req.method === 'GET') {
            switch (route) {
                case '/':
                    return json(res, {
                        name: 'FlowPay Coin Node',
                        version: '1.0.0',
                        chain: blockchain.chain.length,
                        peers: peers.size,
                        mempool: blockchain.mempool.length,
                        mining: isMining,
                        wallet: nodeWallet.address
                    });

                case '/stats':
                    return json(res, blockchain.getStats());

                case '/chain':
                    return json(res, blockchain.chain.map(b => serializeBlock(b)));

                case '/block': {
                    const height = parseInt(url.searchParams.get('height'));
                    const block = blockchain.chain[height];
                    return block ? json(res, serializeBlock(block)) : json(res, { error: 'Block not found' }, 404);
                }

                case '/balance': {
                    const addr = url.searchParams.get('address') || nodeWallet.address;
                    return json(res, { address: addr, balance: blockchain.getBalance(addr) });
                }

                case '/utxos': {
                    const addr = url.searchParams.get('address') || nodeWallet.address;
                    return json(res, blockchain.getUTXOs(addr));
                }

                case '/mempool':
                    return json(res, blockchain.mempool.map(tx => ({
                        hash: tx.hash,
                        inputs: tx.inputs,
                        outputs: tx.outputs,
                        isCoinbase: tx.isCoinbase
                    })));

                case '/peers':
                    return json(res, Array.from(peers.values()).map(p => p.address));

                case '/wallet':
                    return json(res, {
                        address: nodeWallet.address,
                        balance: nodeWallet.getBalance(),
                        publicKey: nodeWallet.publicKey.substring(0, 16) + '...'
                    });

                default:
                    return json(res, { error: 'Not found' }, 404);
            }
        }

        // POST routes
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                let data = {};
                if (body.trim()) {
                    try { data = JSON.parse(body); } catch { return json(res, { error: 'Invalid JSON' }, 400); }
                }

                switch (route) {
                    case '/tx': {
                        try {
                            const tx = nodeWallet.sendTo(data.to, data.amount);
                            broadcast(MSG.NEW_TX, {
                                inputs: tx.inputs,
                                outputs: tx.outputs,
                                signatures: tx.signatures,
                                isCoinbase: tx.isCoinbase,
                                timestamp: tx.timestamp,
                                hash: tx.hash
                            });
                            log(`📤 TX sent: ${tx.hash.substring(0, 16)}... → ${data.to.substring(0, 12)}... (${data.amount} FPC)`);
                            return json(res, { hash: tx.hash, status: 'mempool' });
                        } catch (e) {
                            return json(res, { error: e.message }, 400);
                        }
                    }

                    case '/mine': {
                        if (isMining) return json(res, { error: 'Already mining' }, 400);
                        const block = mineOneBlock();
                        return json(res, {
                            height: block.height,
                            hash: block.hash,
                            nonce: block.nonce,
                            time: block.miningTime,
                            txs: block.transactions.length,
                            reward: MINING_REWARD
                        });
                    }

                    case '/mine/start':
                        startMining();
                        return json(res, { status: 'Mining started' });

                    case '/mine/stop':
                        stopMining();
                        return json(res, { status: 'Mining stopped' });

                    case '/peers/add':
                        if (data.address) {
                            connectToPeer(data.address);
                            return json(res, { status: `Connecting to ${data.address}` });
                        }
                        return json(res, { error: 'Missing address' }, 400);

                    default:
                        return json(res, { error: 'Not found' }, 404);
                }
            });
            return;
        }

        json(res, { error: 'Method not allowed' }, 405);
    });

    server.listen(API_PORT, () => {
        log(`🌐 API server: http://localhost:${API_PORT}`);
    });
}

function json(res, data, status = 200) {
    res.writeHead(status);
    res.end(JSON.stringify(data, null, 2));
}

// ============================================================
// Mining
// ============================================================
let isMining = false;
let miningInterval = null;

function mineOneBlock() {
    const block = blockchain.mineBlock(nodeWallet.address);
    saveChain();
    const balance = nodeWallet.getBalance();
    log(`⛏️  Block #${block.height} mined | ${block.hash.substring(0, 16)}... | nonce: ${block.nonce} | ${block.miningTime}ms | balance: ${balance} FPC`);

    // Broadcast to peers
    broadcast(MSG.NEW_BLOCK, serializeBlock(block));
    return block;
}

function startMining() {
    if (isMining) return;
    isMining = true;
    log('⛏️  Mining started...');

    const mineLoop = () => {
        if (!isMining) return;
        mineOneBlock();
        // Small delay between blocks to process incoming messages
        miningInterval = setTimeout(mineLoop, 100);
    };
    mineLoop();
}

function stopMining() {
    isMining = false;
    if (miningInterval) {
        clearTimeout(miningInterval);
        miningInterval = null;
    }
    log('⏹️  Mining stopped');
}

// ============================================================
// Logging
// ============================================================
function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
}

// ============================================================
// Start Everything
// ============================================================
function start() {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║     FlowPay Coin (FPC) — P2P Node       ║
  ║   Bitcoin Whitepaper Implementation      ║
  ╚══════════════════════════════════════════╝
`);

    initNode();

    // Start P2P WebSocket server
    const wss = new WebSocketServer({ port: P2P_PORT });
    wss.on('connection', (ws) => {
        peers.set(ws, { address: 'incoming', lastSeen: Date.now() });
        ws.on('message', (data) => handleMessage(ws, data.toString()));
        ws.on('close', () => peers.delete(ws));
    });
    log(`📡 P2P server: ws://localhost:${P2P_PORT}`);

    // Start REST API
    startAPI();

    // Connect to seed peers
    for (const peer of SEED_PEERS) {
        connectToPeer(peer);
    }

    // Start mining if requested
    if (AUTO_MINE) {
        setTimeout(() => startMining(), 1000);
    }

    // Peer health check
    setInterval(() => {
        broadcast(MSG.PING, {});
        // Share peer list
        const peerAddrs = Array.from(peers.values()).map(p => p.address).filter(a => a !== 'incoming');
        if (peerAddrs.length > 0) {
            broadcast(MSG.PEER_LIST, peerAddrs);
        }
    }, 30000);

    // Show status
    log(`💰 Wallet: ${nodeWallet.address.substring(0, 20)}...`);
    log(`💎 Balance: ${nodeWallet.getBalance()} FPC`);
    log(`📦 Chain: ${blockchain.chain.length} blocks`);
    log(`🎯 Difficulty: ${DIFFICULTY}`);
    log('');
    log(`Commands:`);
    log(`  POST /mine         — Mine one block`);
    log(`  POST /mine/start   — Start auto-mining`);
    log(`  POST /tx           — Send FPC: {"to":"address","amount":10}`);
    log(`  GET  /stats        — Blockchain statistics`);
    log(`  GET  /balance      — Check balance`);
    log(`  GET  /chain        — Full blockchain`);
    log('');
}

start();
