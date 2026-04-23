// app/api/boulanger/defis/route.ts
// ─────────────────────────────────────────────────────────────
// GET → Défis actifs + récents + profil gamification
//
// Self-heal intégré : si la journée du jour (TZ boulangerie) est
// clôturée ET qu'il reste des défis `actif`, on déclenche une
// résolution idempotente avant de retourner les données.
// Cela couvre les cas où POST /defis/resolve a échoué côté client.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { getTodayInTimezone } from '@/lib/ai-anonymize';
import { resolveDefis } from '@/lib/defis-resolve';

export async function GET(req: NextRequest) {
  try {
    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (!canAccess(session, 'dashboard', 'read')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { boulangerieId } = session;

    // Timezone-aware "today"
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('timezone')
      .eq('id', boulangerieId)
      .single();
    const timezone = (boulangerie?.timezone as string | null) ?? 'Europe/Paris';

    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const today = dateParam || getTodayInTimezone(timezone);

    // ── Self-heal : tenter une résolution si journée clôturée + défis actifs ──
    try {
      const { data: journeeToday } = await admin
        .from('journees')
        .select('cloturee')
        .eq('boulangerie_id', boulangerieId)
        .eq('date', today)
        .maybeSingle();

      if (journeeToday?.cloturee) {
        const { data: activeDefis } = await admin
          .from('defis')
          .select('id')
          .eq('boulangerie_id', boulangerieId)
          .eq('date_defi', today)
          .eq('statut', 'actif')
          .limit(1);

        if (activeDefis && activeDefis.length > 0) {
          // Résolution silencieuse (idempotente) — on avale les erreurs pour
          // ne pas bloquer la lecture des défis.
          await resolveDefis(admin, boulangerieId, today).catch(err => {
            console.warn('[defis] self-heal failed', err);
          });
        }
      }
    } catch (healErr) {
      console.warn('[defis] self-heal outer error', healErr);
    }

    // ── Chargement final après self-heal ──────────────────────────
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
