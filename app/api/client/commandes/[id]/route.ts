// app/api/client/commandes/[id]/route.ts
// PATCH — annulation d'une commande par le client (statut 'en_attente' uniquement)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/sanitize';

function getSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: 'ID de commande invalide' }, { status: 400 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabaseClient = getSupabaseClient(token);

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 }); }

  const { statut } = body as { statut?: string };

  // Le client ne peut qu'annuler (statut = 'annulee')
  if (statut !== 'annulee') {
    return NextResponse.json({ error: 'Action non autorisée' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();

  try {
    // Vérifie que la commande appartient bien à ce client et est annulable
    const { data: commande, error: fetchError } = await admin
      .from('commandes')
      .select('id, statut, client_email')
      .eq('id', id)
      .single();

    if (fetchError || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    // Vérification propriété
    if (commande.client_email !== user.email) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Seules les commandes en attente peuvent être annulées
    if (commande.statut !== 'en_attente') {
      return NextResponse.json(
        { error: 'Cette commande ne peut plus être annulée (statut : ' + commande.statut + ')' },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from('commandes')
      .update({ statut: 'annulee', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Erreur annulation' }, { status: 500 });
    }

    return NextResponse.json({ success: true, commande: data });
  } catch (err) {
    console.error('[PATCH /api/client/commandes/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}