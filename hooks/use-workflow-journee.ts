'use client';
// hooks/use-workflow-journee.ts
// ─────────────────────────────────────────────────────────────
// Gère le workflow chronologique de la journée boulanger.
//
// ORDRE OBLIGATOIRE :
//   1. Matin   → Saisir la production (dès l'ouverture)
//   2. Stock   → Snapshot 10h (après production saisie)
//   3. Stock   → Snapshot 14h (après snapshot 10h)
//   4. Flash   → Paniers anti-gaspi (après snapshot 14h OU en fin de journée)
//   5. Soir    → Clôture (après flash ou en fin de journée)
//
// IMPORTANT :
//   - On ne peut agir QUE sur la journée du JOUR en cours (timezone boulangerie)
//   - Impossible de saisir J+1 ou J-1
//   - Compte à rebours jusqu'à minuit (fin de journée)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────

export type WorkflowStep = 'matin' | 'snapshot' | 'soir' | 'flash';

export interface WorkflowState {
  /** Date du jour dans le timezone de la boulangerie (YYYY-MM-DD) */
  todayDate:            string;
  /** Timezone de la boulangerie */
  timezone:             string;
  /** Compte à rebours jusqu'à minuit (HH:MM:SS) */
  countdown:            string;
  /** Secondes restantes jusqu'à minuit */
  secondsUntilMidnight: number;
  /** Pourcentage de la journée écoulée (0-100) */
  dayProgress:          number;
  /** Heure locale dans le timezone de la boulangerie */
  localHour:            number;

  // ── État du workflow ─────────────────────────────────────────
  /** La production a-t-elle été saisie ? (au moins 1 produit > 0) */
  productionSaisie:     boolean;
  /** Le snapshot 10h a-t-il été validé ? */
  snapshot10hFait:      boolean;
  /** Le snapshot 14h a-t-il été validé ? */
  snapshot14hFait:      boolean;
  /** La journée est-elle clôturée ? */
  journeeCloturee:      boolean;
  /** Le flash a-t-il été configuré ? */
  flashConfigured:      boolean;

  // ── Accessibilité des onglets ──────────────────────────────
  /** Peut-on accéder à l'onglet Matin ? (toujours oui) */
  canAccessMatin:       boolean;
  /** Peut-on accéder à l'onglet Stock ? */
  canAccessSnapshot:    boolean;
  /** Peut-on accéder à l'onglet Flash ? */
  canAccessFlash:       boolean;
  /** Peut-on accéder à l'onglet Soir ? */
  canAccessSoir:        boolean;

  // ── Raisons de blocage ─────────────────────────────────────
  snapshotBlockReason:  string | null;
  flashBlockReason:     string | null;
  soirBlockReason:      string | null;

  // ── Étape suggérée ─────────────────────────────────────────
  /** Étape courante recommandée selon l'heure et l'avancement */
  currentSuggestedStep: WorkflowStep;
  /** Label de l'étape courante */
  currentStepLabel:     string;
}

// ── Helpers ───────────────────────────────────────────────────

function getLocalHour(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

function getTodayInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function getSecondsUntilMidnight(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
    const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
    const s = parseInt(parts.find(p => p.type === 'second')?.value ?? '0');
    return (24 * 3600) - (h * 3600 + m * 60 + s);
  } catch {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getDayProgress(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
    const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
    const s = parseInt(parts.find(p => p.type === 'second')?.value ?? '0');
    const totalSeconds = h * 3600 + m * 60 + s;
    return Math.min(100, Math.round((totalSeconds / 86400) * 100));
  } catch {
    return 0;
  }
}

// ── Hook principal ────────────────────────────────────────────

interface UseWorkflowJourneeProps {
  productionSaisie:  boolean;  // depuis BoulangerContext
  snapshot10hFait:   boolean;  // depuis BoulangerContext
  snapshot14hFait:   boolean;  // depuis BoulangerContext
  journeeCloturee:   boolean;  // depuis BoulangerContext
  flashConfigured?:  boolean;  // optionnel
  timezone?:         string;   // timezone de la boulangerie
}

export function useWorkflowJournee({
  productionSaisie,
  snapshot10hFait,
  snapshot14hFait,
  journeeCloturee,
  flashConfigured = false,
  timezone = 'Europe/Paris',
}: UseWorkflowJourneeProps): WorkflowState {

  const [tick, setTick] = useState(0);

  // Mise à jour toutes les secondes pour le compte à rebours
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return useMemo(() => {
    const todayDate             = getTodayInTimezone(timezone);
    const localHour             = getLocalHour(timezone);
    const secondsUntilMidnight  = getSecondsUntilMidnight(timezone);
    const countdown             = formatCountdown(secondsUntilMidnight);
    const dayProgress           = getDayProgress(timezone);

    // ── Règles d'accessibilité ───────────────────────────────
    // Matin : toujours accessible
    const canAccessMatin = true;

    // Snapshot : seulement si production saisie
    const canAccessSnapshot = productionSaisie;
    const snapshotBlockReason = !productionSaisie
      ? 'Saisissez d\'abord la production du matin'
      : null;

    // Flash : accessible dès que la production est saisie
    // (on peut anticiper l'antigaspi à tout moment de la journée)
    const canAccessFlash = productionSaisie;
    const flashBlockReason = !productionSaisie
      ? 'Saisissez d\'abord la production du matin'
      : null;

    // Soir/Clôture : seulement si production saisie (snapshots conseillés mais pas obligatoires)
    // On bloque si pas de production du tout
    const canAccessSoir = productionSaisie;
    const soirBlockReason = !productionSaisie
      ? 'Saisissez d\'abord la production du matin'
      : null;

    // ── Étape suggérée selon l'heure ─────────────────────────
    let currentSuggestedStep: WorkflowStep;
    let currentStepLabel: string;

    if (!productionSaisie) {
      currentSuggestedStep = 'matin';
      currentStepLabel = 'Saisir la production du matin';
    } else if (!snapshot10hFait && localHour >= 9) {
      currentSuggestedStep = 'snapshot';
      currentStepLabel = 'Snapshot 10h — stock en rayon';
    } else if (!snapshot14hFait && localHour >= 13) {
      currentSuggestedStep = 'snapshot';
      currentStepLabel = 'Snapshot 14h — stock en rayon';
    } else if (localHour >= 17 && !flashConfigured) {
      currentSuggestedStep = 'flash';
      currentStepLabel = 'Préparer les paniers anti-gaspi';
    } else if (localHour >= 18 && !journeeCloturee) {
      currentSuggestedStep = 'soir';
      currentStepLabel = 'Clôturer la journée';
    } else if (localHour < 10) {
      currentSuggestedStep = 'matin';
      currentStepLabel = 'Production du matin';
    } else {
      currentSuggestedStep = snapshot14hFait ? 'flash' : 'snapshot';
      currentStepLabel = snapshot14hFait ? 'Paniers flash' : 'Snapshot stock';
    }

    return {
      todayDate,
      timezone,
      countdown,
      secondsUntilMidnight,
      dayProgress,
      localHour,
      productionSaisie,
      snapshot10hFait,
      snapshot14hFait,
      journeeCloturee,
      flashConfigured,
      canAccessMatin,
      canAccessSnapshot,
      canAccessFlash,
      canAccessSoir,
      snapshotBlockReason,
      flashBlockReason,
      soirBlockReason,
      currentSuggestedStep,
      currentStepLabel,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tick, timezone, productionSaisie, snapshot10hFait,
    snapshot14hFait, journeeCloturee, flashConfigured,
  ]);
}