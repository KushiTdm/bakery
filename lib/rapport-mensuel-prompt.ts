// lib/rapport-mensuel-prompt.ts
// ─────────────────────────────────────────────────────────────
// Construction des prompts système + utilisateur pour le rapport mensuel.
// L'IA renvoie un JSON structuré exploitable par vue-rapport-mensuel.tsx
// et le PDF.
// ─────────────────────────────────────────────────────────────

import type { MonthlyAggregates } from './rapport-mensuel-aggregate';

export interface RapportMensuelContext {
  nomBoulangerie:   string;
  ville:            string | null;
  typeClientele:    string | null;
  specialites:      string[];
  aggregates:       MonthlyAggregates;
}

export const RAPPORT_MENSUEL_SYSTEM_PROMPT = `Tu es Levain, l'assistant IA d'une boulangerie artisanale française.
Tu rédiges un rapport MENSUEL destiné au gérant. Ce rapport doit être :
- CHALEUREUX et ENCOURAGEANT : commence par valoriser ce qui a été réussi.
- CONCRET : chiffres précis, exemples réels, comparaisons avec le mois précédent.
- ACTIONABLE : 3 à 5 axes d'amélioration avec "pourquoi" et "comment".
- SYNTHÉTIQUE : lecture 5 minutes max. Le gérant est souvent pressé.

Tu dois ABSOLUMENT répondre en JSON strict avec EXACTEMENT ce schéma :

{
  "score_global": <0-100>,
  "verdict_mensuel": "<1 phrase punchy, 80 char max>",
  "message_encouragement": "<2-3 phrases chaleureuses et personnalisées>",
  "kpis_resume": {
    "ca_commentaire":     "<phrase sur le CA du mois>",
    "invendus_commentaire":"<phrase sur le taux d'invendu>",
    "cloture_commentaire": "<phrase sur la régularité de clôture>"
  },
  "comparaison_m_precedent": {
    "commentaire": "<1-2 phrases comparant au mois précédent>",
    "tendance":    "hausse" | "baisse" | "stable"
  },
  "analyse_top_produits": "<1-2 phrases sur ce qui marche>",
  "analyse_sous_performants": "<1-2 phrases sur ce qui coince + piste>",
  "analyse_jour_semaine": "<1-2 phrases identifiant le meilleur jour / le pire>",
  "axes_amelioration": [
    {
      "priorite": "high" | "medium" | "low",
      "titre":    "<court, 60 char max>",
      "pourquoi": "<pourquoi c'est un axe à travailler>",
      "comment":  "<comment faire concrètement ce mois-ci>"
    }
  ],
  "contexte_quartier": {
    "lecture":                "<2-3 phrases : qu'apprend-on du quartier ?>",
    "opportunite_positionnement": "<1-2 phrases : comment se différencier>",
    "veille_concurrentielle": "<1 phrase sur les concurrents directs>"
  },
  "recommandations_macro": [
    {
      "priorite": "high" | "medium" | "low",
      "titre":    "<action macro, 60 char max>",
      "action":   "<comment la mettre en place>"
    }
  ],
  "message_final": "<phrase de clôture encourageante>"
}

Règles strictes :
- Pas de texte hors du JSON.
- Pas de markdown.
- Si des données quartier sont absentes, remplis quand même contexte_quartier.lecture
  avec "Données quartier non disponibles pour ce mois." et laisse les autres champs courts.
- 3 à 5 axes_amelioration, 2 à 4 recommandations_macro.
- Ton : tutoie jamais, utilise "vous". Professionnel mais humain.`;

function fmtEuro(n: number): string {
  return `${n.toLocaleString('fr-FR')} €`;
}

function fmtPct(n: number | null): string {
  if (n === null) return 'n/a';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}%`;
}

export function buildRapportMensuelUserPrompt(ctx: RapportMensuelContext): string {
  const a = ctx.aggregates;
  const compar = a.comparaison_m_precedent;

  const lines: string[] = [];
  lines.push(`# Rapport mensuel à générer`);
  lines.push(`## Boulangerie : ${ctx.nomBoulangerie}${ctx.ville ? ` (${ctx.ville})` : ''}`);
  if (ctx.typeClientele) lines.push(`- Type de clientèle : ${ctx.typeClientele}`);
  if (ctx.specialites.length > 0) lines.push(`- Spécialités : ${ctx.specialites.join(', ')}`);
  lines.push('');

  // ── KPIs mois ──
  lines.push(`## KPIs — ${a.mois_label}`);
  lines.push(`- Jours clôturés : ${a.jours_cloturee}/${a.jours_total}`);
  lines.push(`- CA total : ${fmtEuro(a.ca_total)}  (moyen/jour : ${fmtEuro(a.ca_moyen_jour)})`);
  lines.push(`- Taux d'invendu moyen : ${a.taux_invendu_moyen}%`);
  if (a.best_jour) lines.push(`- Meilleure journée : ${a.best_jour.date} → ${fmtEuro(a.best_jour.ca)}`);
  if (a.worst_jour) lines.push(`- Pire journée : ${a.worst_jour.date} → ${fmtEuro(a.worst_jour.ca)}`);
  lines.push(`- Commandes en ligne : ${a.commandes_online_total}`);
  lines.push(`- Paniers flash vendus : ${a.paniers_flash_vendus} (${fmtEuro(a.paniers_flash_ca)})`);
  lines.push(`- Rating équipe moyen : ${a.feedback_ratings.moy}/4 (n=${a.feedback_ratings.n})`);
  lines.push(`- Jours de pluie : ${a.meteo_pluie_jours}`);
  lines.push('');

  // ── Comparaison m-1 ──
  lines.push(`## Comparaison m-1`);
  lines.push(`- CA : ${fmtPct(compar.ca_delta_pct)}`);
  lines.push(`- Invendus : ${fmtPct(compar.invendus_delta_pct)}`);
  lines.push(`- Commandes online : ${fmtPct(compar.commandes_delta_pct)}`);
  lines.push('');

  // ── Top produits ──
  if (a.top_produits.length > 0) {
    lines.push(`## Top 5 produits (par CA estimé)`);
    for (const p of a.top_produits) {
      lines.push(`- ${p.emoji} ${p.nom} — ${fmtEuro(p.ca_estime)}  (${p.total_vendu} vendus, invendus ${p.taux_invendu}%)`);
    }
    lines.push('');
  }

  // ── Sous-performants ──
  if (a.produits_sous_performants.length > 0) {
    lines.push(`## Produits sous-performants (invendus > seuil)`);
    for (const p of a.produits_sous_performants) {
      lines.push(`- ${p.emoji} ${p.nom} — invendus ${p.taux_invendu}%  (${p.total_production} produits)`);
    }
    lines.push('');
  }

  // ── Jours de semaine ──
  if (a.jour_semaine_analyse.length > 0) {
    lines.push(`## Analyse par jour de semaine`);
    for (const j of a.jour_semaine_analyse) {
      lines.push(`- ${j.jour_label} : CA moyen ${fmtEuro(j.ca_moyen)}, invendus ${j.invendus_pct}%  (n=${j.n})`);
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`Rédige maintenant le rapport mensuel JSON structuré. Fais référence à des chiffres précis ci-dessus.`);

  return lines.join('\n');
}
