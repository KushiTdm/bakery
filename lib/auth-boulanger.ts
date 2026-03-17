// lib/auth-boulanger.ts
// ─────────────────────────────────────────────────────────────
// Utilitaire d'authentification partagé pour les routes API boulanger.
// Gère owner ET employés (gérant + vendeur).
//
// Utilisation dans les API routes :
//   const session = await getBoulangerSession(req);
//   if (!session) return 401;
//   if (!canAccess(session, 'catalogue', 'write')) return 403;
// ─────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabase';
import {
  type BoulangerRole,
  type PermissionKey,
  type PermissionLevel,
  type PermissionsMap,
  type MembreEquipe,
  DEFAULT_PERMISSIONS,
  mergePermissions,
  permissionSatisfies,
  PLAN_MEMBER_LIMITS,
} from './types';

// ── Types exportés ────────────────────────────────────────────

export interface BoulangerSession {
  userId:        string;
  boulangerieId: string;
  role:          BoulangerRole;
  permissions:   PermissionsMap;
  memberId?:     string;   // undefined pour le owner
}

// ── Fonction principale ───────────────────────────────────────

/**
 * Récupère la session boulanger depuis le header Authorization.
 * Vérifie owner d'abord, puis employé actif.
 * Retourne null si non authentifié ou pas d'accès boulanger.
 */
export async function getBoulangerSession(req: NextRequest): Promise<BoulangerSession | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  // 1. Vérifie owner
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (boulangerie) {
    return {
      userId:        user.id,
      boulangerieId: boulangerie.id,
      role:          'owner',
      permissions:   DEFAULT_PERMISSIONS.owner,
    };
  }

  // 2. Vérifie employé actif
  const { data: employe } = await admin
    .from('employes')
    .select('id, boulangerie_id, role, permissions, statut')
    .eq('user_id', user.id)
    .eq('statut', 'actif')
    .single();

  if (employe) {
    const role          = employe.role as 'gerant' | 'employe';
    const customPerms   = (employe.permissions ?? {}) as Partial<PermissionsMap>;
    const permissions   = mergePermissions(role, customPerms);

    return {
      userId:        user.id,
      boulangerieId: employe.boulangerie_id,
      role,
      permissions,
      memberId:      employe.id,
    };
  }

  return null;
}

// ── Vérificateurs de permission ───────────────────────────────

/** Vérifie si la session a au moins le niveau requis sur une feature. */
export function canAccess(
  session: BoulangerSession | null,
  feature: PermissionKey,
  level: PermissionLevel
): boolean {
  if (!session) return false;
  return permissionSatisfies(session.permissions[feature], level);
}

/** Vérifie si la session est owner. */
export function isOwner(session: BoulangerSession | null): boolean {
  return session?.role === 'owner';
}

/** Vérifie si la session est owner ou gérant. */
export function isManager(session: BoulangerSession | null): boolean {
  return session?.role === 'owner' || session?.role === 'gerant';
}

// ── Vérification des limites de plan ─────────────────────────

interface PlanLimitCheck {
  allowed:      boolean;
  current:      number;
  max:          number;
  plan:         string;
  upgradeNeeded?: string;
}

/**
 * Vérifie si la boulangerie peut ajouter un membre selon son plan.
 * Compte owner (1) + employés actifs.
 */
export async function checkMemberLimit(boulangerieId: string): Promise<PlanLimitCheck> {
  const admin = getSupabaseAdmin();

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('plan')
    .eq('id', boulangerieId)
    .single();

  const plan  = boulangerie?.plan ?? 'starter';
  const max   = PLAN_MEMBER_LIMITS[plan] ?? 1;

  // Count owner (1) + active employees
  const { count } = await admin
    .from('employes')
    .select('*', { count: 'exact', head: true })
    .eq('boulangerie_id', boulangerieId)
    .eq('statut', 'actif');

  const current = 1 + (count ?? 0); // 1 = owner

  if (max === 1) {
    return {
      allowed: false,
      current,
      max,
      plan,
      upgradeNeeded: 'pro',
    };
  }

  return {
    allowed: current < max,
    current,
    max,
    plan,
    upgradeNeeded: current >= max ? (plan === 'pro' ? 'multi' : undefined) : undefined,
  };
}

// ── Helpers réponses HTTP ─────────────────────────────────────

import { NextResponse } from 'next/server';

export function unauthorized(msg = 'Non authentifié') {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export function forbidden(msg = 'Accès refusé') {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export function planLimitError(check: PlanLimitCheck) {
  const upgradeMsg = check.upgradeNeeded
    ? ` Passez au plan ${check.upgradeNeeded.toUpperCase()} pour ajouter plus de membres.`
    : '';
  return NextResponse.json(
    {
      error: `Limite atteinte (${check.current}/${check.max} membres, plan ${check.plan.toUpperCase()}).${upgradeMsg}`,
      code:  'PLAN_LIMIT_REACHED',
      limit: check,
    },
    { status: 403 }
  );
}