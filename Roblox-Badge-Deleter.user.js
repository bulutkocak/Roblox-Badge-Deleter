// ==UserScript==
// @name         Roblox Badge Deleter
// @namespace    http://tampermonkey.net/
// @version      2.3.0
// @description  Delete all badges from your Roblox profile — with dry-run, pause/resume, name filter, elapsed timer, JSON export, and more
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
        DELETE_DELAY_MS: 500,
        RETRY_LIMIT: 3,
        RETRY_DELAY_MS: 2000,
        PAGE_LIMIT: 100,
        RATE_LIMIT_BASE_MS: 10000,
        RATE_LIMIT_MAX_MS: 120000,
        RATE_LIMIT_RETRIES: 5,
    };

    const VERSION = '2.3.0';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function getAuthenticatedUserId() {
        try {
            const res = await fetch('https://users.roblox.com/v1/users/authenticated', { credentials: 'include' });
            if (!res.ok) return null;
            const data = await res.json();
            return data.id ? String(data.id) : null;
        } catch { return null; }
    }

    const pageUserId = window.location.pathname.split('/')[2];
    const authedId = await getAuthenticatedUserId();
    if (!authedId || pageUserId !== authedId) return;

    let XCSRF = '';
    let totalDeleted = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let isCancelled = false;
    let isPaused = false;
    let isDryRun = false;
    let rateLimitHits = 0;
    let currentBackoff = CONFIG.RATE_LIMIT_BASE_MS;
    let gameFilter = GM_getValue('gameFilter', '');
    let nameFilter = GM_getValue('nameFilter', '');
    let deleteDelay = parseInt(GM_getValue('deleteDelay', CONFIG.DELETE_DELAY_MS), 10);
    let isMinimized = GM_getValue('minimized', false);
    let logLines = [];
    let deletedBadges = [];
    let startTime = 0;
    let timerInterval = null;

    const ui = buildUI();
    document.body.appendChild(ui.root);
    if (isMinimized) applyMinimize(true);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !ui.cancelBtn.disabled) {
            isCancelled = true;
            isPaused = false;
            setStatus('Cancelling…');
            ui.cancelBtn.disabled = true;
            ui.pauseBtn.disabled = true;
        }
        if (e.key === ' ' && e.target === document.body && !ui.pauseBtn.disabled) {
            e.preventDefault();
            togglePause();
        }
    });

    function buildUI() {
        const style = document.createElement('style');
        style.textContent = `
            #bd-root *{box-sizing:border-box}
            #bd-root{all:initial}
            #bd-container{
                position:fixed;bottom:24px;right:24px;z-index:2147483647;
                width:370px;background:#0a0a12;
                border:1px solid rgba(220,53,69,.25);border-radius:18px;
                padding:18px;
                font-family:'Inter','Segoe UI',system-ui,sans-serif;
                font-size:13px;color:#b8b8c8;
                box-shadow:0 0 0 1px rgba(255,255,255,.03),0 32px 64px rgba(0,0,0,.8),0 0 120px rgba(220,53,69,.05);
                user-select:none;transition:height .25s ease,padding .25s ease
            }
            #bd-container.minimized #bd-body{display:none}
            #bd-header{display:flex;align-items:center;gap:9px;margin-bottom:14px;cursor:grab}
            #bd-header:active{cursor:grabbing}
            #bd-icon{
                width:32px;height:32px;
                background:linear-gradient(135deg,#dc3545 0%,#7b0f1a 100%);
                border-radius:9px;display:flex;align-items:center;justify-content:center;
                font-size:16px;flex-shrink:0;
                box-shadow:0 4px 12px rgba(220,53,69,.35)
            }
            #bd-title-wrap{flex:1;min-width:0}
            #bd-title{font-size:14px;font-weight:700;color:#ededf5;letter-spacing:-.01em;display:flex;align-items:center;gap:6px}
            #bd-version-badge{
                font-size:9px;font-weight:600;
                background:rgba(220,53,69,.18);color:#f87171;
                border:1px solid rgba(220,53,69,.25);
                border-radius:4px;padding:1px 5px;letter-spacing:.04em;
                font-family:inherit
            }
            #bd-subtitle{font-size:10.5px;color:#3a3a4a;margin-top:2px}
            #bd-header-actions{display:flex;gap:5px;align-items:center}
            .bd-hbtn{
                background:transparent;
                border:1px solid rgba(255,255,255,.06);
                border-radius:6px;color:#484852;
                font-size:11px;padding:3px 7px;cursor:pointer;
                transition:color .15s,background .15s,border-color .15s;
                font-family:inherit
            }
            .bd-hbtn:hover{color:#c8c8d8;background:#161620;border-color:rgba(255,255,255,.12)}
            #bd-dry-toggle{
                display:flex;align-items:center;gap:8px;
                background:#0f0f18;border:1px solid rgba(255,255,255,.05);
                border-radius:9px;padding:8px 11px;margin-bottom:12px;cursor:pointer;
                transition:border-color .2s,background .2s
            }
            #bd-dry-toggle:hover{border-color:rgba(220,53,69,.25)}
            #bd-dry-toggle.active{border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.04)}
            #bd-dry-pip{
                width:30px;height:16px;border-radius:99px;
                background:#1e1e2a;position:relative;flex-shrink:0;
                transition:background .2s;border:1px solid rgba(255,255,255,.06)
            }
            #bd-dry-pip::after{
                content:'';position:absolute;top:2px;left:2px;
                width:10px;height:10px;border-radius:50%;
                background:#383848;transition:transform .2s,background .2s
            }
            #bd-dry-toggle.active #bd-dry-pip{background:rgba(251,191,36,.2)}
            #bd-dry-toggle.active #bd-dry-pip::after{transform:translateX(14px);background:#fbbf24}
            #bd-dry-label{font-size:11.5px;color:#666678;flex:1}
            #bd-dry-toggle.active #bd-dry-label{color:#fbbf24}
            #bd-dry-badge{
                font-size:9.5px;background:rgba(251,191,36,.12);
                color:#fbbf24;padding:2px 6px;border-radius:4px;
                border:1px solid rgba(251,191,36,.2);display:none
            }
            #bd-dry-toggle.active #bd-dry-badge{display:block}
            #bd-status-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;min-height:18px}
            #bd-status{font-size:12px;color:#55556a;line-height:1.4;flex:1}
            #bd-timer{font-size:11px;color:#2d2d3a;font-variant-numeric:tabular-nums;font-family:'JetBrains Mono','Cascadia Code',monospace;transition:color .3s}
            #bd-timer.running{color:#60a5fa}
            #bd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
            .bd-stat{
                background:#0d0d18;border:1px solid rgba(255,255,255,.03);
                border-radius:9px;padding:9px 4px;text-align:center
            }
            .bd-stat-val{font-size:16px;font-weight:700;color:#ededf5;line-height:1;font-variant-numeric:tabular-nums}
            .bd-stat-val.green{color:#34d399}
            .bd-stat-val.red{color:#f87171}
            .bd-stat-val.amber{color:#fbbf24}
            .bd-stat-val.blue{color:#60a5fa}
            .bd-stat-label{font-size:9px;color:#2a2a38;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
            #bd-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
            #bd-bar-wrap{flex:1;background:#0d0d18;border-radius:99px;height:5px;overflow:hidden}
            #bd-bar{height:100%;width:0%;background:linear-gradient(90deg,#dc3545,#ff6b7a);border-radius:99px;transition:width .4s cubic-bezier(.4,0,.2,1),background .3s}
            #bd-progress-pct{font-size:10px;color:#2a2a38;font-variant-numeric:tabular-nums;min-width:30px;text-align:right;font-family:'JetBrains Mono',monospace}
            #bd-rate-banner{
                display:none;
                background:rgba(120,53,9,.12);
                border:1px solid rgba(245,158,11,.2);
                border-radius:8px;padding:7px 12px;
                font-size:11px;color:#fbbf24;
                font-variant-numeric:tabular-nums;text-align:center;margin-bottom:10px
            }
            .bd-field-row{display:flex;align-items:center;gap:7px;margin-bottom:9px}
            .bd-field-label{font-size:10.5px;color:#3a3a4e;white-space:nowrap;min-width:60px}
            .bd-field-input{
                flex:1;padding:6px 10px;
                background:#0d0d18;
                border:1px solid rgba(255,255,255,.05);
                border-radius:7px;color:#c8c8d8;
                font-size:11.5px;font-family:inherit;
                outline:none;transition:border-color .2s;min-width:0
            }
            .bd-field-input:focus{border-color:rgba(220,53,69,.3)}
            .bd-field-input::placeholder{color:#252530;font-size:11px}
            .bd-field-input.invalid{border-color:rgba(248,113,113,.45)}
            #bd-game-name{
                font-size:10px;color:#34d399;
                margin-top:-6px;margin-bottom:8px;
                padding-left:67px;min-height:14px
            }
            #bd-log{
                max-height:90px;overflow-y:auto;
                background:#060610;
                border:1px solid rgba(255,255,255,.025);
                border-radius:9px;padding:8px 10px;
                font-family:'JetBrains Mono','Cascadia Code','Fira Code',monospace;
                font-size:10px;color:#2d2d3e;margin-bottom:8px;
                scroll-behavior:smooth
            }
            #bd-log::-webkit-scrollbar{width:3px}
            #bd-log::-webkit-scrollbar-track{background:transparent}
            #bd-log::-webkit-scrollbar-thumb{background:#181825;border-radius:99px}
            #bd-log .bd-line{padding:1.5px 0;line-height:1.5}
            #bd-log-actions{display:flex;gap:5px;justify-content:flex-end;margin-bottom:10px}
            .bd-log-btn{
                background:transparent;
                border:1px solid rgba(255,255,255,.05);
                border-radius:5px;color:#333340;
                font-size:10px;padding:2px 7px;cursor:pointer;
                transition:color .15s,border-color .15s;font-family:inherit
            }
            .bd-log-btn:hover{color:#aaaabc;border-color:rgba(255,255,255,.1)}
            #bd-btns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
            .bd-btn{
                padding:9px 0;border:none;border-radius:9px;
                font-size:12px;font-weight:600;cursor:pointer;
                letter-spacing:.01em;
                transition:opacity .15s,transform .1s,box-shadow .15s;
                font-family:inherit
            }
            .bd-btn:active:not(:disabled){transform:scale(.97)}
            .bd-btn:disabled{opacity:.22;cursor:not-allowed}
            #bd-start-btn{
                background:linear-gradient(135deg,#dc3545 0%,#a01828 100%);
                color:#fff;
                box-shadow:0 4px 14px rgba(220,53,69,.3)
            }
            #bd-start-btn:hover:not(:disabled){opacity:.82;box-shadow:0 6px 18px rgba(220,53,69,.4)}
            #bd-pause-btn{background:#12121e;color:#666678;border:1px solid rgba(255,255,255,.06)}
            #bd-pause-btn:hover:not(:disabled){background:#1a1a2a;color:#c0c0d0}
            #bd-pause-btn.paused{background:rgba(251,191,36,.08);color:#fbbf24;border-color:rgba(251,191,36,.25)}
            #bd-cancel-btn{background:#12121e;color:#666678;border:1px solid rgba(255,255,255,.06)}
            #bd-cancel-btn:hover:not(:disabled){background:rgba(248,113,113,.08);color:#f87171;border-color:rgba(248,113,113,.25)}
            #bd-toast{
                position:absolute;bottom:72px;left:50%;
                transform:translateX(-50%) translateY(8px);
                background:#16162a;border:1px solid rgba(255,255,255,.08);
                border-radius:8px;padding:6px 14px;
                font-size:11.5px;color:#c8c8d8;white-space:nowrap;
                opacity:0;pointer-events:none;
                transition:opacity .2s,transform .2s
            }
            #bd-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
            #bd-confirm{
                display:none;position:absolute;inset:0;
                background:rgba(5,5,14,.9);backdrop-filter:blur(4px);
                border-radius:18px;z-index:10;
                flex-direction:column;align-items:center;justify-content:center;
                gap:12px;padding:20px;text-align:center
            }
            #bd-confirm.visible{display:flex}
            #bd-confirm-msg{font-size:13px;color:#c0c0d0;line-height:1.6}
            #bd-confirm-msg strong{color:#f87171}
            #bd-confirm-btns{display:flex;gap:8px}
            .bd-cfm-btn{
                padding:8px 20px;border:none;border-radius:8px;
                font-size:12px;font-weight:600;cursor:pointer;font-family:inherit
            }
            #bd-confirm-yes{background:linear-gradient(135deg,#dc3545,#a01828);color:#fff}
            #bd-confirm-no{background:#1a1a28;color:#888898;border:1px solid rgba(255,255,255,.07)}
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'bd-root';
        const container = document.createElement('div');
        container.id = 'bd-container';
        container.style.position = 'fixed';

        const header = mkEl('div', 'bd-header');
        const icon = mkEl('div', 'bd-icon');
        icon.textContent = '🗑';

        const titleWrap = mkEl('div', 'bd-title-wrap');
        const titleEl = mkEl('div', 'bd-title');
        const vBadge = mkEl('span', 'bd-version-badge');
        vBadge.textContent = `v${VERSION}`;
        titleEl.append(document.createTextNode('Badge Deleter'), vBadge);
        const subtitleEl = mkEl('div', 'bd-subtitle');
        subtitleEl.textContent = 'Authenticated profile only';
        titleWrap.append(titleEl, subtitleEl);

        const headerActions = mkEl('div', 'bd-header-actions');
        const exportLogBtn = mkBtn('bd-hbtn', '📋', 'Copy log');
        const exportJsonBtn = mkBtn('bd-hbtn', '{}', 'Export deleted badges as JSON');
        const minimizeBtn = mkBtn('bd-hbtn', '−', 'Minimize');
        headerActions.append(exportLogBtn, exportJsonBtn, minimizeBtn);
        header.append(icon, titleWrap, headerActions);

        const body = mkEl('div', 'bd-body');

        const dryToggle = mkEl('div', 'bd-dry-toggle');
        const dryPip = mkEl('div', 'bd-dry-pip');
        const dryLabel = mkEl('div', 'bd-dry-label');
        dryLabel.textContent = 'Dry run — preview only, no deletions';
        const dryBadge = mkEl('div', 'bd-dry-badge');
        dryBadge.textContent = 'PREVIEW';
        dryToggle.append(dryPip, dryLabel, dryBadge);

        const statusRow = mkEl('div', 'bd-status-row');
        const statusEl = mkEl('div', 'bd-status');
        statusEl.textContent = 'Ready to scan your badges.';
        const timerEl = mkEl('div', 'bd-timer');
        timerEl.textContent = '0:00';
        statusRow.append(statusEl, timerEl);

        const stats = mkEl('div', 'bd-stats');
        const statDeleted = makeStat('0', 'Deleted', 'green', 'bd-stat-deleted');
        const statFailed = makeStat('0', 'Failed', 'red', 'bd-stat-failed');
        const statSkipped = makeStat('0', 'Skipped', 'blue', 'bd-stat-skipped');
        const statRL = makeStat('0', 'Rate Hits', 'amber', 'bd-stat-rl');
        stats.append(statDeleted.wrap, statFailed.wrap, statSkipped.wrap, statRL.wrap);

        const barRow = mkEl('div', 'bd-bar-row');
        const barWrap = mkEl('div', 'bd-bar-wrap');
        const bar = mkEl('div', 'bd-bar');
        const progressPct = mkEl('div', 'bd-progress-pct');
        progressPct.textContent = '0%';
        barWrap.appendChild(bar);
        barRow.append(barWrap, progressPct);

        const rateBanner = mkEl('div', 'bd-rate-banner');

        const gameRow = mkEl('div', 'bd-field-row');
        const gameLabel = mkEl('span', 'bd-field-label');
        gameLabel.textContent = 'Game ID:';
        const gameInput = document.createElement('input');
        gameInput.id = 'bd-game-input';
        gameInput.className = 'bd-field-input';
        gameInput.type = 'text';
        gameInput.placeholder = 'All badges (leave blank)';
        gameInput.value = gameFilter;
        gameRow.append(gameLabel, gameInput);
        const gameNameEl = mkEl('div', 'bd-game-name');

        const nameRow = mkEl('div', 'bd-field-row');
        const nameLabel = mkEl('span', 'bd-field-label');
        nameLabel.textContent = 'Name filter:';
        const nameInput = document.createElement('input');
        nameInput.id = 'bd-name-input';
        nameInput.className = 'bd-field-input';
        nameInput.type = 'text';
        nameInput.placeholder = 'Regex or substring (optional)';
        nameInput.value = nameFilter;
        nameRow.append(nameLabel, nameInput);

        const delayRow = mkEl('div', 'bd-field-row');
        const delayLabel = mkEl('span', 'bd-field-label');
        delayLabel.textContent = 'Delay:';
        const delayInput = document.createElement('input');
        delayInput.id = 'bd-delay-input';
        delayInput.className = 'bd-field-input';
        delayInput.type = 'number';
        delayInput.min = '100';
        delayInput.max = '5000';
        delayInput.step = '100';
        delayInput.value = deleteDelay;
        delayInput.style.width = '80px';
        delayInput.style.flex = 'none';
        const delaySuffix = mkEl('span', 'bd-field-label');
        delaySuffix.textContent = 'ms';
        delaySuffix.style.minWidth = 'auto';
        delayRow.append(delayLabel, delayInput, delaySuffix);

        const log = mkEl('div', 'bd-log');
        const logActions = mkEl('div', 'bd-log-actions');
        const autoScrollLbl = document.createElement('label');
        autoScrollLbl.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;font-size:10px;color:#303040';
        const autoScrollChk = document.createElement('input');
        autoScrollChk.type = 'checkbox';
        autoScrollChk.id = 'bd-autoscroll';
        autoScrollChk.checked = GM_getValue('autoScroll', true);
        autoScrollChk.style.accentColor = '#dc3545';
        autoScrollLbl.append(autoScrollChk, document.createTextNode('Auto-scroll'));
        const clearLogBtn = mkBtn('bd-log-btn', 'Clear', 'Clear log');
        logActions.append(autoScrollLbl, clearLogBtn);

        const btns = mkEl('div', 'bd-btns');
        const startBtn = mkBtn('bd-btn', '▶  Start', null, 'bd-start-btn');
        const pauseBtn = mkBtn('bd-btn', '⏸  Pause', null, 'bd-pause-btn');
        pauseBtn.disabled = true;
        const cancelBtn = mkBtn('bd-btn', '✕  Cancel', null, 'bd-cancel-btn');
        cancelBtn.disabled = true;
        btns.append(startBtn, pauseBtn, cancelBtn);

        const toast = mkEl('div', 'bd-toast');

        const confirmOverlay = mkEl('div', 'bd-confirm');
        const confirmMsg = mkEl('div', 'bd-confirm-msg');
        const confirmBtns = mkEl('div', 'bd-confirm-btns');
        const confirmYes = mkBtn('bd-cfm-btn', 'Delete all', null, 'bd-confirm-yes');
        const confirmNo = mkBtn('bd-cfm-btn', 'Cancel', null, 'bd-confirm-no');
        confirmBtns.append(confirmYes, confirmNo);
        confirmOverlay.append(confirmMsg, confirmBtns);

        body.append(
            dryToggle, statusRow, stats, barRow, rateBanner,
            gameRow, gameNameEl, nameRow, delayRow,
            log, logActions, btns
        );
        container.append(header, body, toast, confirmOverlay);
        root.appendChild(container);

        let dragging = false, dragOffX = 0, dragOffY = 0;
        header.addEventListener('mousedown', e => {
            if (e.target.classList.contains('bd-hbtn')) return;
            dragging = true;
            const r = container.getBoundingClientRect();
            dragOffX = e.clientX - r.left;
            dragOffY = e.clientY - r.top;
            container.style.transition = 'none';
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            container.style.left = `${e.clientX - dragOffX}px`;
            container.style.top = `${e.clientY - dragOffY}px`;
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => { dragging = false; });

        minimizeBtn.addEventListener('click', () => {
            isMinimized = !isMinimized;
            GM_setValue('minimized', isMinimized);
            applyMinimize(isMinimized);
            minimizeBtn.textContent = isMinimized ? '+' : '−';
            minimizeBtn.title = isMinimized ? 'Expand' : 'Minimize';
        });

        dryToggle.addEventListener('click', () => {
            isDryRun = !isDryRun;
            dryToggle.classList.toggle('active', isDryRun);
            startBtn.textContent = isDryRun ? '🔍 Scan' : '▶  Start';
        });

        gameInput.addEventListener('input', () => {
            const val = gameInput.value.trim();
            gameInput.classList.toggle('invalid', val !== '' && !/^\d+$/.test(val));
            gameNameEl.textContent = '';
            GM_setValue('gameFilter', val);
        });

        nameInput.addEventListener('input', () => {
            GM_setValue('nameFilter', nameInput.value.trim());
        });

        delayInput.addEventListener('change', () => {
            const v = parseInt(delayInput.value, 10);
            if (!isNaN(v) && v >= 100 && v <= 5000) {
                deleteDelay = v;
                GM_setValue('deleteDelay', v);
            }
        });

        autoScrollChk.addEventListener('change', () => {
            GM_setValue('autoScroll', autoScrollChk.checked);
        });

        clearLogBtn.addEventListener('click', () => {
            log.innerHTML = '';
            logLines = [];
            showToast('Log cleared');
        });

        exportLogBtn.addEventListener('click', () => {
            if (!logLines.length) { showToast('Log is empty'); return; }
            navigator.clipboard.writeText(logLines.join('\n'))
                .then(() => showToast('Log copied!'))
                .catch(() => showToast('Copy failed'));
        });

        exportJsonBtn.addEventListener('click', () => {
            if (!deletedBadges.length) { showToast('No deletions yet'); return; }
            const payload = JSON.stringify({ deletedAt: new Date().toISOString(), badges: deletedBadges }, null, 2);
            navigator.clipboard.writeText(payload)
                .then(() => showToast(`${deletedBadges.length} badges copied as JSON`))
                .catch(() => showToast('Copy failed'));
        });

        startBtn.addEventListener('click', () => {
            const gVal = gameInput.value.trim();
            if (gVal && !/^\d+$/.test(gVal)) {
                gameInput.classList.add('invalid');
                showToast('Game ID must be numeric');
                return;
            }

            const nVal = nameInput.value.trim();
            if (nVal) {
                try { new RegExp(nVal); }
                catch {
                    nameInput.classList.add('invalid');
                    showToast('Invalid regex in name filter');
                    return;
                }
            }
            nameInput.classList.remove('invalid');

            gameFilter = gVal;
            nameFilter = nVal;
            isDryRun = dryToggle.classList.contains('active');
            deleteDelay = parseInt(delayInput.value, 10) || CONFIG.DELETE_DELAY_MS;

            disableControls();
            runDeletion();
        });

        pauseBtn.addEventListener('click', togglePause);

        cancelBtn.addEventListener('click', () => {
            isCancelled = true;
            isPaused = false;
            setStatus('Cancelling…');
            cancelBtn.disabled = true;
            pauseBtn.disabled = true;
        });

        function requestConfirm(count) {
            return new Promise(resolve => {
                confirmMsg.innerHTML = `You are about to permanently delete <strong>${count} badge${count !== 1 ? 's' : ''}</strong> from your profile.<br><br>This cannot be undone. Continue?`;
                confirmOverlay.classList.add('visible');
                const yes = () => { cleanup(); resolve(true); };
                const no = () => { cleanup(); resolve(false); };
                const cleanup = () => {
                    confirmYes.removeEventListener('click', yes);
                    confirmNo.removeEventListener('click', no);
                    confirmOverlay.classList.remove('visible');
                };
                confirmYes.addEventListener('click', yes);
                confirmNo.addEventListener('click', no);
            });
        }

        function showToast(msg) {
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }

        function disableControls() {
            startBtn.disabled = true;
            cancelBtn.disabled = false;
            pauseBtn.disabled = false;
            gameInput.disabled = true;
            nameInput.disabled = true;
            delayInput.disabled = true;
            dryToggle.style.pointerEvents = 'none';
        }

        return {
            root, container, status: statusEl, timer: timerEl,
            bar, progressPct, rateBanner, log,
            startBtn, pauseBtn, cancelBtn,
            statDeleted: statDeleted.val,
            statFailed: statFailed.val,
            statSkipped: statSkipped.val,
            statRL: statRL.val,
            gameInput, nameInput, delayInput, dryToggle, gameNameEl,
            autoScrollChk, confirmOverlay,
            showToast, requestConfirm,
            disableControls,
        };
    }

    function mkEl(tag, id) {
        const e = document.createElement(tag);
        e.id = id;
        return e;
    }

    function mkBtn(cls, text, title, id) {
        const b = document.createElement('button');
        if (id) b.id = id;
        if (cls) b.className = cls;
        if (title) b.title = title;
        b.textContent = text;
        return b;
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

    function applyMinimize(on) {
        ui.container.classList.toggle('minimized', on);
    }

    function togglePause() {
        isPaused = !isPaused;
        ui.pauseBtn.classList.toggle('paused', isPaused);
        ui.pauseBtn.textContent = isPaused ? '▶  Resume' : '⏸  Pause';
        setStatus(isPaused ? 'Paused — press Resume or Space to continue.' : 'Resuming…');
        appendLog(isPaused ? '⏸ Paused by user' : '▶ Resumed', '#fbbf24');
        if (isPaused) stopTimer(); else startTimer();
    }

    function setStatus(msg) { ui.status.textContent = msg; }

    function syncStats(processed, total) {
        ui.statDeleted.textContent = totalDeleted;
        ui.statFailed.textContent = totalFailed;
        ui.statSkipped.textContent = totalSkipped;
        ui.statRL.textContent = rateLimitHits;
        if (total > 0) {
            const pct = Math.round(processed / total * 100);
            ui.bar.style.width = `${pct}%`;
            ui.progressPct.textContent = `${pct}%`;
        } else {
            ui.bar.style.width = '0%';
            ui.progressPct.textContent = '0%';
        }
    }

    function appendLog(msg, color) {
        logLines.push(msg);
        const line = document.createElement('div');
        line.className = 'bd-line';
        line.textContent = msg;
        if (color) line.style.color = color;
        ui.log.appendChild(line);
        if (ui.autoScrollChk.checked) ui.log.scrollTop = ui.log.scrollHeight;
    }

    function startTimer() {
        if (timerInterval) return;
        if (!startTime) startTime = Date.now();
        ui.timer.classList.add('running');
        timerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - startTime) / 1000);
            const m = Math.floor(s / 60);
            ui.timer.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
        }, 500);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
        ui.timer.classList.remove('running');
    }

    function resetTimer() {
        stopTimer();
        startTime = 0;
        ui.timer.textContent = '0:00';
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
            const secs = Math.ceil((end - Date.now()) / 1000);
            ui.rateBanner.textContent = `⏳ Rate limited — resuming in ${secs}s`;
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
            const res = await fetch(`https://badges.roblox.com/v1/badges/${badgeId}`, {
                credentials: 'include',
            });
            if (!res.ok) return null;
            const data = await res.json();
            return data.awarder?.id ? String(data.awarder.id) : null;
        } catch { return null; }
    }

    async function fetchAllBadges() {
        setStatus('Scanning badges…');
        const badges = [];
        let cursor = '';
        let page = 1;

        do {
            const url = `https://badges.roblox.com/v1/users/${pageUserId}/badges?limit=${CONFIG.PAGE_LIMIT}&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ''}`;
            const res = await fetch(url, { credentials: 'include' });

            if (res.status === 429) {
                rateLimitHits++;
                const waitMs = parseInt(res.headers.get('Retry-After') || '0', 10) * 1000 || CONFIG.RATE_LIMIT_BASE_MS;
                appendLog(`🚦 Rate limited on page ${page} — waiting ${waitMs / 1000}s`, '#fbbf24');
                await waitWithCountdown(waitMs);
                continue;
            }

            if (!res.ok) throw new Error(`Badge fetch failed (HTTP ${res.status})`);

            const json = await res.json();
            let filtered = json.data;

            if (gameFilter) {
                filtered = [];
                for (const badge of json.data) {
                    if (isCancelled) break;
                    const gid = await getGameIdForBadge(badge.id);
                    if (gid === gameFilter) {
                        filtered.push(badge);
                        appendLog(`  ✓ "${badge.name}" matches game ${gameFilter}`, '#34d399');
                    }
                    await sleep(80);
                }
                appendLog(
                    `  Page ${page}: ${filtered.length}/${json.data.length} matched game ${gameFilter}`,
                    '#fbbf24'
                );
            } else {
                appendLog(`  Page ${page}: ${json.data.length} badges loaded`, '#34d399');
            }

            if (nameFilter && filtered.length) {
                let rx;
                try { rx = new RegExp(nameFilter, 'i'); } catch { rx = null; }
                const before = filtered.length;
                filtered = rx
                    ? filtered.filter(b => rx.test(b.name))
                    : filtered.filter(b => b.name.toLowerCase().includes(nameFilter.toLowerCase()));
                if (filtered.length !== before) {
                    appendLog(
                        `  Name filter: ${filtered.length}/${before} passed on page ${page}`,
                        '#60a5fa'
                    );
                }
            }

            badges.push(...filtered.map(b => ({ id: b.id, name: b.name })));
            cursor = json.nextPageCursor || '';
            page++;
        } while (cursor);

        const suffix = gameFilter ? ` from game ${gameFilter}` : '';
        const nSuffix = nameFilter ? ` matching "${nameFilter}"` : '';
        appendLog(`✔ Found ${badges.length} badge${badges.length !== 1 ? 's' : ''}${suffix}${nSuffix}`, '#34d399');
        return badges;
    }

    async function deleteBadge(badge, attempt = 1, rlAttempt = 0) {
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
            deletedBadges.push({ id: badge.id, name: badge.name });
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
            const waitMs = parseInt(res.headers.get('Retry-After') || '0', 10) * 1000 || Math.min(currentBackoff, CONFIG.RATE_LIMIT_MAX_MS);
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
        totalDeleted = totalFailed = totalSkipped = rateLimitHits = 0;
        isCancelled = isPaused = false;
        currentBackoff = CONFIG.RATE_LIMIT_BASE_MS;
        logLines = [];
        deletedBadges = [];
        ui.log.innerHTML = '';
        syncStats(0, 0);
        resetTimer();
        ui.bar.style.background = 'linear-gradient(90deg,#dc3545,#ff6b7a)';

        try {
            if (!isDryRun) await fetchCSRF();
            const badges = await fetchAllBadges();

            if (!badges.length) {
                const filters = [
                    gameFilter && `game ${gameFilter}`,
                    nameFilter && `name "${nameFilter}"`,
                ].filter(Boolean).join(' + ');
                const msg = filters
                    ? `No badges found matching ${filters}.`
                    : 'No badges found on your profile.';
                setStatus(msg);
                appendLog(msg, '#fbbf24');
                resetButtons();
                return;
            }

            if (!isDryRun) {
                const confirmed = await ui.requestConfirm(badges.length);
                if (!confirmed) {
                    setStatus('Cancelled before starting.');
                    appendLog('✕ Cancelled by user before deletion started', '#fbbf24');
                    resetButtons();
                    return;
                }
            }

            setStatus(`${isDryRun ? 'Previewing' : 'Deleting'} ${badges.length} badge${badges.length !== 1 ? 's' : ''}…`);
            syncStats(0, badges.length);
            startTimer();

            let processed = 0;
            for (const badge of badges) {
                if (isCancelled) break;
                await waitWhilePaused();
                if (isCancelled) break;
                await deleteBadge(badge);
                syncStats(++processed, badges.length);
                await sleep(isDryRun ? 30 : deleteDelay);
            }

            stopTimer();

            const elapsed = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0';
            const summary = isDryRun
                ? `${isCancelled ? 'Cancelled' : 'Preview done'} — ${totalSkipped} badge${totalSkipped !== 1 ? 's' : ''} would be deleted.`
                : `${isCancelled ? 'Cancelled' : 'All done'} — ${totalDeleted} deleted, ${totalFailed} failed in ${elapsed}s.`;

            setStatus(summary);
            appendLog(summary, isCancelled ? '#fbbf24' : '#34d399');

            ui.bar.style.background = isCancelled
                ? 'linear-gradient(90deg,#d97706,#fbbf24)'
                : isDryRun
                    ? 'linear-gradient(90deg,#1d4ed8,#60a5fa)'
                    : 'linear-gradient(90deg,#047857,#34d399)';
            ui.bar.style.width = '100%';
            ui.progressPct.textContent = '100%';

        } catch (err) {
            stopTimer();
            setStatus(`Error: ${err.message}`);
            appendLog(`✖ ${err.message}`, '#f87171');
        } finally {
            resetButtons();
        }
    }

    function resetButtons() {
        ui.startBtn.disabled = false;
        ui.cancelBtn.disabled = true;
        ui.pauseBtn.disabled = true;
        ui.pauseBtn.classList.remove('paused');
        ui.pauseBtn.textContent = '⏸  Pause';
        ui.gameInput.disabled = false;
        ui.nameInput.disabled = false;
        ui.delayInput.disabled = false;
        ui.dryToggle.style.pointerEvents = '';
    }

})();
