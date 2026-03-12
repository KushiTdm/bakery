'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ViewType = 'matin' | 'snapshot' | 'soir' | 'dashboard';

export interface StockEntry {
  id: string;
  name: string;
  emoji: string;
  category: 'boulangerie' | 'viennoiserie' | 'patisserie';
  prixVente: number;
  coutProduction: number;
  production: number;      // saisi le matin par le boulanger
  snapshot10h: number;     // stock restant à 10h
  snapshot14h: number;     // stock restant à 14h
  stockFinal: number;      // stock restant à 18h = invendus
  snapshot10hDone: boolean;
  snapshot14hDone: boolean;
}

export interface DayData {
  date: string;
  stocks: StockEntry[];
  commandesOnline: number;
  chiffreAffaires: number;
  tauxInvendu: number;
}

// ─── Produits de référence (catalogue local, prix mis à jour depuis Airtable) ─

export const INITIAL_PRODUCTS: Omit<StockEntry,
  'production' | 'snapshot10h' | 'snapshot14h' | 'stockFinal' | 'snapshot10hDone' | 'snapshot14hDone'
>[] = [
  { id: '1',  name: 'Baguette Tradition',  emoji: '🥖', category: 'boulangerie',  prixVente: 1.30, coutProduction: 0.38 },
  { id: '2',  name: 'Pain au Levain',       emoji: '🍞', category: 'boulangerie',  prixVente: 4.50, coutProduction: 1.20 },
  { id: '3',  name: 'Pain aux Céréales',    emoji: '🌾', category: 'boulangerie',  prixVente: 3.80, coutProduction: 1.05 },
  { id: '4',  name: 'Croissant',            emoji: '🥐', category: 'viennoiserie', prixVente: 1.50, coutProduction: 0.45 },
  { id: '5',  name: 'Pain au Chocolat',     emoji: '🍫', category: 'viennoiserie', prixVente: 1.60, coutProduction: 0.50 },
  { id: '6',  name: 'Brioche Dorée',        emoji: '🫓', category: 'viennoiserie', prixVente: 3.20, coutProduction: 0.95 },
  { id: '7',  name: 'Tarte au Citron',      emoji: '🍋', category: 'patisserie',   prixVente: 4.80, coutProduction: 1.60 },
  { id: '8',  name: 'Éclair au Café',       emoji: '☕', category: 'patisserie',   prixVente: 3.90, coutProduction: 1.20 },
  { id: '9',  name: 'Millefeuille',         emoji: '🎂', category: 'patisserie',   prixVente: 4.50, coutProduction: 1.40 },
  { id: '10', name: 'Tarte aux Fraises',    emoji: '🍓', category: 'patisserie',   prixVente: 5.20, coutProduction: 1.80 },
  { id: '11', name: 'Paris-Brest',          emoji: '🧁', category: 'patisserie',   prixVente: 4.20, coutProduction: 1.35 },
  { id: '12', name: 'Fougasse Provençale',  emoji: '🫒', category: 'boulangerie',  prixVente: 3.50, coutProduction: 1.00 },
];

// Quantités de référence par défaut (le boulanger les ajuste chaque matin)
const DEFAULT_PRODUCTION: Record<string, number> = {
  '1': 80, '2': 25, '3': 20, '4': 60, '5': 50,
  '6': 15, '7': 12, '8': 18, '9': 10, '10': 8, '11': 10, '12': 12,
};

function buildTodayStocks(): StockEntry[] {
  return INITIAL_PRODUCTS.map(p => ({
    ...p,
    production: DEFAULT_PRODUCTION[p.id] ?? 10,
    snapshot10h: 0,
    snapshot14h: 0,
    stockFinal: 0,
    snapshot10hDone: false,
    snapshot14hDone: false,
  }));
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface BoulangerContextType {
  isAuthenticated: boolean;
  authenticate: (pin: string) => boolean;
  logout: () => void;

  activeView: ViewType;
  setActiveView: (v: ViewType) => void;

  todayStocks: StockEntry[];
  updateProduction: (id: string, value: number) => void;
  updateSnapshot: (id: string, value: number, slot: '10h' | '14h') => void;
  validateSnapshot: (slot: '10h' | '14h') => void;
  updateStockFinal: (id: string, value: number) => void;

  // Stats calculées uniquement à partir de données réelles saisies
  revenueToday: number;
  unsoldToday: number;
  unsoldRateToday: number;
  unsoldValueToday: number;
  totalProducedToday: number;

  // Historique réel — vide au départ, alimenté à chaque clôture de journée
  history: DayData[];
  closeDayAndSave: (commandesOnline: number) => void;

  commandesOnline: number;
  setCommandesOnline: (n: number) => void;
}

const BoulangerContext = createContext<BoulangerContextType | null>(null);

const CORRECT_PIN = '1952';

export function BoulangerProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('matin');
  const [todayStocks, setTodayStocks] = useState<StockEntry[]>(buildTodayStocks);
  const [history, setHistory] = useState<DayData[]>([]); // Pas de mock — vide par défaut
  const [commandesOnline, setCommandesOnline] = useState(0);

  const authenticate = useCallback((pin: string) => {
    if (pin === CORRECT_PIN) { setIsAuthenticated(true); return true; }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setActiveView('matin');
  }, []);

  const updateProduction = useCallback((id: string, value: number) => {
    setTodayStocks(prev => prev.map(s => s.id === id ? { ...s, production: Math.max(0, value) } : s));
  }, []);

  const updateSnapshot = useCallback((id: string, value: number, slot: '10h' | '14h') => {
    setTodayStocks(prev => prev.map(s => {
      if (s.id !== id) return s;
      return slot === '10h'
        ? { ...s, snapshot10h: Math.max(0, Math.min(value, s.production)) }
        : { ...s, snapshot14h: Math.max(0, Math.min(value, s.snapshot10h)) };
    }));
  }, []);

  const validateSnapshot = useCallback((slot: '10h' | '14h') => {
    setTodayStocks(prev => prev.map(s =>
      slot === '10h' ? { ...s, snapshot10hDone: true } : { ...s, snapshot14hDone: true }
    ));
  }, []);

  const updateStockFinal = useCallback((id: string, value: number) => {
    setTodayStocks(prev => prev.map(s => s.id === id ? { ...s, stockFinal: Math.max(0, value) } : s));
  }, []);

  // Clôture de journée → sauvegarde dans l'historique réel
  const closeDayAndSave = useCallback((cmdOnline: number) => {
    const today = new Date().toISOString().split('T')[0];
    const ca = todayStocks.reduce((s, p) => s + (p.production - p.stockFinal) * p.prixVente, 0);
    const totalProd = todayStocks.reduce((s, p) => s + p.production, 0);
    const totalInvendu = todayStocks.reduce((s, p) => s + p.stockFinal, 0);
    const dayData: DayData = {
      date: today,
      stocks: todayStocks,
      commandesOnline: cmdOnline,
      chiffreAffaires: ca,
      tauxInvendu: totalProd > 0 ? (totalInvendu / totalProd) * 100 : 0,
    };
    setHistory(prev => {
      const filtered = prev.filter(d => d.date !== today);
      return [...filtered, dayData].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, [todayStocks]);

  // Stats calculées uniquement à partir de ce qui a été saisi
  const totalProducedToday = todayStocks.reduce((s, p) => s + p.production, 0);
  const unsoldToday = todayStocks.reduce((s, p) => s + p.stockFinal, 0);
  const unsoldRateToday = totalProducedToday > 0 ? (unsoldToday / totalProducedToday) * 100 : 0;
  const unsoldValueToday = todayStocks.reduce((s, p) => s + p.stockFinal * p.coutProduction, 0);
  const revenueToday = todayStocks.reduce((s, p) => s + (p.production - p.stockFinal) * p.prixVente, 0);

  return (
    <BoulangerContext.Provider value={{
      isAuthenticated, authenticate, logout,
      activeView, setActiveView,
      todayStocks, updateProduction, updateSnapshot, validateSnapshot, updateStockFinal,
      revenueToday, unsoldToday, unsoldRateToday, unsoldValueToday, totalProducedToday,
      history, closeDayAndSave,
      commandesOnline, setCommandesOnline,
    }}>
      {children}
    </BoulangerContext.Provider>
  );
}

export function useBoulanger() {
  const ctx = useContext(BoulangerContext);
  if (!ctx) throw new Error('useBoulanger must be used within BoulangerProvider');
  return ctx;
}