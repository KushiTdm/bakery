// lib/defis-generate.ts
// ─────────────────────────────────────────────────────────────
// Génération et persistance des défis pour le lendemain.
// Découplée du rapport IA : si la génération du rapport échoue,
// on peut toujours créer des défis via cette fonction.
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateChallengesForTomorrow } from './challenges';

interface GenerateOptions {
  /** Si fourni, lie les défis au rapport parent. Sinon, rapport_id = null. */
  rapportId?: string | null;
  /** Insights du rapport IA pour personnaliser les défis (optionnel). */
  rapportInsight?: {
    score?: number;
    invendus_critiques?: { nom: string; emoji?: string; taux_invendu?: number }[];
  } | null;
}

interface GenerateResult {
  inserted: number;
  skipped:  string;
}

/**
 * Génère et persiste les défis pour `demainDate` à partir de l'historique
 * existant. Idempotent : utilise `upsert` sur la clé
 * (boulangerie_id, date_defi, categorie, produit_id).
 */
export async function generateAndPersistDefis(
  admin:          SupabaseClient,
  boulangerieId:  string,
  demainDate:     string,
  options:        GenerateOptions = {},
): Promise<GenerateResult> {
  // 1. Historique 14 derniers jours pour baselines CA / invendu
  const { data: historyRows } = await admin
    .from('journees')
    .select('date, jour_semaine, ca_estime, taux_invendu, commandes_online')
    .eq('boulangerie_id', boulangerieId)
    .eq('cloturee', true)
    .order('date', { ascending: false })
    .limit(14);

  if (!historyRows || historyRows.length === 0) {
    return { inserted: 0, skipped: 'no-history' };
  }

  // 2. Agrégation produits sur les 7 derniers jours clôturés
  const { data: recentJournees } = await admin
    .from('journees')
    .select('id')
    .eq('boulangerie_id', boulangerieId)
    .eq('cloturee', true)
    .order('date', { ascending: false })
    .limit(7);

  const recentIds = (recentJournees ?? []).map(j => j.id);
  const { data: recentStocks } = recentIds.length > 0
    ? await admin
        .from('stocks_journaliers')
        .select('produit_id, produit_nom, produit_emoji, production, stock_final')
        .in('journee_id', recentIds)
    : { data: [] };

  const prodAgg: Record<string, {
    produit_id: string; nom: string; emoji: string;
    production: number; stock_final: number; count: number;
  }> = {};
  for (const s of recentStocks ?? []) {
    if (!prodAgg[s.produit_id]) {
      prodAgg[s.produit_id] = {
        produit_id: s.produit_id,
        nom:        s.produit_nom,
        emoji:      s.produit_emoji ?? '🥖',
        production: 0,
        stock_final: 0,
        count:      0,
      };
    }
    prodAgg[s.produit_id].production  += s.production;
    prodAgg[s.produit_id].stock_final += s.stock_final;
    prodAgg[s.produit_id].count       += 1;
  }

  const productHistory = Object.values(prodAgg).map(p => ({
    produit_id:   p.produit_id,
    nom:          p.nom,
    emoji:        p.emoji,
    production:   p.production,
    stock_final:  p.stock_final,
    taux_invendu: p.production > 0 ? (p.stock_final / p.production) * 100 : 0,
  }));

  const demainDow = new Date(demainDate + 'T12:00:00Z').getDay();

  const challenges = generateChallengesForTomorrow({
    history: historyRows.map(h => ({
      date:             h.date,
      jour_semaine:     h.jour_semaine ?? 0,
      ca_estime:        h.ca_estime ?? 0,
      taux_invendu:     h.taux_invendu ?? 0,
      commandes_online: h.commandes_online ?? 0,
    })),
    products:     productHistory,
    tomorrowDate: demainDate,
    tomorrowDow:  demainDow,
    rapport:      options.rapportInsight ?? null,
  });

  if (challenges.length === 0) {
    return { inserted: 0, skipped: 'no-candidates' };
  }

  const defiRows = challenges.map(c => ({
    boulangerie_id: boulangerieId,
    rapport_id:     options.rapportId ?? null,
    date_defi:      demainDate,
    categorie:      c.categorie,
    difficulte:     c.difficulte,
    titre:          c.titre,
    description:    c.description,
    emoji:          c.emoji,
    metric_cible:   c.metric_cible,
    produit_id:     c.produit_id,
    valeur_cible:   c.valeur_cible,
    comparaison:    c.comparaison,
    xp_reward:      c.xp_reward,
  }));

  await admin
    .from('defis')
    .upsert(defiRows, { onConflict: 'boulangerie_id,date_defi,categorie,produit_id' });

  return { inserted: defiRows.length, skipped: '' };
}
