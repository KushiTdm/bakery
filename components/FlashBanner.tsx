'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, X, ShoppingBag, ChevronRight } from 'lucide-react';
import type { ActiveTab } from '@/context/active-tab-context';
import { useFlashPaniers } from '@/hooks/use-flash-paniers';

interface FlashBannerProps {
  activeTab:    ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

type BannerState = 'hidden' | 'teaser' | 'live';

function useBannerState(heureDebut: number, heureFin: number, nbPaniers: number) {
  const [state, setState]       = useState<BannerState>('hidden');
  const [timeLeft, setTimeLeft] = useState('');
  const warningHour             = heureDebut - 3;

  useEffect(() => {
    const check = () => {
      const now  = new Date();
      const hour = now.getHours();

      if (hour >= heureFin || hour < warningHour) {
        setState('hidden');
        return;
      }

      const buildCountdown = (target: Date) => {
        const diff = Math.max(0, target.getTime() - now.getTime());
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
      };

      if (hour >= heureDebut) {
        setState('live');
        const end = new Date();
        end.setHours(heureFin, 0, 0, 0);
        setTimeLeft(buildCountdown(end));
      } else {
        setState('teaser');
        const launch = new Date();
        launch.setHours(heureDebut, 0, 0, 0);
        setTimeLeft(buildCountdown(launch));
      }
    };

    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [heureDebut, heureFin, warningHour]);

  return { state, timeLeft };
}

export default function FlashBanner({ activeTab, setActiveTab }: FlashBannerProps) {
  const { data, loading }          = useFlashPaniers();
  const { heureDebut, heureFin, nbPaniers, remise } = data;
  const { state, timeLeft }        = useBannerState(heureDebut, heureFin, nbPaniers);
  const [dismissed, setDismissed]  = useState(false);

  // Reset dismissed à chaque changement d'état
  useEffect(() => { setDismissed(false); }, [state]);

  // Ne pas afficher pendant le chargement initial ou si dismissed
  if (loading || state === 'hidden' || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={state}
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0,   opacity: 1 }}
        exit={{   y: -60,  opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 220 }}
        className="fixed top-20 left-0 right-0 z-40 px-4 sm:px-8 lg:px-0 lg:max-w-3xl lg:mx-auto"
      >
        {state === 'teaser' ? (
          <div className="relative overflow-hidden rounded-2xl shadow-xl">
            <div className="absolute inset-0 bg-[#2C1810]" />
            <div
              className="absolute inset-0 opacity-20"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23C19A6B\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
            />
            <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="bg-[#C19A6B]/20 rounded-xl p-2 flex-shrink-0">
                <Clock size={18} className="text-[#C19A6B]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Ce soir à {heureDebut}h — Paniers Invendus −{remise}%
                </p>
                <p className="text-white/55 text-xs mt-0.5">
                  Nos invendus du jour à prix réduit · disponibles dans{' '}
                  <span className="font-mono font-semibold text-white/80">{timeLeft}</span>
                </p>
              </div>
              <button onClick={() => setDismissed(true)} className="text-white/30 hover:text-white/70 transition-colors ml-1 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          /* ── LIVE ─────────────────────────────────────────── */
          <div className="relative overflow-hidden rounded-2xl shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-[#8B4513] via-[#C19A6B] to-[#8B4513]" />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5">
              <motion.div
                animate={{ scale: [1, 1.15, 1], rotate: [0, -8, 8, 0] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                className="bg-yellow-400 rounded-xl p-2 flex-shrink-0"
              >
                <Zap size={18} className="text-[#2C1810] fill-current" />
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Flash Invendus — Maintenant !
                  </span>
                  {nbPaniers > 0 ? (
                    <span className="bg-yellow-400 text-[#2C1810] text-xs font-black px-2 py-0.5 rounded-full">
                      {nbPaniers} produit{nbPaniers > 1 ? 's' : ''} disponible{nbPaniers > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      Épuisé
                    </span>
                  )}
                </div>
                <p className="text-white/70 text-xs mt-0.5">
                  −{remise}% · Premier arrivé, premier servi · Jusqu'à {heureFin}h · {timeLeft} restant
                </p>
              </div>

              {nbPaniers > 0 && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab('commander')}
                  className="flex-shrink-0 bg-white text-[#2C1810] px-3 py-2 rounded-xl font-bold text-xs hover:bg-yellow-400 transition-colors flex items-center gap-1.5"
                >
                  <ShoppingBag size={13} />
                  <span className="hidden sm:inline">Voir les paniers</span>
                  <ChevronRight size={13} />
                </motion.button>
              )}

              <button onClick={() => setDismissed(true)} className="text-white/40 hover:text-white transition-colors ml-1 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}