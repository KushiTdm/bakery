import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

// Taille de page fixe : 14 jours par tranche pour éviter de charger 90j × 30 produits
const PAGE_SIZE = 14;

export async function GET(req: NextRequest) {
  try {
    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (!canAccess(session, 'dashboard', 'read')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { boulangerieId } = session;
    const { searchParams } = new URL(req.url);

    // Pagination par curseur de date : ?before=YYYY-MM-DD charge les 14 jours précédant cette date
    // Sans paramètre, retourne les 14 jours les plus récents.
    // Compatible avec l'ancienne API : ?limit= est toujours accepté (borné à PAGE_SIZE)
    const before      = searchParams.get('before');  // date exclusive (non incluse)
    const rawLimit    = searchParams.get('limit');
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : PAGE_SIZE;
    const limit       = !isNaN(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, PAGE_SIZE)
      : PAGE_SIZE;

    const onlyClosed = searchParams.get('cloturee') !== 'false';

    if (before && !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
      return NextResponse.json({ error: 'Paramètre before invalide (YYYY-MM-DD)' }, { status: 400 });
    }

    let query = admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerieId)
      .order('date', { ascending: false })
      .limit(limit);

    if (onlyClosed)  query = query.eq('cloturee', true);
    if (before)      query = query.lt('date', before);

    const { data: historique, error } = await query;

    if (error) {
      console.error('[/api/boulanger/historique GET]', error);
      return NextResponse.json({ error: 'Erreur chargement historique' }, { status: 500 });
    }

    const rows = historique ?? [];

    // next_cursor : date de la dernière entrée retournée → le client passe ?before=next_cursor
    const nextCursor = rows.length === limit ? rows[rows.length - 1].date : null;

    return NextResponse.json({
      historique:  rows.reverse(),   // ordre chronologique pour les graphiques
      count:       rows.length,
      next_cursor: nextCursor,       // null si c'est la dernière page
      page_size:   PAGE_SIZE,
    });

  } catch (err) {
    console.error('[/api/boulanger/historique GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
