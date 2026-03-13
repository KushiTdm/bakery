
'use client';

// components/boulanger/push-notification-toggle.tsx
// ─────────────────────────────────────────────────────────────
// Bouton on/off pour les notifications push.
// À placer dans /boulanger/parametres ou dans le header.
//
// Usage :
//   <PushNotificationToggle token={session?.access_token} />
// ─────────────────────────────────────────────────────────────

import { usePushNotifications } from '@/hooks/use-push-notifications';

interface Props {
  token: string | null;
}

export default function PushNotificationToggle({ token }: Props) {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications(token);

  if (!isSupported) return null;
  if (permission === 'loading') return null;

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
        <span className="text-xl">🔕</span>
        <div>
          <p className="text-white text-sm font-medium">Notifications bloquées</p>
          <p className="text-white/40 text-xs">Autorisez-les dans les paramètres du navigateur</p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all ${
        isSubscribed
          ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
          : 'bg-white/5 border-white/10 hover:bg-white/10'
      }`}
    >
      <span className="text-xl">{isSubscribed ? '🔔' : '🔕'}</span>
      <div className="text-left flex-1">
        <p className="text-white text-sm font-medium">
          {isSubscribed ? 'Notifications activées' : 'Activer les notifications'}
        </p>
        <p className="text-white/40 text-xs">
          {isSubscribed
            ? 'Vous recevez les nouvelles commandes en temps réel'
            : 'Soyez alerté à chaque nouvelle commande click & collect'
          }
        </p>
      </div>
      {isLoading && (
        <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      )}
      {!isLoading && isSubscribed && (
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      )}
    </button>
  );
}