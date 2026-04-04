// lib/workflow.ts
// Flux journalier Sauve Mie — ordre strict + déblocage horaire
//
// Étapes dans l'ordre :
//   1. production_matin  (Boulanger, dès ouverture)
//   2. snapshot_10h      (Vendeur, déblocage 9h)
//   3. sandwichs_midi    (Both, déblocage 11h — déduit du stock pain)
//   4. snapshot_14h      (Vendeur, déblocage 13h, nécessite snapshot_10h)
//   5. flash_paniers     (Both, déblocage 17h)
//   6. inventaire_soir   (Vendeur, déblocage 17h, nécessite snapshot_14h)
//   7. cloture           (Both, nécessite inventaire_soir)

export type WorkflowStepId =
  | 'production_matin'
  | 'snapshot_10h'
  | 'sandwichs_midi'
  | 'snapshot_14h'
  | 'flash_paniers'
  | 'inventaire_soir'
  | 'cloture';

export type StepStatus = 'locked' | 'locked_time' | 'active' | 'done';
export type StepRole   = 'boulanger' | 'vendeur' | 'both';

export interface WorkflowStep {
  id:          WorkflowStepId;
  label:       string;
  shortLabel:  string;
  role:        StepRole;
  requires:    WorkflowStepId[];
  timeUnlock?: number;
  timeLock?:   number;
  emoji:       string;
  description: string;
}

export interface WorkflowStepState {
  done:    boolean;
  doneAt?: string;
}

export type WorkflowState = Partial<Record<WorkflowStepId, WorkflowStepState>>;

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'production_matin', label: 'Production du matin', shortLabel: 'Matin',
    role: 'boulanger', requires: [], emoji: '🌅',
    description: 'Quantités produites par fournée et par catégorie',
  },
  {
    id: 'snapshot_10h', label: 'Stock étagère 10h', shortLabel: '10h',
    role: 'vendeur', requires: ['production_matin'], timeUnlock: 9, timeLock: 12, emoji: '📸',
    description: 'Comptage de ce qui reste en vitrine à 10h',
  },
  {
    id: 'sandwichs_midi', label: 'Sandwichs & Snacking', shortLabel: 'Sandwichs',
    role: 'both', requires: ['production_matin'], timeUnlock: 11, timeLock: 14, emoji: '🥪',
    description: 'Saisir les sandwichs du jour — déduit du stock pain',
  },
  {
    id: 'snapshot_14h', label: 'Stock étagère 14h', shortLabel: '14h',
    role: 'vendeur', requires: ['snapshot_10h'], timeUnlock: 13, timeLock: 18, emoji: '📸',
    description: 'Comptage de ce qui reste en vitrine à 14h',
  },
  {
    id: 'flash_paniers', label: 'Paniers anti-gaspi', shortLabel: 'Flash',
    role: 'both', requires: ['production_matin'], timeUnlock: 17, emoji: '⚡',
    description: 'Configurer les paniers invendus du soir',
  },
  {
    id: 'inventaire_soir', label: 'Invendus du soir', shortLabel: 'Invendus',
    role: 'vendeur', requires: ['snapshot_14h'], timeUnlock: 17, emoji: '🌙',
    description: 'Compter les invendus à la fermeture',
  },
  {
    id: 'cloture', label: 'Clôture de journée', shortLabel: 'Clôture',
    role: 'both', requires: ['inventaire_soir'], emoji: '✅',
    description: 'Clôturer + retour rapide vendeur + rapport Levain',
  },
];

// ── Statut d'une étape ────────────────────────────────────────

export function getStepStatus(
  stepId:  WorkflowStepId,
  state:   WorkflowState,
  nowHour?: number
): StepStatus {
  const step = WORKFLOW_STEPS.find(s => s.id === stepId);
  if (!step) return 'locked';
  if (state[stepId]?.done) return 'done';

  const allReqsDone = step.requires.every(r => state[r]?.done === true);
  if (!allReqsDone) return 'locked';

  const hour = nowHour ?? new Date().getHours();
  if (step.timeUnlock !== undefined && hour < step.timeUnlock) return 'locked_time';
  if (step.timeLock   !== undefined && hour >= step.timeLock)  return 'locked';

  return 'active';
}

export function canAccessStep(stepId: WorkflowStepId, state: WorkflowState): boolean {
  const s = getStepStatus(stepId, state);
  return s === 'active' || s === 'done';
}

export function getCurrentStep(state: WorkflowState): WorkflowStepId | null {
  const hour = new Date().getHours();
  for (const step of WORKFLOW_STEPS) {
    if (!state[step.id]?.done && getStepStatus(step.id, state, hour) === 'active') return step.id;
  }
  return null;
}

export function getProgressPct(state: WorkflowState): number {
  const done = WORKFLOW_STEPS.filter(s => state[s.id]?.done).length;
  return Math.round((done / WORKFLOW_STEPS.length) * 100);
}

export function markStepDone(stepId: WorkflowStepId, state: WorkflowState): WorkflowState {
  return { ...state, [stepId]: { done: true, doneAt: new Date().toISOString() } };
}

export function getNextTimeUnlock(state: WorkflowState): { stepLabel: string; hour: number } | null {
  const hour = new Date().getHours();
  for (const step of WORKFLOW_STEPS) {
    if (state[step.id]?.done) continue;
    if (!step.requires.every(r => state[r]?.done)) continue;
    if (step.timeUnlock !== undefined && hour < step.timeUnlock) {
      return { stepLabel: step.label, hour: step.timeUnlock };
    }
  }
  return null;
}

// ── Persistance ───────────────────────────────────────────────

export function loadWorkflowState(date: string, boulangerieId: string): WorkflowState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`workflow:${boulangerieId}:${date}`);
    return raw ? JSON.parse(raw) as WorkflowState : {};
  } catch { return {}; }
}

export function saveWorkflowState(date: string, boulangerieId: string, state: WorkflowState): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(`workflow:${boulangerieId}:${date}`, JSON.stringify(state)); }
  catch {}
}

// ── Catégories ────────────────────────────────────────────────

export type ProductCategory = 'boulangerie' | 'viennoiserie' | 'patisserie' | 'sandwichs';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  boulangerie: 'Boulangerie', viennoiserie: 'Viennoiserie',
  patisserie: 'Pâtisserie', sandwichs: 'Sandwichs & Snacking',
};
export const CATEGORY_EMOJI: Record<ProductCategory, string> = {
  boulangerie: '🥖', viennoiserie: '🥐', patisserie: '🎂', sandwichs: '🥪',
};
export const CATEGORY_ORDER: ProductCategory[] = ['boulangerie', 'viennoiserie', 'patisserie', 'sandwichs'];