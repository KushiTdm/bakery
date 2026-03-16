import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/sanitize';

async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return { user, admin };
}

const VALID_STATUSES = ['en_attente', 'confirmee', 'prete', 'recuperee', 'annulee'] as const;
type Status = typeof VALID_STATUSES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validation UUID de params.id (évite path traversal et injections)
    if (!params.id || !isValidUUID(params.id)) {
      return NextResponse.json({ error: 'ID de commande invalide' }, { status: 400 });
    }

    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const { user, admin } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const status = (body as Record<string, unknown>)?.status as Status;

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

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
    // Validation UUID
    if (!params.id || !isValidUUID(params.id)) {
      return NextResponse.json({ error: 'ID de commande invalide' }, { status: 400 });
    }

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