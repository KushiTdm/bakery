'use client';
// components/boulanger/workflow-guard.tsx
// ─────────────────────────────────────────────────────────────
// Composant qui affiche un écran de blocage quand une étape du
// workflow n'est pas encore accessible.
// ─────────────────────────────────────────────────────────────

import { motion } from 'framer-motion';
import { Lock, ArrowRight, Sun, Camera, Moon, Zap } from 'lucide-react';
import type { WorkflowStep } from '@/hooks/use-workflow-journee';

interface WorkflowGuardProps {
  step:          WorkflowStep;
  canAccess:     boolean;
  blockReason:   string | null;
  onNavigate:    (step: WorkflowStep) => void;
  children:      React.ReactNode;
}

const STEP_CONFIG: Record<WorkflowStep, {
  icon:     React.ElementType;
  label:    string;
  prereq:   WorkflowStep | null;
  prereqLabel: string;
}> = {
  matin:    { icon: Sun,    label: 'Production matin', prereq: null,       prereqLabel: '' },
  snapshot: { icon: Camera, label: 'Stock étagère',    prereq: 'matin',    prereqLabel: 'Matin' },
  flash:    { icon: Zap,    label: 'Paniers flash',    prereq: 'snapshot', prereqLabel: 'Snapshots 10h & 14h' },
  soir:     { icon: Moon,   label: 'Clôture du soir',  prereq: 'matin',    prereqLabel: 'Production du matin' },
};

export default function WorkflowGuard({
  step, canAccess, blockReason, onNavigate, children,
}: WorkflowGuardProps) {
  if (canAccess) return <>{children}</>;

  const config = STEP_CONFIG[step];
  const prereq = config.prereq;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      {/* Icône cadenas */}
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Lock size={32} className="text-white/20" />
      </div>

      {/* Message */}
      <h2
        className="text-white/70 text-lg font-bold mb-2"
        style={{ fontFamily: 'Playfair Display, serif' }}
      >
        Étape non disponible
      </h2>
      <p className="text-white/35 text-sm leading-relaxed max-w-xs mb-8">
        {blockReason ?? 'Complétez les étapes précédentes pour accéder à cette section.'}
      </p>

      {/* Workflow visuel */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden border mb-6"
        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-white/30 text-xs uppercase tracking-widest font-semibold">
            Ordre du workflow
          </p>
        </div>
        <div className="p-3 space-y-1.5">
          {(Object.keys(STEP_CONFIG) as WorkflowStep[]).map((s, i) => {
            const cfg   = STEP_CONFIG[s];
            const Icon  = cfg.icon;
            const isCurrent = s === step;
            const isPrereq  = prereq && prereq === s;

            return (
              <div
                key={s}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-white/5 border border-white/10'
                    : isPrereq
                      ? 'bg-[#C19A6B]/8 border border-[#C19A6B]/20 cursor-pointer hover:bg-[#C19A6B]/12'
                      : 'opacity-40'
                }`}
                onClick={isPrereq ? () => onNavigate(s) : undefined}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isCurrent
                      ? 'bg-white/8'
                      : isPrereq
                        ? 'bg-[#C19A6B]/15'
                        : 'bg-white/5'
                  }`}
                >
                  <Icon size={14} className={isCurrent ? 'text-white/40' : isPrereq ? 'text-[#C19A6B]' : 'text-white/20'} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-xs font-medium ${isCurrent ? 'text-white/50' : isPrereq ? 'text-[#C19A6B]' : 'text-white/25'}`}>
                    {i + 1}. {cfg.label}
                  </p>
                  {isCurrent && (
                    <p className="text-white/25 text-[10px] mt-0.5">← Vous êtes ici</p>
                  )}
                  {isPrereq && (
                    <p className="text-[#C19A6B]/60 text-[10px] mt-0.5">Étape requise — appuyez pour y aller</p>
                  )}
                </div>
                {isPrereq && (
                  <ArrowRight size={13} className="text-[#C19A6B]/60 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      {prereq && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onNavigate(prereq)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm"
          style={{
            background: 'rgba(193,154,107,0.15)',
            border: '1px solid rgba(193,154,107,0.3)',
            color: '#C19A6B',
          }}
        >
          Aller à « {config.prereqLabel} »
          <ArrowRight size={15} />
        </motion.button>
      )}
    </motion.div>
  );
}