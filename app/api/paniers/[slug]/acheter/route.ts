// app/api/paniers/[slug]/acheter/route.ts
// ─────────────────────────────────────────────────────────────
// POST — achat flash atomique (client authentifié)
//
// Workflow :
//   1. Auth client JWT
//   2. Vérifier client non bloqué
//   3. Décrémentation atomique via RPC (SELECT FOR UPDATE implicite)
//   4. Création commande type='anti_gaspi'
//   5. Email confirmation + push boulanger (non-bloquant)
//
// Concurrence : la RPC `acheter_paniers_flash` est transactionnelle.
// Si deux clients achètent le dernier panier simultanément,
// un seul réussit — l'autre reçoit 409.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isMemoryRateLimited } from '@/lib/rate-limit';

const AchatSchema = z.object({
  panier_complet: z.boolean().optional(),
  produit_ids:    z.array(z.string().min(1).max(100)).min(1).max(30).optional(),
}).refine(
  d => d.panier_complet || (d.produit_ids && d.produit_ids.length > 0),
  { message: 'panier_complet ou produit_ids requis' }
);

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug || slug.length > 60) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
  }

  // ── Auth client (JWT Supabase) ────────────────────────────
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }

  // ── Rate limit (3 achats flash/heure par IP) ──────────────
  const clientIp = getClientIp(req);
  const ipLimited = await isMemoryRateLimited(
    `flash-achat:${clientIp}`,
    { windowMs: 60 * 60 * 1000, maxCalls: 3 }
  );
  if (ipLimited) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  // ── Parse body ────────────────────────────────────────────
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  const parsed = AchatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // ── Résoudre la boulangerie ──────────────────────────────
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id, actif, timezone, penalite_active, flash_heure_fin')
      .eq('slug', slug)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }
    if (!boulangerie.actif) {
      return NextResponse.json({ error: 'Boulangerie non active' }, { status: 403 });
    }

    // ── Vérifier client non bloqué ───────────────────────────
    if (boulangerie.penalite_active) {
      const { data: penalite } = await admin
        .from('client_penalites')
        .select('bloque')
        .eq('boulangerie_id', boulangerie.id)
        .eq('client_email', user.email?.toLowerCase())
        .single();

      if (penalite?.bloque) {
        return NextResponse.json(
          { error: 'Votre compte est suspendu suite à des commandes non récupérées. Contactez la boulangerie.' },
          { status: 403 }
        );
      }
    }

    // ── Résoudre les produit_ids ─────────────────────────────
    const tz = boulangerie.timezone ?? 'Europe/Paris';
    const todayLocal = new Date().toLocaleDateString('sv-SE', { timeZone: tz });

    let produitIds = parsed.data.produit_ids;

    if (parsed.data.panier_complet) {
      // Récupérer tous les produits flash actifs du jour avec stock
      const { data: paniers } = await admin
        .from('paniers_flash')
        .select('produit_id')
        .eq('boulangerie_id', boulangerie.id)
        .eq('date', todayLocal)
        .eq('actif', true)
        .gt('quantite_restante', 0);

      if (!paniers || paniers.length === 0) {
        return NextResponse.json({ error: 'Aucun panier flash disponible' }, { status: 409 });
      }
      produitIds = paniers.map(p => p.produit_id);
    }

    if (!produitIds || produitIds.length === 0) {
      return NextResponse.json({ error: 'Aucun produit sélectionné' }, { status: 400 });
    }

    // ── Achat atomique via RPC ───────────────────────────────
    const { data: rpcResult, error: rpcErr } = await admin.rpc('acheter_paniers_flash', {
      p_boulangerie_id: boulangerie.id,
      p_date:           todayLocal,
      p_produit_ids:    produitIds,
    });

    if (rpcErr) {
      // P0002 = produit épuisé (RAISE EXCEPTION dans la RPC)
      if (rpcErr.code === 'P0002' || rpcErr.message?.includes('épuisé')) {
        return NextResponse.json(
          { error: 'Un ou plusieurs produits sont épuisés.' },
          { status: 409 }
        );
      }
      console.error('[POST acheter]', rpcErr);
      return NextResponse.json({ error: 'Erreur lors de l\'achat' }, { status: 500 });
    }

    const items = (rpcResult ?? []) as Array<{
      produit_id: string; produit_nom: string; emoji: string;
      categorie: string; prix_original: number; prix_flash: number;
    }>;

    if (items.length === 0) {
      return NextResponse.json({ error: 'Aucun produit disponible' }, { status: 409 });
    }

    // ── Créer la commande ────────────────────────────────────
    const lignes = items.map(item => ({
      produit_id:    item.produit_id,
      produit_nom:   `${item.emoji} ${item.produit_nom} (Flash)`,
      quantite:      1,
      prix_unitaire: item.prix_flash,
    }));

    const montant_total = lignes.reduce((s, l) => s + l.prix_unitaire, 0);
    const montant_final = Math.round(Math.min(montant_total, 99999.99) * 100) / 100;

    // Heure de retrait = heure fin flash
    const heureFin = boulangerie.flash_heure_fin ?? 20;
    const heureRetrait = `${String(heureFin).padStart(2, '0')}:00`;

    // Récupérer le prénom du profil client
    const { data: profil } = await admin
      .from('profils_clients')
      .select('prenom, telephone')
      .eq('user_id', user.id)
      .single();

    const clientPrenom = profil?.prenom ?? user.user_metadata?.prenom ?? 'Client';

    const { data: commande, error: cmdErr } = await admin
      .from('commandes')
      .insert({
        boulangerie_id: boulangerie.id,
        client_prenom:  clientPrenom,
        client_email:   user.email!,
        client_telephone: profil?.telephone ?? null,
        heure_retrait:  heureRetrait,
        montant_total:  montant_final,
        statut:         'confirmee', // Flash = confirmation automatique
        type:           'anti_gaspi',
        lignes,
      })
      .select('id, created_at')
      .single();

    if (cmdErr || !commande) {
      console.error('[POST acheter] insert commande:', cmdErr);
      return NextResponse.json({ error: 'Erreur création commande' }, { status: 500 });
    }

    // ── Email confirmation (non-bloquant) ────────────────────
    const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const internalSecret = process.env.INTERNAL_API_SECRET ?? '';
    if (appUrl && internalSecret) {
      fetch(`${appUrl}/api/orders/confirm-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({
          commande_id:   commande.id,
          client_prenom: clientPrenom,
          client_email:  user.email,
          heure_retrait: heureRetrait,
          lignes,
          montant_total: montant_final,
        }),
      }).catch(e => console.warn('[POST acheter] email non envoyé:', e));
    }

    // ── Push notification boulanger (non-bloquant) ───────────
    if (appUrl && internalSecret) {
      const montantFormate = new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: 'EUR',
      }).format(montant_final);

      fetch(`${appUrl}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({
          boulangerie_id: boulangerie.id,
          payload: {
            title: `⚡ Panier flash acheté — ${montantFormate}`,
            body:  `${clientPrenom} · retrait à ${heureRetrait}`,
            url:   '/boulanger/commandes',
            tag:   'achat-flash',
          },
        }),
      }).catch(e => console.warn('[POST acheter] push non envoyé:', e));
    }

    return NextResponse.json({
      success:     true,
      commande_id: commande.id,
      items:       items.map(i => ({ nom: i.produit_nom, prix: i.prix_flash })),
      montant:     montant_final,
      retrait:     heureRetrait,
    }, { status: 201 });

  } catch (err) {
    console.error('[POST acheter]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
