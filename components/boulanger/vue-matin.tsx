'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, CheckCircle, TrendingUp } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

const CATEGORY_LABELS: Record<string, string> = {
  boulangerie: '🥖 Boulangerie',
  viennoiserie: '🥐 Viennoiserie',
  patisserie: '🎂 Pâtisserie',
};

// Suggestions basées sur le jour de la semaine
function getProductionHint(dayOfWeek: number, baseQty: number): string {
  if (dayOfWeek === 0 || dayOfWeek === 6) return `+30% week-end conseillé`;
  if (dayOfWeek === 3) return `+15% mercredi (enfants)`;
  return '';
}

export default function VueMatin() {
  const { todayStocks, updateProduction, setActiveView } = useBoulanger();
  const [confirmed, setConfirmed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState('');

  const today = new Date();
  const dayOfWeek = today.getDay();
  const dateLabel = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const totalPieces = todayStocks.reduce((s, p) => s + p.production, 0);
  const revenueEstimate = todayStocks.reduce((s, p) => s + p.production * p.prixVente * 0.93, 0); // 93% vendu en moyenne

  const grouped = todayStocks.reduce((acc, product) => {
    if (!acc[product.category]) acc[product.category] = [];
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, typeof todayStocks>);

  const handleConfirm = () => {
    setConfirmed(true);
    setTimeout(() => setActiveView('snapshot'), 1400);
  };

  const handleDirectInput = (id: string, val: string) => {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 0) updateProduction(id, n);
    setEditingId(null);
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
          <p className="text-white font-bold text-xl" style={{ fontFamily: 'Playfair Display, serif' }}>Production enregistrée</p>
          <p className="text-white/40 text-sm mt-1">{totalPieces} pièces · Passage au snapshot…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Header section */}
      <div className="mb-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-1">
              Production du matin
            </p>
            <h2 className="text-white text-2xl font-bold capitalize" style={{ fontFamily: 'Playfair Display, serif' }}>
              {dateLabel}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-white/30 text-xs">Estimé CA</p>
            <p className="text-[#C19A6B] font-bold text-xl font-mono">
              {revenueEstimate.toFixed(0)}€
            </p>
          </div>
        </div>

        {/* Stats rapides */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-2xl p-4">
            <p className="text-white/35 text-xs mb-1">Total pièces</p>
            <p className="text-white text-2xl font-bold font-mono">{totalPieces}</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4">
            <p className="text-white/35 text-xs mb-1">Jour similaire moy.</p>
            <div className="flex items-center gap-1.5">
              <TrendingUp size={14} className="text-[#C19A6B]" />
              <p className="text-white text-sm font-medium">+3% vs lun. dernier</p>
            </div>
          </div>
        </div>

        {(dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 3) && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-2"
          >
            <span className="text-lg">💡</span>
            <p className="text-amber-400 text-xs">
              {dayOfWeek === 3 ? 'Mercredi — augmentez viennoiseries (+15% conseillé)' : 'Week-end — augmentez toutes catégories (+30%)'}
            </p>
          </motion.div>
        )}
      </div>

      {/* Produits par catégorie */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-6">
          <p className="text-white/40 text-xs font-medium tracking-widest uppercase mb-3 px-1">
            {CATEGORY_LABELS[cat]}
          </p>
          <div className="space-y-2.5">
            {items.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white/6 border border-white/8 rounded-2xl px-4 py-3.5 flex items-center gap-4"
              >
                <span className="text-2xl flex-shrink-0">{product.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{product.name}</p>
                  <p className="text-white/30 text-xs">{product.prixVente.toFixed(2)}€ / pièce</p>
                </div>

                {/* Contrôle quantité */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => updateProduction(product.id, product.production - 1)}
                    className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-white/60 hover:bg-[#C19A6B]/20 hover:text-[#C19A6B] active:bg-[#C19A6B]/30 transition-all"
                  >
                    <Minus size={16} />
                  </motion.button>

                  {editingId === product.id ? (
                    <input
                      type="number"
                      defaultValue={product.production}
                      autoFocus
                      onBlur={e => handleDirectInput(product.id, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleDirectInput(product.id, (e.target as HTMLInputElement).value)}
                      className="w-14 text-center bg-[#C19A6B]/20 border border-[#C19A6B]/50 rounded-xl text-white font-bold text-lg font-mono outline-none py-1"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingId(product.id)}
                      className="w-14 text-center text-white font-bold text-xl font-mono hover:text-[#C19A6B] transition-colors"
                    >
                      {product.production}
                    </button>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => updateProduction(product.id, product.production + 1)}
                    className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-white/60 hover:bg-[#C19A6B]/20 hover:text-[#C19A6B] active:bg-[#C19A6B]/30 transition-all"
                  >
                    <Plus size={16} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}

      {/* Bouton confirmer — sticky en bas */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#1A0F0A] via-[#1A0F0A]/95 to-transparent">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleConfirm}
          className="w-full max-w-sm mx-auto block bg-[#C19A6B] text-[#1A0F0A] py-4 rounded-2xl font-bold text-base hover:bg-[#D4AE85] transition-colors shadow-xl shadow-[#C19A6B]/20"
        >
          Valider la production — {totalPieces} pièces
        </motion.button>
      </div>
    </div>
  );
}