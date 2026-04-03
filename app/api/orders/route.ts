import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isMemoryRateLimited, isSupabaseRateLimited } from '@/lib/rate-limit';
import { sanitizeText, isValidUUID } from '@/lib/sanitize';

// ── P1-4 : Constante limite taille payload ───────────────────────────────────
const MAX_PAYLOAD_BYTES = 50_000; // 50 KB — protection DoS

// ── P2 : Origin validation pour CSRF ────────────────────────────────────────
// Lazy-évalué à la première requête (env vars disponibles au runtime, pas au build)
let _allowedOrigins: string[] | null = null;
function getAllowedOrigins(): string[] {
  if (_allowedOrigins) return _allowedOrigins;
  _allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:54321', // Supabase local
  ].filter((v): v is string => Boolean(v));
  return _allowedOrigins;
}

/**
 * Valide l'origine de la requête pour les méthodes modifiantes (POST).
 * Protection CSRF basique : empêche les soumissions depuis des sites tiers.
 *
 * Note : l'auth boulanger utilise JWT Bearer (pas de cookie), donc le vrai
 * CSRF ne s'applique qu'aux routes publiques comme /api/orders.
 */
function validateOrigin(req: NextRequest): boolean {
  const origin  = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // Pas d'origin ni referer : probablement une requête curl/Postman
  // En dev on autorise, en prod on vérifie X-Requested-With
  if (!origin && !referer) {
    if (process.env.NODE_ENV !== 'production') return true;
    return req.headers.get('x-requested-with') === 'XMLHttpRequest';
  }

  // Résolution de l'origine source (origin > referer)
  let sourceOrigin: string | null = origin;
  if (!sourceOrigin && referer) {
    try {
      sourceOrigin = new URL(referer).origin;
    } catch {
      return false; // referer malformé → refus
    }
  }

  if (!sourceOrigin) return false;

  const allowed = getAllowedOrigins();
  return allowed.some(a => sourceOrigin === a || sourceOrigin!.startsWith(a));
}

// ── Schémas Zod ──────────────────────────────────────────────

const LigneCommandeSchema = z.object({
  produit_id:    z.string().min(1).max(100),
  produit_nom:   z.string().min(1).max(150),
  quantite:      z.number().int().positive().max(99),
  prix_unitaire: z.number().positive().max(9999),
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

  // P2 : Validation Origin — protection CSRF
  if (!validateOrigin(req)) {
    console.warn('[POST /api/orders] Origin refusée:', req.headers.get('origin'));
    return NextResponse.json(
      { error: 'Requête non autorisée.' },
      { status: 403 }
    );
  }

  // P1-4 : Validation Content-Length — protection DoS
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (isNaN(length) || length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: `Payload trop volumineux (max ${MAX_PAYLOAD_BYTES / 1000} KB)` },
        { status: 413 }
      );
    }
  }

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

    const sanitizedData = {
      ...data,
      client_prenom:    sanitizeText(data.client_prenom, 50),
      client_telephone: data.client_telephone ? sanitizeText(data.client_telephone, 20) : null,
      notes:            data.notes ? sanitizeText(data.notes, 500) : null,
      lignes: data.lignes.map(l => ({
        ...l,
        produit_id:    sanitizeText(l.produit_id, 100),
        produit_nom:   sanitizeText(l.produit_nom, 150),
        quantite:      Math.max(1, Math.min(l.quantite, 99)),
        prix_unitaire: Math.round(l.prix_unitaire * 100) / 100,
      })),
    };

    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const supabase = getSupabaseAdmin();

    const { data: boulangerie, error: bErr } = await supabase
      .from('boulangeries')
      .select('id, actif, creneaux_retrait, timezone, seuil_penalite, penalite_active')
      .eq('slug', sanitizedData.boulangerie_slug)
      .single();

    if (bErr || !boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    if (!boulangerie.actif) {
      return NextResponse.json({ error: 'Boulangerie non active' }, { status: 403 });
    }

    const creneaux: string[] = Array.isArray(boulangerie.creneaux_retrait)
      ? boulangerie.creneaux_retrait
      : [];

    if (creneaux.length > 0 && !creneaux.includes(sanitizedData.heure_retrait)) {
      return NextResponse.json(
        { error: `Créneau de retrait invalide. Créneaux disponibles : ${creneaux.join(', ')}` },
        { status: 400 }
      );
    }

    // ── Vérification client bloqué (pénalités no-show) ──────
    if (boulangerie.penalite_active) {
      const { data: penalite } = await supabase
        .from('client_penalites')
        .select('bloque')
        .eq('boulangerie_id', boulangerie.id)
        .eq('client_email', sanitizedData.client_email.toLowerCase().trim())
        .single();

      if (penalite?.bloque) {
        return NextResponse.json(
          { error: 'Votre compte est suspendu suite à des commandes non récupérées. Contactez la boulangerie.' },
          { status: 403 }
        );
      }
    }

    // ── Vérification disponibilité stock (atomique via RPC) ────
    const tz = (boulangerie as Record<string, unknown>).timezone as string || 'Europe/Paris';
    const todayLocal = new Date().toLocaleDateString('sv-SE', { timeZone: tz }); // YYYY-MM-DD

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
    const montant_final = Math.round(Math.min(montant_total, 99999.99) * 100) / 100;

    // Appel RPC atomique : vérifie le stock ET insère la commande en une seule transaction
    const { data: commandeId, error: stockErr } = await supabase.rpc('verifier_stock_commande', {
      p_boulangerie_id:   boulangerie.id,
      p_date:             todayLocal,
      p_lignes:           sanitizedData.lignes,
      p_timezone:         tz,
      p_client_prenom:    sanitizedData.client_prenom,
      p_client_email:     sanitizedData.client_email,
      p_client_telephone: sanitizedData.client_telephone ?? null,
      p_heure_retrait:    sanitizedData.heure_retrait,
      p_notes:            sanitizedData.notes ?? null,
      p_montant_total:    montant_final,
    });

    if (stockErr) {
      // P0002 = stock insuffisant (RAISE EXCEPTION dans la RPC)
      if (stockErr.code === 'P0002' || stockErr.message?.includes('Stock insuffisant')) {
        const details = stockErr.message?.includes('|')
          ? stockErr.message.split('|').filter(Boolean)
          : [stockErr.message ?? 'Stock insuffisant'];
        return NextResponse.json(
          { error: 'Stock insuffisant', details },
          { status: 409 }
        );
      }
      // P0001 = journée non saisie
      if (stockErr.code === 'P0001' || stockErr.message?.includes('production du jour')) {
        return NextResponse.json(
          { error: 'La production du jour n\'a pas encore été saisie. Impossible de commander.' },
          { status: 409 }
        );
      }
      console.error('[POST /api/orders] stock check RPC error:', stockErr);
      return NextResponse.json({ error: 'Erreur vérification stock' }, { status: 500 });
    }

    const commande = { id: commandeId as string };

    // Email de confirmation (non bloquant)
    try {
      const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const internalSecret = process.env.INTERNAL_API_SECRET ?? '';

      if (!appUrl) {
        console.warn('[POST /api/orders] NEXT_PUBLIC_APP_URL non défini — email de confirmation non envoyé');
      } else if (!internalSecret) {
        console.warn('[POST /api/orders] INTERNAL_API_SECRET non défini — email de confirmation non envoyé');
      } else {
        const emailRes = await fetch(`${appUrl}/api/orders/confirm-email`, {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-internal-secret': internalSecret,
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
        if (!emailRes.ok) {
          const body = await emailRes.text().catch(() => '');
          console.error(`[POST /api/orders] confirm-email HTTP ${emailRes.status}:`, body.slice(0, 300));
        }
      }
    } catch (emailErr) {
      console.error('[POST /api/orders] email error (non-bloquant):', emailErr);
    }

    // Notification push temps réel au boulanger (non bloquant)
    const appUrl2        = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const internalSecret2 = process.env.INTERNAL_API_SECRET ?? '';
    if (appUrl2 && internalSecret2) {
      const montantFormate = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant_final);
      fetch(`${appUrl2}/api/notifications/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret2 },
        body: JSON.stringify({
          boulangerie_id: boulangerie.id,
          payload: {
            title: `🛒 Nouvelle commande — ${montantFormate}`,
            body:  `${sanitizedData.client_prenom} · retrait à ${sanitizedData.heure_retrait}`,
            url:   '/boulanger/commandes',
            tag:   'nouvelle-commande',
          },
        }),
      }).catch(e => console.warn('[POST /api/orders] push non envoyé:', e));
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
  const boulangerieId    = searchParams.get('boulangerie_id');
  const date             = searchParams.get('date');

  if (!boulangerieId) {
    return NextResponse.json({ error: 'boulangerie_id requis' }, { status: 400 });
  }

  if (!isValidUUID(boulangerieId)) {
    return NextResponse.json({ error: 'boulangerie_id invalide' }, { status: 400 });
  }

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