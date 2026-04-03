'use client';
// components/boulanger/onboarding-wizard.tsx
// ─────────────────────────────────────────────────────────────
// Wizard d'onboarding en 3 étapes pour les nouveaux inscrits :
//   1. Infos boulangerie (adresse, téléphone)
//   2. Horaires de retrait
//   3. Premiers produits (templates pré-remplis)
//
// S'affiche quand onboarding_completed_at IS NULL.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Clock, Package,
  ChevronRight, ChevronLeft, Check, Loader2,
  Plus, X, Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────

interface BoulangerieInfo {
  id: string;
  nom: string;
  slug: string;
  adresse?: string | null;
  ville?: string | null;
  code_postal?: string | null;
  telephone?: string | null;
}

interface Props {
  boulangerie: BoulangerieInfo;
  token: string;
  onComplete: () => void;
}

interface ProduitTemplate {
  nom: string;
  emoji: string;
  categorie: 'boulangerie' | 'viennoiserie' | 'patisserie' | 'sandwich';
  prix_vente: number;
  cout_production: number;
  selected: boolean;
}

// ── Étapes config ────────────────────────────────────────────

const ETAPES = [
  { id: 'infos',    icon: Store,   label: 'Ma boulangerie', color: '#C19A6B', bg: 'rgba(193,154,107,0.12)' },
  { id: 'horaires', icon: Clock,   label: 'Horaires de retrait', color: '#6FA8EA', bg: 'rgba(111,168,234,0.10)' },
  { id: 'produits', icon: Package, label: 'Mes produits', color: '#82D6A0', bg: 'rgba(130,214,160,0.10)' },
] as const;

// ── Créneaux par défaut ──────────────────────────────────────

const CRENEAUX_SUGGESTIONS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '14:00', '15:00', '16:00', '17:00', '17:30',
  '18:00', '18:30', '19:00',
];

const CRENEAUX_DEFAULT = ['08:00', '09:00', '12:00', '17:00'];

// ── Produits templates ───────────────────────────────────────

const PRODUITS_TEMPLATES: ProduitTemplate[] = [
  { nom: 'Baguette tradition',    emoji: '🥖', categorie: 'boulangerie',  prix_vente: 1.30,  cout_production: 0.40, selected: true },
  { nom: 'Pain de campagne',      emoji: '🍞', categorie: 'boulangerie',  prix_vente: 3.50,  cout_production: 1.20, selected: true },
  { nom: 'Croissant',             emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20,  cout_production: 0.35, selected: true },
  { nom: 'Pain au chocolat',      emoji: '🍫', categorie: 'viennoiserie', prix_vente: 1.30,  cout_production: 0.40, selected: true },
  { nom: 'Pain aux raisins',      emoji: '🍇', categorie: 'viennoiserie', prix_vente: 1.40,  cout_production: 0.45, selected: false },
  { nom: 'Chausson aux pommes',   emoji: '🍎', categorie: 'viennoiserie', prix_vente: 1.60,  cout_production: 0.50, selected: false },
  { nom: 'Flan pâtissier',        emoji: '🍮', categorie: 'patisserie',   prix_vente: 2.50,  cout_production: 0.80, selected: false },
  { nom: 'Tarte aux fruits',      emoji: '🥧', categorie: 'patisserie',   prix_vente: 3.50,  cout_production: 1.40, selected: false },
  { nom: 'Sandwich jambon-beurre',emoji: '🥪', categorie: 'sandwich',     prix_vente: 4.50,  cout_production: 1.80, selected: false },
  { nom: 'Sandwich poulet crudités', emoji: '🥗', categorie: 'sandwich',  prix_vente: 5.00,  cout_production: 2.00, selected: false },
];

// ── Composant ─────────────────────────────────────────────────

export default function OnboardingWizard({ boulangerie, token, onComplete }: Props) {
  const [etape, setEtape] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — Infos boulangerie
  const [adresse, setAdresse]       = useState(boulangerie.adresse || '');
  const [ville, setVille]           = useState(boulangerie.ville || '');
  const [codePostal, setCodePostal] = useState(boulangerie.code_postal || '');
  const [telephone, setTelephone]   = useState(boulangerie.telephone || '');

  // Step 2 — Horaires de retrait
  const [creneaux, setCreneaux] = useState<string[]>(CRENEAUX_DEFAULT);

  // Step 3 — Produits
  const [produits, setProduits] = useState<ProduitTemplate[]>(PRODUITS_TEMPLATES);

  const current = ETAPES[etape];
  const Icon = current.icon;

  // ── Toggle créneau ─────────────────────────────────────────

  const toggleCreneau = useCallback((c: string) => {
    setCreneaux(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c].sort()
    );
  }, []);

  // ── Toggle produit ─────────────────────────────────────────

  const toggleProduit = useCallback((index: number) => {
    setProduits(prev => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
  }, []);

  // ── Sauvegarde étape 1 ─────────────────────────────────────

  const saveInfos = async () => {
    setSaving(true);
    try {
      await fetch('/api/boulanger/profil', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          adresse: adresse || null,
          ville: ville || null,
          code_postal: codePostal || null,
          telephone: telephone || null,
        }),
      });
    } catch (e) {
      console.warn('[onboarding] saveInfos:', e);
    }
    setSaving(false);
    setEtape(1);
  };

  // ── Sauvegarde étape 2 ─────────────────────────────────────

  const saveHoraires = async () => {
    setSaving(true);
    try {
      await fetch('/api/boulanger/profil', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          creneaux_retrait: creneaux,
        }),
      });
    } catch (e) {
      console.warn('[onboarding] saveHoraires:', e);
    }
    setSaving(false);
    setEtape(2);
  };

  // ── Sauvegarde étape 3 + complete ──────────────────────────

  const saveProduits = async () => {
    setSaving(true);
    try {
      const selected = produits.filter(p => p.selected);
      for (const p of selected) {
        await fetch('/api/boulanger/produits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            nom: p.nom,
            emoji: p.emoji,
            categorie: p.categorie,
            prix_vente: p.prix_vente,
            cout_production: p.cout_production,
            actif_catalogue: true,
            actif_flash: true,
          }),
        });
      }

      // Marquer l'onboarding comme terminé
      await supabase.rpc('complete_onboarding');

      onComplete();
    } catch (e) {
      console.warn('[onboarding] saveProduits:', e);
    }
    setSaving(false);
  };

  // ── Barre de progression ───────────────────────────────────

  const progress = ((etape + 1) / ETAPES.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#1A0F0A' }}>
      {/* Texture grain */}
      <div className="fixed inset-0 opacity-[0.022] pointer-events-none z-0"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl"
            style={{ background: current.bg, border: `1px solid ${current.color}33` }}>
            <Icon size={24} style={{ color: current.color }} />
          </div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
            {current.label}
          </h1>
          <p className="text-white/30 text-xs mt-1">
            Étape {etape + 1} sur {ETAPES.length}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full mb-6 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: current.color }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <AnimatePresence mode="wait">
            {/* ── Étape 1 : Infos boulangerie ─────────────────── */}
            {etape === 0 && (
              <motion.div
                key="infos"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <p className="text-white/50 text-sm mb-4">
                  Ces informations seront affichées sur votre vitrine en ligne.
                  Vous pourrez les modifier plus tard dans les paramètres.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-white/40 mb-1">Nom de la boulangerie</label>
                    <input
                      value={boulangerie.nom}
                      disabled
                      className="w-full rounded-xl px-4 py-2.5 text-white/50 text-sm"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/40 mb-1">Adresse</label>
                    <input
                      value={adresse}
                      onChange={e => setAdresse(e.target.value)}
                      placeholder="12 rue de la Paix"
                      className="w-full rounded-xl px-4 py-2.5 text-white placeholder-white/15 text-sm focus:outline-none focus:ring-1 focus:ring-[#C19A6B]/50"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-1">Ville</label>
                      <input
                        value={ville}
                        onChange={e => setVille(e.target.value)}
                        placeholder="Paris"
                        className="w-full rounded-xl px-4 py-2.5 text-white placeholder-white/15 text-sm focus:outline-none focus:ring-1 focus:ring-[#C19A6B]/50"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-1">Code postal</label>
                      <input
                        value={codePostal}
                        onChange={e => setCodePostal(e.target.value)}
                        placeholder="75001"
                        maxLength={5}
                        className="w-full rounded-xl px-4 py-2.5 text-white placeholder-white/15 text-sm focus:outline-none focus:ring-1 focus:ring-[#C19A6B]/50"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/40 mb-1">Téléphone</label>
                    <input
                      value={telephone}
                      onChange={e => setTelephone(e.target.value)}
                      placeholder="01 23 45 67 89"
                      className="w-full rounded-xl px-4 py-2.5 text-white placeholder-white/15 text-sm focus:outline-none focus:ring-1 focus:ring-[#C19A6B]/50"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                </div>

                <button
                  onClick={saveInfos}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all mt-4"
                  style={{ background: '#C19A6B', color: '#1A0F0A' }}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                  Continuer
                </button>
              </motion.div>
            )}

            {/* ── Étape 2 : Horaires de retrait ───────────────── */}
            {etape === 1 && (
              <motion.div
                key="horaires"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-white/50 text-sm mb-4">
                  Sélectionnez les créneaux où vos clients peuvent venir récupérer leurs commandes.
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {CRENEAUX_SUGGESTIONS.map(c => {
                    const active = creneaux.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCreneau(c)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{
                          background: active ? 'rgba(111,168,234,0.2)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${active ? 'rgba(111,168,234,0.4)' : 'rgba(255,255,255,0.08)'}`,
                          color: active ? '#6FA8EA' : 'rgba(255,255,255,0.35)',
                        }}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>

                {creneaux.length > 0 && (
                  <p className="text-white/30 text-xs mb-4">
                    {creneaux.length} créneau{creneaux.length > 1 ? 'x' : ''} sélectionné{creneaux.length > 1 ? 's' : ''}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setEtape(0)}
                    className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    <ChevronLeft size={14} /> Retour
                  </button>
                  <button
                    onClick={saveHoraires}
                    disabled={saving || creneaux.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
                    style={{ background: '#6FA8EA', color: '#1A0F0A' }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                    Continuer
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Étape 3 : Premiers produits ─────────────────── */}
            {etape === 2 && (
              <motion.div
                key="produits"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-white/50 text-sm mb-4">
                  Sélectionnez les produits que vous proposez. Vous pourrez ajuster les prix et en ajouter d'autres depuis le catalogue.
                </p>

                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 mb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                  {produits.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => toggleProduit(i)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                      style={{
                        background: p.selected ? 'rgba(130,214,160,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${p.selected ? 'rgba(130,214,160,0.25)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <span className="text-lg flex-shrink-0">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: p.selected ? '#82D6A0' : 'rgba(255,255,255,0.5)' }}>
                          {p.nom}
                        </p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          {p.categorie} · {p.prix_vente.toFixed(2)} €
                        </p>
                      </div>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{
                          background: p.selected ? 'rgba(130,214,160,0.2)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${p.selected ? 'rgba(130,214,160,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        }}
                      >
                        {p.selected && <Check size={12} style={{ color: '#82D6A0' }} />}
                      </div>
                    </button>
                  ))}
                </div>

                <p className="text-white/25 text-xs mb-4">
                  {produits.filter(p => p.selected).length} produit{produits.filter(p => p.selected).length > 1 ? 's' : ''} sélectionné{produits.filter(p => p.selected).length > 1 ? 's' : ''}
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setEtape(1)}
                    className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    <ChevronLeft size={14} /> Retour
                  </button>
                  <button
                    onClick={saveProduits}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
                    style={{ background: '#82D6A0', color: '#1A0F0A' }}
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {saving ? 'Configuration en cours...' : 'Lancer mon tableau de bord'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Skip link */}
        <button
          onClick={async () => {
            await supabase.rpc('complete_onboarding');
            onComplete();
          }}
          className="block mx-auto mt-6 text-white/15 text-xs hover:text-white/30 transition-colors"
        >
          Passer la configuration →
        </button>
      </div>
    </div>
  );
}
