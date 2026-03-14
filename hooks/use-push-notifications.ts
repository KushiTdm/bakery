'use client';

import { useEffect, useState, useCallback } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);

  // ArrayBuffer strict (pas ArrayBufferLike) → compatible BufferSource
  const buffer  = new ArrayBuffer(raw.length);
  const arr     = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

interface UsePushNotificationsReturn {
  isSupported:  boolean;
  permission:   NotificationPermission | 'loading';
  isSubscribed: boolean;
  isLoading:    boolean;
  subscribe:    () => Promise<boolean>;
  unsubscribe:  () => Promise<boolean>;
}

export function usePushNotifications(token: string | null): UsePushNotificationsReturn {
  const [isSupported, setIsSupported]   = useState(false);
  const [permission, setPermission]     = useState<NotificationPermission | 'loading'>('loading');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [swReg, setSwReg]               = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager'  in window)
    ) {
      setIsSupported(false);
      setPermission('denied');
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    navigator.serviceWorker.ready.then(reg => {
      setSwReg(reg);
      reg.pushManager.getSubscription().then(sub => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !token || !VAPID_PUBLIC_KEY) return false;
    setIsLoading(true);
    try {
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== 'granted') return false;

      const reg = swReg ?? await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });

      if (res.ok) { setIsSubscribed(true); return true; }
      await sub.unsubscribe();
      return false;
    } catch (err) {
      console.error('[usePushNotifications] subscribe:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, token, swReg]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    setIsLoading(true);
    try {
      const reg = swReg ?? await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setIsSubscribed(false); return true; }

      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });

      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('[usePushNotifications] unsubscribe:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [token, swReg]);

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}