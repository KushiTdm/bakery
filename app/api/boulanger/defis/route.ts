// app/api/boulanger/defis/route.ts
// ─────────────────────────────────────────────────────────────
// GET → Défis actifs + récents + profil gamification
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

export async function GET(req: NextRequest) {
  try {
    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (!canAccess(session, 'dashboard', 'read')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { boulangerieId } = session;

    // Date from query or today
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const today = dateParam || new Date().toISOString().split('T')[0];

    // 1. Active + recent defis (last 7 days)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: defis, error: dErr } = await admin
      .from('defis')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .gte('date_defi', sevenDaysAgo.toISOString().split('T')[0])
      .order('date_defi', { ascending: false })
      .order('created_at', { ascending: false });

    if (dErr) {
      console.error('[defis] query error', dErr);
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

    // 2. Gamification profile (upsert if not exists)
    let { data: profil } = await admin
      .from('gamification_profil')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .single();

    if (!profil) {
      const { data: newProfil, error: insertErr } = await admin
        .from('gamification_profil')
        .insert({ boulangerie_id: boulangerieId })
        .select()
        .single();

      if (insertErr) {
        console.error('[defis] profil insert error', insertErr);
        profil = {
          xp_total: 0, niveau: 1, streak_actuel: 0,
          streak_max: 0, derniere_cloture: null, badges: [],
        };
      } else {
        profil = newProfil;
      }
    }

    // Split defis
    const defisToday = (defis ?? []).filter(d => d.date_defi === today);
    const defisRecent = (defis ?? []).filter(d => d.date_defi !== today);

    return NextResponse.json({
      defisToday,
      defisRecent,
      profil,
    });
  } catch (err) {
    console.error('[defis] unexpected error', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
