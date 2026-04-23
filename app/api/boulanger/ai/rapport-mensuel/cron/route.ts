// app/api/boulanger/ai/rapport-mensuel/cron/route.ts
// ─────────────────────────────────────────────────────────────
// POST protégé par header `x-internal-secret = INTERNAL_API_SECRET`
// Déclenché par pg_cron Supabase le 1er de chaque mois à 06:00 UTC.
//
// Itère sur toutes les boulangeries actives et enqueue la génération
// du rapport mensuel du mois précédent.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { generateRapportMensuel } from '../route';

export const runtime = 'nodejs';
export const maxDuration = 300;

function previousMonthRef(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (m === 0) return `${y - 1}-12-01`;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'INTERNAL_API_SECRET non configuré' }, { status: 503 });
  }
  if (req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const zhipuApiKey = process.env.ZHIPU_API_KEY;
  if (!zhipuApiKey) {
    return NextResponse.json({ error: 'ZHIPU_API_KEY absent' }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  const mois = previousMonthRef();

  const { data: boulangeries, error } = await admin
    .from('boulangeries')
    .select('id, nom, stripe_status')
    .in('stripe_status', ['active', 'trialing']);

  if (error) {
    console.error('[cron rapport-mensuel] query error', error);
    return NextResponse.json({ error: 'Erreur requête' }, { status: 500 });
  }

  const results: Array<{ id: string; nom: string; ok: boolean; error?: string }> = [];

  // Séquentiel pour ménager Google Places + z.ai
  for (const b of boulangeries ?? []) {
    try {
      const res = await generateRapportMensuel(admin, b.id as string, mois, zhipuApiKey);
      results.push({ id: b.id as string, nom: (b.nom as string | null) ?? '?', ok: res.status < 400 });
    } catch (e) {
      results.push({
        id: b.id as string,
        nom: (b.nom as string | null) ?? '?',
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 200) : 'inconnue',
      });
    }
  }

  return NextResponse.json({
    mois,
    total:  results.length,
    ok:     results.filter(r => r.ok).length,
    errors: results.filter(r => !r.ok).length,
    results,
  });
}
