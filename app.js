// ===== BLOCKCHAIN INTEGRATION =====
const { Blockchain, Wallet, MerkleTree, MINING_REWARD } = window.FlowPayBlockchain;

let blockchain, mainWallet, contactWallets = {};
let isMining = false;
let lastMinedBlock = null;

// ===== CONTACTS DATA =====
const COLORS = [
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #f953c6, #ff6b6b)',
    'linear-gradient(135deg, #00d4aa, #00b894)',
    'linear-gradient(135deg, #ffa94d, #ff6b6b)',
    'linear-gradient(135deg, #667eea, #00d4aa)',
    'linear-gradient(135deg, #764ba2, #f953c6)',
    'linear-gradient(135deg, #ff6b6b, #ffa94d)',
    'linear-gradient(135deg, #00b894, #667eea)',
];

const CONTACTS = [
    { id: 1, name: 'Sarah Chen', handle: '@sarahc', initials: 'SC', colorIdx: 0 },
    { id: 2, name: 'Marcus Johnson', handle: '@marcusj', initials: 'MJ', colorIdx: 1 },
    { id: 3, name: 'Aisha Patel', handle: '@aishap', initials: 'AP', colorIdx: 2 },
    { id: 4, name: 'Tyler Brooks', handle: '@tylerb', initials: 'TB', colorIdx: 3 },
    { id: 5, name: 'Luna Garcia', handle: '@lunag', initials: 'LG', colorIdx: 4 },
    { id: 6, name: 'Jordan Lee', handle: '@jordanl', initials: 'JL', colorIdx: 5 },
    { id: 7, name: 'Mia Rodriguez', handle: '@miar', initials: 'MR', colorIdx: 6 },
    { id: 8, name: 'Ethan Kim', handle: '@ethank', initials: 'EK', colorIdx: 7 },
    { id: 9, name: 'Zoe Taylor', handle: '@zoet', initials: 'ZT', colorIdx: 0 },
    { id: 10, name: 'Kai Nakamura', handle: '@kain', initials: 'KN', colorIdx: 1 },
    { id: 11, name: 'Olivia Wright', handle: '@oliviaw', initials: 'OW', colorIdx: 2 },
    { id: 12, name: 'Ryan Cooper', handle: '@ryanc', initials: 'RC', colorIdx: 3 },
];

// On-chain transaction log (rendered in activity feed)
let onChainTxLog = [];

let PENDING_REQUESTS = [
    { id: 1, contactId: 2, amount: 75.00, note: 'Basketball tickets', type: 'incoming' },
    { id: 2, contactId: 7, amount: 28.50, note: 'Dry cleaning', type: 'incoming' },
];

const APP_STATE = {
    currentView: 'home',
    modalMode: null,
    selectedContact: null,
};

// ===== INITIALIZE BLOCKCHAIN =====
function initBlockchain() {
    blockchain = new Blockchain(4); // difficulty 4 = 4 leading hex zeros

    // Create main user wallet
    mainWallet = new Wallet('Devon M.', blockchain);

    // Create wallets for contacts
    CONTACTS.forEach(c => {
        contactWallets[c.id] = new Wallet(c.name, blockchain);
    });

    // Mine genesis block — gives main user initial coins (50 * 100 = 5000 FPC)
    blockchain.initialize(mainWallet.address);

    // Set up blockchain event callbacks
    blockchain.onBlockMined = (block) => {
        renderChainStats();
        renderBlockPreviews();
    };
    blockchain.onMempoolUpdate = (mempool) => {
        renderChainStats();
    };

    // Pre-mine a few blocks with simulated history
    seedHistoricalTransactions();

    // Initial renders
    updateBalanceDisplay();
    renderChainStats();
    renderBlockPreviews();
}

function seedHistoricalTransactions() {
    const historicalTxs = [
        { from: 'main', to: 1, amount: 45, note: 'Dinner split 🍣', dir: 'sent' },
        { from: 'main', to: 3, amount: 22.50, note: 'Coffee run ☕', dir: 'sent' },
        { from: 'main', to: 4, amount: 50, note: 'Birthday gift 🎁', dir: 'sent' },
    ];

    // Send from main wallet to contacts and mine block
    historicalTxs.forEach(h => {
        const recipientWallet = contactWallets[h.to];
        try {
            const tx = mainWallet.sendTo(recipientWallet.address, h.amount);
            const contact = getContact(h.to);
            onChainTxLog.push({
                txHash: tx.hash,
                contactId: h.to,
                type: 'sent',
                amount: h.amount,
                note: h.note,
                timestamp: Date.now() - Math.random() * 86400000 * 3,
                confirmed: false
            });
        } catch (e) { /* skip if insufficient */ }
    });

    // Mine block with all historical txs
    if (blockchain.mempool.length > 0) {
        blockchain.mineBlock(mainWallet.address);
        onChainTxLog.forEach(t => t.confirmed = true);
    }

    // Simulate some received payments (contacts send back to main)
    const receivedTxs = [
        { from: 1, amount: 30, note: 'Lunch payback 🍔' },
        { from: 5, amount: 120, note: 'Concert tickets 🎵' },
        { from: 8, amount: 18.75, note: 'Lunch 🍔' },
    ];

    receivedTxs.forEach(r => {
        const senderWallet = contactWallets[r.from];
        // Fund the contact first via a mined block
        try {
            const fundTx = mainWallet.sendTo(senderWallet.address, r.amount + 10);
            blockchain.mineBlock(mainWallet.address);
            // Now the contact sends back to main
            const tx = senderWallet.sendTo(mainWallet.address, r.amount);
            blockchain.mineBlock(mainWallet.address);
            onChainTxLog.push({
                txHash: tx.hash,
                contactId: r.from,
                type: 'received',
                amount: r.amount,
                note: r.note,
                timestamp: Date.now() - Math.random() * 86400000 * 5,
                confirmed: true
            });
        } catch (e) { /* skip */ }
    });

    // Sort by timestamp
    onChainTxLog.sort((a, b) => b.timestamp - a.timestamp);
}

// ===== HELPERS =====
function getContact(id) {
    return CONTACTS.find(c => c.id === id);
}

function getContactByAddress(address) {
    for (const [id, wallet] of Object.entries(contactWallets)) {
        if (wallet.address === address) return getContact(parseInt(id));
    }
    return null;
}

function formatFPC(amount) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
}

function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncateHash(hash, len = 8) {
    if (!hash) return '';
    return hash.substring(0, len) + '...' + hash.substring(hash.length - 6);
}

function getDateGroup(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const txDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today - txDay) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    return 'Earlier';
}

// ===== TOAST =====
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 2800);
}

// ===== BALANCE =====
function updateBalanceDisplay() {
    const balance = mainWallet.getBalance();
    const el = document.getElementById('balance-display');
    el.textContent = formatFPC(balance);
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'balancePulse 0.4s ease';
}

// ===== RENDERING =====
function renderTransactionItem(txLog) {
    const contact = getContact(txLog.contactId);
    if (!contact) return '';
    const isPositive = txLog.type === 'received';
    const sign = isPositive ? '+' : '-';
    const amountClass = isPositive ? 'positive' : 'negative';
    const confirmed = txLog.confirmed ? '' : ' (unconfirmed)';

    return `
        <div class="transaction-item" data-txhash="${txLog.txHash}">
            <div class="tx-avatar" style="background: ${COLORS[contact.colorIdx]}">${contact.initials}</div>
            <div class="tx-info">
                <div class="tx-name">${contact.name}</div>
                <div class="tx-note">${txLog.note}${confirmed}</div>
            </div>
            <div class="tx-right">
                <div class="tx-amount ${amountClass}">${sign}${formatFPC(txLog.amount)} FPC</div>
                <div class="tx-time">${formatTime(txLog.timestamp)}</div>
            </div>
        </div>
    `;
}

function renderRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    const recent = onChainTxLog.slice(0, 5);
    if (recent.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No transactions yet</div><div class="empty-state-text">Send some FPC to get started!</div></div>';
        return;
    }
    container.innerHTML = recent.map(renderTransactionItem).join('');
}

function renderAllTransactions(filter = 'all') {
    const container = document.getElementById('all-transactions');

    if (filter === 'blocks') {
        renderBlocksInActivity(container);
        return;
    }

    let filtered = onChainTxLog;
    if (filter === 'sent') filtered = onChainTxLog.filter(t => t.type === 'sent');
    else if (filter === 'received') filtered = onChainTxLog.filter(t => t.type === 'received');
    else if (filter === 'requests') filtered = [];

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="empty-state-title">No transactions</div><div class="empty-state-text">Nothing here yet.</div></div>`;
        return;
    }

    let html = '';
    let lastGroup = '';
    filtered.forEach(tx => {
        const group = getDateGroup(tx.timestamp);
        if (group !== lastGroup) {
            html += `<div class="tx-date-separator">${group}</div>`;
            lastGroup = group;
        }
        html += renderTransactionItem(tx);
    });
    container.innerHTML = html;
}

function renderBlocksInActivity(container) {
    const blocks = [...blockchain.chain].reverse();
    if (blocks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No blocks mined</div></div>';
        return;
    }
    container.innerHTML = '<div class="blocks-list">' + blocks.map(renderBlockCard).join('') + '</div>';
}

function renderBlockCard(block) {
    const timeStr = formatTime(block.timestamp);
    return `
        <div class="block-card" data-height="${block.height}">
            <div class="block-card-icon">#${block.height}</div>
            <div class="block-card-info">
                <div class="block-card-hash">${truncateHash(block.hash, 12)}</div>
                <div class="block-card-meta">Nonce: ${block.nonce.toLocaleString()} · ${block.miningTime}ms</div>
            </div>
            <div class="block-card-right">
                <div class="block-card-txcount">${block.transactions.length} tx${block.transactions.length !== 1 ? 's' : ''}</div>
                <div class="block-card-time">${timeStr}</div>
            </div>
        </div>
    `;
}

function renderBlockPreviews() {
    const container = document.getElementById('block-preview-list');
    const recent = [...blockchain.chain].reverse().slice(0, 3);
    container.innerHTML = recent.map(renderBlockCard).join('');
}

function renderChainStats() {
    const stats = blockchain.getStats();
    document.getElementById('stat-blocks').textContent = stats.blocks;
    document.getElementById('stat-txs').textContent = stats.transactions;
    document.getElementById('stat-hashrate').textContent = stats.hashRate > 1000
        ? (stats.hashRate / 1000).toFixed(1) + 'K'
        : stats.hashRate;
    document.getElementById('stat-difficulty').textContent = stats.difficulty;
}

function setMiningState(mining) {
    isMining = mining;
    const indicator = document.getElementById('mining-indicator');
    const text = document.getElementById('mining-status-text');
    if (mining) {
        indicator.classList.add('mining');
        text.textContent = 'Mining...';
    } else {
        indicator.classList.remove('mining');
        text.textContent = 'Synced';
    }
}

function renderPendingRequests() {
    const container = document.getElementById('pending-requests');
    const section = document.getElementById('pending-section');
    if (PENDING_REQUESTS.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    container.innerHTML = PENDING_REQUESTS.map(req => {
        const contact = getContact(req.contactId);
        if (!contact) return '';
        return `
            <div class="pending-item" data-reqid="${req.id}">
                <div class="tx-avatar" style="background: ${COLORS[contact.colorIdx]}">${contact.initials}</div>
                <div class="pending-info">
                    <div class="pending-name">${contact.name}</div>
                    <div class="pending-note">${req.note}</div>
                </div>
                <div class="pending-amount">${formatFPC(req.amount)} FPC</div>
                <div class="pending-actions">
                    <button class="pending-btn accept" data-action="accept" data-reqid="${req.id}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></button>
                    <button class="pending-btn decline" data-action="decline" data-reqid="${req.id}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
            </div>
        `;
    }).join('');
}

function renderContacts(searchTerm = '') {
    const container = document.getElementById('contacts-list');
    let filtered = CONTACTS;
    if (searchTerm) {
        const q = searchTerm.toLowerCase();
        filtered = CONTACTS.filter(c => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q));
    }
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No people found</div></div>';
        return;
    }
    container.innerHTML = filtered.map(contact => {
        const wallet = contactWallets[contact.id];
        const bal = blockchain.getBalance(wallet.address);
        return `
            <div class="contact-item" data-contactid="${contact.id}">
                <div class="contact-avatar" style="background: ${COLORS[contact.colorIdx]}">${contact.initials}</div>
                <div class="contact-info">
                    <div class="contact-name">${contact.name}</div>
                    <div class="contact-handle">${contact.handle} · ${formatFPC(bal)} FPC</div>
                </div>
                <button class="contact-action-btn" data-contactid="${contact.id}" data-action="send">Pay</button>
            </div>
        `;
    }).join('');
}

function renderModalContacts(searchTerm = '') {
    const container = document.getElementById('modal-contacts-list');
    let filtered = CONTACTS;
    if (searchTerm) {
        const q = searchTerm.toLowerCase();
        filtered = CONTACTS.filter(c => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q));
    }
    container.innerHTML = filtered.map(contact => `
        <div class="contact-item" data-contactid="${contact.id}">
            <div class="contact-avatar" style="background: ${COLORS[contact.colorIdx]}">${contact.initials}</div>
            <div class="contact-info">
                <div class="contact-name">${contact.name}</div>
                <div class="contact-handle">${contact.handle}</div>
            </div>
        </div>
    `).join('');
}

// ===== NAVIGATION =====
function navigateTo(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) { targetView.classList.add('active'); APP_STATE.currentView = viewId; }
    const targetNav = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (targetNav) targetNav.classList.add('active');
    if (viewId === 'activity') renderAllTransactions('all');
    if (viewId === 'contacts') { renderContacts(); document.getElementById('contact-search').value = ''; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== MODAL =====
function openModal(mode) {
    APP_STATE.modalMode = mode;
    APP_STATE.selectedContact = null;
    const title = document.getElementById('modal-title');
    const confirmText = document.getElementById('confirm-pay-text');
    const confirmBtn = document.getElementById('confirm-pay-btn');
    title.textContent = mode === 'send' ? 'Send FPC' : 'Request FPC';
    confirmText.textContent = mode === 'send' ? 'Pay' : 'Request';
    confirmBtn.classList.toggle('btn-request', mode === 'request');
    document.getElementById('step-contact').classList.remove('hidden');
    document.getElementById('step-amount').classList.add('hidden');
    document.getElementById('step-success').classList.add('hidden');
    document.getElementById('modal-contact-search').value = '';
    document.getElementById('amount-input').value = '';
    document.getElementById('note-input').value = '';
    renderModalContacts();
    document.getElementById('pay-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('pay-modal').classList.remove('open');
    APP_STATE.modalMode = null;
    APP_STATE.selectedContact = null;
}

function selectContact(contactId) {
    const contact = getContact(contactId);
    if (!contact) return;
    APP_STATE.selectedContact = contact;
    document.getElementById('selected-contact-display').innerHTML = `
        <div class="selected-contact-avatar" style="background: ${COLORS[contact.colorIdx]}">${contact.initials}</div>
        <div><div class="selected-contact-name">${contact.name}</div><div class="selected-contact-handle">${contact.handle}</div></div>
    `;
    document.getElementById('step-contact').classList.add('hidden');
    document.getElementById('step-amount').classList.remove('hidden');
    document.getElementById('amount-input').focus();
}

function processPayment() {
    const amountStr = document.getElementById('amount-input').value.replace(/[^0-9.]/g, '');
    const amount = parseFloat(amountStr);
    const note = document.getElementById('note-input').value || 'Payment';
    const contact = APP_STATE.selectedContact;
    if (!amount || amount <= 0 || !contact) { showToast('Enter a valid amount', 'error'); return; }

    const recipientWallet = contactWallets[contact.id];

    if (APP_STATE.modalMode === 'send') {
        if (amount > mainWallet.getBalance()) { showToast('Insufficient balance', 'error'); return; }

        try {
            // §2: Create UTXO transaction, sign with private key
            const tx = mainWallet.sendTo(recipientWallet.address, amount);

            // Show mining state
            setMiningState(true);

            // §4: Proof-of-Work mining (async feel via setTimeout)
            setTimeout(() => {
                const block = blockchain.mineBlock(mainWallet.address);
                setMiningState(false);
                lastMinedBlock = block;

                // Log for activity feed
                onChainTxLog.unshift({
                    txHash: tx.hash,
                    contactId: contact.id,
                    type: 'sent',
                    amount,
                    note,
                    timestamp: Date.now(),
                    confirmed: true
                });

                showSuccessState(contact, amount, tx, block);
            }, 50);

        } catch (e) {
            showToast(e.message, 'error');
        }
    } else {
        // Request flow — no blockchain tx, just log it
        showSuccessState(contact, amount, null, null, true);
    }
}

function showSuccessState(contact, amount, tx, block, isRequest = false) {
    document.getElementById('step-amount').classList.add('hidden');
    document.getElementById('step-success').classList.remove('hidden');

    const successTitle = document.getElementById('success-title');
    const successDetail = document.getElementById('success-detail');
    const chainInfo = document.getElementById('success-chain-info');

    if (isRequest) {
        successTitle.textContent = 'Request Sent!';
        successDetail.textContent = `Requested ${formatFPC(amount)} FPC from ${contact.name}`;
        chainInfo.innerHTML = '';
    } else {
        successTitle.textContent = 'Payment Sent!';
        successDetail.textContent = `${formatFPC(amount)} FPC sent to ${contact.name}`;
        chainInfo.innerHTML = `
            <div class="chain-label">On-Chain Confirmation</div>
            <div class="chain-row"><span class="chain-label">TX Hash</span><span class="chain-value">${truncateHash(tx.hash, 10)}</span></div>
            <div class="chain-row"><span class="chain-label">Block</span><span class="chain-value">#${block.height}</span></div>
            <div class="chain-row"><span class="chain-label">Block Hash</span><span class="chain-value">${truncateHash(block.hash, 10)}</span></div>
            <div class="chain-row"><span class="chain-label">Nonce</span><span class="chain-value">${block.nonce.toLocaleString()}</span></div>
            <div class="chain-row"><span class="chain-label">PoW Time</span><span class="chain-value">${block.miningTime}ms</span></div>
        `;
    }
}

function finishPayment() {
    closeModal();
    updateBalanceDisplay();
    renderRecentTransactions();
    renderPendingRequests();
    renderChainStats();
    renderBlockPreviews();
}

// ===== PENDING ACTIONS =====
function handlePendingAction(reqId, action) {
    const reqIndex = PENDING_REQUESTS.findIndex(r => r.id === parseInt(reqId));
    if (reqIndex === -1) return;
    const req = PENDING_REQUESTS[reqIndex];
    const contact = getContact(req.contactId);

    if (action === 'accept') {
        const recipientWallet = contactWallets[req.contactId];
        try {
            const tx = mainWallet.sendTo(recipientWallet.address, req.amount);
            setMiningState(true);
            setTimeout(() => {
                blockchain.mineBlock(mainWallet.address);
                setMiningState(false);
                onChainTxLog.unshift({
                    txHash: tx.hash, contactId: req.contactId, type: 'sent',
                    amount: req.amount, note: req.note, timestamp: Date.now(), confirmed: true
                });
                updateBalanceDisplay();
                renderRecentTransactions();
                renderChainStats();
                renderBlockPreviews();
                showToast(`Paid ${formatFPC(req.amount)} FPC to ${contact.name} ✓`);
            }, 50);
        } catch (e) { showToast(e.message, 'error'); }
    } else {
        showToast(`Declined request from ${contact.name}`);
    }

    PENDING_REQUESTS.splice(reqIndex, 1);
    renderPendingRequests();
}

// ===== EVENT LISTENERS =====
function appInit() {
    // Initialize blockchain
    initBlockchain();

    // Initial UI renders
    renderRecentTransactions();
    renderPendingRequests();
    renderContacts();

    // Nav buttons
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn =>
        btn.addEventListener('click', () => navigateTo(btn.dataset.view))
    );
    document.querySelectorAll('.back-btn').forEach(btn =>
        btn.addEventListener('click', () => navigateTo(btn.dataset.view))
    );
    document.querySelectorAll('.section-link[data-view]').forEach(link =>
        link.addEventListener('click', () => navigateTo(link.dataset.view))
    );

    // Quick actions
    document.getElementById('quick-send').addEventListener('click', () => openModal('send'));
    document.getElementById('quick-request').addEventListener('click', () => openModal('request'));
    document.getElementById('nav-send-btn').addEventListener('click', () => openModal('send'));
    document.getElementById('quick-scan').addEventListener('click', () => showToast('Camera opening... 📷'));
    document.getElementById('quick-split').addEventListener('click', () => showToast('Select friends to split with'));

    // Balance card actions
    document.getElementById('add-money-btn').addEventListener('click', () => {
        // Mine a block to earn mining reward
        setMiningState(true);
        setTimeout(() => {
            blockchain.mineBlock(mainWallet.address);
            setMiningState(false);
            updateBalanceDisplay();
            renderChainStats();
            renderBlockPreviews();
            showToast(`Mined block! +${MINING_REWARD} FPC mining reward ⛏️`);
        }, 50);
    });
    document.getElementById('cash-out-btn').addEventListener('click', () => showToast('Cash out to linked account'));

    // Notifications
    document.getElementById('notifications-btn').addEventListener('click', () => {
        const validation = blockchain.validateChain();
        showToast(validation.valid ? 'Chain valid ✓ No alerts' : `Chain invalid at block ${validation.block}: ${validation.reason}`, validation.valid ? 'success' : 'error');
    });

    // Modal
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('pay-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
    document.getElementById('modal-contact-search').addEventListener('input', (e) => renderModalContacts(e.target.value));
    document.getElementById('modal-contacts-list').addEventListener('click', (e) => {
        const item = e.target.closest('.contact-item');
        if (item) selectContact(parseInt(item.dataset.contactid));
    });

    // Amount input
    document.getElementById('amount-input').addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^0-9.]/g, '');
        const parts = val.split('.');
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
        if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2);
        e.target.value = val;
    });

    document.getElementById('confirm-pay-btn').addEventListener('click', processPayment);
    document.getElementById('done-btn').addEventListener('click', finishPayment);

    // Activity filters
    document.getElementById('activity-filters').addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        document.querySelectorAll('#activity-filters .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderAllTransactions(chip.dataset.filter);
    });

    // Contact search
    document.getElementById('contact-search').addEventListener('input', (e) => renderContacts(e.target.value));

    // Contact pay button
    document.getElementById('contacts-list').addEventListener('click', (e) => {
        const btn = e.target.closest('.contact-action-btn');
        if (btn) {
            const contactId = parseInt(btn.dataset.contactid);
            openModal('send');
            setTimeout(() => selectContact(contactId), 100);
        }
    });

    // Pending request actions
    document.getElementById('pending-requests').addEventListener('click', (e) => {
        const btn = e.target.closest('.pending-btn');
        if (!btn) return;
        handlePendingAction(btn.dataset.reqid, btn.dataset.action);
    });

    // Profile menu
    document.querySelectorAll('.profile-menu-item').forEach(item =>
        item.addEventListener('click', () => showToast('Settings coming soon'))
    );
    document.getElementById('add-contact-btn').addEventListener('click', () => showToast('Invite friends coming soon'));

    // Keyboard
    document.getElementById('amount-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('note-input').focus(); });
    document.getElementById('note-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') processPayment(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

// Robust initialization — handles both pre-loaded and loading states
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', appInit);
} else {
    appInit();
}

// Balance pulse animation
const style = document.createElement('style');
style.textContent = `@keyframes balancePulse { 0% { transform: scale(1); } 30% { transform: scale(1.04); } 100% { transform: scale(1); } }`;
document.head.appendChild(style);
