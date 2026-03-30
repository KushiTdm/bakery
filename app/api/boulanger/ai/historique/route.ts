// app/api/boulanger/ai/historique/route.ts
// GET → Retourne les 30 derniers rapports IA générés (pour l'historique mensuel)

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'dashboard', 'read')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 90);

  try {
    const { data, error } = await admin
      .from('ai_rapports')
      .select('id, date, score_performance, verdict_flash, statut, rapport_json, created_at')
      .eq('boulangerie_id', boulangerieId)
      .eq('statut', 'genere')
      .order('date', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    return NextResponse.json({ rapports: data ?? [] });
  } catch (err) {
    console.error('[GET /api/boulanger/ai/historique]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
