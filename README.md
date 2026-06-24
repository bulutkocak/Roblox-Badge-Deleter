# Roblox Badge Deleter

Delete all badges from your Roblox profile with one click.

## Features

- **Bulk deletion** - Remove all badges from your profile at once
- **Game-specific filtering** - Delete only badges from a specific game by entering its ID
- **Real-time progress** - Live stats showing deleted, failed, and rate limit hits
- **Smart rate limiting** - Automatically handles Roblox API limits with exponential backoff
- **Visual feedback** - Progress bar and detailed activity log
- **Cancel anytime** - Stop the process whenever you want
- **Auto-retry** - Failed deletions are retried automatically
- **Safe & secure** - Only works on your own profile

## Installation

### Option 1: One-Click Install
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. [Click here to install](https://github.com/bulutkocak/Roblox-Badge-Deleter/raw/refs/heads/main/Roblox-Badge-Deleter.user.js)
3. Confirm installation in Tampermonkey

### Option 2: Manual Install
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click Tampermonkey icon → "Create a new script"
3. Copy the script code and paste it in
4. Press `Ctrl+S` to save

## How to Use

1. Go to your Roblox profile page (`roblox.com/users/YOUR_ID`)
2. Look for the red **🗑** Badge Deleter panel in the bottom-right corner
3. **Optional**: Enter a Game ID to delete only badges from that specific game
4. Click **Start** to begin deletion
5. Watch the progress and wait for completion

### Game-Specific Deletion Example
To delete only badges from "The Border" game:
1. Enter `1927139201` in the Game ID field
2. Click Start
3. Only badges from that game will be deleted

## Configuration

You can adjust these settings at the top of the script:

```javascript
const CONFIG = {
    DELETE_DELAY_MS:    500,   // Delay between deletions (ms)
    RETRY_LIMIT:        3,     // Max retry attempts per badge
    RETRY_DELAY_MS:     2000,  // Delay between retries (ms)
    PAGE_LIMIT:         100,   // Badges per API request
    RATE_LIMIT_BASE_MS: 10000, // Initial rate limit wait time (ms)
    RATE_LIMIT_MAX_MS:  120000,// Maximum rate limit wait time (ms)
    RATE_LIMIT_RETRIES: 5,     // Max rate limit retries
};
```

## How It Works

1. **Profile Detection**: Script automatically detects when you're on your own profile
2. **CSRF Token**: Fetches a CSRF token required for API requests
3. **Badge Scanning**: Retrieves all badges from your profile
4. **Game Filtering**: If a Game ID is provided, checks each badge's game using the badge page
5. **Deletion Process**: Deletes each badge with retry logic and rate limit handling
6. **Progress Tracking**: Updates stats and progress bar in real-time

## Technologies

- JavaScript (ES6+)
- Roblox REST API
- Tampermonkey Userscript API

## Contributing

1. Fork the repository
2. Create a branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

## License

MIT

---

**⚠️ Disclaimer**: Deleting badges is permanent and cannot be undone. Use at your own risk. This tool is not affiliated with Roblox Corporation.
