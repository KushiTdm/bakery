// app/api/orders/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return { user, admin };
}

// Statuts alignés avec la contrainte CHECK de la table commandes
const VALID_STATUSES = ['en_attente', 'confirmee', 'prete', 'recuperee', 'annulee'] as const;
type Status = typeof VALID_STATUSES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const { user, admin } = auth;

    const body = await req.json();
    const status: Status = body.status;

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Vérifie ownership — la commande appartient bien à ce boulanger
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    // Table réelle : commandes (pas orders)
    const { data, error } = await admin
      .from('commandes')
      .update({ statut: status, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('boulangerie_id', boulangerie.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Commande introuvable ou accès refusé' }, { status: 404 });
    }

    return NextResponse.json({ success: true, commande: data });

  } catch (err) {
    console.error('[PATCH /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const { user, admin } = auth;

    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    // Table réelle : commandes
    const { data, error } = await admin
      .from('commandes')
      .select('*')
      .eq('id', params.id)
      .eq('boulangerie_id', boulangerie.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    return NextResponse.json({ commande: data });

  } catch (err) {
    console.error('[GET /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}