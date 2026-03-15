'use client';
// hooks/use-tour.ts
// Gestion de l'état du wizard de visite guidée.
// Persistance via Supabase (colonne tour_completed_at sur boulangeries).

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type TourStep = {
  id: string;
  view: 'matin' | 'snapshot' | 'soir' | 'catalogue';
  /** Sélecteur CSS de l'élément à spotlight-er */
  targetSelector: string;
  title: string;
  description: string;
  /** Position du tooltip par rapport à l'élément : top | bottom | left | right */
  placement: 'top' | 'bottom' | 'left' | 'right';
};

export const TOUR_STEPS: TourStep[] = [
  // ── Vue Matin ────────────────────────────────────────────────────────────
  {
    id: 'matin-intro',
    view: 'matin',
    targetSelector: '[data-tour="matin-header"]',
    title: '🌅 Vue du matin',
    description: 'Chaque matin, saisissez vos productions. Ces quantités alimentent votre stock en temps réel et pilotent les alertes de rupture.',
    placement: 'bottom',
  },
  {
    id: 'matin-produit',
    view: 'matin',
    targetSelector: '[data-tour="matin-produit-row"]',
    title: '📝 Saisir une production',
    description: 'Tapez directement la quantité produite pour chaque article. La saisie est instantanée, sans bouton "Valider" — tout est synchronisé automatiquement.',
    placement: 'bottom',
  },
  // ── Vue Stock ────────────────────────────────────────────────────────────
  {
    id: 'snapshot-intro',
    view: 'snapshot',
    targetSelector: '[data-tour="snapshot-header"]',
    title: '📸 Snapshot de stock',
    description: 'Prenez une photo de votre stock à tout moment de la journée. Idéal pour recaler les comptages après un rush inattendu.',
    placement: 'bottom',
  },
  {
    id: 'snapshot-alerte',
    view: 'snapshot',
    targetSelector: '[data-tour="snapshot-alerte"]',
    title: '⚠️ Alertes de rupture',
    description: 'Les produits sous le seuil d\'alerte s\'affichent en orange. Configurez ce seuil par produit dans l\'onglet Produits.',
    placement: 'top',
  },
  // ── Vue Soir ─────────────────────────────────────────────────────────────
  {
    id: 'soir-intro',
    view: 'soir',
    targetSelector: '[data-tour="soir-header"]',
    title: '🌙 Clôture du soir',
    description: 'En fin de journée, enregistrez vos invendus. BakeryOS calcule automatiquement votre taux de gaspillage et votre CA journalier.',
    placement: 'bottom',
  },
  {
    id: 'soir-flash',
    view: 'soir',
    targetSelector: '[data-tour="soir-flash"]',
    title: '⚡ Activer les paniers anti-gaspi',
    description: 'Transformez vos invendus en paniers flash à prix réduit. Ils apparaîtront immédiatement sur votre boutique cliente avec un compte à rebours.',
    placement: 'top',
  },
  // ── Vue Catalogue ─────────────────────────────────────────────────────────
  {
    id: 'catalogue-intro',
    view: 'catalogue',
    targetSelector: '[data-tour="catalogue-header"]',
    title: '🥐 Votre catalogue',
    description: 'Gérez tous vos produits ici : photos, prix, allergènes, disponibilité saisonnière. Chaque modification est répercutée instantanément sur votre boutique.',
    placement: 'bottom',
  },
  {
    id: 'catalogue-add',
    view: 'catalogue',
    targetSelector: '[data-tour="catalogue-add-btn"]',
    title: '➕ Ajouter un produit',
    description: 'Créez un nouveau produit en quelques secondes. Vous pouvez aussi démarrer depuis nos 12 produits types pré-configurés.',
    placement: 'top',
  },
];

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useTour() {

  const [isOpen, setIsOpen]           = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [tourCompleted, setTourCompleted] = useState(false);

  // ── Vérifier si le tour a déjà été fait ──────────────────────────────────
  useEffect(() => {
    async function checkTourStatus() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data } = await supabase
          .from('boulangeries')
          .select('tour_completed_at')
          .eq('user_id', user.id)
          .single();

        const completed = !!data?.tour_completed_at;
        setTourCompleted(completed);

        // Auto-déclenchement au premier login
        if (!completed) {
          // Petit délai pour laisser le temps à la page de se rendre
          setTimeout(() => setIsOpen(true), 1200);
        }
      } catch (e) {
        console.error('[useTour] Erreur check status:', e);
      } finally {
        setLoading(false);
      }
    }
    checkTourStatus();
  }, [supabase]);

  // ── Démarrer manuellement ─────────────────────────────────────────────────
  const startTour = useCallback(() => {
    setCurrentStepIndex(0);
    setIsOpen(true);
  }, []);

  // ── Étape suivante ────────────────────────────────────────────────────────
  const nextStep = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex(i => i + 1);
    } else {
      completeTour();
    }
  }, [currentStepIndex]);

  // ── Étape précédente ──────────────────────────────────────────────────────
  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(i => i - 1);
    }
  }, [currentStepIndex]);

  // ── Terminer le tour ──────────────────────────────────────────────────────
  const completeTour = useCallback(async () => {
    setIsOpen(false);
    setTourCompleted(true);
    try {
      await supabase.rpc('complete_tour');
    } catch (e) {
      console.error('[useTour] Erreur complete_tour:', e);
    }
  }, [supabase]);

  // ── Fermer sans terminer (skip) ───────────────────────────────────────────
  const skipTour = useCallback(async () => {
    setIsOpen(false);
    setTourCompleted(true);
    try {
      await supabase.rpc('complete_tour');
    } catch (e) {
      console.error('[useTour] Erreur skip_tour:', e);
    }
  }, [supabase]);

  // ── Revoir la visite ──────────────────────────────────────────────────────
  const resetTour = useCallback(async () => {
    try {
      await supabase.rpc('reset_tour');
      setTourCompleted(false);
      setCurrentStepIndex(0);
      setIsOpen(true);
    } catch (e) {
      console.error('[useTour] Erreur reset_tour:', e);
    }
  }, [supabase]);

  return {
    isOpen,
    loading,
    tourCompleted,
    currentStep: TOUR_STEPS[currentStepIndex],
    currentStepIndex,
    totalSteps: TOUR_STEPS.length,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
    resetTour,
  };
}