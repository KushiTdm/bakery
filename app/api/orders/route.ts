import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isMemoryRateLimited, isSupabaseRateLimited } from '@/lib/rate-limit';
import { sanitizeText, isValidUUID } from '@/lib/sanitize';

// ── Schémas Zod renforcés ──────────────────────────────────────

const LigneCommandeSchema = z.object({
  produit_id:    z.string().min(1).max(100),
  produit_nom:   z.string().min(1).max(150),
  quantite:      z.number().int().positive().max(99),
  prix_unitaire: z.number().positive().max(9999), // max 9999€ par unité
});

const CommandeSchema = z.object({
  boulangerie_slug: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/),
  client_prenom:    z.string().min(1).max(50),
  client_email:     z.string().email().max(254),
  client_telephone: z.string().max(20).optional().nullable(),
  heure_retrait:    z.string().regex(/^\d{2}:\d{2}$/),
  lignes:           z.array(LigneCommandeSchema).min(1).max(30),
  notes:            z.string().max(500).optional().nullable(),
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

  const clientIp = getClientIp(req);

  const ipLimited = await isMemoryRateLimited(
    `orders:${clientIp}`,
    { windowMs: 60 * 60 * 1000, maxCalls: 5 }
  );

  if (ipLimited) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans une heure.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parsed = CommandeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Sanitization textuelle après validation structurelle
    const sanitizedData = {
      ...data,
      client_prenom:    sanitizeText(data.client_prenom, 50),
      client_telephone: data.client_telephone ? sanitizeText(data.client_telephone, 20) : null,
      notes:            data.notes ? sanitizeText(data.notes, 500) : null,
      lignes: data.lignes.map(l => ({
        ...l,
        produit_id:  sanitizeText(l.produit_id, 100),
        produit_nom: sanitizeText(l.produit_nom, 150),
        quantite:      Math.max(1, Math.min(l.quantite, 99)),
        prix_unitaire: Math.round(l.prix_unitaire * 100) / 100,
      })),
    };

    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const supabase = getSupabaseAdmin();

    const { data: boulangerie, error: bErr } = await supabase
      .from('boulangeries')
      .select('id, actif')
      .eq('slug', sanitizedData.boulangerie_slug)
      .single();

    if (bErr || !boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    if (!boulangerie.actif) {
      return NextResponse.json({ error: 'Boulangerie non active' }, { status: 403 });
    }

    const emailLimited = await isSupabaseRateLimited(
      supabase,
      sanitizedData.client_email,
      boulangerie.id,
      { maxOrdersPer24h: 3 }
    );

    if (emailLimited) {
      return NextResponse.json(
        { error: "Limite de commandes atteinte pour aujourd'hui. Contactez la boulangerie directement." },
        { status: 429, headers: { 'Retry-After': '86400' } }
      );
    }

    const montant_total = sanitizedData.lignes.reduce(
      (sum, l) => sum + l.quantite * l.prix_unitaire,
      0
    );

    // Borne le montant total pour éviter des dépassements DB
    const montant_final = Math.round(Math.min(montant_total, 99999.99) * 100) / 100;

    const { data: commande, error: cErr } = await supabase
      .from('commandes')
      .insert({
        boulangerie_id:   boulangerie.id,
        client_prenom:    sanitizedData.client_prenom,
        client_email:     sanitizedData.client_email,
        client_telephone: sanitizedData.client_telephone ?? null,
        heure_retrait:    sanitizedData.heure_retrait,
        notes:            sanitizedData.notes ?? null,
        montant_total:    montant_final,
        statut:           'en_attente',
        lignes:           sanitizedData.lignes,
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
            'Content-Type':      'application/json',
            'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
          },
          body: JSON.stringify({
            commande_id:   commande.id,
            client_prenom: sanitizedData.client_prenom,
            client_email:  sanitizedData.client_email,
            heure_retrait: sanitizedData.heure_retrait,
            lignes:        sanitizedData.lignes,
            montant_total: montant_final,
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

  // Validation UUID
  if (!isValidUUID(boulangerieId)) {
    return NextResponse.json({ error: 'boulangerie_id invalide' }, { status: 400 });
  }

  // Validation date si fournie
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Format date invalide (YYYY-MM-DD)' }, { status: 400 });
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