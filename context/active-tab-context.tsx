'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type ActiveTab = 'vitrine' | 'commander';

interface ActiveTabContextType {
  activeTab:    ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

const ActiveTabContext = createContext<ActiveTabContextType | null>(null);

export function ActiveTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vitrine');

  return (
    <ActiveTabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </ActiveTabContext.Provider>
  );
}

export function useActiveTab() {
  const ctx = useContext(ActiveTabContext);
  if (!ctx) throw new Error('useActiveTab doit être utilisé dans <ActiveTabProvider>');
  return ctx;
}