// app/api/boulanger/ai/rapport/route.ts
// ─────────────────────────────────────────────────────────────
// POST → Génère le rapport IA de clôture + prévisions de production
//
// Flux :
//   1. Auth JWT boulanger
//   2. Récupère boulangerie (timezone, coords) + données journée + historique
//   3. Fetch météo Open-Meteo (async, non bloquant si erreur)
//   4. Stocke la météo en DB
//   5. Anonymise les données (RGPD) — aucune PII envoyée à l'IA
//   6. Appelle z.ai GLM
//   7. Parse la réponse JSON + dé-anonymise les textes (P1→vrai nom)
//   8. Sauvegarde rapport + prévisions en base
//   9. Notification push (non bloquant)
//
// GET → Récupère le rapport du jour (ou d'une date donnée)
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
const ZHIPU_MAX_TOK = 2500;
const ZHIPU_TIMEOUT = 90_000; // 90s

// ── Utilitaires ───────────────────────────────────────────────

function extractJSON(raw: string): string {
  let c = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  c = c.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (c.startsWith('{')) return c;
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s !== -1 && e > s) return c.slice(s, e + 1);
  return c;
}

// ── Auth helper ───────────────────────────────────────────────

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

  // Utilise le timezone de la boulangerie si pas de date fournie
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

    // Prévisions pour demain (J+1)
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

    return NextResponse.json({ rapport: rapport ?? null, previsions: previsions ?? [] });
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

  // ── Date dans le timezone de la boulangerie ───────────────
  const today = getTodayInTimezone(boulangerie.timezone);
  console.info(`[AI rapport] Boulangerie ${boulangerieId} | Timezone: ${boulangerie.timezone} | Aujourd'hui: ${today}`);

  try {
    // ── 1. Vérifier qu'un rapport n'existe pas déjà ────────
    const { data: existingRapport } = await admin
      .from('ai_rapports')
      .select('id, statut')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (existingRapport?.statut === 'genere') {
      const { data: rapport } = await admin
        .from('ai_rapports').select('*').eq('id', existingRapport.id).single();
      const demainDate = (() => { const d=new Date(today+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().split('T')[0]; })();
      const { data: previsions } = await admin.from('production_forecasts').select('*').eq('boulangerie_id', boulangerieId).eq('date_production', demainDate);
      return NextResponse.json({ rapport, previsions: previsions ?? [], cached: true });
    }

    // ── 2. Crée / met à jour le rapport en statut "en_cours" ─
    let rapportId: string;
    if (existingRapport) {
      rapportId = existingRapport.id;
      await admin.from('ai_rapports').update({ statut: 'en_cours', erreur_msg: null }).eq('id', rapportId);
    } else {
      const { data: nr } = await admin
        .from('ai_rapports')
        .insert({ boulangerie_id: boulangerieId, date: today, statut: 'en_cours' })
        .select('id').single();
      rapportId = nr!.id;
    }

    // ── 3. Récupère les données de la journée ──────────────
    const { data: journee } = await admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (!journee?.stocks_journaliers?.length) {
      await admin.from('ai_rapports').update({ statut: 'erreur', erreur_msg: 'Aucune donnée de production.' }).eq('id', rapportId);
      return NextResponse.json({ error: 'Aucune production saisie pour aujourd\'hui.' }, { status: 400 });
    }

    // Historique 14j (clôturés)
    const { data: historique } = await admin
      .from('journees')
      .select('date, ca_estime, taux_invendu, total_produit, total_invendu, commandes_online')
      .eq('boulangerie_id', boulangerieId)
      .eq('cloturee', true)
      .neq('date', today)
      .order('date', { ascending: false })
      .limit(14);

    // Catalogue produits actifs
    const { data: produits } = await admin
      .from('produits')
      .select('id, nom, emoji, categorie, prix_vente')
      .eq('boulangerie_id', boulangerieId)
      .eq('actif_catalogue', true)
      .is('deleted_at', null)
      .order('categorie').order('ordre');

    await admin.from('ai_rapports').update({ journee_id: journee.id }).eq('id', rapportId);

    // ── 4. Fetch météo (non bloquant) ─────────────────────
    let meteoComplet = null;
    let meteoId: string | null = null;

    if (boulangerie.latitude && boulangerie.longitude) {
      try {
        meteoComplet = await fetchMeteo(boulangerie.latitude, boulangerie.longitude, boulangerie.timezone);
        if (meteoComplet) {
          const impact = analyserImpactMeteo(meteoComplet);
          const { data: meteoRow, error: meteoErr } = await admin
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
          if (!meteoErr && meteoRow) {
            meteoId = meteoRow.id as string;
            console.info(`[AI rapport] Météo récupérée: ${meteoComplet.actuelle.icone} ${meteoComplet.actuelle.description} | Demain: ${meteoComplet.demain.icone} ${meteoComplet.demain.description}`);
          }
        }
      } catch (meteoErr) {
        console.warn('[AI rapport] Erreur météo (non bloquante):', meteoErr);
      }
    } else {
      console.warn('[AI rapport] Coordonnées GPS non configurées — météo désactivée');
    }

    // ── 5. Anonymiser les données (RGPD) ──────────────────
    const payload = anonymiserDonnees(
      journee as JourneeRaw,
      (historique ?? []) as JourneeRaw[],
      (produits ?? []) as ProduitRaw[],
      boulangerie.timezone,
      meteoComplet,
    );

    // _mapping ne quitte JAMAIS ce serveur
    const { _mapping, ...payloadSansMapping } = payload;

    // Log de debug du contexte envoyé à l'IA
    console.info(`[AI rapport] Demain: ${payload.demain_info.jour_semaine} (weekend: ${payload.demain_info.est_weekend}) | Historique même jour: ${payload.histo_meme_jour.length} entrées`);

    // ── 6. Appel z.ai ─────────────────────────────────────
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), ZHIPU_TIMEOUT);
    let aiResponse: string;
    let tokensUtilises: number | null = null;

    try {
      const response = await fetch(ZHIPU_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${zhipuApiKey}` },
        body: JSON.stringify({
          model:           ZHIPU_MODEL,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user',   content: buildUserPrompt(payloadSansMapping) },
          ],
          thinking:        { type: 'disabled' }, // GLM-4.5 : évite le <think>...</think>
          temperature:     0.25,                 // Plus déterministe pour les données chiffrées
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
      console.info(`[AI rapport] Modèle: ${ZHIPU_MODEL} | Tokens: ${tokensUtilises}`);
    } finally {
      clearTimeout(timeoutId);
    }

    // ── 7. Parse + dé-anonymise ────────────────────────────
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
      console.error('[AI rapport] Parse échec:', preview);
      return NextResponse.json({ error: 'Réponse IA invalide.', debug_preview: preview }, { status: 502 });
    }

    // ── CLEF : remplace P1/P2/P3 par vrais noms dans les textes ─
    const rapportDeanonymise = deanonymiserRapport(rapportJSON, _mapping);

    const score   = typeof rapportDeanonymise.score   === 'number' ? Math.max(0, Math.min(100, Math.round(rapportDeanonymise.score))) : null;
    const verdict = typeof rapportDeanonymise.verdict === 'string' ? rapportDeanonymise.verdict.slice(0, 200) : null;

    // ── 8. Sauvegarde le rapport ───────────────────────────
    await admin.from('ai_rapports').update({
      statut:            'genere',
      score_performance: score,
      verdict_flash:     verdict,
      rapport_json:      rapportDeanonymise,
      modele_ia:         ZHIPU_MODEL,
      tokens_utilises:   tokensUtilises,
      erreur_msg:        null,
      ...(meteoId ? { meteo_id: meteoId } : {}),
    }).eq('id', rapportId);

    // ── 9. Prévisions de production ────────────────────────
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
        const base = (journee.stocks_journaliers as StockRow[])?.find(s => s.produit_id === mapped.id)?.production ?? 0;
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
          variation_pct:     typeof p.variation_pct === 'number' ? p.variation_pct : (base > 0 ? Math.round(((qte-base)/base)*100) : 0),
          raison:            typeof p.raison === 'string' ? (p.raison as string).slice(0, 300) : null,
          appliquee:         false,
        };
      })
      .filter(Boolean);

    // Produits du catalogue non couverts par l'IA → quantité identique
    const couverts = new Set(previsionsRows.map(r => r?.produit_id));
    const manquants = (produits ?? []).filter(p => !couverts.has(p.id)).map(p => {
      const base = (journee.stocks_journaliers as StockRow[])?.find(s => s.produit_id === p.id)?.production ?? 0;
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

    // ── 10. Notification push (non bloquante) ──────────────
    const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? '';
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

    // ── 11. Retourne le résultat ───────────────────────────
    const { data: rapportFinal } = await admin.from('ai_rapports').select('*').eq('id', rapportId).single();
    const { data: previsionsFinal } = await admin
      .from('production_forecasts')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_production', demainDate)
      .order('produit_categorie').order('produit_nom');

    return NextResponse.json({ rapport: rapportFinal, previsions: previsionsFinal ?? [], cached: false });

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