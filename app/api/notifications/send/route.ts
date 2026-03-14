import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

interface PushPayload {
  title:  string;
  body:   string;
  icon?:  string;
  badge?: string;
  url?:   string;
  tag?:   string;
}

// Interface locale qui couvre les méthodes utilisées de web-push
interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface WebPushModule {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (sub: WebPushSubscription, payload: string) => Promise<unknown>;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== process.env.INTERNAL_API_SECRET && process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const { boulangerie_id, payload }: { boulangerie_id: string; payload: PushPayload } =
      await req.json();

    if (!boulangerie_id || !payload?.title) {
      return NextResponse.json({ error: 'boulangerie_id et payload.title requis' }, { status: 400 });
    }

    // Import dynamique casté via l'interface locale — TS7016 résolu
    let webpush: WebPushModule;
    try {
      webpush = (await import('web-push')) as unknown as WebPushModule;
    } catch {
      return NextResponse.json(
        { error: 'web-push non installé. Lancez : npm install web-push' },
        { status: 500 }
      );
    }

    const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidContact = process.env.VAPID_CONTACT_EMAIL ?? 'mailto:contact@artisandore.fr';

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json(
        { error: 'Clés VAPID manquantes (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)' },
        { status: 500 }
      );
    }

    webpush.setVapidDetails(vapidContact, vapidPublic, vapidPrivate);

    const admin = getSupabaseAdmin();
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('boulangerie_id', boulangerie_id);

    if (error || !subs?.length) {
      return NextResponse.json({ sent: 0, message: 'Aucun abonné' });
    }

    const notification = JSON.stringify({
      title:  payload.title,
      body:   payload.body,
      icon:   payload.icon  ?? '/icons/icon-192x192.png',
      badge:  payload.badge ?? '/icons/badge-72x72.png',
      url:    payload.url   ?? '/boulanger',
      tag:    payload.tag   ?? 'commande',
    });

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          notification
        )
      )
    );

    // Nettoyage des abonnements expirés (410 Gone)
    const expired: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const err = result.reason as { statusCode?: number };
        if (err?.statusCode === 410) expired.push(subs[i].endpoint);
      }
    });

    if (expired.length > 0) {
      await admin.from('push_subscriptions').delete().in('endpoint', expired);
    }

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({ sent, failed, expired: expired.length });

  } catch (err) {
    console.error('[notifications/send]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}