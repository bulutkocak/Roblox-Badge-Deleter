# Roblox Badge Deleter

Delete all badges from your Roblox profile with one click.

## Features

- **Bulk deletion** - Remove all badges from your profile at once
- **Real-time progress** - Live stats showing deleted, failed, and rate limit hits
- **Smart rate limiting** - Automatically handles Roblox API limits
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
2. Click the red **🗑** button in the bottom-right corner
3. Click **Start** to begin deletion
4. Watch the progress and wait for completion

## Configuration

You can adjust these settings at the top of the script:

```javascript
const CONFIG = {
    DELETE_DELAY_MS:    500,   // Delay between deletions
    RETRY_LIMIT:        3,     // Max retry attempts per badge
    RATE_LIMIT_BASE_MS: 10000, // Initial rate limit wait time
};
```

## Technologies

- JavaScript (ES6+)
- Roblox API
- Tampermonkey API

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
