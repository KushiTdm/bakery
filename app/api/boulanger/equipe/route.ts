// app/api/boulanger/equipe/route.ts
// ─────────────────────────────────────────────────────────────
// GET  — liste les membres de l'équipe (owner + employés)
// POST — invite un nouveau membre (owner uniquement)
//
// Sécurité :
//   - Owner seul peut inviter
//   - Limite par plan vérifiée côté serveur
//   - Token d'invitation = UUID crypto aléatoire, expire en 7 jours
//   - L'email invité est normalisé (lowercase, trim)
//   - Pas de doublon : même email ne peut pas être invité deux fois
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  getBoulangerSession,
  canAccess,
  isOwner,
  checkMemberLimit,
  unauthorized,
  forbidden,
  planLimitError,
} from '@/lib/auth-boulanger';
import type { BoulangerRole, PermissionsMap } from '@/lib/types';
import { DEFAULT_PERMISSIONS, mergePermissions } from '@/lib/types';

// ── Schéma invitation ─────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().email().max(254).transform(s => s.trim().toLowerCase()),
  role:  z.enum(['gerant', 'employe']),
  // Permissions custom optionnelles (surcharge les defaults du rôle)
  permissions: z.record(z.enum(['write', 'read', 'none'])).optional().default({}),
});

// ── GET — liste les membres ───────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return unauthorized();

  // Gérant et owner peuvent voir l'équipe
  if (!canAccess(session, 'equipe', 'read')) return forbidden();

  const admin = getSupabaseAdmin();

  try {
    // Fetch owner info
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id, nom, plan')
      .eq('id', session.boulangerieId)
      .single();

    // Fetch owner user info
    const { data: { user: ownerUser } } = await admin.auth.admin.getUserById(
      // Get owner user_id from boulangeries
      (await admin.from('boulangeries').select('user_id').eq('id', session.boulangerieId).single()).data?.user_id ?? ''
    );

    // Fetch team members
    const { data: employes, error } = await admin
      .from('employes')
      .select('id, user_id, role, statut, permissions, invite_email, invite_expires_at, prenom, created_at')
      .eq('boulangerie_id', session.boulangerieId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/boulanger/equipe]', error);
      return NextResponse.json({ error: 'Erreur chargement équipe' }, { status: 500 });
    }

    // Build member list with enriched data
    const members = (employes ?? []).map(e => ({
      id:               e.id,
      userId:           e.user_id,
      role:             e.role,
      statut:           e.statut,
      permissions:      e.permissions ?? {},
      inviteEmail:      e.invite_email,
      inviteExpiresAt:  e.invite_expires_at,
      prenom:           e.prenom,
      createdAt:        e.created_at,
      // Computed: is invite expired?
      inviteExpired:    e.statut === 'invite' && e.invite_expires_at
                          ? new Date(e.invite_expires_at) < new Date()
                          : false,
    }));

    const limitInfo = await checkMemberLimit(session.boulangerieId);

    return NextResponse.json({
      owner: {
        email:  ownerUser?.email,
        userId: ownerUser?.id,
      },
      members,
      plan:       boulangerie?.plan,
      limite:     limitInfo,
    });

  } catch (err) {
    console.error('[GET /api/boulanger/equipe]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — invite un membre ───────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return unauthorized();

  // Seul l'owner peut inviter
  if (!isOwner(session)) {
    return forbidden('Seul le propriétaire peut inviter des membres');
  }

  // Vérifier limite du plan
  const limitCheck = await checkMemberLimit(session.boulangerieId);
  if (!limitCheck.allowed) return planLimitError(limitCheck);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, role, permissions } = parsed.data;
  const admin = getSupabaseAdmin();

  try {
    // Vérifier que l'email n'est pas déjà membre ou invité
    const { data: existing } = await admin
      .from('employes')
      .select('id, statut')
      .eq('boulangerie_id', session.boulangerieId)
      .eq('invite_email', email)
      .single();

    if (existing) {
      const msg = existing.statut === 'suspendu'
        ? 'Cet utilisateur a été suspendu. Réactivez-le plutôt que de le réinviter.'
        : existing.statut === 'invite'
          ? 'Une invitation est déjà en attente pour cet email.'
          : 'Cet utilisateur est déjà membre de l\'équipe.';
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // Vérifier que l'email n'est pas l'owner lui-même
    const { data: ownerData } = await admin
      .from('boulangeries')
      .select('user_id')
      .eq('id', session.boulangerieId)
      .single();

    if (ownerData) {
      const { data: { user: ownerUser } } = await admin.auth.admin.getUserById(ownerData.user_id);
      if (ownerUser?.email === email) {
        return NextResponse.json(
          { error: 'Vous ne pouvez pas vous inviter vous-même.' },
          { status: 400 }
        );
      }
    }

    // Construire les permissions finales (defaults rôle + overrides)
    const finalPermissions = Object.keys(permissions).length > 0
      ? permissions
      : {}; // Vide = utiliser les defaults du rôle

    // Générer token d'invitation (UUID aléatoire, expire dans 7 jours)
    const inviteToken   = crypto.randomUUID();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: membre, error: insertError } = await admin
      .from('employes')
      .insert({
        boulangerie_id:    session.boulangerieId,
        user_id:           null,               // Sera rempli à l'acceptation
        role,
        statut:            'invite',
        permissions:       finalPermissions,
        invite_email:      email,
        invite_token:      inviteToken,
        invite_expires_at: inviteExpires,
        created_by:        session.userId,
      })
      .select()
      .single();

    if (insertError || !membre) {
      console.error('[POST /api/boulanger/equipe] insert:', insertError);
      return NextResponse.json({ error: 'Erreur création invitation' }, { status: 500 });
    }

    // Audit log
    await admin.from('audit_equipe').insert({
      boulangerie_id: session.boulangerieId,
      acteur_id:      session.userId,
      cible_id:       membre.id,
      action:         'invite',
      details: { email, role, permissions: finalPermissions },
    });

    // URL d'invitation (à partager manuellement ou via email)
    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const inviteUrl  = `${appUrl}/boulanger/rejoindre?token=${inviteToken}`;

    // Tentative d'envoi email si Resend est configuré (non bloquant)
    if (process.env.RESEND_API_KEY && appUrl) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from:    `BakeryOS <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'bakeryos.fr'}>`,
            to:      [email],
            subject: `Invitation à rejoindre l'équipe BakeryOS`,
            html:    buildInviteEmail(inviteUrl, role, appUrl),
          }),
        });
      } catch (emailErr) {
        console.warn('[POST /api/boulanger/equipe] email non envoyé:', emailErr);
      }
    }

    return NextResponse.json({
      success:    true,
      membre:     { id: membre.id, email, role, statut: 'invite' },
      inviteUrl,  // Lien à partager si email non configuré
      inviteExpiresAt: inviteExpires,
    }, { status: 201 });

  } catch (err) {
    console.error('[POST /api/boulanger/equipe]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── Helper email HTML ─────────────────────────────────────────

function buildInviteEmail(inviteUrl: string, role: string, appUrl: string): string {
  const roleLabel = role === 'gerant' ? 'Gérant' : 'Vendeur';
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
      <h2 style="color:#2C1810">🥖 Invitation BakeryOS</h2>
      <p>Vous avez été invité(e) à rejoindre une boulangerie en tant que <strong>${roleLabel}</strong>.</p>
      <a href="${inviteUrl}" style="display:inline-block;background:#C19A6B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
        Accepter l'invitation
      </a>
      <p style="color:#666;font-size:13px">Ce lien expire dans 7 jours.</p>
      <p style="color:#999;font-size:12px">Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
    </div>
  `;
}