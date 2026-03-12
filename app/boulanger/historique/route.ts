// app/api/boulanger/historique/route.ts
// ─────────────────────────────────────────────────────────────
// GET → retourne les 30 dernières journées clôturées
// Utilisé par le dashboard stats
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    // Paramètres optionnels
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') ?? '30');
    const onlyClosed = searchParams.get('cloturee') !== 'false'; // true par défaut

    const query = admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerie.id)
      .order('date', { ascending: false })
      .limit(Math.min(limit, 90)); // max 90 jours

    if (onlyClosed) {
      query.eq('cloturee', true);
    }

    const { data: historique, error } = await query;

    if (error) {
      console.error('[/api/boulanger/historique GET]', error);
      return NextResponse.json({ error: 'Erreur chargement historique' }, { status: 500 });
    }

    return NextResponse.json({
      historique: (historique ?? []).reverse(), // Ordre chronologique pour les graphiques
      count: historique?.length ?? 0,
    });

  } catch (err) {
    console.error('[/api/boulanger/historique GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}