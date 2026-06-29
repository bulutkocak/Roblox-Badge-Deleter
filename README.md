# Roblox Badge Deleter

Delete badges from your Roblox profile with full control — dry-run preview, name and game filters, pause/resume, elapsed timer, JSON export, and more.

## What's New in v2.2.0

- **Name filter** — filter by badge name using a plain substring or a JavaScript regex (e.g. `^Speed` or `arena`)
- **Confirmation dialog** — a modal asks you to confirm before any real deletion begins, showing the exact badge count
- **Elapsed timer** — a live clock runs during deletion so you know how long a job took
- **JSON export** — copy all deleted badge IDs and names as a JSON array to clipboard with the `{}` button
- **Auto-scroll toggle** — pin or unpin the log from auto-scrolling while a run is in progress
- **Clear log button** — wipe the activity log between runs without reloading the page
- **Progress percentage** — `X%` shown alongside the progress bar
- **Fixed game ID lookup** — now uses `badges.roblox.com/v1/badges/{id}` (the official API) instead of scraping badge page HTML, making game filtering faster and more reliable
- **Cleaner DOM helpers** — internal refactor separating element creation (`mkEl`) from button creation (`mkBtn`), removing an ID/className ambiguity from v2.1

## What's New in v2.1

- **Optimized codebase** — minified CSS, consolidated DOM helpers, tighter logic throughout

## What's New in v2.0

- **Dry run mode** — preview exactly which badges would be deleted without touching anything
- **Pause / Resume** — pause mid-deletion and pick up where you left off (or press `Space`)
- **Draggable panel** — drag the UI anywhere on screen
- **Minimize / Expand** — collapse the panel to a header bar; state persists across page loads
- **Configurable delay** — adjust the delay between deletions directly in the UI (100–5000 ms)
- **Skipped stat** — dry-run results show a separate "Skipped" counter
- **Copy log** — copy the full activity log to clipboard with one click (📋)
- **Input validation** — Game ID field rejects non-numeric input before starting
- **Keyboard shortcuts** — `Escape` to cancel, `Space` to pause/resume
- **Settings persistence** — Game ID filter and delay are remembered across page loads
- **Reset on re-run** — counters, log, and progress bar reset cleanly when you start again

## Features

- **Bulk deletion** — remove all matching badges from your profile at once
- **Game-specific filtering** — delete only badges from a specific game by entering its ID
- **Name filtering** — delete only badges whose name matches a substring or regex
- **Confirmation prompt** — always shows badge count and asks before deleting (skipped in dry-run)
- **Real-time progress** — live stats for deleted, failed, skipped, and rate-limit hits with a percentage counter
- **Elapsed timer** — shows how long the current run has been running
- **Smart rate limiting** — automatic exponential backoff when Roblox throttles requests
- **Visual progress bar** — changes colour on completion (green), dry-run (blue), or cancel (amber)
- **Auto-retry** — failed deletions are retried up to 3 times automatically
- **CSRF auto-refresh** — transparently refreshes the security token if it expires mid-run
- **JSON export** — copy deleted badge data (ID + name) as JSON for your own records
- **Auto-scroll toggle** — keep the log pinned to the bottom, or freeze it to read entries mid-run
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

> **Note:** This script uses `@grant GM_setValue` and `@grant GM_getValue` to persist settings. Tampermonkey enables storage permissions by default.

## How to Use

1. Go to your Roblox profile page (`roblox.com/users/YOUR_ID/profile`)
2. The **🗑 Badge Deleter** panel appears in the bottom-right corner
3. *(Optional)* Enable **Dry run** to preview badges without deleting them
4. *(Optional)* Enter a **Game ID** to target only badges from that game
5. *(Optional)* Enter a **Name filter** — a plain substring or JavaScript regex
6. *(Optional)* Adjust the **delay** between deletions
7. Click **▶ Start** (or **🔍 Scan** in dry-run mode)
8. Confirm the deletion count in the dialog that appears
9. Use **⏸ Pause** to hold and **✕ Cancel** to abort at any time

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

### Name Filtering

The **Name filter** field accepts a plain substring or a JavaScript regex:

| Input | Matches |
|-------|---------|
| `speedrun` | Any badge whose name contains "speedrun" (case-insensitive) |
| `^Win` | Badges whose name starts with "Win" |
| `2024\|2023` | Badges from either year in the name |
| `\bVIP\b` | Names containing the whole word "VIP" |

An invalid regex shows a red outline and blocks the run until corrected.

### JSON Export

After a deletion run, click the **{}** header button to copy the deleted badge list as JSON:

```json
{
  "deletedAt": "2025-08-01T14:22:10.000Z",
  "badges": [
    { "id": 123456789, "name": "Speed Demon" },
    { "id": 987654321, "name": "First Win" }
  ]
}
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume (when body has focus) |
| `Escape` | Cancel deletion |

## Configuration

Settings adjustable in the UI:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Delete delay | 500 ms | 100–5000 ms | Time between each badge deletion |
| Game ID filter | *(empty)* | Numeric | Delete only badges from this game |
| Name filter | *(empty)* | String or regex | Delete only badges matching this pattern |
| Dry run | Off | On / Off | Preview mode — no deletions performed |
| Auto-scroll | On | On / Off | Keep log pinned to newest entry |

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
4. **Game filtering** — if a Game ID is set, calls `badges.roblox.com/v1/badges/{id}` for each badge to confirm its game (faster and more reliable than HTML scraping used in earlier versions)
5. **Name filtering** — applies substring or regex match against each badge name
6. **Confirmation** — shows you the exact count and asks you to confirm before deleting
7. **Deletion loop** — deletes badges one at a time, respecting the configured delay
8. **Error handling** — retries on failure, backs off exponentially on rate limits, refreshes CSRF if expired
9. **Progress tracking** — updates all counters, timer, and progress bar after each badge

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
