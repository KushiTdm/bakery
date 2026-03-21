'use client';
// components/boulanger/day-countdown.tsx
// ─────────────────────────────────────────────────────────────
// Affiche le compte à rebours jusqu'à minuit (fin de journée)
// et la timeline de progression du workflow.
// ─────────────────────────────────────────────────────────────

import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Sun, Camera, Moon, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import type { WorkflowState } from '@/hooks/use-workflow-journee';

interface DayCountdownProps {
  workflow:    WorkflowState;
  onNavigate?: (step: 'matin' | 'snapshot' | 'soir' | 'flash') => void;
  compact?:    boolean;
}

interface StepInfo {
  id:       'matin' | 'snapshot' | 'soir' | 'flash';
  icon:     React.ElementType;
  label:    string;
  short:    string;
  done:     boolean;
  active:   boolean;
  locked:   boolean;
  time?:    string;
}

export default function DayCountdown({ workflow, onNavigate, compact = false }: DayCountdownProps) {
  const {
    countdown, dayProgress, localHour,
    productionSaisie, snapshot10hFait, snapshot14hFait,
    journeeCloturee, flashConfigured,
    canAccessSnapshot, canAccessFlash, canAccessSoir,
    currentSuggestedStep,
  } = workflow;

  const steps: StepInfo[] = [
    {
      id:      'matin',
      icon:    Sun,
      label:   'Production matin',
      short:   'Matin',
      done:    productionSaisie,
      active:  currentSuggestedStep === 'matin' && !productionSaisie,
      locked:  false,
      time:    '6h–10h',
    },
    {
      id:      'snapshot',
      icon:    Camera,
      label:   'Snapshots stock',
      short:   'Stock',
      done:    snapshot14hFait,
      active:  canAccessSnapshot && (currentSuggestedStep === 'snapshot'),
      locked:  !canAccessSnapshot,
      time:    '10h & 14h',
    },
    {
      id:      'flash',
      icon:    Zap,
      label:   'Paniers flash',
      short:   'Flash',
      done:    flashConfigured,
      active:  canAccessFlash && currentSuggestedStep === 'flash',
      locked:  !canAccessFlash,
      time:    '17h–20h',
    },
    {
      id:      'soir',
      icon:    Moon,
      label:   'Clôture soir',
      short:   'Soir',
      done:    journeeCloturee,
      active:  canAccessSoir && currentSuggestedStep === 'soir',
      locked:  !canAccessSoir,
      time:    '18h+',
    },
  ];

  if (compact) {
    return (
      <div
        className="rounded-2xl overflow-hidden border"
        style={{
          background: 'rgba(255,255,255,0.025)',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-white/30" />
            <span className="text-white/40 text-xs">Fin de journée dans</span>
          </div>
          <span className="text-white/70 text-sm font-mono font-bold tabular-nums">
            {countdown}
          </span>
        </div>

        {/* Mini timeline */}
        <div className="px-4 pb-3">
          <div className="relative h-1.5 bg-white/6 rounded-full overflow-hidden mb-2">
            <motion.div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #C19A6B, #E8C99A)',
                width: `${dayProgress}%`,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="flex justify-between">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  onClick={() => onNavigate?.(step.id)}
                  disabled={step.locked}
                  className={`flex flex-col items-center gap-0.5 transition-all ${
                    step.locked ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                    step.done    ? 'bg-green-500/20'       :
                    step.active  ? 'bg-[#C19A6B]/20'      :
                    step.locked  ? 'bg-white/4'            :
                                   'bg-white/8'
                  }`}>
                    {step.done ? (
                      <CheckCircle2 size={11} className="text-green-400" />
                    ) : (
                      <Icon
                        size={11}
                        className={
                          step.active ? 'text-[#C19A6B]' :
                          step.locked ? 'text-white/20'  :
                          'text-white/40'
                        }
                      />
                    )}
                  </div>
                  <span className={`text-[8px] font-medium ${
                    step.done   ? 'text-green-400/70' :
                    step.active ? 'text-[#C19A6B]'    :
                    step.locked ? 'text-white/15'     :
                    'text-white/30'
                  }`}>
                    {step.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Version complète
  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      {/* Header avec compte à rebours */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(193,154,107,0.1)', border: '1px solid rgba(193,154,107,0.15)' }}
          >
            <Clock size={14} className="text-[#C19A6B]/70" />
          </div>
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-medium">
              Fin de journée dans
            </p>
            <p className="text-white/80 font-mono font-bold text-lg tabular-nums leading-none mt-0.5">
              {countdown}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white/25 text-[10px]">{localHour}h locales</p>
          <p className="text-white/20 text-[10px]">{dayProgress}% écoulé</p>
        </div>
      </div>

      {/* Barre de progression globale */}
      <div className="px-5 pt-4 pb-2">
        <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #C19A6B, #E8C99A)' }}
            initial={{ width: 0 }}
            animate={{ width: `${dayProgress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
          {/* Marqueurs horaires */}
          {[25, 50, 75].map(pct => (
            <div
              key={pct}
              className="absolute top-0 h-full w-px bg-white/10"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1 px-0.5">
          <span className="text-[9px] text-white/20">0h</span>
          <span className="text-[9px] text-white/20">6h</span>
          <span className="text-[9px] text-white/20">12h</span>
          <span className="text-[9px] text-white/20">18h</span>
          <span className="text-[9px] text-white/20">24h</span>
        </div>
      </div>

      {/* Étapes du workflow */}
      <div className="px-4 pb-4 pt-2 space-y-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isClickable = !step.locked && !!onNavigate;

          return (
            <motion.button
              key={step.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={isClickable ? () => onNavigate?.(step.id) : undefined}
              disabled={step.locked}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                step.locked
                  ? 'opacity-35 cursor-not-allowed bg-white/2 border-white/5'
                  : step.done
                    ? 'bg-green-500/6 border-green-500/15 cursor-pointer hover:bg-green-500/10'
                    : step.active
                      ? 'bg-[#C19A6B]/10 border-[#C19A6B]/25 cursor-pointer hover:bg-[#C19A6B]/15'
                      : 'bg-white/4 border-white/8 cursor-pointer hover:bg-white/6'
              }`}
            >
              {/* Icône */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                step.done   ? 'bg-green-500/15'   :
                step.active ? 'bg-[#C19A6B]/15'   :
                step.locked ? 'bg-white/5'         :
                              'bg-white/8'
              }`}>
                {step.done ? (
                  <CheckCircle2 size={16} className="text-green-400" />
                ) : step.locked ? (
                  <div className="relative">
                    <Icon size={16} className="text-white/20" />
                  </div>
                ) : (
                  <Icon size={16} className={step.active ? 'text-[#C19A6B]' : 'text-white/45'} />
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${
                    step.done   ? 'text-green-400'  :
                    step.active ? 'text-[#C19A6B]'  :
                    step.locked ? 'text-white/20'   :
                    'text-white/65'
                  }`}>
                    {i + 1}. {step.label}
                  </p>
                  {step.active && !step.done && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: 'rgba(193,154,107,0.2)', color: '#C19A6B' }}
                    >
                      MAINTENANT
                    </span>
                  )}
                </div>
                <p className={`text-[10px] mt-0.5 ${
                  step.done   ? 'text-green-400/60' :
                  step.locked ? 'text-white/15'     :
                  'text-white/30'
                }`}>
                  {step.done
                    ? '✓ Complété'
                    : step.locked
                      ? '🔒 Complétez l\'étape précédente'
                      : step.time}
                </p>
              </div>

              {/* Status indicator */}
              {!step.locked && !step.done && step.active && (
                <div className="flex-shrink-0">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-2 h-2 rounded-full"
                    style={{ background: '#C19A6B' }}
                  />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Alerte si journée presque terminée et non clôturée */}
      {workflow.secondsUntilMidnight < 3600 && !journeeCloturee && productionSaisie && (
        <div
          className="mx-4 mb-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: 'rgba(226,85,85,0.08)', border: '1px solid rgba(226,85,85,0.2)' }}
        >
          <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300/80 text-xs leading-relaxed">
            Moins d'1h avant minuit — pensez à clôturer votre journée !
          </p>
        </div>
      )}
    </div>
  );
}