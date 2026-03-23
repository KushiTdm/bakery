import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
// I2 : import depuis lib/types.ts (neutre) et non depuis context/boulanger-context ('use client')
import type { StockEntry } from '@/lib/types';
import { getTodayInTimezone } from '@/lib/ai-anonymize';

async function getBoulangerieId(req: NextRequest): Promise<{ id: string; timezone: string } | null> {
  const admin = getSupabaseAdmin();
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id, timezone')
    .eq('user_id', user.id)
    .single();

  if (!boulangerie) return null;
  return { id: boulangerie.id, timezone: (boulangerie.timezone as string) ?? 'Europe/Paris' };
}

// ── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const auth = await getBoulangerieId(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const boulangerieId = auth.id;
    const today = getTodayInTimezone(auth.timezone);

    const { data: journee, error } = await admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[/api/boulanger/journee GET]', error);
      return NextResponse.json({ error: 'Erreur chargement journée' }, { status: 500 });
    }

    return NextResponse.json({ journee: journee ?? null });

  } catch (err) {
    console.error('[/api/boulanger/journee GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const auth = await getBoulangerieId(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const boulangerieId = auth.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const { stocks, commandesOnline } = body as {
      stocks: StockEntry[];
      commandesOnline: number;
    };

    if (!stocks || !Array.isArray(stocks)) {
      return NextResponse.json({ error: 'stocks requis (tableau)' }, { status: 400 });
    }

    const commandesOnlineSafe = Math.max(0, Math.min(Math.floor(Number(commandesOnline) || 0), 9999));

    const stocksSafe = stocks.map(s => ({
      ...s,
      production:     Math.max(0, Math.min(Math.floor(Number(s.production)       || 0), 99999)),
      snapshot10h:    Math.max(0, Math.min(Math.floor(Number(s.snapshot10h)      || 0), 99999)),
      snapshot14h:    Math.max(0, Math.min(Math.floor(Number(s.snapshot14h)      || 0), 99999)),
      stockFinal:     Math.max(0, Math.min(Math.floor(Number(s.stockFinal)       || 0), 99999)),
      prixVente:      Math.max(0, Math.min(Math.round(Number(s.prixVente)        * 100) / 100, 9999.99)),
      coutProduction: Math.max(0, Math.min(Math.round(Number(s.coutProduction)   * 100) / 100, 9999.99)),
    }));

    const today = getTodayInTimezone(auth.timezone);
    const totalProduit = stocksSafe.reduce((s, p) => s + p.production, 0);
    const totalInvendu = stocksSafe.reduce((s, p) => s + p.stockFinal, 0);
    const caEstime     = stocksSafe.reduce(
      (s, p) => s + (p.production - p.stockFinal) * p.prixVente, 0
    );
    const tauxInvendu  = totalProduit > 0
      ? parseFloat(((totalInvendu / totalProduit) * 100).toFixed(2))
      : 0;

    const { data: journee, error: journeeError } = await admin
      .from('journees')
      .upsert(
        {
          boulangerie_id:   boulangerieId,
          date:             today,
          commandes_online: commandesOnlineSafe,
          ca_estime:        parseFloat(Math.min(caEstime, 999999.99).toFixed(2)),
          taux_invendu:     tauxInvendu,
          total_produit:    totalProduit,
          total_invendu:    totalInvendu,
        },
        { onConflict: 'boulangerie_id,date' }
      )
      .select()
      .single();

    if (journeeError || !journee) {
      console.error('[/api/boulanger/journee POST] journee upsert:', journeeError);
      return NextResponse.json({ error: 'Erreur sauvegarde journée' }, { status: 500 });
    }

    const stocksToUpsert = stocksSafe.map((s) => ({
      journee_id:        journee.id,
      boulangerie_id:    boulangerieId,
      produit_id:        s.id,
      produit_nom:       String(s.name).slice(0, 150),
      produit_emoji:     String(s.emoji).slice(0, 4),
      categorie:         ['boulangerie', 'viennoiserie', 'patisserie'].includes(s.category) ? s.category : 'boulangerie',
      prix_vente:        s.prixVente,
      cout_production:   s.coutProduction,
      production:        s.production,
      snapshot_10h:      s.snapshot10h,
      snapshot_10h_done: !!s.snapshot10hDone,
      snapshot_14h:      s.snapshot14h,
      snapshot_14h_done: !!s.snapshot14hDone,
      stock_final:       s.stockFinal,
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

// ── PUT — Clôture ────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const auth = await getBoulangerieId(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const boulangerieId = auth.id;
    const today = getTodayInTimezone(auth.timezone);

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