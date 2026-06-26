// ==UserScript==
// @name         Roblox Badge Deleter
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Delete all badges from your own Roblox profile — with dry-run, pause/resume, draggable panel, and more
// @author       Bulut
// @match        https://www.roblox.com/users/*/profile
// @icon         https://www.google.com/s2/favicons?sz=64&domain=roblox.com
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

(async function () {
    'use strict';

    const CONFIG = {
        DELETE_DELAY_MS:    500,
        RETRY_LIMIT:        3,
        RETRY_DELAY_MS:     2000,
        PAGE_LIMIT:         100,
        RATE_LIMIT_BASE_MS: 10000,
        RATE_LIMIT_MAX_MS:  120000,
        RATE_LIMIT_RETRIES: 5,
    };

    // ── Auth check ──────────────────────────────────────────────────────────
    async function getAuthenticatedUserId() {
        const res = await fetch('https://users.roblox.com/v1/users/authenticated', {
            credentials: 'include',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.id ? String(data.id) : null;
    }

    const pageUserId = window.location.pathname.split('/')[2];
    const authedId   = await getAuthenticatedUserId();

    if (!authedId || pageUserId !== authedId) return;

    // ── State ────────────────────────────────────────────────────────────────
    let XCSRF          = '';
    let totalDeleted   = 0;
    let totalFailed    = 0;
    let totalSkipped   = 0;
    let isCancelled    = false;
    let isPaused       = false;
    let isDryRun       = false;
    let rateLimitHits  = 0;
    let currentBackoff = CONFIG.RATE_LIMIT_BASE_MS;
    let gameFilter     = GM_getValue('gameFilter', '');
    let deleteDelay    = parseInt(GM_getValue('deleteDelay', CONFIG.DELETE_DELAY_MS), 10);
    let isMinimized    = GM_getValue('minimized', false);
    let logLines       = [];

    // ── UI Build ─────────────────────────────────────────────────────────────
    const ui = buildUI();
    document.body.appendChild(ui.root);

    // Restore minimized state
    if (isMinimized) applyMinimize(true);

    // Keyboard shortcut: Escape = cancel, Space = pause
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !ui.cancelBtn.disabled) {
            isCancelled = true;
            isPaused = false;
            setStatus('Cancelling…');
            ui.cancelBtn.disabled = true;
            ui.pauseBtn.disabled  = true;
        }
        if (e.key === ' ' && e.target === document.body && !ui.pauseBtn.disabled) {
            e.preventDefault();
            togglePause();
        }
    });

    function buildUI() {
        // ── Styles ──
        const style = document.createElement('style');
        style.textContent = `
            #bd-root * { box-sizing: border-box; }
            #bd-root { all: initial; }

            #bd-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                width: 360px;
                background: #0d0d14;
                border: 1px solid rgba(220, 53, 69, 0.30);
                border-radius: 16px;
                padding: 18px;
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                font-size: 13px;
                color: #c8c8d4;
                box-shadow:
                    0 0 0 1px rgba(255,255,255,0.04),
                    0 28px 56px rgba(0,0,0,0.75),
                    0 0 100px rgba(220,53,69,0.07);
                user-select: none;
                transition: height 0.25s ease, padding 0.25s ease;
            }

            #bd-container.minimized {
                padding-bottom: 18px;
            }

            #bd-container.minimized #bd-body {
                display: none;
            }

            /* Drag handle indicator */
            #bd-header {
                display: flex;
                align-items: center;
                gap: 9px;
                margin-bottom: 14px;
                cursor: grab;
            }
            #bd-header:active { cursor: grabbing; }

            #bd-icon {
                width: 30px;
                height: 30px;
                background: linear-gradient(135deg, #dc3545 0%, #9b1c2a 100%);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 15px;
                flex-shrink: 0;
            }

            #bd-title-wrap { flex: 1; min-width: 0; }

            #bd-title {
                font-size: 14px;
                font-weight: 700;
                color: #f0f0f5;
                letter-spacing: -0.01em;
            }

            #bd-subtitle {
                font-size: 11px;
                color: #4a4a58;
                margin-top: 1px;
            }

            #bd-header-actions {
                display: flex;
                gap: 5px;
                align-items: center;
            }

            .bd-hbtn {
                background: transparent;
                border: 1px solid rgba(255,255,255,0.07);
                border-radius: 6px;
                color: #55555f;
                font-size: 11px;
                padding: 3px 7px;
                cursor: pointer;
                transition: color 0.15s, background 0.15s;
                font-family: inherit;
            }
            .bd-hbtn:hover { color: #d0d0d8; background: #1e1e28; }

            #bd-dry-toggle {
                display: flex;
                align-items: center;
                gap: 7px;
                background: #16161e;
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 8px;
                padding: 7px 11px;
                margin-bottom: 12px;
                cursor: pointer;
                transition: border-color 0.2s;
            }
            #bd-dry-toggle:hover { border-color: rgba(220,53,69,0.3); }
            #bd-dry-toggle.active { border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.05); }

            #bd-dry-pip {
                width: 30px;
                height: 16px;
                border-radius: 99px;
                background: #2a2a38;
                position: relative;
                flex-shrink: 0;
                transition: background 0.2s;
            }
            #bd-dry-pip::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #55555f;
                transition: transform 0.2s, background 0.2s;
            }
            #bd-dry-toggle.active #bd-dry-pip { background: rgba(251,191,36,0.3); }
            #bd-dry-toggle.active #bd-dry-pip::after {
                transform: translateX(14px);
                background: #fbbf24;
            }

            #bd-dry-label { font-size: 12px; color: #88889a; flex: 1; }
            #bd-dry-toggle.active #bd-dry-label { color: #fbbf24; }
            #bd-dry-badge {
                font-size: 10px;
                background: rgba(251,191,36,0.15);
                color: #fbbf24;
                padding: 2px 6px;
                border-radius: 4px;
                display: none;
            }
            #bd-dry-toggle.active #bd-dry-badge { display: block; }

            #bd-status {
                font-size: 12px;
                color: #66667a;
                margin-bottom: 10px;
                min-height: 16px;
                line-height: 1.4;
            }

            #bd-stats {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
                margin-bottom: 12px;
            }

            .bd-stat {
                background: #13131a;
                border: 1px solid rgba(255,255,255,0.04);
                border-radius: 8px;
                padding: 8px 4px;
                text-align: center;
            }

            .bd-stat-val {
                font-size: 15px;
                font-weight: 700;
                color: #f0f0f5;
                line-height: 1;
                font-variant-numeric: tabular-nums;
            }

            .bd-stat-val.green  { color: #34d399; }
            .bd-stat-val.red    { color: #f87171; }
            .bd-stat-val.amber  { color: #fbbf24; }
            .bd-stat-val.blue   { color: #60a5fa; }

            .bd-stat-label {
                font-size: 9.5px;
                color: #33333e;
                margin-top: 4px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            #bd-bar-wrap {
                background: #13131a;
                border-radius: 99px;
                height: 5px;
                overflow: hidden;
                margin-bottom: 12px;
            }

            #bd-bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #dc3545 0%, #ff6b7a 100%);
                border-radius: 99px;
                transition: width 0.4s cubic-bezier(.4,0,.2,1), background 0.3s;
            }

            #bd-rate-banner {
                display: none;
                background: rgba(180,83,9,0.12);
                border: 1px solid rgba(245,158,11,0.25);
                border-radius: 8px;
                padding: 7px 11px;
                font-size: 11px;
                color: #fbbf24;
                font-variant-numeric: tabular-nums;
                text-align: center;
                margin-bottom: 10px;
            }

            #bd-filter-wrap {
                display: flex;
                gap: 7px;
                margin-bottom: 10px;
                align-items: center;
            }

            #bd-filter-label { font-size: 11px; color: #44444e; white-space: nowrap; }

            #bd-filter-input {
                flex: 1;
                padding: 6px 10px;
                background: #13131a;
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 6px;
                color: #d0d0d8;
                font-size: 12px;
                font-family: inherit;
                outline: none;
                transition: border-color 0.2s;
                min-width: 0;
            }
            #bd-filter-input:focus { border-color: rgba(220,53,69,0.35); }
            #bd-filter-input::placeholder { color: #33333e; font-size: 11px; }
            #bd-filter-input.invalid { border-color: rgba(248,113,113,0.5); }

            #bd-game-name {
                font-size: 10px;
                color: #34d399;
                margin-top: -7px;
                margin-bottom: 9px;
                padding-left: 2px;
                min-height: 14px;
                transition: opacity 0.2s;
            }

            #bd-delay-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 11px;
            }
            #bd-delay-label { font-size: 11px; color: #44444e; white-space: nowrap; }
            #bd-delay-input {
                width: 60px;
                padding: 5px 8px;
                background: #13131a;
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 6px;
                color: #d0d0d8;
                font-size: 12px;
                font-family: inherit;
                outline: none;
                transition: border-color 0.2s;
                text-align: right;
            }
            #bd-delay-input:focus { border-color: rgba(220,53,69,0.35); }
            #bd-delay-suffix { font-size: 11px; color: #33333e; }

            #bd-log {
                max-height: 100px;
                overflow-y: auto;
                background: #080810;
                border: 1px solid rgba(255,255,255,0.03);
                border-radius: 8px;
                padding: 8px 10px;
                font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
                font-size: 10.5px;
                color: #33333e;
                margin-bottom: 12px;
                scroll-behavior: smooth;
            }
            #bd-log::-webkit-scrollbar { width: 3px; }
            #bd-log::-webkit-scrollbar-track { background: transparent; }
            #bd-log::-webkit-scrollbar-thumb { background: #1e1e28; border-radius: 99px; }
            #bd-log .bd-line { padding: 1px 0; line-height: 1.5; }

            #bd-log-actions {
                display: flex;
                justify-content: flex-end;
                margin-top: -8px;
                margin-bottom: 10px;
            }

            #bd-btns {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 7px;
            }

            .bd-btn {
                padding: 8px 0;
                border: none;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                letter-spacing: 0.01em;
                transition: opacity 0.15s, transform 0.1s;
                font-family: inherit;
            }
            .bd-btn:active:not(:disabled) { transform: scale(0.97); }
            .bd-btn:disabled { opacity: 0.28; cursor: not-allowed; }

            #bd-start-btn {
                background: linear-gradient(135deg, #dc3545 0%, #b02030 100%);
                color: #fff;
            }
            #bd-start-btn:hover:not(:disabled) { opacity: 0.85; }

            #bd-pause-btn {
                background: #1a1a26;
                color: #88889a;
                border: 1px solid rgba(255,255,255,0.07);
            }
            #bd-pause-btn:hover:not(:disabled) { background: #222230; color: #d0d0d8; }
            #bd-pause-btn.paused {
                background: rgba(251,191,36,0.1);
                color: #fbbf24;
                border-color: rgba(251,191,36,0.3);
            }

            #bd-cancel-btn {
                background: #1a1a26;
                color: #88889a;
                border: 1px solid rgba(255,255,255,0.07);
            }
            #bd-cancel-btn:hover:not(:disabled) { background: rgba(248,113,113,0.1); color: #f87171; border-color: rgba(248,113,113,0.3); }

            /* Toast */
            #bd-toast {
                position: absolute;
                bottom: 70px;
                left: 50%;
                transform: translateX(-50%) translateY(8px);
                background: #1e1e2e;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                padding: 6px 14px;
                font-size: 11.5px;
                color: #d0d0d8;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s, transform 0.2s;
            }
            #bd-toast.show {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'bd-root';

        const container = document.createElement('div');
        container.id = 'bd-container';

        // ── Header ──
        const header = document.createElement('div');
        header.id = 'bd-header';

        const icon = document.createElement('div');
        icon.id = 'bd-icon';
        icon.textContent = '🗑';

        const titleWrap = document.createElement('div');
        titleWrap.id = 'bd-title-wrap';
        const title = document.createElement('div');
        title.id = 'bd-title';
        title.textContent = 'Badge Deleter';
        const subtitle = document.createElement('div');
        subtitle.id = 'bd-subtitle';
        subtitle.textContent = 'Authenticated profile only';
        titleWrap.append(title, subtitle);

        const headerActions = document.createElement('div');
        headerActions.id = 'bd-header-actions';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'bd-hbtn';
        exportBtn.title = 'Copy log to clipboard';
        exportBtn.textContent = '📋';

        const minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'bd-hbtn';
        minimizeBtn.textContent = '−';
        minimizeBtn.title = 'Minimize';

        headerActions.append(exportBtn, minimizeBtn);
        header.append(icon, titleWrap, headerActions);

        // ── Body (collapsible) ──
        const body = document.createElement('div');
        body.id = 'bd-body';

        // ── Dry run toggle ──
        const dryToggle = document.createElement('div');
        dryToggle.id = 'bd-dry-toggle';

        const dryPip = document.createElement('div');
        dryPip.id = 'bd-dry-pip';

        const dryLabel = document.createElement('div');
        dryLabel.id = 'bd-dry-label';
        dryLabel.textContent = 'Dry run — preview only, no deletions';

        const dryBadge = document.createElement('div');
        dryBadge.id = 'bd-dry-badge';
        dryBadge.textContent = 'PREVIEW';

        dryToggle.append(dryPip, dryLabel, dryBadge);

        // ── Status ──
        const status = document.createElement('div');
        status.id = 'bd-status';
        status.textContent = 'Ready to scan your badges.';

        // ── Stats ──
        const stats = document.createElement('div');
        stats.id = 'bd-stats';
        const statDeleted = makeStat('0', 'Deleted',  'green', 'bd-stat-deleted');
        const statFailed  = makeStat('0', 'Failed',   'red',   'bd-stat-failed');
        const statSkipped = makeStat('0', 'Skipped',  'blue',  'bd-stat-skipped');
        const statRL      = makeStat('0', 'Rate Hits','amber', 'bd-stat-rl');
        stats.append(statDeleted.wrap, statFailed.wrap, statSkipped.wrap, statRL.wrap);

        // ── Progress bar ──
        const barWrap = document.createElement('div');
        barWrap.id = 'bd-bar-wrap';
        const bar = document.createElement('div');
        bar.id = 'bd-bar';
        barWrap.appendChild(bar);

        // ── Rate-limit banner ──
        const rateBanner = document.createElement('div');
        rateBanner.id = 'bd-rate-banner';

        // ── Game filter ──
        const filterWrap = document.createElement('div');
        filterWrap.id = 'bd-filter-wrap';
        const filterLabel = document.createElement('span');
        filterLabel.id = 'bd-filter-label';
        filterLabel.textContent = 'Game ID:';
        const filterInput = document.createElement('input');
        filterInput.id = 'bd-filter-input';
        filterInput.type = 'text';
        filterInput.placeholder = 'Leave blank for all badges';
        filterInput.value = gameFilter;
        filterWrap.append(filterLabel, filterInput);

        const gameNameEl = document.createElement('div');
        gameNameEl.id = 'bd-game-name';

        // ── Delete delay ──
        const delayWrap = document.createElement('div');
        delayWrap.id = 'bd-delay-wrap';
        const delayLabel = document.createElement('span');
        delayLabel.id = 'bd-delay-label';
        delayLabel.textContent = 'Delay between deletes:';
        const delayInput = document.createElement('input');
        delayInput.id = 'bd-delay-input';
        delayInput.type = 'number';
        delayInput.min = '100';
        delayInput.max = '5000';
        delayInput.step = '100';
        delayInput.value = deleteDelay;
        const delaySuffix = document.createElement('span');
        delaySuffix.id = 'bd-delay-suffix';
        delaySuffix.textContent = 'ms';
        delayWrap.append(delayLabel, delayInput, delaySuffix);

        // ── Log ──
        const log = document.createElement('div');
        log.id = 'bd-log';

        const logActions = document.createElement('div');
        logActions.id = 'bd-log-actions';

        // ── Buttons ──
        const btns = document.createElement('div');
        btns.id = 'bd-btns';

        const startBtn = document.createElement('button');
        startBtn.id = 'bd-start-btn';
        startBtn.className = 'bd-btn';
        startBtn.textContent = '▶  Start';

        const pauseBtn = document.createElement('button');
        pauseBtn.id = 'bd-pause-btn';
        pauseBtn.className = 'bd-btn';
        pauseBtn.textContent = '⏸  Pause';
        pauseBtn.disabled = true;

        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'bd-cancel-btn';
        cancelBtn.className = 'bd-btn';
        cancelBtn.textContent = '✕  Cancel';
        cancelBtn.disabled = true;

        btns.append(startBtn, pauseBtn, cancelBtn);

        // ── Toast ──
        const toast = document.createElement('div');
        toast.id = 'bd-toast';

        body.append(
            dryToggle, status, stats, barWrap, rateBanner,
            filterWrap, gameNameEl, delayWrap, log, logActions, btns
        );

        container.append(header, body, toast);
        root.appendChild(container);

        // ── Drag logic ──
        let dragging = false, dragOffX = 0, dragOffY = 0;
        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('bd-hbtn')) return;
            dragging = true;
            const rect = container.getBoundingClientRect();
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
            container.style.transition = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const x = e.clientX - dragOffX;
            const y = e.clientY - dragOffY;
            container.style.left   = `${x}px`;
            container.style.top    = `${y}px`;
            container.style.right  = 'auto';
            container.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => { dragging = false; });

        // ── Minimize ──
        minimizeBtn.addEventListener('click', () => {
            isMinimized = !isMinimized;
            GM_setValue('minimized', isMinimized);
            applyMinimize(isMinimized);
            minimizeBtn.textContent = isMinimized ? '+' : '−';
            minimizeBtn.title = isMinimized ? 'Expand' : 'Minimize';
        });

        // ── Dry run toggle ──
        dryToggle.addEventListener('click', () => {
            isDryRun = !isDryRun;
            dryToggle.classList.toggle('active', isDryRun);
            startBtn.textContent = isDryRun ? '🔍 Scan' : '▶  Start';
        });

        // ── Filter input ──
        filterInput.addEventListener('input', () => {
            const val = filterInput.value.trim();
            const valid = val === '' || /^\d+$/.test(val);
            filterInput.classList.toggle('invalid', !valid);
            gameNameEl.textContent = '';
            GM_setValue('gameFilter', val);
        });

        // ── Delay input ──
        delayInput.addEventListener('change', () => {
            const v = parseInt(delayInput.value, 10);
            if (!isNaN(v) && v >= 100 && v <= 5000) {
                deleteDelay = v;
                GM_setValue('deleteDelay', v);
            }
        });

        // ── Copy log ──
        exportBtn.addEventListener('click', () => {
            if (logLines.length === 0) { showToast('Log is empty'); return; }
            navigator.clipboard.writeText(logLines.join('\n'))
                .then(() => showToast('Log copied!'))
                .catch(() => showToast('Copy failed'));
        });

        // ── Start ──
        startBtn.addEventListener('click', () => {
            const val = filterInput.value.trim();
            if (val && !/^\d+$/.test(val)) {
                filterInput.classList.add('invalid');
                showToast('Game ID must be numeric');
                return;
            }
            gameFilter = val;
            isDryRun = dryToggle.classList.contains('active');
            deleteDelay = parseInt(delayInput.value, 10) || CONFIG.DELETE_DELAY_MS;
            startBtn.disabled  = true;
            cancelBtn.disabled = false;
            pauseBtn.disabled  = false;
            filterInput.disabled = true;
            delayInput.disabled  = true;
            dryToggle.style.pointerEvents = 'none';
            runDeletion();
        });

        // ── Pause ──
        pauseBtn.addEventListener('click', togglePause);

        // ── Cancel ──
        cancelBtn.addEventListener('click', () => {
            isCancelled = true;
            isPaused = false;
            setStatus('Cancelling…');
            cancelBtn.disabled = true;
            pauseBtn.disabled  = true;
        });

        function showToast(msg) {
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }

        return {
            root, container, status, bar, rateBanner, log,
            startBtn, pauseBtn, cancelBtn,
            statDeleted: statDeleted.val,
            statFailed:  statFailed.val,
            statSkipped: statSkipped.val,
            statRL:      statRL.val,
            filterInput, delayInput, dryToggle, gameNameEl,
            showToast,
        };
    }

    function applyMinimize(on) {
        const c = ui.container;
        if (on) {
            c.classList.add('minimized');
        } else {
            c.classList.remove('minimized');
        }
    }

    function togglePause() {
        isPaused = !isPaused;
        ui.pauseBtn.classList.toggle('paused', isPaused);
        ui.pauseBtn.textContent = isPaused ? '▶  Resume' : '⏸  Pause';
        setStatus(isPaused ? 'Paused — click Resume or press Space to continue.' : 'Resuming…');
        appendLog(isPaused ? '⏸ Paused by user' : '▶ Resumed', '#fbbf24');
    }

    function makeStat(value, label, colorClass, id) {
        const wrap = document.createElement('div');
        wrap.className = 'bd-stat';
        const val = document.createElement('div');
        val.className = `bd-stat-val ${colorClass}`;
        val.id = id;
        val.textContent = value;
        const lbl = document.createElement('div');
        lbl.className = 'bd-stat-label';
        lbl.textContent = label;
        wrap.append(val, lbl);
        return { wrap, val };
    }

    function setStatus(msg) { ui.status.textContent = msg; }

    function syncStats(processed, total) {
        ui.statDeleted.textContent = totalDeleted;
        ui.statFailed.textContent  = totalFailed;
        ui.statSkipped.textContent = totalSkipped;
        ui.statRL.textContent      = rateLimitHits;
        ui.bar.style.width = total > 0 ? `${Math.round((processed / total) * 100)}%` : '0%';
    }

    function appendLog(msg, color) {
        logLines.push(msg);
        const line = document.createElement('div');
        line.className = 'bd-line';
        line.textContent = msg;
        if (color) line.style.color = color;
        ui.log.appendChild(line);
        ui.log.scrollTop = ui.log.scrollHeight;
    }

    async function waitWhilePaused() {
        while (isPaused && !isCancelled) await sleep(200);
    }

    async function waitWithCountdown(ms) {
        ui.rateBanner.style.display = 'block';
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (isCancelled) break;
            if (isPaused) { await sleep(200); continue; }
            const remaining = Math.ceil((end - Date.now()) / 1000);
            ui.rateBanner.textContent = `⏳ Rate limited — resuming in ${remaining}s`;
            await sleep(500);
        }
        ui.rateBanner.style.display = 'none';
    }

    async function fetchCSRF() {
        setStatus('Fetching CSRF token…');
        const res = await fetch('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            credentials: 'include',
        });
        XCSRF = res.headers.get('x-csrf-token') || '';
        if (!XCSRF) throw new Error('Could not retrieve CSRF token. Are you logged in?');
        appendLog('✔ CSRF token acquired', '#34d399');
    }

    async function getGameIdForBadge(badgeId) {
        try {
            const res = await fetch(`https://www.roblox.com/badges/${badgeId}`, { credentials: 'include' });
            if (!res.ok) return null;
            const html = await res.text();
            const m = html.match(/games\/(\d+)/) || html.match(/<a\s+href=["']https:\/\/www\.roblox\.com\/games\/(\d+)/);
            return m ? m[1] : null;
        } catch { return null; }
    }

    async function fetchAllBadges() {
        setStatus('Scanning badges…');
        const badges = [];
        let cursor = '';
        let page   = 1;

        do {
            const url =
                `https://badges.roblox.com/v1/users/${pageUserId}/badges` +
                `?limit=${CONFIG.PAGE_LIMIT}&sortOrder=Asc` +
                (cursor ? `&cursor=${cursor}` : '');

            const res = await fetch(url, { credentials: 'include' });

            if (res.status === 429) {
                rateLimitHits++;
                const retryAfter = res.headers.get('Retry-After');
                const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : CONFIG.RATE_LIMIT_BASE_MS;
                appendLog(`🚦 Rate limited on page ${page} — waiting ${waitMs / 1000}s`, '#fbbf24');
                await waitWithCountdown(waitMs);
                continue;
            }

            if (!res.ok) throw new Error(`Badge fetch failed (HTTP ${res.status})`);

            const json = await res.json();
            let filteredData = [];

            if (gameFilter) {
                for (const badge of json.data) {
                    const gameId = await getGameIdForBadge(badge.id);
                    if (gameId === gameFilter) {
                        filteredData.push(badge);
                        appendLog(`  ✓ "${badge.name}" matches game ${gameFilter}`, '#34d399');
                    }
                    await sleep(100);
                }
                appendLog(`  Page ${page}: ${filteredData.length}/${json.data.length} matched game ${gameFilter}`, '#fbbf24');
            } else {
                filteredData = json.data;
                appendLog(`  Page ${page}: ${json.data.length} badges loaded`, '#34d399');
            }

            badges.push(...filteredData.map(b => ({ id: b.id, name: b.name })));
            cursor = json.nextPageCursor || '';
            page++;
        } while (cursor);

        const suffix = gameFilter ? ` from game ${gameFilter}` : '';
        appendLog(`✔ Found ${badges.length} badge${badges.length !== 1 ? 's' : ''}${suffix}`, '#34d399');
        return badges;
    }

    async function deleteBadge(badge, attempt = 1, rlAttempt = 0) {
        // Dry run: just log and count as skipped
        if (isDryRun) {
            totalSkipped++;
            appendLog(`🔍 [DRY] Would delete: "${badge.name}"`, '#60a5fa');
            return true;
        }

        const res = await fetch(`https://badges.roblox.com/v1/user/badges/${badge.id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'x-csrf-token': XCSRF },
        });

        if (res.ok) {
            currentBackoff = CONFIG.RATE_LIMIT_BASE_MS;
            totalDeleted++;
            appendLog(`✔ ${badge.name}`, '#34d399');
            return true;
        }

        if (res.status === 429) {
            rateLimitHits++;
            syncStats(totalDeleted + totalFailed + totalSkipped, 0);

            if (rlAttempt >= CONFIG.RATE_LIMIT_RETRIES) {
                totalFailed++;
                appendLog(`✖ Rate-limit retries exhausted for "${badge.name}"`, '#f87171');
                return false;
            }

            const retryAfter = res.headers.get('Retry-After');
            const waitMs = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : Math.min(currentBackoff, CONFIG.RATE_LIMIT_MAX_MS);

            appendLog(`🚦 Rate limited (×${rateLimitHits}) — waiting ${waitMs / 1000}s`, '#fbbf24');
            setStatus(`Rate limited — paused ${waitMs / 1000}s`);
            currentBackoff = Math.min(currentBackoff * 2, CONFIG.RATE_LIMIT_MAX_MS);

            await waitWithCountdown(waitMs);
            if (isCancelled) return false;

            setStatus('Resuming…');
            return deleteBadge(badge, attempt, rlAttempt + 1);
        }

        const newToken = res.headers.get('x-csrf-token');
        if (res.status === 403 && newToken) {
            XCSRF = newToken;
            appendLog(`↻ CSRF refreshed — retrying "${badge.name}"`, '#fbbf24');
            return deleteBadge(badge, attempt, rlAttempt);
        }

        if (attempt < CONFIG.RETRY_LIMIT) {
            appendLog(`⚠ Retry ${attempt}/${CONFIG.RETRY_LIMIT} for "${badge.name}" (HTTP ${res.status})`, '#fbbf24');
            await sleep(CONFIG.RETRY_DELAY_MS);
            return deleteBadge(badge, attempt + 1, rlAttempt);
        }

        totalFailed++;
        appendLog(`✖ Failed: "${badge.name}" (HTTP ${res.status})`, '#f87171');
        return false;
    }

    async function runDeletion() {
        // Reset counters
        totalDeleted = totalFailed = totalSkipped = rateLimitHits = 0;
        isCancelled = isPaused = false;
        currentBackoff = CONFIG.RATE_LIMIT_BASE_MS;
        logLines = [];
        ui.log.innerHTML = '';
        syncStats(0, 0);
        ui.bar.style.background = 'linear-gradient(90deg, #dc3545 0%, #ff6b7a 100%)';

        try {
            if (!isDryRun) await fetchCSRF();
            const badges = await fetchAllBadges();

            if (badges.length === 0) {
                const msg = gameFilter
                    ? `No badges found from game ${gameFilter}.`
                    : 'No badges found on your profile.';
                setStatus(msg);
                appendLog(msg, '#fbbf24');
                resetButtons();
                return;
            }

            const action = isDryRun ? 'Previewing' : 'Deleting';
            setStatus(`${action} ${badges.length} badge${badges.length !== 1 ? 's' : ''}…`);
            syncStats(0, badges.length);

            let processed = 0;
            for (const badge of badges) {
                if (isCancelled) break;
                await waitWhilePaused();
                if (isCancelled) break;

                await deleteBadge(badge);
                processed++;
                syncStats(processed, badges.length);
                await sleep(isDryRun ? 50 : deleteDelay);
            }

            const verb   = isDryRun ? 'scan' : 'deletion';
            const action2 = isCancelled ? `Cancelled` : `All done`;
            const summary = isDryRun
                ? `${action2} — ${totalSkipped} badge${totalSkipped !== 1 ? 's' : ''} would be deleted.`
                : `${action2} — ${totalDeleted} deleted, ${totalFailed} failed.`;

            setStatus(summary);
            appendLog(summary, isCancelled ? '#fbbf24' : '#34d399');

            if (isCancelled) {
                ui.bar.style.background = 'linear-gradient(90deg,#d97706,#fbbf24)';
            } else if (isDryRun) {
                ui.bar.style.background = 'linear-gradient(90deg,#2563eb,#60a5fa)';
            } else {
                ui.bar.style.background = 'linear-gradient(90deg,#059669,#34d399)';
            }
            ui.bar.style.width = '100%';

        } catch (err) {
            setStatus(`Error: ${err.message}`);
            appendLog(`✖ ${err.message}`, '#f87171');
        } finally {
            resetButtons();
        }
    }

    function resetButtons() {
        ui.startBtn.disabled  = false;
        ui.cancelBtn.disabled = true;
        ui.pauseBtn.disabled  = true;
        ui.pauseBtn.classList.remove('paused');
        ui.pauseBtn.textContent = '⏸  Pause';
        ui.filterInput.disabled = false;
        ui.delayInput.disabled  = false;
        ui.dryToggle.style.pointerEvents = '';
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

})();
