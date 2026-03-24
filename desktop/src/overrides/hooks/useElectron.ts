/// <reference lib="dom" />

/**
 * Hook to detect if running in Electron
 */
export const useElectron = () => {
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
  return {
    isElectron,
    electronAPI: isElectron ? (window as any).electronAPI : null,
  };
};
