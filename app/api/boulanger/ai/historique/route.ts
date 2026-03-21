// app/api/boulanger/ai/historique/route.ts
// GET → Retourne les 30 derniers rapports IA générés (pour l'historique mensuel)

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: b } = await admin.from('boulangeries').select('id').eq('user_id', user.id).single();
  if (!b) return null;
  return { admin, boulangerieId: b.id as string };
}

export async function GET(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { admin, boulangerieId } = auth;
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