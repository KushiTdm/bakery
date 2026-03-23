'use client';

import * as React from 'react';
import { Sparkles, Check, Crown, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ── Types ─────────────────────────────────────────────────────

export interface QuotaInfo {
  plan:            string;
  quota_limit:     number;
  quota_used:      number;
  quota_remaining: number;
}

interface UpgradeModalProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  reason?:      'quota_reached' | 'feature_locked';
  quotaInfo?:   QuotaInfo;
}

// ── Comparaison des plans ─────────────────────────────────────

const PRO_FEATURES = [
  'Rapports IA illimités',
  'Analyse complète débloquée',
  'Prévisions de production J+1',
  'Briefings équipe (boulanger / vendeuse / gérant)',
  'Historique 90 jours',
  'Support prioritaire',
];

const STARTER_LIMITS = [
  '1 rapport IA par semaine',
  'Score + verdict uniquement',
  'Pas de prévisions de production',
  'Pas de briefings équipe',
];

// ── Modal principale ──────────────────────────────────────────

export function UpgradeModal({
  open,
  onOpenChange,
  reason = 'quota_reached',
  quotaInfo,
}: UpgradeModalProps) {
  const isQuotaReached = reason === 'quota_reached';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {isQuotaReached ? 'Quota hebdomadaire atteint' : 'Fonctionnalité Pro'}
          </DialogTitle>
          <DialogDescription>
            {isQuotaReached
              ? 'Vous avez utilisé votre rapport IA de cette semaine. Passez au plan Pro pour des rapports illimités.'
              : 'Cette fonctionnalité est réservée au plan Pro.'}
          </DialogDescription>
        </DialogHeader>

        {/* Quota info */}
        {quotaInfo && (
          <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Plan actuel</span>
              <Badge variant="secondary" className="capitalize">{quotaInfo.plan}</Badge>
            </div>
            {quotaInfo.quota_limit > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Rapports cette semaine</span>
                <span className="font-medium">
                  {quotaInfo.quota_used} / {quotaInfo.quota_limit}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Limite Starter */}
        <div className="rounded-lg border border-muted bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Votre plan Starter
          </p>
          <ul className="space-y-1.5">
            {STARTER_LIMITS.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-3 w-3 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Plan Pro */}
        <div className="rounded-lg border-2 border-amber-500/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 p-4 relative">
          <Badge className="absolute -top-2 right-4 bg-amber-500">
            <Crown className="h-3 w-3 mr-1" />
            Pro
          </Badge>
          <ul className="space-y-2">
            {PRO_FEATURES.map((feature, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-2xl font-bold">29€</span>
            <span className="text-muted-foreground text-sm">/mois</span>
          </div>

          {/* CTA — href vers la page upgrade/billing */}
          <Button
            className="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white"
            asChild
          >
            {/* TODO: remplacer href par la route Stripe Checkout quand billing est implémenté */}
            <a href="/boulanger/upgrade">
              <Crown className="h-4 w-4 mr-2" />
              Passer au plan Pro
            </a>
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Annulation à tout moment · Accès immédiat
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ── Bannière Starter (inline, affichée dans le rapport) ───────

interface StarterBannerProps {
  onUpgrade: () => void;
  quotaUsed?:  number;
  quotaLimit?: number;
}

export function StarterBanner({ onUpgrade, quotaUsed, quotaLimit }: StarterBannerProps) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Lock className="h-4 w-4 text-amber-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-amber-300 text-xs font-semibold">Aperçu Starter</p>
          <p className="text-amber-300/60 text-[10px] truncate">
            {quotaUsed !== undefined && quotaLimit !== undefined
              ? `${quotaUsed}/${quotaLimit} rapport utilisé cette semaine`
              : 'Analyse complète disponible en Pro'}
          </p>
        </div>
      </div>
      <button
        onClick={onUpgrade}
        className="flex-shrink-0 text-[11px] font-bold text-amber-400 border border-amber-400/40 rounded-lg px-3 py-1.5 hover:bg-amber-400/10 transition-colors whitespace-nowrap"
      >
        Passer Pro
      </button>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useUpgradeModal() {
  const [open,      setOpen]      = React.useState(false);
  const [reason,    setReason]    = React.useState<'quota_reached' | 'feature_locked'>('quota_reached');
  const [quotaInfo, setQuotaInfo] = React.useState<QuotaInfo | undefined>(undefined);

  const showUpgradeModal = React.useCallback((
    reasonArg:    'quota_reached' | 'feature_locked' = 'quota_reached',
    quotaInfoArg?: QuotaInfo,
  ) => {
    setReason(reasonArg);
    setQuotaInfo(quotaInfoArg);
    setOpen(true);
  }, []);

  return { open, setOpen, reason, quotaInfo, showUpgradeModal };
}