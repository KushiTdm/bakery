'use client';
// components/boulanger/vue-flash.tsx
// Onglet Flash — persistance complète via /api/boulanger/flash
// Le boulanger sélectionne les produits → sauvegardés en base → visibles côté client

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Plus, Minus, Check, ChevronRight,
  Sparkles, Clock, Package, Info,
  Loader2, RefreshCw, CloudOff, Cloud, AlertCircle,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────

interface PanierFlashRow {
  id:                string;
  produit_id:        string;
  produit_nom:       string;
  produit_emoji:     string;
  categorie:         'boulangerie' | 'viennoiserie' | 'patisserie';
  prix_original:     number;
  remise_pct:        number;
  prix_flash:        number;
  quantite_initiale: number;
  quantite_restante: number;
  allergenes:        string[];
  actif:             boolean;
}

// Vue locale enrichie depuis todayStocks
interface ProduitLocal {
  id:               string;
  name:             string;
  emoji:            string;
  category:         'boulangerie' | 'viennoiserie' | 'patisserie';
  prixVente:        number;
  stockEstime:      number;   // snapshot14h > snapshot10h > production
  stockFinal:       number;   // déclaré dans vue soir
  selected:         boolean;
  quantiteFlash:    number;   // quantité mise en flash (= stockFinal ou stockEstime)
  allergenes:       string[];
  savedInDb:        boolean;  // présent dans paniers_flash aujourd'hui
}

type SyncState = 'idle' | 'saving' | 'saved' | 'error';

// ── Helpers ───────────────────────────────────────────────────

function calcFlash(prix: number, remise: number) {
  return Math.round(prix * (1 - remise / 100) * 100) / 100;
}

function buildSuggestions(produits: ProduitLocal[], remise: number) {
  const sel = produits.filter(p => p.selected && p.quantiteFlash > 0);
  if (sel.length < 2) return [];

  const suggestions = [];

  if (sel.length >= 2) {
    const items = sel.slice(0, 2);
    const total = items.reduce((s, p) => s + p.prixVente, 0);
    suggestions.push({
      id: 'decouverte', label: 'Panier Découverte', emoji: '🌅',
      desc: '2 produits — idéal pour les curieux',
      produits: items, total: Math.round(total * 100) / 100,
      flash: Math.round(total * (1 - remise / 100) * 100) / 100,
    });
  }
  if (sel.length >= 3) {
    const items = sel.slice(0, Math.min(4, sel.length));
    const total = items.reduce((s, p) => s + p.prixVente, 0);
    suggestions.push({
      id: 'gourmand', label: 'Panier Gourmand', emoji: '🧺',
      desc: `${items.length} produits — le best-seller`,
      produits: items, total: Math.round(total * 100) / 100,
      flash: Math.round(total * (1 - remise / 100) * 100) / 100,
    });
  }
  if (sel.length >= 4) {
    const total = sel.reduce((s, p) => s + p.prixVente, 0);
    suggestions.push({
      id: 'grand', label: 'Grand Panier Anti-Gaspi', emoji: '🎁',
      desc: 'Tout l\'invendu — zéro gaspi',
      produits: sel, total: Math.round(total * 100) / 100,
      flash: Math.round(total * (1 - remise / 100) * 100) / 100,
    });
  }
  return suggestions;
}

// ── Composant principal ───────────────────────────────────────

export default function VueFlash() {
  const { todayStocks, authLoading } = useBoulanger();

  const [remise,      setRemise]      = useState(40);
  const [heureDebut,  setHeureDebut]  = useState(18);
  const [heureFin,    setHeureFin]    = useState(20);
  const [activeTab,   setActiveTab]   = useState<'stock' | 'paniers' | 'config'>('stock');
  const [produits,    setProduits]    = useState<ProduitLocal[]>([]);
  const [token,       setToken]       = useState<string | null>(null);
  const [syncState,   setSyncState]   = useState<SyncState>('idle');
  const [loadingInit, setLoadingInit] = useState(true);
  const [flashActif,  setFlashActif]  = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');  // JSON des dernières données sauvegardées

  // ── Chargement initial : config + paniers persistés ───────────

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const t = data.session?.access_token ?? null;
      setToken(t);
      if (!t) { setLoadingInit(false); return; }

      try {
        const res = await fetch('/api/boulanger/flash', {
          headers: { Authorization: `Bearer ${t}` },
          cache: 'no-store',
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json() as {
          paniers: PanierFlashRow[];
          config: { remise_pct: number; heure_debut: number; heure_fin: number };
        };

        setRemise(json.config.remise_pct ?? 40);
        setHeureDebut(json.config.heure_debut ?? 18);
        setHeureFin(json.config.heure_fin ?? 20);

        // Marquer les produits déjà en flash
        const flashIds = new Set(json.paniers.map(p => p.produit_id));
        const flashMap = new Map(json.paniers.map(p => [p.produit_id, p]));

        // Construit la liste depuis todayStocks (au moment du chargement)
        buildProduitsList(flashIds, flashMap, json.config.remise_pct ?? 40);
        setFlashActif(json.paniers.some(p => p.actif));

      } catch (err) {
        console.warn('[VueFlash] chargement initial:', err);
        setError('Impossible de charger les paniers flash.');
      } finally {
        setLoadingInit(false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconstruit la liste locale quand todayStocks change ──────

  const buildProduitsList = useCallback((
    flashIds: Set<string>,
    flashMap: Map<string, PanierFlashRow>,
    remisePct: number,
  ) => {
    setProduits(
      todayStocks
        .filter(s => s.production > 0)
        .map(s => {
          const stockEstime = s.snapshot14hDone && s.snapshot14h > 0
            ? s.snapshot14h
            : s.snapshot10hDone && s.snapshot10h > 0
              ? s.snapshot10h
              : s.production;

          const existing = flashMap.get(s.id);
          return {
            id:            s.id,
            name:          s.name,
            emoji:         s.emoji,
            category:      s.category,
            prixVente:     s.prixVente,
            stockEstime,
            stockFinal:    s.stockFinal,
            selected:      flashIds.has(s.id),
            quantiteFlash: existing?.quantite_restante ?? (s.stockFinal > 0 ? s.stockFinal : stockEstime),
            allergenes:    [],           // TODO: charger depuis produits si besoin
            savedInDb:     flashIds.has(s.id),
          } satisfies ProduitLocal;
        })
    );
  }, [todayStocks]);

  // Resync local quand todayStocks change (sans perdre les sélections)
  useEffect(() => {
    if (loadingInit) return;
    setProduits(prev => {
      const prevMap = new Map(prev.map(p => [p.id, p]));
      return todayStocks
        .filter(s => s.production > 0)
        .map(s => {
          const existing = prevMap.get(s.id);
          const stockEstime = s.snapshot14hDone && s.snapshot14h > 0
            ? s.snapshot14h
            : s.snapshot10hDone && s.snapshot10h > 0
              ? s.snapshot10h
              : s.production;
          return {
            id:            s.id,
            name:          s.name,
            emoji:         s.emoji,
            category:      s.category,
            prixVente:     s.prixVente,
            stockEstime,
            stockFinal:    s.stockFinal,
            selected:      existing?.selected ?? false,
            quantiteFlash: existing?.quantiteFlash ?? (s.stockFinal > 0 ? s.stockFinal : stockEstime),
            allergenes:    existing?.allergenes ?? [],
            savedInDb:     existing?.savedInDb ?? false,
          } satisfies ProduitLocal;
        });
    });
  }, [todayStocks, loadingInit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sauvegarde automatique (debounce 800ms) ────────────────────

  const triggerSave = useCallback((produitsList: ProduitLocal[], remisePct: number) => {
    if (!token) return;

    const selected = produitsList.filter(p => p.selected);
    const payload = JSON.stringify({ produits: selected.map(p => p.id), remise: remisePct });
    if (payload === lastSavedRef.current) return;  // rien changé

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncState('saving');

    saveTimer.current = setTimeout(async () => {
      try {
        const paniers = selected.map(p => ({
          produit_id:        p.id,
          produit_nom:       p.name,
          produit_emoji:     p.emoji,
          categorie:         p.category,
          prix_original:     p.prixVente,
          remise_pct:        remisePct,
          prix_flash:        calcFlash(p.prixVente, remisePct),
          quantite_initiale: p.quantiteFlash,
          quantite_restante: p.quantiteFlash,
          allergenes:        p.allergenes,
          actif:             true,
        }));

        const res = await fetch('/api/boulanger/flash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ paniers }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        lastSavedRef.current = payload;
        setSyncState('saved');
        setProduits(prev => prev.map(p => ({ ...p, savedInDb: p.selected })));
        setFlashActif(selected.length > 0);
        setTimeout(() => setSyncState('idle'), 3000);

      } catch (err) {
        console.error('[VueFlash] save:', err);
        setSyncState('error');
      }
    }, 800);
  }, [token]);

  // ── Patch partiel : quantité restante en temps réel ───────────

  const patchQuantite = useCallback(async (produitId: string, quantite: number) => {
    if (!token) return;
    try {
      await fetch('/api/boulanger/flash', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ produit_id: produitId, quantite_restante: quantite }),
      });
    } catch (err) {
      console.warn('[VueFlash] patch quantité:', err);
    }
  }, [token]);

  // ── Actions UI ────────────────────────────────────────────────

  const toggleProduit = useCallback((id: string) => {
    setProduits(prev => {
      const next = prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p);
      triggerSave(next, remise);
      return next;
    });
  }, [remise, triggerSave]);

  const adjustQuantite = useCallback((id: string, delta: number) => {
    setProduits(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        const nq = Math.max(0, p.quantiteFlash + delta);
        return { ...p, quantiteFlash: nq };
      });
      triggerSave(next, remise);

      // Patch immédiat en base pour la quantité (visible côté client rapidement)
      const updated = next.find(p => p.id === id);
      if (updated?.savedInDb) {
        patchQuantite(id, updated.quantiteFlash);
      }
      return next;
    });
  }, [remise, triggerSave, patchQuantite]);

  const saveConfig = useCallback(async () => {
    if (!token) return;
    setSavingConfig(true);
    try {
      await fetch('/api/boulanger/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          flash_remise_pct:  remise,
          flash_heure_debut: heureDebut,
          flash_heure_fin:   heureFin,
        }),
      });
      // Re-sauvegarder les paniers avec la nouvelle remise
      triggerSave(produits, remise);
    } finally {
      setSavingConfig(false);
    }
  }, [token, remise, heureDebut, heureFin, produits, triggerSave]);

  const desactiverFlash = useCallback(async () => {
    if (!token) return;
    setSyncState('saving');
    try {
      await fetch('/api/boulanger/flash', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setProduits(prev => prev.map(p => ({ ...p, selected: false, savedInDb: false })));
      setFlashActif(false);
      lastSavedRef.current = '';
      setSyncState('saved');
      setTimeout(() => setSyncState('idle'), 2000);
    } catch {
      setSyncState('error');
    }
  }, [token]);

  // ── Données dérivées ──────────────────────────────────────────

  const selected      = produits.filter(p => p.selected && p.quantiteFlash > 0);
  const hasStock      = produits.some(p => p.quantiteFlash > 0 || p.stockEstime > 0);
  const suggestions   = buildSuggestions(produits, remise);
  const heureCourante = new Date().getHours();
  const dansFenetre   = heureCourante >= heureDebut && heureCourante < heureFin;

  // ── Guards ────────────────────────────────────────────────────

  if (authLoading || loadingInit) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="pt-2 flex items-start justify-between">
        <div>
          <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">
            Flash invendus
          </p>
          <h1 className="text-white text-2xl font-bold mt-1" style={{ fontFamily: 'Playfair Display, serif' }}>
            Paniers Anti-Gaspi
          </h1>
        </div>

        {/* Indicateur sync */}
        <div className="flex items-center gap-1.5 mt-2">
          {syncState === 'saving' && <><Loader2 size={12} className="text-[#C19A6B]/60 animate-spin" /><span className="text-[10px] text-[#C19A6B]/60">Sync…</span></>}
          {syncState === 'saved'  && <><Check size={12} className="text-green-400" /><span className="text-[10px] text-green-400">Sauvegardé</span></>}
          {syncState === 'error'  && <><CloudOff size={12} className="text-red-400" /><span className="text-[10px] text-red-400">Erreur sync</span></>}
          {syncState === 'idle' && selected.length > 0 && <><Cloud size={12} className="text-white/20" /><span className="text-[10px] text-white/20">{selected.length} en flash</span></>}
        </div>
      </div>

      {/* ── Erreur ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {/* ── Bandeau flash actif ───────────────────────────────── */}
      <AnimatePresence>
        {flashActif && selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="relative rounded-2xl overflow-hidden border border-yellow-400/25 bg-yellow-400/8">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
              <div className="relative flex items-center gap-3 px-4 py-3">
                <motion.div
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  className="bg-yellow-400 rounded-xl p-2 flex-shrink-0"
                >
                  <Zap size={14} className="text-[#2C1810] fill-current" />
                </motion.div>
                <div className="flex-1">
                  <p className="text-yellow-300 font-semibold text-sm">
                    Flash actif — {selected.length} produit{selected.length > 1 ? 's' : ''} en ligne
                  </p>
                  <p className="text-yellow-300/60 text-xs">
                    {dansFenetre
                      ? `Dans la fenêtre horaire · ${heureDebut}h–${heureFin}h`
                      : `Hors fenêtre horaire (${heureDebut}h–${heureFin}h) — visible dès ${heureDebut}h`
                    }
                  </p>
                </div>
                <button
                  onClick={desactiverFlash}
                  className="bg-red-500/20 border border-red-500/30 text-red-400 text-xs px-3 py-1.5 rounded-xl hover:bg-red-500/30 transition-colors flex-shrink-0"
                >
                  Désactiver
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Info hors fenêtre ─────────────────────────────────── */}
      {!dansFenetre && (
        <div className="flex items-start gap-3 bg-white/4 border border-white/8 rounded-2xl px-4 py-3">
          <Clock size={13} className="text-white/25 flex-shrink-0 mt-0.5" />
          <p className="text-white/35 text-xs leading-relaxed">
            Flash programmé de <strong className="text-white/55">{heureDebut}h</strong> à <strong className="text-white/55">{heureFin}h</strong>.
            {selected.length > 0
              ? ' Vos paniers sont prêts — ils s\'activeront automatiquement.'
              : ' Préparez vos paniers maintenant.'
            }
          </p>
        </div>
      )}

      {/* ── Onglets ───────────────────────────────────────────── */}
      <div className="flex gap-1.5 p-1 bg-white/5 border border-white/8 rounded-2xl">
        {([
          { id: 'stock',   label: 'Stock',   icon: Package  },
          { id: 'paniers', label: 'Paniers', icon: Sparkles },
          { id: 'config',  label: 'Remise',  icon: Zap      },
        ] as const).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all touch-manipulation ${
                isActive
                  ? 'bg-[#C19A6B]/20 text-[#C19A6B] border border-[#C19A6B]/30'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} />
              {tab.label}
            </motion.button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB : STOCK
          ════════════════════════════════════════════════════════ */}
      {activeTab === 'stock' && (
        <div className="space-y-2.5">

          {!hasStock ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <span className="text-4xl block mb-4">📭</span>
              <p className="text-white/50 font-medium text-sm">Aucun stock disponible</p>
              <p className="text-white/25 text-xs mt-1">
                Saisissez la production dans <span className="text-[#C19A6B]">Matin</span>,
                puis les restes dans <span className="text-[#C19A6B]">Soir</span>.
              </p>
            </div>
          ) : (
            <>
              <p className="text-white/35 text-xs px-1 pb-0.5">
                Cochez les produits à mettre en flash. Ajustez la quantité restante.
              </p>

              {produits.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.035 }}
                  className={`rounded-2xl border overflow-hidden transition-all ${
                    p.selected
                      ? 'bg-[#C19A6B]/8 border-[#C19A6B]/25'
                      : 'bg-white/4 border-white/8'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 cursor-pointer touch-manipulation"
                    onClick={() => toggleProduit(p.id)}
                  >
                    {/* Checkbox */}
                    <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center transition-all ${
                      p.selected ? 'bg-[#C19A6B]' : 'border-2 border-white/20'
                    }`}>
                      {p.selected && <Check size={12} className="text-[#1A0F0A]" />}
                    </div>

                    <span className="text-xl flex-shrink-0 leading-none">{p.emoji}</span>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${p.selected ? 'text-white' : 'text-white/50'}`}>
                        {p.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-white/25 text-xs line-through font-mono">{p.prixVente.toFixed(2)}€</span>
                        <span className="text-[#C19A6B]/80 text-xs font-semibold font-mono">
                          {calcFlash(p.prixVente, remise).toFixed(2)}€
                        </span>
                        <span className="text-white/15 text-xs">·</span>
                        <span className="text-white/25 text-xs capitalize">{p.category}</span>
                      </div>
                    </div>

                    {/* Quantité */}
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onPointerDown={() => adjustQuantite(p.id, -1)}
                        disabled={p.quantiteFlash <= 0}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all touch-manipulation ${
                          p.quantiteFlash <= 0
                            ? 'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed'
                            : 'bg-white/10 border border-white/12 hover:bg-white/18'
                        }`}
                      >
                        <Minus size={13} className="text-white" />
                      </motion.button>

                      <motion.span
                        key={p.quantiteFlash}
                        initial={{ scale: 1.2 }}
                        animate={{ scale: 1 }}
                        className={`w-8 text-center text-base font-bold font-mono tabular-nums ${
                          p.selected ? 'text-[#C19A6B]' : 'text-white/35'
                        }`}
                      >
                        {p.quantiteFlash}
                      </motion.span>

                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onPointerDown={() => adjustQuantite(p.id, 1)}
                        className="w-8 h-8 rounded-lg bg-[#C19A6B]/18 border border-[#C19A6B]/28 flex items-center justify-center hover:bg-[#C19A6B]/28 touch-manipulation"
                      >
                        <Plus size={13} className="text-[#C19A6B]" />
                      </motion.button>
                    </div>
                  </div>

                  {/* Badge "en base" */}
                  {p.savedInDb && p.selected && (
                    <div className="px-4 pb-2.5 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-green-400/60 text-[10px]">Visible côté client</span>
                    </div>
                  )}
                </motion.div>
              ))}

              {/* CTA activer */}
              {selected.length > 0 && !flashActif && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2"
                >
                  <div className="flex items-center gap-2 bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-2xl px-4 py-3">
                    <Check size={14} className="text-[#C19A6B] flex-shrink-0" />
                    <p className="text-[#C19A6B]/80 text-xs">
                      <strong className="text-[#C19A6B]">{selected.length} produit{selected.length > 1 ? 's' : ''}</strong> sélectionné{selected.length > 1 ? 's' : ''} — sauvegardé automatiquement.
                      {dansFenetre ? ' Visible côté client maintenant.' : ` Visible à ${heureDebut}h.`}
                    </p>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB : PANIERS (suggestions)
          ════════════════════════════════════════════════════════ */}
      {activeTab === 'paniers' && (
        <div className="space-y-3">

          {selected.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <span className="text-4xl block mb-4">🧺</span>
              <p className="text-white/50 font-medium text-sm">
                {produits.length === 0 ? 'Aucun produit disponible' : 'Sélectionnez au moins 2 produits'}
              </p>
              <p className="text-white/25 text-xs mt-1">
                Allez dans l'onglet <span className="text-[#C19A6B]">Stock</span> pour cocher des produits.
              </p>
            </div>
          ) : (
            <>
              <p className="text-white/35 text-xs px-1">
                Suggestions basées sur vos <strong className="text-white/55">{selected.length} produits</strong> sélectionnés.
              </p>

              {suggestions.map((sug, i) => (
                <motion.div
                  key={sug.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="rounded-2xl border bg-white/4 border-white/8"
                >
                  <div className="px-4 py-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{sug.emoji}</span>
                        <div>
                          <p className="text-white font-semibold text-sm">{sug.label}</p>
                          <p className="text-white/35 text-xs">{sug.desc}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[#C19A6B] font-bold text-base font-mono">{sug.flash.toFixed(2)}€</p>
                        <p className="text-white/25 text-xs line-through">{sug.total.toFixed(2)}€</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 mb-3">
                      {sug.produits.map(p => (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="text-sm flex-shrink-0">{p.emoji}</span>
                          <span className="text-white/60 text-xs flex-1 truncate">{p.name}</span>
                          <span className="text-white/25 text-xs">{p.quantiteFlash} restant{p.quantiteFlash > 1 ? 's' : ''}</span>
                          <span className="text-[#C19A6B]/60 text-xs font-mono">{calcFlash(p.prixVente, remise).toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-1.5">
                        <span className="text-green-400 text-xs font-medium">
                          Client économise {(sug.total - sug.flash).toFixed(2)}€ (−{remise}%)
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-white/20" />
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Composition libre */}
              <div className="bg-white/3 border border-white/6 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                  <Package size={13} className="text-white/35" />
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Ajustement manuel des quantités</p>
                </div>
                <div className="divide-y divide-white/4">
                  {selected.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-lg flex-shrink-0">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/70 text-sm truncate">{p.name}</p>
                        <p className="text-white/30 text-xs">
                          <span className="text-[#C19A6B]/70 font-mono">{calcFlash(p.prixVente, remise).toFixed(2)}€</span> flash
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <motion.button whileTap={{ scale: 0.85 }}
                          onPointerDown={() => adjustQuantite(p.id, -1)}
                          disabled={p.quantiteFlash <= 0}
                          className="w-8 h-8 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center disabled:opacity-30"
                        >
                          <Minus size={12} className="text-white" />
                        </motion.button>
                        <span className="w-7 text-center text-sm font-bold font-mono text-[#C19A6B] tabular-nums">{p.quantiteFlash}</span>
                        <motion.button whileTap={{ scale: 0.85 }}
                          onPointerDown={() => adjustQuantite(p.id, 1)}
                          className="w-8 h-8 rounded-lg bg-[#C19A6B]/15 border border-[#C19A6B]/25 flex items-center justify-center"
                        >
                          <Plus size={12} className="text-[#C19A6B]" />
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB : CONFIG
          ════════════════════════════════════════════════════════ */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/8 rounded-2xl p-5 space-y-5">

            {/* Remise */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/50 text-xs uppercase tracking-wider font-semibold">Remise flash</p>
                <span className="text-yellow-400 font-bold font-mono text-base">−{remise}%</span>
              </div>
              <input
                type="range" min={10} max={70} step={5} value={remise}
                onChange={e => setRemise(parseInt(e.target.value))}
                className="w-full accent-yellow-400"
              />
              <div className="flex justify-between text-white/20 text-[10px] mt-1 px-0.5">
                <span>−10%</span><span>Recommandé : 30–50%</span><span>−70%</span>
              </div>
            </div>

            {/* Horaires */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/50 text-xs uppercase tracking-wider font-semibold">Début</p>
                  <span className="text-[#C19A6B] font-mono font-bold">{heureDebut}h</span>
                </div>
                <input
                  type="range" min={14} max={21} step={1} value={heureDebut}
                  onChange={e => { const v = parseInt(e.target.value); if (v < heureFin) setHeureDebut(v); }}
                  className="w-full accent-[#C19A6B]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/50 text-xs uppercase tracking-wider font-semibold">Fin</p>
                  <span className="text-[#C19A6B] font-mono font-bold">{heureFin}h</span>
                </div>
                <input
                  type="range" min={15} max={23} step={1} value={heureFin}
                  onChange={e => { const v = parseInt(e.target.value); if (v > heureDebut) setHeureFin(v); }}
                  className="w-full accent-[#C19A6B]"
                />
              </div>
            </div>

            {/* Récap */}
            <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <Clock size={13} className="text-[#C19A6B] flex-shrink-0" />
              <p className="text-[#C19A6B]/80 text-sm">
                Flash de <strong>{heureDebut}h</strong> à <strong>{heureFin}h</strong>
                {' '}· durée <strong>{heureFin - heureDebut}h</strong>
              </p>
            </div>

            {/* Exemple */}
            <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3">
              <p className="text-white/25 text-xs mb-2">Exemple — Baguette Tradition 1,30€</p>
              <div className="flex items-center gap-3">
                <span className="text-white/30 text-sm line-through font-mono">1,30€</span>
                <ChevronRight size={12} className="text-white/20" />
                <span className="text-yellow-400 font-bold font-mono">
                  {calcFlash(1.30, remise).toFixed(2)}€
                </span>
                <span className="bg-yellow-400/15 text-yellow-400 text-xs px-2 py-0.5 rounded-full border border-yellow-400/25">
                  Client économise {(1.30 * remise / 100).toFixed(2)}€
                </span>
              </div>
            </div>

            {/* Bouton sauvegarder */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={saveConfig}
              disabled={savingConfig}
              className="w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all disabled:opacity-50"
              style={{
                background: 'rgba(193,154,107,0.15)',
                border: '1px solid rgba(193,154,107,0.3)',
                color: '#C19A6B',
              }}
            >
              {savingConfig
                ? <><Loader2 size={15} className="animate-spin" /> Enregistrement…</>
                : <><RefreshCw size={15} /> Enregistrer la configuration</>
              }
            </motion.button>
          </div>

          <div className="flex items-start gap-3 bg-white/3 border border-white/6 rounded-2xl px-4 py-3">
            <Info size={13} className="text-white/25 flex-shrink-0 mt-0.5" />
            <p className="text-white/30 text-xs leading-relaxed">
              Ces paramètres s'appliquent à toutes vos ventes flash.
              La remise peut être surchargée par produit dans le catalogue.
              Les modifications sont visibles côté client en temps réel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}