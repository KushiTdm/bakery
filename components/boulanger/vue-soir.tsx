'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Package, ShoppingBag, CheckCircle, Plus, Minus,
  Clock, TrendingDown, Gift, ChevronDown, ChevronUp, BarChart2
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

const FLASH_START_HOUR = 18;
const FLASH_END_HOUR = 20;
const DISCOUNT_PERCENT = 40;

function useFlashActive() {
  const [active, setActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const h = now.getHours();
      const isActive = h >= FLASH_START_HOUR && h < FLASH_END_HOUR;
      setActive(isActive);
      if (isActive) {
        const end = new Date();
        end.setHours(FLASH_END_HOUR, 0, 0, 0);
        const diff = end.getTime() - now.getTime();
        const hh = Math.floor(diff / 3600000);
        const mm = Math.floor((diff % 3600000) / 60000);
        const ss = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${hh}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`);
      }
    };
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, []);
  return { active, timeLeft };
}

// ─── Génération des paniers optimisés depuis le stock réel ────────────────────

interface BasketSuggestion {
  id: string;
  label: string;
  emoji: string;
  items: { name: string; emoji: string; qty: number }[];
  prixSuggere: number;
  valeurReelle: number;
  economisé: number;
}

function buildBasketSuggestions(stocks: ReturnType<typeof useBoulanger>['todayStocks']): BasketSuggestion[] {
  const invendus = stocks.filter(s => s.stockFinal > 0);
  if (invendus.length === 0) return [];

  const boulangs = invendus.filter(s => s.category === 'boulangerie');
  const vienns   = invendus.filter(s => s.category === 'viennoiserie');
  const patiss   = invendus.filter(s => s.category === 'patisserie');

  const suggestions: BasketSuggestion[] = [];

  // Panier 1 — Petit-déjeuner (viennoiserie + pain)
  const vPDJ = vienns.filter(s => s.stockFinal >= 2).slice(0, 2);
  const bPDJ = boulangs.find(s => s.stockFinal >= 1);
  if (vPDJ.length >= 1) {
    const items = [
      ...vPDJ.map(v => ({ name: v.name, emoji: v.emoji, qty: Math.min(2, v.stockFinal) })),
      ...(bPDJ ? [{ name: bPDJ.name, emoji: bPDJ.emoji, qty: 1 }] : []),
    ];
    const valeur = items.reduce((s, it) => {
      const p = stocks.find(st => st.name === it.name);
      return s + (p?.prixVente ?? 0) * it.qty;
    }, 0);
    if (valeur > 0) {
      suggestions.push({
        id: 'pdj',
        label: 'Panier Petit-Déjeuner',
        emoji: '☀️',
        items,
        valeurReelle: valeur,
        prixSuggere: +(valeur * 0.6).toFixed(2),
        economisé: +(valeur * 0.4).toFixed(2),
      });
    }
  }

  // Panier 2 — Gourmand (pâtisserie)
  const pGourm = patiss.filter(s => s.stockFinal >= 1).slice(0, 3);
  if (pGourm.length >= 2) {
    const items = pGourm.map(p => ({ name: p.name, emoji: p.emoji, qty: 1 }));
    const valeur = pGourm.reduce((s, p) => s + p.prixVente, 0);
    suggestions.push({
      id: 'gourm',
      label: 'Panier Gourmand',
      emoji: '🎂',
      items,
      valeurReelle: valeur,
      prixSuggere: +(valeur * 0.65).toFixed(2),
      economisé: +(valeur * 0.35).toFixed(2),
    });
  }

  // Panier 3 — Maxi (tout ce qui reste en grande quantité)
  const maxItems = invendus
    .filter(s => s.stockFinal >= 3)
    .sort((a, b) => b.stockFinal - a.stockFinal)
    .slice(0, 5);
  if (maxItems.length >= 3) {
    const items = maxItems.map(p => ({ name: p.name, emoji: p.emoji, qty: Math.min(3, p.stockFinal) }));
    const valeur = maxItems.reduce((s, p) => s + p.prixVente * Math.min(3, p.stockFinal), 0);
    suggestions.push({
      id: 'maxi',
      label: 'Grand Panier du Soir',
      emoji: '🛍️',
      items,
      valeurReelle: valeur,
      prixSuggere: +(valeur * 0.55).toFixed(2),
      economisé: +(valeur * 0.45).toFixed(2),
    });
  }

  return suggestions;
}

// ─── Composant section collapsible ───────────────────────────────────────────

function Section({
  title, icon: Icon, badge, children, defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
      >
        <Icon size={16} className="text-[#C19A6B] flex-shrink-0" />
        <span className="text-white/80 font-semibold text-sm flex-1">{title}</span>
        {badge && (
          <span className="bg-[#C19A6B]/20 text-[#C19A6B] text-xs font-bold px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        {open ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function VueSoir() {
  const {
    todayStocks, updateStockFinal,
    commandesOnline, setCommandesOnline,
    unsoldToday, unsoldValueToday, revenueToday,
    unsoldRateToday, totalProducedToday,
    closeDayAndSave,
  } = useBoulanger();

  const { active: flashActive, timeLeft } = useFlashActive();
  const [stockFinalSaisi, setStockFinalSaisi] = useState(false);
  const [jourClos, setJourClos] = useState(false);

  const unsoldProducts = todayStocks.filter(p => p.stockFinal > 0);
  const totalUnsoldValue = todayStocks.reduce((s, p) => s + p.stockFinal * p.prixVente, 0);
  const flashRevenu = +(totalUnsoldValue * (1 - DISCOUNT_PERCENT / 100)).toFixed(2);

  const basketSuggestions = buildBasketSuggestions(todayStocks);

  // Stats par catégorie pour le bilan
  const categoryStats = (['boulangerie', 'viennoiserie', 'patisserie'] as const).map(cat => {
    const items = todayStocks.filter(p => p.category === cat);
    const produced = items.reduce((s, p) => s + p.production, 0);
    const unsold = items.reduce((s, p) => s + p.stockFinal, 0);
    const sold = produced - unsold;
    const ca = sold > 0 ? items.reduce((s, p) => s + (p.production - p.stockFinal) * p.prixVente, 0) : 0;
    return { cat, produced, sold, unsold, ca, rate: produced > 0 ? (unsold / produced) * 100 : 0 };
  });

  const CAT_LABELS: Record<string, string> = {
    boulangerie: '🥖 Boulangerie',
    viennoiserie: '🥐 Viennoiserie',
    patisserie: '🎂 Pâtisserie',
  };

  const handleCloreJournee = () => {
    closeDayAndSave(commandesOnline);
    setJourClos(true);
  };

  return (
    <div className="space-y-4 pb-6">

      {/* ── 1. BILAN DU JOUR ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-3">
          Bilan du jour
        </p>

        {/* KPIs globaux */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
            <p className="text-green-400/70 text-xs mb-1">CA estimé</p>
            <p className="text-green-400 font-bold text-2xl font-mono">
              {totalProducedToday > 0 ? `${revenueToday.toFixed(0)}€` : '—'}
            </p>
            {totalProducedToday === 0 && (
              <p className="text-white/25 text-[10px] mt-0.5">Saisir la production</p>
            )}
          </div>
          <div className={`border rounded-2xl p-4 ${
            unsoldRateToday > 8 ? 'bg-red-500/10 border-red-500/20' :
            unsoldRateToday > 4 ? 'bg-amber-500/10 border-amber-500/20' :
            'bg-white/5 border-white/8'
          }`}>
            <p className="text-white/40 text-xs mb-1">Taux invendu</p>
            <p className={`font-bold text-2xl font-mono ${
              unsoldRateToday > 8 ? 'text-red-400' :
              unsoldRateToday > 4 ? 'text-amber-400' :
              'text-white'
            }`}>
              {totalProducedToday > 0 ? `${unsoldRateToday.toFixed(1)}%` : '—'}
            </p>
            {totalProducedToday > 0 && (
              <p className="text-white/25 text-[10px] mt-0.5">
                {unsoldRateToday < 3 ? '🎯 Excellent' : unsoldRateToday < 6 ? '✅ Correct' : '⚠️ À surveiller'}
              </p>
            )}
          </div>
          <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
            <p className="text-white/35 text-xs mb-1">Pièces produites</p>
            <p className="text-white font-bold text-2xl font-mono">{totalProducedToday}</p>
          </div>
          <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
            <p className="text-white/35 text-xs mb-1">Pièces invendues</p>
            <p className="text-amber-400 font-bold text-2xl font-mono">{unsoldToday}</p>
            {unsoldValueToday > 0 && (
              <p className="text-white/25 text-[10px] mt-0.5">
                Coût matière : {unsoldValueToday.toFixed(2)}€
              </p>
            )}
          </div>
        </div>

        {/* Tableau par catégorie */}
        {totalProducedToday > 0 && (
          <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/8 flex items-center gap-2">
              <BarChart2 size={13} className="text-[#C19A6B]" />
              <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Détail par catégorie</p>
            </div>
            <div className="divide-y divide-white/5">
              {/* Header */}
              <div className="grid grid-cols-4 px-4 py-2">
                <span className="text-white/25 text-[10px] uppercase tracking-wider">Catégorie</span>
                <span className="text-white/25 text-[10px] uppercase tracking-wider text-right">Produit</span>
                <span className="text-white/25 text-[10px] uppercase tracking-wider text-right">Vendu</span>
                <span className="text-white/25 text-[10px] uppercase tracking-wider text-right">Invendu</span>
              </div>
              {categoryStats.map(({ cat, produced, sold, unsold, rate }) => (
                <div key={cat} className="grid grid-cols-4 px-4 py-3 items-center">
                  <span className="text-white/60 text-xs">{CAT_LABELS[cat]}</span>
                  <span className="text-white/50 text-sm font-mono text-right">{produced}</span>
                  <span className="text-green-400/80 text-sm font-mono text-right">{sold}</span>
                  <div className="text-right">
                    <span className={`text-sm font-mono font-bold ${
                      rate > 10 ? 'text-red-400' : rate > 5 ? 'text-amber-400' : 'text-white/40'
                    }`}>{unsold}</span>
                    {unsold > 0 && (
                      <span className={`block text-[10px] ${rate > 10 ? 'text-red-400/50' : 'text-white/20'}`}>
                        {rate.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {/* Total */}
              <div className="grid grid-cols-4 px-4 py-3 bg-white/3">
                <span className="text-white/50 text-xs font-semibold">Total</span>
                <span className="text-white text-sm font-bold font-mono text-right">{totalProducedToday}</span>
                <span className="text-green-400 text-sm font-bold font-mono text-right">{totalProducedToday - unsoldToday}</span>
                <span className="text-amber-400 text-sm font-bold font-mono text-right">{unsoldToday}</span>
              </div>
            </div>
          </div>
        )}

        {totalProducedToday === 0 && (
          <p className="text-white/25 text-xs italic text-center py-4">
            Aucune production saisie — complétez d'abord l'onglet Matin
          </p>
        )}
      </div>

      {/* ── 2. SAISIE STOCK FINAL ────────────────────────────────────────── */}
      <Section
        title="Stock restant ce soir"
        icon={Package}
        badge={stockFinalSaisi ? '✓ Saisi' : undefined}
        defaultOpen={!stockFinalSaisi}
      >
        <div className="space-y-2 mt-1">
          {todayStocks.map(product => (
            <div key={product.id}
              className="bg-black/20 rounded-xl px-3 py-3 flex items-center gap-3"
            >
              <span className="text-lg">{product.emoji}</span>
              <p className="text-white/70 text-sm flex-1 truncate">{product.name}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <motion.button whileTap={{ scale: 0.85 }}
                  onClick={() => updateStockFinal(product.id, product.stockFinal - 1)}
                  className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-all"
                >
                  <Minus size={14} />
                </motion.button>
                <span className={`text-xl font-bold font-mono w-8 text-center ${
                  product.stockFinal > 0 ? 'text-amber-400' : 'text-white/25'
                }`}>
                  {product.stockFinal}
                </span>
                <motion.button whileTap={{ scale: 0.85 }}
                  onClick={() => updateStockFinal(product.id, product.stockFinal + 1)}
                  className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:bg-[#C19A6B]/20 hover:text-[#C19A6B] transition-all"
                >
                  <Plus size={14} />
                </motion.button>
              </div>
            </div>
          ))}
        </div>
        {!stockFinalSaisi && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setStockFinalSaisi(true)}
            className="w-full mt-3 bg-[#C19A6B]/15 border border-[#C19A6B]/30 text-[#C19A6B] py-3 rounded-xl text-sm font-semibold hover:bg-[#C19A6B]/25 transition-colors"
          >
            Valider le stock final
          </motion.button>
        )}
      </Section>

      {/* ── 3. PANIERS OPTIMISÉS ─────────────────────────────────────────── */}
      <Section
        title="Paniers suggérés"
        icon={Gift}
        badge={basketSuggestions.length > 0 ? `${basketSuggestions.length} idées` : undefined}
        defaultOpen={true}
      >
        {basketSuggestions.length === 0 ? (
          <p className="text-white/25 text-xs italic py-2">
            {unsoldToday === 0
              ? '🎉 Aucun invendu — rien à suggérer !'
              : 'Saisissez le stock final pour voir les suggestions'}
          </p>
        ) : (
          <div className="space-y-3 mt-1">
            <p className="text-white/35 text-xs leading-relaxed">
              Combinaisons calculées depuis votre stock réel pour minimiser les pertes.
            </p>
            {basketSuggestions.map(basket => (
              <div key={basket.id} className="bg-black/25 border border-white/8 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{basket.emoji}</span>
                    <div>
                      <p className="text-white font-semibold text-sm">{basket.label}</p>
                      <p className="text-white/35 text-xs">
                        Valeur réelle : <span className="line-through">{basket.valeurReelle.toFixed(2)}€</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-[#C19A6B] font-bold text-lg font-mono">{basket.prixSuggere}€</p>
                    <p className="text-green-400/60 text-[10px]">
                      économise {basket.economisé.toFixed(2)}€
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {basket.items.map(item => (
                    <span key={item.name}
                      className="bg-white/8 text-white/60 text-[11px] px-2 py-1 rounded-lg flex items-center gap-1"
                    >
                      {item.emoji} {item.qty > 1 ? `${item.qty}× ` : ''}{item.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 4. FLASH INVENDUS ────────────────────────────────────────────── */}
      <Section title="Flash Invendus" icon={Zap} defaultOpen={true}>
        {!flashActive ? (
          <div className="py-2 text-center">
            <Clock size={24} className="text-white/20 mx-auto mb-2" />
            <p className="text-white/40 text-sm">Le flash démarre à {FLASH_START_HOUR}h00</p>
            <p className="text-white/20 text-xs mt-1">
              Les invendus seront automatiquement proposés sur le site client
            </p>
          </div>
        ) : (
          <div className="space-y-3 mt-1">
            {/* Statut */}
            <div className="flex items-center justify-between bg-black/20 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="bg-yellow-400 rounded-lg p-1"
                >
                  <Zap size={12} className="text-[#2C1810] fill-current" />
                </motion.div>
                <div>
                  <p className="text-white text-xs font-semibold">Flash actif</p>
                  <p className="text-white/35 text-[10px] font-mono">{timeLeft} restant</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-yellow-400 font-bold font-mono">{flashRevenu}€</p>
                <p className="text-white/30 text-[10px]">récupérables</p>
              </div>
            </div>

            {unsoldProducts.length === 0 ? (
              <div className="text-center py-3">
                <CheckCircle size={22} className="text-green-400 mx-auto mb-1.5" />
                <p className="text-green-400 text-sm font-medium">Aucun invendu 🎉</p>
              </div>
            ) : (
              <div className="space-y-2">
                {unsoldProducts.map(p => {
                  const discountedPrice = +(p.prixVente * (1 - DISCOUNT_PERCENT / 100)).toFixed(2);
                  return (
                    <div key={p.id} className="bg-black/20 rounded-xl px-3 py-2.5 flex items-center gap-3">
                      <span className="text-base">{p.emoji}</span>
                      <div className="flex-1">
                        <p className="text-white text-sm">{p.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white/30 text-xs line-through">{p.prixVente.toFixed(2)}€</span>
                          <span className="text-yellow-400 text-sm font-bold">{discountedPrice}€</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white/8 rounded-lg px-2.5 py-1.5 flex-shrink-0">
                        <Package size={11} className="text-white/40" />
                        <span className="text-white font-bold font-mono text-sm">{p.stockFinal}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── 5. COMMANDES ONLINE ─────────────────────────────────────────── */}
      <Section title="Commandes Click & Collect" icon={ShoppingBag} defaultOpen={true}>
        <div className="mt-1 space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-white/50 text-sm flex-1">Commandes reçues aujourd'hui</p>
            <div className="flex items-center gap-2">
              <motion.button whileTap={{ scale: 0.85 }}
                onClick={() => setCommandesOnline(Math.max(0, commandesOnline - 1))}
                className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-all"
              >
                <Minus size={14} />
              </motion.button>
              <span className="text-white font-bold text-2xl font-mono w-8 text-center">{commandesOnline}</span>
              <motion.button whileTap={{ scale: 0.85 }}
                onClick={() => setCommandesOnline(commandesOnline + 1)}
                className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:bg-[#C19A6B]/20 hover:text-[#C19A6B] transition-all"
              >
                <Plus size={14} />
              </motion.button>
            </div>
          </div>
          {commandesOnline > 0 && (
            <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl px-3 py-2.5 text-xs text-white/50">
              💡 Préparez les {commandesOnline} commande{commandesOnline > 1 ? 's' : ''} ce soir pour la distribution demain matin avant 10h.
            </div>
          )}
        </div>
      </Section>

      {/* ── 6. SUGGESTION PRODUCTION DEMAIN ─────────────────────────────── */}
      <Section title="Suggestion production demain" icon={TrendingDown} defaultOpen={true}>
        {totalProducedToday === 0 ? (
          <p className="text-white/25 text-xs italic py-2">
            Saisissez la production et les stocks pour obtenir des suggestions.
          </p>
        ) : (
          <div className="mt-1 space-y-2">
            {todayStocks
              .filter(p => p.stockFinal > p.production * 0.08)
              .sort((a, b) => (b.stockFinal / b.production) - (a.stockFinal / a.production))
              .map(p => {
                const reduction = Math.ceil(p.stockFinal * 0.75);
                const rate = Math.round((p.stockFinal / p.production) * 100);
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-black/20 rounded-xl px-3 py-2.5">
                    <span className="text-base">{p.emoji}</span>
                    <p className="text-white/60 text-xs flex-1 truncate">{p.name}</p>
                    <div className="text-right flex-shrink-0">
                      <p className="text-amber-400 text-xs font-semibold">
                        -{reduction} pièce{reduction > 1 ? 's' : ''} demain
                      </p>
                      <p className="text-white/25 text-[10px]">{rate}% invendu aujourd'hui</p>
                    </div>
                  </div>
                );
              })}
            {todayStocks.filter(p => p.stockFinal > p.production * 0.08).length === 0 && (
              <p className="text-white/30 text-xs italic py-1">
                Aucun ajustement nécessaire — belle journée 👍
              </p>
            )}
          </div>
        )}
      </Section>

      {/* ── 7. CLÔTURE DE JOURNÉE ────────────────────────────────────────── */}
      <div className="border-t border-white/8 pt-4">
        {jourClos ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center justify-center gap-3 py-4"
          >
            <CheckCircle size={20} className="text-green-400" />
            <p className="text-green-400 font-semibold text-sm">Journée clôturée — données sauvegardées</p>
          </motion.div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCloreJournee}
            className="w-full bg-white/8 border border-white/12 text-white/60 py-3.5 rounded-2xl text-sm font-semibold hover:bg-white/12 hover:text-white/80 transition-all"
          >
            Clôturer la journée et sauvegarder
          </motion.button>
        )}
      </div>

    </div>
  );
}