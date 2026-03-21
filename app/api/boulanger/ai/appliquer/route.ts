// app/api/boulanger/ai/appliquer/route.ts
// ─────────────────────────────────────────────────────────────
// POST → Applique les prévisions IA à la journée de production du lendemain.
//        Insère / met à jour les stocks_journaliers de la journée J+1
//        avec les quantités suggérées par l'IA, en 1 clic.
//
// Paramètres body :
//   { date_production: "YYYY-MM-DD" }  // le jour J+1
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const admin = getSupabaseAdmin();
  const token = authHeader.slice(7);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!boulangerie) return null;
  return { admin, boulangerieId: boulangerie.id as string };
}

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { admin, boulangerieId } = auth;

  let body: { date_production?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  const dateProd = body.date_production;
  if (!dateProd || !/^\d{4}-\d{2}-\d{2}$/.test(dateProd)) {
    return NextResponse.json({ error: 'date_production invalide (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    // Récupère les prévisions pour ce jour
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

    // Crée ou récupère la journée du lendemain
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
      console.error('[appliquer] journee upsert:', journeeError);
      return NextResponse.json({ error: 'Erreur création journée.' }, { status: 500 });
    }

    // Récupère les infos produits pour les stocks
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
        console.error('[appliquer] stocks upsert:', stocksError);
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
      success:       true,
      produits_maj:  stocksRows.length,
      total_pieces:  totalProduit,
      date_production: dateProd,
    });

  } catch (err) {
    console.error('[POST /api/boulanger/ai/appliquer]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}