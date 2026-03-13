// app/api/orders/route.ts
// Route manquante dans le codebase — à créer
// Persiste les commandes click & collect en base Supabase

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';

// ── Validation Zod ────────────────────────────────────────────
const LigneCommandeSchema = z.object({
  produit_id:   z.string().min(1),
  produit_nom:  z.string().min(1),
  quantite:     z.number().int().positive().max(99),
  prix_unitaire: z.number().positive(),
});

const CommandeSchema = z.object({
  boulangerie_slug: z.string().min(1),
  client_prenom:    z.string().min(1).max(50),
  client_email:     z.string().email(),
  client_telephone: z.string().optional(),
  heure_retrait:    z.string().regex(/^\d{2}:\d{2}$/),  // "HH:MM"
  lignes:           z.array(LigneCommandeSchema).min(1).max(30),
  notes:            z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Parse & validation
    const body = await req.json();
    const parsed = CommandeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = getSupabaseAdmin();

    // 2. Récupère la boulangerie par slug
    const { data: boulangerie, error: bErr } = await supabase
      .from('boulangeries')
      .select('id, actif')
      .eq('slug', data.boulangerie_slug)
      .single();

    if (bErr || !boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    if (!boulangerie.actif) {
      return NextResponse.json({ error: 'Boulangerie non active' }, { status: 403 });
    }

    // 3. Calcule le montant total
    const montant_total = data.lignes.reduce(
      (sum, l) => sum + l.quantite * l.prix_unitaire,
      0
    );

    // 4. Insère la commande
    const { data: commande, error: cErr } = await supabase
      .from('commandes')
      .insert({
        boulangerie_id:   boulangerie.id,
        client_prenom:    data.client_prenom,
        client_email:     data.client_email,
        client_telephone: data.client_telephone ?? null,
        heure_retrait:    data.heure_retrait,
        notes:            data.notes ?? null,
        montant_total,
        statut:           'en_attente',
        lignes:           data.lignes,   // JSONB
      })
      .select('id, created_at')
      .single();

    if (cErr) {
      console.error('[POST /api/orders] insert error:', cErr);
      return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
    }

    // 5. Envoie l'email de confirmation (Resend)
    //    → voir app/api/orders/_send-confirmation.ts à créer
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/orders/confirm-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commande_id:   commande.id,
          client_prenom: data.client_prenom,
          client_email:  data.client_email,
          heure_retrait: data.heure_retrait,
          lignes:        data.lignes,
          montant_total,
        }),
      });
    } catch (emailErr) {
      // L'email échoue silencieusement — la commande est quand même sauvée
      console.error('[POST /api/orders] email error (non-bloquant):', emailErr);
    }

    return NextResponse.json(
      { success: true, commande_id: commande.id },
      { status: 201 }
    );

  } catch (err) {
    console.error('[POST /api/orders] unexpected error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── GET : liste les commandes d'une boulangerie (baker dashboard) ─
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const boulangerieId = searchParams.get('boulangerie_id');
  const date          = searchParams.get('date');  // "YYYY-MM-DD"

  if (!boulangerieId) {
    return NextResponse.json({ error: 'boulangerie_id requis' }, { status: 400 });
  }

  // Auth : le JWT de l'utilisateur doit matcher la boulangerie
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Vérifie que l'user est bien le owner de cette boulangerie
  const { data: b, error: bErr } = await supabase
    .from('boulangeries')
    .select('id')
    .eq('id', boulangerieId)
    .eq('user_id', user.id)
    .single();

  if (bErr || !b) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  let query = supabase
    .from('commandes')
    .select('*')
    .eq('boulangerie_id', boulangerieId)
    .order('created_at', { ascending: false });

  if (date) query = query.gte('created_at', `${date}T00:00:00Z`)
                         .lte('created_at', `${date}T23:59:59Z`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Erreur requête' }, { status: 500 });
  }

  return NextResponse.json({ commandes: data });
}