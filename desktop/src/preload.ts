import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options?: any) => ipcRenderer.invoke('dialog:saveFile', options),
  openDirectory: (options?: any) =>
    ipcRenderer.invoke('dialog:openDirectory', options),

  // Notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('notification:show', { title, body }),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getName: () => ipcRenderer.invoke('app:getName'),

  // Window control
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChanged: (callback: (isMaximized: boolean) => void) => {
    const listener = (_event: any, value: boolean) => callback(value);
    ipcRenderer.on('window:maximize-changed', listener);
    return () => ipcRenderer.removeListener('window:maximize-changed', listener);
  },
  closeWindow: () => ipcRenderer.invoke('window:close'),
});

declare global {
  interface Window {
    electronAPI: {
      openFile: (options?: any) => Promise<any>;
      saveFile: (options?: any) => Promise<any>;
      openDirectory: (options?: any) => Promise<any>;
      showNotification: (title: string, body: string) => Promise<boolean>;
      getVersion: () => Promise<string>;
      getName: () => Promise<string>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onMaximizeChanged: (callback: (isMaximized: boolean) => void) => () => void;
      closeWindow: () => Promise<void>;
    };
  }
}
