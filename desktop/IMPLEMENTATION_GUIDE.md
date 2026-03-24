# Desktop App Implementation Guide

## Overview

Your Zen AI desktop application is now set up with an **automatic sync mechanism** that mirrors your web-app to the desktop while allowing desktop-specific customizations.

### Architecture

```
web-app/              ← Source of truth (React + Vite)
  ├── src/
  ├── package.json
  └── dist/           (build output)
       ↓ (automatic copy on build)
       
desktop/              ← Desktop wrapper
  ├── src/
  │   ├── main.ts     (Electron main process)
  │   ├── preload.ts  (IPC bridge)
  │   └── overrides/  (Desktop-specific code)
  ├── dist/           (compiled TypeScript)
  ├── dist-web/       (synced from web-app)
  └── scripts/
      └── prepare-web.js (build + sync script)
```

## Setup Instructions

### 1. Install Dependencies

From the `desktop/` folder:
```bash
npm install
```

This installs only the essentials: TypeScript and Node types.

### 2. Build the Desktop App

From the `desktop/` folder:
```bash
npm run build
```

This script:
1. Runs `npm run build` in `web-app/`
2. Compiles TypeScript in `desktop/src/`
3. Copies `web-app/dist/` to `desktop/dist-web/`

Result: `desktop/dist/` contains compiled TypeScript, and `desktop/dist-web/` contains the web UI.

### 3. Development Workflow

#### Terminal 1: Web App Dev Server
```bash
cd web-app
npm run dev
```

#### Terminal 2: TypeScript Watch (Optional)
```bash
cd desktop
npx tsc --watch
```

This recompiles Electron code as you edit it.

---

## How It Works: One-Way Sync

### The Sync Process

1. **Build trigger**: `npm run build` in `desktop/`
2. **Web-app builds**: `web-app/npm run build` → creates `web-app/dist/`
3. **Sync script runs**: `scripts/prepare-web.js` copies `web-app/dist/` → `desktop/dist-web/`
4. **TypeScript compiles**: `src/main.ts`, `src/preload.ts`, `src/overrides/**`

### Key Points

- **Web-app is source of truth**: All UI changes in `web-app/` automatically flow to desktop
- **No modifications to dist-web**: Never edit anything in `desktop/dist-web/` — it's auto-generated
- **Desktop-specific code isolated**: Put all platform-specific code in `desktop/src/overrides/`

---

## Using Desktop-Specific Features

### Example: Override a Component

Say you want a desktop-specific file picker instead of web's file input.

**Step 1:** Create override in `desktop/src/overrides/components/FilePicker.tsx`

```typescript
import { desktopFileService } from '@overrides/services/desktopFileService';

export const DesktopFilePicker = async () => {
  const files = await desktopFileService.openFile([
    { name: 'JSON Files', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] },
  ]);
  return files.filePaths;
};
```

**Step 2:** In web-app component, detect platform and use override:

```typescript
import { useElectron } from '@overrides/hooks/useElectron';

export const MyComponent = () => {
  const { isElectron } = useElectron();

  const handleFilePick = async () => {
    if (isElectron) {
      const api = (window as any).electronAPI;
      const result = await api.openFile({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      console.log(result.filePaths);
    } else {
      // Web-app fallback: use browser file input
    }
  };

  return <button onClick={handleFilePick}>Pick File</button>;
};
```

### Available Electron APIs

Once Electron is installed and integrated, the following APIs will be available via `window.electronAPI`:

```typescript
// File operations
await window.electronAPI.openFile(options);
await window.electronAPI.saveFile(options);
await window.electronAPI.openDirectory(options);

// Notifications
await window.electronAPI.showNotification('Title', 'Body');

// Window control
await window.electronAPI.minimizeWindow();
await window.electronAPI.maximizeWindow();
await window.electronAPI.closeWindow();

// App info
const version = await window.electronAPI.getVersion();
const name = await window.electronAPI.getName();
```

---

## Adding Electron (When Ready)

The desktop app is currently built as a **framework-agnostic sync system**. To add actual Electron packaging:

### Step 1: Install Electron & Builder

```bash
cd desktop
npm install --save-dev electron electron-builder electron-is-dev
```

### Step 2: Update package.json Scripts

```json
{
  "scripts": {
    "dev": "electron .",
    "build:electron": "tsc && electron-builder",
    "build": "npm run build:web && npm run build:electron"
  }
}
```

### Step 3: Configure electron-builder (`desktop/electron-builder.json`)

```json
{
  "appId": "com.zenai.desktop",
  "productName": "Zen AI",
  "files": ["dist/**/*", "dist-web/**/*"],
  "win": {
    "target": ["nsis", "portable"],
    "certificateFile": null
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  },
  "mac": {
    "target": ["dmg", "zip"]
  },
  "linux": {
    "target": ["AppImage"]
  }
}
```

### Step 4: Update main.ts to Detect Electron

```typescript
const isDev = process.env.NODE_ENV === 'development' || 
              require('electron-is-dev');

const startUrl = isDev
  ? 'http://localhost:5173'  // Web dev server
  : `file://${path.join(__dirname, '../dist-web/index.html')}`;

mainWindow.loadURL(startUrl);
```

---

## Project Structure Details

```
desktop/
├── src/
│   ├── main.ts                # Electron main process
│   ├── preload.ts             # IPC bridge (sandboxed)
│   ├── overrides/
│   │   ├── components/        # React components (desktop only)
│   │   ├── services/          # Services (e.g., desktopFileService)
│   │   ├── hooks/             # Hooks (e.g., useElectron)
│   │   └── types/             # TS types for desktop
│   └── utils/                 # Utilities
│
├── dist/                      # Compiled Electron code (generated)
├── dist-web/                  # Synced web-app (generated, do not edit)
├── types/
│   └── electron.d.ts          # Electron type definitions
├── scripts/
│   └── prepare-web.js         # Build + sync script
├── tsconfig.json              # TypeScript config
├── package.json
└── README.md
```

---

## Troubleshooting

### "Can't find module 'electron'"
This is expected during development. The desktop app is designed to work without Electron installed during type-checking. Only when you're ready to package the app do you need to install Electron.

### "dist-web is empty"
Run `npm run build:web` to sync. This requires the web-app to be built first:
```bash
cd web-app
npm run build
cd ../desktop
npm run build:web
```

### Building fails with TypeScript errors
Ensure `web-app/src` imports work with the `@/*` path alias in `desktop/tsconfig.json`.

---

## Next Steps

1. ✅ **Desktop folder structure created**
2. ✅ **Sync mechanism ready** (copy-on-build)
3. ✅ **TypeScript compilation working**
4. 📋 **Install Electron** (optional, deferred)
5. 📋 **Create desktop-specific overrides** (component examples provided)
6. 📋 **Test full build** (run `npm run build`)

---

## Quick Reference

| Command | Location | Purpose |
|---------|----------|---------|
| `npm install` | `desktop/` | Install desktop dependencies |
| `npm run build` | `desktop/` | Full build: sync web-app + compile TypeScript |
| `npm run build:web` | `desktop/` | Sync web-app to desktop only |
| `npm run build:electron` | `desktop/` | Compile TypeScript only |
| `npm run build` | `web-app/` | Build web-app first (required for desktop sync) |

---

## Notes

- **One-way sync**: Web-app → Desktop. Never edit `desktop/dist-web/` manually.
- **Shared types**: Use `@/*` path alias in desktop code to reference web-app types.
- **Overrides pattern**: Desktop-specific code in `src/overrides/` won't affect web-app.
- **Future-proof**: Framework ready for Electron, Tauri, or other desktop frameworks.
