// app/api/boulanger/clients/route.ts
// ─────────────────────────────────────────────────────────────
// GET — liste les clients avec pénalités (owner/gérant)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  if (!canAccess(session, 'commandes', 'write')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const bloqueOnly = searchParams.get('bloque') === 'true';

  try {
    let query = admin
      .from('client_penalites')
      .select('id, client_email, nb_non_recupere, bloque, blocage_date, debloque_le, note_deblocage, created_at, updated_at')
      .eq('boulangerie_id', session.boulangerieId)
      .order('updated_at', { ascending: false });

    if (bloqueOnly) {
      query = query.eq('bloque', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/boulanger/clients]', error);
      return NextResponse.json({ error: 'Erreur chargement clients' }, { status: 500 });
    }

    // Récupérer la config pénalité de la boulangerie
    const { data: config } = await admin
      .from('boulangeries')
      .select('seuil_penalite, penalite_active')
      .eq('id', session.boulangerieId)
      .single();

    return NextResponse.json({
      clients:  data ?? [],
      config: {
        seuil:  config?.seuil_penalite ?? 3,
        active: config?.penalite_active ?? true,
      },
    });
  } catch (err) {
    console.error('[GET /api/boulanger/clients]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
