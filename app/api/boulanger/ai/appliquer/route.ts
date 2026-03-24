// app/api/boulanger/ai/appliquer/route.ts
// ─────────────────────────────────────────────────────────────
// GET  → Retourne les prévisions Levain non appliquées pour une date
// POST → Applique les prévisions IA à la journée de production
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession } from '@/lib/auth-boulanger';
import { getTodayInTimezone } from '@/lib/ai-anonymize';

// ── GET — Charge les prévisions Levain pour une date ─────────

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;

  // Récupère le timezone de la boulangerie pour la date du jour
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('timezone')
    .eq('id', boulangerieId)
    .single();
  const timezone = (boulangerie?.timezone as string) ?? 'Europe/Paris';

  // Date demandée (param) ou aujourd'hui dans le timezone de la boulangerie
  const { searchParams } = new URL(req.url);
  const dateProd = searchParams.get('date') ?? getTodayInTimezone(timezone);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateProd)) {
    return NextResponse.json({ error: 'date invalide (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const { data: previsions, error } = await admin
      .from('production_forecasts')
      .select('produit_id, quantite_suggeree, quantite_base, variation_pct, raison')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_production', dateProd)
      .eq('appliquee', false)
      .order('produit_id');

    if (error) {
      console.error('[GET /api/boulanger/ai/appliquer]', error);
      return NextResponse.json({ error: 'Erreur chargement prévisions' }, { status: 500 });
    }

    return NextResponse.json({
      previsions:      previsions ?? [],
      date_production: dateProd,
      count:           previsions?.length ?? 0,
    });
  } catch (err) {
    console.error('[GET /api/boulanger/ai/appliquer]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — Applique les prévisions à la journée ───────────────

export async function POST(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;

  let body: { date_production?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  const dateProd = body.date_production;
  if (!dateProd || !/^\d{4}-\d{2}-\d{2}$/.test(dateProd)) {
    return NextResponse.json({ error: 'date_production invalide (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    // Récupère les prévisions non appliquées pour ce jour
    const { data: previsions, error: prevError } = await admin
      .from('production_forecasts')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_production', dateProd)
      .eq('appliquee', false);

    if (prevError || !previsions?.length) {
      return NextResponse.json(
        { error: 'Aucune prévision à appliquer pour cette date.' },
        { status: 404 }
      );
    }

    // Crée ou récupère la journée
    const { data: journee, error: journeeError } = await admin
      .from('journees')
      .upsert(
        {
          boulangerie_id:   boulangerieId,
          date:             dateProd,
          commandes_online: 0,
          ca_estime:        0,
          taux_invendu:     0,
          total_produit:    0,
          total_invendu:    0,
        },
        { onConflict: 'boulangerie_id,date' }
      )
      .select()
      .single();

    if (journeeError || !journee) {
      console.error('[appliquer POST] journee upsert:', journeeError);
      return NextResponse.json({ error: 'Erreur création journée.' }, { status: 500 });
    }

    // Récupère les infos produits
    const produitIds = previsions.map(p => p.produit_id);
    const { data: produits } = await admin
      .from('produits')
      .select('id, nom, emoji, categorie, prix_vente, cout_production')
      .in('id', produitIds)
      .eq('boulangerie_id', boulangerieId)
      .is('deleted_at', null);

    const produitsMap = new Map((produits ?? []).map(p => [p.id, p]));

    // Construit les lignes stocks_journaliers
    const stocksRows = previsions
      .map(prev => {
        const produit = produitsMap.get(prev.produit_id);
        if (!produit) return null;
        return {
          journee_id:        journee.id,
          boulangerie_id:    boulangerieId,
          produit_id:        prev.produit_id,
          produit_nom:       produit.nom,
          produit_emoji:     produit.emoji,
          categorie:         produit.categorie,
          prix_vente:        produit.prix_vente,
          cout_production:   produit.cout_production,
          production:        prev.quantite_suggeree,
          snapshot_10h:      0,
          snapshot_10h_done: false,
          snapshot_14h:      0,
          snapshot_14h_done: false,
          stock_final:       0,
        };
      })
      .filter(Boolean);

    if (stocksRows.length > 0) {
      const { error: stocksError } = await admin
        .from('stocks_journaliers')
        .upsert(stocksRows, { onConflict: 'journee_id,produit_id' });

      if (stocksError) {
        console.error('[appliquer POST] stocks upsert:', stocksError);
        return NextResponse.json({ error: 'Erreur lors de l\'application des prévisions.' }, { status: 500 });
      }
    }

    // Met à jour le total_produit de la journée
    const totalProduit = previsions.reduce((s, p) => s + (p.quantite_suggeree || 0), 0);
    await admin
      .from('journees')
      .update({ total_produit: totalProduit })
      .eq('id', journee.id);

    // Marque les prévisions comme appliquées
    await admin
      .from('production_forecasts')
      .update({ appliquee: true, appliquee_le: new Date().toISOString() })
      .eq('boulangerie_id', boulangerieId)
      .eq('date_production', dateProd);

    return NextResponse.json({
      success:         true,
      produits_maj:    stocksRows.length,
      total_pieces:    totalProduit,
      date_production: dateProd,
    });

  } catch (err) {
    console.error('[POST /api/boulanger/ai/appliquer]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}