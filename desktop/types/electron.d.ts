// Electron type definitions for development
declare module 'electron' {
  export interface BrowserWindowOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    webPreferences?: {
      preload?: string;
      nodeIntegration?: boolean;
      contextIsolation?: boolean;
      enableRemoteModule?: boolean;
    };
    icon?: string;
  }

  export interface MenuItemOptions {
    label?: string;
    submenu?: MenuItemOptions[];
    accelerator?: string;
    role?: string;
    type?: string;
    click?: () => void;
  }

  export interface DialogOptions {
    properties?: string[];
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }

  export interface SaveDialogOptions extends DialogOptions {}

  export interface OpenDialogOptions extends DialogOptions {}

  export interface NotificationOptions {
    title?: string;
    body?: string;
  }

  export class BrowserWindow {
    constructor(options: BrowserWindowOptions);
    loadURL(url: string): Promise<void>;
    webContents: {
      openDevTools(): void;
    };
    on(event: string, callback: () => void): void;
    minimize(): void;
    unmaximize(): void;
    maximize(): void;
    isMaximized(): boolean;
    close(): void;
  }

  export class Notification {
    constructor(options: NotificationOptions);
    show(): void;
  }

  export const app: {
    isPackaged: any;
    quit(): void;
    getName(): string;
    getVersion(): string;
    on(event: string, callback: () => void): void;
  };

  export const Menu: {
    buildFromTemplate(template: MenuItemOptions[]): any;
    setApplicationMenu(menu: any): void;
  };

  export const ipcMain: {
    handle(channel: string, handler: (event: any, ...args: any[]) => Promise<any>): void;
  };

  export const dialog: {
    showOpenDialog(window: BrowserWindow, options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog(window: BrowserWindow, options: SaveDialogOptions): Promise<{ canceled: boolean; filePath?: string }>;
    showMessageBox(window: BrowserWindow, options: any): Promise<any>;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: any): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
  };
}
