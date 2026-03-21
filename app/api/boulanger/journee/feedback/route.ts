// app/api/boulanger/journee/feedback/route.ts
// POST → Sauvegarde le retour vendeur de fin de journée

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;

  // Owner ou employé actif
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (boulangerie) return { admin, boulangerieId: boulangerie.id, userId: user.id };

  const { data: employe } = await admin
    .from('employes')
    .select('boulangerie_id, prenom')
    .eq('user_id', user.id)
    .eq('statut', 'actif')
    .single();
  if (employe) return { admin, boulangerieId: employe.boulangerie_id, userId: user.id, prenom: employe.prenom };

  return null;
}

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { admin, boulangerieId, userId } = auth;
  const prenom = (auth as any).prenom ?? null;

  let body: {
    journee_id:        string;
    rating_journee:    number;
    points_forts?:     string[];
    points_ameliorer?: string[];
    commentaire_libre?: string;
    has_evenement?:    boolean;
    evenement_desc?:   string;
    evenement_impact?: string;
    evenement_pct?:    number;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  if (!body.journee_id || !body.rating_journee) {
    return NextResponse.json({ error: 'journee_id et rating_journee requis' }, { status: 400 });
  }

  // Vérifier que la journée appartient à cette boulangerie
  const { data: journee } = await admin
    .from('journees')
    .select('id, boulangerie_id')
    .eq('id', body.journee_id)
    .eq('boulangerie_id', boulangerieId)
    .single();

  if (!journee) {
    return NextResponse.json({ error: 'Journée introuvable ou accès refusé' }, { status: 404 });
  }

  try {
    const { data, error } = await admin
      .from('feedback_journee')
      .upsert({
        journee_id:        body.journee_id,
        boulangerie_id:    boulangerieId,
        rating_journee:    Math.max(1, Math.min(5, Math.floor(body.rating_journee))),
        points_forts:      body.points_forts ?? [],
        points_ameliorer:  body.points_ameliorer ?? [],
        commentaire_libre: body.commentaire_libre?.slice(0, 1000) ?? null,
        has_evenement:     body.has_evenement ?? false,
        evenement_desc:    body.evenement_desc?.slice(0, 500) ?? null,
        evenement_impact:  body.evenement_impact ?? null,
        evenement_pct:     body.evenement_pct ?? 0,
        saisi_par_id:      userId,
        saisi_par_prenom:  prenom,
      }, { onConflict: 'journee_id' })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/boulanger/journee/feedback]', error);
      return NextResponse.json({ error: 'Erreur sauvegarde feedback' }, { status: 500 });
    }

    return NextResponse.json({ success: true, feedback: data });
  } catch (err) {
    console.error('[POST /api/boulanger/journee/feedback]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { admin, boulangerieId } = auth;
  const { searchParams } = new URL(req.url);
  const journeeId = searchParams.get('journee_id');

  if (!journeeId) {
    return NextResponse.json({ error: 'journee_id requis' }, { status: 400 });
  }

  try {
    const { data, error } = await admin
      .from('feedback_journee')
      .select('*')
      .eq('journee_id', journeeId)
      .eq('boulangerie_id', boulangerieId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

    return NextResponse.json({ feedback: data ?? null });
  } catch (err) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}