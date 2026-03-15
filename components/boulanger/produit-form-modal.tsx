'use client';
// components/boulanger/produit-form-modal.tsx
// Formulaire création / édition d'un produit.
// Gère : infos de base, photo upload, allergènes, flash, saisonnalité.

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Upload, Camera, AlertTriangle, Zap, ZapOff,
  Calendar, Euro, Info, ChevronDown, ChevronUp,
  Loader2, Check,
} from 'lucide-react';
import {
  type Produit,
  type ProduitDraft,
  ALLERGENES_LABELS,
  ALLERGENES_LIST,
} from '@/hooks/use-produits-boulanger';

// ── Emojis rapides par catégorie ──────────────────────────────
const EMOJIS_PAR_CATEGORIE: Record<string, string[]> = {
  boulangerie:  ['🥖', '🍞', '🌾', '🫓', '🥨', '🫕'],
  viennoiserie: ['🥐', '🍫', '🧁', '🥮', '🍩', '🥞'],
  patisserie:   ['🎂', '🍰', '🍋', '🍓', '☕', '🎪'],
};

// ── Composant ─────────────────────────────────────────────────

interface Props {
  produit:         Produit | null;  // null = création
  onSave:          (draft: ProduitDraft) => Promise<void>;
  onClose:         () => void;
  onUploadPhoto:   (produitId: string, file: File) => Promise<string | null>;
}

export default function ProduitFormModal({ produit, onSave, onClose, onUploadPhoto }: Props) {
  const isEdit = !!produit;

  // ── État du formulaire ────────────────────────────────────
  const [nom,               setNom]              = useState(produit?.nom ?? '');
  const [description,       setDescription]      = useState(produit?.description ?? '');
  const [categorie,         setCategorie]        = useState<Produit['categorie']>(produit?.categorie ?? 'boulangerie');
  const [emoji,             setEmoji]            = useState(produit?.emoji ?? '🥖');
  const [prixVente,         setPrixVente]        = useState(String(produit?.prix_vente ?? ''));
  const [coutProd,          setCoutProd]         = useState(String(produit?.cout_production ?? ''));
  const [actifCatalogue,    setActifCatalogue]   = useState(produit?.actif_catalogue ?? true);
  const [actifFlash,        setActifFlash]       = useState(produit?.actif_flash ?? true);
  const [prixFlashOverride, setPrixFlashOverride] = useState(produit?.prix_flash_override ? String(produit.prix_flash_override) : '');
  const [allergenes,        setAllergenes]       = useState<string[]>(produit?.allergenes ?? []);
  const [disponibleDu,      setDisponibleDu]     = useState(produit?.disponible_du ?? '');
  const [disponibleAu,      setDisponibleAu]     = useState(produit?.disponible_au ?? '');
  const [stockAlerte,       setStockAlerte]      = useState(produit?.stock_alerte ? String(produit.stock_alerte) : '');
  const [noteInterne,       setNoteInterne]      = useState(produit?.note_interne ?? '');
  const [imageUrl,          setImageUrl]         = useState(produit?.image_url ?? '');

  // Photo preview
  const [photoPreview,  setPhotoPreview]  = useState<string | null>(produit?.image_public_url ?? null);
  const [photoFile,     setPhotoFile]     = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sections collapsibles
  const [showAllergenes,   setShowAllergenes]   = useState(allergenes.length > 0);
  const [showSaisonnalite, setShowSaisonnalite] = useState(!!(disponibleDu || disponibleAu));
  const [showAvance,       setShowAvance]       = useState(false);

  // Erreurs
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);

  // Auto-sélection emoji selon catégorie
  useEffect(() => {
    if (!isEdit) {
      setEmoji(EMOJIS_PAR_CATEGORIE[categorie][0] ?? '🥖');
    }
  }, [categorie, isEdit]);

  // ── Upload photo (preview local) ─────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, photo: 'Fichier trop lourd (max 5 MB)' }));
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    setErrors(prev => { const { photo, ...rest } = prev; return rest; });
  };

  // ── Toggle allergène ──────────────────────────────────────
  const toggleAllergene = (a: string) => {
    setAllergenes(prev =>
      prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
    );
  };

  // ── Validation ────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!nom.trim())            e.nom = 'Nom requis';
    if (!prixVente || isNaN(parseFloat(prixVente)) || parseFloat(prixVente) <= 0)
      e.prixVente = 'Prix requis (> 0)';
    if (prixFlashOverride && (isNaN(parseFloat(prixFlashOverride)) || parseFloat(prixFlashOverride) <= 0))
      e.prixFlashOverride = 'Prix flash invalide';
    if (disponibleDu && disponibleAu && disponibleDu > disponibleAu)
      e.saisonnalite = 'La date de fin doit être après la date de début';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Soumission ────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);

    try {
      const draft: ProduitDraft = {
        nom:                  nom.trim(),
        description:          description.trim() || null,
        categorie,
        emoji,
        prix_vente:           parseFloat(prixVente),
        cout_production:      parseFloat(coutProd) || 0,
        actif_catalogue:      actifCatalogue,
        actif_flash:          actifFlash,
        ordre:                produit?.ordre ?? 99,
        prix_flash_override:  prixFlashOverride ? parseFloat(prixFlashOverride) : null,
        allergenes,
        disponible_du:        disponibleDu || null,
        disponible_au:        disponibleAu || null,
        stock_alerte:         stockAlerte ? parseInt(stockAlerte) : null,
        note_interne:         noteInterne.trim() || null,
        image_url:            imageUrl.trim() || null,
        image_storage_path:   produit?.image_storage_path ?? null,
      };

      await onSave(draft);

      // Upload photo si un fichier a été sélectionné et qu'on édite un produit existant
      // Pour la création, l'upload se fait après que le produit soit créé (via onSave qui retourne l'id)
      if (photoFile && produit?.id) {
        setPhotoUploading(true);
        await onUploadPhoto(produit.id, photoFile);
        setPhotoUploading(false);
      }

    } finally {
      setSaving(false);
    }
  };

  // ── UI helpers ────────────────────────────────────────────
  const inputCls = (hasError?: boolean) =>
    `w-full bg-black/30 border rounded-xl px-3 py-2.5 text-white text-sm outline-none transition-colors ${
      hasError
        ? 'border-red-500/50 focus:border-red-500/80'
        : 'border-white/10 focus:border-[#C19A6B]/50'
    }`;

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
        className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-[#1A0F0A] border border-white/10 rounded-t-3xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex items-center justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-white/15 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4 flex-shrink-0">
          <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
            {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Formulaire scrollable */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-5">

          {/* ── Photo ──────────────────────────────────────── */}
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-2">Photo</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full h-36 bg-white/5 border-2 border-dashed border-white/10 rounded-2xl overflow-hidden cursor-pointer hover:border-[#C19A6B]/30 transition-colors group"
            >
              {photoPreview ? (
                <>
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera size={24} className="text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Upload size={20} className="text-white/25" />
                  <p className="text-white/25 text-xs">Cliquer pour ajouter une photo</p>
                  <p className="text-white/15 text-[10px]">JPG, PNG, WebP · max 5 MB</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={handleFileChange}
            />
            {errors.photo && <p className="text-red-400 text-xs mt-1">{errors.photo}</p>}
            <p className="text-white/20 text-xs mt-1">
              Ou coller une URL externe :
            </p>
            <input
              type="url"
              placeholder="https://..."
              value={imageUrl}
              onChange={e => { setImageUrl(e.target.value); if (e.target.value) setPhotoPreview(e.target.value); }}
              className={`${inputCls()} mt-1 text-xs`}
            />
          </div>

          {/* ── Infos de base ──────────────────────────────── */}
          <div className="space-y-3">
            <label className="text-white/40 text-xs uppercase tracking-wider block">Informations</label>

            {/* Nom */}
            <div>
              <input
                type="text"
                placeholder="Nom du produit *"
                value={nom}
                onChange={e => { setNom(e.target.value); setErrors(p => { const {nom:_, ...r} = p; return r; }); }}
                className={inputCls(!!errors.nom)}
              />
              {errors.nom && <p className="text-red-400 text-xs mt-1">{errors.nom}</p>}
            </div>

            {/* Description */}
            <textarea
              placeholder="Description (optionnelle)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className={`${inputCls()} resize-none`}
            />

            {/* Catégorie */}
            <div className="grid grid-cols-3 gap-2">
              {(['boulangerie', 'viennoiserie', 'patisserie'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategorie(cat)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all capitalize ${
                    categorie === cat
                      ? 'bg-[#C19A6B]/20 text-[#C19A6B] border border-[#C19A6B]/40'
                      : 'bg-white/5 text-white/40 border border-white/8 hover:bg-white/8'
                  }`}
                >
                  {cat === 'boulangerie' ? '🥖 Boulangerie'
                    : cat === 'viennoiserie' ? '🥐 Viennoiserie'
                    : '🎂 Pâtisserie'}
                </button>
              ))}
            </div>

            {/* Emoji */}
            <div>
              <p className="text-white/30 text-xs mb-1.5">Emoji</p>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS_PAR_CATEGORIE[categorie]?.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`text-xl w-10 h-10 rounded-xl transition-all ${
                      emoji === e
                        ? 'bg-[#C19A6B]/20 border border-[#C19A6B]/40 scale-110'
                        : 'bg-white/5 border border-white/8 hover:bg-white/10'
                    }`}
                  >
                    {e}
                  </button>
                ))}
                <input
                  type="text"
                  value={emoji}
                  onChange={e => setEmoji(e.target.value)}
                  maxLength={4}
                  className="w-10 h-10 bg-white/5 border border-white/8 rounded-xl text-center text-xl outline-none focus:border-[#C19A6B]/40"
                  title="Emoji personnalisé"
                />
              </div>
            </div>
          </div>

          {/* ── Prix ───────────────────────────────────────── */}
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-2">Prix</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="relative">
                  <Euro size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Prix vente *"
                    value={prixVente}
                    onChange={e => { setPrixVente(e.target.value); setErrors(p => { const {prixVente:_, ...r} = p; return r; }); }}
                    className={`${inputCls(!!errors.prixVente)} pl-7`}
                  />
                </div>
                {errors.prixVente && <p className="text-red-400 text-xs mt-1">{errors.prixVente}</p>}
              </div>
              <div className="relative">
                <Euro size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Coût production"
                  value={coutProd}
                  onChange={e => setCoutProd(e.target.value)}
                  className={`${inputCls()} pl-7`}
                />
              </div>
            </div>
          </div>

          {/* ── Visibilité ─────────────────────────────────── */}
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-2">Visibilité</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActifCatalogue(v => !v)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                  actifCatalogue
                    ? 'bg-green-500/10 border-green-500/25 text-green-300'
                    : 'bg-white/4 border-white/8 text-white/30'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${actifCatalogue ? 'bg-green-500/20' : 'bg-white/8'}`}>
                  {actifCatalogue ? <Check size={14} className="text-green-400" /> : <X size={14} className="text-white/25" />}
                </div>
                <div>
                  <p className="text-xs font-semibold">Catalogue</p>
                  <p className="text-[10px] opacity-60">Click & Collect</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActifFlash(v => !v)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                  actifFlash
                    ? 'bg-yellow-400/10 border-yellow-400/25 text-yellow-300'
                    : 'bg-white/4 border-white/8 text-white/30'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${actifFlash ? 'bg-yellow-400/20' : 'bg-white/8'}`}>
                  {actifFlash ? <Zap size={14} className="text-yellow-400 fill-current" /> : <ZapOff size={14} className="text-white/25" />}
                </div>
                <div>
                  <p className="text-xs font-semibold">Flash soir</p>
                  <p className="text-[10px] opacity-60">Invendus −40%</p>
                </div>
              </button>
            </div>

            {/* Prix flash override */}
            {actifFlash && (
              <div className="mt-3">
                <p className="text-white/30 text-xs mb-1.5 flex items-center gap-1">
                  <Info size={11} />
                  Prix flash personnalisé (laissez vide pour −40% automatique)
                </p>
                <div className="relative">
                  <Euro size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={prixVente ? `Automatique : ${(parseFloat(prixVente || '0') * 0.6).toFixed(2)}€` : 'Ex: 0.99'}
                    value={prixFlashOverride}
                    onChange={e => setPrixFlashOverride(e.target.value)}
                    className={`${inputCls(!!errors.prixFlashOverride)} pl-7`}
                  />
                </div>
                {errors.prixFlashOverride && <p className="text-red-400 text-xs mt-1">{errors.prixFlashOverride}</p>}
              </div>
            )}
          </div>

          {/* ── Allergènes (collapsible) ────────────────────── */}
          <div className="bg-white/3 border border-white/6 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAllergenes(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-white/60 text-sm font-medium">Allergènes</span>
                {allergenes.length > 0 && (
                  <span className="bg-amber-400/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full">
                    {allergenes.length} sélectionné{allergenes.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {showAllergenes ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}
            </button>

            {showAllergenes && (
              <div className="px-4 pb-4">
                <p className="text-white/25 text-xs mb-3">
                  Obligatoire selon le décret INCO (règlement EU n°1169/2011)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ALLERGENES_LIST.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAllergene(a)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all text-left ${
                        allergenes.includes(a)
                          ? 'bg-amber-400/15 border border-amber-400/30 text-amber-300'
                          : 'bg-white/4 border border-white/8 text-white/40 hover:bg-white/6'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded flex-shrink-0 flex items-center justify-center ${allergenes.includes(a) ? 'bg-amber-400' : 'border border-white/20'}`}>
                        {allergenes.includes(a) && <Check size={8} className="text-[#1A0F0A]" />}
                      </div>
                      {ALLERGENES_LABELS[a]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Saisonnalité (collapsible) ──────────────────── */}
          <div className="bg-white/3 border border-white/6 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSaisonnalite(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-[#C19A6B]" />
                <span className="text-white/60 text-sm font-medium">Disponibilité saisonnière</span>
                {(disponibleDu || disponibleAu) && (
                  <span className="bg-[#C19A6B]/15 text-[#C19A6B] text-[10px] px-1.5 py-0.5 rounded-full">
                    Configuré
                  </span>
                )}
              </div>
              {showSaisonnalite ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}
            </button>

            {showSaisonnalite && (
              <div className="px-4 pb-4">
                <p className="text-white/25 text-xs mb-3">
                  Laissez vide pour que le produit soit toujours disponible
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/30 text-xs block mb-1">Disponible à partir du</label>
                    <input
                      type="date"
                      value={disponibleDu}
                      onChange={e => setDisponibleDu(e.target.value)}
                      className={inputCls()}
                    />
                  </div>
                  <div>
                    <label className="text-white/30 text-xs block mb-1">Jusqu'au</label>
                    <input
                      type="date"
                      value={disponibleAu}
                      onChange={e => setDisponibleAu(e.target.value)}
                      className={inputCls()}
                    />
                  </div>
                </div>
                {errors.saisonnalite && <p className="text-red-400 text-xs mt-2">{errors.saisonnalite}</p>}
              </div>
            )}
          </div>

          {/* ── Avancé (collapsible) ────────────────────────── */}
          <div className="bg-white/3 border border-white/6 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAvance(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left"
            >
              <span className="text-white/40 text-sm">Options avancées</span>
              {showAvance ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}
            </button>

            {showAvance && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="text-white/30 text-xs block mb-1">
                    Alerte stock bas (notification push si ≤ X unités restantes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 5"
                    value={stockAlerte}
                    onChange={e => setStockAlerte(e.target.value)}
                    className={inputCls()}
                  />
                </div>
                <div>
                  <label className="text-white/30 text-xs block mb-1">Note interne</label>
                  <textarea
                    placeholder="Note visible uniquement par vous…"
                    value={noteInterne}
                    onChange={e => setNoteInterne(e.target.value)}
                    rows={2}
                    className={`${inputCls()} resize-none`}
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer avec bouton save */}
        <div className="px-5 py-4 border-t border-white/8 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-white/6 border border-white/10 text-white/50 font-medium text-sm hover:bg-white/10 transition-colors"
          >
            Annuler
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={saving || photoUploading}
            className="flex-[2] py-3 rounded-xl bg-[#C19A6B] text-[#1A0F0A] font-bold text-sm hover:bg-[#D4AE85] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {(saving || photoUploading)
              ? <><Loader2 size={16} className="animate-spin" /> Enregistrement…</>
              : isEdit ? '✓ Enregistrer les modifications' : '✓ Créer le produit'
            }
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}