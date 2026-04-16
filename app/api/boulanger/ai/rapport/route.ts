// app/api/boulanger/ai/rapport/route.ts
// ─────────────────────────────────────────────────────────────
// POST → Génère le rapport IA de clôture + prévisions de production
// GET  → Récupère le rapport du jour (ou d'une date passée)
//
// v6 — Corrections prévisions :
//   - Mapping par produit_id UUID (stable) au lieu de produit_index (fragile)
//   - quantite_min / quantite_max stockés pour afficher une fourchette au boulanger
//   - Fallback produit_index conservé pour compatibilité ascendante
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import {
  anonymiserDonnees,
  deanonymiserRapport,
  buildSystemPrompt,
  buildUserPrompt,
  getTodayInTimezone,
  type JourneeRaw,
  type ProduitRaw,
  type CommandeRaw,
  type PanierFlashRaw,
  type ClientProfilRaw,
  type RecipeMap,
  type RecetteProduit,
  findBestTemplateMatch,
} from '@/lib/ai-anonymize';
import { fetchMeteo } from '@/lib/weather';
import { computeProductionSuggestions } from '@/lib/ai-production-compute';
import type { ProduitMinimal, StockRow as StockRowCompute, JourneeHistoRow } from '@/lib/ai-production-compute';

// ── Config z.ai ───────────────────────────────────────────────

const ZHIPU_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZHIPU_MODEL_DAILY  = process.env.ZHIPU_MODEL_DAILY  ?? 'glm-4.5-air';
const ZHIPU_MODEL_WEEKLY = process.env.ZHIPU_MODEL_WEEKLY ?? 'glm-4.5-air';
// Pour l'instant tous les rapports utilisent DAILY ; WEEKLY sera utilisé pour les rapports hebdo/mensuel futurs
const ZHIPU_MODEL = ZHIPU_MODEL_DAILY;
const ZHIPU_MAX_TOK = 4000;
const ZHIPU_TIMEOUT = 90_000;

/** Calcule le coût USD selon le modèle et les tokens utilisés */
function calculerCoutUsd(model: string, tokensInput: number, tokensOutput: number): number {
  // Tarifs z.ai en USD per 1M tokens (avril 2026)
  const tarifs: Record<string, { input: number; output: number }> = {
    'glm-4.7-flashx': { input: 0.07,  output: 0.4  },
    'glm-4.5-air':    { input: 0.2,   output: 1.1  },
    'glm-4.5-flash':  { input: 0,     output: 0    },
    'glm-4.7-flash':  { input: 0,     output: 0    },
    'glm-4-32b-0414-128k': { input: 0.1, output: 0.1 },
    'glm-4.7':        { input: 0.6,   output: 2.2  },
  };
  const t = tarifs[model.toLowerCase()] ?? { input: 0.2, output: 1.1 };
  return (tokensInput * t.input + tokensOutput * t.output) / 1_000_000;
}

function extractJSON(raw: string): string {
  if (!raw || !raw.trim()) throw new Error('Réponse IA vide');
  let c = raw.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
  c = c.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const s = c.indexOf('{');
  const e = c.lastIndexOf('}');
  if (s !== -1 && e > s) return c.slice(s, e + 1);
  throw new Error(`Aucun objet JSON trouvé dans la réponse IA (longueur: ${raw.length})`);
}

// ── Types internes ────────────────────────────────────────────

interface StockRow { produit_id: string; production: number; }

interface QuotaInfo {
  can_generate:    boolean;
  plan:            string;
  quota_limit:     number;
  quota_used:      number;
  quota_remaining: number;
  week_start:      string;
}

// ── Helpers quota ─────────────────────────────────────────────

async function getLevainQuota(
  admin: ReturnType<typeof getSupabaseAdmin>,
  boulangerieId: string
): Promise<QuotaInfo> {
  const { data, error } = await admin.rpc('get_levain_quota', {
    p_boulangerie_id: boulangerieId,
  });
  if (error || !data) {
    return { can_generate: true, plan: 'starter', quota_limit: 1, quota_used: 0, quota_remaining: 1, week_start: '' };
  }
  return data as QuotaInfo;
}

async function checkAndIncrementLevainQuota(
  admin: ReturnType<typeof getSupabaseAdmin>,
  boulangerieId: string
): Promise<QuotaInfo> {
  const { data, error } = await admin.rpc('check_and_increment_levain_quota', {
    p_boulangerie_id: boulangerieId,
  });
  if (error || !data) {
    return { can_generate: true, plan: 'starter', quota_limit: 1, quota_used: 0, quota_remaining: 1, week_start: '' };
  }
  return data as QuotaInfo;
}

function filterRapportForStarter(rapportJson: Record<string, unknown>): Record<string, unknown> {
  return {
    score:            rapportJson.score,
    verdict:          rapportJson.verdict,
    message_levain:   rapportJson.message_levain,
    _starter_preview: true,
    _upgrade_message: 'Passez au plan Pro pour débloquer l\'analyse complète, les briefings et les prévisions de production.',
  };
}

// ── GET — récupère le rapport du jour ─────────────────────────

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'dashboard', 'read')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { boulangerieId } = session;
  const admin = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('timezone, plan')
    .eq('id', boulangerieId)
    .single();

  const timezone = (boulangerie?.timezone as string | null) ?? 'Europe/Paris';
  const date = searchParams.get('date') ?? getTodayInTimezone(timezone);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Format date invalide (YYYY-MM-DD)' }, { status: 400 });
  }

  const isStarterPlan = (boulangerie?.plan ?? 'starter') === 'starter';

  try {
    const { data: rapport } = await admin
      .from('ai_rapports')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
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
      .eq('boulangerie_id', boulangerieId)
      .eq('date_production', demainDate)
      .order('produit_categorie')
      .order('produit_nom');

    let feedbackVendeuse = null;
    if (rapport?.journee_id) {
      const { data: fb } = await admin
        .from('feedback_journee')
        .select('*')
        .eq('journee_id', rapport.journee_id)
        .single();
      feedbackVendeuse = fb;
    }

    const quotaInfo = await getLevainQuota(admin, boulangerieId);

    let rapportFiltre = rapport ?? null;
    if (isStarterPlan && rapport?.rapport_json) {
      rapportFiltre = {
        ...rapport,
        rapport_json: filterRapportForStarter(rapport.rapport_json as Record<string, unknown>),
      };
    }

    return NextResponse.json({
      rapport:           rapportFiltre,
      previsions:        isStarterPlan ? [] : (previsions ?? []),
      feedback_vendeuse: feedbackVendeuse,
      quota_info:        quotaInfo,
      starter_preview:   isStarterPlan,
    });
  } catch (err) {
    console.error('[GET /api/boulanger/ai/rapport]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — génère le rapport IA ───────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  if (!canAccess(session, 'dashboard', 'write')) {
    return NextResponse.json({ error: 'Accès refusé — réservé au propriétaire et aux gérants' }, { status: 403 });
  }

  const { boulangerieId } = session;
  const admin = getSupabaseAdmin();

  const zhipuApiKey = process.env.ZHIPU_API_KEY;
  if (!zhipuApiKey) {
    return NextResponse.json({ error: 'Clé API z.ai non configurée' }, { status: 503 });
  }

  const quotaInfo = await checkAndIncrementLevainQuota(admin, boulangerieId);
  const isStarterPlan = quotaInfo.plan === 'starter';

  if (!quotaInfo.can_generate) {
    return NextResponse.json({
      error:            'Quota hebdomadaire atteint',
      quota_reached:    true,
      upgrade_required: true,
      quota_info:       quotaInfo,
    }, { status: 402 });
  }

  let wizardData: {
    consignes_boulanger?: string;
    consignes_vendeuse?:  string;
    evenement_demain?:    string;
    evenement_impact?:    'hausse' | 'neutre' | 'baisse';
    evenement_pct?:       number;
  } = {};

  let rawBody: unknown;
  try {
    rawBody = await req.json();
    if (rawBody && typeof rawBody === 'object') {
      wizardData = rawBody as typeof wizardData;
    }
  } catch { /* body optionnel */ }

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('timezone, latitude, longitude, ville')
    .eq('id', boulangerieId)
    .single();

  const timezone  = (boulangerie?.timezone  as string | null)  ?? 'Europe/Paris';
  const latitude  = boulangerie?.latitude  as number | null;
  const longitude = boulangerie?.longitude as number | null;
  const today     = getTodayInTimezone(timezone);

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

      // Quota décrémenté car rapport déjà généré
      await admin
        .from('boulangeries')
        .update({ levain_quota_used: Math.max(0, (quotaInfo.quota_used) - 1) })
        .eq('id', boulangerieId);

      let rapportResponse = rapport;
      if (isStarterPlan && rapport?.rapport_json) {
        rapportResponse = {
          ...rapport,
          rapport_json: filterRapportForStarter(rapport.rapport_json as Record<string, unknown>),
        };
      }

      return NextResponse.json({
        rapport:         rapportResponse,
        previsions:      isStarterPlan ? [] : (previsions ?? []),
        cached:          true,
        quota_info:      quotaInfo,
        starter_preview: isStarterPlan,
      });
    }

    // ── 1b. Vérifier que la journée est clôturée ───────────────
    const { data: journeeCheck } = await admin
      .from('journees')
      .select('cloturee')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (!journeeCheck?.cloturee) {
      // Rembourser le quota consommé en amont
      await admin.from('boulangeries')
        .update({ levain_quota_used: Math.max(0, quotaInfo.quota_used - 1) })
        .eq('id', boulangerieId);
      return NextResponse.json(
        { error: 'La journée doit être clôturée avant de générer le rapport.' },
        { status: 400 }
      );
    }

    // ── 1c. Nettoyage rapport bloqué en "en_cours" ───────────
    if (existingRapport?.statut === 'en_cours') {
      const { data: rapportRow } = await admin
        .from('ai_rapports')
        .select('updated_at')
        .eq('id', existingRapport.id)
        .single();
      const updatedAt = new Date(rapportRow?.updated_at ?? Date.now());
      const ageMs = Date.now() - updatedAt.getTime();
      if (ageMs > 3 * 60 * 1000) {
        // Rapport bloqué depuis plus de 3 minutes → marquer en erreur
        await admin.from('ai_rapports').update({
          statut:     'erreur',
          erreur_msg: 'Génération interrompue (timeout).',
        }).eq('id', existingRapport.id);
      } else {
        // Rapport encore en cours de génération → ne pas en lancer un nouveau
        await admin.from('boulangeries')
          .update({ levain_quota_used: Math.max(0, quotaInfo.quota_used - 1) })
          .eq('id', boulangerieId);
        return NextResponse.json(
          { error: 'Rapport en cours de génération. Veuillez patienter.', en_cours: true },
          { status: 409 }
        );
      }
    }

    // ── 2. Crée/met à jour le rapport en statut "en_cours" ────
    let rapportId: string;
    if (existingRapport) {
      rapportId = existingRapport.id;
      await admin.from('ai_rapports').update({
        statut:              'en_cours',
        erreur_msg:          null,
        consignes_boulanger: wizardData.consignes_boulanger ?? null,
        consignes_vendeuse:  wizardData.consignes_vendeuse  ?? null,
        wizard_evenement:    wizardData.evenement_demain    ?? null,
        wizard_impact:       wizardData.evenement_impact    ?? null,
        wizard_impact_pct:   wizardData.evenement_pct       ?? 0,
      }).eq('id', rapportId);
    } else {
      const { data: nr } = await admin
        .from('ai_rapports')
        .insert({
          boulangerie_id:      boulangerieId,
          date:                today,
          statut:              'en_cours',
          consignes_boulanger: wizardData.consignes_boulanger ?? null,
          consignes_vendeuse:  wizardData.consignes_vendeuse  ?? null,
          wizard_evenement:    wizardData.evenement_demain    ?? null,
          wizard_impact:       wizardData.evenement_impact    ?? null,
          wizard_impact_pct:   wizardData.evenement_pct       ?? 0,
        })
        .select('id').single();
      rapportId = nr!.id;
    }

    // ── 3. Données de la journée ───────────────────────────────
    const { data: journee } = await admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (!journee?.stocks_journaliers?.length) {
      await admin.from('ai_rapports').update({
        statut:     'erreur',
        erreur_msg: 'Aucune donnée de production.',
      }).eq('id', rapportId);
      return NextResponse.json({ error: 'Aucune production saisie pour aujourd\'hui.' }, { status: 400 });
    }

    const { data: feedbackVendeuse } = await admin
      .from('feedback_journee')
      .select('*')
      .eq('journee_id', journee.id)
      .single();

    const { data: historique } = await admin
      .from('journees')
      .select('date, ca_estime, taux_invendu, total_produit, total_invendu, commandes_online, stocks_journaliers(*)')
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

    // ── 4. Météo ───────────────────────────────────────────────
    let meteoComplet = null;
    let meteoId: string | null = null;

    if (latitude && longitude) {
      try {
        meteoComplet = await fetchMeteo(latitude, longitude, timezone);
        if (meteoComplet) {
          const { data: meteoRow } = await admin
            .from('meteo_journees')
            .upsert({
              boulangerie_id:     boulangerieId,
              date:               today,
              temperature_c:      meteoComplet.actuelle.temperature_c,
              ressenti_c:         meteoComplet.actuelle.ressenti_c,
              humidite_pct:       meteoComplet.actuelle.humidite_pct,
              precipitations_mm:  meteoComplet.actuelle.precipitations_mm,
              vitesse_vent_kmh:   meteoComplet.actuelle.vitesse_vent_kmh,
              code_meteo:         meteoComplet.actuelle.code_meteo,
              description:        meteoComplet.actuelle.description,
              icone:              meteoComplet.actuelle.icone,
              demain_temp_max_c:  meteoComplet.demain.temp_max_c,
              demain_temp_min_c:  meteoComplet.demain.temp_min_c,
              demain_precip_mm:   meteoComplet.demain.precip_mm,
              demain_code_meteo:  meteoComplet.demain.code_meteo,
              demain_description: meteoComplet.demain.description,
              demain_icone:       meteoComplet.demain.icone,
              source:             'open-meteo',
              fetched_at:         new Date().toISOString(),
            }, { onConflict: 'boulangerie_id,date' })
            .select('id').single();
          if (meteoRow) meteoId = meteoRow.id as string;
        }
      } catch (meteoErr) {
        console.warn('[AI rapport] Erreur météo (non bloquante):', meteoErr);
      }
    }

    // ── 5. Commandes du jour ───────────────────────────────────
    interface CommandeDB {
      id: string; type: string | null; client_prenom: string | null;
      client_email: string; montant_total: number; statut: string;
      heure_retrait: string | null; created_at: string;
      date_retrait: string | null;
      lignes: { produit_id?: string; produit_nom: string; quantite: number; prix_unitaire: number }[] | null;
    }

    const { data: commandesRaw } = await admin
      .from('commandes')
      .select('id, type, client_prenom, client_email, montant_total, statut, heure_retrait, created_at, date_retrait, lignes')
      .eq('boulangerie_id', boulangerieId)
      .gte('created_at', today + 'T00:00:00')
      .lt('created_at', today + 'T23:59:59');

    const commandes: CommandeRaw[] = (commandesRaw as CommandeDB[] ?? []).map(c => ({
      id:            c.id,
      type:          (c.type as 'click_collect' | 'anti_gaspi') ?? 'click_collect',
      client_prenom: c.client_prenom,
      client_email:  c.client_email,
      montant_total: Number(c.montant_total),
      statut:        c.statut,
      heure_retrait: c.heure_retrait,
      created_at:    c.created_at,
      lignes:        c.lignes ?? undefined,
    }));

    // ── 5b. Pré-commandes pour demain (date_retrait = demain) ────
    const demainDatePreco = (() => {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const { data: preCommandesRaw } = await admin
      .from('commandes')
      .select('id, client_prenom, montant_total, statut, heure_retrait, lignes')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_retrait', demainDatePreco)
      .in('statut', ['en_attente', 'confirmee']);

    // Agrégation pré-commandes par produit pour l'IA
    const preCommandesProduits: Record<string, { nom: string; quantite: number }> = {};
    let preCommandesTotal = 0;
    let preCommandesCA = 0;
    if (preCommandesRaw) {
      for (const pc of preCommandesRaw as CommandeDB[]) {
        preCommandesTotal++;
        preCommandesCA += Number(pc.montant_total ?? 0);
        const lignes = (pc.lignes ?? []) as { produit_id?: string; produit_nom: string; quantite: number }[];
        for (const l of lignes) {
          const key = l.produit_id ?? l.produit_nom;
          if (!preCommandesProduits[key]) {
            preCommandesProduits[key] = { nom: l.produit_nom, quantite: 0 };
          }
          preCommandesProduits[key].quantite += l.quantite;
        }
      }
    }

    // ── 5c. Historique du même jour de semaine (jusqu'à 8 semaines) ──
    // Calcul du jour de semaine ISO de demain (1=lundi…7=dimanche)
    const jourSemaineDemain = (() => {
      const d = new Date(demainDatePreco + 'T12:00:00Z');
      const dow = d.getUTCDay(); // 0=dimanche
      return dow === 0 ? 7 : dow;
    })();

    const { data: histoMemeJourRaw } = await admin
      .from('journees')
      .select('date, stocks_journaliers(produit_id, production, stock_final)')
      .eq('boulangerie_id', boulangerieId)
      .eq('jour_semaine', jourSemaineDemain)
      .eq('cloturee', true)
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(8);

    const histoMemeJour = (histoMemeJourRaw ?? []) as {
      date: string;
      stocks_journaliers: { produit_id: string; production: number; stock_final: number }[];
    }[];

    // ── 6. Paniers flash du jour ───────────────────────────────
    interface PanierDB {
      id: string; produit_nom: string; categorie: string;
      quantite_initiale: number; prix_flash: number; remise_pct: number; quantite_restante: number;
    }

    const { data: paniersFlashRaw } = await admin
      .from('paniers_flash')
      .select('id, produit_nom, categorie, quantite_initiale, prix_flash, remise_pct, quantite_restante')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today);

    const paniersFlash: PanierFlashRaw[] = (paniersFlashRaw as PanierDB[] ?? []).map(p => ({
      id:          p.id,
      produit_nom: p.produit_nom,
      categorie:   p.categorie,
      quantite:    p.quantite_initiale,
      prix_final:  p.prix_flash,
      remise_pct:  p.remise_pct ?? 30,
      vendu:       p.quantite_restante === 0,
    }));

    // ── 7. Clients de cette boulangerie ────────────────────────
    const { data: allCommandesClient } = await admin
      .from('commandes')
      .select('client_email, montant_total, created_at')
      .eq('boulangerie_id', boulangerieId)
      .order('created_at', { ascending: true });

    const clientMap: Record<string, { nb: number; total: number; first_seen: string }> = {};
    (allCommandesClient ?? []).forEach((c: { client_email: string; montant_total: number; created_at: string }) => {
      if (!clientMap[c.client_email]) {
        clientMap[c.client_email] = { nb: 0, total: 0, first_seen: c.created_at };
      }
      clientMap[c.client_email].nb++;
      clientMap[c.client_email].total += Number(c.montant_total);
    });

    const clients: ClientProfilRaw[] = Object.entries(clientMap).map(([email, data]) => ({
      id:            email,
      created_at:    data.first_seen,
      nb_commandes:  data.nb,
      total_depense: Math.round(data.total * 100) / 100,
    }));

    // ── 7b. Recettes matières premières ────────────────────────
    // Priorité : (1) recette spécifique boulangerie+produit
    //            (2) template global nommé (fuzzy match JS)
    //            (3) fallback catégorie en DB
    //            (4) COEFFS_MP hardcodé (géré dans resolveRecipe)
    const recipeMap: RecipeMap = new Map<string, RecetteProduit>();
    const produitIds = (produits ?? []).map((p) => (p as ProduitRaw).id);

    if (produitIds.length > 0) {
      // Niveau 1 : recettes propres à cette boulangerie
      const { data: specificRecipes } = await admin
        .from('recettes_produits')
        .select('*')
        .eq('boulangerie_id', boulangerieId)
        .in('produit_id', produitIds);

      const coveredIds = new Set<string>();
      for (const r of specificRecipes ?? []) {
        recipeMap.set(r.produit_id, r as unknown as RecetteProduit);
        coveredIds.add(r.produit_id);
      }

      // Niveaux 2+3 : templates globaux pour les produits non couverts
      const uncovered = (produits ?? []).filter((p) => !coveredIds.has((p as ProduitRaw).id));
      if (uncovered.length > 0) {
        const { data: globalRecipes } = await admin
          .from('recettes_produits')
          .select('*')
          .is('boulangerie_id', null);

        const byName     = new Map<string, RecetteProduit>();
        const byCategory = new Map<string, RecetteProduit>();
        for (const r of globalRecipes ?? []) {
          if (r.nom_recette) byName.set(r.nom_recette.toLowerCase(), r as unknown as RecetteProduit);
          if (!r.nom_recette && r.categorie) byCategory.set(r.categorie, r as unknown as RecetteProduit);
        }

        for (const p of uncovered) {
          const prod = p as ProduitRaw;
          // Exact match
          const exact = byName.get(prod.nom.toLowerCase());
          if (exact) { recipeMap.set(prod.id, exact); continue; }
          // Fuzzy match (dice coefficient ≥ 0.80)
          const fuzzy = findBestTemplateMatch(prod.nom, byName, 0.80);
          if (fuzzy) { recipeMap.set(prod.id, { ...fuzzy, source: 'auto' }); continue; }
          // Fallback catégorie
          const cat = byCategory.get(prod.categorie);
          if (cat) { recipeMap.set(prod.id, cat); }
          // Sinon : COEFFS_MP géré dans resolveRecipe() côté ai-anonymize.ts
        }
      }
    }

    // ── 8. Enrichissement & prompt ─────────────────────────────
    const produitsList = produits ?? [];
    const stocksList   = (journee.stocks_journaliers ?? []) as StockRow[];

    const payload = anonymiserDonnees(
      journee as JourneeRaw,
      (historique ?? []) as JourneeRaw[],
      (produits  ?? []) as ProduitRaw[],
      timezone,
      meteoComplet,
      commandes,
      paniersFlash,
      clients,
      recipeMap,
    );

    // ── Pré-calcul suggestions de production ─────────────────────
    const suggestionsAlgo = computeProductionSuggestions({
      produits:      produitsList as ProduitMinimal[],
      stocksAujourd: stocksList as StockRowCompute[],
      histoMemeJour: histoMemeJour as JourneeHistoRow[],
      meteo:         meteoComplet,
      preCommandes:  preCommandesProduits,
    });

    const systemPrompt = buildSystemPrompt();
    // @ts-ignore – suggestions_algo et histo_meme_jour_raw seront ajoutés à PayloadEnrichi en Task 6
    const userPrompt   = buildUserPromptEnrichi({ ...payload, suggestions_algo: suggestionsAlgo, histo_meme_jour_raw: histoMemeJour }, feedbackVendeuse, wizardData, {
      preCommandesTotal,
      preCommandesCA,
      preCommandesProduits,
    });

    // ── 9. Appel z.ai ─────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), ZHIPU_TIMEOUT);
    let aiResponse: string;
    let tokensUtilises: number | null = null;
    let tokensInput  = 0;
    let tokensOutput = 0;

    try {
      const response = await fetch(ZHIPU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${zhipuApiKey}`,
        },
        body: JSON.stringify({
          model:           ZHIPU_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
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
        usage?:  { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };
      aiResponse     = data.choices?.[0]?.message?.content ?? '';
      tokensInput    = data.usage?.prompt_tokens     ?? 0;
      tokensOutput   = data.usage?.completion_tokens  ?? 0;
      tokensUtilises = data.usage?.total_tokens ?? null;
    } finally {
      clearTimeout(timeoutId);
    }

    const totalTokens = tokensInput + tokensOutput;
    const coutUsd     = calculerCoutUsd(ZHIPU_MODEL, tokensInput, tokensOutput);

    // ── 10. Parse JSON ─────────────────────────────────────────
    // Avertir si la réponse est proche de la limite de tokens (JSON potentiellement tronqué)
    if (tokensUtilises !== null && tokensUtilises >= ZHIPU_MAX_TOK * 0.95) {
      console.warn(`[AI rapport] Réponse proche de la limite tokens (${tokensUtilises}/${ZHIPU_MAX_TOK}) — JSON peut être tronqué`);
    }

    let rapportJSON: Record<string, unknown>;
    try {
      rapportJSON = JSON.parse(extractJSON(aiResponse));
    } catch (parseErr) {
      const errMsg = `Non parsable: ${String(parseErr).slice(0, 200)}`;
      console.error('[AI rapport] Parse JSON échoué:', errMsg, '| Aperçu:', aiResponse.slice(0, 200));
      await admin.from('ai_rapports').update({
        statut:     'erreur',
        erreur_msg: errMsg,
      }).eq('id', rapportId);
      return NextResponse.json(
        { error: 'Réponse IA invalide.', debug_preview: aiResponse.slice(0, 800) },
        { status: 502 }
      );
    }

    const rapportFinal = deanonymiserRapport(rapportJSON);
    // Vérification explicite de NaN (typeof NaN === 'number' est vrai)
    const scoreRaw = typeof rapportFinal.score === 'number' && !isNaN(rapportFinal.score as number)
      ? rapportFinal.score as number : null;
    const score   = scoreRaw !== null
      ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null;
    const verdict = typeof rapportFinal.verdict === 'string'
      ? rapportFinal.verdict.slice(0, 200) : null;

    // ── 11. Sauvegarde le rapport ──────────────────────────────
    await admin.from('ai_rapports').update({
      statut:            'genere',
      score_performance: score,
      verdict_flash:     verdict,
      rapport_json:      rapportFinal,
      modele_ia:         ZHIPU_MODEL,
      tokens_utilises:   tokensUtilises,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ tokens_input: tokensInput, tokens_output: tokensOutput, cout_usd: coutUsd } as any),
      erreur_msg:        null,
      feedback_vendeuse: feedbackVendeuse ? JSON.stringify({
        rating:           feedbackVendeuse.rating_journee,
        points_forts:     feedbackVendeuse.points_forts,
        points_ameliorer: feedbackVendeuse.points_ameliorer,
        commentaire:      feedbackVendeuse.commentaire_libre,
      }) : null,
      ...(meteoId ? { meteo_id: meteoId } : {}),
    }).eq('id', rapportId);

    // ── 12. Prévisions de production ───────────────────────────
    const demainDate = (() => {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const previsions = Array.isArray(rapportFinal.previsions_production)
      ? rapportFinal.previsions_production as Record<string, unknown>[]
      : [];

    // ── MAPPING AMÉLIORÉ : produit_id UUID en priorité, fallback produit_index ──
    const previsionsRows = previsions
      .filter(p => p && typeof p === 'object')
      .map(p => {
        let produit: typeof produitsList[0] | undefined;

        // Priorité 1 : mapping par produit_id UUID (nouveau format)
        if (typeof p.produit_id === 'string' && p.produit_id.length > 10) {
          produit = produitsList.find(pr => pr.id === p.produit_id);
        }

        // Priorité 2 : fallback par produit_index (ancien format, compatibilité)
        if (!produit && typeof p.produit_index === 'number') {
          const idx = Number(p.produit_index);
          if (idx >= 1 && idx <= produitsList.length) {
            produit = produitsList[idx - 1];
          }
        }

        // Priorité 3 : fallback par nom de produit (robustesse maximale)
        if (!produit && typeof p.produit_nom === 'string') {
          const nomRecherche = (p.produit_nom as string).toLowerCase().trim();
          produit = produitsList.find(pr =>
            pr.nom.toLowerCase().trim() === nomRecherche
          );
        }

        if (!produit) return null;

        const qte  = Math.max(0, Math.round(Number(p.quantite_suggeree) || 0));
        const qMin = p.quantite_min !== undefined ? Math.max(0, Math.round(Number(p.quantite_min) || 0)) : null;
        const qMax = p.quantite_max !== undefined ? Math.max(0, Math.round(Number(p.quantite_max) || 0)) : null;
        const base = stocksList.find(s => s.produit_id === produit!.id)?.production ?? 0;

        return {
          boulangerie_id:    boulangerieId,
          rapport_id:        rapportId,
          date_production:   demainDate,
          produit_id:        produit.id,
          produit_nom:       produit.nom,
          produit_categorie: produit.categorie,
          produit_emoji:     produit.emoji,
          quantite_suggeree: qte,
          quantite_min:      qMin,
          quantite_max:      qMax,
          quantite_base:     base,
          variation_pct:     typeof p.variation_pct === 'number'
            ? p.variation_pct
            : (base > 0 ? Math.round(((qte - base) / base) * 100) : 0),
          raison:    typeof p.raison === 'string' ? (p.raison as string).slice(0, 300) : null,
          appliquee: false,
        };
      })
      .filter(Boolean);

    // Produits manquants dans la réponse IA → on reconduit la quantité d'aujourd'hui
    // + ajout des pré-commandes pour les produits non couverts
    const couverts  = new Set(previsionsRows.map(r => r?.produit_id));
    const manquants = produitsList.filter(p => !couverts.has(p.id)).map(p => {
      const base = stocksList.find(s => s.produit_id === p.id)?.production ?? 0;
      const precoQte = preCommandesProduits[p.id]?.quantite ?? 0;
      const suggeree = Math.max(base, base + precoQte);
      return {
        boulangerie_id:    boulangerieId,
        rapport_id:        rapportId,
        date_production:   demainDate,
        produit_id:        p.id,
        produit_nom:       p.nom,
        produit_categorie: p.categorie,
        produit_emoji:     p.emoji,
        quantite_suggeree: suggeree,
        quantite_min:      null,
        quantite_max:      null,
        quantite_base:     base,
        variation_pct:     base > 0 ? Math.round(((suggeree - base) / base) * 100) : 0,
        raison:            precoQte > 0
          ? `Reconduit + ${precoQte} pré-commandé(s) pour demain`
          : 'Reconduit — produit non couvert par la réponse IA',
        appliquee:         false,
      };
    });

    const allPrevisions = [...previsionsRows, ...manquants].filter(Boolean);
    if (allPrevisions.length > 0) {
      const { error: upsertError } = await admin
        .from('production_forecasts')
        .upsert(allPrevisions, { onConflict: 'boulangerie_id,date_production,produit_id' });

      if (upsertError) {
        console.error('[Prévisions] Erreur upsert production_forecasts:', JSON.stringify(upsertError));
        // Fallback : insert individuel pour identifier le produit fautif
        for (const row of allPrevisions) {
          const { error: e } = await admin
            .from('production_forecasts')
            .upsert(row, { onConflict: 'boulangerie_id,date_production,produit_id' });
          if (e) console.error('[Prévisions] Échec ligne produit_id:', row?.produit_id, e.message);
        }
      } else {
        console.log(`[Prévisions] ${allPrevisions.length} prévisions insérées pour ${demainDate}`);
      }
    }

    // ── 13. Notification push ──────────────────────────────────
    const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const internalSecret = process.env.INTERNAL_API_SECRET ?? '';
    if (appUrl && internalSecret) {
      fetch(`${appUrl}/api/notifications/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body:    JSON.stringify({
          boulangerie_id: boulangerieId,
          payload: {
            title: `🎯 Levain — Score ${score ?? '—'}/100`,
            body:  verdict ?? 'Votre rapport complet est prêt.',
            url:   '/boulanger',
            tag:   'rapport-ia',
          },
        }),
      }).catch(e => console.warn('[AI rapport] Push non envoyé:', e));
    }

    // ── 13b. Génération des défis pour demain ───────────────────
    try {
      const { generateChallengesForTomorrow } = await import('@/lib/challenges');

      // Historique 14 derniers jours pour les baselines
      const { data: historyRows } = await admin
        .from('journees')
        .select('date, jour_semaine, ca_estime, taux_invendu, commandes_online')
        .eq('boulangerie_id', boulangerieId)
        .eq('cloturee', true)
        .order('date', { ascending: false })
        .limit(14);

      // Agrégation produit sur 7 derniers jours
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

      // Aggregate products
      const prodAgg: Record<string, {
        produit_id: string; nom: string; emoji: string;
        production: number; stock_final: number; count: number;
      }> = {};
      for (const s of recentStocks ?? []) {
        if (!prodAgg[s.produit_id]) {
          prodAgg[s.produit_id] = {
            produit_id: s.produit_id, nom: s.produit_nom,
            emoji: s.produit_emoji ?? '🥖',
            production: 0, stock_final: 0, count: 0,
          };
        }
        prodAgg[s.produit_id].production += s.production;
        prodAgg[s.produit_id].stock_final += s.stock_final;
        prodAgg[s.produit_id].count += 1;
      }

      const productHistory = Object.values(prodAgg).map(p => ({
        produit_id: p.produit_id,
        nom: p.nom,
        emoji: p.emoji,
        production: p.production,
        stock_final: p.stock_final,
        taux_invendu: p.production > 0 ? (p.stock_final / p.production) * 100 : 0,
      }));

      const demainDow = new Date(demainDate + 'T12:00:00Z').getDay();

      const challenges = generateChallengesForTomorrow({
        history: (historyRows ?? []).map(h => ({
          date: h.date,
          jour_semaine: h.jour_semaine ?? 0,
          ca_estime: h.ca_estime ?? 0,
          taux_invendu: h.taux_invendu ?? 0,
          commandes_online: h.commandes_online ?? 0,
        })),
        products: productHistory,
        tomorrowDate: demainDate,
        tomorrowDow: demainDow,
        rapport: rapportFinal as { score?: number; invendus_critiques?: { nom: string; emoji?: string; taux_invendu?: number }[] },
      });

      if (challenges.length > 0) {
        const defiRows = challenges.map(c => ({
          boulangerie_id: boulangerieId,
          rapport_id:     rapportId,
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
        await admin.from('defis')
          .upsert(defiRows, { onConflict: 'boulangerie_id,date_defi,categorie,produit_id' });
      }
    } catch (challengeErr) {
      console.warn('[AI rapport] Challenge generation non-bloquant:', challengeErr);
    }

    // ── 14. Retourne le résultat ───────────────────────────────
    const { data: rapportSaved } = await admin
      .from('ai_rapports').select('*').eq('id', rapportId).single();
    const { data: previsionsFinal } = await admin
      .from('production_forecasts')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_production', demainDate)
      .order('produit_categorie').order('produit_nom');

    let rapportResponse = rapportSaved;
    if (isStarterPlan && rapportSaved?.rapport_json) {
      rapportResponse = {
        ...rapportSaved,
        rapport_json: filterRapportForStarter(rapportSaved.rapport_json as Record<string, unknown>),
      };
    }

    return NextResponse.json({
      rapport:         rapportResponse,
      previsions:      isStarterPlan ? [] : (previsionsFinal ?? []),
      cached:          false,
      quota_info:      quotaInfo,
      starter_preview: isStarterPlan,
    });

  } catch (err) {
    console.error('[POST /api/boulanger/ai/rapport]', err);
    try {
      await getSupabaseAdmin().from('ai_rapports')
        .update({ statut: 'erreur', erreur_msg: String(err).slice(0, 500) })
        .eq('boulangerie_id', boulangerieId).eq('date', today);
    } catch { /* non-bloquant */ }
    return NextResponse.json({ error: 'Erreur lors de la génération IA.' }, { status: 500 });
  }
}

// ── Prompt utilisateur enrichi ────────────────────────────────

function buildUserPromptEnrichi(
  payload: Parameters<typeof buildUserPrompt>[0],
  feedbackVendeuse: Record<string, unknown> | null,
  wizardData: {
    consignes_boulanger?: string;
    consignes_vendeuse?:  string;
    evenement_demain?:    string;
    evenement_impact?:    string;
    evenement_pct?:       number;
  },
  preCommandes?: {
    preCommandesTotal: number;
    preCommandesCA: number;
    preCommandesProduits: Record<string, { nom: string; quantite: number }>;
  },
): string {
  let sectionFeedback = '';
  if (feedbackVendeuse) {
    const humeurs: Record<number, string> = {
      1: '😞 Journée difficile', 2: '😐 Journée correcte',
      3: '😊 Bonne journée',    4: '🌟 Excellente journée',
    };
    const rating = feedbackVendeuse.rating_journee as number;
    sectionFeedback = `
=== RETOUR DE LA VENDEUSE ===
Humeur globale : ${humeurs[rating] ?? '—'}
Points forts : ${(feedbackVendeuse.points_forts as string[] ?? []).join(', ') || 'Aucun'}
Points à améliorer : ${(feedbackVendeuse.points_ameliorer as string[] ?? []).join(', ') || 'Aucun'}
${feedbackVendeuse.commentaire_libre ? `Commentaire libre : "${feedbackVendeuse.commentaire_libre}"` : ''}
⚠️ Ce retour terrain est précieux — intègre-le dans l'analyse et le briefing vendeuse.`;
  }

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
⚠️ Tiens compte de cet événement dans les prévisions de production et le briefing.`;
  }

  let sectionConsignes = '';
  if (wizardData.consignes_boulanger || wizardData.consignes_vendeuse) {
    sectionConsignes = '\n=== CONSIGNES DU PROPRIÉTAIRE ===';
    if (wizardData.consignes_boulanger) {
      sectionConsignes += `\nPour le boulanger : "${wizardData.consignes_boulanger}"`;
    }
    if (wizardData.consignes_vendeuse) {
      sectionConsignes += `\nPour la vendeuse : "${wizardData.consignes_vendeuse}"`;
    }
    sectionConsignes += '\n⚠️ Inclus ces consignes mot pour mot dans le champ "consignes_transmises".';
  }

  let sectionPreCommandes = '';
  if (preCommandes && preCommandes.preCommandesTotal > 0) {
    const lignes = Object.values(preCommandes.preCommandesProduits)
      .map(p => `  - ${p.nom} : ${p.quantite} unité(s) pré-commandée(s)`)
      .join('\n');
    sectionPreCommandes = `
=== PRÉ-COMMANDES POUR DEMAIN ===
Nombre de pré-commandes : ${preCommandes.preCommandesTotal}
CA pré-commandes : ${preCommandes.preCommandesCA.toFixed(2)} €
Détail par produit :
${lignes}
⚠️ IMPORTANT : Ces pré-commandes DOIVENT être intégrées dans les prévisions de production de demain.
Pour chaque produit pré-commandé, AUGMENTE la quantite_suggeree d'au moins la quantité pré-commandée.
Mentionne les pré-commandes dans le briefing_matin.top3_a_produire et dans la synthèse.`;
  }

  return `${buildUserPrompt(payload)}
${sectionFeedback}
${sectionEvenement}
${sectionConsignes}
${sectionPreCommandes}

→ Génère le JSON COMPLET avec TOUTES les sections demandées.
→ UTILISE TOUJOURS LES VRAIS NOMS des produits dans les textes.
→ Dans previsions_production, utilise le produit_id UUID fourni dans le catalogue.
→ Les quantite_suggeree doivent être des entiers ABSOLUS (nombre de pièces), PAS des pourcentages.
→ Sois précis et actionnable pour chaque membre de l'équipe.`;
}