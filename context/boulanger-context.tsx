// context/boulanger-context.tsx
// ─────────────────────────────────────────────────────────────
// Contexte global de l'espace boulanger.
// Auth    → Supabase (email + mot de passe)
// Données → Supabase (persistance) + localStorage (cache offline)
// ─────────────────────────────────────────────────────────────
'use client';

import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { DbJournee, DbStockJournalier } from '@/lib/supabase';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ViewType = 'matin' | 'snapshot' | 'soir' | 'dashboard';

export interface StockEntry {
  id: string;
  name: string;
  emoji: string;
  category: 'boulangerie' | 'viennoiserie' | 'patisserie';
  prixVente: number;
  coutProduction: number;
  production: number;
  snapshot10h: number;
  snapshot14h: number;
  stockFinal: number;
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

export interface BoulangerUser {
  id: string;
  email: string;
  accessToken: string;
}

export interface BoulangerieInfo {
  id: string;
  nom: string;
  slug: string;
  plan: string;
}

// ═══════════════════════════════════════════════════════════════
// Catalogue de référence (mis à jour depuis Airtable si disponible)
// ═══════════════════════════════════════════════════════════════

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

const DEFAULT_PRODUCTION: Record<string, number> = {
  '1': 80, '2': 25, '3': 20, '4': 60, '5': 50,
  '6': 15, '7': 12, '8': 18, '9': 10, '10': 8, '11': 10, '12': 12,
};

function buildTodayStocks(): StockEntry[] {
  return INITIAL_PRODUCTS.map(p => ({
    ...p,
    production: DEFAULT_PRODUCTION[p.id] ?? 10,
    snapshot10h: 0, snapshot14h: 0, stockFinal: 0,
    snapshot10hDone: false, snapshot14hDone: false,
  }));
}

// ── Conversion DB → StockEntry ─────────────────────────────────
function mapDbToStockEntry(db: DbStockJournalier): StockEntry {
  return {
    id:              db.produit_id,
    name:            db.produit_nom,
    emoji:           db.produit_emoji,
    category:        db.categorie as StockEntry['category'],
    prixVente:       db.prix_vente,
    coutProduction:  db.cout_production,
    production:      db.production,
    snapshot10h:     db.snapshot_10h,
    snapshot14h:     db.snapshot_14h,
    stockFinal:      db.stock_final,
    snapshot10hDone: db.snapshot_10h_done,
    snapshot14hDone: db.snapshot_14h_done,
  };
}

// ── Conversion DB → DayData ────────────────────────────────────
function mapDbToDayData(db: DbJournee): DayData {
  return {
    date:            db.date,
    commandesOnline: db.commandes_online,
    chiffreAffaires: db.ca_estime,
    tauxInvendu:     db.taux_invendu,
    stocks:          (db.stocks_journaliers ?? []).map(mapDbToStockEntry),
  };
}

// ═══════════════════════════════════════════════════════════════
// Context Interface
// ═══════════════════════════════════════════════════════════════

interface BoulangerContextType {
  // Auth
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  user: BoulangerUser | null;
  boulangerie: BoulangerieInfo | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;

  // Navigation
  activeView: ViewType;
  setActiveView: (v: ViewType) => void;

  // Stocks du jour
  todayStocks: StockEntry[];
  stocksLoading: boolean;
  updateProduction: (id: string, value: number) => void;
  updateSnapshot: (id: string, value: number, slot: '10h' | '14h') => void;
  validateSnapshot: (slot: '10h' | '14h') => void;
  updateStockFinal: (id: string, value: number) => void;

  // Stats calculées
  revenueToday: number;
  unsoldToday: number;
  unsoldRateToday: number;
  unsoldValueToday: number;
  totalProducedToday: number;

  // Historique
  history: DayData[];
  historyLoading: boolean;
  closeDayAndSave: (commandesOnline: number) => Promise<void>;

  // Commandes
  commandesOnline: number;
  setCommandesOnline: (n: number) => void;

  // Sync state
  syncStatus: 'idle' | 'saving' | 'saved' | 'error';
}

const BoulangerContext = createContext<BoulangerContextType | null>(null);

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════

const LS_TOKEN_KEY   = 'boulanger_access_token';
const LS_STOCKS_KEY  = 'boulanger_stocks_today';
const LS_STOCKS_DATE = 'boulanger_stocks_date';

export function BoulangerProvider({ children }: { children: ReactNode }) {
  // ── Auth ──────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading]         = useState(true);
  const [authError, setAuthError]             = useState<string | null>(null);
  const [user, setUser]                       = useState<BoulangerUser | null>(null);
  const [boulangerie, setBoulangerie]         = useState<BoulangerieInfo | null>(null);

  // ── Vue ───────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ViewType>('matin');

  // ── Stocks ────────────────────────────────────────────────────
  const [todayStocks, setTodayStocks] = useState<StockEntry[]>(buildTodayStocks);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [commandesOnline, setCommandesOnline] = useState(0);

  // ── Historique ────────────────────────────────────────────────
  const [history, setHistory]               = useState<DayData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Sync ──────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Token courant (ref pour éviter les closures stale) ────────
  const tokenRef = useRef<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // Helper : headers auth pour les appels API
  // ─────────────────────────────────────────────────────────────
  const authHeaders = useCallback((): Record<string, string> => {
    const token = tokenRef.current;
    if (!token) return { 'Content-Type': 'application/json' };
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Restauration de session au montage
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function restoreSession() {
      setAuthLoading(true);
      try {
        // 1. Vérifier session Supabase
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          tokenRef.current = session.access_token;
          // 2. Récupérer les infos boulangerie
          const res = await fetch('/api/boulanger/auth', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser({ id: data.user.id, email: data.user.email, accessToken: session.access_token });
            setBoulangerie(data.boulangerie);
            setIsAuthenticated(true);
            // 3. Charger les données du jour
            await loadTodayData(data.boulangerie?.id);
            await loadHistory();
          }
        }
      } catch (err) {
        console.error('[BoulangerContext] Session restore error:', err);
      } finally {
        setAuthLoading(false);
      }
    }
    restoreSession();
  }, []); // eslint-disable-line

  // ─────────────────────────────────────────────────────────────
  // Login
  // ─────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/boulanger/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error ?? 'Connexion échouée');
        return false;
      }

      tokenRef.current = data.access_token;
      setUser({ id: data.user.id, email: data.user.email, accessToken: data.access_token });
      setBoulangerie(data.boulangerie);
      setIsAuthenticated(true);

      // Persiste le token dans Supabase client (refresh automatique)
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      // Charge les données
      await loadTodayData(data.boulangerie?.id);
      await loadHistory();
      return true;
    } catch (err) {
      setAuthError('Erreur de connexion');
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []); // eslint-disable-line

  // ─────────────────────────────────────────────────────────────
  // Logout
  // ─────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    supabase.auth.signOut();
    tokenRef.current = null;
    setUser(null);
    setBoulangerie(null);
    setIsAuthenticated(false);
    setTodayStocks(buildTodayStocks());
    setHistory([]);
    setActiveView('matin');
    localStorage.removeItem(LS_STOCKS_KEY);
    localStorage.removeItem(LS_STOCKS_DATE);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Chargement des données du jour
  // ─────────────────────────────────────────────────────────────
  const loadTodayData = useCallback(async (_boulangerieId?: string) => {
    setStocksLoading(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      const res = await fetch('/api/boulanger/journee', { headers: authHeaders() });
      if (res.ok) {
        const { journee } = await res.json();
        if (journee?.stocks_journaliers?.length > 0) {
          setTodayStocks(journee.stocks_journaliers.map(mapDbToStockEntry));
          setCommandesOnline(journee.commandes_online ?? 0);
          return;
        }
      }
    } catch (err) {
      console.warn('[BoulangerContext] Supabase unavailable, using localStorage');
    }

    // Fallback localStorage
    try {
      const cachedDate = localStorage.getItem(LS_STOCKS_DATE);
      const cached = localStorage.getItem(LS_STOCKS_KEY);
      if (cached && cachedDate === today) {
        setTodayStocks(JSON.parse(cached));
      }
    } catch { /* ignore */ }

    setStocksLoading(false);
  }, [authHeaders]);

  // ─────────────────────────────────────────────────────────────
  // Chargement de l'historique
  // ─────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/boulanger/historique', { headers: authHeaders() });
      if (res.ok) {
        const { historique } = await res.json();
        if (historique) setHistory(historique.map(mapDbToDayData));
      }
    } catch (err) {
      console.warn('[BoulangerContext] Historique unavailable');
    } finally {
      setHistoryLoading(false);
    }
  }, [authHeaders]);

  // ─────────────────────────────────────────────────────────────
  // Sauvegarde automatique (debounce 2 secondes)
  // ─────────────────────────────────────────────────────────────
  const saveToSupabase = useCallback(async (stocks: StockEntry[], cmdOnline: number) => {
    if (!isAuthenticated) return;
    setSyncStatus('saving');
    try {
      const res = await fetch('/api/boulanger/journee', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ stocks, commandesOnline: cmdOnline }),
      });
      setSyncStatus(res.ok ? 'saved' : 'error');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  }, [isAuthenticated, authHeaders]);

  useEffect(() => {
    if (!isAuthenticated || stocksLoading) return;

    // localStorage immédiat
    const today = new Date().toISOString().split('T')[0];
    try {
      localStorage.setItem(LS_STOCKS_KEY, JSON.stringify(todayStocks));
      localStorage.setItem(LS_STOCKS_DATE, today);
    } catch { /* ignore quota errors */ }

    // Supabase avec debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveToSupabase(todayStocks, commandesOnline);
    }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [todayStocks, commandesOnline, isAuthenticated, stocksLoading, saveToSupabase]);

  // ─────────────────────────────────────────────────────────────
  // Mutations stocks
  // ─────────────────────────────────────────────────────────────
  const updateProduction = useCallback((id: string, value: number) => {
    setTodayStocks(prev =>
      prev.map(s => s.id === id ? { ...s, production: Math.max(0, value) } : s)
    );
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
    setTodayStocks(prev =>
      prev.map(s =>
        slot === '10h' ? { ...s, snapshot10hDone: true } : { ...s, snapshot14hDone: true }
      )
    );
  }, []);

  const updateStockFinal = useCallback((id: string, value: number) => {
    setTodayStocks(prev =>
      prev.map(s => s.id === id ? { ...s, stockFinal: Math.max(0, value) } : s)
    );
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Clôture de journée
  // ─────────────────────────────────────────────────────────────
  const closeDayAndSave = useCallback(async (cmdOnline: number) => {
    // 1. Sauvegarde finale des stocks
    await saveToSupabase(todayStocks, cmdOnline);

    // 2. Marque la journée comme clôturée
    await fetch('/api/boulanger/journee', {
      method: 'PUT',
      headers: authHeaders(),
    });

    // 3. Met à jour l'historique local
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
  }, [todayStocks, saveToSupabase, authHeaders]);

  // ─────────────────────────────────────────────────────────────
  // Stats calculées
  // ─────────────────────────────────────────────────────────────
  const totalProducedToday = todayStocks.reduce((s, p) => s + p.production, 0);
  const unsoldToday        = todayStocks.reduce((s, p) => s + p.stockFinal, 0);
  const unsoldRateToday    = totalProducedToday > 0 ? (unsoldToday / totalProducedToday) * 100 : 0;
  const unsoldValueToday   = todayStocks.reduce((s, p) => s + p.stockFinal * p.coutProduction, 0);
  const revenueToday       = todayStocks.reduce((s, p) => s + (p.production - p.stockFinal) * p.prixVente, 0);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <BoulangerContext.Provider value={{
      isAuthenticated, authLoading, authError,
      user, boulangerie,
      login, logout,
      activeView, setActiveView,
      todayStocks, stocksLoading,
      updateProduction, updateSnapshot, validateSnapshot, updateStockFinal,
      revenueToday, unsoldToday, unsoldRateToday, unsoldValueToday, totalProducedToday,
      history, historyLoading, closeDayAndSave,
      commandesOnline, setCommandesOnline,
      syncStatus,
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