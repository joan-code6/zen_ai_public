import React, { useEffect, useState } from 'react';
import './CustomTitleBar.css';
import { Minimize2, Maximize2, X, Minus } from 'lucide-react';

const CustomTitleBar: React.FC = () => {
  // Detect whether we are running inside Electron (preload exposes electronAPI)
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // If not in Electron, don't render the titlebar at all (prevents web errors)
  if (!isElectron) return null;

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Query initial state (only available in Electron)
    try {
      (window as any).electronAPI?.isMaximized?.().then((val: boolean) => setIsMaximized(!!val)).catch(() => {});
    } catch (e) {
      // ignore in non-electron environments
    }

    // Subscribe to maximize state changes
    let unsubscribe: (() => void) | undefined;
    try {
      if ((window as any).electronAPI?.onMaximizeChanged) {
        unsubscribe = (window as any).electronAPI.onMaximizeChanged((val: boolean) => {
          setIsMaximized(!!val);
        });
      }
    } catch (e) {
      // ignore
    }

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const onMin = () => (window as any).electronAPI?.minimizeWindow?.();
  const onMax = () => (window as any).electronAPI?.maximizeWindow?.();
  const onClose = () => (window as any).electronAPI?.closeWindow?.();

  return (
    <div className="zen-titlebar">
      <div className="zen-titlebar-left" />

      <div className="zen-titlebar-controls">
        <button className="zen-btn zen-min" onClick={onMin} aria-label="Minimize">
          <Minus size={14} />
        </button>
        <button
          className="zen-btn zen-max"
          onClick={onMax}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button className="zen-btn zen-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default CustomTitleBar;
