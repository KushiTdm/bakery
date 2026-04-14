'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, GripVertical,
  Eye, EyeOff, Zap, ZapOff, Pencil, Trash2,
  AlertTriangle, ChevronDown, Package, Sparkles, FlaskConical, Info,
} from 'lucide-react';
import {
  useProduitsBoulanger,
  type Produit,
  type ProduitDraft,
  CATEGORIE_LABELS,
} from '@/hooks/use-produits-boulanger';
import { supabase } from '@/lib/supabase';
import ProduitFormModal from './produit-form-modal';
import CatalogueStarter from './catalogue-starter';
import TemplatePickerModal from './template-picker-modal';
import RecetteModal from './recette-modal';
import type { RecipeStatus, ProduitAvecRecette } from '@/app/api/boulanger/recettes/route';

// ── Badge recette ─────────────────────────────────────────────

function RecetteBadge({ status }: { status: RecipeStatus | null }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  if (status === 'specific') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{ background: 'rgba(34,197,94,0.12)', color: 'rgba(74,222,128,0.80)' }}>
        <FlaskConical size={8} />
        recette perso
      </span>
    );
  }

  if (status === 'categorie') {
    return (
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setTooltipOpen(v => !v)}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full cursor-help"
          style={{ background: 'rgba(249,115,22,0.12)', color: 'rgba(251,146,60,0.80)' }}
        >
          <Info size={8} />
          sans recette
        </button>
        <AnimatePresence>
          {tooltipOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-full mt-1.5 z-20 w-56 rounded-xl shadow-2xl pointer-events-none"
              style={{
                background:  '#1A0F08',
                border:      '1px solid rgba(249,115,22,0.25)',
                padding:     '10px 12px',
              }}
            >
              <p className="text-orange-300/90 text-[10px] font-semibold mb-1">
                Pas de recette enregistrée
              </p>
              <p className="text-white/45 text-[10px] leading-relaxed">
                Ce produit utilise une estimation générique par catégorie.
                Pour un calcul précis des matières premières, cliquez sur
                l'icône <FlaskConical className="inline" size={9} /> pour
                saisir sa recette.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // template — pas de badge particulier, mais on pourrait en ajouter un
  return null;
}

// ── Carte produit ─────────────────────────────────────────────

function ProduitCard({
  produit, index, onEdit, onDelete, onToggle,
  onDragStart, onDragEnter, onDragEnd, isDraggingOver,
  recipeStatus, onEditRecette,
}: {
  produit:        Produit;
  index:          number;
  onEdit:         () => void;
  onDelete:       () => void;
  onToggle:       (champ: 'actif_catalogue' | 'actif_flash') => void;
  onDragStart:    (index: number) => void;
  onDragEnter:    (index: number) => void;
  onDragEnd:      () => void;
  isDraggingOver: boolean;
  recipeStatus:   RecipeStatus | null;
  onEditRecette:  () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragging, setDragging]           = useState(false);

  return (
    <div
      draggable
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        setDragging(true);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
      }}
      onDragEnter={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        onDragEnter(index);
      }}
      onDragEnd={() => { setDragging(false); onDragEnd(); }}
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => e.preventDefault()}
      className={[
        'border rounded-2xl overflow-visible transition-all select-none',
        dragging        ? 'opacity-40 scale-[0.98]' : '',
        isDraggingOver  ? 'border-[#C19A6B]/60 bg-[#C19A6B]/5' : 'bg-white/5 border-white/8',
        !produit.actif_catalogue ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 p-3">
        <div className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing flex-shrink-0 px-1 touch-none">
          <GripVertical size={16} />
        </div>
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/8 flex items-center justify-center">
          {produit.image_public_url ? (
            <img src={produit.image_public_url} alt={produit.nom} className="w-full h-full object-cover" draggable={false} />
          ) : (
            <span className="text-2xl">{produit.emoji}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-white font-medium text-sm truncate">{produit.nom}</p>
            {produit.allergenes.length > 0 && (
              <span className="text-[10px] text-amber-400/60 flex-shrink-0">⚠ {produit.allergenes.length}</span>
            )}
            {recipeStatus !== null && (
              <RecetteBadge status={recipeStatus} />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[#C19A6B] text-xs font-bold font-mono">{produit.prix_vente.toFixed(2)}€</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-white/30 text-xs capitalize">{produit.categorie}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onToggle('actif_catalogue')}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${produit.actif_catalogue ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25' : 'bg-white/5 text-white/25 hover:bg-white/10'}`}
          >
            {produit.actif_catalogue ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={() => onToggle('actif_flash')}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${produit.actif_flash ? 'bg-yellow-400/15 text-yellow-400 hover:bg-yellow-400/25' : 'bg-white/5 text-white/25 hover:bg-white/10'}`}
          >
            {produit.actif_flash ? <Zap size={14} /> : <ZapOff size={14} />}
          </button>
          {/* Bouton édition recette */}
          <button
            onClick={onEditRecette}
            title="Modifier la recette MP"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              recipeStatus === 'specific'
                ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                : recipeStatus === 'categorie'
                  ? 'bg-orange-500/12 text-orange-400/70 hover:bg-orange-500/20 hover:text-orange-400'
                  : 'bg-white/5 text-white/30 hover:bg-[#C19A6B]/12 hover:text-[#C19A6B]'
            }`}
          >
            <FlaskConical size={13} />
          </button>
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-lg bg-white/5 text-white/40 hover:bg-[#C19A6B]/15 hover:text-[#C19A6B] flex items-center justify-center transition-all"
          >
            <Pencil size={14} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={onDelete} className="px-2 py-1 text-[10px] font-bold bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">Confirmer</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">Annuler</button>
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
    </div>
  );
}

// ── Hook drag & drop ──────────────────────────────────────────

function useDragDrop(items: Produit[], onReorder: (ids: string[]) => Promise<void>) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => { dragIndex.current = index; };
  const handleDragEnter = (index: number) => {
    if (dragIndex.current === null || dragIndex.current === index) return;
    setOverIndex(index);
  };
  const handleDragEnd = () => {
    if (dragIndex.current !== null && overIndex !== null && dragIndex.current !== overIndex) {
      const reordered = [...items];
      const [moved] = reordered.splice(dragIndex.current, 1);
      reordered.splice(overIndex, 0, moved);
      onReorder(reordered.map(p => p.id));
    }
    dragIndex.current = null;
    setOverIndex(null);
  };

  return { overIndex, handleDragStart, handleDragEnter, handleDragEnd };
}

// ── Section catégorie ─────────────────────────────────────────

function CategorieSection({
  categorie, produits, globalOffset, overIndex,
  onEdit, onDelete, onToggle, onDragStart, onDragEnter, onDragEnd,
  recipeStatusMap, onEditRecette,
}: {
  categorie:       Produit['categorie'];
  produits:        Produit[];
  globalOffset:    number;
  overIndex:       number | null;
  onEdit:          (p: Produit) => void;
  onDelete:        (id: string) => void;
  onToggle:        (id: string, champ: 'actif_catalogue' | 'actif_flash') => void;
  onDragStart:     (index: number) => void;
  onDragEnter:     (index: number) => void;
  onDragEnd:       () => void;
  recipeStatusMap: Map<string, RecipeStatus>;
  onEditRecette:   (p: Produit) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const actifs = produits.filter(p => p.actif_catalogue).length;
  const flashs = produits.filter(p => p.actif_flash).length;

  return (
    <div className="mb-4">
      <button onClick={() => setCollapsed(v => !v)} className="flex items-center gap-2 w-full mb-2 group">
        <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">{CATEGORIE_LABELS[categorie]}</p>
        <span className="text-white/20 text-xs">{produits.length} produit{produits.length > 1 ? 's' : ''}</span>
        <div className="flex gap-1 ml-auto">
          <span className="bg-green-500/15 text-green-400 text-[10px] px-1.5 py-0.5 rounded-full">{actifs} actif{actifs > 1 ? 's' : ''}</span>
          <span className="bg-yellow-400/15 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded-full">{flashs} flash</span>
        </div>
        <ChevronDown size={14} className={`text-white/25 group-hover:text-white/50 transition-all ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-2 overflow-visible">
            {produits.map((p, localIdx) => {
              const globalIdx = globalOffset + localIdx;
              return (
                <ProduitCard
                  key={p.id}
                  produit={p}
                  index={globalIdx}
                  onEdit={() => onEdit(p)}
                  onDelete={() => onDelete(p.id)}
                  onToggle={champ => onToggle(p.id, champ)}
                  onDragStart={onDragStart}
                  onDragEnter={onDragEnter}
                  onDragEnd={onDragEnd}
                  isDraggingOver={overIndex === globalIdx}
                  recipeStatus={recipeStatusMap.get(p.id) ?? null}
                  onEditRecette={() => onEditRecette(p)}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────

export default function Catalogue() {
  const { produits, loading, error, creer, modifier, supprimer, toggleActif, uploaderPhoto, reordonner, refetch } = useProduitsBoulanger();

  const [search, setSearch]                     = useState('');
  const [filterActif, setFilterActif]           = useState<'all' | 'actif' | 'inactif'>('all');
  const [filterFlash, setFilterFlash]           = useState(false);
  const [modalOpen, setModalOpen]               = useState(false);
  const [editingProduit, setEditingProduit]     = useState<Produit | null>(null);
  const [templateInitialValues, setTemplateInitialValues] = useState<Partial<ProduitDraft> | null>(null);
  // Template picker (catalogue non vide)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  // État wizard onboarding
  const [showStarter, setShowStarter]           = useState(false);
  const [starterDismissed, setStarterDismissed] = useState(false);

  // ── Recettes MP ────────────────────────────────────────────
  const [recipeStatusMap,  setRecipeStatusMap]  = useState<Map<string, RecipeStatus>>(new Map());
  const [recipeDataMap,    setRecipeDataMap]     = useState<Map<string, ProduitAvecRecette>>(new Map());
  const [recetteModal,     setRecetteModal]      = useState<Produit | null>(null);

  const loadRecipes = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/boulanger/recettes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const { produits: data } = await res.json() as { produits: ProduitAvecRecette[] };
      const statusMap = new Map<string, RecipeStatus>();
      const dataMap   = new Map<string, ProduitAvecRecette>();
      for (const p of data ?? []) {
        statusMap.set(p.produit_id, p.status);
        dataMap.set(p.produit_id, p);
      }
      setRecipeStatusMap(statusMap);
      setRecipeDataMap(dataMap);
    } catch { /* silent — non-bloquant */ }
  }, []);

  useEffect(() => {
    if (!loading && produits.length > 0) loadRecipes();
  }, [loading, produits.length, loadRecipes]);

  // 🆕 Déclenche CatalogueStarter si catalogue vide et non ignoré
  const shouldShowStarter = !loading && produits.length === 0 && !starterDismissed && !showStarter;

  const filtered = produits.filter(p => {
    if (search && !p.nom.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterActif === 'actif'   && !p.actif_catalogue) return false;
    if (filterActif === 'inactif' &&  p.actif_catalogue) return false;
    if (filterFlash && !p.actif_flash) return false;
    return true;
  });

  const categories = ['boulangerie', 'viennoiserie', 'patisserie', 'sandwich'] as const;
  const grouped = {
    boulangerie:  filtered.filter(p => p.categorie === 'boulangerie'),
    viennoiserie: filtered.filter(p => p.categorie === 'viennoiserie'),
    patisserie:   filtered.filter(p => p.categorie === 'patisserie'),
    sandwich:     filtered.filter(p => p.categorie === 'sandwich'),
  };

  const { overIndex, handleDragStart, handleDragEnter, handleDragEnd } = useDragDrop(filtered, reordonner);

  const offsets = {
    boulangerie:  0,
    viennoiserie: grouped.boulangerie.length,
    patisserie:   grouped.boulangerie.length + grouped.viennoiserie.length,
    sandwich:     grouped.boulangerie.length + grouped.viennoiserie.length + grouped.patisserie.length,
  };

  const handleEdit  = (p: Produit) => { setEditingProduit(p); setTemplateInitialValues(null); setModalOpen(true); };
  // Ouvre le picker de templates avant le formulaire (catalogue non vide)
  const handleNew   = ()           => { setEditingProduit(null); setShowTemplatePicker(true); };
  const handleClose = ()           => { setModalOpen(false); setEditingProduit(null); setTemplateInitialValues(null); };

  // Sélection d'un template → pré-remplit le formulaire
  const handleTemplateSelect = (draft: Partial<ProduitDraft>) => {
    setShowTemplatePicker(false);
    setTemplateInitialValues(draft);
    setModalOpen(true);
  };
  // Créer depuis zéro
  const handleScratch = () => {
    setShowTemplatePicker(false);
    setTemplateInitialValues(null);
    setModalOpen(true);
  };

  const handleSave = async (draft: ProduitDraft) => {
    if (editingProduit) await modifier(editingProduit.id, draft);
    else                await creer(draft);
    handleClose();
  };

  // 🆕 Handler CatalogueStarter : crée tous les produits sélectionnés en batch
  const handleStarterValider = async (drafts: ProduitDraft[]) => {
    // Création en série pour préserver l'ordre
    for (const draft of drafts) {
      await creer(draft);
    }
    setStarterDismissed(true);
    setShowStarter(false);
  };

  const nbTotal  = produits.length;
  const nbActifs = produits.filter(p => p.actif_catalogue).length;
  const nbFlash  = produits.filter(p => p.actif_flash).length;

  // ── 🆕 Affichage CatalogueStarter ────────────────────────────
  if (shouldShowStarter || showStarter) {
    return (
      <CatalogueStarter
        onValider={handleStarterValider}
        onIgnorer={() => { setStarterDismissed(true); setShowStarter(false); }}
      />
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6" data-tour="catalogue-header">
        <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-1">Catalogue</p>
        <div className="flex items-end justify-between">
          <h2 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
            Mes produits
          </h2>
          <div className="flex items-center gap-2">
            {/* 🆕 Bouton pour re-déclencher le wizard */}
            {produits.length === 0 && starterDismissed && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => { setStarterDismissed(false); setShowStarter(true); }}
                className="flex items-center gap-1.5 bg-white/8 border border-white/12 text-white/50 px-3 py-2 rounded-xl text-xs hover:bg-[#C19A6B]/15 hover:text-[#C19A6B] transition-all"
              >
                <Sparkles size={13} /> Démarrage rapide
              </motion.button>
            )}
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        {([
          { label: 'Total',  value: nbTotal,  color: 'text-white',      icon: null },
          { label: 'Actifs', value: nbActifs, color: 'text-green-400',  icon: <Eye size={12} /> },
          { label: 'Flash',  value: nbFlash,  color: 'text-yellow-400', icon: <Zap size={12} /> },
        ] as const).map(kpi => (
          <div key={kpi.label} className="bg-white/5 border border-white/8 rounded-xl p-3 text-center">
            <div className={`flex items-center justify-center gap-1 ${kpi.color}`}>
              {kpi.icon}
              <span className="font-bold text-xl font-mono">{kpi.value}</span>
            </div>
            <p className="text-white/30 text-[10px] uppercase tracking-wider mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Recherche + filtres */}
      <div className="flex gap-2 mb-4">
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
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${filterFlash ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/8'}`}
        >
          <Zap size={12} /> Flash
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

      {produits.length > 1 && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <GripVertical size={12} className="text-white/20" />
          <p className="text-white/25 text-xs">Glissez les lignes pour réordonner</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-white/4 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {/* 🆕 État vide avec proposition CatalogueStarter */}
      {!loading && produits.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={28} className="text-white/20" />
          </div>
          <p className="text-white/50 font-medium mb-1">Aucun produit</p>
          <p className="text-white/25 text-sm mb-6">
            Commencez avec nos modèles pré-configurés ou créez manuellement.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <button
              onClick={() => setShowStarter(true)}
              className="flex items-center justify-center gap-2 bg-[#C19A6B] text-[#1A0F0A] px-5 py-3 rounded-xl font-bold text-sm"
            >
              <Sparkles size={16} /> Démarrage rapide (12 produits)
            </button>
            <button
              onClick={handleNew}
              className="flex items-center justify-center gap-2 bg-white/8 border border-white/12 text-white/60 px-5 py-3 rounded-xl text-sm"
            >
              <Plus size={14} /> Créer manuellement
            </button>
          </div>
        </div>
      )}

      {/* Liste groupée */}
      {!loading && produits.length > 0 && (
        <>
          {categories.map(cat =>
            grouped[cat].length > 0 ? (
              <CategorieSection
                key={cat}
                categorie={cat}
                produits={grouped[cat]}
                globalOffset={offsets[cat]}
                overIndex={overIndex}
                onEdit={handleEdit}
                onDelete={id => supprimer(id)}
                onToggle={(id, champ) => toggleActif(id, champ)}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragEnd={handleDragEnd}
                recipeStatusMap={recipeStatusMap}
                onEditRecette={p => setRecetteModal(p)}
              />
            ) : null
          )}
          {filtered.length === 0 && produits.length > 0 && (
            <p className="text-white/30 text-sm text-center py-8">
              Aucun produit ne correspond à votre recherche
            </p>
          )}
        </>
      )}

      {/* Légende */}
      {!loading && produits.length > 0 && (
        <div className="mt-6 bg-white/3 border border-white/6 rounded-xl p-4">
          <p className="text-white/30 text-xs font-semibold uppercase tracking-wider mb-2">Légende</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/40">
            <div className="flex items-center gap-2"><Eye size={12} className="text-green-400" /> Visible catalogue</div>
            <div className="flex items-center gap-2"><EyeOff size={12} className="text-white/25" /> Masqué catalogue</div>
            <div className="flex items-center gap-2"><Zap size={12} className="text-yellow-400" /> Inclus flash soir</div>
            <div className="flex items-center gap-2"><ZapOff size={12} className="text-white/25" /> Exclu flash soir</div>
            <div className="flex items-center gap-2"><FlaskConical size={12} className="text-green-400" /> Recette personnalisée</div>
            <div className="flex items-center gap-2"><FlaskConical size={12} className="text-orange-400/70" /> Estimation générique</div>
          </div>
        </div>
      )}

      {/* Picker de templates (avant le formulaire, en mode création) */}
      <AnimatePresence>
        {showTemplatePicker && (
          <TemplatePickerModal
            existingNames={produits.map(p => p.nom)}
            onSelect={handleTemplateSelect}
            onScratch={handleScratch}
            onClose={() => setShowTemplatePicker(false)}
          />
        )}
      </AnimatePresence>

      {/* Modal produit */}
      <AnimatePresence>
        {modalOpen && (
          <ProduitFormModal
            produit={editingProduit}
            initialValues={templateInitialValues ?? undefined}
            onSave={handleSave}
            onClose={handleClose}
            onUploadPhoto={uploaderPhoto}
            existingNames={produits.map(p => p.nom)}
          />
        )}
      </AnimatePresence>

      {/* Modal recette MP */}
      <AnimatePresence>
        {recetteModal && (
          <RecetteModal
            produitId={recetteModal.id}
            produitNom={recetteModal.nom}
            produitEmoji={recetteModal.emoji}
            status={recipeStatusMap.get(recetteModal.id) ?? 'categorie'}
            recette={recipeDataMap.get(recetteModal.id)?.recette ?? null}
            onClose={() => setRecetteModal(null)}
            onSaved={() => { setRecetteModal(null); loadRecipes(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}