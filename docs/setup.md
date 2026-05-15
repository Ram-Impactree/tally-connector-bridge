# Tally Connector v1 Setup

## Prerequisites

- Windows machine
- Node.js 20+
- npm 10+

## Install

1. Open terminal in project folder.
2. Install dependencies:

   ```powershell
   npm install
   ```

If Electron binary download is blocked in your network, run:

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD="1"
npm install
```

## Development

Run desktop app + renderer:

```powershell
npm run dev
```

## Build

```powershell
npm run build
```

## Create a Windows installer

After building the app, package it as a Windows executable installer:

```powershell
npm run dist
```

The installer output will be written to the `release/` folder. For example, the installer file may be named:

- `release/Tally Connector Setup 1.0.0.exe`

## Frontend deployment and installer URL

When deploying the React frontend, configure the public download URL with an environment variable.

Create a `.env` file in the project root or set the variable in your hosting environment:

```env
VITE_EXE_DOWNLOAD_URL=https://download.example.com/Tally-Connector-Setup.exe
```

The app uses this URL to render the download button on the browser version of the page.

## Auto-sync behavior
When the desktop app launches and Tally is detected as running, it automatically sends company data to the configured `cloudBaseUrl` endpoint.

The payload includes:
- `source`: "tally"
- `syncType`: "merge"
- `deduplicateBy`: "guid"
- `companyName`: "All Companies"
- `tallyHost` and `tallyPort`
- `records`: unique company records from Tally

Duplicate company records are removed locally using GUID before the sync request is sent.

The sync uses a retry/backoff loop when the cloud endpoint is temporarily unavailable. If all retries fail, the app logs the error and continues running.

## Current v1 Features Implemented

- Detect Tally installation evidence on Windows.
- Save connector settings: cloud URL, Tally host, and Tally port.
- Test Tally endpoint connectivity using Tally XML over HTTP.
- Show status UI in desktop app.

## Next Implementation Items

- Cloud auth endpoints integration.
- Device registration flow.
- Sync job with retries and idempotency.
- Token refresh and secure secrets storage.
