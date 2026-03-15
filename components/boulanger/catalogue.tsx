'use client';
// components/boulanger/catalogue.tsx
// Liste des produits avec toggles actif/flash, drag & drop,
// et accès au formulaire de création/édition.

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Filter, GripVertical,
  Eye, EyeOff, Zap, ZapOff, Pencil, Trash2,
  AlertTriangle, ChevronDown, Package
} from 'lucide-react';
import {
  useProduitsBoulanger,
  type Produit,
  CATEGORIE_LABELS,
  ALLERGENES_LABELS,
} from '@/hooks/use-produits-boulanger';
import ProduitFormModal from './produit-form-modal';

// ── Carte produit ─────────────────────────────────────────────

function ProduitCard({
  produit,
  onEdit,
  onDelete,
  onToggle,
  isDragging,
  dragHandleProps,
}: {
  produit:         Produit;
  onEdit:          () => void;
  onDelete:        () => void;
  onToggle:        (champ: 'actif_catalogue' | 'actif_flash') => void;
  isDragging:      boolean;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`bg-white/5 border rounded-2xl overflow-hidden transition-colors ${
        isDragging ? 'border-[#C19A6B]/50 shadow-lg shadow-[#C19A6B]/10' : 'border-white/8'
      } ${!produit.actif_catalogue ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3 p-3">

        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing flex-shrink-0 px-1"
        >
          <GripVertical size={16} />
        </div>

        {/* Photo ou emoji */}
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/8 flex items-center justify-center">
          {produit.image_public_url ? (
            <img
              src={produit.image_public_url}
              alt={produit.nom}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl">{produit.emoji}</span>
          )}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-medium text-sm truncate">{produit.nom}</p>
            {produit.allergenes.length > 0 && (
              <span className="text-[10px] text-amber-400/60 flex-shrink-0">
                ⚠ {produit.allergenes.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[#C19A6B] text-xs font-bold font-mono">
              {produit.prix_vente.toFixed(2)}€
            </span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-white/30 text-xs capitalize">{produit.categorie}</span>
            {produit.prix_flash_override && (
              <>
                <span className="text-white/20 text-xs">·</span>
                <span className="text-yellow-400/60 text-xs font-mono">
                  flash: {produit.prix_flash_override.toFixed(2)}€
                </span>
              </>
            )}
          </div>
        </div>

        {/* Toggles + actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Toggle catalogue */}
          <button
            onClick={() => onToggle('actif_catalogue')}
            title={produit.actif_catalogue ? 'Masquer du catalogue' : 'Afficher dans le catalogue'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              produit.actif_catalogue
                ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                : 'bg-white/5 text-white/25 hover:bg-white/10'
            }`}
          >
            {produit.actif_catalogue ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          {/* Toggle flash */}
          <button
            onClick={() => onToggle('actif_flash')}
            title={produit.actif_flash ? 'Exclure du flash' : 'Inclure dans le flash'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              produit.actif_flash
                ? 'bg-yellow-400/15 text-yellow-400 hover:bg-yellow-400/25'
                : 'bg-white/5 text-white/25 hover:bg-white/10'
            }`}
          >
            {produit.actif_flash ? <Zap size={14} /> : <ZapOff size={14} />}
          </button>

          {/* Éditer */}
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-lg bg-white/5 text-white/40 hover:bg-[#C19A6B]/15 hover:text-[#C19A6B] flex items-center justify-center transition-all"
          >
            <Pencil size={14} />
          </button>

          {/* Supprimer */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                className="px-2 py-1 text-[10px] font-bold bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                Confirmer
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-8 h-8 rounded-lg bg-white/5 text-white/25 hover:bg-red-500/15 hover:text-red-400 flex items-center justify-center transition-all"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Groupe par catégorie ──────────────────────────────────────

function CategorieSection({
  categorie,
  produits,
  onEdit,
  onDelete,
  onToggle,
}: {
  categorie: Produit['categorie'];
  produits:  Produit[];
  onEdit:    (p: Produit) => void;
  onDelete:  (id: string) => void;
  onToggle:  (id: string, champ: 'actif_catalogue' | 'actif_flash') => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const actifs  = produits.filter(p => p.actif_catalogue).length;
  const flashs  = produits.filter(p => p.actif_flash).length;

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-2 w-full mb-2 group"
      >
        <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">
          {CATEGORIE_LABELS[categorie]}
        </p>
        <span className="text-white/20 text-xs">{produits.length} produit{produits.length > 1 ? 's' : ''}</span>
        <div className="flex gap-1 ml-auto">
          <span className="bg-green-500/15 text-green-400 text-[10px] px-1.5 py-0.5 rounded-full">
            {actifs} actif{actifs > 1 ? 's' : ''}
          </span>
          <span className="bg-yellow-400/15 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded-full">
            {flashs} flash
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-white/25 group-hover:text-white/50 transition-all ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-2 overflow-hidden"
          >
            {produits.map(p => (
              <ProduitCard
                key={p.id}
                produit={p}
                onEdit={() => onEdit(p)}
                onDelete={() => onDelete(p.id)}
                onToggle={champ => onToggle(p.id, champ)}
                isDragging={false}
                dragHandleProps={{}}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────

export default function Catalogue() {
  const {
    produits, loading, error, saving,
    creer, modifier, supprimer, toggleActif, uploaderPhoto,
  } = useProduitsBoulanger();

  const [search, setSearch]         = useState('');
  const [filterActif, setFilterActif] = useState<'all' | 'actif' | 'inactif'>('all');
  const [filterFlash, setFilterFlash] = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingProduit, setEditingProduit] = useState<Produit | null>(null);

  // Filtre + recherche
  const filtered = produits.filter(p => {
    if (search && !p.nom.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterActif === 'actif'   && !p.actif_catalogue) return false;
    if (filterActif === 'inactif' &&  p.actif_catalogue) return false;
    if (filterFlash && !p.actif_flash) return false;
    return true;
  });

  // Groupement par catégorie
  const grouped = {
    boulangerie:  filtered.filter(p => p.categorie === 'boulangerie'),
    viennoiserie: filtered.filter(p => p.categorie === 'viennoiserie'),
    patisserie:   filtered.filter(p => p.categorie === 'patisserie'),
  };

  const handleEdit = (p: Produit) => { setEditingProduit(p); setModalOpen(true); };
  const handleNew  = () => { setEditingProduit(null); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); setEditingProduit(null); };

  const handleSave = async (draft: Parameters<typeof creer>[0]) => {
    if (editingProduit) {
      await modifier(editingProduit.id, draft);
    } else {
      await creer(draft);
    }
    handleCloseModal();
  };

  const handleDelete = async (id: string) => {
    await supprimer(id);
  };

  const handleToggle = async (id: string, champ: 'actif_catalogue' | 'actif_flash') => {
    await toggleActif(id, champ);
  };

  // Stats rapides
  const nbTotal  = produits.length;
  const nbActifs = produits.filter(p => p.actif_catalogue).length;
  const nbFlash  = produits.filter(p => p.actif_flash).length;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6" data-tour="catalogue-header">
        <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-1">
          Catalogue
        </p>
        <div className="flex items-end justify-between">
          <h2 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
            Mes produits
          </h2>
          <motion.button
            data-tour="catalogue-add-btn"
            whileTap={{ scale: 0.95 }}
            onClick={handleNew}
            className="flex items-center gap-2 bg-[#C19A6B] text-[#1A0F0A] px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#D4AE85] transition-colors"
          >
            <Plus size={16} />
            Ajouter
          </motion.button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total',   value: nbTotal,  color: 'text-white' },
          { label: 'Actifs',  value: nbActifs, color: 'text-green-400', icon: <Eye size={12} /> },
          { label: 'Flash',   value: nbFlash,  color: 'text-yellow-400', icon: <Zap size={12} /> },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white/5 border border-white/8 rounded-xl p-3 text-center">
            <div className={`flex items-center justify-center gap-1 ${kpi.color}`}>
              {kpi.icon}
              <span className="font-bold text-xl font-mono">{kpi.value}</span>
            </div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Barre de recherche + filtres */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            placeholder="Rechercher un produit…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/40 transition-colors"
          />
        </div>

        <button
          onClick={() => setFilterFlash(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            filterFlash
              ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
              : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/8'
          }`}
        >
          <Zap size={12} />
          Flash
        </button>

        <select
          value={filterActif}
          onChange={e => setFilterActif(e.target.value as typeof filterActif)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/60 text-xs outline-none focus:border-[#C19A6B]/40 transition-colors"
        >
          <option value="all">Tous</option>
          <option value="actif">Actifs</option>
          <option value="inactif">Inactifs</option>
        </select>
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-16 bg-white/4 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* État vide */}
      {!loading && produits.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={28} className="text-white/20" />
          </div>
          <p className="text-white/50 font-medium mb-1">Aucun produit</p>
          <p className="text-white/25 text-sm mb-6">
            Ajoutez vos premiers produits pour les proposer en click & collect
          </p>
          <button
            onClick={handleNew}
            className="bg-[#C19A6B] text-[#1A0F0A] px-5 py-2.5 rounded-xl font-bold text-sm"
          >
            Ajouter mon premier produit
          </button>
        </div>
      )}

      {/* Liste groupée */}
      {!loading && (
        <>
          {(['boulangerie', 'viennoiserie', 'patisserie'] as const).map(cat => (
            grouped[cat].length > 0 && (
              <CategorieSection
                key={cat}
                categorie={cat}
                produits={grouped[cat]}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            )
          ))}

          {filtered.length === 0 && produits.length > 0 && (
            <p className="text-white/30 text-sm text-center py-8">
              Aucun produit ne correspond à votre recherche
            </p>
          )}
        </>
      )}

      {/* Légende */}
      {!loading && produits.length > 0 && (
        <div className="mt-6 bg-white/3 border border-white/6 rounded-xl p-4 space-y-2">
          <p className="text-white/30 text-xs font-semibold uppercase tracking-wider mb-2">Légende</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/40">
            <div className="flex items-center gap-2">
              <Eye size={12} className="text-green-400" />
              Visible dans le catalogue
            </div>
            <div className="flex items-center gap-2">
              <EyeOff size={12} className="text-white/25" />
              Masqué du catalogue
            </div>
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-yellow-400" />
              Inclus dans le flash soir
            </div>
            <div className="flex items-center gap-2">
              <ZapOff size={12} className="text-white/25" />
              Exclu du flash soir
            </div>
          </div>
        </div>
      )}

      {/* Modal formulaire */}
      <AnimatePresence>
        {modalOpen && (
          <ProduitFormModal
            produit={editingProduit}
            onSave={handleSave}
            onClose={handleCloseModal}
            onUploadPhoto={uploaderPhoto}
          />
        )}
      </AnimatePresence>
    </div>
  );
}