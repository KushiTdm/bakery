// app/api/orders/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isMemoryRateLimited, isSupabaseRateLimited } from '@/lib/rate-limit';

const LigneCommandeSchema = z.object({
  produit_id:    z.string().min(1),
  produit_nom:   z.string().min(1),
  quantite:      z.number().int().positive().max(99),
  prix_unitaire: z.number().positive(),
});

const CommandeSchema = z.object({
  boulangerie_slug: z.string().min(1),
  client_prenom:    z.string().min(1).max(50),
  client_email:     z.string().email(),
  client_telephone: z.string().optional(),
  heure_retrait:    z.string().regex(/^\d{2}:\d{2}$/),
  lignes:           z.array(LigneCommandeSchema).min(1).max(30),
  notes:            z.string().max(500).optional(),
});

function checkSupabaseConfig(): { ok: true } | { ok: false; error: NextResponse } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[POST /api/orders] Supabase config manquante');
    return {
      ok: false,
      error: NextResponse.json({ error: 'Configuration serveur incomplète.' }, { status: 503 }),
    };
  }
  return { ok: true };
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  const config = checkSupabaseConfig();
  if (!config.ok) return config.error;

  // ── Couche 1 : Rate limit IP en mémoire ──────────────────────
  // 5 commandes max par IP par heure
  const clientIp = getClientIp(req);
  if (isMemoryRateLimited(`orders:${clientIp}`, { windowMs: 60 * 60 * 1000, maxCalls: 5 })) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans une heure.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  try {
    const body   = await req.json();
    const parsed = CommandeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const supabase = getSupabaseAdmin();

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

    // ── Couche 2 : Rate limit email via Supabase (24h glissantes) ─
    // 3 commandes max par email par boulangerie par 24h
    const emailLimited = await isSupabaseRateLimited(
      supabase,
      data.client_email,
      boulangerie.id,
      { maxOrdersPer24h: 3 }
    );

    if (emailLimited) {
      return NextResponse.json(
        { error: 'Limite de commandes atteinte pour aujourd\'hui. Contactez la boulangerie directement.' },
        { status: 429, headers: { 'Retry-After': '86400' } }
      );
    }

    const montant_total = data.lignes.reduce(
      (sum, l) => sum + l.quantite * l.prix_unitaire,
      0
    );

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
        lignes:           data.lignes,
      })
      .select('id, created_at')
      .single();

    if (cErr) {
      console.error('[POST /api/orders] insert error:', cErr);
      return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
    }

    // Email de confirmation (non bloquant)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      if (appUrl) {
        await fetch(`${appUrl}/api/orders/confirm-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
          },
          body: JSON.stringify({
            commande_id:   commande.id,
            client_prenom: data.client_prenom,
            client_email:  data.client_email,
            heure_retrait: data.heure_retrait,
            lignes:        data.lignes,
            montant_total,
          }),
        });
      }
    } catch (emailErr) {
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

export async function GET(req: NextRequest) {
  const config = checkSupabaseConfig();
  if (!config.ok) return config.error;

  const { searchParams } = new URL(req.url);
  const boulangerieId = searchParams.get('boulangerie_id');
  const date          = searchParams.get('date');

  if (!boulangerieId) {
    return NextResponse.json({ error: 'boulangerie_id requis' }, { status: 400 });
  }

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

  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const supabase = getSupabaseAdmin();

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

  if (date) {
    // Filtre sur date locale France (UTC+1 hiver, UTC+2 été)
    // Marge de 2h pour couvrir les deux offsets DST sans perdre de commandes
    const dateStart = new Date(`${date}T00:00:00+01:00`).toISOString();
    const dateEnd   = new Date(`${date}T23:59:59+02:00`).toISOString();
    query = query.gte('created_at', dateStart).lte('created_at', dateEnd);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Erreur requête' }, { status: 500 });
  }

  return NextResponse.json({ commandes: data });
}