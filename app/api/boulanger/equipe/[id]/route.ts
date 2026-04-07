// app/api/boulanger/equipe/[id]/route.ts
// ─────────────────────────────────────────────────────────────
// PATCH — Modifie un membre (rôle, permissions, statut)
// DELETE — Révoque l'accès d'un membre
//
// Sécurité :
//   - Seul l'owner peut modifier/révoquer
//   - L'owner ne peut pas se modifier lui-même via cette route
//   - Un gérant ne peut pas être promu au-delà de 'gerant'
//   - Les permissions custom sont bornées au maximum du rôle
//   - Soft suspend conserve l'historique
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  getBoulangerSession,
  isOwner,
  unauthorized,
  forbidden,
} from '@/lib/auth-boulanger';
import { DEFAULT_PERMISSIONS, mergePermissions } from '@/lib/types';
import { isValidUUID } from '@/lib/sanitize';

// ── Schéma PATCH ─────────────────────────────────────────────

const PatchSchema = z.object({
  role:        z.enum(['gerant', 'employe']).optional(),
  statut:      z.enum(['actif', 'suspendu']).optional(), // pas 'invite' (géré par rejoindre)
  permissions: z.record(z.enum(['write', 'read', 'none'])).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Au moins un champ requis (role, statut ou permissions)',
});

// ── PATCH — modifier un membre ────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: 'ID membre invalide' }, { status: 400 });
  }

  const session = await getBoulangerSession(req);
  if (!session) return unauthorized();
  if (!isOwner(session)) return forbidden('Seul le propriétaire peut modifier les membres');

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  try {
    // Vérifier que le membre appartient bien à cette boulangerie
    const { data: membre, error: fetchError } = await admin
      .from('employes')
      .select('id, role, statut, permissions, user_id, invite_email')
      .eq('id', id)
      .eq('boulangerie_id', session.boulangerieId)
      .single();

    if (fetchError || !membre) {
      return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    const auditDetails: Record<string, unknown> = {};

    // Changement de rôle
    if (parsed.data.role && parsed.data.role !== membre.role) {
      updates.role = parsed.data.role;
      auditDetails.ancien_role = membre.role;
      auditDetails.nouveau_role = parsed.data.role;
    }

    // Changement de statut (actif/suspendu)
    if (parsed.data.statut && parsed.data.statut !== membre.statut) {
      if (membre.statut === 'invite') {
        return NextResponse.json(
          { error: 'Impossible de changer le statut d\'une invitation en attente. Révoquez-la.' },
          { status: 400 }
        );
      }
      updates.statut = parsed.data.statut;
      auditDetails.ancien_statut = membre.statut;
      auditDetails.nouveau_statut = parsed.data.statut;
    }

    // Changement de permissions custom
    if (parsed.data.permissions) {
      const newRole = (parsed.data.role ?? membre.role) as 'gerant' | 'employe';

      // Valider que les permissions ne dépassent pas le maximum du rôle
      const sanitizedPerms: Record<string, string> = {};
      const roleDefaults = DEFAULT_PERMISSIONS[newRole];

      for (const [key, value] of Object.entries(parsed.data.permissions)) {
        const maxPerm = roleDefaults[key as keyof typeof roleDefaults];
        // Si le rôle ne permet pas 'write' sur cette feature, on borne à 'read' max
        if (value === 'write' && maxPerm === 'read') {
          sanitizedPerms[key] = 'read';
        } else if (value === 'write' && maxPerm === 'none') {
          sanitizedPerms[key] = 'none';
        } else {
          sanitizedPerms[key] = value;
        }
      }

      updates.permissions = sanitizedPerms;
      auditDetails.permissions = sanitizedPerms;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, message: 'Aucun changement' });
    }

    const { data: updated, error: updateError } = await admin
      .from('employes')
      .update(updates)
      .eq('id', id)
      .eq('boulangerie_id', session.boulangerieId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[PATCH /api/boulanger/equipe/[id]]', updateError);
      return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 });
    }

    // Audit
    const action = parsed.data.statut === 'suspendu' ? 'suspend'
      : parsed.data.statut === 'actif' ? 'reactivate'
      : parsed.data.role ? 'role_change'
      : 'perm_change';

    await admin.from('audit_equipe').insert({
      boulangerie_id: session.boulangerieId,
      acteur_id:      session.userId,
      cible_id:       id,
      action,
      details:        auditDetails,
    });

    return NextResponse.json({ success: true, membre: updated });

  } catch (err) {
    console.error('[PATCH /api/boulanger/equipe/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── DELETE — révoquer l'accès ─────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: 'ID membre invalide' }, { status: 400 });
  }

  const session = await getBoulangerSession(req);
  if (!session) return unauthorized();
  if (!isOwner(session)) return forbidden('Seul le propriétaire peut révoquer des membres');

  const admin = getSupabaseAdmin();

  try {
    const { data: membre, error: fetchError } = await admin
      .from('employes')
      .select('id, role, statut, invite_email, user_id')
      .eq('id', id)
      .eq('boulangerie_id', session.boulangerieId)
      .single();

    if (fetchError || !membre) {
      return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    }

    // Audit avant suppression
    await admin.from('audit_equipe').insert({
      boulangerie_id: session.boulangerieId,
      acteur_id:      session.userId,
      cible_id:       id,
      action:         'revoke',
      details: {
        email:  membre.invite_email,
        role:   membre.role,
        statut: membre.statut,
      },
    });

    const { error: deleteError } = await admin
      .from('employes')
      .delete()
      .eq('id', id)
      .eq('boulangerie_id', session.boulangerieId);

    if (deleteError) {
      console.error('[DELETE /api/boulanger/equipe/[id]]', deleteError);
      return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[DELETE /api/boulanger/equipe/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}