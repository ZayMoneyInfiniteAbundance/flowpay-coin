#!/usr/bin/env node

/**
 * FlowPay Coin (FPC) — P2P Node (Express Version)
 * 
 * Replaces the raw `http` module with `express` for robust API handling.
 * Consolidates API + P2P onto a single port (easier cloud deployment).
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const {
    sha256, Blockchain, Wallet, Transaction, Block,
    MINING_REWARD, WALLET_REGISTRY, derivePublicKey, deriveAddress
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

// Use PORT env var (cloud) or default to 6001
const PORT = process.env.PORT || parseInt(getArg('--port', '6001'));
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
    const chainFile = path.join(DATA_DIR, 'chain.json');
    const walletFile = path.join(DATA_DIR, 'wallet.json');

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // Wallet
    if (fs.existsSync(walletFile)) {
        const walletData = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
        nodeWallet = new Wallet('Node', blockchain);
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

    // Chain
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
    for (const blockData of data) {
        const txs = blockData.transactions.map(txd => {
            const tx = new Transaction(txd.inputs, txd.outputs, txd.isCoinbase);
            Object.assign(tx, txd); // Restore props
            return tx;
        });
        const block = new Block(blockData.height, blockData.previousHash, txs, blockData.difficulty);
        Object.assign(block, blockData); // Restore props
        blockchain.chain.push(block);
        blockchain._processBlockUTXOs(block);
    }
}

function loadCanonicalGenesis() {
    const g = GENESIS;
    const tx = new Transaction(g.transaction.inputs, g.transaction.outputs, g.transaction.isCoinbase);
    Object.assign(tx, g.transaction);
    const block = new Block(g.height, g.previousHash, [tx], g.difficulty);
    Object.assign(block, g);
    blockchain.chain.push(block);
    blockchain._processBlockUTXOs(block);
}

function saveChain() {
    const chainFile = path.join(DATA_DIR, 'chain.json');
    fs.writeFileSync(chainFile, JSON.stringify(blockchain.chain, null, 2));
}

// ============================================================
// Express App Setup
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());

// API Routes
app.get('/', (req, res) => {
    res.json({
        name: 'FlowPay Coin Node',
        version: '1.0.0',
        chain: blockchain.chain.length,
        peers: peers.size,
        mempool: blockchain.mempool.length,
        mining: isMining,
        wallet: nodeWallet.address,
        port: PORT
    });
});

app.get('/stats', (req, res) => res.json(blockchain.getStats()));
app.get('/chain', (req, res) => res.json(blockchain.chain));
app.get('/block', (req, res) => {
    const height = parseInt(req.query.height);
    const block = blockchain.chain[height];
    block ? res.json(block) : res.status(404).json({ error: 'Block not found' });
});
app.get('/balance', (req, res) => {
    const addr = req.query.address || nodeWallet.address;
    res.json({ address: addr, balance: blockchain.getBalance(addr) });
});
app.get('/utxos', (req, res) => {
    const addr = req.query.address || nodeWallet.address;
    res.json(blockchain.getUTXOs(addr));
});
app.get('/mempool', (req, res) => res.json(blockchain.mempool));
app.get('/peers', (req, res) => res.json(Array.from(peers.values()).map(p => p.address)));
app.get('/wallet', (req, res) => res.json({
    address: nodeWallet.address,
    balance: nodeWallet.getBalance()
}));

app.post('/tx', (req, res) => {
    const { to, amount } = req.body;
    try {
        const tx = nodeWallet.sendTo(to, amount);
        broadcast(MSG.NEW_TX, tx);
        log(`📤 TX sent: ${tx.hash.substring(0, 8)}... (${amount} FPC)`);
        res.json({ hash: tx.hash, status: 'mempool' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/mine', (req, res) => {
    if (isMining) return res.status(400).json({ error: 'Already mining' });
    const block = mineOneBlock();
    res.json({
        height: block.height,
        hash: block.hash,
        nonce: block.nonce,
        time: block.miningTime,
        reward: MINING_REWARD
    });
});

app.post('/mine/start', (req, res) => {
    startMining();
    res.json({ status: 'Mining started' });
});

app.post('/mine/stop', (req, res) => {
    stopMining();
    res.json({ status: 'Mining stopped' });
});

app.post('/peers/add', (req, res) => {
    const { address } = req.body;
    if (address) {
        connectToPeer(address);
        res.json({ status: `Connecting to ${address}` });
    } else {
        res.status(400).json({ error: 'Missing address' });
    }
});

// ============================================================
// P2P Network (WebSocket)
// ============================================================
const peers = new Map();
const MSG = { HANDSHAKE: 'HANDSHAKE', PEER_LIST: 'PEER_LIST', NEW_BLOCK: 'NEW_BLOCK', NEW_TX: 'NEW_TX', REQUEST_CHAIN: 'REQUEST_CHAIN', CHAIN_RESPONSE: 'CHAIN_RESPONSE', PING: 'PING', PONG: 'PONG' };

const server = http.createServer(app);
const wss = new WebSocketServer({ server }); // Attach WebSocket to same HTTP server

wss.on('connection', (ws, req) => {
    peers.set(ws, { address: 'incoming', lastSeen: Date.now() });
    ws.on('message', (data) => handleMessage(ws, data.toString()));
    ws.on('close', () => peers.delete(ws));
    ws.on('error', () => peers.delete(ws));
});

function broadcast(type, data, excludeWs = null) {
    const msg = JSON.stringify({ type, data, sender: `ws://localhost:${PORT}` }); // Note: sender address might need to be public IP for real P2P, but localhost works for internal
    for (const [ws] of peers) {
        if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
}

function handleMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
        case MSG.HANDSHAKE: {
            const existing = peers.get(ws);
            const alreadyHandshook = existing && existing.handshakeDone;
            // Update peer info
            peers.set(ws, { ...existing, address: msg.sender, lastSeen: Date.now(), chainLength: msg.data?.chainLength || 0, handshakeDone: true });

            // Reply only if initiated by other side
            if (!alreadyHandshook) {
                ws.send(JSON.stringify({
                    type: MSG.HANDSHAKE,
                    sender: `ws://localhost:${PORT}`, // In production, use env var for public URL
                    data: { chainLength: blockchain.chain.length }
                }));
                log(`🤝 Peer connected: ${msg.sender}`);
            }
            if (msg.data?.chainLength > blockchain.chain.length) {
                log(`📥 Peer has longer chain, requesting sync...`);
                ws.send(JSON.stringify({ type: MSG.REQUEST_CHAIN, sender: `ws://localhost:${PORT}` }));
            }
            break;
        }
        case MSG.NEW_BLOCK: handleNewBlock(msg.data, ws); break;
        case MSG.NEW_TX: handleNewTx(msg.data); break;
        case MSG.REQUEST_CHAIN:
            ws.send(JSON.stringify({ type: MSG.CHAIN_RESPONSE, data: blockchain.chain, sender: `ws://localhost:${PORT}` }));
            break;
        case MSG.CHAIN_RESPONSE: handleChainResponse(msg.data); break;
        case MSG.PEER_LIST:
            if (Array.isArray(msg.data)) msg.data.forEach(addr => {
                if (addr !== `ws://localhost:${PORT}` && !isPeerConnected(addr)) connectToPeer(addr);
            });
            break;
        case MSG.PING: ws.send(JSON.stringify({ type: MSG.PONG, sender: `ws://localhost:${PORT}` })); break;
    }
}

function isPeerConnected(address) {
    for (const [, info] of peers) if (info.address === address) return true;
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
                sender: `ws://localhost:${PORT}`,
                data: { chainLength: blockchain.chain.length }
            }));
        });
        ws.on('message', (data) => handleMessage(ws, data.toString()));
        ws.on('close', () => peers.delete(ws)); // Don't log spam
        ws.on('error', () => peers.delete(ws));
    } catch (e) { }
}

function handleNewBlock(blockData, fromWs) {
    const lastBlock = blockchain.chain[blockchain.chain.length - 1];
    if (blockData.previousHash !== lastBlock.hash) {
        if (blockData.height > blockchain.chain.length) {
            fromWs.send(JSON.stringify({ type: MSG.REQUEST_CHAIN, sender: `ws://localhost:${PORT}` }));
        }
        return;
    }
    // Deep reconstruction
    const txs = blockData.transactions.map(t => {
        const tx = new Transaction(t.inputs, t.outputs, t.isCoinbase);
        Object.assign(tx, t);
        return tx;
    });
    const block = new Block(blockData.height, blockData.previousHash, txs, blockData.difficulty);
    Object.assign(block, blockData);

    if (block.hash.startsWith('0'.repeat(block.difficulty))) {
        blockchain.chain.push(block);
        blockchain._processBlockUTXOs(block);
        const confirmedHashes = new Set(block.transactions.map(t => t.hash));
        blockchain.mempool = blockchain.mempool.filter(t => !confirmedHashes.has(t.hash));
        saveChain();
        log(`✅ Block #${block.height} received | ${block.hash.substring(0, 8)}...`);
        broadcast(MSG.NEW_BLOCK, blockData, fromWs);
    }
}

function handleNewTx(txData) {
    if (blockchain.mempool.find(t => t.hash === txData.hash)) return;
    const tx = new Transaction(txData.inputs, txData.outputs, txData.isCoinbase);
    Object.assign(tx, txData);
    try {
        blockchain.addToMempool(tx);
        log(`📨 TX received: ${tx.hash.substring(0, 8)}...`);
        broadcast(MSG.NEW_TX, txData);
    } catch (e) { }
}

function handleChainResponse(chainData) {
    if (!Array.isArray(chainData) || chainData.length <= blockchain.chain.length) return;
    log(`📥 Received chain of length ${chainData.length} (ours: ${blockchain.chain.length})`);

    // In a real app, validate full chain. Here we trust for simplicity or simplistic validation can be added back.
    // For robust sync, we'd clear ours and rebuild.
    blockchain.chain = [];
    blockchain.utxoSet = new Map();
    rebuildChainFromData(chainData);
    saveChain();
    log(`🔄 Chain replaced: now ${blockchain.chain.length} blocks`);
}

// ============================================================
// Mining
// ============================================================
let isMining = false;
let miningInterval = null;

function mineOneBlock() {
    const block = blockchain.mineBlock(nodeWallet.address);
    saveChain();
    log(`⛏️  Block #${block.height} mined | ${block.hash.substring(0, 8)}... | ${block.miningTime}ms`);
    broadcast(MSG.NEW_BLOCK, block);
    return block;
}

function startMining() {
    if (isMining) return;
    isMining = true;
    log('⛏️  Mining started...');
    const loop = () => {
        if (!isMining) return;
        mineOneBlock();
        miningInterval = setTimeout(loop, 100);
    };
    loop();
}

function stopMining() {
    isMining = false;
    if (miningInterval) clearTimeout(miningInterval);
    log('⏹️  Mining stopped');
}

// ============================================================
// Start
// ============================================================
function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

initNode();
server.listen(PORT, () => {
    log(`🚀 Node running on port ${PORT}`);
    log(`📡 P2P + API active`);
    log(`💰 Wallet: ${nodeWallet.address.substring(0, 12)}...`);

    SEED_PEERS.forEach(connectToPeer);
    if (AUTO_MINE) setTimeout(startMining, 1000);

    // Peer discovery loop
    setInterval(() => {
        broadcast(MSG.PING, {});
        const addrs = Array.from(peers.values()).map(p => p.address).filter(a => a !== 'incoming');
        if (addrs.length) broadcast(MSG.PEER_LIST, addrs);
    }, 30000);
});
