// ==UserScript==
// @name         Roblox Badge Deleter
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  Delete all badges from your own Roblox profile
// @author       Bulut
// @match        https://www.roblox.com/users/*/profile
// @icon         https://www.google.com/s2/favicons?sz=64&domain=roblox.com
// @grant        none
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

    if (!authedId || pageUserId !== authedId) {
        return;
    }

    let XCSRF          = '';
    let totalDeleted   = 0;
    let totalFailed    = 0;
    let isCancelled    = false;
    let rateLimitHits  = 0;
    let currentBackoff = CONFIG.RATE_LIMIT_BASE_MS;
    let gameFilter     = '';

    const ui = buildUI();
    document.body.appendChild(ui.container);

    function buildUI() {
        const style = document.createElement('style');
        style.textContent = `
            #bd-root * { box-sizing: border-box; }
            #bd-root { all: initial; }

            #bd-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                width: 340px;
                background: #0f0f17;
                border: 1px solid rgba(220, 53, 69, 0.35);
                border-radius: 14px;
                padding: 20px;
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                font-size: 13px;
                color: #d0d0d8;
                box-shadow:
                    0 0 0 1px rgba(255,255,255,0.04),
                    0 24px 48px rgba(0,0,0,0.7),
                    0 0 80px rgba(220,53,69,0.08);
            }

            #bd-header {
                display: flex;
                align-items: center;
                gap: 9px;
                margin-bottom: 16px;
            }

            #bd-icon {
                width: 28px;
                height: 28px;
                background: linear-gradient(135deg, #dc3545 0%, #9b1c2a 100%);
                border-radius: 7px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                flex-shrink: 0;
            }

            #bd-title {
                font-size: 14px;
                font-weight: 700;
                color: #f0f0f5;
                letter-spacing: -0.01em;
            }

            #bd-subtitle {
                font-size: 11px;
                color: #55555f;
                margin-top: 1px;
            }

            #bd-status {
                font-size: 12px;
                color: #88889a;
                margin-bottom: 10px;
                min-height: 16px;
                line-height: 1.4;
            }

            #bd-stats {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
                margin-bottom: 12px;
            }

            .bd-stat {
                background: #18181f;
                border: 1px solid rgba(255,255,255,0.05);
                border-radius: 8px;
                padding: 8px 6px;
                text-align: center;
            }

            .bd-stat-val {
                font-size: 16px;
                font-weight: 700;
                color: #f0f0f5;
                line-height: 1;
            }

            .bd-stat-val.green  { color: #34d399; }
            .bd-stat-val.red    { color: #f87171; }
            .bd-stat-val.amber  { color: #fbbf24; }

            .bd-stat-label {
                font-size: 10px;
                color: #44444e;
                margin-top: 4px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            #bd-bar-wrap {
                background: #18181f;
                border-radius: 99px;
                height: 6px;
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
                background: rgba(180,83,9,0.15);
                border: 1px solid rgba(245,158,11,0.3);
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 11px;
                color: #fbbf24;
                font-variant-numeric: tabular-nums;
                text-align: center;
                margin-bottom: 12px;
            }

            #bd-filter-wrap {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
                align-items: center;
            }

            #bd-filter-input {
                flex: 1;
                padding: 6px 10px;
                background: #18181f;
                border: 1px solid rgba(255,255,255,0.07);
                border-radius: 6px;
                color: #d0d0d8;
                font-size: 12px;
                font-family: inherit;
                outline: none;
                transition: border-color 0.2s;
            }

            #bd-filter-input:focus {
                border-color: rgba(220, 53, 69, 0.4);
            }

            #bd-filter-input::placeholder {
                color: #44444e;
                font-size: 11px;
            }

            #bd-filter-label {
                font-size: 11px;
                color: #55555f;
                white-space: nowrap;
            }

            #bd-log {
                max-height: 110px;
                overflow-y: auto;
                background: #0a0a10;
                border: 1px solid rgba(255,255,255,0.04);
                border-radius: 8px;
                padding: 9px 10px;
                font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
                font-size: 10.5px;
                color: #44444e;
                margin-bottom: 14px;
                scroll-behavior: smooth;
            }

            #bd-log::-webkit-scrollbar { width: 4px; }
            #bd-log::-webkit-scrollbar-track { background: transparent; }
            #bd-log::-webkit-scrollbar-thumb { background: #2a2a35; border-radius: 99px; }

            #bd-log .bd-line { padding: 1px 0; line-height: 1.5; }

            #bd-btns {
                display: flex;
                gap: 8px;
            }

            .bd-btn {
                flex: 1;
                padding: 9px 0;
                border: none;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                letter-spacing: 0.01em;
                transition: opacity 0.15s, transform 0.1s;
            }

            .bd-btn:active:not(:disabled) { transform: scale(0.97); }

            .bd-btn:disabled {
                opacity: 0.35;
                cursor: not-allowed;
            }

            #bd-start-btn {
                background: linear-gradient(135deg, #dc3545 0%, #b02030 100%);
                color: #fff;
            }

            #bd-start-btn:hover:not(:disabled) { opacity: 0.88; }

            #bd-cancel-btn {
                background: #1e1e28;
                color: #88889a;
                border: 1px solid rgba(255,255,255,0.07);
            }

            #bd-cancel-btn:hover:not(:disabled) {
                background: #252530;
                color: #d0d0d8;
            }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'bd-root';

        const container = document.createElement('div');
        container.id = 'bd-container';

        const header = document.createElement('div');
        header.id = 'bd-header';

        const icon = document.createElement('div');
        icon.id = 'bd-icon';
        icon.textContent = '🗑';

        const titleWrap = document.createElement('div');
        const title = document.createElement('div');
        title.id = 'bd-title';
        title.textContent = 'Badge Deleter';
        const subtitle = document.createElement('div');
        subtitle.id = 'bd-subtitle';
        subtitle.textContent = 'Your profile only';
        titleWrap.append(title, subtitle);
        header.append(icon, titleWrap);

        const status = document.createElement('div');
        status.id = 'bd-status';
        status.textContent = 'Ready to scan your badges.';

        const stats = document.createElement('div');
        stats.id = 'bd-stats';

        const statDeleted  = makeStat('0', 'Deleted',  'green',  'bd-stat-deleted');
        const statFailed   = makeStat('0', 'Failed',   'red',    'bd-stat-failed');
        const statRL       = makeStat('0', 'Rate Hits','amber',  'bd-stat-rl');
        stats.append(statDeleted.wrap, statFailed.wrap, statRL.wrap);

        const barWrap = document.createElement('div');
        barWrap.id = 'bd-bar-wrap';
        const bar = document.createElement('div');
        bar.id = 'bd-bar';
        barWrap.appendChild(bar);

        const rateBanner = document.createElement('div');
        rateBanner.id = 'bd-rate-banner';

        const filterWrap = document.createElement('div');
        filterWrap.id = 'bd-filter-wrap';

        const filterLabel = document.createElement('span');
        filterLabel.id = 'bd-filter-label';
        filterLabel.textContent = 'Game ID:';

        const filterInput = document.createElement('input');
        filterInput.id = 'bd-filter-input';
        filterInput.type = 'text';
        filterInput.placeholder = 'Leave empty for all badges';
        filterInput.value = '';

        filterWrap.append(filterLabel, filterInput);

        const log = document.createElement('div');
        log.id = 'bd-log';

        const btns = document.createElement('div');
        btns.id = 'bd-btns';

        const startBtn  = document.createElement('button');
        startBtn.id     = 'bd-start-btn';
        startBtn.className = 'bd-btn';
        startBtn.textContent = '▶  Start';

        const cancelBtn = document.createElement('button');
        cancelBtn.id    = 'bd-cancel-btn';
        cancelBtn.className = 'bd-btn';
        cancelBtn.textContent = '✕  Cancel';
        cancelBtn.disabled = true;

        btns.append(startBtn, cancelBtn);
        container.append(header, status, stats, barWrap, rateBanner, filterWrap, log, btns);
        root.appendChild(container);

        startBtn.addEventListener('click', () => {
            gameFilter = filterInput.value.trim();
            startBtn.disabled = true;
            cancelBtn.disabled = false;
            runDeletion();
        });

        cancelBtn.addEventListener('click', () => {
            isCancelled = true;
            setStatus('Cancelling…');
            cancelBtn.disabled = true;
        });

        return {
            container: root,
            status,
            bar,
            rateBanner,
            log,
            startBtn,
            cancelBtn,
            statDeleted: statDeleted.val,
            statFailed:  statFailed.val,
            statRL:      statRL.val,
            filterInput,
        };
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

    function setStatus(msg) {
        ui.status.textContent = msg;
    }

    function syncStats(deleted, total) {
        ui.statDeleted.textContent = deleted;
        ui.statFailed.textContent  = totalFailed;
        ui.statRL.textContent      = rateLimitHits;
        ui.bar.style.width = total > 0 ? `${Math.round((deleted / total) * 100)}%` : '0%';
    }

    function appendLog(msg, color) {
        const line = document.createElement('div');
        line.className = 'bd-line';
        line.textContent = msg;
        if (color) line.style.color = color;
        ui.log.appendChild(line);
        ui.log.scrollTop = ui.log.scrollHeight;
    }

    async function waitWithCountdown(ms) {
        ui.rateBanner.style.display = 'block';
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (isCancelled) break;
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

    async function getBadgeGameIdFromPage(badgeId) {
        try {
            const res = await fetch(`https://www.roblox.com/badges/${badgeId}`, {
                credentials: 'include',
            });
            if (!res.ok) return null;
            const html = await res.text();
            
            const match = html.match(/<a\s+href=["']https:\/\/www\.roblox\.com\/games\/(\d+)/);
            if (match) {
                return match[1];
            }
            
            const match2 = html.match(/games\/(\d+)/);
            if (match2) {
                return match2[1];
            }
            
            return null;
        } catch (e) {
            return null;
        }
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
                const waitMs = retryAfter
                    ? parseInt(retryAfter, 10) * 1000
                    : CONFIG.RATE_LIMIT_BASE_MS;
                appendLog(`🚦 Rate limited on page ${page} — waiting ${waitMs / 1000}s`, '#fbbf24');
                await waitWithCountdown(waitMs);
                continue;
            }

            if (!res.ok) throw new Error(`Badge fetch failed (HTTP ${res.status})`);

            const json = await res.json();
            
            let filteredData = [];
            
            if (gameFilter) {
                for (const badge of json.data) {
                    const gameId = await getBadgeGameIdFromPage(badge.id);
                    if (gameId === gameFilter) {
                        filteredData.push(badge);
                        appendLog(`  ✓ "${badge.name}" matches game ${gameFilter}`, '#34d399');
                    }
                    await sleep(100);
                }
                appendLog(`  Page ${page}: ${filteredData.length} of ${json.data.length} badges match game ${gameFilter}`, '#fbbf24');
            } else {
                filteredData = json.data;
                appendLog(`  Page ${page}: ${json.data.length} badges loaded`, '#34d399');
            }
            
            badges.push(...filteredData.map(b => ({ id: b.id, name: b.name })));
            cursor = json.nextPageCursor || '';
            page++;
        } while (cursor);

        if (gameFilter) {
            appendLog(`✔ Found ${badges.length} badge${badges.length !== 1 ? 's' : ''} from game ${gameFilter}`, '#34d399');
        } else {
            appendLog(`✔ Found ${badges.length} badge${badges.length !== 1 ? 's' : ''}`, '#34d399');
        }
        return badges;
    }

    async function deleteBadge(badge, attempt = 1, rlAttempt = 0) {
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
            syncStats(totalDeleted, 0);

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
        try {
            await fetchCSRF();
            const badges = await fetchAllBadges();

            if (badges.length === 0) {
                if (gameFilter) {
                    setStatus(`No badges found from game ${gameFilter} on your profile.`);
                    appendLog(`No badges match game ID ${gameFilter}.`, '#fbbf24');
                } else {
                    setStatus('No badges found on your profile.');
                    appendLog('Nothing to delete.', '#fbbf24');
                }
                ui.startBtn.disabled = false;
                return;
            }

            setStatus(`Deleting ${badges.length} badge${badges.length !== 1 ? 's' : ''}…`);
            syncStats(0, badges.length);

            for (const badge of badges) {
                if (isCancelled) break;
                await deleteBadge(badge);
                syncStats(totalDeleted, badges.length);
                await sleep(CONFIG.DELETE_DELAY_MS);
            }

            const done = isCancelled
                ? `Cancelled — ${totalDeleted} deleted, ${totalFailed} failed.`
                : `All done — ${totalDeleted} deleted, ${totalFailed} failed.`;

            setStatus(done);
            appendLog(done, isCancelled ? '#fbbf24' : '#34d399');
            ui.bar.style.background = isCancelled
                ? 'linear-gradient(90deg,#d97706,#fbbf24)'
                : 'linear-gradient(90deg,#059669,#34d399)';
            ui.bar.style.width = '100%';

        } catch (err) {
            setStatus(`Error: ${err.message}`);
            appendLog(`✖ ${err.message}`, '#f87171');
            ui.startBtn.disabled = false;
            ui.cancelBtn.disabled = true;
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

})();
