// app/api/notifications/subscribe/route.ts
// ─────────────────────────────────────────────────────────────
// POST → sauvegarde une PushSubscription Supabase
// DELETE → supprime l'abonnement (désactivation)
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

// ── POST — Enregistre ou met à jour l'abonnement ────────────
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const { user, admin } = auth;

    const { subscription } = await req.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Subscription invalide' }, { status: 400 });
    }

    // Récupère le boulangerie_id
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    // Upsert de l'abonnement (1 par endpoint unique)
    const { error: upsertError } = await admin
      .from('push_subscriptions')
      .upsert(
        {
          boulangerie_id: boulangerie.id,
          user_id:        user.id,
          endpoint:       subscription.endpoint,
          p256dh:         subscription.keys?.p256dh ?? null,
          auth_key:       subscription.keys?.auth ?? null,
          subscription:   subscription, // JSONB complet
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (upsertError) {
      console.error('[subscribe POST]', upsertError);
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[subscribe POST] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── DELETE — Supprime l'abonnement ──────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const { user, admin } = auth;

    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: 'endpoint requis' }, { status: 400 });

    await admin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[subscribe DELETE]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}