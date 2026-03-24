/**
 * Example: Desktop-specific FilePicker component
 * This demonstrates how to create desktop-specific UI that uses native features
 * (not used directly; shows pattern for overriding web components)
 */

import { desktopFileService } from '../services/desktopFileService';

export const DesktopFilePicker = async (): Promise<string[]> => {
  try {
    const result = await desktopFileService.openFile([
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'md'] },
      { name: 'JSON Files', extensions: ['json'] },
    ]);

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths;
    }

    return [];
  } catch (error) {
    console.error('Error opening file picker:', error);
    return [];
  }
};
