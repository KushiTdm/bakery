// app/api/notifications/subscribe/route.ts
// ─────────────────────────────────────────────────────────────
// POST → sauvegarde une PushSubscription en base
// DELETE → supprime l'abonnement
//
// Fonctionne pour deux cas :
//   1. Boulanger owner  → boulangerie trouvée via user_id
//   2. Client           → boulangerie trouvée via boulangerie_slug dans le body

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

// ── POST — Enregistre ou met à jour l'abonnement ─────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const { user, admin } = auth;

    let body: { subscription?: unknown; boulangerie_slug?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
    }

    const { subscription, boulangerie_slug } = body;

    if (!subscription || typeof (subscription as Record<string, unknown>).endpoint !== 'string') {
      return NextResponse.json({ error: 'Subscription invalide (endpoint manquant)' }, { status: 400 });
    }

    const sub = subscription as {
      endpoint: string;
      keys?: { p256dh?: string; auth?: string };
    };

    // ── Trouver le boulangerie_id ──────────────────────────────

    let boulangerieId: string | null = null;

    // Cas 1 : boulanger owner → cherche via user_id
    const { data: ownedBoulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (ownedBoulangerie) {
      boulangerieId = ownedBoulangerie.id;
    }

    // Cas 2 : client → cherche via boulangerie_slug fourni dans le body
    if (!boulangerieId && boulangerie_slug) {
      const slug = String(boulangerie_slug).trim().toLowerCase();
      const { data: b } = await admin
        .from('boulangeries')
        .select('id')
        .eq('slug', slug)
        .eq('actif', true)
        .single();
      if (b) boulangerieId = b.id;
    }

    // Cas 3 : employé actif → cherche via employes
    if (!boulangerieId) {
      const { data: employe } = await admin
        .from('employes')
        .select('boulangerie_id')
        .eq('user_id', user.id)
        .eq('statut', 'actif')
        .single();
      if (employe) boulangerieId = employe.boulangerie_id;
    }

    if (!boulangerieId) {
      return NextResponse.json(
        {
          error: 'Boulangerie introuvable. Fournissez boulangerie_slug dans le body pour les clients.',
        },
        { status: 404 }
      );
    }

    // ── Upsert de l'abonnement ─────────────────────────────────

    const { error: upsertError } = await admin
      .from('push_subscriptions')
      .upsert(
        {
          boulangerie_id: boulangerieId,
          user_id:        user.id,
          endpoint:       sub.endpoint,
          p256dh:         sub.keys?.p256dh ?? null,
          auth_key:       sub.keys?.auth   ?? null,
          subscription:   subscription,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (upsertError) {
      console.error('[subscribe POST] upsert error:', upsertError);
      return NextResponse.json(
        { error: `Erreur sauvegarde : ${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, boulangerie_id: boulangerieId });

  } catch (err) {
    console.error('[subscribe POST] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── DELETE — Supprime l'abonnement ────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const { user, admin } = auth;

    let body: { endpoint?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
    }

    const { endpoint } = body;
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint requis' }, { status: 400 });
    }

    // Supprime uniquement l'abonnement de cet utilisateur
    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', user.id);

    if (error) {
      console.error('[subscribe DELETE] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[subscribe DELETE] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}