// app/api/boulanger/ai/rapport/route.ts
// ─────────────────────────────────────────────────────────────
// POST → Génère le rapport IA de clôture + prévisions de production
//
// Nouveautés v2 :
//   - Intègre les données du wizard pré-rapport (consignes owner, événement)
//   - Intègre le retour vendeuse (feedback_journee) dans le prompt Levain
//   - Rapport dual : section boulanger + section vendeuse
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  anonymiserDonnees,
  deanonymiserRapport,
  buildSystemPrompt,
  buildUserPrompt,
  getTodayInTimezone,
  type JourneeRaw,
  type ProduitRaw,
} from '@/lib/ai-anonymize';
import { fetchMeteo, analyserImpactMeteo } from '@/lib/weather';

// ── Config z.ai ───────────────────────────────────────────────
const ZHIPU_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZHIPU_MODEL   = process.env.ZHIPU_MODEL ?? 'glm-4.5-air';
const ZHIPU_MAX_TOK = 3000; // +500 pour les nouvelles sections
const ZHIPU_TIMEOUT = 90_000;

function extractJSON(raw: string): string {
  let c = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  c = c.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (c.startsWith('{')) return c;
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s !== -1 && e > s) return c.slice(s, e + 1);
  return c;
}

interface BoulangerieInfo {
  id:        string;
  plan:      string;
  timezone:  string;
  latitude:  number | null;
  longitude: number | null;
  ville:     string | null;
}

async function getAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id, plan, timezone, latitude, longitude, ville')
    .eq('user_id', user.id)
    .single();
  if (!boulangerie) return null;
  return {
    admin,
    boulangerie: {
      id:        boulangerie.id as string,
      plan:      (boulangerie.plan ?? 'starter') as string,
      timezone:  (boulangerie.timezone ?? 'Europe/Paris') as string,
      latitude:  boulangerie.latitude  as number | null,
      longitude: boulangerie.longitude as number | null,
      ville:     boulangerie.ville     as string | null,
    } satisfies BoulangerieInfo,
  };
}

// ── GET — récupère le rapport du jour ─────────────────────────

export async function GET(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { admin, boulangerie } = auth;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? getTodayInTimezone(boulangerie.timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Format date invalide (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const { data: rapport } = await admin
      .from('ai_rapports')
      .select('*')
      .eq('boulangerie_id', boulangerie.id)
      .eq('date', date)
      .single();

    const demainDate = (() => {
      const d = new Date(date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const { data: previsions } = await admin
      .from('production_forecasts')
      .select('*')
      .eq('boulangerie_id', boulangerie.id)
      .eq('date_production', demainDate)
      .order('produit_categorie')
      .order('produit_nom');

    // Récupère aussi le feedback vendeuse du jour
    let feedbackVendeuse = null;
    if (rapport?.journee_id) {
      const { data: fb } = await admin
        .from('feedback_journee')
        .select('*')
        .eq('journee_id', rapport.journee_id)
        .single();
      feedbackVendeuse = fb;
    }

    return NextResponse.json({
      rapport: rapport ?? null,
      previsions: previsions ?? [],
      feedback_vendeuse: feedbackVendeuse,
    });
  } catch (err) {
    console.error('[GET /api/boulanger/ai/rapport]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — génère le rapport IA ───────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { admin, boulangerie } = auth;
  const boulangerieId = boulangerie.id;

  const zhipuApiKey = process.env.ZHIPU_API_KEY;
  if (!zhipuApiKey) {
    return NextResponse.json({ error: 'Clé API z.ai non configurée' }, { status: 503 });
  }

  // ── Données wizard pré-rapport (optionnelles, envoyées dans le body) ──
  let wizardData: {
    consignes_boulanger?: string;
    consignes_vendeuse?:  string;
    evenement_demain?:    string;
    evenement_impact?:    'hausse' | 'neutre' | 'baisse';
    evenement_pct?:       number;
  } = {};

  try {
    const body = await req.json().catch(() => ({}));
    wizardData = body ?? {};
  } catch {}

  const today = getTodayInTimezone(boulangerie.timezone);

  try {
    // ── 1. Vérifier rapport existant ──────────────────────────
    const { data: existingRapport } = await admin
      .from('ai_rapports')
      .select('id, statut')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (existingRapport?.statut === 'genere') {
      const { data: rapport } = await admin
        .from('ai_rapports').select('*').eq('id', existingRapport.id).single();
      const demainDate = (() => {
        const d = new Date(today + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().split('T')[0];
      })();
      const { data: previsions } = await admin
        .from('production_forecasts').select('*')
        .eq('boulangerie_id', boulangerieId).eq('date_production', demainDate);
      return NextResponse.json({ rapport, previsions: previsions ?? [], cached: true });
    }

    // ── 2. Crée/met à jour le rapport en statut "en_cours" ────
    let rapportId: string;
    if (existingRapport) {
      rapportId = existingRapport.id;
      await admin.from('ai_rapports').update({
        statut: 'en_cours',
        erreur_msg: null,
        // Sauvegarde les données du wizard
        consignes_boulanger: wizardData.consignes_boulanger ?? null,
        consignes_vendeuse:  wizardData.consignes_vendeuse ?? null,
        wizard_evenement:    wizardData.evenement_demain ?? null,
        wizard_impact:       wizardData.evenement_impact ?? null,
        wizard_impact_pct:   wizardData.evenement_pct ?? 0,
      }).eq('id', rapportId);
    } else {
      const { data: nr } = await admin
        .from('ai_rapports')
        .insert({
          boulangerie_id: boulangerieId,
          date: today,
          statut: 'en_cours',
          consignes_boulanger: wizardData.consignes_boulanger ?? null,
          consignes_vendeuse:  wizardData.consignes_vendeuse ?? null,
          wizard_evenement:    wizardData.evenement_demain ?? null,
          wizard_impact:       wizardData.evenement_impact ?? null,
          wizard_impact_pct:   wizardData.evenement_pct ?? 0,
        })
        .select('id').single();
      rapportId = nr!.id;
    }

    // ── 3. Récupère les données de la journée ──────────────────
    const { data: journee } = await admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (!journee?.stocks_journaliers?.length) {
      await admin.from('ai_rapports').update({
        statut: 'erreur',
        erreur_msg: 'Aucune donnée de production.',
      }).eq('id', rapportId);
      return NextResponse.json({ error: 'Aucune production saisie pour aujourd\'hui.' }, { status: 400 });
    }

    // Feedback vendeuse du jour (si disponible)
    const { data: feedbackVendeuse } = await admin
      .from('feedback_journee')
      .select('*')
      .eq('journee_id', journee.id)
      .single();

    // Historique 14j
    const { data: historique } = await admin
      .from('journees')
      .select('date, ca_estime, taux_invendu, total_produit, total_invendu, commandes_online')
      .eq('boulangerie_id', boulangerieId)
      .eq('cloturee', true)
      .neq('date', today)
      .order('date', { ascending: false })
      .limit(14);

    const { data: produits } = await admin
      .from('produits')
      .select('id, nom, emoji, categorie, prix_vente')
      .eq('boulangerie_id', boulangerieId)
      .eq('actif_catalogue', true)
      .is('deleted_at', null)
      .order('categorie').order('ordre');

    await admin.from('ai_rapports').update({ journee_id: journee.id }).eq('id', rapportId);

    // ── 4. Fetch météo ─────────────────────────────────────────
    let meteoComplet = null;
    let meteoId: string | null = null;

    if (boulangerie.latitude && boulangerie.longitude) {
      try {
        meteoComplet = await fetchMeteo(boulangerie.latitude, boulangerie.longitude, boulangerie.timezone);
        if (meteoComplet) {
          const { data: meteoRow } = await admin
            .from('meteo_journees')
            .upsert({
              boulangerie_id:    boulangerieId,
              date:              today,
              temperature_c:     meteoComplet.actuelle.temperature_c,
              ressenti_c:        meteoComplet.actuelle.ressenti_c,
              humidite_pct:      meteoComplet.actuelle.humidite_pct,
              precipitations_mm: meteoComplet.actuelle.precipitations_mm,
              vitesse_vent_kmh:  meteoComplet.actuelle.vitesse_vent_kmh,
              code_meteo:        meteoComplet.actuelle.code_meteo,
              description:       meteoComplet.actuelle.description,
              icone:             meteoComplet.actuelle.icone,
              demain_temp_max_c: meteoComplet.demain.temp_max_c,
              demain_temp_min_c: meteoComplet.demain.temp_min_c,
              demain_precip_mm:  meteoComplet.demain.precip_mm,
              demain_code_meteo: meteoComplet.demain.code_meteo,
              demain_description: meteoComplet.demain.description,
              demain_icone:      meteoComplet.demain.icone,
              source:            'open-meteo',
              fetched_at:        new Date().toISOString(),
            }, { onConflict: 'boulangerie_id,date' })
            .select('id').single();
          if (meteoRow) meteoId = meteoRow.id as string;
        }
      } catch (meteoErr) {
        console.warn('[AI rapport] Erreur météo (non bloquante):', meteoErr);
      }
    }

    // ── 5. Anonymiser les données ──────────────────────────────
    const payload = anonymiserDonnees(
      journee as JourneeRaw,
      (historique ?? []) as JourneeRaw[],
      (produits ?? []) as ProduitRaw[],
      boulangerie.timezone,
      meteoComplet,
    );
    const { _mapping, ...payloadSansMapping } = payload;

    // ── 6. Construire le prompt enrichi ────────────────────────
    const systemPrompt = buildSystemPromptEnrichi();
    const userPrompt   = buildUserPromptEnrichi(
      payloadSansMapping,
      feedbackVendeuse,
      wizardData,
    );

    // ── 7. Appel z.ai ─────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), ZHIPU_TIMEOUT);
    let aiResponse: string;
    let tokensUtilises: number | null = null;

    try {
      const response = await fetch(ZHIPU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${zhipuApiKey}`,
        },
        body: JSON.stringify({
          model:           ZHIPU_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          thinking:        { type: 'disabled' },
          temperature:     0.25,
          max_tokens:      ZHIPU_MAX_TOK,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(`z.ai HTTP ${response.status}: ${err.slice(0, 300)}`);
      }
      const data = await response.json() as {
        choices: { message: { content: string } }[];
        usage?: { total_tokens: number };
      };
      aiResponse     = data.choices?.[0]?.message?.content ?? '';
      tokensUtilises = data.usage?.total_tokens ?? null;
    } finally {
      clearTimeout(timeoutId);
    }

    // ── 8. Parse + dé-anonymise ────────────────────────────────
    let rapportJSON: Record<string, unknown>;
    try {
      const cleaned = extractJSON(aiResponse);
      rapportJSON   = JSON.parse(cleaned);
    } catch (parseErr) {
      const preview = aiResponse.slice(0, 800);
      await admin.from('ai_rapports').update({
        statut: 'erreur',
        erreur_msg: `Non parsable: ${String(parseErr).slice(0, 200)}`,
      }).eq('id', rapportId);
      return NextResponse.json({ error: 'Réponse IA invalide.', debug_preview: preview }, { status: 502 });
    }

    const rapportDeanonymise = deanonymiserRapport(rapportJSON, _mapping);
    const score   = typeof rapportDeanonymise.score === 'number'
      ? Math.max(0, Math.min(100, Math.round(rapportDeanonymise.score))) : null;
    const verdict = typeof rapportDeanonymise.verdict === 'string'
      ? rapportDeanonymise.verdict.slice(0, 200) : null;

    // ── 9. Sauvegarde le rapport ───────────────────────────────
    await admin.from('ai_rapports').update({
      statut:            'genere',
      score_performance: score,
      verdict_flash:     verdict,
      rapport_json:      rapportDeanonymise,
      modele_ia:         ZHIPU_MODEL,
      tokens_utilises:   tokensUtilises,
      erreur_msg:        null,
      // Sauvegarde aussi le feedback vendeuse dans le rapport pour référence
      feedback_vendeuse: feedbackVendeuse ? JSON.stringify({
        rating:           feedbackVendeuse.rating_journee,
        points_forts:     feedbackVendeuse.points_forts,
        points_ameliorer: feedbackVendeuse.points_ameliorer,
        commentaire:      feedbackVendeuse.commentaire_libre,
      }) : null,
      ...(meteoId ? { meteo_id: meteoId } : {}),
    }).eq('id', rapportId);

    // ── 10. Prévisions de production ───────────────────────────
    const demainDate = (() => {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const previsions = Array.isArray(rapportDeanonymise.previsions_production)
      ? rapportDeanonymise.previsions_production as Record<string, unknown>[]
      : [];

    const previsionsRows = previsions
      .filter(p => p && typeof p === 'object')
      .map(p => {
        const idx    = Number(p.produit_index);
        const mapped = _mapping[idx];
        if (!mapped) return null;
        const qte  = Math.max(0, Math.round(Number(p.quantite_suggeree) || 0));
        const base = (journee.stocks_journaliers as StockRow[])
          ?.find(s => s.produit_id === mapped.id)?.production ?? 0;
        return {
          boulangerie_id:    boulangerieId,
          rapport_id:        rapportId,
          date_production:   demainDate,
          produit_id:        mapped.id,
          produit_nom:       mapped.nom,
          produit_categorie: mapped.categorie,
          produit_emoji:     mapped.emoji,
          quantite_suggeree: qte,
          quantite_base:     base,
          variation_pct:     typeof p.variation_pct === 'number'
            ? p.variation_pct
            : (base > 0 ? Math.round(((qte - base) / base) * 100) : 0),
          raison:            typeof p.raison === 'string' ? (p.raison as string).slice(0, 300) : null,
          appliquee:         false,
        };
      })
      .filter(Boolean);

    const couverts = new Set(previsionsRows.map(r => r?.produit_id));
    const manquants = (produits ?? []).filter(p => !couverts.has(p.id)).map(p => {
      const base = (journee.stocks_journaliers as StockRow[])
        ?.find(s => s.produit_id === p.id)?.production ?? 0;
      return {
        boulangerie_id:    boulangerieId,
        rapport_id:        rapportId,
        date_production:   demainDate,
        produit_id:        p.id,
        produit_nom:       p.nom,
        produit_categorie: p.categorie,
        produit_emoji:     p.emoji,
        quantite_suggeree: base,
        quantite_base:     base,
        variation_pct:     0,
        raison:            'Identique — données insuffisantes',
        appliquee:         false,
      };
    });

    const allPrevisions = [...previsionsRows, ...manquants].filter(Boolean);
    if (allPrevisions.length > 0) {
      await admin.from('production_forecasts')
        .upsert(allPrevisions, { onConflict: 'boulangerie_id,date_production,produit_id' });
    }

    // ── 11. Notification push ──────────────────────────────────
    const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const internalSecret = process.env.INTERNAL_API_SECRET ?? '';
    if (appUrl && internalSecret) {
      fetch(`${appUrl}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({
          boulangerie_id: boulangerieId,
          payload: {
            title: `🎯 Levain — Score ${score ?? '—'}/100`,
            body:  verdict ?? 'Votre rapport + plan de production pour demain sont prêts.',
            url:   '/boulanger', tag: 'rapport-ia',
          },
        }),
      }).catch(e => console.warn('[AI rapport] Push non envoyé:', e));
    }

    // ── 12. Retourne le résultat ───────────────────────────────
    const { data: rapportFinal } = await admin
      .from('ai_rapports').select('*').eq('id', rapportId).single();
    const { data: previsionsFinal } = await admin
      .from('production_forecasts')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_production', demainDate)
      .order('produit_categorie').order('produit_nom');

    return NextResponse.json({
      rapport:   rapportFinal,
      previsions: previsionsFinal ?? [],
      cached:    false,
    });

  } catch (err) {
    console.error('[POST /api/boulanger/ai/rapport]', err);
    try {
      await getSupabaseAdmin().from('ai_rapports')
        .update({ statut: 'erreur', erreur_msg: String(err).slice(0, 500) })
        .eq('boulangerie_id', boulangerieId).eq('date', today);
    } catch {}
    return NextResponse.json({ error: 'Erreur lors de la génération IA.' }, { status: 500 });
  }
}

// ── Type helper interne ───────────────────────────────────────
interface StockRow { produit_id: string; production: number; }

// ── Prompt système enrichi v2 ─────────────────────────────────

function buildSystemPromptEnrichi(): string {
  return `Tu es Levain, l'assistant IA du boulanger artisanal de BakeryOS.

TON RÔLE :
Chaque soir après la clôture, tu analyses la journée et prépares un rapport dual :
- Une section BOULANGER (technique, production, matières premières, plan demain)
- Une section VENDEUSE (relation client, retour terrain, conseils pratiques au comptoir)

RÈGLES ABSOLUES :
1. Dans les textes → UTILISE les vrais noms des produits. JAMAIS "P1", "P2" etc.
2. Dans "previsions_production" uniquement → utilise les produit_index numériques.
3. Intègre le retour vendeuse si disponible — c'est de l'information terrain précieuse.
4. Intègre les consignes de l'owner (boulanger/gérant) s'il en a laissé.
5. Intègre l'événement du lendemain dans les prévisions.
6. Réponse en JSON pur uniquement. En français. Chaque phrase actionnable.

FORMAT JSON OBLIGATOIRE :
{
  "score": <0-100>,
  "verdict": "<20 mots max>",
  "succes": ["<succès avec vrais noms>"],
  "flops": ["<problème avec vrais noms>"],
  "analyse_contextuelle": "<2-3 phrases>",
  "previsions_production": [
    { "produit_index": <n>, "quantite_suggeree": <int>, "variation_pct": <int>, "raison": "<raison courte>" }
  ],
  "anti_gaspillage": ["<conseil>"],
  "opportunites": ["<opportunité>"],
  "alerte_ingredients": ["<alerte si pertinente>"],
  "matieres_premieres": {
    "resume": "<phrase>",
    "details": [{ "ingredient": "<>", "quantite": "<>", "observation": "<>" }]
  },
  "briefing_matin": {
    "titre": "<titre pour le boulanger>",
    "contexte_jour": "<type de journée demain>",
    "meteo_resume": "<météo demain avec emoji>",
    "impact_meteo_vente": "<impact concret>",
    "top3_a_produire": ["<produit 1 avec qté>", "<produit 2>", "<produit 3>"],
    "point_vigilance": "<1 chose critique>",
    "fiabilite_previsions": "<indication fiabilité>",
    "conseil_ouverture": "<conseil pratique>"
  },
  "briefing_vendeuse": {
    "titre": "<titre pour la vendeuse/vendeur>",
    "accueil_client": "<conseil relation client pour demain>",
    "produits_a_mettre_en_avant": ["<produit à valoriser au comptoir>"],
    "gestion_fin_journee": "<conseil pour gérer les invendus de demain soir>",
    "retour_integre": "<si retour vendeuse disponible : comment il a été pris en compte>",
    "message_encouragement": "<message court et chaleureux pour la vendeuse>"
  },
  "consignes_transmises": {
    "au_boulanger": "<consignes de l'owner pour le boulanger, vide si aucune>",
    "a_la_vendeuse": "<consignes de l'owner pour la vendeuse, vide si aucune>"
  },
  "message_levain": "<message personnel court au boulanger>"
}`;
}

// ── Prompt utilisateur enrichi v2 ─────────────────────────────

function buildUserPromptEnrichi(
  payload: ReturnType<typeof import('@/lib/ai-anonymize').anonymiserDonnees> extends infer P
    ? P extends { _mapping: unknown } ? Omit<P, '_mapping'> : P : never,
  feedbackVendeuse: Record<string, unknown> | null,
  wizardData: {
    consignes_boulanger?: string;
    consignes_vendeuse?:  string;
    evenement_demain?:    string;
    evenement_impact?:    string;
    evenement_pct?:       number;
  },
): string {
  // Section retour vendeuse
  let sectionFeedback = '';
  if (feedbackVendeuse) {
    const humeurs: Record<number, string> = { 1: '😞 Journée difficile', 2: '😐 Journée correcte', 3: '😊 Bonne journée', 4: '🌟 Excellente journée' };
    const rating = feedbackVendeuse.rating_journee as number;
    sectionFeedback = `
=== RETOUR DE LA VENDEUSE ===
Humeur globale : ${humeurs[rating] ?? '—'}
Points forts : ${(feedbackVendeuse.points_forts as string[] ?? []).join(', ') || 'Aucun'}
Points à améliorer : ${(feedbackVendeuse.points_ameliorer as string[] ?? []).join(', ') || 'Aucun'}
${feedbackVendeuse.commentaire_libre ? `Commentaire libre : "${feedbackVendeuse.commentaire_libre}"` : ''}
⚠️ Ce retour terrain est précieux — intègre-le dans l'analyse et le briefing vendeuse.`;
  }

  // Section événement
  let sectionEvenement = '';
  if (wizardData.evenement_demain) {
    const impactLabel = wizardData.evenement_impact === 'hausse'
      ? `+${wizardData.evenement_pct ?? '?'}% de fréquentation estimée`
      : wizardData.evenement_impact === 'baisse'
        ? `-${wizardData.evenement_pct ?? '?'}% de fréquentation estimée`
        : 'Impact neutre';
    sectionEvenement = `
=== ÉVÉNEMENT DEMAIN ===
Description : ${wizardData.evenement_demain}
Impact estimé : ${impactLabel}
⚠️ Tiens compte de cet événement dans les prévisions de production et le briefing matin.`;
  }

  // Section consignes owner
  let sectionConsignes = '';
  if (wizardData.consignes_boulanger || wizardData.consignes_vendeuse) {
    sectionConsignes = `
=== CONSIGNES DU PROPRIÉTAIRE ===`;
    if (wizardData.consignes_boulanger) {
      sectionConsignes += `\nPour le boulanger : "${wizardData.consignes_boulanger}"`;
    }
    if (wizardData.consignes_vendeuse) {
      sectionConsignes += `\nPour la vendeuse : "${wizardData.consignes_vendeuse}"`;
    }
    sectionConsignes += `\n⚠️ Inclus ces consignes mot pour mot dans le champ "consignes_transmises".`;
  }

  // Utilise le prompt de base et l'enrichit
  const basePrompt = buildUserPrompt(payload as Parameters<typeof buildUserPrompt>[0]);

  return `${basePrompt}

${sectionFeedback}
${sectionEvenement}
${sectionConsignes}

→ Génère le JSON complet avec les sections briefing_matin, briefing_vendeuse ET consignes_transmises.
→ Dans briefing_vendeuse, utilise le retour vendeuse s'il est disponible pour personnaliser le message.
→ Dans consignes_transmises, reprends les consignes de l'owner telles quelles (ou vide si aucune).`;
}