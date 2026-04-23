// lib/rapport-mensuel-aggregate.ts
// ─────────────────────────────────────────────────────────────
// Agrégation des KPIs mensuels d'une boulangerie, à partir de :
//   journees, stocks_journaliers, commandes, paniers_flash,
//   feedback_journee, meteo_journees, ai_rapports (quotidiens)
//
// `aggregateMonth(admin, boulangerieId, moisRef)` → MonthlyAggregates
//   moisRef = 1er du mois ciblé (YYYY-MM-01)
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────

export interface MonthlyAggregates {
  mois:             string;           // "2026-03"
  mois_label:       string;           // "Mars 2026"
  jours_cloturee:   number;
  jours_total:      number;
  ca_total:         number;
  ca_moyen_jour:    number;
  taux_invendu_moyen: number;
  best_jour:        { date: string; ca: number } | null;
  worst_jour:       { date: string; ca: number } | null;
  commandes_online_total: number;
  paniers_flash_vendus:   number;
  paniers_flash_ca:       number;
  top_produits:     Array<{ nom: string; emoji: string; ca_estime: number; total_vendu: number; taux_invendu: number }>;
  produits_sous_performants: Array<{ nom: string; emoji: string; taux_invendu: number; total_production: number }>;
  jour_semaine_analyse: Array<{ jour_num: number; jour_label: string; ca_moyen: number; invendus_pct: number; n: number }>;
  evolution_ca:     Array<{ date: string; ca: number }>;
  evolution_invendus: Array<{ date: string; taux: number }>;
  feedback_ratings: { moy: number; n: number };
  meteo_pluie_jours: number;
  comparaison_m_precedent: {
    ca_delta_pct:        number | null;
    invendus_delta_pct:  number | null;
    commandes_delta_pct: number | null;
  };
}

// ── Helpers ───────────────────────────────────────────────────

function monthRange(moisRef: string): { start: string; end: string; nextMonth: string } {
  const [y, m] = moisRef.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const next  = m === 12 ? new Date(Date.UTC(y + 1, 0, 1)) : new Date(Date.UTC(y, m, 1));
  const nextStr = next.toISOString().slice(0, 10);
  const endDate = new Date(next.getTime() - 86_400_000);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, nextMonth: nextStr };
}

function prevMonth(moisRef: string): string {
  const [y, m] = moisRef.split('-').map(Number);
  if (m === 1) return `${y - 1}-12-01`;
  return `${y}-${String(m - 1).padStart(2, '0')}-01`;
}

function formatMonthLabel(moisRef: string): string {
  const [y, m] = moisRef.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const JOURS_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function deltaPct(curr: number, prev: number): number | null {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10; // 1 décimale
}

interface JourneeRow {
  id: string;
  date: string;
  ca_estime: number | null;
  taux_invendu: number | null;
  total_produit: number | null;
  total_invendu: number | null;
  commandes_online: number | null;
  cloturee: boolean | null;
  jour_semaine: number | null;
}

interface StockRow {
  journee_id: string;
  produit_id: string;
  produit_nom: string;
  produit_emoji: string | null;
  prix_vente: number | null;
  production: number | null;
  stock_final: number | null;
}

// ── API principale ────────────────────────────────────────────

export async function aggregateMonth(
  admin: SupabaseClient,
  boulangerieId: string,
  moisRef: string, // "YYYY-MM-01"
): Promise<MonthlyAggregates> {
  const { start, end } = monthRange(moisRef);

  // 1. Journées du mois
  const { data: journeesRaw } = await admin
    .from('journees')
    .select('id, date, ca_estime, taux_invendu, total_produit, total_invendu, commandes_online, cloturee, jour_semaine')
    .eq('boulangerie_id', boulangerieId)
    .gte('date', start)
    .lte('date', end)
    .order('date');

  const journees = (journeesRaw ?? []) as JourneeRow[];
  const joursClot = journees.filter(j => j.cloturee);
  const joursTotal = journees.length;

  const caTotal        = joursClot.reduce((s, j) => s + Number(j.ca_estime ?? 0), 0);
  const caMoyenJour    = joursClot.length > 0 ? caTotal / joursClot.length : 0;
  const invendusMoyen  = joursClot.length > 0
    ? joursClot.reduce((s, j) => s + Number(j.taux_invendu ?? 0), 0) / joursClot.length
    : 0;

  let bestJour: { date: string; ca: number } | null = null;
  let worstJour: { date: string; ca: number } | null = null;
  for (const j of joursClot) {
    const ca = Number(j.ca_estime ?? 0);
    if (!bestJour  || ca > bestJour.ca)  bestJour  = { date: j.date, ca };
    if (!worstJour || ca < worstJour.ca) worstJour = { date: j.date, ca };
  }

  const commandesOnline = journees.reduce((s, j) => s + Number(j.commandes_online ?? 0), 0);

  // 2. Paniers flash
  const { data: paniersRaw } = await admin
    .from('paniers_flash')
    .select('quantite_initiale, quantite_restante, prix_flash')
    .eq('boulangerie_id', boulangerieId)
    .gte('date', start)
    .lte('date', end);

  const paniersFlash = (paniersRaw ?? []) as Array<{ quantite_initiale: number; quantite_restante: number; prix_flash: number }>;
  const paniersFlashVendus = paniersFlash.reduce((s, p) => s + Math.max(0, Number(p.quantite_initiale ?? 0) - Number(p.quantite_restante ?? 0)), 0);
  const paniersFlashCa     = paniersFlash.reduce((s, p) => {
    const vendus = Math.max(0, Number(p.quantite_initiale ?? 0) - Number(p.quantite_restante ?? 0));
    return s + vendus * Number(p.prix_flash ?? 0);
  }, 0);

  // 3. Stocks agrégés par produit (pour top/flop)
  const journeeIds = journees.map(j => j.id);
  const stocks: StockRow[] = [];
  if (journeeIds.length > 0) {
    const { data: stocksRaw } = await admin
      .from('stocks_journaliers')
      .select('journee_id, produit_id, produit_nom, produit_emoji, prix_vente, production, stock_final')
      .in('journee_id', journeeIds);
    stocks.push(...((stocksRaw ?? []) as StockRow[]));
  }

  const produitAgg = new Map<string, { nom: string; emoji: string; production: number; invendus: number; ca: number }>();
  for (const s of stocks) {
    const key  = s.produit_id;
    const prev = produitAgg.get(key) ?? { nom: s.produit_nom, emoji: s.produit_emoji ?? '🥖', production: 0, invendus: 0, ca: 0 };
    const prod = Number(s.production ?? 0);
    const inv  = Number(s.stock_final ?? 0);
    const prix = Number(s.prix_vente ?? 0);
    prev.production += prod;
    prev.invendus   += inv;
    prev.ca         += Math.max(0, prod - inv) * prix;
    produitAgg.set(key, prev);
  }

  const produitsArr = Array.from(produitAgg.values()).map(p => ({
    nom:              p.nom,
    emoji:            p.emoji,
    ca_estime:        Math.round(p.ca),
    total_vendu:      Math.max(0, p.production - p.invendus),
    total_production: p.production,
    taux_invendu:     p.production > 0 ? Math.round((p.invendus / p.production) * 1000) / 10 : 0,
  }));

  const topProduits = [...produitsArr]
    .sort((a, b) => b.ca_estime - a.ca_estime)
    .slice(0, 5);

  const sousPerf = [...produitsArr]
    .filter(p => p.total_production >= 20) // filtre bruit
    .sort((a, b) => b.taux_invendu - a.taux_invendu)
    .slice(0, 5)
    .map(p => ({ nom: p.nom, emoji: p.emoji, taux_invendu: p.taux_invendu, total_production: p.total_production }));

  // 4. Analyse par jour de semaine
  const parJour = new Map<number, { ca: number; inv: number; n: number }>();
  for (const j of joursClot) {
    const num = j.jour_semaine ?? new Date(j.date + 'T12:00:00Z').getUTCDay();
    const prev = parJour.get(num) ?? { ca: 0, inv: 0, n: 0 };
    prev.ca  += Number(j.ca_estime ?? 0);
    prev.inv += Number(j.taux_invendu ?? 0);
    prev.n   += 1;
    parJour.set(num, prev);
  }
  const jourSemaineAnalyse = Array.from(parJour.entries())
    .map(([num, v]) => ({
      jour_num:     num,
      jour_label:   JOURS_LABELS[num] ?? '?',
      ca_moyen:     v.n > 0 ? Math.round(v.ca / v.n) : 0,
      invendus_pct: v.n > 0 ? Math.round((v.inv / v.n) * 10) / 10 : 0,
      n:            v.n,
    }))
    .sort((a, b) => a.jour_num - b.jour_num);

  // 5. Évolution CA + invendus (séries temporelles)
  const evolutionCa = joursClot.map(j => ({ date: j.date, ca: Math.round(Number(j.ca_estime ?? 0)) }));
  const evolutionInvendus = joursClot.map(j => ({ date: j.date, taux: Number(j.taux_invendu ?? 0) }));

  // 6. Feedbacks
  const { data: feedbacksRaw } = await admin
    .from('feedback_journee')
    .select('rating_journee')
    .eq('boulangerie_id', boulangerieId)
    .gte('created_at', start)
    .lt('created_at', `${end}T23:59:59`);

  const ratings = (feedbacksRaw ?? []) as Array<{ rating_journee: number }>;
  const ratingMoy = ratings.length > 0
    ? Math.round((ratings.reduce((s, r) => s + r.rating_journee, 0) / ratings.length) * 10) / 10
    : 0;

  // 7. Météo pluie
  const { data: meteoRaw } = await admin
    .from('meteo_journees')
    .select('precipitations_mm')
    .eq('boulangerie_id', boulangerieId)
    .gte('date', start)
    .lte('date', end);
  const meteoPluie = (meteoRaw ?? []).filter(m => Number(m.precipitations_mm ?? 0) > 1).length;

  // 8. Comparaison m-1
  const prev = prevMonth(moisRef);
  const { start: prevStart, end: prevEnd } = monthRange(prev);
  const { data: prevJourneesRaw } = await admin
    .from('journees')
    .select('ca_estime, taux_invendu, commandes_online, cloturee')
    .eq('boulangerie_id', boulangerieId)
    .gte('date', prevStart)
    .lte('date', prevEnd)
    .eq('cloturee', true);
  const prevJ = (prevJourneesRaw ?? []) as Array<{ ca_estime: number; taux_invendu: number; commandes_online: number }>;
  const prevCa       = prevJ.reduce((s, j) => s + Number(j.ca_estime ?? 0), 0);
  const prevInvMoyen = prevJ.length > 0 ? prevJ.reduce((s, j) => s + Number(j.taux_invendu ?? 0), 0) / prevJ.length : 0;
  const prevCmd      = prevJ.reduce((s, j) => s + Number(j.commandes_online ?? 0), 0);

  return {
    mois:            moisRef.slice(0, 7),
    mois_label:      formatMonthLabel(moisRef),
    jours_cloturee:  joursClot.length,
    jours_total:     joursTotal,
    ca_total:        Math.round(caTotal),
    ca_moyen_jour:   Math.round(caMoyenJour),
    taux_invendu_moyen: Math.round(invendusMoyen * 10) / 10,
    best_jour:       bestJour ? { ...bestJour, ca: Math.round(bestJour.ca) } : null,
    worst_jour:      worstJour ? { ...worstJour, ca: Math.round(worstJour.ca) } : null,
    commandes_online_total: commandesOnline,
    paniers_flash_vendus:   paniersFlashVendus,
    paniers_flash_ca:       Math.round(paniersFlashCa),
    top_produits:           topProduits.map(p => ({ nom: p.nom, emoji: p.emoji, ca_estime: p.ca_estime, total_vendu: p.total_vendu, taux_invendu: p.taux_invendu })),
    produits_sous_performants: sousPerf,
    jour_semaine_analyse:   jourSemaineAnalyse,
    evolution_ca:           evolutionCa,
    evolution_invendus:     evolutionInvendus,
    feedback_ratings:       { moy: ratingMoy, n: ratings.length },
    meteo_pluie_jours:      meteoPluie,
    comparaison_m_precedent: {
      ca_delta_pct:        deltaPct(caTotal, prevCa),
      invendus_delta_pct:  deltaPct(invendusMoyen, prevInvMoyen),
      commandes_delta_pct: deltaPct(commandesOnline, prevCmd),
    },
  };
}
