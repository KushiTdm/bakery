'use client';

import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, useRef, ReactNode,
} from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { DbJournee, DbStockJournalier } from '@/lib/supabase';
import type {
  ViewType, SyncStatus,
  StockEntry, HistoryEntry, ProductionSuggestion,
  BoulangerRole, PermissionsMap, PermissionKey,
} from '@/lib/types';
import {
  DEFAULT_PERMISSIONS, mergePermissions, permissionSatisfies,
  DUREE_CONSERVATION_PAR_CATEGORIE,
} from '@/lib/types';

export type { ViewType, SyncStatus, StockEntry, HistoryEntry, ProductionSuggestion };

interface Boulangerie {
  id:       string;
  nom:      string;
  slug:     string;
  plan:     'starter' | 'pro' | 'multi' | 'trial';
  actif:    boolean;
  timezone?: string;
  onboarding_completed_at?: string | null;
}

// ── Mapper DB → StockEntry ─────────────────────────────────────
// Inclut maintenant les champs de report inter-journées

function mapDbStockToEntry(s: DbStockJournalier & {
  report_veille?: number;
  est_reporte?:   boolean;
}): StockEntry {
  return {
    id:                      s.produit_id,
    name:                    s.produit_nom,
    emoji:                   s.produit_emoji ?? '🥖',
    category:                (s.categorie ?? 'boulangerie') as StockEntry['category'],
    prixVente:               s.prix_vente,
    coutProduction:          s.cout_production,
    production:              s.production,
    snapshot10h:             s.snapshot_10h_done ? s.snapshot_10h : 0,
    snapshot10hDone:         s.snapshot_10h_done,
    snapshot14h:             s.snapshot_14h_done ? s.snapshot_14h : 0,
    snapshot14hDone:         s.snapshot_14h_done,
    stockFinal:              s.stock_final,
    // ── Report inter-journées ──────────────────────────────
    reportVeille:            s.report_veille ?? 0,
    estReporte:              s.est_reporte ?? false,
    dureeConservationJours:  DUREE_CONSERVATION_PAR_CATEGORIE[s.categorie ?? 'boulangerie'] ?? 1,
  };
}

interface ProduitDb {
  id:                       string;
  nom:                      string;
  emoji:                    string;
  categorie:                'boulangerie' | 'viennoiserie' | 'patisserie' | 'sandwich';
  prix_vente:               number;
  cout_production:          number;
  duree_conservation_jours?: number;
}

function produitToStockEntry(p: ProduitDb): StockEntry {
  return {
    id:                      p.id,
    name:                    p.nom,
    emoji:                   p.emoji ?? '🥖',
    category:                p.categorie,
    prixVente:               p.prix_vente,
    coutProduction:          p.cout_production,
    production:              0,
    snapshot10h:             0,
    snapshot10hDone:         false,
    snapshot14h:             0,
    snapshot14hDone:         false,
    stockFinal:              0,
    reportVeille:            0,
    estReporte:              false,
    dureeConservationJours:  p.duree_conservation_jours
      ?? DUREE_CONSERVATION_PAR_CATEGORIE[p.categorie]
      ?? 1,
  };
}

function mapDbJourneeToHistory(j: DbJournee): HistoryEntry {
  return {
    date:            j.date,
    chiffreAffaires: j.ca_estime ?? 0,
    tauxInvendu:     j.taux_invendu ?? 0,
    commandesOnline: j.commandes_online ?? 0,
    stocks:          (j.stocks_journaliers ?? []).map(s => mapDbStockToEntry(s as Parameters<typeof mapDbStockToEntry>[0])),
  };
}

function computeProductionSuggestions(
  history: HistoryEntry[],
  todayStocks: StockEntry[],
  targetDayOfWeek: number
): ProductionSuggestion[] {
  if (history.length === 0) return todayStocks.map(s => ({
    id: s.id, name: s.name, emoji: s.emoji,
    avgProduction: s.production, suggestedQty: s.production,
    dataPoints: 0, changePercent: 0, confidence: 'low' as const,
  }));

  const sameDayHistory = history.filter(
    d => new Date(d.date + 'T12:00:00').getDay() === targetDayOfWeek
  );

  return todayStocks.map(stock => {
    const relevant    = sameDayHistory.length >= 1 ? sameDayHistory : history;
    const dataPoints  = relevant.length;
    const productions = relevant
      .map(d => d.stocks.find(s => s.id === stock.id)?.production ?? 0)
      .filter(v => v > 0);

    if (productions.length === 0) {
      return {
        id: stock.id, name: stock.name, emoji: stock.emoji,
        avgProduction: stock.production, suggestedQty: stock.production,
        dataPoints: 0, changePercent: 0, confidence: 'low' as const,
      };
    }

    const avg           = productions.reduce((s, v) => s + v, 0) / productions.length;
    const suggestedQty  = Math.max(1, Math.round(avg / 5) * 5);
    const changePercent = stock.production > 0
      ? Math.round(((suggestedQty - stock.production) / stock.production) * 100)
      : 0;
    const confidence: ProductionSuggestion['confidence'] =
      productions.length >= 4 ? 'high' :
      productions.length >= 2 ? 'medium' : 'low';

    return {
      id: stock.id, name: stock.name, emoji: stock.emoji,
      avgProduction: Math.round(avg), suggestedQty,
      dataPoints, changePercent, confidence,
    };
  });
}

// ── Type réponse API journée enrichie ─────────────────────────

interface ReportVeilleInfo {
  quantite:      number;
  joursRestants: number;
  produitNom:    string;
  produitEmoji:  string;
  categorie:     string;
}

interface JourneeApiResponse {
  journee:        DbJournee | null;
  reports_veille: Record<string, ReportVeilleInfo>;
}

interface BoulangerContextType {
  session:             Session | null;
  user:                User | null;
  boulangerie:         Boulangerie | null;
  isAuthenticated:     boolean;
  authLoading:         boolean;
  logout:              () => Promise<void>;
  boulangerieTz:       string;  // Timezone opérationnelle de la boulangerie

  userRole:    BoulangerRole | null;
  memberId:    string | null;
  permissions: PermissionsMap;
  canRead:     (feature: PermissionKey) => boolean;
  canWrite:    (feature: PermissionKey) => boolean;

  activeView:          ViewType;
  setActiveView:       (v: ViewType) => void;
  syncStatus:          SyncStatus;
  todayStocks:         StockEntry[];
  reservedByProduct:   Record<string, number>;  // quantités réservées par produit_nom (C&C actives)
  // ── Pré-commandes pour aujourd'hui ─────────────────────────
  preOrdersByProduct:  Record<string, number>;  // quantités pré-commandées par produit_id
  preOrdersTotal:      number;                  // nombre total de pré-commandes
  preOrdersCA:         number;                  // CA total des pré-commandes
  // ── Report inter-journées ──────────────────────────────────
  reportsVeille:       Record<string, ReportVeilleInfo>;
  updateReportVeille:  (produitId: string, quantite: number) => void;
  updateProduction:    (id: string, val: number) => void;
  updateSnapshot:      (id: string, val: number, slot: '10h' | '14h') => void;
  validateSnapshot:    (slot: '10h' | '14h') => void;
  updateStockFinal:    (id: string, val: number) => void;
  commandesOnline:     number;
  setCommandesOnline:  (n: number) => void;
  revenueToday:        number;
  unsoldToday:         number;
  unsoldValueToday:    number;
  unsoldRateToday:     number;
  totalProducedToday:  number;
  history:             HistoryEntry[];
  closeDayAndSave:     (commandesOnline: number) => Promise<void>;
  productionSuggestions: ProductionSuggestion[];
}

const BoulangerContext = createContext<BoulangerContextType | null>(null);

export function BoulangerProvider({ children }: { children: ReactNode }) {
  const [session, setSession]         = useState<Session | null>(null);
  const [user, setUser]               = useState<User | null>(null);
  const [boulangerie, setBoulangerie] = useState<Boulangerie | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeView, setActiveView]   = useState<ViewType>('matin');
  const [syncStatus, setSyncStatus]   = useState<SyncStatus>('idle');
  const [todayStocks, setTodayStocks] = useState<StockEntry[]>([]);
  const [commandesOnline, _setCommandesOnline] = useState(0);
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  // ── Reports inter-journées disponibles ──────────────────────
  const [reportsVeille, setReportsVeille] = useState<Record<string, ReportVeilleInfo>>({});

  const [boulangerieTz, setBoulangerieTz]   = useState<string>('Europe/Paris');
  const [reservedByProduct, setReservedByProduct] = useState<Record<string, number>>({});
  const [preOrdersByProduct, setPreOrdersByProduct] = useState<Record<string, number>>({});
  const [preOrdersTotal, setPreOrdersTotal] = useState(0);
  const [preOrdersCA, setPreOrdersCA] = useState(0);

  const [userRole, setUserRole]       = useState<BoulangerRole | null>(null);
  const [memberId, setMemberId]       = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionsMap>(DEFAULT_PERMISSIONS.owner);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAbort = useRef<AbortController | null>(null);

  const canRead  = useCallback((feature: PermissionKey) =>
    permissionSatisfies(permissions[feature], 'read'), [permissions]);
  const canWrite = useCallback((feature: PermissionKey) =>
    permissionSatisfies(permissions[feature], 'write'), [permissions]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadAll();
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          loadAll();
        } else {
          resetState();
          setAuthLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function resetState() {
    setBoulangerie(null);
    setBoulangerieTz('Europe/Paris');
    setReservedByProduct({});
    setPreOrdersByProduct({});
    setPreOrdersTotal(0);
    setPreOrdersCA(0);
    setUserRole(null);
    setMemberId(null);
    setPermissions(DEFAULT_PERMISSIONS.owner);
    setTodayStocks([]);
    setHistory([]);
    setReportsVeille({});
    _setCommandesOnline(0);
    setActiveView('matin');
  }

  async function getToken(): Promise<string | null> {
    const { data: { session } }: { data: { session: Session | null } } =
      await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadAll() {
    setAuthLoading(true);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_current_user_access');

      if (!rpcError && rpcData && rpcData.length > 0) {
        const row = rpcData[0];
        setBoulangerie({
          id:    row.boulangerie_id,
          nom:   row.boulangerie_nom,
          slug:  row.boulangerie_slug,
          plan:  row.boulangerie_plan,
          actif: row.boulangerie_actif,
        });
        // Charger le timezone + onboarding de la boulangerie
        const { data: tzRow } = await supabase
          .from('boulangeries')
          .select('timezone, onboarding_completed_at')
          .eq('id', row.boulangerie_id)
          .single();
        const tzData = tzRow as { timezone?: string; onboarding_completed_at?: string | null } | null;
        const tz = tzData?.timezone ?? 'Europe/Paris';
        setBoulangerieTz(tz);
        // Mettre à jour la boulangerie avec onboarding_completed_at
        setBoulangerie(prev => prev ? { ...prev, onboarding_completed_at: tzData?.onboarding_completed_at ?? null } : prev);
        const role = row.user_role as BoulangerRole;
        setUserRole(role);
        setMemberId(row.membre_id ?? null);
        setPermissions(mergePermissions(role, (row.custom_permissions ?? {}) as Partial<PermissionsMap>));
        await Promise.all([loadTodayData(tz), loadHistory()]);
        return;
      }

      // Fallback v1
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { setBoulangerie(null); return; }

      const { data, error } = await supabase
        .from('boulangeries')
        .select('id, nom, slug, plan, actif, timezone, onboarding_completed_at')
        .eq('user_id', currentUser.id)
        .single();

      if (error || !data) { setBoulangerie(null); setUserRole(null); return; }

      const tz = (data as Boulangerie & { timezone?: string }).timezone ?? 'Europe/Paris';
      setBoulangerie(data as Boulangerie);
      setBoulangerieTz(tz);
      setUserRole('owner');
      setMemberId(null);
      setPermissions(DEFAULT_PERMISSIONS.owner);
      await Promise.all([loadTodayData(tz), loadHistory()]);

    } catch (err) {
      console.error('[BoulangerContext]', err);
      setBoulangerie(null);
      setUserRole(null);
    } finally {
      setAuthLoading(false);
    }
  }

  // ── loadTodayData — enrichi avec les reports de J-1 ─────────
  // L'API journee retourne maintenant :
  //   { journee, reports_veille }
  // reports_veille = produits non périssables avec stock_final > 0 hier
  async function loadTodayData(tz: string = 'Europe/Paris') {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { await loadProduitsAsList(token); return; }

      const { journee, reports_veille } = await res.json() as JourneeApiResponse;

      // ── Charger les réservations C&C actives du jour ──────────
      // Permet d'afficher "X réservé(s)" dans le snapshot
      loadTodayReservations(token, tz);
      loadTodayPreOrders(token, tz);

      // Stocker les reports disponibles (pour l'affichage dans vue-matin)
      setReportsVeille(reports_veille ?? {});

      if (journee?.stocks_journaliers?.length) {
        const isClosed = journee.cloturee === true;
        const stocks = (journee.stocks_journaliers as (DbStockJournalier & {
          report_veille?: number;
          est_reporte?:   boolean;
        })[]).map(s => {
          const entry = mapDbStockToEntry(s);
          if (!isClosed) entry.stockFinal = 0;
          return entry;
        });

        // ── Merge : synchroniser avec le catalogue actif ─────────────
        // 1. Ajouter les produits du catalogue absents de la journée
        //    (ex: roll-over a créé la journée avec seulement les reportés)
        // 2. Retirer les produits supprimés du catalogue (soft-delete)
        const existingIds = new Set(stocks.map(s => s.id));
        try {
          const prodRes = await fetch('/api/boulanger/produits', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (prodRes.ok) {
            const { produits } = await prodRes.json() as { produits: ProduitDb[] };
            if (produits?.length) {
              const activeIds = new Set(produits.map(p => p.id));
              // Ajouter les produits manquants
              for (const p of produits) {
                if (!existingIds.has(p.id)) {
                  stocks.push(produitToStockEntry(p));
                }
              }
              // Retirer les produits supprimés du catalogue
              const filtered = stocks.filter(s => activeIds.has(s.id));
              stocks.length = 0;
              stocks.push(...filtered);
            }
          }
        } catch (mergeErr) {
          console.warn('[BoulangerContext] merge produits:', mergeErr);
        }

        setTodayStocks(stocks);
        _setCommandesOnline(journee.commandes_online ?? 0);
      } else {
        // Pas de journée aujourd'hui → charger les produits
        // et pré-remplir les reports de J-1 si disponibles
        await loadProduitsAsList(token, reports_veille ?? {});
      }
    } catch (err) {
      console.warn('[BoulangerContext] loadTodayData:', err);
    }
  }

  // ── loadTodayReservations — quantités C&C réservées par produit ─
  // Utilisé par vue-snapshot pour afficher les réservations en cours.
  // Non bloquant (fire-and-forget via appel indépendant).
  async function loadTodayReservations(token: string, tz: string) {
    try {
      const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
      const res = await fetch(`/api/boulanger/commandes?date=${todayLocal}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const { commandes } = await res.json() as { commandes: Array<{ statut: string; lignes: Array<{ produit_nom: string; quantite: number }> }> };
      const reserved: Record<string, number> = {};
      for (const c of commandes ?? []) {
        if (!['en_attente', 'confirmee', 'prete'].includes(c.statut)) continue;
        for (const l of c.lignes ?? []) {
          reserved[l.produit_nom] = (reserved[l.produit_nom] ?? 0) + l.quantite;
        }
      }
      setReservedByProduct(reserved);
    } catch (err) {
      console.warn('[BoulangerContext] loadTodayReservations:', err);
    }
  }

  // ── loadTodayPreOrders — pré-commandes pour aujourd'hui ─────
  async function loadTodayPreOrders(token: string, tz: string) {
    try {
      const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
      const res = await fetch(`/api/boulanger/precommandes?date=${todayLocal}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json() as {
        par_produit: Array<{ produit_id: string; produit_nom: string; quantite: number }>;
        total_commandes: number;
        total_ca: number;
      };
      const byProduct: Record<string, number> = {};
      for (const p of data.par_produit ?? []) {
        if (p.produit_id) byProduct[p.produit_id] = p.quantite;
      }
      setPreOrdersByProduct(byProduct);
      setPreOrdersTotal(data.total_commandes);
      setPreOrdersCA(data.total_ca);
    } catch (err) {
      console.warn('[BoulangerContext] loadTodayPreOrders:', err);
    }
  }

  // ── loadProduitsAsList — pré-remplit les reports de J-1 ─────
  async function loadProduitsAsList(
    token: string,
    reports: Record<string, ReportVeilleInfo> = {}
  ) {
    try {
      const res = await fetch('/api/boulanger/produits', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const { produits } = await res.json() as { produits: ProduitDb[] };
      if (!produits?.length) return;

      const stocks = produits.map(p => {
        const entry = produitToStockEntry(p);
        // Pré-remplir le report de J-1 si disponible pour ce produit
        const report = reports[p.id];
        if (report) {
          entry.reportVeille = report.quantite;
          entry.estReporte   = true;
          // Pré-remplir la production avec le report (modifiable par le boulanger)
          entry.production   = report.quantite;
        }
        return entry;
      });

      setTodayStocks(stocks);
    } catch (err) {
      console.warn('[BoulangerContext] loadProduitsAsList:', err);
    }
  }

  async function loadHistory() {
    try {
      const token = await getToken();
      if (!token) return;

      // Page 1 : 14 jours les plus récents
      const res1 = await fetch('/api/boulanger/historique', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res1.ok) return;
      const page1 = await res1.json() as { historique: DbJournee[]; next_cursor: string | null };
      const rows: DbJournee[] = [...(page1.historique ?? [])];

      // Page 2 : 14 jours suivants (si disponible) — atteint ~28 jours au total
      if (page1.next_cursor) {
        const res2 = await fetch(`/api/boulanger/historique?before=${page1.next_cursor}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res2.ok) {
          const page2 = await res2.json() as { historique: DbJournee[] };
          rows.unshift(...(page2.historique ?? []));
        }
      }

      if (rows.length) setHistory(rows.map(mapDbJourneeToHistory));
    } catch (err) {
      console.warn('[BoulangerContext] loadHistory:', err);
    }
  }

  const triggerSave = useCallback((stocks: StockEntry[], online: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Annuler tout save en-cours pour éviter qu'une réponse tardive écrase la valeur récente
    saveAbort.current?.abort();
    setSyncStatus('saving');
    saveTimer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      saveAbort.current = ctrl;
      try {
        const token = await getToken();
        if (!token) { setSyncStatus('error'); return; }
        const res = await fetch('/api/boulanger/journee', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ stocks, commandesOnline: online }),
          signal: ctrl.signal,
        });
        setSyncStatus(res.ok ? 'saved' : 'error');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return; // save annulé, ignorer
        setSyncStatus('error');
      }
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── updateReportVeille — le boulanger ajuste le report ──────
  // Appelé depuis vue-matin quand il valide/modifie la quantité reportée
  const updateReportVeille = useCallback((produitId: string, quantite: number) => {
    setTodayStocks(prev => {
      const next = prev.map(p => {
        if (p.id !== produitId) return p;
        const qte = Math.max(0, Math.floor(quantite));
        return {
          ...p,
          reportVeille: qte,
          estReporte:   qte > 0,
          // Ajuster la "production" du jour : produit frais = production, report séparé
          // La production reste ce que le boulanger a sorti du four aujourd'hui
        };
      });
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const updateProduction = useCallback((id: string, val: number) => {
    setTodayStocks(prev => {
      const next = prev.map(p => p.id === id ? { ...p, production: Math.max(0, val) } : p);
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const updateSnapshot = useCallback((id: string, val: number, slot: '10h' | '14h') => {
    setTodayStocks(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        if (slot === '10h') {
          // Le snapshot inclut les produits reportés (ils sont sur l'étagère)
          const maxSnap = p.production + (p.reportVeille ?? 0);
          return { ...p, snapshot10h: Math.max(0, Math.min(val, maxSnap)) };
        } else {
          const max14h = p.snapshot10hDone ? p.snapshot10h : p.production + (p.reportVeille ?? 0);
          return { ...p, snapshot14h: Math.max(0, Math.min(val, max14h)) };
        }
      });
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const validateSnapshot = useCallback((slot: '10h' | '14h') => {
    setTodayStocks(prev => {
      const next = prev.map(p =>
        slot === '10h' ? { ...p, snapshot10hDone: true } : { ...p, snapshot14hDone: true }
      );
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const updateStockFinal = useCallback((id: string, val: number) => {
    setTodayStocks(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        const totalDispo = p.production + (p.reportVeille ?? 0);
        const maxFinal = p.snapshot14hDone && p.snapshot14h > 0
          ? p.snapshot14h
          : p.snapshot10hDone && p.snapshot10h > 0
            ? p.snapshot10h
            : totalDispo;
        return { ...p, stockFinal: Math.max(0, Math.min(val, maxFinal)) };
      });
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const setCommandesOnline = useCallback((n: number) => {
    _setCommandesOnline(n);
    triggerSave(todayStocks, n);
  }, [todayStocks, triggerSave]);

  const closeDayAndSave = useCallback(async (online: number) => {
    setSyncStatus('saving');
    try {
      const token = await getToken();
      if (!token) { setSyncStatus('error'); return; }
      await fetch('/api/boulanger/journee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stocks: todayStocks, commandesOnline: online }),
      });
      await fetch('/api/boulanger/journee', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 3000);
      await loadHistory();
    } catch {
      setSyncStatus('error');
    }
  }, [todayStocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'global' });
    resetState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── KPIs — prennent en compte les produits reportés ──────────
  // totalProducedToday = production fraîche seulement
  // Le taux d'invendu est calculé sur le total disponible (production + report)
  const totalProducedToday = useMemo(() => todayStocks.reduce((s, p) => s + p.production, 0), [todayStocks]);
  const totalReporteToday  = useMemo(() => todayStocks.reduce((s, p) => s + (p.reportVeille ?? 0), 0), [todayStocks]);
  const totalDisponible    = useMemo(() => totalProducedToday + totalReporteToday, [totalProducedToday, totalReporteToday]);
  const unsoldToday        = useMemo(() => todayStocks.reduce((s, p) => s + p.stockFinal, 0), [todayStocks]);
  const unsoldValueToday   = useMemo(() => todayStocks.reduce((s, p) => s + p.stockFinal * p.coutProduction, 0), [todayStocks]);
  const revenueToday       = useMemo(() => todayStocks.reduce((s, p) => s + (p.production + (p.reportVeille ?? 0) - p.stockFinal) * p.prixVente, 0), [todayStocks]);
  const unsoldRateToday    = useMemo(() => totalDisponible > 0 ? (unsoldToday / totalDisponible) * 100 : 0, [unsoldToday, totalDisponible]);
  const productionSuggestions = useMemo(
    () => computeProductionSuggestions(history, todayStocks, new Date().getDay()),
    [history, todayStocks]
  );

  return (
    <BoulangerContext.Provider value={{
      session, user, boulangerie,
      isAuthenticated: !!session,
      authLoading, logout,
      boulangerieTz,
      userRole, memberId, permissions, canRead, canWrite,
      activeView, setActiveView,
      syncStatus,
      todayStocks,
      reservedByProduct,
      preOrdersByProduct, preOrdersTotal, preOrdersCA,
      reportsVeille,
      updateReportVeille,
      updateProduction, updateSnapshot, validateSnapshot, updateStockFinal,
      commandesOnline, setCommandesOnline,
      revenueToday, unsoldToday, unsoldValueToday, unsoldRateToday, totalProducedToday,
      history,
      closeDayAndSave,
      productionSuggestions,
    }}>
      {children}
    </BoulangerContext.Provider>
  );
}

export function useBoulanger() {
  const ctx = useContext(BoulangerContext);
  if (!ctx) throw new Error('useBoulanger doit être utilisé dans <BoulangerProvider>');
  return ctx;
}