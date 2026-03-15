'use client';
// components/boulanger/tour-wizard.tsx
// Wizard de visite guidée en style Spotlight.
// Fond assombri + découpe lumineuse sur l'élément cible + tooltip flottant.

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useTour, TOUR_STEPS } from '@/hooks/use-tour';
import type { ViewType } from '@/context/boulanger-context';

// ─── Types ─────────────────────────────────────────────────────────────────

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top: number;
  left: number;
  transformOrigin: string;
}

// ─── Constantes ────────────────────────────────────────────────────────────

const SPOTLIGHT_PADDING = 12;
const TOOLTIP_GAP       = 16;
const TOOLTIP_WIDTH     = 300;

// ─── Calcul position tooltip ───────────────────────────────────────────────

function computeTooltipPosition(
  rect: SpotlightRect,
  placement: 'top' | 'bottom' | 'left' | 'right',
  vpWidth: number,
  vpHeight: number,
): TooltipPosition {
  let top = 0;
  let left = 0;
  let transformOrigin = 'center top';

  switch (placement) {
    case 'bottom':
      top  = rect.top + rect.height + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      transformOrigin = 'center top';
      break;
    case 'top':
      top  = rect.top - TOOLTIP_GAP - 160; // hauteur estimée tooltip
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      transformOrigin = 'center bottom';
      break;
    case 'right':
      top  = rect.top + rect.height / 2 - 80;
      left = rect.left + rect.width + TOOLTIP_GAP;
      transformOrigin = 'left center';
      break;
    case 'left':
      top  = rect.top + rect.height / 2 - 80;
      left = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
      transformOrigin = 'right center';
      break;
  }

  // Clamp dans le viewport avec marges
  const margin = 12;
  left = Math.max(margin, Math.min(left, vpWidth - TOOLTIP_WIDTH - margin));
  top  = Math.max(margin, Math.min(top, vpHeight - 200));

  return { top, left, transformOrigin };
}

// ─── Composant Spotlight Overlay ──────────────────────────────────────────

interface SpotlightOverlayProps {
  spotlightRect: SpotlightRect | null;
  onSkip: () => void;
}

function SpotlightOverlay({ spotlightRect, onSkip }: SpotlightOverlayProps) {
  if (!spotlightRect) {
    return (
      <motion.div
        className="fixed inset-0 bg-black/75 z-[9000]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onSkip}
      />
    );
  }

  const { top, left, width, height } = spotlightRect;

  // SVG clipPath avec trou arrondi à l'emplacement de l'élément
  const r = 10; // border-radius du trou

  return (
    <motion.svg
      className="fixed inset-0 z-[9000] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <defs>
        <mask id="spotlight-mask">
          {/* Fond blanc = zone sombre */}
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {/* Trou arrondi = zone éclairée */}
          <rect
            x={left - SPOTLIGHT_PADDING}
            y={top - SPOTLIGHT_PADDING}
            width={width + SPOTLIGHT_PADDING * 2}
            height={height + SPOTLIGHT_PADDING * 2}
            rx={r}
            ry={r}
            fill="black"
          />
        </mask>
      </defs>
      {/* Fond assombri avec découpe */}
      <rect
        x="0" y="0"
        width="100%" height="100%"
        fill="rgba(0,0,0,0.78)"
        mask="url(#spotlight-mask)"
        style={{ pointerEvents: 'all', cursor: 'default' }}
      />
      {/* Halo lumineux autour de l'élément */}
      <rect
        x={left - SPOTLIGHT_PADDING - 2}
        y={top - SPOTLIGHT_PADDING - 2}
        width={width + SPOTLIGHT_PADDING * 2 + 4}
        height={height + SPOTLIGHT_PADDING * 2 + 4}
        rx={r + 2}
        ry={r + 2}
        fill="none"
        stroke="rgba(193, 154, 107, 0.5)"
        strokeWidth="1.5"
      />
    </motion.svg>
  );
}

// ─── Composant Tooltip ─────────────────────────────────────────────────────

interface TourTooltipProps {
  title: string;
  description: string;
  stepIndex: number;
  totalSteps: number;
  position: TooltipPosition;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function TourTooltip({
  title, description, stepIndex, totalSteps,
  position, onPrev, onNext, onSkip, isFirst, isLast,
}: TourTooltipProps) {
  return (
    <motion.div
      className="fixed z-[9100] select-none"
      style={{
        top: position.top,
        left: position.left,
        width: TOOLTIP_WIDTH,
        transformOrigin: position.transformOrigin,
      }}
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1E1108 0%, #140D05 100%)',
          borderColor: 'rgba(193,154,107,0.25)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(193,154,107,0.08)',
        }}
      >
        {/* Progression */}
        <div className="h-0.5 bg-white/5">
          <motion.div
            className="h-full"
            style={{ background: 'linear-gradient(90deg, #C19A6B, #E8C99A)' }}
            initial={{ width: 0 }}
            animate={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <p
              className="text-sm font-bold text-white leading-snug"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {title}
            </p>
            <button
              onClick={onSkip}
              className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/60 transition-all"
            >
              <X size={12} />
            </button>
          </div>

          {/* Description */}
          <p className="text-[12px] leading-relaxed text-white/60 mb-4">
            {description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/25 font-mono tabular-nums">
              {stepIndex + 1} / {totalSteps}
            </span>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={onPrev}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
                >
                  <ChevronLeft size={13} />
                  Préc.
                </button>
              )}
              <button
                onClick={onNext}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: isLast
                    ? 'linear-gradient(135deg, #C19A6B, #E8C99A)'
                    : 'rgba(193,154,107,0.15)',
                  color: isLast ? '#1A0F0A' : '#C19A6B',
                  border: '1px solid rgba(193,154,107,0.2)',
                }}
              >
                {isLast ? (
                  <>
                    <Sparkles size={12} />
                    Terminer
                  </>
                ) : (
                  <>
                    Suivant
                    <ChevronRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Composant TourWizard principal ────────────────────────────────────────

interface TourWizardProps {
  /** Callback pour changer de vue dans AppShell */
  onNavigateToView: (view: ViewType) => void;
}

export default function TourWizard({ onNavigateToView }: TourWizardProps) {
  const {
    isOpen, currentStep, currentStepIndex, totalSteps,
    nextStep, prevStep, skipTour,
  } = useTour();

  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos]       = useState<TooltipPosition>({ top: 100, left: 100, transformOrigin: 'center top' });
  const [mounted, setMounted]             = useState(false);
  const rafRef = useRef<number | null>(null);

  // Hydratation SSR-safe
  useEffect(() => { setMounted(true); }, []);

  // Naviguer vers la bonne vue quand l'étape change
  useEffect(() => {
    if (!isOpen || !currentStep) return;
    onNavigateToView(currentStep.view as ViewType);
  }, [currentStep?.view, isOpen]);

  // Calculer la position du spotlight après navigation + rendu
  const computeSpotlight = useCallback(() => {
    if (!currentStep || !isOpen) return;

    const attempt = (retries = 0) => {
      const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
      if (!el) {
        // L'élément n'est pas encore rendu (changement de vue) → réessayer
        if (retries < 12) {
          rafRef.current = requestAnimationFrame(() => attempt(retries + 1));
        } else {
          // Fallback : spotlight centré
          setSpotlightRect(null);
          setTooltipPos({ top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - 150, transformOrigin: 'center center' });
        }
        return;
      }

      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      // Attendre que le scroll soit terminé
      setTimeout(() => {
        const domRect = el.getBoundingClientRect();
        const rect: SpotlightRect = {
          top:    domRect.top,
          left:   domRect.left,
          width:  domRect.width,
          height: domRect.height,
        };
        setSpotlightRect(rect);
        setTooltipPos(computeTooltipPosition(
          rect,
          currentStep.placement,
          window.innerWidth,
          window.innerHeight,
        ));
      }, 150);
    };

    // Délai initial pour laisser le changement de vue s'effectuer
    rafRef.current = requestAnimationFrame(() => attempt(0));
  }, [currentStep, isOpen]);

  useEffect(() => {
    computeSpotlight();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [computeSpotlight]);

  // Recalculer au resize
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => computeSpotlight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, computeSpotlight]);

  if (!mounted || !currentStep) return null;

  const isFirst = currentStepIndex === 0;
  const isLast  = currentStepIndex === totalSteps - 1;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <SpotlightOverlay
            key="overlay"
            spotlightRect={spotlightRect}
            onSkip={skipTour}
          />
          <TourTooltip
            key={`tooltip-${currentStep.id}`}
            title={currentStep.title}
            description={currentStep.description}
            stepIndex={currentStepIndex}
            totalSteps={totalSteps}
            position={tooltipPos}
            onPrev={prevStep}
            onNext={nextStep}
            onSkip={skipTour}
            isFirst={isFirst}
            isLast={isLast}
          />
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Export du hook pour AppShell ──────────────────────────────────────────
export { useTour };