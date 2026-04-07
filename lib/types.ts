// lib/types.ts
// ─────────────────────────────────────────────────────────────
// Types partagés entre le contexte client et les routes API serveur.
// Importable des deux côtés (pas de directive 'use client').
// ─────────────────────────────────────────────────────────────

// ── Vues & sync ───────────────────────────────────────────────

export type ViewType   = 'matin' | 'snapshot' | 'soir' | 'flash' | 'catalogue' | 'dashboard' | 'parametres' | 'equipe' | 'ia' | 'supervision' | 'vitrine';
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── Durée de conservation ──────────────────────────────────────

/** Durée de conservation en jours par catégorie (valeur par défaut) */
export const DUREE_CONSERVATION_PAR_CATEGORIE: Record<string, number> = {
  boulangerie:  1,
  viennoiserie: 1,
  sandwich:     1,
  patisserie:   2,
};

/** Labels affichés dans le formulaire produit */
export const DUREE_CONSERVATION_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 1, label: 'Jour J uniquement',   description: 'Baguette, croissant, sandwich — non reportable' },
  { value: 2, label: 'J + 1 jour',          description: 'Tarte, flan, cake — reportable le lendemain' },
  { value: 3, label: 'J + 2 jours',         description: 'Gâteau sec, biscuit, entremet — reportable 2 jours' },
];

// ── Stocks ────────────────────────────────────────────────────

export interface StockEntry {
  id:              string;
  name:            string;
  emoji:           string;
  category:        'boulangerie' | 'viennoiserie' | 'patisserie' | 'sandwich';
  prixVente:       number;
  coutProduction:  number;
  production:      number;
  snapshot10h:     number;
  snapshot10hDone: boolean;
  snapshot14h:     number;
  snapshot14hDone: boolean;
  stockFinal:      number;
  // ── Report inter-journées ──────────────────────────────────
  /** Quantité reportée depuis J-1 (pré-remplie, modifiable par le boulanger) */
  reportVeille:         number;
  /** true si ce produit a des unités reportées de J-1 */
  estReporte:           boolean;
  /** Durée de conservation en jours (1 = non reportable) */
  dureeConservationJours: number;
}

export interface HistoryEntry {
  date:            string;
  chiffreAffaires: number;
  tauxInvendu:     number;
  commandesOnline: number;
  stocks:          StockEntry[];
}

export interface ProductionSuggestion {
  id:            string;
  name:          string;
  emoji:         string;
  avgProduction: number;
  suggestedQty:  number;
  dataPoints:    number;
  changePercent: number;
  confidence:    'high' | 'medium' | 'low';
}

// ── Rôles & permissions multi-user ───────────────────────────

export type BoulangerRole = 'owner' | 'gerant' | 'employe';
export type PermissionLevel = 'write' | 'read' | 'none';
export type PermissionKey =
  | 'matin'
  | 'snapshot'
  | 'soir'
  | 'flash'
  | 'catalogue'
  | 'dashboard'
  | 'commandes'
  | 'parametres'
  | 'equipe'
  | 'plan';

export type PermissionsMap = Record<PermissionKey, PermissionLevel>;

export const DEFAULT_PERMISSIONS: Record<BoulangerRole, PermissionsMap> = {
  owner: {
    matin: 'write', snapshot: 'write', soir: 'write', flash: 'write',
    catalogue: 'write', dashboard: 'write', commandes: 'write',
    parametres: 'write', equipe: 'write', plan: 'write',
  },
  gerant: {
    matin: 'write', snapshot: 'write', soir: 'write', flash: 'write',
    catalogue: 'write', dashboard: 'write', commandes: 'write',
    parametres: 'write', equipe: 'read', plan: 'none',
  },
  employe: {
    matin: 'none', snapshot: 'write', soir: 'none', flash: 'read',
    catalogue: 'read', dashboard: 'none', commandes: 'write',
    parametres: 'none', equipe: 'none', plan: 'none',
  },
};

export const PLAN_MEMBER_LIMITS: Record<string, number> = {
  starter: 1,
  pro:     3,
  multi:   999,
};

export const ROLE_LABELS: Record<BoulangerRole, string> = {
  owner:   'Propriétaire',
  gerant:  'Gérant',
  employe: 'Vendeur',
};

export const ROLE_DESCRIPTIONS: Record<BoulangerRole, string> = {
  owner:   'Accès complet à toutes les fonctionnalités et à la facturation',
  gerant:  'Accès complet sauf facturation. Peut voir l\'équipe mais pas la gérer',
  employe: 'Saisie stock, gestion commandes au comptoir. Pas accès aux stats ni paramètres',
};

export const PERMISSION_KEY_LABELS: Record<PermissionKey, string> = {
  matin:      'Production matin',
  snapshot:   'Stock étagère',
  soir:       'Clôture soir',
  flash:      'Paniers flash',
  catalogue:  'Catalogue produits',
  dashboard:  'Statistiques',
  commandes:  'Commandes',
  parametres: 'Paramètres',
  equipe:     'Gestion équipe',
  plan:       'Plan & facturation',
};

export function permissionSatisfies(
  actual: PermissionLevel,
  required: PermissionLevel
): boolean {
  if (required === 'none') return true;
  if (required === 'read')  return actual === 'read' || actual === 'write';
  if (required === 'write') return actual === 'write';
  return false;
}

export function mergePermissions(
  role: BoulangerRole,
  customOverrides: Partial<PermissionsMap>
): PermissionsMap {
  const base = { ...DEFAULT_PERMISSIONS[role] };
  for (const key of Object.keys(customOverrides) as PermissionKey[]) {
    const override = customOverrides[key];
    if (!override) continue;
    const ownerPerm = DEFAULT_PERMISSIONS.owner[key];
    if (permissionSatisfies(override, ownerPerm as PermissionLevel)) {
      base[key] = override;
    }
  }
  return base;
}

export interface MembreEquipe {
  id:               string;
  userId:           string | null;
  role:             'gerant' | 'employe';
  statut:           'invite' | 'actif' | 'suspendu';
  permissions:      Partial<PermissionsMap>;
  inviteEmail:      string;
  inviteExpiresAt:  string | null;
  prenom:           string | null;
  createdAt:        string;
}