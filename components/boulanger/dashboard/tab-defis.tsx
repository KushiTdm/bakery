'use client';
// components/boulanger/dashboard/tab-defis.tsx
// ───────────────────────────────────────────────────────────────
// Onglet "Défis" — Hub gamification avec streak, XP, défis actifs,
// historique des défis récents, et badges collectionnables.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Star, Trophy, Target, ChevronDown, ChevronUp,
  Zap, Check, X, Lock, Award,
} from 'lucide-react';
import type { Defi, GamificationProfil } from '@/lib/types';
import {
  BADGES, DIFFICULTY_LABELS, DIFFICULTY_COLORS,
  xpForCurrentLevel, levelLabel,
} from '@/lib/gamification';

// ── Streak Banner ────────────────────────────────────────────

function StreakBanner({ streak, streakMax }: { streak: number; streakMax: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 border relative overflow-hidden"
      style={{
        background: streak > 0
          ? 'linear-gradient(135deg, rgba(226,85,85,0.12), rgba(245,166,35,0.08))'
          : 'rgba(255,255,255,0.025)',
        borderColor: streak > 0
          ? 'rgba(245,166,35,0.25)'
          : 'rgba(255,255,255,0.07)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            animate={streak > 0 ? { scale: [1, 1.15, 1] } : {}}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="text-3xl"
          >
            {streak > 0 ? '🔥' : '❄️'}
          </motion.div>
          <div>
            <p className="text-white font-bold text-xl font-mono">
              {streak} jour{streak !== 1 ? 's' : ''}
            </p>
            <p className="text-white/40 text-[10px] mt-0.5">
              {streak > 0 ? 'Streak de clôtures consécutives' : 'Clôturez pour démarrer votre streak'}
            </p>
          </div>
        </div>
        {streakMax > 0 && (
          <div className="text-right">
            <p className="text-[9px] text-white/25 uppercase tracking-wider">Record</p>
            <p className="text-sm font-bold font-mono text-[#F5A623]">{streakMax}j</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── XP Progress Bar ──────────────────────────────────────────

function XPProgress({ profil }: { profil: GamificationProfil }) {
  const { current, needed } = xpForCurrentLevel(profil.xp_total);
  const pct = (current / needed) * 100;
  const label = levelLabel(profil.niveau);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl p-4 border"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm font-mono"
            style={{ background: 'rgba(193,154,107,0.15)', color: '#C19A6B' }}
          >
            {profil.niveau}
          </div>
          <div>
            <p className="text-white/80 text-xs font-semibold">{label}</p>
            <p className="text-white/30 text-[10px]">Niveau {profil.niveau}</p>
          </div>
        </div>
        <p className="text-[10px] font-mono text-white/30">
          {profil.xp_total} XP total
        </p>
      </div>

      {/* XP Bar */}
      <div className="h-2 rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, #C19A6B, #F5A623)',
          }}
        />
      </div>
      <p className="text-[9px] text-white/25 mt-1.5 text-right">
        {current} / {needed} XP pour le niveau {profil.niveau + 1}
      </p>
    </motion.div>
  );
}

// ── Challenge Card ───────────────────────────────────────────

function ChallengeCard({ defi }: { defi: Defi }) {
  const color = DIFFICULTY_COLORS[defi.difficulte];
  const isResolved = defi.statut === 'reussi' || defi.statut === 'echoue';
  const isSuccess = defi.statut === 'reussi';

  // Progress
  let progress = 0;
  if (isResolved) {
    progress = isSuccess ? 100 : 0;
  } else if (defi.valeur_actuelle !== null && defi.valeur_cible > 0) {
    if (defi.comparaison === 'gte' || defi.comparaison === 'gt') {
      progress = Math.min((defi.valeur_actuelle / defi.valeur_cible) * 100, 100);
    } else if (defi.comparaison === 'lte' || defi.comparaison === 'lt') {
      // For "less than" challenges, show inverse progress
      progress = defi.valeur_actuelle <= defi.valeur_cible ? 100 : 50;
    } else {
      progress = defi.valeur_actuelle === defi.valeur_cible ? 100 : 0;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 border relative overflow-hidden"
      style={{
        background: isResolved
          ? isSuccess
            ? 'rgba(61,158,106,0.06)'
            : 'rgba(255,255,255,0.02)'
          : `${color}06`,
        borderColor: isResolved
          ? isSuccess
            ? 'rgba(61,158,106,0.2)'
            : 'rgba(255,255,255,0.06)'
          : `${color}18`,
        opacity: defi.statut === 'echoue' ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Emoji + Status */}
        <div className="relative">
          <span className="text-2xl">{defi.emoji}</span>
          {isResolved && (
            <div
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: isSuccess ? '#3D9E6A' : '#666' }}
            >
              {isSuccess ? <Check size={9} color="white" /> : <X size={9} color="white" />}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-white/85 text-sm font-semibold truncate">{defi.titre}</p>
          </div>
          <p className="text-white/40 text-xs leading-relaxed mb-2.5">{defi.description}</p>

          {/* Progress bar */}
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6 }}
                className="h-full rounded-full"
                style={{
                  background: isResolved
                    ? isSuccess ? '#3D9E6A' : '#666'
                    : color,
                }}
              />
            </div>

            {/* Difficulty + XP */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: `${color}15`, color }}
              >
                {DIFFICULTY_LABELS[defi.difficulte]}
              </span>
              <span
                className="text-[10px] font-bold"
                style={{ color: isSuccess ? '#3D9E6A' : 'rgba(255,255,255,0.3)' }}
              >
                {isSuccess ? '+' : ''}{defi.xp_reward}XP
              </span>
            </div>
          </div>

          {/* Actual value for resolved */}
          {isResolved && defi.valeur_actuelle !== null && (
            <p className="text-[10px] text-white/25 mt-1.5">
              Résultat : {defi.valeur_actuelle}
              {defi.metric_cible.includes('taux') || defi.metric_cible.includes('invendu') ? '%' : ''}
              {defi.metric_cible === 'ca_estime' ? '€' : ''}
              {' '}(cible : {defi.comparaison === 'gte' ? '≥' : defi.comparaison === 'lte' ? '≤' : '='} {defi.valeur_cible}
              {defi.metric_cible.includes('taux') || defi.metric_cible.includes('invendu') ? '%' : ''}
              {defi.metric_cible === 'ca_estime' ? '€' : ''})
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Badge Grid ───────────────────────────────────────────────

function BadgeGrid({ earnedBadges }: { earnedBadges: string[] }) {
  return (
    <div className="rounded-2xl p-4 border"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Award size={14} className="text-[#C19A6B]" />
        <p className="text-xs font-semibold"
          style={{ fontFamily: 'Playfair Display, serif', color: 'rgba(255,255,255,0.65)' }}>
          Badges
        </p>
        <span className="text-[10px] text-white/25 ml-auto">
          {earnedBadges.length}/{BADGES.length}
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {BADGES.map(badge => {
          const unlocked = earnedBadges.includes(badge.id);
          return (
            <div
              key={badge.id}
              className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
              style={{
                background: unlocked ? 'rgba(193,154,107,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${unlocked ? 'rgba(193,154,107,0.2)' : 'rgba(255,255,255,0.04)'}`,
                opacity: unlocked ? 1 : 0.35,
              }}
            >
              <span className="text-xl">{unlocked ? badge.emoji : '🔒'}</span>
              <p className="text-[8px] text-white/50 text-center leading-tight">{badge.nom}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function TabDefis({
  defisToday,
  defisRecent,
  profil,
}: {
  defisToday: Defi[];
  defisRecent: Defi[];
  profil: GamificationProfil | null;
}) {
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const defaultProfil: GamificationProfil = profil ?? {
    id: '', boulangerie_id: '', xp_total: 0, niveau: 1,
    streak_actuel: 0, streak_max: 0, derniere_cloture: null,
    badges: [], created_at: '', updated_at: '',
  };

  const activeDefis = defisToday.filter(d => d.statut === 'actif');
  const resolvedToday = defisToday.filter(d => d.statut !== 'actif');
  const successToday = resolvedToday.filter(d => d.statut === 'reussi');

  return (
    <div className="space-y-4">

      {/* Streak */}
      <StreakBanner
        streak={defaultProfil.streak_actuel}
        streakMax={defaultProfil.streak_max}
      />

      {/* XP & Level */}
      <XPProgress profil={defaultProfil} />

      {/* Active Challenges */}
      {activeDefis.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Target size={13} className="text-[#F5A623]" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#F5A623]/70">
              Défis en cours
            </p>
            <span className="text-[10px] text-white/20 ml-auto">{activeDefis.length} actif{activeDefis.length > 1 ? 's' : ''}</span>
          </div>
          {activeDefis.map((defi, i) => (
            <motion.div key={defi.id} transition={{ delay: i * 0.05 }}>
              <ChallengeCard defi={defi} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Resolved Today */}
      {resolvedToday.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Check size={13} className="text-green-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-green-400/70">
              Terminés aujourd'hui
            </p>
            <span className="text-[10px] text-white/20 ml-auto">
              {successToday.length}/{resolvedToday.length} réussi{successToday.length > 1 ? 's' : ''}
            </span>
          </div>
          {resolvedToday.map((defi, i) => (
            <motion.div key={defi.id} transition={{ delay: i * 0.05 }}>
              <ChallengeCard defi={defi} />
            </motion.div>
          ))}
        </div>
      )}

      {/* No challenges */}
      {defisToday.length === 0 && (
        <div
          className="rounded-2xl px-4 py-6 flex flex-col items-center gap-3 border text-center"
          style={{ background: 'rgba(193,154,107,0.05)', borderColor: 'rgba(193,154,107,0.15)' }}
        >
          <span className="text-3xl">🎯</span>
          <div>
            <p className="text-white/70 text-sm font-semibold mb-1">Aucun défi pour le moment</p>
            <p className="text-white/35 text-xs leading-relaxed max-w-xs">
              Les défis sont générés automatiquement après chaque rapport IA de clôture.
              Clôturez votre journée pour débloquer vos premiers défis !
            </p>
          </div>
        </div>
      )}

      {/* Recent History */}
      {defisRecent.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="w-full flex items-center justify-between py-2"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
              Historique récent ({defisRecent.length})
            </p>
            <motion.div animate={{ rotate: historyExpanded ? 180 : 0 }}>
              <ChevronDown size={14} className="text-white/20" />
            </motion.div>
          </button>
          <AnimatePresence>
            {historyExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {defisRecent.map((defi) => (
                  <ChallengeCard key={defi.id} defi={defi} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Badges */}
      <BadgeGrid earnedBadges={defaultProfil.badges} />
    </div>
  );
}
