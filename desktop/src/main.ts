import { app, BrowserWindow, Menu, ipcMain, dialog, Notification } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Check if running in development (Electron is running directly)
const isDev = !app.isPackaged;
const isDebug = isDev || !!process.env.ELECTRON_DEBUG;

// Allow forcing software rendering only when explicitly requested.
if (process.env.ELECTRON_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

try {
  const safeUserData = path.join(app.getPath('appData'), 'Zen AI');
  app.setPath('userData', safeUserData);
} catch (error) {
  console.warn('Unable to override userData path:', error);
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  const devIcon = path.join(__dirname, '../deploy/build/icon.png');
  const iconPath = fs.existsSync(devIcon) ? devIcon : undefined;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#1a1a1a', // Dark background instead of white
    // Make the window frameless so we can render a custom titlebar in the renderer
    frame: false,
    // On macOS, use a hiddenInset style for traffic light controls positioning
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: iconPath,
  });

  // Show window as soon as renderer is ready.
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Fail-safe: never stay hidden indefinitely if ready-to-show is delayed.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 3500);

  // Determine dev server URL or production file path
  const vitePort = process.env.VITE_DEV_PORT || '5173';
  let startUrl: string | null = null;
  
  if (isDev) {
    startUrl = `http://localhost:${vitePort}`;
  } else {
    // In production, use app.getAppPath() to get the correct base path
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist-web', 'index.html');
    startUrl = null;

    if (isDebug) {
      console.log('Loading from:', indexPath);
    }

    // loadFile handles escaping and file:// conversion correctly on Windows paths
    mainWindow.loadFile(indexPath).catch((error) => {
      console.error('Failed to load index file:', error);
    });
  }

  if (startUrl) {
    mainWindow.loadURL(startUrl).catch((error) => {
      console.error('Failed to load URL:', error);
    });
  }

  // Add error handling for failed loads
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL);
    console.error('Error:', errorCode, errorDescription);
  });

  if (isDebug) {
    // Capture renderer errors only in debug mode.
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
        return;
      }
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('Renderer process gone:', details.reason, details.exitCode);
    });
  }

  // Log when page loads successfully
  mainWindow.webContents.on('did-finish-load', () => {
    if (isDebug) {
      console.log('Page loaded successfully');
    }
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  if (isDebug) {
    mainWindow.webContents.openDevTools();
  }

  // Notify renderer when window maximize state changes (so UI can update)
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // Remove the default application menu (no File/Edit/View/Help bar)
  Menu.setApplicationMenu(null);
  setupIPC();
};

const setupIPC = () => {
  // File dialog: open file
  ipcMain.handle('dialog:openFile', async (event: any, options: any = {}) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      ...options,
    });
    return result;
  });

  // File dialog: save file
  ipcMain.handle('dialog:saveFile', async (event: any, options: any = {}) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      ...options,
    });
    return result;
  });

  // File dialog: open directory
  ipcMain.handle('dialog:openDirectory', async (event: any, options: any = {}) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      ...options,
    });
    return result;
  });

  // System notifications
  ipcMain.handle('notification:show', async (event: any, { title, body }: any) => {
    return new Promise((resolve) => {
      const notification = new Notification({
        title,
        body,
      });
      notification.show();
      resolve(true);
    });
  });

  // App info
  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getName', async () => {
    return app.getName();
  });

  // Window control
  ipcMain.handle('window:minimize', async () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', async () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:isMaximized', async () => {
    return !!mainWindow?.isMaximized();
  });

  ipcMain.handle('window:close', async () => {
    mainWindow?.close();
  });
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
