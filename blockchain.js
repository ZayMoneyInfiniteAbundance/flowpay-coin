/**
 * FlowPay Blockchain Engine
 * Implements Satoshi Nakamoto's "Bitcoin: A Peer-to-Peer Electronic Cash System"
 *
 * §2  Transactions — chain of digital signatures, UTXO model
 * §3  Timestamp Server — hash-linked blocks
 * §4  Proof-of-Work — SHA-256 nonce scanning
 * §6  Incentive — coinbase mining rewards
 * §7  Merkle Tree — transaction hashing
 * §8  SPV — Merkle proofs
 * §9  Combining/Splitting Value — multi-input/output
 * §10 Privacy — address derivation from public keys
 */

// ============================================================
// SHA-256 (synchronous, pure JS) — §4 foundation
// ============================================================
const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256(message) {
    const bytes = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : new Uint8Array(message);
    const bitLen = bytes.length * 8;
    const padLen = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padLen - 4, bitLen, false);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const rot = (v, n) => (v >>> n) | (v << (32 - n));

    for (let off = 0; off < padLen; off += 64) {
        const w = new Uint32Array(64);
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = rot(e, 6) ^ rot(e, 11) ^ rot(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
            const S0 = rot(a, 2) ^ rot(a, 13) ^ rot(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7]
        .map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

// ============================================================
// §10: Key Pair & Address — Privacy via derived addresses
// ============================================================
// NOTE: Real Bitcoin uses ECDSA secp256k1. This demo uses
// SHA-256-derived keys in a single-runtime environment.
// The FLOW is identical: privateKey → publicKey → address.

const WALLET_REGISTRY = new Map(); // publicKey → wallet (demo only)

function generatePrivateKey() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function derivePublicKey(privateKey) {
    return sha256(privateKey);
}

function deriveAddress(publicKey) {
    return sha256(publicKey).substring(0, 40);
}

function signData(data, privateKey) {
    return sha256(data + privateKey);
}

function verifySignature(data, signature, publicKey) {
    const wallet = WALLET_REGISTRY.get(publicKey);
    if (!wallet) return false;
    return sha256(data + wallet.privateKey) === signature;
}

// ============================================================
// §7: Merkle Tree — Efficient transaction summaries
// ============================================================
class MerkleTree {
    static computeRoot(hashes) {
        if (hashes.length === 0) return sha256('');
        let level = [...hashes];
        while (level.length > 1) {
            const next = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || level[i]; // duplicate if odd
                next.push(sha256(left + right));
            }
            level = next;
        }
        return level[0];
    }

    // §8: SPV — Generate Merkle proof for a transaction
    static getProof(hashes, index) {
        if (hashes.length <= 1) return [];
        const proof = [];
        let level = [...hashes];
        let idx = index;
        while (level.length > 1) {
            const next = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || level[i];
                next.push(sha256(left + right));
                if (i === idx - (idx % 2)) {
                    if (idx % 2 === 0) {
                        proof.push({ hash: right, position: 'right' });
                    } else {
                        proof.push({ hash: left, position: 'left' });
                    }
                }
            }
            idx = Math.floor(idx / 2);
            level = next;
        }
        return proof;
    }

    // §8: Verify a Merkle proof
    static verifyProof(txHash, proof, root) {
        let hash = txHash;
        for (const step of proof) {
            hash = step.position === 'right'
                ? sha256(hash + step.hash)
                : sha256(step.hash + hash);
        }
        return hash === root;
    }
}

// ============================================================
// §2 & §9: Transaction — Chain of digital signatures, UTXO
// ============================================================
class Transaction {
    constructor(inputs, outputs, isCoinbase = false) {
        this.inputs = inputs;       // [{txHash, outputIndex}]
        this.outputs = outputs;     // [{address, amount}]
        this.signatures = [];
        this.isCoinbase = isCoinbase;
        this.timestamp = Date.now();
        this.hash = this.computeHash();
    }

    computeHash() {
        const data = JSON.stringify({
            inputs: this.inputs,
            outputs: this.outputs,
            timestamp: this.timestamp,
            isCoinbase: this.isCoinbase
        });
        return sha256(data);
    }

    sign(privateKey) {
        for (let i = 0; i < this.inputs.length; i++) {
            this.signatures.push(signData(this.hash, privateKey));
        }
    }

    verify(utxoSet) {
        if (this.isCoinbase) return true;
        // Check signatures
        for (let i = 0; i < this.inputs.length; i++) {
            const inp = this.inputs[i];
            const utxoKey = `${inp.txHash}:${inp.outputIndex}`;
            const utxo = utxoSet.get(utxoKey);
            if (!utxo) return false;
            // Find public key for the address
            let verified = false;
            for (const [pubKey, wallet] of WALLET_REGISTRY) {
                if (wallet.address === utxo.address) {
                    if (verifySignature(this.hash, this.signatures[i], pubKey)) {
                        verified = true;
                        break;
                    }
                }
            }
            if (!verified) return false;
        }
        // §9: Check input sum >= output sum
        const inputSum = this.inputs.reduce((sum, inp) => {
            const utxo = utxoSet.get(`${inp.txHash}:${inp.outputIndex}`);
            return sum + (utxo ? utxo.amount : 0);
        }, 0);
        const outputSum = this.outputs.reduce((sum, out) => sum + out.amount, 0);
        return inputSum >= outputSum;
    }

    getInputTotal(utxoSet) {
        return this.inputs.reduce((sum, inp) => {
            const utxo = utxoSet.get(`${inp.txHash}:${inp.outputIndex}`);
            return sum + (utxo ? utxo.amount : 0);
        }, 0);
    }

    getFee(utxoSet) {
        if (this.isCoinbase) return 0;
        return this.getInputTotal(utxoSet) - this.outputs.reduce((s, o) => s + o.amount, 0);
    }

    static createCoinbase(address, reward, blockHeight) {
        return new Transaction(
            [{ txHash: '0'.repeat(64), outputIndex: blockHeight }],
            [{ address, amount: reward }],
            true
        );
    }
}

// ============================================================
// §3 & §4: Block — Timestamp server + Proof-of-Work
// ============================================================
const MINING_REWARD = 50; // FPC per block

class Block {
    constructor(height, previousHash, transactions, difficulty) {
        this.height = height;
        this.previousHash = previousHash;
        this.transactions = transactions;
        this.difficulty = difficulty;
        this.timestamp = Date.now();
        this.merkleRoot = MerkleTree.computeRoot(
            transactions.map(tx => tx.hash)
        );
        this.nonce = 0;
        this.hash = '';
        this.miningTime = 0;
    }

    getHeaderString() {
        return `${this.height}:${this.previousHash}:${this.merkleRoot}:${this.timestamp}:${this.difficulty}:${this.nonce}`;
    }

    // §4: Scan for nonce where SHA-256(header) starts with N zero hex chars
    mine() {
        const target = '0'.repeat(this.difficulty);
        const startTime = performance.now();
        let attempts = 0;
        do {
            this.nonce++;
            attempts++;
            this.hash = sha256(this.getHeaderString());
        } while (!this.hash.startsWith(target));
        this.miningTime = Math.round(performance.now() - startTime);
        return { hash: this.hash, attempts, time: this.miningTime };
    }
}

// ============================================================
// §5: Blockchain — Network consensus, UTXO set, mempool
// ============================================================
class Blockchain {
    constructor(difficulty = 4) {
        this.chain = [];
        this.utxoSet = new Map();   // "txHash:outIdx" → {address, amount}
        this.mempool = [];          // unconfirmed transactions
        this.difficulty = difficulty;
        this.onBlockMined = null;   // callback for UI
        this.onMempoolUpdate = null;
        this.miningStats = { totalBlocks: 0, totalHashes: 0, totalTime: 0 };
    }

    initialize(genesisAddress) {
        const coinbase = Transaction.createCoinbase(genesisAddress, MINING_REWARD * 100, 0);
        const genesis = new Block(0, '0'.repeat(64), [coinbase], this.difficulty);
        const result = genesis.mine();
        this.chain.push(genesis);
        this._processBlockUTXOs(genesis);
        this.miningStats.totalBlocks++;
        this.miningStats.totalHashes += result.attempts;
        this.miningStats.totalTime += result.time;
        return genesis;
    }

    addToMempool(tx) {
        if (!tx.isCoinbase && !tx.verify(this.utxoSet)) {
            throw new Error('Invalid transaction');
        }
        this.mempool.push(tx);
        if (this.onMempoolUpdate) this.onMempoolUpdate(this.mempool);
        return true;
    }

    mineBlock(minerAddress) {
        const coinbase = Transaction.createCoinbase(
            minerAddress, MINING_REWARD, this.chain.length
        );
        const txs = [coinbase, ...this.mempool];
        const prevHash = this.chain[this.chain.length - 1].hash;
        const block = new Block(this.chain.length, prevHash, txs, this.difficulty);
        const result = block.mine();
        this.chain.push(block);
        this._processBlockUTXOs(block);
        this.mempool = [];
        this.miningStats.totalBlocks++;
        this.miningStats.totalHashes += result.attempts;
        this.miningStats.totalTime += result.time;
        if (this.onMempoolUpdate) this.onMempoolUpdate(this.mempool);
        if (this.onBlockMined) this.onBlockMined(block);
        return block;
    }

    _processBlockUTXOs(block) {
        for (const tx of block.transactions) {
            // Remove spent UTXOs (inputs)
            if (!tx.isCoinbase) {
                for (const inp of tx.inputs) {
                    this.utxoSet.delete(`${inp.txHash}:${inp.outputIndex}`);
                }
            }
            // Add new UTXOs (outputs)
            tx.outputs.forEach((out, idx) => {
                this.utxoSet.set(`${tx.hash}:${idx}`, {
                    address: out.address,
                    amount: out.amount
                });
            });
        }
    }

    getBalance(address) {
        let balance = 0;
        for (const [, utxo] of this.utxoSet) {
            if (utxo.address === address) balance += utxo.amount;
        }
        return Math.round(balance * 100) / 100;
    }

    getUTXOs(address) {
        const result = [];
        for (const [key, utxo] of this.utxoSet) {
            if (utxo.address === address) {
                const [txHash, outIdx] = key.split(':');
                result.push({ txHash, outputIndex: parseInt(outIdx), ...utxo });
            }
        }
        return result;
    }

    // Validate entire chain integrity
    validateChain() {
        for (let i = 1; i < this.chain.length; i++) {
            const block = this.chain[i];
            const prev = this.chain[i - 1];
            // Check hash link
            if (block.previousHash !== prev.hash) return { valid: false, block: i, reason: 'broken hash link' };
            // Check PoW
            if (!block.hash.startsWith('0'.repeat(block.difficulty))) return { valid: false, block: i, reason: 'invalid PoW' };
            // Verify hash is correct
            const computed = sha256(block.getHeaderString());
            if (computed !== block.hash) return { valid: false, block: i, reason: 'hash mismatch' };
            // Verify Merkle root
            const merkle = MerkleTree.computeRoot(block.transactions.map(t => t.hash));
            if (merkle !== block.merkleRoot) return { valid: false, block: i, reason: 'merkle mismatch' };
        }
        return { valid: true };
    }

    getStats() {
        return {
            blocks: this.chain.length,
            transactions: this.chain.reduce((s, b) => s + b.transactions.length, 0),
            utxos: this.utxoSet.size,
            mempool: this.mempool.length,
            difficulty: this.difficulty,
            avgMineTime: this.miningStats.totalBlocks > 0
                ? Math.round(this.miningStats.totalTime / this.miningStats.totalBlocks)
                : 0,
            totalHashes: this.miningStats.totalHashes,
            hashRate: this.miningStats.totalTime > 0
                ? Math.round(this.miningStats.totalHashes / (this.miningStats.totalTime / 1000))
                : 0
        };
    }
}

// ============================================================
// Wallet — Key management, balance, transaction creation
// ============================================================
class Wallet {
    constructor(name, blockchain) {
        this.name = name;
        this.blockchain = blockchain;
        this.privateKey = generatePrivateKey();
        this.publicKey = derivePublicKey(this.privateKey);
        this.address = deriveAddress(this.publicKey);
        WALLET_REGISTRY.set(this.publicKey, this);
    }

    getBalance() {
        return this.blockchain.getBalance(this.address);
    }

    getUTXOs() {
        return this.blockchain.getUTXOs(this.address);
    }

    // §9: Combining and splitting value
    createTransaction(recipientAddress, amount) {
        const utxos = this.getUTXOs();
        let inputSum = 0;
        const inputs = [];
        // Select UTXOs to cover amount
        for (const utxo of utxos) {
            inputs.push({ txHash: utxo.txHash, outputIndex: utxo.outputIndex });
            inputSum += utxo.amount;
            if (inputSum >= amount) break;
        }
        if (inputSum < amount) {
            throw new Error(`Insufficient balance: have ${inputSum}, need ${amount}`);
        }
        // Create outputs: payment + change
        const outputs = [{ address: recipientAddress, amount }];
        const change = Math.round((inputSum - amount) * 100) / 100;
        if (change > 0) {
            outputs.push({ address: this.address, amount: change });
        }
        const tx = new Transaction(inputs, outputs);
        tx.sign(this.privateKey);
        return tx;
    }

    sendTo(recipientAddress, amount) {
        const tx = this.createTransaction(recipientAddress, amount);
        this.blockchain.addToMempool(tx);
        return tx;
    }
}

// ============================================================
// Isomorphic exports — Node.js + Browser
// ============================================================
const _exports = {
    sha256,
    MerkleTree,
    Transaction,
    Block,
    Blockchain,
    Wallet,
    MINING_REWARD,
    verifySignature,
    WALLET_REGISTRY,
    generatePrivateKey,
    derivePublicKey,
    deriveAddress,
    signData
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = _exports;
} else if (typeof window !== 'undefined') {
    window.FlowPayBlockchain = _exports;
}

