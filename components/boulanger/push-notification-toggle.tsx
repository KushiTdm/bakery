'use client';

import { useState } from 'react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { motion } from 'framer-motion';
import { AlertCircle, Smartphone, Send } from 'lucide-react';

interface Props {
  token: string | null;
}

export default function PushNotificationToggle({ token }: Props) {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    errorMessage,
    subscribe,
    unsubscribe,
  } = usePushNotifications(token);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTest = async () => {
    if (!token) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json() as { sent?: number; failed?: number; error?: string };
      if (res.ok && j.sent && j.sent > 0) {
        setTestResult('Notification envoyée !');
      } else {
        setTestResult(j.error ?? 'Aucune notification envoyée');
      }
    } catch {
      setTestResult('Erreur réseau');
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  // Navigateur ne supporte pas les push (très rare)
  if (!isSupported && error === 'sw_unsupported') return null;

  // Clé VAPID manquante
  if (error === 'vapid_missing') {
    return (
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-amber-300 text-xs">
          Notifications non configurées — variable <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> manquante.
        </p>
      </div>
    );
  }

  // Permission refusée
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

  // Navigateur incompatible (Brave sans FCM, réseau restreint…)
  if (error === 'browser_incompatible') {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl">
          <Smartphone size={16} className="text-white/40 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white/70 text-sm font-medium">
              Notifications non disponibles sur ce navigateur
            </p>
            <p className="text-white/35 text-xs mt-1 leading-relaxed">
              Votre navigateur bloque le service de notifications push.
              Essayez avec <strong className="text-white/55">Chrome</strong>,{' '}
              <strong className="text-white/55">Firefox</strong> ou{' '}
              <strong className="text-white/55">Safari</strong> pour activer cette fonctionnalité.
            </p>
          </div>
        </div>
        <button
          onClick={subscribe}
          disabled={isLoading}
          className="text-[#C19A6B]/60 text-xs hover:text-[#C19A6B] transition-colors underline underline-offset-2"
        >
          Réessayer quand même
        </button>
      </div>
    );
  }

  // Chargement initial
  if (permission === 'loading') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/8 rounded-xl">
        <div className="w-4 h-4 border-2 border-white/20 border-t-[#C19A6B]/60 rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Vérification…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={isLoading || !token}
        aria-pressed={isSubscribed}
        className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border transition-all duration-200 text-left ${
          isSubscribed
            ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/15'
            : 'bg-white/5 border-white/10 hover:bg-white/10'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <div className={`relative flex-shrink-0 text-xl ${isLoading ? 'opacity-50' : ''}`}>
          {isSubscribed ? '🔔' : '🔕'}
          {isSubscribed && !isLoading && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">
            {isSubscribed ? 'Notifications activées' : 'Activer les notifications push'}
          </p>
          <p className="text-white/40 text-xs mt-0.5 leading-relaxed">
            {isSubscribed
              ? 'Alerté en temps réel à chaque nouvelle commande'
              : 'Recevez une alerte à chaque commande click & collect'
            }
          </p>
        </div>

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

      {/* Bouton tester — visible quand abonné */}
      {isSubscribed && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70 disabled:opacity-40"
          >
            {testing ? (
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            ) : (
              <Send size={12} />
            )}
            Tester
          </button>
          {testResult && (
            <span className="text-xs text-white/50">{testResult}</span>
          )}
        </div>
      )}

      {/* Info iOS */}
      <p className="text-white/20 text-[10px] leading-relaxed px-1">
        Sur iPhone, installez l&apos;app sur l&apos;écran d&apos;accueil (Partager → Ajouter à l&apos;écran d&apos;accueil) pour recevoir les notifications.
      </p>

      {/* Erreurs autres que permission_denied */}
      {error && error !== 'permission_denied' && errorMessage && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-xs">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
