/// <reference lib="dom" />

/**
 * Desktop-specific file service using Electron file dialogs
 * This is an example of how to override web services with desktop-specific implementations
 */

export const desktopFileService = {
  /**
   * Open file picker dialog
   */
  async openFile(filters?: Array<{ name: string; extensions: string[] }>) {
    if (!(window as any).electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await (window as any).electronAPI.openFile({
      filters,
      properties: ['openFile'],
    });

    return result;
  },

  /**
   * Save file dialog
   */
  async saveFile(
    defaultPath?: string,
    filters?: Array<{ name: string; extensions: string[] }>
  ) {
    if (!(window as any).electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await (window as any).electronAPI.saveFile({
      defaultPath,
      filters,
    });

    return result;
  },

  /**
   * Open directory picker
   */
  async openDirectory(defaultPath?: string) {
    if (!(window as any).electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await (window as any).electronAPI.openDirectory({
      defaultPath,
    });

    return result;
  },
};
