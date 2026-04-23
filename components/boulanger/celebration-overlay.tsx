'use client';
// components/boulanger/celebration-overlay.tsx
// ─────────────────────────────────────────────────────────────
// Overlay de célébration affiché après une clôture réussie :
//   - Confetti canvas plein écran (canvas-confetti, client-only)
//   - Modal framer-motion avec staggered children
//   - Résume XP gagnés, défis réussis, streak, nouveaux badges
//
// Usage :
//   <CelebrationOverlay
//     open={showCelebration}
//     result={resolveResult}
//     onClose={() => setShowCelebration(false)}
//   />
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Sparkles, Trophy, X, Zap } from 'lucide-react';
import { BADGES, levelLabel } from '@/lib/gamification';

export interface CelebrationResult {
  xpEarned:     number;
  newBadges:    string[];
  defisReussis: number;
  totalDefis:   number;
  streak:       number;
  streakDelta:  number;
  niveau:       number;
  xpTotal:      number;
}

interface CelebrationOverlayProps {
  open:    boolean;
  result:  CelebrationResult | null;
  onClose: () => void;
}

const CONFETTI_COLORS = ['#C19A6B', '#F5A623', '#4ADE80', '#E2A744', '#D4891A'];

export function CelebrationOverlay({ open, result, onClose }: CelebrationOverlayProps) {
  const firedRef = useRef(false);

  // Canvas-confetti : déclenché une seule fois par ouverture
  useEffect(() => {
    if (!open || !result) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const confetti = (await import('canvas-confetti')).default;
        if (cancelled) return;

        const bigBurst =
          result.newBadges.length > 0 ||
          result.streakDelta > 0 ||
          result.defisReussis === result.totalDefis && result.totalDefis > 0;

        // Petite salve initiale
        confetti({
          particleCount: 60,
          spread:        70,
          origin:        { y: 0.7 },
          colors:        CONFETTI_COLORS,
          disableForReducedMotion: true,
        });

        // Gros burst si progression notable
        if (bigBurst) {
          setTimeout(() => {
            if (cancelled) return;
            // Burst côté gauche
            confetti({
              particleCount: 80,
              angle:         60,
              spread:        70,
              origin:        { x: 0, y: 0.6 },
              colors:        CONFETTI_COLORS,
              disableForReducedMotion: true,
            });
            // Burst côté droit
            confetti({
              particleCount: 80,
              angle:         120,
              spread:        70,
              origin:        { x: 1, y: 0.6 },
              colors:        CONFETTI_COLORS,
              disableForReducedMotion: true,
            });
          }, 250);
        }
      } catch {
        // canvas-confetti indisponible (SSR), on ignore
      }
    })();

    return () => { cancelled = true; };
  }, [open, result]);

  if (!result) return null;

  const allDefisReussis = result.totalDefis > 0 && result.defisReussis === result.totalDefis;
  const badgeDefs = result.newBadges
    .map(id => BADGES.find(b => b.id === id))
    .filter(Boolean) as typeof BADGES;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-md rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #2A1A12 0%, #1A0F0A 100%)',
              border:     '1px solid rgba(193,154,107,0.25)',
              boxShadow:  '0 20px 60px rgba(0,0,0,0.6), 0 0 80px rgba(193,154,107,0.15)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center z-10 hover:bg-white/10 transition-colors"
              aria-label="Fermer"
            >
              <X size={16} className="text-white/60" />
            </button>

            {/* Bandeau hero */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="px-6 pt-8 pb-4 text-center"
              style={{
                background: 'linear-gradient(180deg, rgba(193,154,107,0.18), transparent)',
              }}
            >
              <motion.div
                animate={{ rotate: [0, -6, 6, -4, 4, 0] }}
                transition={{ duration: 0.9, delay: 0.2 }}
                className="text-5xl mb-2"
              >
                {allDefisReussis ? '🏆' : result.defisReussis > 0 ? '🎯' : '🌙'}
              </motion.div>
              <h2
                className="text-2xl text-white font-bold"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {allDefisReussis
                  ? 'Journée parfaite !'
                  : result.defisReussis > 0
                    ? 'Bravo !'
                    : 'Journée clôturée'}
              </h2>
              <p className="text-white/60 text-sm mt-1">
                {result.xpEarned > 0
                  ? `Vous venez de gagner ${result.xpEarned} XP`
                  : 'Continuez demain pour grappiller de l\'XP'}
              </p>
            </motion.div>

            {/* Stats */}
            <div className="px-6 pb-6 space-y-3">
              {/* Défis */}
              {result.totalDefis > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 }}
                  className="rounded-2xl p-4 border flex items-center gap-3"
                  style={{
                    background: allDefisReussis
                      ? 'linear-gradient(135deg, rgba(74,222,128,0.12), rgba(74,222,128,0.04))'
                      : 'rgba(255,255,255,0.03)',
                    borderColor: allDefisReussis ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.07)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: allDefisReussis
                        ? 'rgba(74,222,128,0.2)'
                        : 'rgba(193,154,107,0.15)',
                    }}
                  >
                    <Trophy size={18} className={allDefisReussis ? 'text-[#4ADE80]' : 'text-[#C19A6B]'} />
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold">
                      {result.defisReussis}/{result.totalDefis} défis réussis
                    </p>
                    <p className="text-white/40 text-[11px] mt-0.5">
                      {allDefisReussis
                        ? 'Sans faute aujourd\'hui 🎯'
                        : result.defisReussis > 0
                          ? 'Continuez sur cette lancée'
                          : 'Les défis de demain sont prêts'}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* XP */}
              {result.xpEarned > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-2xl p-4 border flex items-center gap-3"
                  style={{
                    background:  'linear-gradient(135deg, rgba(245,166,35,0.10), rgba(245,166,35,0.03))',
                    borderColor: 'rgba(245,166,35,0.20)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(245,166,35,0.18)' }}
                  >
                    <Zap size={18} className="text-[#F5A623]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold">
                      +{result.xpEarned} XP
                      <span className="text-white/40 text-[11px] font-normal ml-2">
                        ({result.xpTotal} total)
                      </span>
                    </p>
                    <p className="text-white/40 text-[11px] mt-0.5">
                      Niveau {result.niveau} — {levelLabel(result.niveau)}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Streak */}
              {result.streak > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 }}
                  className="rounded-2xl p-4 border flex items-center gap-3"
                  style={{
                    background: result.streakDelta > 0
                      ? 'linear-gradient(135deg, rgba(226,85,85,0.12), rgba(245,166,35,0.08))'
                      : 'rgba(255,255,255,0.03)',
                    borderColor: result.streakDelta > 0
                      ? 'rgba(245,166,35,0.25)'
                      : 'rgba(255,255,255,0.07)',
                  }}
                >
                  <motion.div
                    animate={result.streakDelta > 0 ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(226,85,85,0.18)' }}
                  >
                    <Flame size={18} className="text-[#E25555]" />
                  </motion.div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold">
                      {result.streak} jour{result.streak > 1 ? 's' : ''} de streak
                      {result.streakDelta > 0 && (
                        <span className="text-[#F5A623] text-[11px] font-normal ml-2">
                          (+{result.streakDelta})
                        </span>
                      )}
                    </p>
                    <p className="text-white/40 text-[11px] mt-0.5">
                      {result.streakDelta > 0
                        ? 'Clôtures consécutives — tenez bon !'
                        : 'Continuez demain pour avancer'}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Nouveaux badges */}
              {badgeDefs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="rounded-2xl p-4 border"
                  style={{
                    background:  'linear-gradient(135deg, rgba(193,154,107,0.12), rgba(193,154,107,0.02))',
                    borderColor: 'rgba(193,154,107,0.25)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={14} className="text-[#C19A6B]" />
                    <p className="text-white/80 text-xs uppercase tracking-wider font-semibold">
                      Nouveau{badgeDefs.length > 1 ? 'x' : ''} badge{badgeDefs.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {badgeDefs.map((b, i) => (
                      <motion.div
                        key={b.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + i * 0.08, type: 'spring' }}
                        className="rounded-xl p-3 bg-white/5 text-center"
                      >
                        <div className="text-2xl mb-1">{b.emoji}</div>
                        <p className="text-white text-[11px] font-semibold leading-tight">
                          {b.nom}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* CTA */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                onClick={onClose}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #C19A6B, #A9855A)',
                  boxShadow:  '0 4px 14px rgba(193,154,107,0.35)',
                }}
              >
                Continuer
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
