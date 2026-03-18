'use client';

import { motion } from 'framer-motion';
import { Bell, BellOff, AlertCircle, Smartphone } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';

interface ClientPushToggleProps {
  token:           string | null;
  boulangerieSlug: string;
}

export default function ClientPushToggle({ token, boulangerieSlug }: ClientPushToggleProps) {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    errorMessage,
    subscribe,
    unsubscribe,
  } = usePushNotifications(token, boulangerieSlug);

  // Navigateur ne supporte pas du tout les push
  if (!isSupported && error === 'sw_unsupported') return null;
  if (error === 'vapid_missing') return null;

  // Permission bloquée dans les réglages navigateur
  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#F5F0E8] border border-[#E8E0D5] rounded-xl text-xs text-[#2C1810]/50">
        <BellOff size={13} className="flex-shrink-0" />
        <span>Notifications bloquées dans votre navigateur</span>
      </div>
    );
  }

  // Navigateur incompatible (Brave, réseau restreint…)
  if (error === 'browser_incompatible') {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2.5 px-3 py-3 bg-[#F5F0E8] border border-[#E8E0D5] rounded-xl">
          <Smartphone size={14} className="text-[#2C1810]/40 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#2C1810]/70 text-sm font-medium">
              Notifications non disponibles sur ce navigateur
            </p>
            <p className="text-[#2C1810]/45 text-xs mt-0.5 leading-relaxed">
              Utilisez <strong>Chrome</strong>, <strong>Firefox</strong> ou{' '}
              <strong>Safari</strong> pour recevoir les alertes paniers flash.
            </p>
          </div>
        </div>
        <button
          onClick={subscribe}
          disabled={isLoading}
          className="text-[#C19A6B]/70 text-xs hover:text-[#C19A6B] transition-colors underline underline-offset-2"
        >
          Réessayer quand même
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={isLoading || !token || permission === 'loading'}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all ${
          isSubscribed
            ? 'bg-[#C19A6B]/12 border-[#C19A6B]/25 hover:bg-[#C19A6B]/18'
            : 'bg-[#F5F0E8] border-[#E8E0D5] hover:bg-[#EDE8E0]'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div className={`flex-shrink-0 ${isLoading ? 'opacity-50' : ''}`}>
          {isSubscribed ? (
            <span className="relative text-lg">
              🔔
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#C19A6B] rounded-full animate-pulse" />
            </span>
          ) : (
            <Bell size={18} className="text-[#2C1810]/50" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isSubscribed ? 'text-[#C19A6B]' : 'text-[#2C1810]/70'}`}>
            {isSubscribed ? 'Alertes paniers activées' : 'Alertes paniers flash'}
          </p>
          <p className="text-[#2C1810]/45 text-xs mt-0.5">
            {isSubscribed
              ? 'Vous serez notifié à chaque nouveau panier invendu'
              : 'Être prévenu dès qu\'un panier flash est disponible'
            }
          </p>
        </div>

        <div className="flex-shrink-0">
          {isLoading || permission === 'loading' ? (
            <div className="w-4 h-4 border-2 border-[#C19A6B]/30 border-t-[#C19A6B] rounded-full animate-spin" />
          ) : (
            <div className={`w-9 h-5 rounded-full transition-colors flex items-center ${
              isSubscribed ? 'bg-[#C19A6B] justify-end' : 'bg-[#2C1810]/15 justify-start'
            } px-0.5`}>
              <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
            </div>
          )}
        </div>
      </motion.button>

      {/* Erreurs techniques */}
      {error && !['permission_denied', 'browser_incompatible'].includes(error) && errorMessage && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}