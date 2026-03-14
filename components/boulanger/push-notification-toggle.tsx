'use client';

import { usePushNotifications } from '@/hooks/use-push-notifications';
import { motion } from 'framer-motion';

interface Props {
  token: string | null;
}

export default function PushNotificationToggle({ token }: Props) {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  } = usePushNotifications(token);

  // Navigateur ne supporte pas les push (Firefox mobile, navigateurs anciens)
  if (!isSupported) return null;

  // En cours de détection initiale
  if (permission === 'loading') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/8 rounded-xl">
        <div className="w-4 h-4 border-2 border-white/20 border-t-[#C19A6B]/60 rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Vérification des notifications…</p>
      </div>
    );
  }

  // Permission refusée par l'utilisateur dans les réglages navigateur
  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
        <span className="text-xl flex-shrink-0">🔕</span>
        <div>
          <p className="text-white text-sm font-medium">Notifications bloquées</p>
          <p className="text-white/40 text-xs mt-0.5">
            Autorisez-les dans les paramètres du navigateur (🔒 → Notifications)
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading || !token}
      aria-pressed={isSubscribed}
      aria-label={isSubscribed ? 'Désactiver les notifications push' : 'Activer les notifications push'}
      className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border transition-all duration-200 text-left ${
        isSubscribed
          ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/15'
          : 'bg-white/5 border-white/10 hover:bg-white/10'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {/* Icône */}
      <div className={`relative flex-shrink-0 text-xl ${isLoading ? 'opacity-50' : ''}`}>
        {isSubscribed ? '🔔' : '🔕'}
        {isSubscribed && !isLoading && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </div>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">
          {isSubscribed ? 'Notifications activées' : 'Activer les notifications push'}
        </p>
        <p className="text-white/40 text-xs mt-0.5 leading-relaxed">
          {isSubscribed
            ? 'Vous êtes alerté en temps réel à chaque nouvelle commande'
            : 'Recevez une alerte sur votre téléphone à chaque commande click & collect'
          }
        </p>
      </div>

      {/* Indicateur de chargement ou toggle visuel */}
      <div className="flex-shrink-0">
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white/20 border-t-[#C19A6B]/60 rounded-full animate-spin" />
        ) : (
          <div className={`w-10 h-6 rounded-full transition-colors duration-300 flex items-center ${
            isSubscribed ? 'bg-green-500 justify-end' : 'bg-white/15 justify-start'
          } px-0.5`}>
            <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
          </div>
        )}
      </div>
    </motion.button>
  );
}