// app/api/client/commandes/route.ts
// Récupère les commandes d'un client authentifié par email

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';

function getSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');

  const admin = getSupabaseAdmin();

  try {
    let query = admin
      .from('commandes')
      .select('id, client_prenom, client_email, heure_retrait, montant_total, statut, lignes, created_at, notes')
      .eq('client_email', user.email!)
      .order('created_at', { ascending: false });

    // Filtrer par boulangerie si slug fourni
    if (slug) {
      const { data: boulangerie } = await admin
        .from('boulangeries')
        .select('id')
        .eq('slug', slug)
        .single();

      if (boulangerie) {
        query = query.eq('boulangerie_id', boulangerie.id);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/client/commandes]', error);
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

    return NextResponse.json({ commandes: data ?? [] });
  } catch (err) {
    console.error('[GET /api/client/commandes]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}