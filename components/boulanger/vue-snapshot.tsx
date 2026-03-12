'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, CheckCircle, AlertTriangle } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

export default function VueSnapshot() {
  const { todayStocks, updateSnapshot, validateSnapshot, setActiveView } = useBoulanger();
  const [activeSlot, setActiveSlot] = useState<'10h' | '14h'>('10h');
  const [confirmed, setConfirmed] = useState(false);

  const slot = activeSlot;
  const isDone10h = todayStocks.every(s => s.snapshot10hDone);
  const isDone14h = todayStocks.every(s => s.snapshot14hDone);

  const getSnapshotValue = (p: typeof todayStocks[0]) =>
    slot === '10h' ? p.snapshot10h : p.snapshot14h;

  const handleUpdate = (id: string, val: number) =>
    updateSnapshot(id, val, slot);

  // Ventes calculées automatiquement par différence
  const totalSoldThisSlot = todayStocks.reduce((s, p) => {
    const sold = slot === '10h'
      ? p.production - p.snapshot10h
      : p.snapshot10h - p.snapshot14h;
    return s + Math.max(0, sold);
  }, 0);

  const revenueThisSlot = todayStocks.reduce((s, p) => {
    const sold = slot === '10h'
      ? p.production - p.snapshot10h
      : p.snapshot10h - p.snapshot14h;
    return s + Math.max(0, sold) * p.prixVente;
  }, 0);

  // Produits avec trop de stock restant = risque invendu
  const riskyProducts = todayStocks.filter(p => {
    const remaining = slot === '10h' ? p.snapshot10h : p.snapshot14h;
    const done = slot === '10h' ? p.snapshot10hDone : p.snapshot14hDone;
    return done && remaining > p.production * 0.3;
  });

  const handleValidate = () => {
    validateSnapshot(slot);
    if (slot === '10h') {
      setActiveSlot('14h');
    } else {
      setConfirmed(true);
      setTimeout(() => setActiveView('soir'), 1400);
    }
  };

  if (confirmed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12 }}
          className="w-20 h-20 bg-green-500/15 rounded-full flex items-center justify-center"
        >
          <CheckCircle size={42} className="text-green-400" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-center">
          <p className="text-white font-bold text-xl" style={{ fontFamily: 'Playfair Display, serif' }}>Snapshots validés</p>
          <p className="text-white/40 text-sm mt-1">Passage à la gestion du soir…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pb-36">

      {/* Sélecteur de slot */}
      <div className="mb-5">
        <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-3">
          Comptage stock restant
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(['10h', '14h'] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSlot(s)}
              disabled={s === '14h' && !isDone10h}
              className={`relative p-4 rounded-2xl border text-left transition-all ${
                activeSlot === s
                  ? 'bg-[#C19A6B]/15 border-[#C19A6B]/50'
                  : s === '14h' && !isDone10h
                    ? 'bg-white/3 border-white/5 opacity-40 cursor-not-allowed'
                    : 'bg-white/5 border-white/10 hover:bg-white/8'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-white font-bold text-lg font-mono">{s}</span>
                {(s === '10h' && isDone10h) || (s === '14h' && isDone14h)
                  ? <CheckCircle size={16} className="text-green-400" />
                  : <div className={`w-2 h-2 rounded-full ${activeSlot === s ? 'bg-[#C19A6B]' : 'bg-white/20'}`} />
                }
              </div>
              <p className="text-white/40 text-xs mt-1">
                {s === '10h' ? 'Après rush matinal' : 'Après rush déjeuner'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Résumé ventes calculées */}
      {((slot === '10h' && isDone10h) || (slot === '14h' && isDone10h)) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 bg-white/5 rounded-2xl p-4"
        >
          <p className="text-white/40 text-xs mb-3 uppercase tracking-wider">
            {slot === '10h' ? 'Ventes calculées (6h → 10h)' : 'Ventes calculées (10h → 14h)'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-white/30 text-xs">Pièces vendues</p>
              <p className="text-white font-bold text-2xl font-mono">{totalSoldThisSlot}</p>
            </div>
            <div>
              <p className="text-white/30 text-xs">CA généré</p>
              <p className="text-[#C19A6B] font-bold text-2xl font-mono">{revenueThisSlot.toFixed(0)}€</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Alerte invendus à risque */}
      <AnimatePresence>
        {riskyProducts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className="text-amber-400" />
              <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">
                {riskyProducts.length} produit{riskyProducts.length > 1 ? 's' : ''} à risque d'invendu
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {riskyProducts.map(p => (
                <span key={p.id} className="bg-amber-500/15 text-amber-300 text-xs px-2.5 py-1 rounded-full">
                  {p.emoji} {p.name}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Instruction claire ── */}
      <div className="mb-4 bg-[#C19A6B]/10 border border-[#C19A6B]/25 rounded-2xl px-4 py-3.5 flex items-start gap-3">
        <span className="text-xl flex-shrink-0">👁</span>
        <div>
          <p className="text-[#C19A6B] font-semibold text-sm">Regardez l'étagère</p>
          <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
            Entrez combien il en <strong className="text-white/70">reste physiquement devant vous</strong>.
            Les ventes sont calculées automatiquement.
          </p>
        </div>
      </div>

      {/* Liste produits */}
      <div className="space-y-3">
        {todayStocks.map((product, i) => {
          const current = getSnapshotValue(product);
          const soldSinceLastCount = Math.max(0, slot === '10h'
            ? product.production - current
            : product.snapshot10h - current);
          const pctRestant = product.production > 0
            ? Math.round((current / product.production) * 100)
            : 0;
          const pctVendu = 100 - pctRestant;

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white/6 border border-white/8 rounded-2xl p-4"
            >
              {/* En-tête : nom + vendus calculés */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">{product.emoji}</span>
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{product.name}</p>
                  <p className="text-white/30 text-xs">Enfourné ce matin : {product.production}</p>
                </div>
                {soldSinceLastCount > 0 && (
                  <div className="bg-green-500/12 border border-green-500/20 rounded-lg px-2.5 py-1.5 text-right flex-shrink-0">
                    <p className="text-green-400 font-bold text-sm font-mono leading-none">+{soldSinceLastCount}</p>
                    <p className="text-green-400/50 text-[10px] leading-none mt-0.5">vendus</p>
                  </div>
                )}
              </div>

              {/* Zone saisie : ce qui RESTE */}
              <div className="bg-black/25 border border-white/6 rounded-xl p-3 mb-3">
                <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest text-center mb-3">
                  🔢 Il en reste sur l'étagère
                </p>
                <div className="flex items-center gap-3">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleUpdate(product.id, current - 1)}
                    className="w-12 h-12 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-white/60 hover:bg-red-500/20 hover:text-red-400 active:bg-red-500/30 transition-all"
                  >
                    <Minus size={18} />
                  </motion.button>
                  <div className="flex-1 text-center">
                    <span className="text-white font-bold text-4xl font-mono leading-none">{current}</span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleUpdate(product.id, current + 1)}
                    className="w-12 h-12 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-white/60 hover:bg-[#C19A6B]/20 hover:text-[#C19A6B] active:bg-[#C19A6B]/30 transition-all"
                  >
                    <Plus size={18} />
                  </motion.button>
                </div>
              </div>

              {/* Barre vendus (vert) vs restants (rouge si trop) */}
              <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pctVendu}%` }}
                  transition={{ duration: 0.4 }}
                  className="bg-green-400/50 rounded-l-full"
                />
                <motion.div
                  animate={{ width: `${pctRestant}%` }}
                  className={`rounded-r-full ${
                    pctRestant > 40 ? 'bg-red-400/60' :
                    pctRestant > 20 ? 'bg-amber-400/50' :
                    'bg-white/15'
                  }`}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-green-400/55 text-[10px]">
                  {soldSinceLastCount > 0 ? `✓ ${soldSinceLastCount} vendus` : ''}
                </span>
                <span className={`text-[10px] ${pctRestant > 40 ? 'text-red-400/60' : 'text-white/20'}`}>
                  {current > 0 ? `${current} restants` : '✓ épuisé'}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bouton valider — sticky */}
      <div className="fixed bottom-[68px] left-0 right-0 px-4 pt-6 pb-3 bg-gradient-to-t from-[#1A0F0A] via-[#1A0F0A]/95 to-transparent">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleValidate}
          className="w-full max-w-sm mx-auto block bg-[#C19A6B] text-[#1A0F0A] py-4 rounded-2xl font-bold text-base hover:bg-[#D4AE85] transition-colors shadow-xl shadow-[#C19A6B]/20"
        >
          Valider snapshot {slot}
          {slot === '14h' && ' → Gestion du soir'}
        </motion.button>
      </div>
    </div>
  );
}