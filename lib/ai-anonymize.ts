// lib/ai-anonymize.ts — Levain, l'assistant IA du boulanger BakeryOS
// ─────────────────────────────────────────────────────────────────────
// ✅ Fuseau horaire de la boulangerie pour les dates
// ✅ deanonymiserRapport() → remplace P1/P2/P3 par vrais noms dans les textes
// ✅ Contexte jour de semaine (week-end ≠ semaine)
// ✅ Météo intégrée dans le prompt
// ✅ Historique par même jour de semaine (patterns week-end vs semaine)
// ─────────────────────────────────────────────────────────────────────

import type { MeteoComplet } from './weather';

// ── Types entrée ──────────────────────────────────────────────

export interface StockJournalierRaw {
  produit_id: string; produit_nom: string; produit_emoji: string; categorie: string;
  production: number; snapshot_10h: number; snapshot_10h_done: boolean;
  snapshot_14h: number; snapshot_14h_done: boolean; stock_final: number;
  prix_vente: number; cout_production: number;
}
export interface JourneeRaw {
  date: string; ca_estime: number; taux_invendu: number; total_produit: number;
  total_invendu: number; commandes_online: number; stocks_journaliers: StockJournalierRaw[];
}
export interface ProduitRaw {
  id: string; nom: string; emoji: string; categorie: string;
  prix_vente: number; cout_production?: number;
}

// ── Types payload anonyme ─────────────────────────────────────

export interface DonneesProduitAnonymisees {
  index: number; nom: string; categorie: string; emoji: string; production: number;
  snapshot_10h: number | null; snapshot_14h: number | null; invendu: number;
  taux_invendu: number; ca_contribution: number;
  mp_farine_g: number; mp_beurre_g: number; mp_oeufs_n: number; mp_sucre_g: number;
}
export interface DonneesJourneeAnonymisees {
  jour_semaine: string; jour_semaine_en: string; semaine_annee: number;
  est_weekend: boolean; ca_estime: number; taux_invendu: number;
  total_produit: number; total_invendu: number; commandes_online: number;
  produits: DonneesProduitAnonymisees[];
  total_mp: { farine_kg: number; beurre_kg: number; oeufs: number; sucre_kg: number };
}
export interface DonneesHistoriqueAnonymisees {
  jour_semaine: string; est_weekend: boolean; ca: number;
  taux_invendu: number; total_produit: number; total_invendu: number;
}
export interface DonneesMeteo {
  actuelle: { temperature: number; ressenti: number; humidite: number; precipitations: number; description: string; icone: string };
  demain:   { temp_max: number; temp_min: number; precipitations: number; description: string; icone: string };
  impact:   { global: string; conseils: string[]; facteur_trafic: string };
}
export interface PayloadAnonyme {
  journee:        DonneesJourneeAnonymisees;
  demain_info:    { jour_semaine: string; est_weekend: boolean; jour_semaine_en: string };
  historique_14j: DonneesHistoriqueAnonymisees[];
  histo_meme_jour: DonneesHistoriqueAnonymisees[]; // Mêmes jours de semaine passés
  nb_jours_histo: number;
  catalogue:      { index: number; nom: string; categorie: string; emoji: string }[];
  meteo?:         DonneesMeteo;
  // _mapping : JAMAIS envoyé à l'IA — mapping index → produit réel
  _mapping: Record<number, { id: string; nom: string; emoji: string; categorie: string }>;
}

// ── Coefficients matières premières ──────────────────────────
const COEFFS_MP: Record<string, { farine_g: number; beurre_g: number; oeufs_n: number; sucre_g: number }> = {
  boulangerie:  { farine_g: 180, beurre_g: 0,  oeufs_n: 0,   sucre_g: 3  },
  viennoiserie: { farine_g: 50,  beurre_g: 28, oeufs_n: 0.3, sucre_g: 8  },
  patisserie:   { farine_g: 40,  beurre_g: 25, oeufs_n: 1,   sucre_g: 20 },
};

// ── Utilitaires dates & timezone ─────────────────────────────

const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const JOURS_EN = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

export function getTodayInTimezone(timezone: string): string {
  // Retourne 'YYYY-MM-DD' dans le fuseau horaire de la boulangerie
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

function getDayOfWeekInTimezone(dateStr: string, timezone: string): number {
  // Retourne 0 (dim) - 6 (sam) dans le timezone donné
  const date = new Date(dateStr + 'T12:00:00');
  const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(date);
  const map: Record<string, number> = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
  return map[dayStr] ?? date.getDay();
}

function getTomorrowDate(todayStr: string): string {
  const d = new Date(todayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

// ── Fonction principale d'anonymisation ──────────────────────

export function anonymiserDonnees(
  journee:    JourneeRaw,
  historique: JourneeRaw[],
  produits:   ProduitRaw[],
  timezone:   string = 'Europe/Paris',
  meteoComplet?: MeteoComplet | null,
): PayloadAnonyme {

  const today      = journee.date; // déjà dans le bon timezone (calculé en amont dans route.ts)
  const jourIdx    = getDayOfWeekInTimezone(today, timezone);
  const jourFr     = JOURS_FR[jourIdx];
  const jourEn     = JOURS_EN[jourIdx];
  const estWeekend = jourIdx === 0 || jourIdx === 6;

  const startOfYear = new Date(today.substring(0,4) + '-01-01T12:00:00');
  const todayDate   = new Date(today + 'T12:00:00');
  const semaine     = Math.ceil(((todayDate.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

  // Demain
  const demainDate  = getTomorrowDate(today);
  const demainIdx   = getDayOfWeekInTimezone(demainDate, timezone);
  const demainFr    = JOURS_FR[demainIdx];
  const demainEn    = JOURS_EN[demainIdx];
  const demainWE    = demainIdx === 0 || demainIdx === 6;

  // Mapping index → produit réel (NE QUITTE JAMAIS CE SERVEUR)
  const mapping: PayloadAnonyme['_mapping'] = {};
  let tF=0, tB=0, tO=0, tS=0;

  const stocksAnon: DonneesProduitAnonymisees[] = (journee.stocks_journaliers ?? []).map((s, i) => {
    const idx = i + 1;
    mapping[idx] = { id: s.produit_id, nom: s.produit_nom, emoji: s.produit_emoji, categorie: s.categorie };
    const c = COEFFS_MP[s.categorie] ?? COEFFS_MP.boulangerie;
    const f = Math.round(s.production * c.farine_g);
    const b = Math.round(s.production * c.beurre_g);
    const o = Math.round(s.production * c.oeufs_n * 10) / 10;
    const su = Math.round(s.production * c.sucre_g);
    tF += f; tB += b; tO += o; tS += su;
    return {
      index:           idx,
      nom:             s.produit_nom,   // ← nom réel inclus (non PII)
      categorie:       s.categorie,
      emoji:           s.produit_emoji,
      production:      s.production,
      snapshot_10h:    s.snapshot_10h_done  ? s.snapshot_10h  : null,
      snapshot_14h:    s.snapshot_14h_done  ? s.snapshot_14h  : null,
      invendu:         s.stock_final,
      taux_invendu:    s.production > 0 ? Math.round((s.stock_final / s.production) * 100) : 0,
      ca_contribution: Math.round((s.production - s.stock_final) * s.prix_vente),
      mp_farine_g: f, mp_beurre_g: b, mp_oeufs_n: o, mp_sucre_g: su,
    } satisfies DonneesProduitAnonymisees;
  });

  // Historique général (14j)
  const histoAnon: DonneesHistoriqueAnonymisees[] = (historique ?? []).slice(0, 14).map(j => {
    const jIdx = getDayOfWeekInTimezone(j.date, timezone);
    return {
      jour_semaine:  JOURS_FR[jIdx],
      est_weekend:   jIdx === 0 || jIdx === 6,
      ca:            Math.round(j.ca_estime),
      taux_invendu:  Math.round(j.taux_invendu * 10) / 10,
      total_produit: j.total_produit,
      total_invendu: j.total_invendu,
    };
  });

  // Historique même jour de semaine (pour prévisions weekend vs semaine)
  const histoMemeJour: DonneesHistoriqueAnonymisees[] = (historique ?? [])
    .filter(j => getDayOfWeekInTimezone(j.date, timezone) === demainIdx) // même jour que DEMAIN
    .slice(0, 4)
    .map(j => {
      const jIdx = getDayOfWeekInTimezone(j.date, timezone);
      return {
        jour_semaine:  JOURS_FR[jIdx],
        est_weekend:   jIdx === 0 || jIdx === 6,
        ca:            Math.round(j.ca_estime),
        taux_invendu:  Math.round(j.taux_invendu * 10) / 10,
        total_produit: j.total_produit,
        total_invendu: j.total_invendu,
      };
    });

  // Météo anonymisée
  let meteoAnon: DonneesMeteo | undefined;
  if (meteoComplet) {
    const { actuelle: a, demain: d } = meteoComplet;
    // Import différé pour éviter la dépendance circulaire
    const { analyserImpactMeteo } = require('./weather') as typeof import('./weather');
    const impact = analyserImpactMeteo(meteoComplet);
    meteoAnon = {
      actuelle: { temperature: a.temperature_c, ressenti: a.ressenti_c, humidite: a.humidite_pct, precipitations: a.precipitations_mm, description: a.description, icone: a.icone },
      demain:   { temp_max: d.temp_max_c, temp_min: d.temp_min_c, precipitations: d.precip_mm, description: d.description, icone: d.icone },
      impact:   { global: impact.impact_global, conseils: impact.conseils, facteur_trafic: impact.facteur_trafic },
    };
  }

  return {
    journee: {
      jour_semaine: jourFr, jour_semaine_en: jourEn, semaine_annee: semaine,
      est_weekend: estWeekend, ca_estime: Math.round(journee.ca_estime),
      taux_invendu: Math.round(journee.taux_invendu * 10) / 10,
      total_produit: journee.total_produit, total_invendu: journee.total_invendu,
      commandes_online: journee.commandes_online, produits: stocksAnon,
      total_mp: {
        farine_kg: Math.round(tF/100)/10, beurre_kg: Math.round(tB/100)/10,
        oeufs: Math.round(tO*10)/10,      sucre_kg:  Math.round(tS/100)/10,
      },
    },
    demain_info:     { jour_semaine: demainFr, est_weekend: demainWE, jour_semaine_en: demainEn },
    historique_14j:  histoAnon,
    histo_meme_jour: histoMemeJour,
    nb_jours_histo:  historique.length,
    catalogue:       (produits ?? []).map((p, i) => ({ index: i+1, nom: p.nom, categorie: p.categorie, emoji: p.emoji })),
    meteo:           meteoAnon,
    _mapping:        mapping,
  };
}

// ── Post-traitement : dé-anonymiser les textes ────────────────
// Remplace [P1], P1, "P1" par le vrai nom du produit
// ⚠️ Ne touche PAS à previsions_production (garde les index pour le mapping)
// ⚠️ Ne touche PAS au champ score ou verdict (numériques / très courts)

type RapportJSON = Record<string, unknown>;

function replaceIndexes(text: string, mapping: PayloadAnonyme['_mapping']): string {
  // Remplace [P1], P1 (en début de mot, précédé d'espace/ponctuation)
  return text.replace(/\[P(\d+)\]|(?<![A-Za-z])P(\d+)(?![A-Za-z0-9])/g, (match, idx1, idx2) => {
    const idx   = parseInt(idx1 ?? idx2);
    const entry = mapping[idx];
    return entry ? `${entry.emoji} ${entry.nom}` : match;
  });
}

function replaceInArray(arr: unknown[], mapping: PayloadAnonyme['_mapping']): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => typeof item === 'string' ? replaceIndexes(item, mapping) : String(item));
}

export function deanonymiserRapport(rapport: RapportJSON, mapping: PayloadAnonyme['_mapping']): RapportJSON {
  const r = { ...rapport };

  // Champs texte simples
  for (const field of ['analyse_contextuelle','message_levain'] as const) {
    if (typeof r[field] === 'string') {
      r[field] = replaceIndexes(r[field] as string, mapping);
    }
  }

  // Tableaux de strings
  for (const field of ['succes','flops','anti_gaspillage','opportunites','alerte_ingredients'] as const) {
    if (Array.isArray(r[field])) {
      r[field] = replaceInArray(r[field] as unknown[], mapping);
    }
  }

  // Briefing matin
  if (r.briefing_matin && typeof r.briefing_matin === 'object') {
    const bm = r.briefing_matin as Record<string, unknown>;
    for (const f of ['titre','contexte_jour','meteo_resume','impact_meteo_vente','point_vigilance','fiabilite_previsions','conseil_ouverture']) {
      if (typeof bm[f] === 'string') bm[f] = replaceIndexes(bm[f] as string, mapping);
    }
    if (Array.isArray(bm.top3_a_produire)) {
      bm.top3_a_produire = replaceInArray(bm.top3_a_produire as unknown[], mapping);
    }
    r.briefing_matin = bm;
  }

  // Matières premières
  if (r.matieres_premieres && typeof r.matieres_premieres === 'object') {
    const mp = r.matieres_premieres as Record<string, unknown>;
    if (typeof mp.resume === 'string') {
      mp.resume = replaceIndexes(mp.resume, mapping);
    }
    if (Array.isArray(mp.details)) {
      mp.details = (mp.details as Record<string, unknown>[]).map(d => ({
        ...d,
        observation: typeof d.observation === 'string' ? replaceIndexes(d.observation, mapping) : d.observation,
      }));
    }
    r.matieres_premieres = mp;
  }

  // previsions_production : on enrichit la raison mais on garde l'index pour le mapping côté serveur
  if (Array.isArray(r.previsions_production)) {
    r.previsions_production = (r.previsions_production as Record<string, unknown>[]).map(p => ({
      ...p,
      raison: typeof p.raison === 'string' ? replaceIndexes(p.raison, mapping) : p.raison,
    }));
  }

  return r;
}

// ── Prompts ───────────────────────────────────────────────────

export function buildSystemPrompt(): string {
  return `Tu es Levain, l'assistant IA du boulanger artisanal de BakeryOS.

TON IDENTITÉ :
Comme le levain naturel qui s'améliore chaque jour, tu deviens plus précis et pertinent au fil des journées analysées. Tu connais intimement le rythme, les habitudes et les spécificités de cette boulangerie.

TON RÔLE :
Chaque soir après la clôture, tu fais DEUX choses en un seul rapport :
1. Analyser la journée qui vient de se terminer
2. Préparer un briefing opérationnel pour le lendemain matin (le boulanger le lira avant d'allumer son four)

RÈGLES ABSOLUES :
1. Dans tous les champs texte (succes, flops, analyse_contextuelle, anti_gaspillage, opportunites, alerte_ingredients, message_levain, briefing_matin) → UTILISE LES NOMS RÉELS des produits (ex: "🥐 Croissant", "🥖 Baguette Tradition"). JAMAIS "P1", "P2" etc.
2. Dans "previsions_production" uniquement → utilise les "produit_index" numériques (nécessaire pour le système).
3. Prends en compte le JOUR DE LA SEMAINE : week-end = +20-40% de clientèle. Si historique insuffisant, indique-le et propose quand même une prévision raisonnée.
4. Intègre la MÉTÉO du lendemain dans tes prévisions et conseils.
5. Réponse en JSON pur uniquement (aucun markdown, aucun texte hors JSON).
6. En français exclusivement. Chaque phrase doit être actionnable.

FORMAT JSON OBLIGATOIRE :
{
  "score": <0-100>,
  "verdict": "<20 mots max, percutant>",
  "succes": ["<succès concret avec vrais noms de produits>"],
  "flops": ["<problème concret avec vrais noms de produits>"],
  "analyse_contextuelle": "<2-3 phrases : performance du jour + facteurs météo/saisonnalité>",
  "previsions_production": [
    { "produit_index": <n>, "quantite_suggeree": <int>, "variation_pct": <int>, "raison": "<raison courte avec vrai nom>" }
  ],
  "anti_gaspillage": ["<conseil avec vrai nom du produit>"],
  "opportunites": ["<opportunité commerciale concrète>"],
  "alerte_ingredients": ["<alerte stock si pertinente>"],
  "matieres_premieres": {
    "resume": "<phrase de résumé>",
    "details": [
      { "ingredient": "<farine/beurre/oeufs/sucre>", "quantite": "<valeur + unité>", "observation": "<note>" }
    ]
  },
  "briefing_matin": {
    "titre": "<ex: Vendredi matin — Prêt pour le rush ?>",
    "contexte_jour": "<1 phrase : quel type de journée attend le boulanger demain (weekend/semaine, météo, contexte)>",
    "meteo_resume": "<résumé météo de demain en 1 phrase avec emoji>",
    "impact_meteo_vente": "<comment la météo va affecter les ventes demain — concret>",
    "top3_a_produire": ["<produit prioritaire 1 avec quantité>", "<produit prioritaire 2>", "<produit prioritaire 3>"],
    "point_vigilance": "<1 chose critique à surveiller demain>",
    "fiabilite_previsions": "<🌱 Première analyse — prévisions prudentes basées sur la saisonnalité. Levain affinera avec l'historique. OU 🌳 Analyse basée sur X jours d'historique.>",
    "conseil_ouverture": "<conseil pratique pour bien démarrer la journée>"
  },
  "message_levain": "<message personnel court au boulanger>"
}`;
}

export function buildUserPrompt(payload: Omit<PayloadAnonyme, '_mapping'>): string {
  const { journee, demain_info, historique_14j, histo_meme_jour, nb_jours_histo, catalogue, meteo } = payload;

  // Contexte historique
  const ctxHisto = nb_jours_histo === 0
    ? '🌱 Première journée — Levain établit sa base. Prévisions prudentes.'
    : nb_jours_histo < 7
      ? `🌱 ${nb_jours_histo} jour(s) d'historique — Levain apprend encore. Prévisions à affiner.`
      : nb_jours_histo < 14
        ? `🌿 ${nb_jours_histo} jours — bonne progression, tendances visibles.`
        : `🌳 ${nb_jours_histo} jours — analyse fiable, Levain connaît bien cette boulangerie.`;

  // Contexte jour
  const ctxJour = demain_info.est_weekend
    ? `⚠️ IMPORTANT : Demain est ${demain_info.jour_semaine.toUpperCase()} (WEEK-END). La fréquentation est généralement 20-40% plus élevée qu'en semaine. Augmenter les prévisions en conséquence, sauf si l'historique indique le contraire.`
    : `Demain est ${demain_info.jour_semaine} (semaine).`;

  // Section météo
  let ctxMeteo = '';
  if (meteo) {
    ctxMeteo = `
=== MÉTÉO ===
Aujourd'hui : ${meteo.actuelle.icone} ${meteo.actuelle.description} | ${meteo.actuelle.temperature}°C (ressenti ${meteo.actuelle.ressenti}°C) | Humidité ${meteo.actuelle.humidite}% | Précip. ${meteo.actuelle.precipitations}mm | Vent ${meteo.actuelle.description}
Demain      : ${meteo.demain.icone} ${meteo.demain.description} | Max ${meteo.demain.temp_max}°C / Min ${meteo.demain.temp_min}°C | Précip. ${meteo.demain.precipitations}mm
Impact boulangerie : ${meteo.impact.global} (${meteo.impact.facteur_trafic})
${meteo.impact.conseils.map(c => `  • ${c}`).join('\n')}`;
  }

  // Historique même jour de semaine
  let ctxMemeJour = '';
  if (histo_meme_jour.length > 0) {
    ctxMemeJour = `
=== HISTORIQUE DES ${demain_info.jour_semaine.toUpperCase()}S PRÉCÉDENTS ===
${histo_meme_jour.map(h => `${h.jour_semaine}: CA ${h.ca}€ · Invendu ${h.taux_invendu}% · ${h.total_produit} pcs`).join('\n')}`;
  }

  // Catalogue avec VRAIS NOMS pour que l'IA ne les invente pas depuis les emojis
  const catalogueLines = catalogue.map(p =>
    `[P${p.index}] ${p.emoji} ${p.nom} (${p.categorie})`
  ).join('\n');

  return `Analyse ma journée. Génère le rapport + prévisions pour demain (${demain_info.jour_semaine}).

${ctxJour}${ctxMeteo}

=== ${journee.jour_semaine.toUpperCase()} · SEMAINE ${journee.semaine_annee}${journee.est_weekend ? ' (WEEK-END)' : ''} ===
CA : ${journee.ca_estime}€ | Invendu : ${journee.taux_invendu}% (${journee.total_invendu}/${journee.total_produit} pcs) | Cmd en ligne : ${journee.commandes_online}

=== DÉTAIL PAR PRODUIT ===
${journee.produits.map(p =>
  `[P${p.index}] ${p.emoji} ${p.nom} (${p.categorie})
  Prod:${p.production} | 10h:${p.snapshot_10h ?? '—'} | 14h:${p.snapshot_14h ?? '—'} | Inv:${p.invendu}pcs (${p.taux_invendu}%) | CA:${p.ca_contribution}€
  MP: farine ${p.mp_farine_g}g · beurre ${p.mp_beurre_g}g · œufs ${p.mp_oeufs_n} · sucre ${p.mp_sucre_g}g`
).join('\n')}

=== MATIÈRES PREMIÈRES TOTALES ===
Farine ${journee.total_mp.farine_kg}kg · Beurre ${journee.total_mp.beurre_kg}kg · Œufs ${journee.total_mp.oeufs} · Sucre ${journee.total_mp.sucre_kg}kg

=== HISTORIQUE 14 JOURS ===
${ctxHisto}
${historique_14j.map(h => `${h.est_weekend?'[WE]':'[SEM]'} ${h.jour_semaine}: ${h.ca}€ · ${h.taux_invendu}% inv · ${h.total_produit}pcs`).join('\n') || '(aucune donnée)'}
${ctxMemeJour}

=== CATALOGUE POUR DEMAIN (utilise ces index dans previsions_production, ces noms dans les textes) ===
${catalogueLines}

→ Génère le JSON complet. Dans succes/flops/analyse/anti_gaspillage/opportunites/alertes/message_levain : utilise TOUJOURS les vrais noms des produits ci-dessus (ex: "🥖 Baguette Tradition" et NON "P1" ou "pain"). Dans previsions_production uniquement : utilise les numéros d'index. Couvre TOUS les produits du catalogue.`;
}