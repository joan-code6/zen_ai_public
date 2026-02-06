import React from "react";
import { useTypedTranslation } from "@/hooks/useTranslation";

interface HeaderProps {
  onSearchClick?: () => void;
}

export default function Header({ onSearchClick }: HeaderProps) {
  const { t } = useTypedTranslation();
  
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-popover">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-sm font-semibold ring-1 ring-border">ZA</div>
        <div>
          <h1 className="text-lg font-semibold">Zen AI</h1>
          <p className="text-sm text-muted-foreground">Calm. Focused. Useful.</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <button 
          onClick={onSearchClick}
          className="hidden md:flex items-center bg-input border border-border rounded-md px-3 py-1 gap-2 cursor-pointer hover:border-border/80 transition-colors"
        >
          <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input
            placeholder={t('sidebar.search')}
            className="bg-transparent outline-none text-sm w-64 pointer-events-none"
            readOnly
          />
        </button>
        <button className="px-3 py-2 rounded-md bg-foreground text-background shadow-sm hover:brightness-95">{t('navigation.newChat')}</button>
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-medium ring-1 ring-border">B</div>
      </div>
    </header>
  );
}
