import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();

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

    const { searchParams } = new URL(req.url);

    // PATCH : parseInt + isNaN check + borne [1, 90]
    const rawLimit = searchParams.get('limit');
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 30;
    const limit = !isNaN(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 90)
      : 30;

    const onlyClosed = searchParams.get('cloturee') !== 'false';

    const query = admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerie.id)
      .order('date', { ascending: false })
      .limit(limit);

    if (onlyClosed) {
      query.eq('cloturee', true);
    }

    const { data: historique, error } = await query;

    if (error) {
      console.error('[/api/boulanger/historique GET]', error);
      return NextResponse.json({ error: 'Erreur chargement historique' }, { status: 500 });
    }

    return NextResponse.json({
      historique: (historique ?? []).reverse(),
      count: historique?.length ?? 0,
    });

  } catch (err) {
    console.error('[/api/boulanger/historique GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}