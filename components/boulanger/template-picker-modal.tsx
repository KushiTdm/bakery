'use client';
// components/boulanger/template-picker-modal.tsx
// Bottom sheet de sélection d'un template produit.
// Affiché quand le boulanger clique "Ajouter" sur un catalogue non vide.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Search } from 'lucide-react';
import { type ProduitDraft } from '@/hooks/use-produits-boulanger';
import { PRODUCT_TEMPLATES, type ProduitTemplate } from '@/lib/product-templates';

const CAT_TABS = [
  { id: 'all',          label: 'Tous' },
  { id: 'boulangerie',  label: '🥖 Boulangerie' },
  { id: 'viennoiserie', label: '🥐 Viennoiserie' },
  { id: 'patisserie',   label: '🎂 Pâtisserie' },
  { id: 'sandwich',     label: '🥪 Snacking' },
] as const;

type CatTab = typeof CAT_TABS[number]['id'];

interface Props {
  /** Noms déjà dans le catalogue — pour griser les doublons */
  existingNames:  string[];
  /** Template sélectionné → ouvre le formulaire pré-rempli */
  onSelect:       (draft: Partial<ProduitDraft>) => void;
  /** Créer depuis zéro */
  onScratch:      () => void;
  onClose:        () => void;
}

function templateToDraft(t: ProduitTemplate): Partial<ProduitDraft> {
  return {
    nom:             t.nom,
    categorie:       t.categorie,
    emoji:           t.emoji,
    prix_vente:      t.prix_vente,
    cout_production: t.cout_production,
    allergenes:      t.allergenes,
    image_url:       null,
  };
}

export default function TemplatePickerModal({ existingNames, onSelect, onScratch, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<CatTab>('all');
  const [search, setSearch]       = useState('');

  const existing = new Set(existingNames.map(n => n.toLowerCase()));

  const filtered = PRODUCT_TEMPLATES.filter(t => {
    if (activeTab !== 'all' && t.categorie !== activeTab) return false;
    if (search && !t.nom.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
      />

      {/* Panneau */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-[#1A0F0A] border border-white/10 rounded-t-3xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex items-center justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-white/15 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
              Ajouter un produit
            </h2>
            <p className="text-white/35 text-xs mt-0.5">Choisissez un modèle ou créez depuis zéro</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Bouton "De zéro" */}
        <div className="px-5 pb-3 flex-shrink-0">
          <button
            onClick={onScratch}
            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-white/15 bg-white/3 hover:bg-white/6 hover:border-[#C19A6B]/30 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center group-hover:bg-[#C19A6B]/15 transition-colors">
              <Plus size={18} className="text-white/40 group-hover:text-[#C19A6B] transition-colors" />
            </div>
            <div className="text-left">
              <p className="text-white/60 text-sm font-medium group-hover:text-white/80 transition-colors">Créer depuis zéro</p>
              <p className="text-white/25 text-xs">Formulaire vide, tout à personnaliser</p>
            </div>
          </button>
        </div>

        {/* Séparateur */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/8" />
            <p className="text-white/25 text-xs">ou choisir un modèle</p>
            <div className="flex-1 h-px bg-white/8" />
          </div>
        </div>

        {/* Recherche */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              type="text"
              placeholder="Rechercher un modèle…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-2 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/40 transition-colors"
            />
          </div>
        </div>

        {/* Onglets catégorie */}
        <div className="px-5 pb-3 flex-shrink-0 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {CAT_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#C19A6B]/20 text-[#C19A6B] border border-[#C19A6B]/40'
                    : 'bg-white/5 text-white/40 border border-white/8 hover:bg-white/8'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Liste templates */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-2">
          {filtered.length === 0 && (
            <p className="text-white/30 text-sm text-center py-8">Aucun modèle trouvé</p>
          )}
          {filtered.map(t => {
            const déjàAjouté = existing.has(t.nom.toLowerCase());
            return (
              <button
                key={t.id}
                onClick={() => !déjàAjouté && onSelect(templateToDraft(t))}
                disabled={déjàAjouté}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                  déjàAjouté
                    ? 'opacity-40 cursor-not-allowed bg-white/3 border-white/6'
                    : 'bg-white/4 border-white/8 hover:bg-[#C19A6B]/8 hover:border-[#C19A6B]/25 active:scale-[0.98]'
                }`}
              >
                {/* Image */}
                <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-white/8 flex items-center justify-center">
                  <img
                    src={t.image}
                    alt={t.nom}
                    className="w-full h-full object-cover"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const span = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
                      if (span) span.style.display = '';
                    }}
                  />
                  <span className="text-2xl" style={{ display: 'none' }}>{t.emoji}</span>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-medium truncate">{t.nom}</p>
                    {déjàAjouté && (
                      <span className="text-[10px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        Déjà ajouté
                      </span>
                    )}
                  </div>
                  <p className="text-white/30 text-xs capitalize mt-0.5">{t.categorie}</p>
                </div>

                {/* Prix suggéré */}
                <span className="text-[#C19A6B] font-mono text-sm font-bold flex-shrink-0">
                  {t.prix_vente.toFixed(2)}€
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
