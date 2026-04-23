// lib/defis-resolve.ts
// ─────────────────────────────────────────────────────────────
// Logique de résolution des défis à la clôture journée.
// Partagée entre la route POST /api/boulanger/defis/resolve
// et le self-heal GET /api/boulanger/defis.
//
// Propriétés clés :
//   - Idempotente : rappelable sans doubler l'XP
//   - Timezone-aware : calcul streak sur dates ISO locales (pas de drift DST)
//   - Ne mute rien si déjà résolu (pas d'UPDATE superflu)
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { levelFromXP, computeNewBadges } from './gamification';

export interface ResolveResult {
  /** Nombre de défis passés de 'actif' → 'reussi' ou 'echoue' lors de cet appel. */
  resolved:     number;
  /** Nombre total de défis réussis du jour (y compris ceux déjà réussis avant). */
  defisReussis: number;
  /** Nombre total de défis du jour. */
  totalDefis:   number;
  /** XP attribuée lors de cet appel (0 si idempotent). */
  xpEarned:     number;
  /** Nouveaux badges débloqués lors de cet appel. */
  newBadges:    string[];
  /** Streak actuel après résolution. */
  streak:       number;
  /** Delta de streak appliqué lors de cet appel (0 si idempotent). */
  streakDelta:  number;
  /** Niveau actuel après résolution. */
  niveau:       number;
  /** XP total après résolution. */
  xpTotal:      number;
  /** True si rien n'a été modifié (appel idempotent). */
  alreadyResolved: boolean;
}

/**
 * Calcule la différence en jours calendaires entre deux dates 'YYYY-MM-DD',
 * indépendamment du fuseau horaire local. Utilise UTC midnight pour éviter
 * tout drift lié au DST.
 */
function diffCalendarDays(laterISO: string, earlierISO: string): number {
  const [y1, m1, d1] = laterISO.split('-').map(Number);
  const [y2, m2, d2] = earlierISO.split('-').map(Number);
  const laterUtc   = Date.UTC(y1, m1 - 1, d1);
  const earlierUtc = Date.UTC(y2, m2 - 1, d2);
  return Math.round((laterUtc - earlierUtc) / 86_400_000);
}

/**
 * Résout les défis actifs du jour et met à jour le profil gamification.
 *
 * @param admin          Client Supabase en mode service-role (bypass RLS).
 * @param boulangerieId  UUID de la boulangerie.
 * @param date           Date locale 'YYYY-MM-DD' (TZ de la boulangerie).
 * @returns              ResolveResult détaillé (ou throws si journée non clôturée).
 */
export async function resolveDefis(
  admin: SupabaseClient,
  boulangerieId: string,
  date: string,
): Promise<ResolveResult> {
  // 1. Journée clôturée pour ce jour
  const { data: journee } = await admin
    .from('journees')
    .select('id, ca_estime, taux_invendu, commandes_online, cloturee')
    .eq('boulangerie_id', boulangerieId)
    .eq('date', date)
    .maybeSingle();

  if (!journee || !journee.cloturee) {
    throw new Error('Journée non clôturée');
  }

  // 2. Profil gamification (upsert si absent)
  let { data: profil } = await admin
    .from('gamification_profil')
    .select('*')
    .eq('boulangerie_id', boulangerieId)
    .maybeSingle();

  if (!profil) {
    const { data: newProfil } = await admin
      .from('gamification_profil')
      .insert({ boulangerie_id: boulangerieId })
      .select()
      .single();
    profil = newProfil;
  }

  // 3. Défis du jour (tous statuts, pour le compte total)
  const { data: allDefisToday } = await admin
    .from('defis')
    .select('*')
    .eq('boulangerie_id', boulangerieId)
    .eq('date_defi', date);

  const todayDefis = allDefisToday ?? [];
  const activeDefis = todayDefis.filter(d => d.statut === 'actif');

  // 4. Court-circuit idempotent : pas de défis actifs ET profil déjà à jour pour cette date
  if (activeDefis.length === 0 && profil && profil.derniere_cloture === date) {
    const defisReussis = todayDefis.filter(d => d.statut === 'reussi').length;
    return {
      resolved:        0,
      defisReussis,
      totalDefis:      todayDefis.length,
      xpEarned:        0,
      newBadges:       [],
      streak:          profil.streak_actuel ?? 0,
      streakDelta:     0,
      niveau:          profil.niveau ?? 1,
      xpTotal:         profil.xp_total ?? 0,
      alreadyResolved: true,
    };
  }

  // 5. Stocks pour les défis produit
  const { data: stocks } = await admin
    .from('stocks_journaliers')
    .select('produit_id, production, stock_final, prix_vente')
    .eq('journee_id', journee.id);

  const stockMap = new Map(
    (stocks ?? []).map(s => [s.produit_id, s]),
  );

  // 6. Résout chaque défi actif
  let xpEarned = 0;
  const updates: {
    id:             string;
    statut:         string;
    valeur_actuelle: number;
    resolved_at:    string;
  }[] = [];

  for (const defi of activeDefis) {
    let actualValue: number | null = null;

    switch (defi.metric_cible) {
      case 'ca_estime':
        actualValue = journee.ca_estime ?? 0;
        break;
      case 'taux_invendu':
        actualValue = journee.taux_invendu ?? 0;
        break;
      case 'taux_invendu_produit': {
        if (defi.produit_id) {
          const stock = stockMap.get(defi.produit_id);
          if (stock && stock.production > 0) {
            actualValue = (stock.stock_final / stock.production) * 100;
          } else {
            actualValue = 0;
          }
        }
        break;
      }
      case 'stock_final': {
        if (defi.produit_id) {
          const stock = stockMap.get(defi.produit_id);
          actualValue = stock?.stock_final ?? 0;
        }
        break;
      }
      case 'commandes_online':
        actualValue = journee.commandes_online ?? 0;
        break;
      case 'paniers_flash_vendus': {
        const { count } = await admin
          .from('paniers_flash')
          .select('*', { count: 'exact', head: true })
          .eq('boulangerie_id', boulangerieId)
          .eq('date_panier', date)
          .eq('quantite_restante', 0);
        actualValue = count ?? 0;
        break;
      }
      default:
        actualValue = null;
    }

    if (actualValue === null) {
      updates.push({
        id:              defi.id,
        statut:          'expire',
        valeur_actuelle: 0,
        resolved_at:     new Date().toISOString(),
      });
      continue;
    }

    const target = Number(defi.valeur_cible);
    let success = false;
    switch (defi.comparaison) {
      case 'gte': success = actualValue >= target; break;
      case 'lte': success = actualValue <= target; break;
      case 'gt':  success = actualValue >  target; break;
      case 'lt':  success = actualValue <  target; break;
      case 'eq':  success = actualValue === target; break;
    }

    if (success) xpEarned += defi.xp_reward;

    updates.push({
      id:              defi.id,
      statut:          success ? 'reussi' : 'echoue',
      valeur_actuelle: Math.round(actualValue * 100) / 100,
      resolved_at:     new Date().toISOString(),
    });
  }

  // 7. Batch update défis
  for (const u of updates) {
    await admin
      .from('defis')
      .update({
        statut:          u.statut,
        valeur_actuelle: u.valeur_actuelle,
        resolved_at:     u.resolved_at,
      })
      .eq('id', u.id);
  }

  // 8. Streak timezone-safe : diff en jours calendaires pure
  //    Guard : si derniere_cloture === date, on ne re-incrémente pas (idempotent).
  const prevStreak = profil?.streak_actuel ?? 0;
  let   newStreak  = prevStreak;
  let   streakDelta = 0;

  if (profil) {
    const lastClose = profil.derniere_cloture as string | null;
    if (lastClose === date) {
      // Déjà clôturé aujourd'hui → on ne touche pas au streak
      streakDelta = 0;
    } else if (lastClose) {
      const diffDays = diffCalendarDays(date, lastClose);
      if (diffDays === 1) {
        newStreak   = prevStreak + 1;
        streakDelta = 1;
      } else if (diffDays > 1) {
        newStreak   = 1;
        streakDelta = 1 - prevStreak;
      } else if (diffDays < 0) {
        // Date antérieure à la dernière clôture : on ne régresse pas.
        streakDelta = 0;
      }
    } else {
      newStreak   = 1;
      streakDelta = 1;
    }
  }

  const newStreakMax = Math.max(profil?.streak_max ?? 0, newStreak);
  const newXP        = (profil?.xp_total ?? 0) + xpEarned;
  const newNiveau    = levelFromXP(newXP);

  const newBadges = computeNewBadges(
    { niveau: newNiveau, streak_max: newStreakMax, xp_total: newXP },
    profil?.badges ?? [],
  );
  const allBadges = [...(profil?.badges ?? []), ...newBadges];

  // 9. Update profil (une seule fois, même si xpEarned === 0 car le streak peut avoir bougé)
  if (profil) {
    await admin
      .from('gamification_profil')
      .update({
        xp_total:         newXP,
        niveau:           newNiveau,
        streak_actuel:    newStreak,
        streak_max:       newStreakMax,
        derniere_cloture: date,
        badges:           allBadges,
      })
      .eq('boulangerie_id', boulangerieId);
  }

  const defisReussis = updates.filter(u => u.statut === 'reussi').length
    + todayDefis.filter(d => d.statut === 'reussi').length;

  return {
    resolved:        updates.length,
    defisReussis,
    totalDefis:      todayDefis.length,
    xpEarned,
    newBadges,
    streak:          newStreak,
    streakDelta,
    niveau:          newNiveau,
    xpTotal:         newXP,
    alreadyResolved: false,
  };
}
