'use client';

import { useEffect, useState, useCallback } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  const buffer  = new ArrayBuffer(raw.length);
  const arr     = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return buffer;
}

export type PushError =
  | 'vapid_missing'
  | 'sw_unsupported'
  | 'permission_denied'
  | 'subscription_failed'
  | 'browser_incompatible'
  | 'api_error'
  | null;

interface UsePushNotificationsReturn {
  isSupported:  boolean;
  permission:   NotificationPermission | 'loading';
  isSubscribed: boolean;
  isLoading:    boolean;
  error:        PushError;
  errorMessage: string | null;
  subscribe:    () => Promise<boolean>;
  unsubscribe:  () => Promise<boolean>;
}

export function usePushNotifications(
  token: string | null,
  boulangerieSlug?: string,
): UsePushNotificationsReturn {
  const [isSupported, setIsSupported]   = useState(false);
  const [permission, setPermission]     = useState<NotificationPermission | 'loading'>('loading');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState<PushError>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setIsSupported(false);
      setPermission('denied');
      setError('sw_unsupported');
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setIsSupported(false);
      setPermission('denied');
      setError('vapid_missing');
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setIsSubscribed(!!sub))
      .catch(err => console.warn('[push] getSubscription error:', err));
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null);
    setErrorMessage(null);

    if (!isSupported) return false;
    if (!token) { setErrorMessage('Non authentifié'); return false; }
    if (!VAPID_PUBLIC_KEY) { setError('vapid_missing'); return false; }

    setIsLoading(true);

    try {
      // 1. Demander la permission
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== 'granted') {
        setPermission('denied');
        setError('permission_denied');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // 2. Créer la souscription navigateur
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        } catch (err) {
          console.error('[push] pushManager.subscribe error:', err);
          const msg = err instanceof Error ? err.message : '';
          // Brave, réseau restreint, ou push service inaccessible
          if (
            msg.includes('push service error') ||
            msg.includes('Registration failed') ||
            msg.includes('AbortError')
          ) {
            setError('browser_incompatible');
          } else {
            setError('subscription_failed');
            setErrorMessage(msg || 'Erreur inattendue');
          }
          return false;
        }
      }

      // 3. Enregistrer en base via l'API
      const body: Record<string, unknown> = { subscription: sub.toJSON() };
      if (boulangerieSlug) body.boulangerie_slug = boulangerieSlug;

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }

      const data = await res.json().catch(() => ({})) as { error?: string };
      setError('api_error');
      setErrorMessage(data.error ?? `Erreur serveur (${res.status})`);
      await sub.unsubscribe();
      setIsSubscribed(false);
      return false;

    } catch (err) {
      console.error('[push] subscribe unexpected error:', err);
      setError('subscription_failed');
      setErrorMessage('Erreur inattendue');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, token, boulangerieSlug]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setError(null);
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        if (token) {
          fetch('/api/notifications/subscribe', {
            method: 'DELETE',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ endpoint }),
          }).catch(err => console.warn('[push] DELETE error:', err));
        }
      }

      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('[push] unsubscribe error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    errorMessage,
    subscribe,
    unsubscribe,
  };
}