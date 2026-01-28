import React, { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { AppProvider } from './AppContext';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <AppProvider>
        {children}
      </AppProvider>
    </AuthProvider>
  );
}

export default Providers;