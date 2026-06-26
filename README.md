# Roblox Badge Deleter

Delete all badges from your Roblox profile with one click — now with dry-run preview, pause/resume, a draggable panel, and more.

## What's New in v2.0

- **Dry run mode** — scan and preview exactly which badges would be deleted, without touching anything
- **Pause / Resume** — pause mid-deletion and pick up where you left off (or press `Space`)
- **Draggable panel** — drag the UI anywhere on screen so it doesn't cover page content
- **Minimize / Expand** — collapse the panel to a header bar when you don't need it; state persists across page loads
- **Configurable delay** — adjust the delay between deletions directly in the UI (100–5000 ms)
- **Skipped stat** — dry-run results show a separate "Skipped" counter
- **Copy log** — copy the full activity log to clipboard with one click (📋)
- **Input validation** — Game ID field rejects non-numeric input before starting
- **Keyboard shortcuts** — `Escape` to cancel, `Space` to pause/resume
- **Settings persistence** — Game ID filter and delay setting are remembered across page loads (via Tampermonkey storage)
- **Reset on re-run** — counters, log, and progress bar reset cleanly when you start again

## Features

- **Bulk deletion** — remove all badges from your profile at once
- **Game-specific filtering** — delete only badges from a specific game by entering its ID
- **Real-time progress** — live stats for deleted, failed, skipped, and rate-limit hits
- **Smart rate limiting** — automatic exponential backoff when Roblox throttles requests
- **Visual progress bar** — changes colour on completion (green), dry-run (blue), or cancel (amber)
- **Auto-retry** — failed deletions are retried up to 3 times automatically
- **CSRF auto-refresh** — transparently refreshes the security token if it expires mid-run
- **Safe by design** — only activates on your own authenticated profile page

## Installation

### Option 1: One-Click Install
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. [Click here to install](https://github.com/bulutkocak/Roblox-Badge-Deleter/raw/refs/heads/main/Roblox-Badge-Deleter.user.js)
3. Confirm installation in Tampermonkey

### Option 2: Manual Install
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click the Tampermonkey icon → "Create a new script"
3. Paste the script contents and press `Ctrl+S` to save

> **Note:** v2.0 uses `@grant GM_setValue` and `@grant GM_getValue` to persist settings. Make sure Tampermonkey has storage permissions enabled (it does by default).

## How to Use

1. Go to your Roblox profile page (`roblox.com/users/YOUR_ID/profile`)
2. The **🗑 Badge Deleter** panel appears in the bottom-right corner
3. *(Optional)* Enable **Dry run** to preview badges without deleting them
4. *(Optional)* Enter a **Game ID** to target only badges from that game
5. *(Optional)* Adjust the **delay** between deletions to be gentler on the API
6. Click **▶ Start** (or **🔍 Scan** in dry-run mode)
7. Use **⏸ Pause** to hold and **✕ Cancel** to abort at any time

### Dry Run Workflow (Recommended First Time)

1. Enable the dry-run toggle
2. Click **🔍 Scan**
3. Review the log — each badge that *would* be deleted is listed in blue
4. Turn off dry run, then click **▶ Start** to perform real deletions

### Game-Specific Deletion

To delete only badges earned in a specific game:
1. Find the game's numeric ID from its URL (`roblox.com/games/1927139201/...` → `1927139201`)
2. Enter that ID in the **Game ID** field
3. Click Start — only badges from that game will be deleted

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume (when body is focused) |
| `Escape` | Cancel deletion |

## Configuration

Settings adjustable directly in the UI:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Delete delay | 500 ms | 100–5000 ms | Time between each badge deletion |
| Game ID filter | *(empty)* | Numeric | Delete only badges from this game |
| Dry run | Off | On / Off | Preview mode — no deletions performed |

Advanced settings (edit top of script):

```javascript
const CONFIG = {
    DELETE_DELAY_MS:    500,    // Default delay between deletions (ms)
    RETRY_LIMIT:        3,      // Max retry attempts per badge
    RETRY_DELAY_MS:     2000,   // Delay between retries (ms)
    PAGE_LIMIT:         100,    // Badges per API page request
    RATE_LIMIT_BASE_MS: 10000,  // Initial rate-limit backoff (ms)
    RATE_LIMIT_MAX_MS:  120000, // Maximum rate-limit backoff (ms)
    RATE_LIMIT_RETRIES: 5,      // Max rate-limit retry attempts
};
```

## How It Works

1. **Auth check** — verifies you're viewing your own profile before doing anything
2. **CSRF token** — fetches a security token required by Roblox's API
3. **Badge scanning** — paginates through all your badges (100 per request)
4. **Game filtering** — if a Game ID is set, fetches each badge's page to confirm its game
5. **Deletion loop** — deletes badges one at a time, respecting the configured delay
6. **Error handling** — retries on failure, backs off exponentially on rate limits, refreshes CSRF if expired
7. **Progress tracking** — updates all counters and the progress bar after each badge

## Technologies

- JavaScript (ES2020+)
- Roblox REST API (`badges.roblox.com`, `users.roblox.com`, `auth.roblox.com`)
- Tampermonkey Userscript API (`GM_setValue` / `GM_getValue` for persistence)

## Contributing

1. Fork the repository
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License

MIT

---

**⚠️ Disclaimer:** Deleting badges is permanent and cannot be undone. Use dry-run mode first to review what will be removed. This tool is not affiliated with or endorsed by Roblox Corporation.
