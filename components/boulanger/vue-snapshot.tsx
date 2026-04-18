'use client';
// components/boulanger/vue-snapshot.tsx
// ✅ Valeur de départ = 0 (vendeuse saisit ce qui reste, pas ce qui était)
// ✅ Saisie par curseur visuel — bascule automatique en +/- sous 20% restant
// ✅ Prompt 2ème fournée si produit < 30% après validation snapshot 10h
// ✅ Snapshot 14h optionnel (stat mi-journée)
// ✅ FIX : snapshot14h limité par snapshot10h même quand snapshot10h === 0

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, AlertTriangle, TrendingDown, Check, Loader2, Plus, Minus } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry } from '@/context/boulanger-context';

type Slot = '10h' | '14h';

const SEUIL_ALERTE_PCT  = 30; // % restant → alerte invendu dans la bannière
const SEUIL_EXACT_PCT   = 20; // % restant → bascule en mode +/-
const SEUIL_FOURNEE_PCT = 30; // % restant → suggestion 2ème fournée

// CSS injecté une seule fois pour styliser le slider natif
const SLIDER_CSS = `
  .snap-slider { -webkit-appearance: none; appearance: none; height: 14px; border-radius: 999px; outline: none; cursor: pointer; width: 100%; position: relative; z-index: 2; }
  .snap-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 28px; height: 28px; border-radius: 50%;
    background: white;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.55), 0 0 0 3px var(--thumb-ring, rgba(255,255,255,0.15));
    transition: transform 0.12s ease, box-shadow 0.15s ease;
    border: 0;
  }
  .snap-slider::-webkit-slider-thumb:hover { transform: scale(1.06); }
  .snap-slider::-webkit-slider-thumb:active { transform: scale(1.18); }
  .snap-slider::-moz-range-thumb {
    width: 28px; height: 28px; border-radius: 50%;
    background: white; cursor: pointer; border: 0;
    box-shadow: 0 2px 10px rgba(0,0,0,0.55), 0 0 0 3px var(--thumb-ring, rgba(255,255,255,0.15));
  }
  .snap-track-wrap { position: relative; flex: 1; }
  .snap-ticks {
    position: absolute; inset: 0;
    pointer-events: none;
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 13px; z-index: 1;
  }
  .snap-tick { width: 2px; height: 6px; background: rgba(255,255,255,0.18); border-radius: 1px; }
  .snap-tick.mid { height: 8px; background: rgba(255,255,255,0.24); }
`;

// ─── Cellule curseur ──────────────────────────────────────────
// Logique : slider = quantité vendue (gauche=0 vendu, droite=tout vendu)
// La partie GAUCHE (grisée) = vendu ; la partie DROITE (colorée) = reste

function SnapshotCellSlider({
  value,
  max,
  onChange,
  disabled,
  isDone,
}: {
  value:    number;
  max:      number;
  onChange: (v: number) => void;
  disabled?: boolean;
  isDone?:   boolean;
}) {
  const [mode, setMode] = useState<'slider' | 'exact'>(max === 0 ? 'exact' : 'slider');
  // Suit si la vendeuse a touché ce slider dans la session en cours.
  // Sans ce flag, value=0 serait ambigu : "rien saisi" vs "tout vendu".
  const [touched, setTouched] = useState(false);

  // "value" est connu (non ambigu) si : snapshot déjà validé, interaction courante,
  // ou valeur strictement > 0. Sinon (value=0 initial), on considère "plein" par défaut.
  const isKnown = isDone || touched || value > 0;
  const remaining = isKnown ? value : max;

  // Couleurs basées sur le % RESTANT effectif
  const pct      = max > 0 ? remaining / max : 0;
  const color    = pct > 0.60 ? '#4ade80' : pct > 0.20 ? '#fbbf24' : '#f87171';
  const bgColor  = pct > 0.60 ? 'rgba(74,222,128,0.10)'  : pct > 0.20 ? 'rgba(251,191,36,0.10)'  : 'rgba(248,113,113,0.10)';
  const bdrColor = pct > 0.60 ? 'rgba(74,222,128,0.22)'  : pct > 0.20 ? 'rgba(251,191,36,0.22)'  : 'rgba(248,113,113,0.22)';

  // Position du curseur = quantité VENDUE (0 = plein à gauche, max = vide à droite)
  const soldDisplayed = max - remaining;
  const soldPct       = max > 0 ? `${(soldDisplayed / max * 100).toFixed(1)}%` : '0%';

  // Libellé d'état dynamique
  const stateLabel =
    !isKnown      ? 'À renseigner'
    : remaining === 0   ? 'Vide'
    : remaining === max ? 'Plein'
    : pct > 0.75 ? '¾ restant'
    : pct > 0.45 ? '½ restant'
    : pct > 0.20 ? '¼ restant'
    : 'Presque vide';

  // Couleurs pour la barre désactivée (production = 0 ou slot vérouillé)
  const pctDis     = max > 0 ? value / max : 0;
  const colorDis   = pctDis > 0.60 ? 'rgba(74,222,128,0.35)'  : pctDis > 0.20 ? 'rgba(251,191,36,0.35)'  : 'rgba(248,113,113,0.35)';
  const soldPctDis = max > 0 ? `${((max - value) / max * 100).toFixed(1)}%` : '0%';

  // Gradient : gris (vendu, gauche) → coloré (reste, droite)
  const trackGradient = (sp: string, c: string) =>
    `linear-gradient(to right, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.10) ${sp}, ${c} ${sp}, ${c} 100%)`;

  // Appelé avec la quantité VENDUE — convertit en restant pour onChange
  const handleSoldChange = (newSold: number) => {
    if (!touched) setTouched(true);
    onChange(max - newSold);
  };

  const markInteracted = () => { if (!touched) setTouched(true); };

  // ── Vue désactivée (slot déjà validé) ──
  if (disabled) {
    return (
      <div className="flex items-center gap-2 w-full">
        <div
          className="flex-1 h-2.5 rounded-full"
          style={{ background: trackGradient(soldPctDis, colorDis) }}
        />
        <span
          className="text-sm font-bold font-mono tabular-nums w-8 text-right"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          {value}
        </span>
      </div>
    );
  }

  // ── Mode exact (+/−) ──
  if (mode === 'exact') {
    return (
      <div className="flex items-center gap-1.5">
        {/* − */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          onPointerDown={() => { if (value > 0) { markInteracted(); onChange(value - 1); } }}
          disabled={value <= 0}
          className={`
            w-11 h-11 rounded-xl flex items-center justify-center
            select-none touch-manipulation transition-all
            ${value <= 0
              ? 'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed'
              : 'bg-white/10 border border-white/12 hover:bg-white/16 active:bg-white/22'
            }
          `}
          aria-label="Diminuer"
        >
          <Minus size={16} strokeWidth={2.5} className="text-white" />
        </motion.button>

        {/* Valeur restante */}
        <motion.div
          key={value}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.12 }}
          className="w-14 h-11 rounded-xl flex items-center justify-center text-base font-bold font-mono tabular-nums border select-none"
          style={{ background: bgColor, borderColor: bdrColor, color }}
        >
          {value}
        </motion.div>

        {/* + */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          onPointerDown={() => { if (value < max) { markInteracted(); onChange(value + 1); } }}
          disabled={value >= max}
          className={`
            w-11 h-11 rounded-xl flex items-center justify-center
            select-none touch-manipulation transition-all
            ${value >= max
              ? 'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed'
              : 'bg-[#C19A6B]/20 border border-[#C19A6B]/30 hover:bg-[#C19A6B]/30 active:bg-[#C19A6B]/40'
            }
          `}
          aria-label="Augmenter"
        >
          <Plus size={16} strokeWidth={2.5} className="text-[#C19A6B]" />
        </motion.button>

        {/* Retour curseur si stock suffisant */}
        {pct > SEUIL_EXACT_PCT / 100 && (
          <motion.button
            whileTap={{ scale: 0.90 }}
            onClick={() => setMode('slider')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 bg-white/5 border border-white/8 transition-colors"
            title="Mode curseur"
            aria-label="Retour au curseur"
          >
            <span className="text-[13px] leading-none">≡</span>
          </motion.button>
        )}
      </div>
    );
  }

  // ── Mode curseur (slider) ──
  // Points d'ancrage : exprimés en % VENDU, libellés par % RESTANT
  const snapPoints = [
    { soldFrac: 0,    label: 'Plein'   },
    { soldFrac: 0.25, label: '¾'       },
    { soldFrac: 0.5,  label: '½'       },
    { soldFrac: 0.75, label: '¼'       },
    { soldFrac: 1,    label: 'Vide'    },
  ];

  return (
    <div className="w-full space-y-2">
      {/* Ligne d'état compacte : libellé + ratio vendus/max */}
      <div className="flex items-center justify-between px-0.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider transition-colors"
          style={{ color: isKnown ? color : 'rgba(255,255,255,0.35)' }}
        >
          {stateLabel}
        </span>
        <span className="text-[10px] font-mono tabular-nums text-white/45">
          <span style={{ color: color }}>{remaining}</span>
          <span className="text-white/25"> / {max} </span>
          {isKnown && soldDisplayed > 0 && (
            <span className="text-white/40">· {soldDisplayed} vendu{soldDisplayed > 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="snap-track-wrap">
          <input
            type="range"
            min={0}
            max={max}
            value={soldDisplayed}
            onChange={e => handleSoldChange(Number(e.target.value))}
            className="snap-slider touch-manipulation"
            style={{
              background: trackGradient(soldPct, color),
              ['--thumb-ring' as string]: `${color}55`,
            }}
            aria-label={`Stock restant : ${remaining} sur ${max}`}
          />
          {/* Repères visuels sur la piste */}
          <div className="snap-ticks">
            <span className="snap-tick" />
            <span className="snap-tick" />
            <span className="snap-tick mid" />
            <span className="snap-tick" />
            <span className="snap-tick" />
          </div>
        </div>

        {/* Badge : restant */}
        <motion.div
          key={remaining}
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.15 }}
          className="w-12 h-10 rounded-xl flex items-center justify-center text-sm font-bold font-mono tabular-nums border flex-shrink-0"
          style={{ background: bgColor, borderColor: bdrColor, color }}
        >
          {remaining}
        </motion.div>

        {/* Basculer en mode exact */}
        <motion.button
          whileTap={{ scale: 0.90 }}
          onClick={() => setMode('exact')}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 bg-white/5 border border-white/8 flex-shrink-0 transition-colors"
          title="Saisie exacte"
          aria-label="Saisie exacte"
        >
          <span className="text-[11px] leading-none">✏️</span>
        </motion.button>
      </div>

      {/* Points d'ancrage rapides */}
      <div className="flex gap-1">
        {snapPoints.map(({ soldFrac, label }) => {
          const snapSold = Math.round(max * soldFrac);
          const isNear   = isKnown && Math.abs(soldDisplayed - snapSold) <= Math.max(1, Math.round(max * 0.04));
          return (
            <button
              key={soldFrac}
              onClick={() => handleSoldChange(snapSold)}
              className={`
                flex-1 py-1 rounded-lg text-[10px] font-semibold
                transition-colors select-none touch-manipulation
                ${isNear
                  ? 'text-white bg-white/12 shadow-inner'
                  : 'text-white/25 hover:text-white/55 hover:bg-white/5'
                }
              `}
              style={isNear ? { color } : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Constantes catégories ────────────────────────────────────

const CATEGORY_ORDER = ['boulangerie', 'viennoiserie', 'patisserie', 'sandwich'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  boulangerie:  'Boulangerie',
  viennoiserie: 'Viennoiserie',
  patisserie:   'Pâtisserie',
  sandwich:     'Sandwichs',
};

// ─── Vue Snapshot ─────────────────────────────────────────────

export default function VueSnapshot() {
  const {
    todayStocks,
    reservedByProduct,
    updateSnapshot,
    validateSnapshot,
    syncStatus,
    authLoading,
  } = useBoulanger();

  const [slotActif, setSlotActif]     = useState<Slot>('10h');
  const [saved, setSaved]             = useState(false);
  const [fourneePrompt, setFourneePrompt] = useState<StockEntry[]>([]);

  const handleChange = (stock: StockEntry, slot: Slot, val: number) => {
    updateSnapshot(stock.id, val, slot);
  };

  const handleSave = () => {
    validateSnapshot(slotActif);

    // Après snapshot 10h : suggérer une 2ème fournée si des produits sont bas
    if (slotActif === '10h') {
      const bas = todayStocks.filter(s => {
        if (s.production === 0) return false;
        return s.snapshot10h / s.production < SEUIL_FOURNEE_PCT / 100;
      });
      if (bas.length > 0) setFourneePrompt(bas);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Alertes invendus potentiels
  const alertes = todayStocks.filter(s => {
    const reste = slotActif === '10h' ? s.snapshot10h : s.snapshot14h;
    if (s.production === 0) return false;
    return reste > 0 && (reste / s.production) * 100 > SEUIL_ALERTE_PCT;
  });

  const heure        = new Date().getHours();
  const slotSuggere: Slot = heure < 12 ? '10h' : '14h';

  // Ordre figé par slot : évite que la liste se ré-ordonne pendant l'interaction
  // (sinon un produit qui passe à 0 migre en bas et le drag "saute" sur le produit du dessous).
  // Se recalcule uniquement quand on change de slot ou que la liste de produits évolue.
  const stockIdsKey = todayStocks.map(s => s.id).join('|');
  const orderedIdsByCategory = useMemo(() => {
    const sortByStock = (a: StockEntry, b: StockEntry) => {
      const aReste = slotActif === '10h' ? a.snapshot10h : a.snapshot14h;
      const bReste = slotActif === '10h' ? b.snapshot10h : b.snapshot14h;
      if ((a.production === 0) !== (b.production === 0)) return a.production === 0 ? 1 : -1;
      if ((aReste === 0) !== (bReste === 0)) return aReste === 0 ? 1 : -1;
      return bReste - aReste;
    };
    const map: Record<string, string[]> = {};
    for (const cat of CATEGORY_ORDER) {
      map[cat] = todayStocks.filter(s => s.category === cat).sort(sortByStock).map(s => s.id);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotActif, stockIdsKey]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  if (todayStocks.length === 0 || todayStocks.every(s => s.production === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-5xl mb-4">📸</span>
        <p className="text-white/50 font-medium">Aucune production saisie</p>
        <p className="text-white/25 text-sm mt-1">
          Saisissez la production dans l'onglet <span className="text-[#C19A6B]">Matin</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{SLIDER_CSS}</style>

      {/* ── Header ── */}
      <div data-tour="snapshot-header" className="pt-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">
              Comptage étagère
            </p>
            <h1
              className="text-white text-2xl font-bold mt-1"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Stock en rayon
            </h1>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-[#C19A6B]/10 border border-[#C19A6B]/15 flex items-center justify-center">
            <Camera size={18} className="text-[#C19A6B]/70" />
          </div>
        </div>
        <p className="text-white/35 text-xs sm:text-sm mt-2 leading-relaxed">
          Stock plein à gauche — glissez vers la droite au fil des ventes.
          Utilisez <strong className="text-white/55">✏️</strong> pour une saisie exacte.
        </p>
      </div>

      {/* ── Sélecteur de slot ── */}
      <div className="flex gap-2">
        {(['10h', '14h'] as Slot[]).map(slot => {
          const isDone = slot === '10h'
            ? todayStocks.some(s => s.snapshot10hDone)
            : todayStocks.some(s => s.snapshot14hDone);
          return (
            <motion.button
              key={slot}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSlotActif(slot)}
              className={`
                flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all border
                select-none touch-manipulation flex items-center justify-center gap-1.5
                ${slotActif === slot
                  ? 'bg-[#C19A6B]/15 border-[#C19A6B]/30 text-[#C19A6B]'
                  : 'bg-white/4 border-white/8 text-white/50 hover:text-white/70'
                }
              `}
            >
              <span>{isDone ? '✅' : '📸'} Snapshot {slot}</span>

              {/* Badge optionnel pour 14h */}
              {slot === '14h' && !isDone && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/30 font-normal">
                  optionnel
                </span>
              )}

              {/* Suggestion horaire pour 10h */}
              {slot === slotSuggere && !isDone && slot === '10h' && (
                <span className="text-[9px] text-[#C19A6B]/60">maintenant</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* ── Alerte invendus ── */}
      {alertes.length > 0 && (
        <div
          data-tour="snapshot-alerte"
          className="flex items-start gap-3 px-4 py-3 rounded-2xl border"
          style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)' }}
        >
          <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 text-xs font-semibold">
              {alertes.length} produit{alertes.length > 1 ? 's' : ''} à risque d'invendu
            </p>
            <p className="text-amber-400/60 text-[11px] mt-0.5">
              {alertes.map(a => a.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Liste produits groupée par catégorie ── */}
      {(() => {
        // Ordre figé par slot (voir useMemo plus haut) — données lues live depuis todayStocks
        const stockById = new Map(todayStocks.map(s => [s.id, s]));
        const grouped = CATEGORY_ORDER
          .map(cat => ({
            category: cat,
            items: (orderedIdsByCategory[cat] ?? [])
              .map(id => stockById.get(id))
              .filter((s): s is StockEntry => s !== undefined),
          }))
          .filter(g => g.items.length > 0);

        return grouped.map(({ category, items }, groupIdx) => (
          <div
            key={category}
            className="rounded-2xl border overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
              borderColor: 'rgba(255,255,255,0.07)',
              marginTop: groupIdx === 0 ? 0 : undefined,
            }}
          >
            {/* En-tête catégorie */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-white/2">
              <p className="flex-1 text-[#C19A6B]/70 text-[10px] uppercase tracking-widest font-semibold">
                {CATEGORY_LABELS[category]}
              </p>
              <p className="text-white/20 text-[10px] uppercase tracking-widest text-right pr-1">
                Produit / Reste
              </p>
            </div>

            {/* Lignes */}
            {items.map(stock => {
              const isDone    = slotActif === '10h' ? stock.snapshot10hDone : stock.snapshot14hDone;
              const reste     = slotActif === '10h' ? stock.snapshot10h    : stock.snapshot14h;
              const base      = slotActif === '10h'
                ? stock.production
                : (stock.snapshot10hDone ? stock.snapshot10h : stock.production);
              const vendus    = base - reste;
              // Bloqué uniquement si production = 0 (rien à compter)
              // Note : snapshot10h = 0 validé par erreur → user peut re-corriger le 10h
              const isBlocked = stock.production === 0;

              const refLabel = slotActif === '14h' && stock.snapshot10hDone
                ? `Snapshot 10h : ${stock.snapshot10h} restants`
                : `${stock.production} produits`;

              return (
                <div
                  key={stock.id}
                  className={`
                    px-4 py-3 border-b border-white/4 last:border-0
                    ${isBlocked ? 'opacity-45' : ''}
                  `}
                >
                  {/* Ligne info produit */}
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="text-xl leading-none flex-shrink-0">{stock.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium line-clamp-1">{stock.name}</p>
                      <p className="text-white/35 text-xs tabular-nums">
                        {refLabel}
                        {vendus > 0 && (
                          <span className="text-green-400/60 ml-2">→ {vendus} vendus</span>
                        )}
                        {(reservedByProduct[stock.name] ?? 0) > 0 && (
                          <span className="text-amber-400/80 ml-2 font-medium">
                            · {reservedByProduct[stock.name]} réservé{reservedByProduct[stock.name] > 1 ? 's' : ''} C&C
                          </span>
                        )}
                        {isDone && !isBlocked && (
                          <span className="text-[#C19A6B]/50 ml-2 italic">· modifiable</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Curseur — toujours éditable même si slot validé */}
                  <SnapshotCellSlider
                    key={`${stock.id}-${slotActif}`}
                    value={reste}
                    max={base}
                    onChange={val => handleChange(stock, slotActif, val)}
                    disabled={isBlocked}
                    isDone={isDone}
                  />
                </div>
              );
            })}
          </div>
        ));
      })()}

      {/* ── Bouton valider snapshot ── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSave}
        disabled={syncStatus === 'saving'}
        className={`
          w-full py-4 rounded-2xl flex items-center justify-center gap-2.5
          font-bold text-base transition-all duration-300 select-none touch-manipulation
          disabled:opacity-50
        `}
        style={
          saved
            ? { background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgb(74,222,128)' }
            : { background: 'linear-gradient(135deg, rgba(193,154,107,0.25) 0%, rgba(193,154,107,0.12) 100%)', border: '1px solid rgba(193,154,107,0.35)', color: '#C19A6B' }
        }
      >
        {syncStatus === 'saving'
          ? <><Loader2 size={18} className="animate-spin" /> Synchronisation…</>
          : saved
            ? <><Check size={18} /> Snapshot {slotActif} enregistré ✓</>
            : <><Camera size={18} /> Valider le snapshot {slotActif}</>
        }
      </motion.button>

      <div className="flex items-center gap-2 justify-center pb-1">
        <TrendingDown size={11} className="text-amber-400/50" />
        <p className="text-white/20 text-[10px]">
          Vert &gt;60% · Orange 20–60% · Saisie exacte ≤{SEUIL_EXACT_PCT}%
        </p>
      </div>

      {/* ── Prompt 2ème fournée (après snapshot 10h) ── */}
      <AnimatePresence>
        {fourneePrompt.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            className="fixed inset-x-4 bottom-28 z-50 rounded-2xl border p-4 shadow-2xl"
            style={{ background: 'rgba(16,16,16,0.97)', borderColor: 'rgba(251,191,36,0.30)' }}
          >
            <p className="text-amber-400 font-bold text-sm mb-0.5">
              ⚡ Produits bas après 10h
            </p>
            <p className="text-white/35 text-xs mb-3">
              Besoin d'une 2ème fournée ?
            </p>

            <div className="space-y-2 mb-4">
              {fourneePrompt.map(p => {
                const pctVal = p.production > 0
                  ? Math.round((p.snapshot10h / p.production) * 100)
                  : 0;
                const isCritical = pctVal < 10;
                return (
                  <div key={p.id} className="flex items-center gap-2.5">
                    <span className="text-xl">{p.emoji}</span>
                    <span className="flex-1 text-white/70 text-sm font-medium">{p.name}</span>
                    <span
                      className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full"
                      style={{
                        background: isCritical ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.12)',
                        color:      isCritical ? '#f87171'                 : '#fbbf24',
                      }}
                    >
                      {p.snapshot10h}/{p.production} · {pctVal}%
                    </span>
                  </div>
                );
              })}
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setFourneePrompt([])}
              className="w-full py-3 rounded-xl text-sm font-bold text-white/50 border border-white/10 bg-white/5 hover:bg-white/8 transition-colors select-none"
            >
              OK, j'ai noté
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
