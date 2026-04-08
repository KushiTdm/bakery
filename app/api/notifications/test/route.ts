// app/api/notifications/test/route.ts
// Envoie une notification de test à l'utilisateur connecté
// pour vérifier que la chaîne complète fonctionne.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface WebPushModule {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (sub: WebPushSubscription, payload: string) => Promise<unknown>;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }

  // Trouver les subscriptions de cet utilisateur
  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('user_id', user.id);

  if (subsError) {
    console.error('[notifications/test] Erreur DB:', subsError);
    return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 });
  }

  if (!subs?.length) {
    return NextResponse.json({
      error: 'Aucun abonnement push trouvé pour cet utilisateur. Activez les notifications dans les paramètres.',
      no_subscription: true,
    }, { status: 404 });
  }

  // Charger web-push
  let webpush: WebPushModule;
  try {
    webpush = (await import('web-push')) as unknown as WebPushModule;
  } catch {
    return NextResponse.json({ error: 'web-push non installé' }, { status: 500 });
  }

  const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidContact = process.env.VAPID_CONTACT_EMAIL ?? 'mailto:contact@artisandore.fr';

  if (!vapidPublic || !vapidPrivate) {
    console.error('[notifications/test] Clés VAPID manquantes');
    return NextResponse.json({
      error: 'Clés VAPID non configurées (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)',
      config_error: true,
    }, { status: 500 });
  }

  webpush.setVapidDetails(vapidContact, vapidPublic, vapidPrivate);

  const notification = JSON.stringify({
    title: '✅ Test réussi — Sauve Mie',
    body:  'Les notifications fonctionnent ! Vous recevrez les alertes commandes.',
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    url:   '/boulanger',
    tag:   'test-notification',
  });

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        notification,
      )
    )
  );

  // Nettoyage abonnements expirés
  const expired: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number };
      console.error('[notifications/test] Envoi échoué:', err);
      if (err?.statusCode === 410) expired.push(subs[i].endpoint);
    }
  });

  if (expired.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', expired);
  }

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return NextResponse.json({ sent, failed, expired: expired.length });
}
