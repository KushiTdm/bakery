'use client';
// components/boulanger/vue-journee.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { Sun, Camera, Moon, Zap, Check, Lock } from 'lucide-react';
import type { PermissionKey } from '@/lib/types';
import type { WorkflowState } from '@/hooks/use-workflow-journee';
import VueMatin    from '@/components/boulanger/vue-matin';
import VueSnapshot from '@/components/boulanger/vue-snapshot';
import VueSoir     from '@/components/boulanger/vue-soir';
import VueFlash    from '@/components/boulanger/vue-flash';

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

function ViewBlocked() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Lock size={32} className="text-white/15 mb-4" />
      <p className="text-white/40 text-sm font-medium">Vue non accessible</p>
      <p className="text-white/20 text-xs mt-1">Votre rôle n'autorise pas cette section.</p>
    </div>
  );
}

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
        {reason || "Complétez l'étape précédente pour débloquer."}
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

interface VueJourneeProps {
  workflow: WorkflowState;
  canRead: (key: PermissionKey) => boolean;
  onNavigateStep?: (step: WorkflowStepId) => void;
}

export default function VueJournee({ workflow, canRead: canReadFn, onNavigateStep }: VueJourneeProps) {
  const {
    productionSaisie, snapshot14hFait,
    journeeCloturee, flashConfigured,
    canAccessSnapshot, canAccessFlash, canAccessSoir,
    currentSuggestedStep,
  } = workflow;

  const visibleSteps = STEP_CONFIG.filter(s => !s.permission || canReadFn(s.permission));
  const [activeStep, setActiveStep] = useState<WorkflowStepId>(currentSuggestedStep);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);

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
    onNavigateStep?.(targetId);
  }, [visibleSteps, activeStep, onNavigateStep]);

  const handleStepTap = useCallback((step: typeof STEP_CONFIG[0]) => {
    const status = stepStatus(step.id);
    if (status === 'locked') return;
    navigateToStep(step.id);
  }, [stepStatus, navigateToStep]);

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    if (Math.abs(info.offset.x) < threshold) return;
    const currentIdx = visibleSteps.findIndex(s => s.id === activeStep);
    const direction = info.offset.x < 0 ? 1 : -1;
    const targetIdx = currentIdx + direction;
    if (targetIdx < 0 || targetIdx >= visibleSteps.length) return;
    const target = visibleSteps[targetIdx];
    if (stepStatus(target.id) === 'locked') return;
    setSlideDirection(direction);
    setActiveStep(target.id);
    onNavigateStep?.(target.id);
  }, [visibleSteps, activeStep, stepStatus, onNavigateStep]);

  const activeConfig = STEP_CONFIG.find(s => s.id === activeStep)!;
  const activeStatus = stepStatus(activeStep);

  return (
    <div className="space-y-0">
      {/* Stepper horizontal */}
      <div className="sticky top-14 z-20 -mx-4 px-4 backdrop-blur-md"
        style={{ background: 'rgba(18,10,6,0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

        <div className="flex items-stretch gap-1 pt-3 pb-0">
          {visibleSteps.map((step, i) => {
            const Icon = step.icon;
            const status = stepStatus(step.id);
            const isSelected = activeStep === step.id;
            const isCurrent = currentSuggestedStep === step.id && status !== 'done';

            return (
              <React.Fragment key={step.id}>
                {i > 0 && (
                  <div className="flex items-center flex-shrink-0 mb-3">
                    <div className="w-3 h-px" style={{
                      background: stepStatus(visibleSteps[i - 1].id) === 'done'
                        ? 'rgba(92,201,148,0.35)' : 'rgba(255,255,255,0.08)',
                    }} />
                  </div>
                )}

                {/* Étape — touch target min 44px */}
                <motion.button
                  onClick={() => handleStepTap(step)}
                  whileTap={status !== 'locked' ? { scale: 0.96 } : undefined}
                  className={`flex-1 relative flex flex-col items-center gap-1.5 px-1 pb-3 pt-2 rounded-t-xl transition-all ${
                    status === 'locked' ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  style={{ minHeight: '52px' }}>

                  {/* Indicateur ligne active en bas de l'onglet */}
                  <motion.div
                    className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full"
                    animate={{
                      background: isSelected ? step.color : 'transparent',
                      opacity: isSelected ? 1 : 0,
                    }}
                    transition={{ duration: 0.2 }}
                  />

                  {/* Icône */}
                  <motion.div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    animate={{
                      background: status === 'done'
                        ? 'rgba(92,201,148,0.15)'
                        : isSelected
                          ? `${step.color}22`
                          : 'rgba(255,255,255,0.05)',
                      boxShadow: isSelected && status !== 'done'
                        ? `0 0 12px ${step.color}35`
                        : 'none',
                    }}
                    transition={{ duration: 0.2 }}>
                    {status === 'done' ? (
                      <Check size={14} className="text-green-400" />
                    ) : status === 'locked' ? (
                      <Lock size={11} className="text-white/20" />
                    ) : (
                      <Icon size={14} style={{ color: isSelected ? step.color : 'rgba(255,255,255,0.4)' }} />
                    )}
                  </motion.div>

                  {/* Label */}
                  <span className="text-[9px] font-bold leading-none tracking-wide uppercase" style={{
                    color: status === 'done'
                      ? 'rgba(92,201,148,0.75)'
                      : isSelected
                        ? step.color
                        : status === 'locked'
                          ? 'rgba(255,255,255,0.18)'
                          : 'rgba(255,255,255,0.4)',
                  }}>
                    {step.short}
                  </span>

                  {/* Pulse "maintenant" */}
                  {isCurrent && (
                    <motion.div
                      className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{ background: step.color }}
                    />
                  )}
                </motion.button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Bandeau de contexte — étape active */}
      <motion.div
        key={`header-${activeStep}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-3 px-4 py-3 -mx-0"
        style={{
          background: `linear-gradient(90deg, ${activeConfig.color}10 0%, transparent 100%)`,
          borderBottom: `1px solid ${activeConfig.color}18`,
        }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${activeConfig.color}20` }}>
          {activeStatus === 'done'
            ? <Check size={13} className="text-green-400" />
            : React.createElement(activeConfig.icon, { size: 13, style: { color: activeConfig.color } })
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider leading-none"
            style={{ color: activeConfig.color }}>
            {activeConfig.label}
          </p>
        </div>
        <div className="flex-shrink-0">
          {activeStatus === 'done' ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(92,201,148,0.12)', color: 'rgba(92,201,148,0.8)' }}>
              Terminé
            </span>
          ) : activeStatus === 'locked' ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }}>
              Verrouillé
            </span>
          ) : currentSuggestedStep === activeStep ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${activeConfig.color}18`, color: activeConfig.color }}>
              En cours
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' }}>
              Disponible
            </span>
          )}
        </div>
      </motion.div>

      {/* Contenu swipeable */}
      <motion.div
        className="pt-2 touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}>
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