import React, { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { AppProvider } from './AppContext';
import { PreloaderProvider } from './PreloaderContext';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <AppProvider>
        <PreloaderProvider>
          {children}
        </PreloaderProvider>
      </AppProvider>
    </AuthProvider>
  );
}

export default Providers;