# Zen AI Desktop Application

Desktop version of Zen AI built with Electron, syncing from the web-app.

## Setup

```bash
npm install
```

## Development

```bash
# Terminal 1: Run web-app dev server
cd ../web-app
npm run dev

# Terminal 2: Run Electron in dev mode (loads web-app from localhost:5173)
cd desktop
npm run dev
```

## Building

```bash
# Build web-app and package as Electron app
npm run build
```

This will:
1. Build the web-app
2. Copy dist to `desktop/dist-web/`
3. Compile TypeScript to `desktop/dist/`
4. Package with electron-builder

## Project Structure

```
src/
├── main.ts          # Electron main process
├── preload.ts       # IPC bridge to renderer
└── overrides/       # Desktop-specific code
    ├── components/  # Override web components
    ├── services/    # Desktop-specific services
    └── hooks/       # Desktop-specific hooks
```

## Desktop-Specific Features

### File Operations
```typescript
const result = await window.electronAPI.openFile({ filters: [...] });
const result = await window.electronAPI.saveFile({ defaultPath: '...' });
const result = await window.electronAPI.openDirectory();
```

### Notifications
```typescript
await window.electronAPI.showNotification('Title', 'Body text');
```

### Window Control
```typescript
await window.electronAPI.minimizeWindow();
await window.electronAPI.maximizeWindow();
await window.electronAPI.closeWindow();
```

### App Info
```typescript
const version = await window.electronAPI.getVersion();
const name = await window.electronAPI.getName();
```

## Adding Desktop Overrides

To override a web component with a desktop-specific version:

1. Create the override in `src/overrides/components/path/to/Component.tsx`
2. The override will be available via the TypeScript path alias `@overrides/`
3. In the web-app or desktop-specific code, check for Electron and load the override

Example:
```typescript
// In web-app component
import FilePicker from '@overrides/components/FilePicker';
// Falls back to web version if not in desktop
```

## Sync Mechanism

- Web-app is the source of truth
- Build process auto-syncs: `web-app/dist/` → `desktop/dist-web/`
- Desktop overrides are independent and never affect web-app builds
- One-way sync: only web-app changes flow to desktop
