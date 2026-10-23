/*
 * 卓移動 KDS - アプリ本体
 *
 * ・古い iPad (iOS 9 の Safari) でも動くよう ES5 だけで書いています。
 *   (let / const / アロー関数 / テンプレート文字列 / fetch などは使わないでください)
 * ・端末間同期は Firebase Realtime Database の REST API + EventSource(ストリーミング) を使用。
 *   Firebase の SDK は使っていません。
 */

// ▼▼▼ Firebase Realtime Database の URL (Firebase コンソール → Realtime Database の上部に表示) ▼▼▼
var FIREBASE_DB_URL = 'https://table-transfer-kds-default-rtdb.asia-southeast1.firebasedatabase.app';
// ▲▲▲ ここまで ▲▲▲

// ▼▼▼ 店舗一覧 (店舗を追加するときはここに1行追加) ▼▼▼
//   id   : URL に使う英数字 (例: ?store=kyoto)。半角英小文字・数字・- _ のみ。一度決めたら変更しないでください
//   name : 画面に表示する店舗名
var STORES = [
    { id: 'kyoto', name: '京都' },
    { id: 'kobe', name: '神戸' },
    { id: 'tenma', name: '天満' }
];
// ▲▲▲ ここまで ▲▲▲

// データベース内の保存場所 (店舗ごとに /kds/stores/{店舗ID} に分かれます)
var DB_ROOT = '';
var currentStore = null;

// Preset Palette Colors for Table Distinction
var COLOR_PRESETS = [
    { id: 'amber', name: 'Amber', bg: 'bg-amber-500/20', border: 'border-amber-500/60', text: 'text-amber-300', dot: '#f59e0b' },
    { id: 'emerald', name: 'Emerald', bg: 'bg-emerald-500/20', border: 'border-emerald-500/60', text: 'text-emerald-300', dot: '#10b981' },
    { id: 'cyan', name: 'Cyan', bg: 'bg-cyan-500/20', border: 'border-cyan-500/60', text: 'text-cyan-300', dot: '#06b6d4' },
    { id: 'purple', name: 'Purple', bg: 'bg-purple-500/20', border: 'border-purple-500/60', text: 'text-purple-300', dot: '#a855f7' },
    { id: 'rose', name: 'Rose', bg: 'bg-rose-500/20', border: 'border-rose-500/60', text: 'text-rose-300', dot: '#f43f5e' },
    { id: 'indigo', name: 'Indigo', bg: 'bg-indigo-500/20', border: 'border-indigo-500/60', text: 'text-indigo-300', dot: '#6366f1' },
    { id: 'orange', name: 'Orange', bg: 'bg-orange-500/20', border: 'border-orange-500/60', text: 'text-orange-300', dot: '#f97316' },
    { id: 'slate', name: 'Slate', bg: 'bg-slate-800', border: 'border-slate-700', text: 'text-slate-300', dot: '#64748b' }
];

// 卓の初期値 (データベースに卓設定がまだ無い場合はこの内容で作成されます)
var DEFAULT_TABLES = [
    { name: '1', colorId: 'amber' },
    { name: '2', colorId: 'cyan' },
    { name: '3', colorId: 'purple' },
    { name: '4', colorId: 'emerald' },
    { name: '5', colorId: 'rose' },
    { name: '6', colorId: 'indigo' },
    { name: 'カウンター1', colorId: 'orange' },
    { name: 'カウンター2', colorId: 'slate' }
];

// State
var registeredTables = cloneTables(DEFAULT_TABLES);
var orders = [];
var currentTab = 'ACTIVE';
var soundEnabled = true;
var isSimulating = false;
var autoPushInterval = null;

// Selection State
var selectedGender = '男性';
var selectedFromTable = '1';
var selectedToTable = '3';
var activeNoteMode = 'text'; // 'text' | 'canvas'

// Modal Canvas State
var ticketCanvas = document.getElementById('ticketCanvas');
var ticketCtx = ticketCanvas.getContext('2d');
var isDrawing = false;
var modalPenColor = '#f87171';
var modalPenWidth = 4;
var modalTool = 'pen';
var lastPt = { x: 0, y: 0 };

// ===================== 小さなユーティリティ =====================
function findBy(arr, fn) {
    for (var i = 0; i < arr.length; i++) { if (fn(arr[i])) return arr[i]; }
    return null;
}
function someBy(arr, fn) { return !!findBy(arr, fn); }
function cloneTables(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push({ name: String(list[i].name), colorId: list[i].colorId });
    return out;
}
function pad(n) { return n < 10 ? '0' + n : String(n); }
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// onclick="fn('...')" に埋め込む文字列用
function escapeJsAttr(s) {
    return escapeHtml(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}
function formatHM(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function genId() {
    // 時刻順に並ぶユニークID
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return 'o' + t + r;
}
function genDisplayNo() {
    return 'TRF-' + Math.floor(100 + Math.random() * 900);
}

// ===================== 起動 =====================
window.onload = function () {
    detectFlexGap();
    lucide.createIcons();
    startClock();
    initModalCanvas();
    initAudioUnlock();
    renderAllViews();
    setInterval(updateTimersUI, 1000);

    var store = resolveStore();
    if (store) {
        enterStore(store);
    } else {
        openStorePicker();
    }
};

// ===================== 店舗の選択 =====================
var STORE_KEY = 'kds_store';

function storageGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
function storageRemove(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

function getQueryParam(name) {
    var q = window.location.search.replace(/^\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
        var kv = q[i].split('=');
        if (decodeURIComponent(kv[0]) === name) return decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    }
    return null;
}

function findStore(id) {
    if (!id) return null;
    id = String(id).toLowerCase();
    return findBy(STORES, function (s) { return s.id === id; });
}

// URL の ?store= → 端末に記憶した店舗 の順に決定
function resolveStore() {
    var fromUrl = findStore(getQueryParam('store'));
    if (fromUrl) return fromUrl;
    return findStore(storageGet(STORE_KEY));
}

function enterStore(store) {
    currentStore = store;
    DB_ROOT = '/kds/stores/' + store.id;
    storageSet(STORE_KEY, store.id);
    document.getElementById('storeName').textContent = store.name;
    document.title = '卓移動 KDS - ' + store.name;
    document.getElementById('storePickerModal').classList.add('hidden');
    Sync.start();
}

function openStorePicker() {
    var list = document.getElementById('storePickerList');
    list.innerHTML = '';
    STORES.forEach(function (s) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full px-4 py-4 mb-2 rounded-xl border-2 font-black text-base ' +
            (currentStore && currentStore.id === s.id
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-950 text-slate-100 border-slate-700');
        btn.textContent = s.name;
        btn.onclick = function () { chooseStore(s); };
        list.appendChild(btn);
    });
    document.getElementById('storePickerClose').style.display = currentStore ? '' : 'none';
    document.getElementById('storePickerModal').classList.remove('hidden');
}

function closeStorePicker() {
    if (currentStore) document.getElementById('storePickerModal').classList.add('hidden');
}

function chooseStore(store) {
    if (currentStore && currentStore.id === store.id) { closeStorePicker(); return; }
    storageSet(STORE_KEY, store.id);
    if (!currentStore) {
        enterStore(store);
    } else {
        // 店舗切替は確実にするため ?store= 付きで再読み込み
        window.location.href = window.location.pathname + '?store=' + encodeURIComponent(store.id);
    }
}

// flex の gap に非対応なブラウザ (古い Safari) には html に no-flexgap を付ける
function detectFlexGap() {
    var d = document.createElement('div');
    d.style.display = 'flex';
    d.style.flexDirection = 'column';
    d.style.rowGap = '1px';
    d.appendChild(document.createElement('div'));
    d.appendChild(document.createElement('div'));
    document.body.appendChild(d);
    var ok = d.scrollHeight === 1;
    document.body.removeChild(d);
    if (!ok) document.documentElement.className += ' no-flexgap';
}

function startClock() {
    var clockEl = document.getElementById('clock');
    function update() {
        var d = new Date();
        clockEl.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    update();
    setInterval(update, 1000);
}

function getTableColorObj(tblName) {
    var found = findBy(registeredTables, function (t) { return t.name === tblName; });
    var colorId = found ? found.colorId : 'amber';
    return findBy(COLOR_PRESETS, function (p) { return p.id === colorId; }) || COLOR_PRESETS[0];
}

// ===================== 通知音 =====================
// iOS は AudioContext を作れる数に上限があり、また最初のタップで有効化が必要なため1つを使い回す
var audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { audioCtx = new AC(); } catch (e) { return null; }
    }
    return audioCtx;
}
function initAudioUnlock() {
    var unlock = function () {
        var ctx = getAudioCtx();
        if (!ctx) return;
        try {
            if (ctx.resume) ctx.resume();
            var buf = ctx.createBuffer(1, 1, 22050);
            var src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            if (src.start) src.start(0); else src.noteOn(0);
        } catch (e) {}
        document.removeEventListener('touchend', unlock, false);
        document.removeEventListener('click', unlock, false);
    };
    document.addEventListener('touchend', unlock, false);
    document.addEventListener('click', unlock, false);
}

function playChime(type) {
    type = type || 'push';
    if (!soundEnabled) return;
    try {
        var ctx = getAudioCtx();
        if (!ctx) return;
        var t = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'push') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, t);
            osc.frequency.setValueAtTime(880, t + 0.12);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'complete') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, t);
            osc.frequency.setValueAtTime(659.25, t + 0.1);
            osc.frequency.setValueAtTime(783.99, t + 0.2);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.start(t);
            osc.stop(t + 0.5);
        }
    } catch (e) {}
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    var icon = document.getElementById('soundIcon');
    if (soundEnabled) {
        icon.setAttribute('data-lucide', 'volume-2');
        icon.setAttribute('class', 'w-5 h-5 text-emerald-400');
        showToast('サウンド通知', '音声をONにしました');
        playChime('push');
    } else {
        icon.setAttribute('data-lucide', 'volume-x');
        icon.setAttribute('class', 'w-5 h-5 text-slate-500');
        showToast('サウンド通知', '音声をオフにしました');
    }
    lucide.createIcons();
}

function createSampleCanvasData(text, color) {
    var c = document.createElement('canvas');
    c.width = 300;
    c.height = 100;
    var ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(text, 15, 45);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 55);
    ctx.lineTo(290, 55);
    ctx.stroke();
    return c.toDataURL();
}

// ===================== 画面切替・描画 =====================
function switchMainTab(tab) {
    currentTab = tab;
    var btnActive = document.getElementById('tabBtnActive');
    var btnCompleted = document.getElementById('tabBtnCompleted');
    var viewActive = document.getElementById('viewActive');
    var viewCompleted = document.getElementById('viewCompleted');
    var on = 'px-4 py-2 rounded-lg text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow flex items-center gap-1.5';
    var off = 'px-4 py-2 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center gap-1.5';

    if (tab === 'ACTIVE') {
        btnActive.className = on;
        btnCompleted.className = off;
        viewActive.classList.remove('hidden');
        viewCompleted.classList.add('hidden');
    } else {
        btnActive.className = off;
        btnCompleted.className = on;
        viewActive.classList.add('hidden');
        viewCompleted.classList.remove('hidden');
    }
    renderAllViews();
}

function renderAllViews() {
    renderActiveOrders();
    renderCompletedOrders();
    updateBadges();
    lucide.createIcons();
}

function renderNoteHtml(order) {
    if (order.noteType === 'text' && order.textNote) {
        return '<div class="mb-3 rounded-xl border border-slate-700/80 bg-slate-950/90 p-2.5">' +
            '<div class="text-[10px] font-bold text-amber-400 mb-1 flex items-center gap-1">' +
            '<i data-lucide="message-square" class="w-3 h-3"></i> 指示メモ (テキスト)</div>' +
            '<div class="text-xs text-slate-100 font-medium leading-relaxed break-words">' + escapeHtml(order.textNote) + '</div>' +
            '</div>';
    } else if (order.noteType === 'canvas' && order.canvasData) {
        return '<div class="mb-3 rounded-xl border border-slate-700/80 bg-slate-950/90 p-2">' +
            '<div class="text-[10px] font-bold text-amber-400 mb-1 flex items-center gap-1">' +
            '<i data-lucide="pen-tool" class="w-3 h-3"></i> 指示メモ (手書き)</div>' +
            '<img src="' + escapeHtml(order.canvasData) + '" class="w-full h-auto max-h-20 object-contain rounded bg-slate-900 border border-slate-800" alt="Note">' +
            '</div>';
    }
    return '';
}

function renderActiveOrders() {
    var grid = document.getElementById('activeGrid');
    var empty = document.getElementById('emptyActive');
    grid.innerHTML = '';

    var actives = orders.filter(function (o) { return o.status === 'ACTIVE'; });
    actives.sort(function (a, b) { return a.createdAt - b.createdAt; });

    if (actives.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    var now = Date.now();
    actives.forEach(function (order) {
        var elapsedMs = Math.max(0, now - order.createdAt);
        var elapsedMins = Math.floor(elapsedMs / 60000);
        var elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);

        var isMale = (order.gender || '男性') === '男性';

        var genderCardClass = isMale
            ? 'bg-slate-900 border-sky-400/80 text-sky-100'
            : 'bg-slate-900 border-pink-400/80 text-pink-100';
        var cardFillOverlayClass = isMale
            ? 'bg-gradient-to-br from-sky-950/90 via-slate-900/95 to-slate-900'
            : 'bg-gradient-to-br from-pink-950/90 via-slate-900/95 to-slate-900';
        var genderBadgeClass = isMale
            ? 'bg-sky-500 text-slate-950 font-black border-sky-300'
            : 'bg-pink-500 text-slate-950 font-black border-pink-300';
        var genderIcon = isMale ? '👨' : '👩';
        var genderLabel = isMale ? '男性 (MALE)' : '女性 (FEMALE)';

        var timerBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
        var urgencyBorder = genderCardClass;
        if (elapsedMins >= 10) {
            urgencyBorder = 'urgency-danger bg-slate-900 border-red-500';
            timerBadgeClass = 'bg-red-500/30 text-red-300 border-red-500/60 animate-pulse';
        } else if (elapsedMins >= 5) {
            timerBadgeClass = 'bg-amber-500/30 text-amber-300 border-amber-500/50';
        }

        var fromColor = getTableColorObj(order.fromTable);
        var toColor = getTableColorObj(order.toTable);

        var card = document.createElement('div');
        card.className = 'rounded-2xl border-2 p-4 flex flex-col shadow-2xl relative overflow-hidden transition-all ' + cardFillOverlayClass + ' ' + urgencyBorder;
        card.innerHTML =
            '<div class="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3 z-10">' +
                '<div class="flex items-center gap-2">' +
                    '<span class="text-xs px-3 py-1 rounded-xl border flex items-center gap-1.5 shadow ' + genderBadgeClass + '">' +
                        '<span class="text-base">' + genderIcon + '</span>' +
                        '<span class="tracking-wide">' + genderLabel + '</span>' +
                    '</span>' +
                '</div>' +
                '<div class="px-2.5 py-1 rounded-xl border text-xs font-mono font-bold flex items-center space-x-1 ' + timerBadgeClass + '" data-timer="' + order.createdAt + '">' +
                    '<i data-lucide="clock" class="w-3.5 h-3.5"></i>' +
                    '<span>' + pad(elapsedMins) + ':' + pad(elapsedSecs) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between mb-3 shadow-inner z-10">' +
                '<div class="text-center flex-1">' +
                    '<div class="text-[10px] font-bold text-slate-400 mb-0.5">移動元</div>' +
                    '<div class="inline-block px-3 py-1 rounded-xl border font-black text-lg font-mono ' + fromColor.bg + ' ' + fromColor.border + ' ' + fromColor.text + '">卓 ' + escapeHtml(order.fromTable) + '</div>' +
                '</div>' +
                '<i data-lucide="arrow-right" class="w-6 h-6 ' + (isMale ? 'text-sky-300' : 'text-pink-300') + ' flex-none mx-2"></i>' +
                '<div class="text-center flex-1">' +
                    '<div class="text-[10px] font-bold text-slate-400 mb-0.5">移動先</div>' +
                    '<div class="inline-block px-3 py-1 rounded-xl border font-black text-lg font-mono ' + toColor.bg + ' ' + toColor.border + ' ' + toColor.text + '">卓 ' + escapeHtml(order.toTable) + '</div>' +
                '</div>' +
            '</div>' +
            renderNoteHtml(order) +
            '<button onclick="completeOrder(\'' + escapeJsAttr(order.id) + '\')" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 z-10">' +
                '<i data-lucide="check-circle" class="w-5 h-5"></i>' +
                '<span>完了 (Complete)</span>' +
            '</button>';
        grid.appendChild(card);
    });
}

function renderCompletedOrders() {
    var list = document.getElementById('completedList');
    var empty = document.getElementById('emptyCompleted');
    var search = document.getElementById('completedSearchInput').value.trim().toLowerCase();
    list.innerHTML = '';

    var completed = orders.filter(function (o) { return o.status === 'COMPLETED'; });
    document.getElementById('completedTodayCount').textContent = completed.length;

    if (search) {
        completed = completed.filter(function (o) {
            return String(o.fromTable).toLowerCase().indexOf(search) !== -1 ||
                String(o.toTable).toLowerCase().indexOf(search) !== -1 ||
                (o.gender && o.gender.toLowerCase().indexOf(search) !== -1) ||
                (o.textNote && o.textNote.toLowerCase().indexOf(search) !== -1);
        });
    }

    if (completed.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    completed.sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });

    completed.forEach(function (order) {
        var finishedTime = order.completedAt ? formatHM(order.completedAt) : '--:--';
        var isMale = (order.gender || '男性') === '男性';
        var rowGenderBg = isMale ? 'bg-sky-950/40 border-sky-500/50' : 'bg-pink-950/40 border-pink-500/50';
        var genderBadgeClass = isMale ? 'bg-sky-500 text-slate-950 font-black' : 'bg-pink-500 text-slate-950 font-black';
        var genderIcon = isMale ? '👨' : '👩';
        var fromColor = getTableColorObj(order.fromTable);
        var toColor = getTableColorObj(order.toTable);

        var notePreview = '';
        if (order.noteType === 'text' && order.textNote) {
            notePreview = '<span class="text-amber-400">メモ: ' + escapeHtml(order.textNote) + '</span>';
        } else if (order.noteType === 'canvas' && order.canvasData) {
            notePreview = '<span class="text-amber-400">手書きメモあり</span>';
        }

        var row = document.createElement('div');
        row.className = 'border-2 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg transition-colors ' + rowGenderBg;
        row.innerHTML =
            '<div class="flex items-center space-x-3 flex-1 min-w-0">' +
                '<span class="text-xs px-2.5 py-1 rounded-xl flex items-center gap-1 flex-none ' + genderBadgeClass + '">' +
                    '<span>' + genderIcon + '</span><span>' + escapeHtml(order.gender || '男性') + '</span>' +
                '</span>' +
                '<div class="flex items-center gap-1.5 flex-none font-mono font-bold text-sm">' +
                    '<span class="px-2.5 py-1 rounded-lg border ' + fromColor.bg + ' ' + fromColor.border + ' ' + fromColor.text + '">卓 ' + escapeHtml(order.fromTable) + '</span>' +
                    '<i data-lucide="arrow-right" class="w-4 h-4 text-slate-400"></i>' +
                    '<span class="px-2.5 py-1 rounded-lg border ' + toColor.bg + ' ' + toColor.border + ' ' + toColor.text + '">卓 ' + escapeHtml(order.toTable) + '</span>' +
                '</div>' +
                '<div class="truncate">' +
                    '<div class="text-xs font-bold text-slate-200 truncate">商品: 移動 ' + (notePreview ? '• ' + notePreview : '') + '</div>' +
                    '<div class="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">' +
                        '<span>完了: ' + finishedTime + '</span><span>•</span><span>ID: ' + escapeHtml(order.no || order.id) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<button onclick="restoreOrder(\'' + escapeJsAttr(order.id) + '\')" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-none">' +
                '<i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i><span>移動待ちに戻す</span>' +
            '</button>';
        list.appendChild(row);
    });

    lucide.createIcons();
}

// ===================== 操作 =====================
function completeOrder(id) {
    var order = findBy(orders, function (o) { return o.id === id; });
    if (order) {
        Sync.updateOrder(id, { status: 'COMPLETED', completedAt: Date.now() });
        playChime('complete');
        showToast('移動完了', (order.gender || '') + ' 卓 ' + order.fromTable + ' ➔ 卓 ' + order.toTable + ' の移動を完了しました');
    }
}

function restoreOrder(id) {
    var order = findBy(orders, function (o) { return o.id === id; });
    if (order) {
        Sync.updateOrder(id, { status: 'ACTIVE', completedAt: null });
        showToast('伝票を復元', (order.gender || '') + ' 卓 ' + order.fromTable + ' ➔ 卓 ' + order.toTable + ' の移動指示を復元しました');
    }
}

function updateBadges() {
    document.getElementById('activeBadge').textContent = orders.filter(function (o) { return o.status === 'ACTIVE'; }).length;
    document.getElementById('completedBadge').textContent = orders.filter(function (o) { return o.status === 'COMPLETED'; }).length;
}

function updateTimersUI() {
    var timerEls = document.querySelectorAll('[data-timer]');
    var now = Date.now();
    for (var i = 0; i < timerEls.length; i++) {
        var el = timerEls[i];
        var createdAt = parseInt(el.getAttribute('data-timer'), 10);
        var elapsedMs = Math.max(0, now - createdAt);
        var span = el.querySelector('span');
        if (span) span.textContent = pad(Math.floor(elapsedMs / 60000)) + ':' + pad(Math.floor((elapsedMs % 60000) / 1000));
    }
}

// ===================== 卓設定 =====================
function openTableMgmtModal() {
    renderMgmtTablesGrid();
    document.getElementById('tableMgmtModal').classList.remove('hidden');
}

function closeTableMgmtModal() {
    document.getElementById('tableMgmtModal').classList.add('hidden');
}

function handleAddTableFromMgmt() {
    var input = document.getElementById('modalAddTableInput');
    var val = input.value.trim();
    if (!val) return;

    if (!someBy(registeredTables, function (t) { return t.name === val; })) {
        var randColor = COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)].id;
        var next = cloneTables(registeredTables);
        next.push({ name: val, colorId: randColor });
        Sync.saveTables(next);
        showToast('卓追加', '卓番号「' + val + '」を追加しました');
    } else {
        showToast('お知らせ', '卓番号「' + val + '」は既に登録されています');
    }
    input.value = '';
}

function setTableColor(tblName, colorId) {
    var next = cloneTables(registeredTables);
    var tbl = findBy(next, function (t) { return t.name === tblName; });
    if (tbl) {
        tbl.colorId = colorId;
        Sync.saveTables(next);
    }
}

function removeTable(tblName) {
    var inActiveOrder = someBy(orders, function (o) {
        return o.status === 'ACTIVE' && (o.fromTable === tblName || o.toTable === tblName);
    });
    if (inActiveOrder) {
        showToast('削除不可', '卓 ' + tblName + ' は現在移動待ちの伝票で使用中のため削除できません');
        return;
    }
    var next = registeredTables.filter(function (t) { return t.name !== tblName; });
    Sync.saveTables(next);
    showToast('卓削除', '卓 「' + tblName + '」 を削除しました');
}

function renderMgmtTablesGrid() {
    var container = document.getElementById('mgmtTablesGrid');
    container.innerHTML = '';

    if (registeredTables.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-xs text-slate-500">登録されている卓はありません</div>';
        return;
    }

    registeredTables.forEach(function (tbl) {
        var curColor = findBy(COLOR_PRESETS, function (p) { return p.id === tbl.colorId; }) || COLOR_PRESETS[0];
        var item = document.createElement('div');
        item.className = 'flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 border border-slate-800 p-2.5 rounded-xl gap-2';

        var dotsHtml = COLOR_PRESETS.map(function (p) {
            return '<button type="button" onclick="setTableColor(\'' + escapeJsAttr(tbl.name) + '\', \'' + p.id + '\')" ' +
                'class="w-6 h-6 rounded-full transition-transform ' + (p.id === tbl.colorId ? 'scale-125 ring-2 ring-white' : 'opacity-70') + '" ' +
                'style="background-color: ' + p.dot + '; margin: 0 3px;" title="' + p.name + '"></button>';
        }).join('');

        item.innerHTML =
            '<div class="flex items-center space-x-2">' +
                '<span class="inline-block px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ' + curColor.bg + ' ' + curColor.border + ' ' + curColor.text + '">卓 ' + escapeHtml(tbl.name) + '</span>' +
            '</div>' +
            '<div class="flex items-center justify-between sm:justify-end gap-3">' +
                '<div class="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">' + dotsHtml + '</div>' +
                '<button onclick="removeTable(\'' + escapeJsAttr(tbl.name) + '\')" class="p-1.5 text-red-400 hover:text-red-300 rounded-lg transition-colors flex-none" title="この卓を削除">' +
                    '<i data-lucide="trash-2" class="w-5 h-5"></i>' +
                '</button>' +
            '</div>';
        container.appendChild(item);
    });
    lucide.createIcons();
}

// ===================== オーダー発行モーダル =====================
function selectGender(gender) {
    selectedGender = gender;
    renderGenderButtons();
}

function renderGenderButtons() {
    var btnMale = document.getElementById('genderBtnMale');
    var btnFemale = document.getElementById('genderBtnFemale');
    var base = 'py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ';
    var offCls = base + 'border bg-slate-950 border-slate-800 text-slate-400';

    if (selectedGender === '男性') {
        btnMale.className = base + 'border-2 bg-sky-950 border-sky-400 text-sky-200 shadow-lg';
        btnFemale.className = offCls;
    } else {
        btnMale.className = offCls;
        btnFemale.className = base + 'border-2 bg-pink-950 border-pink-400 text-pink-200 shadow-lg';
    }
}

function renderTableButtons() {
    renderGenderButtons();
    var fromContainer = document.getElementById('fromTableButtons');
    var toContainer = document.getElementById('toTableButtons');
    fromContainer.innerHTML = '';
    toContainer.innerHTML = '';

    if (registeredTables.length === 0) {
        var emptyHtml = '<div class="col-span-full text-center py-2 text-xs text-slate-500">卓が登録されていません</div>';
        fromContainer.innerHTML = emptyHtml;
        toContainer.innerHTML = emptyHtml;
        return;
    }

    registeredTables.forEach(function (tblObj) {
        var tbl = tblObj.name;
        var colorObj = getTableColorObj(tbl);
        var colorCls = colorObj.bg + ' ' + colorObj.border + ' ' + colorObj.text;

        var btnFrom = document.createElement('button');
        btnFrom.type = 'button';
        btnFrom.onclick = function () { selectFromTable(tbl); };
        btnFrom.className = selectedFromTable === tbl
            ? 'px-2.5 py-2 rounded-xl border-2 font-black font-mono text-xs shadow-md ' + colorCls + ' ring-2 ring-amber-400'
            : 'px-2.5 py-2 rounded-xl border font-bold font-mono text-xs opacity-70 ' + colorCls;
        btnFrom.textContent = '卓 ' + tbl;
        fromContainer.appendChild(btnFrom);

        var btnTo = document.createElement('button');
        btnTo.type = 'button';
        btnTo.onclick = function () { selectToTable(tbl); };
        btnTo.className = selectedToTable === tbl
            ? 'px-2.5 py-2 rounded-xl border-2 font-black font-mono text-xs shadow-md ' + colorCls + ' ring-2 ring-emerald-400'
            : 'px-2.5 py-2 rounded-xl border font-bold font-mono text-xs opacity-70 ' + colorCls;
        btnTo.textContent = '卓 ' + tbl;
        toContainer.appendChild(btnTo);
    });

    document.getElementById('fromSelectedBadge').textContent = selectedFromTable ? '卓 ' + selectedFromTable : '未選択';
    document.getElementById('toSelectedBadge').textContent = selectedToTable ? '卓 ' + selectedToTable : '未選択';
}

function selectFromTable(tbl) { selectedFromTable = tbl; renderTableButtons(); }
function selectToTable(tbl) { selectedToTable = tbl; renderTableButtons(); }

function switchNoteMode(mode) {
    activeNoteMode = mode;
    var btnText = document.getElementById('noteTabBtnText');
    var btnCanvas = document.getElementById('noteTabBtnCanvas');
    var secText = document.getElementById('noteModeText');
    var secCanvas = document.getElementById('noteModeCanvas');
    var on = 'px-3 py-1 rounded-md text-xs font-bold transition-all bg-amber-500 text-slate-950 flex items-center gap-1 shadow';
    var off = 'px-3 py-1 rounded-md text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center gap-1';

    if (mode === 'text') {
        btnText.className = on;
        btnCanvas.className = off;
        secText.classList.remove('hidden');
        secCanvas.classList.add('hidden');
    } else {
        btnText.className = off;
        btnCanvas.className = on;
        secText.classList.add('hidden');
        secCanvas.classList.remove('hidden');
        setTimeout(resizeModalCanvas, 50);
    }
}

function openOrderModal() {
    renderTableButtons();
    clearModalCanvas();
    document.getElementById('textNoteInput').value = '';
    switchNoteMode('text');
    document.getElementById('orderModal').classList.remove('hidden');
}

function closeOrderModal() {
    document.getElementById('orderModal').classList.add('hidden');
}

function submitTransferOrder() {
    if (!selectedFromTable || !selectedToTable) {
        showToast('エラー', '移動元と移動先の両方の卓を選択してください');
        return;
    }
    if (selectedFromTable === selectedToTable) {
        showToast('警告', '移動元と移動先に同じ卓が選択されています');
        return;
    }

    var canvasData = null;
    var textNote = '';
    if (activeNoteMode === 'text') {
        textNote = document.getElementById('textNoteInput').value.trim();
    } else if (activeNoteMode === 'canvas' && hasCanvasContent(ticketCanvas)) {
        canvasData = ticketCanvas.toDataURL();
    }

    Sync.addOrder({
        no: genDisplayNo(),
        gender: selectedGender,
        fromTable: selectedFromTable,
        toTable: selectedToTable,
        item: '移動',
        createdAt: Date.now(),
        status: 'ACTIVE',
        noteType: activeNoteMode,
        canvasData: canvasData,
        textNote: textNote
    });
    closeOrderModal();
    playChime('push');
    showToast('移動指示送信', selectedGender + ' 卓 ' + selectedFromTable + ' ➔ 卓 ' + selectedToTable + ' の移動指示を送信しました');
}

// ===================== 手書きキャンバス (タッチ / マウス / ペン 対応) =====================
function initModalCanvas() {
    if (window.PointerEvent) {
        ticketCanvas.addEventListener('pointerdown', startModalDraw, false);
        ticketCanvas.addEventListener('pointermove', modalDraw, false);
        ticketCanvas.addEventListener('pointerup', stopModalDraw, false);
        ticketCanvas.addEventListener('pointercancel', stopModalDraw, false);
    } else {
        // 古い iOS は Pointer Events 非対応のため touch / mouse で処理
        ticketCanvas.addEventListener('touchstart', startModalDraw, false);
        ticketCanvas.addEventListener('touchmove', modalDraw, false);
        ticketCanvas.addEventListener('touchend', stopModalDraw, false);
        ticketCanvas.addEventListener('touchcancel', stopModalDraw, false);
        ticketCanvas.addEventListener('mousedown', startModalDraw, false);
        ticketCanvas.addEventListener('mousemove', modalDraw, false);
        window.addEventListener('mouseup', stopModalDraw, false);
    }
}

function resizeModalCanvas() {
    var rect = ticketCanvas.parentElement.getBoundingClientRect();
    ticketCanvas.width = rect.width || 300;
    ticketCanvas.height = rect.height || 100;
    ticketCtx.lineCap = 'round';
    ticketCtx.lineJoin = 'round';
}

function getModalPt(e) {
    var rect = ticketCanvas.getBoundingClientRect();
    var src = (e.touches && e.touches.length) ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

function startModalDraw(e) {
    if (e.type === 'touchstart') e.preventDefault();
    isDrawing = true;
    lastPt = getModalPt(e);
}

function modalDraw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    var currentPt = getModalPt(e);
    ticketCtx.beginPath();
    if (modalTool === 'eraser') {
        ticketCtx.globalCompositeOperation = 'destination-out';
        ticketCtx.lineWidth = modalPenWidth * 4;
    } else {
        ticketCtx.globalCompositeOperation = 'source-over';
        ticketCtx.strokeStyle = modalPenColor;
        ticketCtx.lineWidth = modalPenWidth;
    }
    ticketCtx.moveTo(lastPt.x, lastPt.y);
    ticketCtx.lineTo(currentPt.x, currentPt.y);
    ticketCtx.stroke();
    lastPt = currentPt;
}

function stopModalDraw() { isDrawing = false; }

function setModalPenColor(color) {
    modalPenColor = color;
    setModalTool('pen');
    var btns = document.querySelectorAll('.modal-color-btn');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        var cls = ['ring-2', 'ring-amber-400', 'ring-offset-1', 'ring-offset-slate-900'];
        for (var j = 0; j < cls.length; j++) {
            if (btn.getAttribute('data-color') === color) btn.classList.add(cls[j]);
            else btn.classList.remove(cls[j]);
        }
    }
}

function setModalTool(tool) {
    modalTool = tool;
    var eraserBtn = document.getElementById('modalEraserBtn');
    eraserBtn.className = tool === 'eraser' ? 'p-1 text-amber-400 bg-slate-800 rounded' : 'p-1 text-slate-400 hover:text-slate-100 rounded';
}

function clearModalCanvas() {
    ticketCtx.clearRect(0, 0, ticketCanvas.width, ticketCanvas.height);
}

function hasCanvasContent(canvas) {
    var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (var i = 3; i < data.length; i += 4) { if (data[i] !== 0) return true; }
    return false;
}

// ===================== デモ =====================
function togglePushSimulation() {
    isSimulating = !isSimulating;
    var statusTxt = document.getElementById('simStatusText');
    var icon = document.getElementById('simIcon');

    if (isSimulating) {
        statusTxt.textContent = 'ON';
        statusTxt.className = 'font-bold text-amber-400';
        icon.setAttribute('class', 'w-4 h-4 text-amber-400 animate-spin');
        simulateIncomingPush();
        autoPushInterval = setInterval(simulateIncomingPush, 8000);
    } else {
        statusTxt.textContent = 'OFF';
        statusTxt.className = 'font-bold text-slate-400';
        icon.setAttribute('class', 'w-4 h-4 text-slate-400');
        if (autoPushInterval) clearInterval(autoPushInterval);
    }
}

function simulateIncomingPush() {
    if (registeredTables.length < 2) return;
    var fromIdx = Math.floor(Math.random() * registeredTables.length);
    var toIdx = Math.floor(Math.random() * registeredTables.length);
    if (toIdx === fromIdx) toIdx = (fromIdx + 1) % registeredTables.length;

    var fromTbl = registeredTables[fromIdx].name;
    var toTbl = registeredTables[toIdx].name;
    var simGender = Math.random() > 0.5 ? '男性' : '女性';
    var isText = Math.random() > 0.5;

    Sync.addOrder({
        no: genDisplayNo(),
        gender: simGender,
        fromTable: fromTbl,
        toTable: toTbl,
        item: '移動',
        createdAt: Date.now(),
        status: 'ACTIVE',
        noteType: isText ? 'text' : 'canvas',
        canvasData: !isText ? createSampleCanvasData('急ぎで移動願います', simGender === '男性' ? '#60a5fa' : '#f472b6') : null,
        textNote: isText ? 'お冷やカトラリーのセットも一緒にご用意ください' : ''
    });
    playChime('push');
    showToast('NEW TRANSFER ORDER', simGender + ' 卓 ' + fromTbl + ' ➔ 卓 ' + toTbl + ' 移動指示');
}

// ===================== トースト =====================
var toastTimer = null;
function showToast(title, msg) {
    var toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMsg').textContent = msg;
    toast.classList.remove('translate-y-20');
    toast.classList.remove('opacity-0');
    toast.classList.add('translate-y-0');
    toast.classList.add('opacity-100');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        toast.classList.remove('translate-y-0');
        toast.classList.remove('opacity-100');
        toast.classList.add('translate-y-20');
        toast.classList.add('opacity-0');
    }, 3000);
}

// ===================== 同期状態の表示 =====================
function setSyncStatus(state) {
    var wrap = document.getElementById('syncStatus');
    var dot = document.getElementById('syncDot');
    var txt = document.getElementById('syncText');
    var map = {
        online:     { c: 'text-emerald-400', d: 'bg-emerald-500 animate-pulse', t: '同期中' },
        offline:    { c: 'text-amber-400',   d: 'bg-amber-500',                 t: 'オフライン (再接続待ち)' },
        connecting: { c: 'text-slate-400',   d: 'bg-slate-500 animate-pulse',   t: '接続中…' },
        error:      { c: 'text-red-400',     d: 'bg-red-500',                   t: '同期エラー' },
        unsupported:{ c: 'text-red-400',     d: 'bg-red-500',                   t: 'この端末は同期非対応' }
    };
    var s = map[state] || map.connecting;
    wrap.className = 'flex items-center font-medium ' + s.c;
    dot.className = 'w-2 h-2 rounded-full mr-1.5 ' + s.d;
    txt.textContent = s.t;
}

// ===================== データ受信時の反映 =====================
function applyRemoteOrders(list) {
    orders = list;
    renderAllViews();
}

function applyRemoteTables(tables) {
    registeredTables = tables;
    if (!someBy(registeredTables, function (t) { return t.name === selectedFromTable; })) {
        selectedFromTable = registeredTables[0] ? registeredTables[0].name : '';
    }
    if (!someBy(registeredTables, function (t) { return t.name === selectedToTable; })) {
        selectedToTable = registeredTables[1] ? registeredTables[1].name : (registeredTables[0] ? registeredTables[0].name : '');
    }
    if (!document.getElementById('tableMgmtModal').classList.contains('hidden')) renderMgmtTablesGrid();
    if (!document.getElementById('orderModal').classList.contains('hidden')) renderTableButtons();
    renderAllViews();
}

function notifyRemoteOrder(order) {
    playChime('push');
    showToast('NEW TRANSFER ORDER', (order.gender || '') + ' 卓 ' + order.fromTable + ' ➔ 卓 ' + order.toTable + ' 移動指示');
}

// =====================================================================
//  Firebase Realtime Database 同期 (REST API + EventSource)
//  データ構造:  /kds/stores/{店舗ID}/orders/{id} = 移動オーダー
//               /kds/stores/{店舗ID}/tables      = [{ name, colorId }, ...]
// =====================================================================
var Sync = (function () {
    var tree = {};              // /kds 以下のデータの手元コピー
    var es = null;              // EventSource
    var lastEventAt = 0;
    var gotInitial = false;
    var seededTables = false;
    var knownIds = {};          // 既に表示済みのオーダーID
    var localIds = {};          // この端末で作成したオーダーID (通知音を鳴らさない)
    var queue = [];             // 送信待ちの書き込み
    var sending = false;
    var reconnectTimer = null;

    function url(path) { return FIREBASE_DB_URL + DB_ROOT + path + '.json'; }

    // ---- 書き込み (失敗したら自動で再送) ----
    function enqueue(method, path, body) {
        queue.push({ method: method, path: path, body: body });
        flush();
    }
    function flush() {
        if (sending || queue.length === 0) return;
        sending = true;
        var op = queue[0];
        var xhr = new XMLHttpRequest();
        xhr.open(op.method, url(op.path), true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            sending = false;
            if (xhr.status >= 200 && xhr.status < 300) {
                queue.shift();
                flush();
            } else if (xhr.status === 401 || xhr.status === 403) {
                queue.shift();
                setSyncStatus('error');
                showToast('同期エラー', 'データベースのルール (権限) を確認してください');
                flush();
            } else {
                // 通信エラーなど: 3秒後に再送
                setTimeout(flush, 3000);
            }
        };
        xhr.send(op.body === undefined ? null : JSON.stringify(op.body));
    }

    // ---- 手元コピーの更新 ----
    function setAt(path, data) {
        var parts = path.split('/').filter(function (p) { return p !== ''; });
        if (parts.length === 0) { tree = (data && typeof data === 'object') ? data : {}; return; }
        var node = tree;
        for (var i = 0; i < parts.length - 1; i++) {
            if (!node[parts[i]] || typeof node[parts[i]] !== 'object') {
                if (data === null) return;
                node[parts[i]] = {};
            }
            node = node[parts[i]];
        }
        var last = parts[parts.length - 1];
        if (data === null) delete node[last]; else node[last] = data;
    }

    function toArray(v) {
        var out = [];
        if (!v) return out;
        if (Object.prototype.toString.call(v) === '[object Array]') {
            for (var i = 0; i < v.length; i++) if (v[i]) out.push(v[i]);
        } else {
            var keys = Object.keys(v).sort(function (a, b) { return Number(a) - Number(b); });
            for (var j = 0; j < keys.length; j++) if (v[keys[j]]) out.push(v[keys[j]]);
        }
        return out;
    }

    function publish() {
        // オーダー
        var list = [];
        var src = tree.orders || {};
        var fresh = [];
        Object.keys(src).forEach(function (id) {
            var o = src[id];
            if (!o || typeof o !== 'object') return;
            var copy = {};
            for (var k in o) if (o.hasOwnProperty(k)) copy[k] = o[k];
            copy.id = id;
            list.push(copy);
            if (!knownIds[id]) {
                knownIds[id] = true;
                if (gotInitial && !localIds[id]) fresh.push(copy);
            }
        });
        applyRemoteOrders(list);

        fresh.forEach(function (o) {
            // 再接続時の取りこぼし分で大量に鳴らないよう、直近1分以内のものだけ通知
            if (o.status === 'ACTIVE' && Date.now() - (o.createdAt || 0) < 60000) notifyRemoteOrder(o);
        });

        // 卓設定
        if (tree.tables) {
            applyRemoteTables(cloneTables(toArray(tree.tables)));
        } else if (gotInitial && !seededTables) {
            seededTables = true;
            api.saveTables(DEFAULT_TABLES);
        }
    }

    // ---- 受信 (ストリーミング) ----
    function onPut(e) {
        lastEventAt = Date.now();
        var msg = JSON.parse(e.data);
        setAt(msg.path, msg.data);
        if (msg.path === '/') gotInitialOnce();
        setSyncStatus('online');
        publish();
    }
    function onPatch(e) {
        lastEventAt = Date.now();
        var msg = JSON.parse(e.data);
        var base = msg.path === '/' ? '' : msg.path;
        for (var k in msg.data) if (msg.data.hasOwnProperty(k)) setAt(base + '/' + k, msg.data[k]);
        setSyncStatus('online');
        publish();
    }
    function gotInitialOnce() {
        if (!gotInitial) {
            // 初回の全データ受信: 既存のオーダーは通知しない
            var src = tree.orders || {};
            Object.keys(src).forEach(function (id) { knownIds[id] = true; });
            gotInitial = true;
        }
    }

    function connect() {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (es) { try { es.close(); } catch (e) {} es = null; }
        setSyncStatus('connecting');
        lastEventAt = Date.now();
        es = new EventSource(url(''));
        es.addEventListener('put', onPut, false);
        es.addEventListener('patch', onPatch, false);
        es.addEventListener('keep-alive', function () { lastEventAt = Date.now(); setSyncStatus('online'); }, false);
        es.addEventListener('cancel', function () {
            setSyncStatus('error');
            showToast('同期エラー', 'データベースのルール (読み取り権限) を確認してください');
        }, false);
        es.onerror = function () {
            setSyncStatus(navigator.onLine === false ? 'offline' : 'connecting');
            // ブラウザが自動再接続しない状態 (CLOSED) なら5秒後に張り直す
            if (es && es.readyState === 2 && !reconnectTimer) {
                reconnectTimer = setTimeout(connect, 5000);
            }
        };
    }

    var api = {
        start: function () {
            if (!window.EventSource || !window.XMLHttpRequest) {
                setSyncStatus('unsupported');
                return;
            }
            connect();
            // 一定時間なにも受信しなければ接続を張り直す (スリープ復帰対策)
            setInterval(function () {
                if (Date.now() - lastEventAt > 90000) connect();
            }, 15000);
            window.addEventListener('online', function () { connect(); flush(); }, false);
            window.addEventListener('offline', function () { setSyncStatus('offline'); }, false);
            // 画面が再表示されたら最新化
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden && Date.now() - lastEventAt > 30000) connect();
            }, false);
        },
        addOrder: function (order) {
            var id = genId();
            var data = {};
            for (var k in order) if (order.hasOwnProperty(k) && order[k] !== null && order[k] !== undefined) data[k] = order[k];
            localIds[id] = true;
            knownIds[id] = true;
            setAt('/orders/' + id, data);   // 先に手元へ反映
            publish();
            enqueue('PUT', '/orders/' + id, data);
        },
        updateOrder: function (id, patch) {
            for (var k in patch) if (patch.hasOwnProperty(k)) setAt('/orders/' + id + '/' + k, patch[k]);
            publish();
            enqueue('PATCH', '/orders/' + id, patch);
        },
        saveTables: function (tables) {
            var data = cloneTables(tables);
            setAt('/tables', data);
            publish();
            enqueue('PUT', '/tables', data);
        }
    };
    return api;
})();
