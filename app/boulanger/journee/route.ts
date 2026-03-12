// app/api/boulanger/journee/route.ts
// ─────────────────────────────────────────────────────────────
// Sauvegarde et chargement de la journée courante
// GET  → charge la journée du jour (ou crée une vide)
// POST → sauvegarde l'état courant (appelé avec debounce)
// PUT  → clôture la journée
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { StockEntry } from '@/context/boulanger-context';

// ── Helper : vérifie le token et retourne le boulangerie_id ──
async function getBoulangerieId(req: NextRequest): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id')
    .eq('user_id', user.id)
    .single();

  return boulangerie?.id ?? null;
}

// ── GET — Charge la journée du jour ──────────────────────────
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const boulangerieId = await getBoulangerieId(req);
    if (!boulangerieId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];

    const { data: journee, error } = await admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "not found", c'est normal si pas encore de journée aujourd'hui
      console.error('[/api/boulanger/journee GET]', error);
      return NextResponse.json({ error: 'Erreur chargement journée' }, { status: 500 });
    }

    return NextResponse.json({ journee: journee ?? null });

  } catch (err) {
    console.error('[/api/boulanger/journee GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — Sauvegarde l'état courant (debounced depuis le context) ──
export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const boulangerieId = await getBoulangerieId(req);
    if (!boulangerieId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { stocks, commandesOnline } = body as {
      stocks: StockEntry[];
      commandesOnline: number;
    };

    if (!stocks || !Array.isArray(stocks)) {
      return NextResponse.json({ error: 'stocks requis' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Calculs agrégés
    const totalProduit = stocks.reduce((s, p) => s + p.production, 0);
    const totalInvendu = stocks.reduce((s, p) => s + p.stockFinal, 0);
    const caEstime = stocks.reduce(
      (s, p) => s + (p.production - p.stockFinal) * p.prixVente,
      0
    );
    const tauxInvendu = totalProduit > 0
      ? parseFloat(((totalInvendu / totalProduit) * 100).toFixed(2))
      : 0;

    // Upsert journée
    const { data: journee, error: journeeError } = await admin
      .from('journees')
      .upsert(
        {
          boulangerie_id: boulangerieId,
          date: today,
          commandes_online: commandesOnline,
          ca_estime: parseFloat(caEstime.toFixed(2)),
          taux_invendu: tauxInvendu,
          total_produit: totalProduit,
          total_invendu: totalInvendu,
        },
        { onConflict: 'boulangerie_id,date' }
      )
      .select()
      .single();

    if (journeeError || !journee) {
      console.error('[/api/boulanger/journee POST] journee upsert:', journeeError);
      return NextResponse.json({ error: 'Erreur sauvegarde journée' }, { status: 500 });
    }

    // Upsert stocks (batch)
    const stocksToUpsert = stocks.map((s) => ({
      journee_id: journee.id,
      boulangerie_id: boulangerieId,
      produit_id: s.id,
      produit_nom: s.name,
      produit_emoji: s.emoji,
      categorie: s.category,
      prix_vente: s.prixVente,
      cout_production: s.coutProduction,
      production: s.production,
      snapshot_10h: s.snapshot10h,
      snapshot_10h_done: s.snapshot10hDone,
      snapshot_14h: s.snapshot14h,
      snapshot_14h_done: s.snapshot14hDone,
      stock_final: s.stockFinal,
    }));

    const { error: stocksError } = await admin
      .from('stocks_journaliers')
      .upsert(stocksToUpsert, { onConflict: 'journee_id,produit_id' });

    if (stocksError) {
      console.error('[/api/boulanger/journee POST] stocks upsert:', stocksError);
      return NextResponse.json({ error: 'Erreur sauvegarde stocks' }, { status: 500 });
    }

    return NextResponse.json({ success: true, journee_id: journee.id });

  } catch (err) {
    console.error('[/api/boulanger/journee POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── PUT — Clôture la journée ──────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const boulangerieId = await getBoulangerieId(req);
    if (!boulangerieId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];

    const { error } = await admin
      .from('journees')
      .update({ cloturee: true })
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today);

    if (error) {
      return NextResponse.json({ error: 'Erreur clôture journée' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[/api/boulanger/journee PUT]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}