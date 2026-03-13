// app/api/orders/[id]/route.ts
// ─────────────────────────────────────────────────────────────
// PATCH → met à jour le statut d'une commande
// GET   → récupère une commande spécifique
// ─────────────────────────────────────────────────────────────

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

const VALID_STATUSES = ['pending', 'confirmed', 'ready', 'done'] as const;
type Status = typeof VALID_STATUSES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const { user, admin } = auth;

    const { status }: { status: Status } = await req.json();
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
    }

    // Vérifier que la commande appartient bien à ce boulanger
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('boulangerie_id', boulangerie.id) // ← sécurité : n'update que SES commandes
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    return NextResponse.json({ success: true, order: data });

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

    if (!boulangerie) return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });

    const { data, error } = await admin
      .from('orders')
      .select('*')
      .eq('id', params.id)
      .eq('boulangerie_id', boulangerie.id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

    return NextResponse.json({ order: data });

  } catch (err) {
    console.error('[GET /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}