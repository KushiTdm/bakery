// app/api/boulanger/ai/rapport-mensuel/route.ts
// ─────────────────────────────────────────────────────────────
// POST → Génère un rapport MENSUEL pour ?mois=YYYY-MM (défaut = mois précédent)
// GET  → Récupère le rapport mensuel existant pour ?mois=YYYY-MM
//
// Le rapport mensuel enrichit la table `ai_rapports` (type='mensuel',
// mois_reference=1er du mois concerné). Il réutilise les mêmes RLS + quota
// mécanismes que le rapport quotidien, en version mensuelle.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { aggregateMonth } from '@/lib/rapport-mensuel-aggregate';
import { fetchNeighborhood } from '@/lib/google-places';
import {
  RAPPORT_MENSUEL_SYSTEM_PROMPT,
  buildRapportMensuelUserPrompt,
  type RapportMensuelContext,
} from '@/lib/rapport-mensuel-prompt';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ZHIPU_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZHIPU_MODEL   = process.env.ZHIPU_MODEL_WEEKLY ?? 'glm-4.5-air';
const ZHIPU_MAX_TOK = 5000;
const ZHIPU_TIMEOUT = 110_000;

// ── Helpers ───────────────────────────────────────────────────

function extractJSON(raw: string): string {
  if (!raw || !raw.trim()) throw new Error('Réponse IA vide');
  let c = raw.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
  c = c.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const s = c.indexOf('{');
  const e = c.lastIndexOf('}');
  if (s !== -1 && e > s) return c.slice(s, e + 1);
  throw new Error('Aucun JSON trouvé');
}

function previousMonthRef(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11, déjà m-1 car getUTCMonth retourne le mois courant 0-indexé
  if (m === 0) return `${y - 1}-12-01`;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function normalizeMoisParam(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw))    return `${raw}-01`;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 8) + '01';
  return previousMonthRef();
}

// ── GET ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'dashboard', 'read')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;
  const mois = normalizeMoisParam(new URL(req.url).searchParams.get('mois'));

  const { data: rapport } = await admin
    .from('ai_rapports')
    .select('*')
    .eq('boulangerie_id', boulangerieId)
    .eq('type', 'mensuel')
    .eq('mois_reference', mois)
    .maybeSingle();

  const { data: historique } = await admin
    .from('ai_rapports')
    .select('id, mois_reference, score_performance, verdict_flash, created_at, statut')
    .eq('boulangerie_id', boulangerieId)
    .eq('type', 'mensuel')
    .order('mois_reference', { ascending: false })
    .limit(12);

  return NextResponse.json({
    rapport:    rapport ?? null,
    historique: historique ?? [],
    mois_demande: mois,
  });
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'dashboard', 'write')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;

  const zhipuApiKey = process.env.ZHIPU_API_KEY;
  if (!zhipuApiKey) {
    return NextResponse.json({ error: 'Clé API z.ai non configurée' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const mois = normalizeMoisParam(
    (typeof body?.mois === 'string' ? body.mois : null) ??
    new URL(req.url).searchParams.get('mois')
  );

  return generateRapportMensuel(admin, boulangerieId, mois, zhipuApiKey);
}

// ── Logique partagée (utilisée par cron aussi via exportation dédiée) ──

export async function generateRapportMensuel(
  admin: ReturnType<typeof getSupabaseAdmin>,
  boulangerieId: string,
  mois: string,          // "YYYY-MM-01"
  zhipuApiKey: string,
): Promise<NextResponse> {
  // 1. Idempotence : si un rapport existe déjà pour ce mois, le renvoyer
  const { data: existant } = await admin
    .from('ai_rapports')
    .select('*')
    .eq('boulangerie_id', boulangerieId)
    .eq('type', 'mensuel')
    .eq('mois_reference', mois)
    .maybeSingle();

  if (existant && existant.statut === 'genere') {
    return NextResponse.json({ rapport: existant, cached: true });
  }

  // 2. Créer/upserter ligne "en_cours"
  const { data: rapportEnCours, error: insertErr } = await admin
    .from('ai_rapports')
    .upsert(
      {
        boulangerie_id: boulangerieId,
        date:           mois,         // stocke date=1er du mois pour compat
        type:           'mensuel',
        mois_reference: mois,
        statut:         'en_cours',
        rapport_json:   {},
        modele_ia:      ZHIPU_MODEL,
      },
      { onConflict: 'boulangerie_id,mois_reference' },
    )
    .select()
    .single();

  if (insertErr || !rapportEnCours) {
    console.error('[rapport-mensuel] upsert error', insertErr);
    return NextResponse.json({ error: 'Erreur création rapport' }, { status: 500 });
  }

  try {
    // 3. Profil boulangerie
    const { data: boul } = await admin
      .from('boulangeries')
      .select('nom, ville, type_clientele, specialites')
      .eq('id', boulangerieId)
      .single();

    // 4. Agrégations + quartier en parallèle
    // fetchNeighborhood a ses propres gardes (cache, cooldown 24h, cap 3 tentatives)
    // et ne doit jamais throw — ceinture + bretelles : on l'enveloppe quand même
    // pour que l'échec du quartier ne casse jamais la génération du rapport.
    const [aggregates, neighborhood] = await Promise.all([
      aggregateMonth(admin, boulangerieId, mois),
      fetchNeighborhood(admin, boulangerieId).catch(err => {
        console.error('[rapport-mensuel] neighborhood fetch threw unexpectedly', err);
        return null;
      }),
    ]);

    const ctx: RapportMensuelContext = {
      nomBoulangerie: (boul?.nom as string | null) ?? 'Votre boulangerie',
      ville:          (boul?.ville as string | null) ?? null,
      typeClientele:  (boul?.type_clientele as string | null) ?? null,
      specialites:    (boul?.specialites as string[] | null) ?? [],
      aggregates,
      neighborhood,
    };

    // 5. Appel z.ai
    const userPrompt = buildRapportMensuelUserPrompt(ctx);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ZHIPU_TIMEOUT);

    let aiContent = '';
    let tokensInput = 0;
    let tokensOutput = 0;

    try {
      const response = await fetch(ZHIPU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${zhipuApiKey}`,
        },
        body: JSON.stringify({
          model: ZHIPU_MODEL,
          messages: [
            { role: 'system', content: RAPPORT_MENSUEL_SYSTEM_PROMPT },
            { role: 'user',   content: userPrompt },
          ],
          thinking:        { type: 'disabled' },
          temperature:     0.3,
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
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      aiContent    = data.choices?.[0]?.message?.content ?? '';
      tokensInput  = data.usage?.prompt_tokens     ?? 0;
      tokensOutput = data.usage?.completion_tokens ?? 0;
    } finally {
      clearTimeout(timeoutId);
    }

    // 6. Parse
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(extractJSON(aiContent));
    } catch (e) {
      const errMsg = `Parse JSON: ${String(e).slice(0, 200)}`;
      await admin.from('ai_rapports').update({ statut: 'erreur', erreur_msg: errMsg })
        .eq('id', rapportEnCours.id);
      return NextResponse.json({ error: 'Réponse IA invalide' }, { status: 502 });
    }

    const scoreRaw = typeof parsed.score_global === 'number' ? parsed.score_global : null;
    const score = scoreRaw !== null ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null;
    const verdict = typeof parsed.verdict_mensuel === 'string' ? parsed.verdict_mensuel.slice(0, 200) : null;

    // Enrichir le JSON avec les agrégations brutes (utile pour PDF + UI)
    const rapportJson = {
      ...parsed,
      mois:        aggregates.mois,
      mois_label:  aggregates.mois_label,
      kpis_mois:   {
        ca_total:           aggregates.ca_total,
        ca_moyen_jour:      aggregates.ca_moyen_jour,
        taux_invendu_moyen: aggregates.taux_invendu_moyen,
        jours_cloturee:     aggregates.jours_cloturee,
        jours_total:        aggregates.jours_total,
        best_jour:          aggregates.best_jour,
        worst_jour:         aggregates.worst_jour,
        commandes_online_total: aggregates.commandes_online_total,
        paniers_flash_vendus:   aggregates.paniers_flash_vendus,
        paniers_flash_ca:       aggregates.paniers_flash_ca,
        feedback_ratings:       aggregates.feedback_ratings,
        meteo_pluie_jours:      aggregates.meteo_pluie_jours,
      },
      top_produits:              aggregates.top_produits,
      produits_sous_performants: aggregates.produits_sous_performants,
      jour_semaine_analyse:      aggregates.jour_semaine_analyse,
      evolution_ca:              aggregates.evolution_ca,
      evolution_invendus:        aggregates.evolution_invendus,
      comparaison_m_precedent: {
        ...(parsed.comparaison_m_precedent as object ?? {}),
        ca_delta_pct:        aggregates.comparaison_m_precedent.ca_delta_pct,
        invendus_delta_pct:  aggregates.comparaison_m_precedent.invendus_delta_pct,
        commandes_delta_pct: aggregates.comparaison_m_precedent.commandes_delta_pct,
      },
      contexte_quartier: neighborhood ? {
        ...(parsed.contexte_quartier as object ?? {}),
        type_quartier:                 neighborhood.type_quartier,
        density_score:                 neighborhood.density_score,
        population_estimee_rayon_500m: neighborhood.population_estimee_rayon_500m,
        concurrents_directs:           neighborhood.concurrents,
        commerces_proximite:           neighborhood.commerces_proximite,
      } : (parsed.contexte_quartier ?? null),
    };

    // 7. Update
    const { data: final, error: updErr } = await admin
      .from('ai_rapports')
      .update({
        statut:            'genere',
        score_performance: score,
        verdict_flash:     verdict,
        rapport_json:      rapportJson,
        tokens_input:      tokensInput,
        tokens_output:     tokensOutput,
        tokens_utilises:   tokensInput + tokensOutput,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', rapportEnCours.id)
      .select()
      .single();

    if (updErr) {
      console.error('[rapport-mensuel] update error', updErr);
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });
    }

    return NextResponse.json({ rapport: final, cached: false });
  } catch (err) {
    console.error('[rapport-mensuel] unexpected', err);
    await admin.from('ai_rapports').update({
      statut:     'erreur',
      erreur_msg: err instanceof Error ? err.message.slice(0, 500) : 'Erreur inconnue',
    }).eq('id', rapportEnCours.id);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
