'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, ChevronRight, Sparkles } from 'lucide-react';
import { type ProduitDraft } from '@/hooks/use-produits-boulanger';
import { PRODUCT_TEMPLATES } from '@/lib/product-templates';

const CAT_LABELS: Record<string, string> = {
  boulangerie:  '🥖 Boulangerie',
  viennoiserie: '🥐 Viennoiserie',
  patisserie:   '🎂 Pâtisserie',
  sandwich:     '🥪 Snacking',
};

// ── Composant ─────────────────────────────────────────────────

interface Props {
  onValider:  (produits: ProduitDraft[]) => Promise<void>;
  onIgnorer:  () => void;
}

export default function CatalogueStarter({ onValider, onIgnorer }: Props) {
  const [items, setItems] = useState(() =>
    PRODUCT_TEMPLATES.map(t => ({ ...t, coché: t.cochéParDéfaut }))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setItems(prev => prev.map(p => p.id === id ? { ...p, coché: !p.coché } : p));
  };

  const updatePrix = (id: string, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      setItems(prev => prev.map(p => p.id === id ? { ...p, prix_vente: n } : p));
    }
  };

  const nbSélectionnés = items.filter(p => p.coché).length;

  const handleValider = async () => {
    const sélectionnés = items.filter(p => p.coché);
    if (sélectionnés.length === 0) return;

    setSaving(true);
    try {
      const drafts: ProduitDraft[] = sélectionnés.map((p, i) => ({
        nom:                      p.nom,
        description:              null,
        categorie:                p.categorie,
        emoji:                    p.emoji,
        prix_vente:               p.prix_vente,
        cout_production:          p.cout_production,
        actif_catalogue:          true,
        actif_flash:              true,
        ordre:                    i,
        prix_flash_override:      null,
        allergenes:               p.allergenes,
        disponible_du:            null,
        disponible_au:            null,
        stock_alerte:             null,
        note_interne:             null,
        image_url:                null,
        image_storage_path:       null,
        duree_conservation_jours: 1,
      }));

      await onValider(drafts);
    } finally {
      setSaving(false);
    }
  };

  const grouped = ['boulangerie', 'viennoiserie', 'patisserie', 'sandwich'] as const;

  return (
    <div className="pb-24">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#C19A6B]/15 rounded-2xl flex items-center justify-center">
            <Sparkles size={20} className="text-[#C19A6B]" />
          </div>
          <div>
            <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase">
              Premier démarrage
            </p>
            <h2 className="text-white text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
              Votre catalogue de départ
            </h2>
          </div>
        </div>
        <p className="text-white/45 text-sm leading-relaxed">
          Cochez les produits que vous proposez et ajustez les prix.
          Vous pourrez tout modifier ensuite.
        </p>
      </motion.div>

      {/* Liste produits par catégorie */}
      {grouped.map((cat, catIdx) => {
        const catItems = items.filter(p => p.categorie === cat);
        if (catItems.length === 0) return null;
        const nbCochés = catItems.filter(p => p.coché).length;

        return (
          <motion.div
            key={cat}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: catIdx * 0.08 }}
            className="mb-5"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">
                {CAT_LABELS[cat]}
              </p>
              <span className="text-[#C19A6B] text-xs">
                {nbCochés} / {catItems.length}
              </span>
            </div>

            <div className="space-y-2">
              {catItems.map((produit, i) => (
                <motion.div
                  key={produit.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: catIdx * 0.08 + i * 0.04 }}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                    produit.coché
                      ? 'bg-[#C19A6B]/8 border-[#C19A6B]/25'
                      : 'bg-white/4 border-white/8 hover:bg-white/6'
                  }`}
                  onClick={() => { if (editingId !== produit.id) toggle(produit.id); }}
                >
                  {/* Checkbox */}
                  <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center transition-all ${
                    produit.coché ? 'bg-[#C19A6B]' : 'border-2 border-white/20'
                  }`}>
                    {produit.coché && <Check size={12} className="text-[#1A0F0A]" />}
                  </div>

                  {/* Image ou emoji */}
                  <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 bg-white/8 flex items-center justify-center">
                    <img
                      src={produit.image}
                      alt={produit.nom}
                      className="w-full h-full object-cover"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                      }}
                    />
                    <span className="text-xl hidden">{produit.emoji}</span>
                  </div>

                  {/* Nom */}
                  <p className={`flex-1 text-sm font-medium ${produit.coché ? 'text-white' : 'text-white/50'}`}>
                    {produit.nom}
                  </p>

                  {/* Prix éditable */}
                  <div
                    className="flex items-center gap-1 flex-shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    {editingId === produit.id ? (
                      <input
                        type="number"
                        step="0.10"
                        min="0.10"
                        defaultValue={produit.prix_vente.toFixed(2)}
                        autoFocus
                        onBlur={e => {
                          updatePrix(produit.id, e.target.value);
                          setEditingId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            updatePrix(produit.id, (e.target as HTMLInputElement).value);
                            setEditingId(null);
                          }
                        }}
                        className="w-16 text-center bg-[#C19A6B]/20 border border-[#C19A6B]/50 rounded-lg text-white font-mono text-sm outline-none py-1 px-1"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingId(produit.id)}
                        className={`font-mono text-sm font-bold px-2 py-1 rounded-lg transition-colors ${
                          produit.coché
                            ? 'text-[#C19A6B] hover:bg-[#C19A6B]/10'
                            : 'text-white/25 hover:bg-white/5'
                        }`}
                        title="Modifier le prix"
                      >
                        {produit.prix_vente.toFixed(2)}€
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        );
      })}

      {/* Footer sticky */}
      <div className="fixed bottom-[68px] left-0 right-0 px-4 pt-4 pb-3 bg-gradient-to-t from-[#1A0F0A] via-[#1A0F0A]/95 to-transparent">

        {/* Résumé sélection */}
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-white/30 text-sm">
            {nbSélectionnés === 0
              ? 'Aucun produit sélectionné'
              : `${nbSélectionnés} produit${nbSélectionnés > 1 ? 's' : ''} sélectionné${nbSélectionnés > 1 ? 's' : ''}`
            }
          </p>
          <button
            onClick={onIgnorer}
            className="text-white/25 text-xs hover:text-white/40 transition-colors"
          >
            Passer, je créerai mes produits manuellement →
          </button>
        </div>

        <motion.button
          whileHover={{ scale: nbSélectionnés > 0 ? 1.02 : 1 }}
          whileTap={{ scale: nbSélectionnés > 0 ? 0.97 : 1 }}
          onClick={handleValider}
          disabled={saving || nbSélectionnés === 0}
          className="w-full max-w-sm mx-auto block bg-[#C19A6B] text-[#1A0F0A] py-4 rounded-2xl font-bold text-base hover:bg-[#D4AE85] transition-colors shadow-xl shadow-[#C19A6B]/20 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving
            ? <><Loader2 size={18} className="animate-spin" /> Création en cours…</>
            : <> Créer mon catalogue ({nbSélectionnés}) <ChevronRight size={18} /></>
          }
        </motion.button>
      </div>
    </div>
  );
}
