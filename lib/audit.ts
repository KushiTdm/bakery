// lib/audit.ts
// ─────────────────────────────────────────────────────────────
// Helper pour l'audit logging — insertion directe dans audit_logs
// Non-bloquant : les erreurs ne font jamais échouer l'appelant
//
// Conception volontairement simple :
//   - Pas de RPC intermédiaire (dépendance à la migration évitée)
//   - Insertion directe via service_role (bypass RLS, pas de permission à gérer)
//   - Toujours catch — l'audit ne doit jamais planter une route métier
// ─────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from './supabase';

// ── Types d'actions auditables ────────────────────────────────

export type AuditAction =
  | 'login'
  | 'logout'
  | 'export_rgpd'
  | 'cloture_journee'
  | 'delete_produit'
  | 'invite_member'
  | 'accept_invite'
  | 'suspend_member'
  | 'reactivate_member'
  | 'revoke_member'
  | 'role_change'
  | 'perm_change'
  | 'update_profil'
  | 'create_commande'
  | 'create_flash'
  | 'rapport_ia'
  | 'invite_expired';

export interface AuditLogParams {
  boulangerieId: string;
  userId?:       string;
  action:        AuditAction | string;
  entityType?:   string;
  entityId?:     string;
  details?:      Record<string, unknown>;
  ipAddress?:    string;
  userAgent?:    string;
}

export interface AuditLogRow {
  id:           string;
  action:       string;
  user_id:      string | null;
  entity_type:  string | null;
  entity_id:    string | null;
  details:      Record<string, unknown>;
  ip_address:   string | null;
  created_at:   string;
}

// ── Écriture ──────────────────────────────────────────────────

/**
 * Log une action dans audit_logs.
 * Non-bloquant : toujours await-able, jamais throwable.
 *
 * @example
 * await logAuditAction({
 *   boulangerieId: session.boulangerieId,
 *   userId:        session.userId,
 *   action:        'export_rgpd',
 *   ipAddress:     req.headers.get('x-forwarded-for') ?? undefined,
 * });
 */
export async function logAuditAction(params: AuditLogParams): Promise<void> {
  try {
    const admin = getSupabaseAdmin();

    const { error } = await admin.from('audit_logs').insert({
      boulangerie_id: params.boulangerieId,
      user_id:        params.userId    ?? null,
      action:         params.action,
      entity_type:    params.entityType ?? null,
      entity_id:      params.entityId   ?? null,
      details:        params.details    ?? {},
      ip_address:     params.ipAddress  ?? null,
      user_agent:     params.userAgent  ?? null,
    });

    if (error) {
      // On logge l'erreur mais on ne la propage pas — l'audit est accessoire
      console.error('[lib/audit] Insert failed:', error.message);
    }
  } catch (err) {
    console.error('[lib/audit] Unexpected error:', err);
  }
}

// ── Lecture ───────────────────────────────────────────────────

export interface GetAuditLogsOptions {
  limit?:    number;
  action?:   string;
  userId?:   string;
  fromDate?: Date;
  toDate?:   Date;
}

/**
 * Récupère les logs d'audit pour une boulangerie.
 * Utilisé dans les pages Paramètres / Admin.
 * Retourne [] en cas d'erreur (non-bloquant).
 */
export async function getAuditLogs(
  boulangerieId: string,
  options?: GetAuditLogsOptions
): Promise<AuditLogRow[]> {
  try {
    const admin = getSupabaseAdmin();
    const limit = Math.min(options?.limit ?? 100, 500); // cap à 500 lignes max

    let query = admin
      .from('audit_logs')
      .select('id, action, user_id, entity_type, entity_id, details, ip_address, created_at')
      .eq('boulangerie_id', boulangerieId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options?.action)   query = query.eq('action', options.action);
    if (options?.userId)   query = query.eq('user_id', options.userId);
    if (options?.fromDate) query = query.gte('created_at', options.fromDate.toISOString());
    if (options?.toDate)   query = query.lte('created_at', options.toDate.toISOString());

    const { data, error } = await query;

    if (error) {
      console.error('[lib/audit] Query failed:', error.message);
      return [];
    }

    return (data ?? []) as AuditLogRow[];
  } catch (err) {
    console.error('[lib/audit] Unexpected error:', err);
    return [];
  }
}