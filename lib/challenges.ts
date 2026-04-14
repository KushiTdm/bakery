// lib/challenges.ts — Génération déterministe de défis quotidiens
// ─────────────────────────────────────────────────────────────
// Appelé après la sauvegarde du rapport IA pour générer 2-3 défis
// pour le lendemain. Pas de tokens IA — logique pure basée sur
// l'historique et le rapport.

import type { ChallengeCategory, ChallengeDifficulty, ChallengeComparison } from './types';
import { XP_BY_DIFFICULTY } from './gamification';

// ── Types internes ───────────────────────────────────────────

interface HistoryDay {
  date:            string;
  jour_semaine:    number;
  ca_estime:       number;
  taux_invendu:    number;
  commandes_online: number;
}

interface ProductHistory {
  produit_id:  string;
  nom:         string;
  emoji:       string;
  production:  number;
  stock_final: number;
  taux_invendu: number;
}

interface RapportInsight {
  score?:    number;
  invendus_critiques?: { nom: string; emoji?: string; taux_invendu?: number }[];
}

interface ForecastEntry {
  produit_id:    string;
  quantite_min:  number;
  quantite_max:  number;
}

export interface ChallengeCandidate {
  categorie:    ChallengeCategory;
  difficulte:   ChallengeDifficulty;
  titre:        string;
  description:  string;
  emoji:        string;
  metric_cible: string;
  produit_id:   string | null;
  valeur_cible: number;
  comparaison:  ChallengeComparison;
  xp_reward:    number;
}

// ── Helpers ──────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function sameDayHistory(history: HistoryDay[], targetDow: number): HistoryDay[] {
  return history.filter(d => d.jour_semaine === targetDow);
}

// ── Générateurs par catégorie ────────────────────────────────

function generateRevenueTarget(
  history: HistoryDay[],
  tomorrowDow: number,
): ChallengeCandidate | null {
  const sameDays = sameDayHistory(history, tomorrowDow);
  if (sameDays.length < 2) {
    // Fallback: use overall average
    const globalAvg = avg(history.map(d => d.ca_estime));
    if (globalAvg <= 0) return null;
    const target = Math.round(globalAvg * 1.05);
    return {
      categorie: 'revenue_target',
      difficulte: 'easy',
      titre: `Objectif ${target}€ de CA`,
      description: `Atteindre ${target}€ de chiffre d'affaires aujourd'hui (+5% vs votre moyenne).`,
      emoji: '💰',
      metric_cible: 'ca_estime',
      produit_id: null,
      valeur_cible: target,
      comparaison: 'gte',
      xp_reward: XP_BY_DIFFICULTY.easy,
    };
  }

  const avgCA = avg(sameDays.map(d => d.ca_estime));
  const bestCA = Math.max(...sameDays.map(d => d.ca_estime));

  // Easy: beat average
  if (avgCA > 0) {
    const stretch = Math.round(avgCA * 1.05);
    const isBeatBest = stretch >= bestCA * 0.95;
    return {
      categorie: 'revenue_target',
      difficulte: isBeatBest ? 'hard' : 'easy',
      titre: isBeatBest ? `Record : ${stretch}€ de CA` : `Objectif ${stretch}€ de CA`,
      description: isBeatBest
        ? `Battez votre record pour ce jour de la semaine (${Math.round(bestCA)}€) !`
        : `Dépassez la moyenne de ${Math.round(avgCA)}€ pour ce jour.`,
      emoji: isBeatBest ? '🏆' : '💰',
      metric_cible: 'ca_estime',
      produit_id: null,
      valeur_cible: stretch,
      comparaison: 'gte',
      xp_reward: XP_BY_DIFFICULTY[isBeatBest ? 'hard' : 'easy'],
    };
  }

  return null;
}

function generateReduceWaste(
  products: ProductHistory[],
): ChallengeCandidate | null {
  // Find the product with worst unsold rate
  const worst = products
    .filter(p => p.production > 0 && p.taux_invendu > 5)
    .sort((a, b) => b.taux_invendu - a.taux_invendu)[0];

  if (!worst) return null;

  const target = Math.max(
    Math.round((worst.taux_invendu * 0.7) * 10) / 10,
    1
  );
  const isHard = worst.taux_invendu > 15;

  return {
    categorie: 'reduce_waste',
    difficulte: isHard ? 'hard' : 'medium',
    titre: `${worst.emoji} ${worst.nom} < ${target}% d'invendu`,
    description: `Réduisez les invendus de ${worst.nom} (actuellement ${worst.taux_invendu.toFixed(1)}%) en ajustant la production.`,
    emoji: worst.emoji || '📉',
    metric_cible: 'taux_invendu_produit',
    produit_id: worst.produit_id,
    valeur_cible: target,
    comparaison: 'lte',
    xp_reward: XP_BY_DIFFICULTY[isHard ? 'hard' : 'medium'],
  };
}

function generatePerfectDay(
  products: ProductHistory[],
): ChallengeCandidate | null {
  // Find a product that sometimes has 0 unsold
  const candidate = products
    .filter(p => p.production > 0 && p.taux_invendu > 0 && p.taux_invendu < 10)
    .sort((a, b) => a.taux_invendu - b.taux_invendu)[0];

  if (!candidate) return null;

  return {
    categorie: 'perfect_day',
    difficulte: 'hard',
    titre: `Zéro invendu : ${candidate.emoji} ${candidate.nom}`,
    description: `Vendez tout le stock de ${candidate.nom} aujourd'hui — zéro reste en fin de journée !`,
    emoji: '✨',
    metric_cible: 'stock_final',
    produit_id: candidate.produit_id,
    valeur_cible: 0,
    comparaison: 'eq',
    xp_reward: XP_BY_DIFFICULTY.hard,
  };
}

function generateAntiGaspi(
  history: HistoryDay[],
): ChallengeCandidate | null {
  // Check if there's enough order data
  const withOrders = history.filter(d => d.commandes_online > 0);
  if (withOrders.length === 0) {
    return {
      categorie: 'anti_gaspi',
      difficulte: 'easy',
      titre: 'Proposer des paniers flash',
      description: 'Activez les paniers anti-gaspi en fin de journée pour réduire vos pertes.',
      emoji: '♻️',
      metric_cible: 'paniers_flash_vendus',
      produit_id: null,
      valeur_cible: 1,
      comparaison: 'gte',
      xp_reward: XP_BY_DIFFICULTY.easy,
    };
  }

  return null;
}

function generateImprovement(
  history: HistoryDay[],
  tomorrowDow: number,
): ChallengeCandidate | null {
  const sameDays = sameDayHistory(history, tomorrowDow);
  if (sameDays.length < 2) return null;

  const avgInvendu = avg(sameDays.map(d => d.taux_invendu));
  if (avgInvendu <= 2) return null;

  const target = Math.round((avgInvendu * 0.85) * 10) / 10;

  return {
    categorie: 'improvement',
    difficulte: 'medium',
    titre: `Invendu < ${target}% aujourd'hui`,
    description: `Faites mieux que la moyenne de ${avgInvendu.toFixed(1)}% d'invendu pour ce jour (-15%).`,
    emoji: '📊',
    metric_cible: 'taux_invendu',
    produit_id: null,
    valeur_cible: target,
    comparaison: 'lte',
    xp_reward: XP_BY_DIFFICULTY.medium,
  };
}

// ── Fonction principale ──────────────────────────────────────

export function generateChallengesForTomorrow(params: {
  history:       HistoryDay[];
  products:      ProductHistory[];
  tomorrowDate:  string;
  tomorrowDow:   number;
  rapport?:      RapportInsight | null;
  forecasts?:    ForecastEntry[];
}): ChallengeCandidate[] {
  const { history, products, tomorrowDow, rapport } = params;

  const candidates: ChallengeCandidate[] = [];

  // 1. Revenue target (always try)
  const revTarget = generateRevenueTarget(history, tomorrowDow);
  if (revTarget) candidates.push(revTarget);

  // 2. Reduce waste (if there are problematic products)
  const wasteChallenge = generateReduceWaste(products);
  if (wasteChallenge) candidates.push(wasteChallenge);

  // 3. Perfect day (if there's a good candidate product)
  const perfectDay = generatePerfectDay(products);
  if (perfectDay) candidates.push(perfectDay);

  // 4. Anti-gaspi (if underutilized)
  const antiGaspi = generateAntiGaspi(history);
  if (antiGaspi) candidates.push(antiGaspi);

  // 5. Improvement (beat average unsold for this weekday)
  const improvement = generateImprovement(history, tomorrowDow);
  if (improvement) candidates.push(improvement);

  // ── Selection: pick 2-3 diverse challenges ─────────────────
  // Priority: 1 revenue, 1 waste-related, 1 bonus
  const selected: ChallengeCandidate[] = [];
  const usedCategories = new Set<ChallengeCategory>();

  // Prefer revenue_target first
  const rev = candidates.find(c => c.categorie === 'revenue_target');
  if (rev) { selected.push(rev); usedCategories.add(rev.categorie); }

  // Then waste-related
  const waste = candidates.find(c =>
    !usedCategories.has(c.categorie) &&
    ['reduce_waste', 'perfect_day', 'improvement'].includes(c.categorie)
  );
  if (waste) { selected.push(waste); usedCategories.add(waste.categorie); }

  // Then bonus (anti_gaspi or remaining)
  const bonus = candidates.find(c => !usedCategories.has(c.categorie));
  if (bonus) { selected.push(bonus); usedCategories.add(bonus.categorie); }

  return selected.slice(0, 3);
}
