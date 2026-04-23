// app/api/boulanger/defis/resolve/route.ts
// ─────────────────────────────────────────────────────────────
// POST → Résout les défis actifs du jour à la clôture soir.
// Délègue à `resolveDefis()` pour idempotence + timezone safety.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { getTodayInTimezone } from '@/lib/ai-anonymize';
import { resolveDefis } from '@/lib/defis-resolve';
import { generateAndPersistDefis } from '@/lib/defis-generate';

export async function POST(req: NextRequest) {
  try {
    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (!canAccess(session, 'dashboard', 'write')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { boulangerieId } = session;

    // Timezone-aware date resolution
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('timezone')
      .eq('id', boulangerieId)
      .single();
    const timezone = (boulangerie?.timezone as string | null) ?? 'Europe/Paris';

    // Accepte un override explicite depuis le body (usage backoffice), sinon "aujourd'hui en TZ locale"
    const body = await req.json().catch(() => ({}));
    const date: string = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : getTodayInTimezone(timezone);

    const result = await resolveDefis(admin, boulangerieId, date);

    // ── Génère aussi les défis pour demain, indépendamment du rapport IA ─
    // Si le boulanger clôture sans générer de rapport IA, on veut quand même
    // qu'il trouve ses défis le lendemain matin. Idempotent via upsert.
    try {
      const [y, m, d] = date.split('-').map(Number);
      const tomorrow = new Date(Date.UTC(y, m - 1, d));
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const demainDate = tomorrow.toISOString().slice(0, 10);
      await generateAndPersistDefis(admin, boulangerieId, demainDate);
    } catch (genErr) {
      console.warn('[defis/resolve] generate-tomorrow non-bloquant', genErr);
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    if (message === 'Journée non clôturée') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('[defis/resolve] unexpected error', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
