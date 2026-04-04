'use client';
// components/boulanger/vue-journee.tsx
// ─────────────────────────────────────────────────────────────
// Vue "Ma Journée" — Stepper horizontal avec les 4 étapes
// du workflow boulanger. Supporte le swipe entre étapes.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { Sun, Camera, Moon, Zap, Check, Lock } from 'lucide-react';
import type { PermissionKey } from '@/lib/types';
import type { WorkflowState } from '@/hooks/use-workflow-journee';
import VueMatin    from '@/components/boulanger/vue-matin';
import VueSnapshot from '@/components/boulanger/vue-snapshot';
import VueSoir     from '@/components/boulanger/vue-soir';
import VueFlash    from '@/components/boulanger/vue-flash';

// ── Types ─────────────────────────────────────────────────────

export type WorkflowStepId = 'matin' | 'snapshot' | 'flash' | 'soir';

export const STEP_CONFIG: {
  id: WorkflowStepId;
  label: string;
  short: string;
  icon: React.ElementType;
  color: string;
  permission?: PermissionKey;
}[] = [
  { id: 'matin',    label: 'Production matin', short: 'Matin', icon: Sun,    color: '#C19A6B', permission: 'matin'    },
  { id: 'snapshot', label: 'Stock en rayon',    short: 'Stock', icon: Camera, color: '#5CC994', permission: 'snapshot' },
  { id: 'flash',    label: 'Paniers flash',     short: 'Flash', icon: Zap,    color: '#EAC43A', permission: 'flash'    },
  { id: 'soir',     label: 'Clôture soir',      short: 'Soir',  icon: Moon,   color: '#6FA8EA', permission: 'soir'     },
];

// ── Vue bloquée (permission insuffisante) ─────────────────────

function ViewBlocked() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Lock size={32} className="text-white/15 mb-4" />
      <p className="text-white/40 text-sm font-medium">Vue non accessible</p>
      <p className="text-white/20 text-xs mt-1">Votre rôle n'autorise pas cette section.</p>
    </div>
  );
}

// ── Message étape verrouillée ─────────────────────────────────

function StepLockedMessage({
  stepLabel, reason, prerequisite, onNavigate,
}: {
  stepLabel: string;
  reason: string | null;
  prerequisite: string;
  onNavigate: () => void;
}) {
  const prereqConfig = STEP_CONFIG.find(s => s.id === prerequisite);
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Lock size={24} className="text-white/20" />
      </div>
      <p className="text-white/50 font-semibold text-sm">{stepLabel}</p>
      <p className="text-white/25 text-xs mt-2 max-w-xs leading-relaxed">
        {reason || 'Complétez l\'étape précédente pour débloquer.'}
      </p>
      {prereqConfig && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={onNavigate}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: `${prereqConfig.color}18`, border: `1px solid ${prereqConfig.color}35`, color: prereqConfig.color }}>
          {React.createElement(prereqConfig.icon, { size: 15 })}
          Aller à {prereqConfig.short}
        </motion.button>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────

interface VueJourneeProps {
  workflow: WorkflowState;
  canRead: (key: PermissionKey) => boolean;
}

export default function VueJournee({ workflow, canRead: canReadFn }: VueJourneeProps) {
  const {
    productionSaisie, snapshot14hFait,
    journeeCloturee, flashConfigured,
    canAccessSnapshot, canAccessFlash, canAccessSoir,
    currentSuggestedStep,
  } = workflow;

  // Filtrer les étapes par permissions du rôle
  const visibleSteps = STEP_CONFIG.filter(s => !s.permission || canReadFn(s.permission));

  // État local : étape active dans le stepper
  const [activeStep, setActiveStep] = useState<WorkflowStepId>(currentSuggestedStep);

  // Direction de la transition (pour l'animation slide)
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);

  // Sync avec la suggestion du workflow quand elle change
  useEffect(() => {
    if (visibleSteps.some(s => s.id === currentSuggestedStep)) {
      setActiveStep(currentSuggestedStep);
    }
  }, [currentSuggestedStep, visibleSteps]);

  const stepStatus = useCallback((id: WorkflowStepId): 'done' | 'locked' | 'available' => {
    if (id === 'matin')    return productionSaisie ? 'done' : 'available';
    if (id === 'snapshot') return snapshot14hFait ? 'done' : canAccessSnapshot ? 'available' : 'locked';
    if (id === 'flash')    return flashConfigured ? 'done' : canAccessFlash ? 'available' : 'locked';
    if (id === 'soir')     return journeeCloturee ? 'done' : canAccessSoir ? 'available' : 'locked';
    return 'locked';
  }, [productionSaisie, snapshot14hFait, flashConfigured, journeeCloturee, canAccessSnapshot, canAccessFlash, canAccessSoir]);

  const navigateToStep = useCallback((targetId: WorkflowStepId) => {
    const currentIdx = visibleSteps.findIndex(s => s.id === activeStep);
    const targetIdx  = visibleSteps.findIndex(s => s.id === targetId);
    setSlideDirection(targetIdx >= currentIdx ? 1 : -1);
    setActiveStep(targetId);
  }, [visibleSteps, activeStep]);

  const handleStepTap = useCallback((step: typeof STEP_CONFIG[0]) => {
    const status = stepStatus(step.id);
    if (status === 'locked') return;
    navigateToStep(step.id);
  }, [stepStatus, navigateToStep]);

  // Swipe entre étapes
  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    if (Math.abs(info.offset.x) < threshold) return;

    const currentIdx = visibleSteps.findIndex(s => s.id === activeStep);
    const direction = info.offset.x < 0 ? 1 : -1; // swipe left = next, right = prev

    const targetIdx = currentIdx + direction;
    if (targetIdx < 0 || targetIdx >= visibleSteps.length) return;

    const target = visibleSteps[targetIdx];
    if (stepStatus(target.id) === 'locked') return;

    setSlideDirection(direction);
    setActiveStep(target.id);
  }, [visibleSteps, activeStep, stepStatus]);

  return (
    <div className="space-y-0">
      {/* Stepper horizontal */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-3 backdrop-blur-md"
        style={{ background: 'rgba(18,10,6,0.92)' }}>

        <div className="flex items-center gap-1">
          {visibleSteps.map((step, i) => {
            const Icon = step.icon;
            const status = stepStatus(step.id);
            const isSelected = activeStep === step.id;
            const isCurrent = currentSuggestedStep === step.id && status !== 'done';

            return (
              <React.Fragment key={step.id}>
                {/* Connecteur */}
                {i > 0 && (
                  <div className="flex-shrink-0 w-3 h-px" style={{
                    background: stepStatus(visibleSteps[i - 1].id) === 'done'
                      ? 'rgba(92,201,148,0.4)' : 'rgba(255,255,255,0.1)',
                  }} />
                )}

                {/* Étape */}
                <motion.button
                  onClick={() => handleStepTap(step)}
                  whileTap={status !== 'locked' ? { scale: 0.95 } : undefined}
                  className={`flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition-all ${
                    status === 'locked' ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  style={{
                    background: isSelected
                      ? `${step.color}18`
                      : status === 'done'
                        ? 'rgba(92,201,148,0.06)'
                        : 'rgba(255,255,255,0.02)',
                    borderColor: isSelected
                      ? `${step.color}40`
                      : status === 'done'
                        ? 'rgba(92,201,148,0.15)'
                        : 'rgba(255,255,255,0.06)',
                  }}>
                  {/* Icône */}
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: status === 'done'
                        ? 'rgba(92,201,148,0.15)'
                        : isSelected
                          ? `${step.color}20`
                          : 'rgba(255,255,255,0.05)',
                    }}>
                    {status === 'done' ? (
                      <Check size={13} className="text-green-400" />
                    ) : status === 'locked' ? (
                      <Lock size={11} className="text-white/20" />
                    ) : (
                      <Icon size={13} style={{ color: isSelected ? step.color : 'rgba(255,255,255,0.4)' }} />
                    )}
                  </div>

                  {/* Label */}
                  <span className={`text-[10px] font-semibold leading-tight ${
                    status === 'done' ? 'text-green-400/80'
                    : isSelected ? '' : status === 'locked' ? 'text-white/20' : 'text-white/45'
                  }`} style={isSelected && status !== 'done' ? { color: step.color } : undefined}>
                    {step.short}
                  </span>

                  {/* Indicateur "maintenant" */}
                  {isCurrent && (
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: step.color }}
                    />
                  )}
                </motion.button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Contenu de l'étape active — swipeable */}
      <motion.div
        className="pt-2 touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, x: slideDirection * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection * -40 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}>

            {activeStep === 'matin' && (
              canReadFn('matin') ? <VueMatin /> : <ViewBlocked />
            )}

            {activeStep === 'snapshot' && (
              !canReadFn('snapshot') ? <ViewBlocked /> :
              !canAccessSnapshot ? (
                <StepLockedMessage
                  stepLabel="Stock en rayon"
                  reason={workflow.snapshotBlockReason}
                  prerequisite="matin"
                  onNavigate={() => navigateToStep('matin')}
                />
              ) : <VueSnapshot />
            )}

            {activeStep === 'flash' && (
              !canReadFn('flash') ? <ViewBlocked /> :
              !canAccessFlash ? (
                <StepLockedMessage
                  stepLabel="Paniers flash"
                  reason={workflow.flashBlockReason}
                  prerequisite="snapshot"
                  onNavigate={() => navigateToStep('snapshot')}
                />
              ) : <VueFlash />
            )}

            {activeStep === 'soir' && (
              !canReadFn('soir') ? <ViewBlocked /> :
              !canAccessSoir ? (
                <StepLockedMessage
                  stepLabel="Clôture soir"
                  reason={workflow.soirBlockReason}
                  prerequisite="matin"
                  onNavigate={() => navigateToStep('matin')}
                />
              ) : <VueSoir />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
