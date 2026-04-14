// lib/gamification.ts — Constantes et helpers gamification
// ─────────────────────────────────────────────────────────────

import type { ChallengeDifficulty } from './types';

// ── XP par difficulté ────────────────────────────────────────

export const XP_BY_DIFFICULTY: Record<ChallengeDifficulty, number> = {
  easy:   10,
  medium: 25,
  hard:   50,
};

// ── Niveaux ──────────────────────────────────────────────────
// 100 XP par niveau

export const XP_PER_LEVEL = 100;

export function levelFromXP(xp: number): number {
  return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
}

export function xpForCurrentLevel(xp: number): { current: number; needed: number } {
  const inLevel = xp % XP_PER_LEVEL;
  return { current: inLevel, needed: XP_PER_LEVEL };
}

// ── Badges ───────────────────────────────────────────────────

export interface BadgeDefinition {
  id:          string;
  nom:         string;
  emoji:       string;
  description: string;
  condition:   (profil: { niveau: number; streak_max: number; xp_total: number }) => boolean;
}

export const BADGES: BadgeDefinition[] = [
  {
    id: 'premier_defi',
    nom: 'Premier défi',
    emoji: '⭐',
    description: 'Réussir votre premier défi',
    condition: ({ xp_total }) => xp_total >= 10,
  },
  {
    id: 'niveau_5',
    nom: 'Apprenti boulanger',
    emoji: '🥖',
    description: 'Atteindre le niveau 5',
    condition: ({ niveau }) => niveau >= 5,
  },
  {
    id: 'niveau_10',
    nom: 'Artisan confirmé',
    emoji: '👨‍🍳',
    description: 'Atteindre le niveau 10',
    condition: ({ niveau }) => niveau >= 10,
  },
  {
    id: 'niveau_25',
    nom: 'Maître boulanger',
    emoji: '🏆',
    description: 'Atteindre le niveau 25',
    condition: ({ niveau }) => niveau >= 25,
  },
  {
    id: 'niveau_50',
    nom: 'Légende du fournil',
    emoji: '👑',
    description: 'Atteindre le niveau 50',
    condition: ({ niveau }) => niveau >= 50,
  },
  {
    id: 'streak_3',
    nom: 'Régulier',
    emoji: '🔥',
    description: '3 jours de clôture consécutifs',
    condition: ({ streak_max }) => streak_max >= 3,
  },
  {
    id: 'streak_7',
    nom: 'Semaine parfaite',
    emoji: '💪',
    description: '7 jours de clôture consécutifs',
    condition: ({ streak_max }) => streak_max >= 7,
  },
  {
    id: 'streak_30',
    nom: 'Inarrêtable',
    emoji: '🚀',
    description: '30 jours de clôture consécutifs',
    condition: ({ streak_max }) => streak_max >= 30,
  },
];

export function computeNewBadges(
  profil: { niveau: number; streak_max: number; xp_total: number },
  existingBadges: string[]
): string[] {
  const newBadges: string[] = [];
  for (const badge of BADGES) {
    if (!existingBadges.includes(badge.id) && badge.condition(profil)) {
      newBadges.push(badge.id);
    }
  }
  return newBadges;
}

// ── Niveau labels ────────────────────────────────────────────

export function levelLabel(niveau: number): string {
  if (niveau >= 50) return 'Légende du fournil';
  if (niveau >= 25) return 'Maître boulanger';
  if (niveau >= 10) return 'Artisan confirmé';
  if (niveau >= 5)  return 'Apprenti boulanger';
  return 'Débutant';
}

// ── Difficulty labels ────────────────────────────────────────

export const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = {
  easy:   'Facile',
  medium: 'Moyen',
  hard:   'Difficile',
};

export const DIFFICULTY_COLORS: Record<ChallengeDifficulty, string> = {
  easy:   '#3D9E6A',
  medium: '#D4891A',
  hard:   '#E25555',
};
