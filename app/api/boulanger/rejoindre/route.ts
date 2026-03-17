// app/api/boulanger/rejoindre/route.ts
// ─────────────────────────────────────────────────────────────
// POST — Accepte une invitation via token.
//
// Sécurité :
//   - Token UUID validé (regex + existence DB)
//   - Token non expiré
//   - Utilisateur doit être authentifié (via Authorization header)
//   - L'utilisateur ne doit pas déjà être owner d'une boulangerie
//   - L'utilisateur ne doit pas déjà être membre de CETTE boulangerie
//   - Token invalidé après acceptation (nettoyage)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/sanitize';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET — info sur l'invitation (pour affichage avant acceptation) ─

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token || !UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: invite, error } = await admin
      .from('employes')
      .select('id, role, statut, invite_email, invite_expires_at, boulangeries!inner(nom, slug)')
      .eq('invite_token', token)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invitation introuvable ou déjà utilisée' }, { status: 404 });
    }

    if (invite.statut !== 'invite') {
      return NextResponse.json({ error: 'Cette invitation a déjà été utilisée' }, { status: 410 });
    }

    if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Cette invitation a expiré' }, { status: 410 });
    }

    const boulangerie = (invite.boulangeries as unknown as { nom: string; slug: string }[])[0];

    return NextResponse.json({
      valid: true,
      invite: {
        email:          invite.invite_email,
        role:           invite.role,
        expiresAt:      invite.invite_expires_at,
        boulangerieNom: boulangerie.nom,
        boulangerieSlug: boulangerie.slug,
      },
    });

  } catch (err) {
    console.error('[GET /api/boulanger/rejoindre]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — accepter l'invitation ─────────────────────────────

export async function POST(req: NextRequest) {
  // L'utilisateur doit être authentifié
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const token_jwt = authHeader.slice(7);

  const admin = getSupabaseAdmin();

  try {
    // Vérifier l'utilisateur
    const { data: { user }, error: authError } = await admin.auth.getUser(token_jwt);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    // Récupérer le token d'invitation depuis le body
    let body: { token?: string };
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

    const inviteToken = body.token;
    if (!inviteToken || !UUID_REGEX.test(inviteToken)) {
      return NextResponse.json({ error: 'Token d\'invitation invalide' }, { status: 400 });
    }

    // Récupérer l'invitation
    const { data: invite, error: inviteError } = await admin
      .from('employes')
      .select('id, role, statut, invite_email, invite_expires_at, boulangerie_id, boulangeries!inner(nom)')
      .eq('invite_token', inviteToken)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invitation introuvable ou déjà utilisée' }, { status: 404 });
    }

    if (invite.statut !== 'invite') {
      return NextResponse.json({ error: 'Cette invitation a déjà été utilisée' }, { status: 410 });
    }

    if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Cette invitation a expiré. Demandez une nouvelle invitation.' }, { status: 410 });
    }

    // Sécurité : l'utilisateur ne doit pas être owner d'une boulangerie
    const { data: ownedBoulangerie } = await admin
      .from('boulangeries')
      .select('id, nom')
      .eq('user_id', user.id)
      .single();

    if (ownedBoulangerie) {
      return NextResponse.json(
        { error: `Vous êtes déjà propriétaire de "${ownedBoulangerie.nom}". Un owner ne peut pas aussi être employé.` },
        { status: 409 }
      );
    }

    // Sécurité : l'utilisateur ne doit pas déjà être actif dans cette boulangerie
    const { data: existingMembership } = await admin
      .from('employes')
      .select('id, statut')
      .eq('boulangerie_id', invite.boulangerie_id)
      .eq('user_id', user.id)
      .single();

    if (existingMembership && existingMembership.statut === 'actif') {
      return NextResponse.json(
        { error: 'Vous êtes déjà membre de cette boulangerie.' },
        { status: 409 }
      );
    }

    // Récupérer le prénom depuis profils_clients si disponible
    const { data: profil } = await admin
      .from('profils_clients')
      .select('prenom')
      .eq('user_id', user.id)
      .single();

    // Accepter l'invitation : lier l'utilisateur et activer
    const { data: updated, error: updateError } = await admin
      .from('employes')
      .update({
        user_id:          user.id,
        statut:           'actif',
        prenom:           profil?.prenom ?? null,
        invite_token:     null,  // Invalider le token immédiatement
        invite_expires_at: null,
      })
      .eq('id', invite.id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[POST /api/boulanger/rejoindre] update:', updateError);
      return NextResponse.json({ error: 'Erreur acceptation invitation' }, { status: 500 });
    }

    // Audit
    await admin.from('audit_equipe').insert({
      boulangerie_id: invite.boulangerie_id,
      acteur_id:      user.id,
      cible_id:       invite.id,
      action:         'accept',
      details: { email: user.email, role: invite.role },
    });

    const boulangerie = (invite.boulangeries as unknown as { nom: string }[])[0];

    return NextResponse.json({
      success:        true,
      role:           updated.role,
      boulangerieNom: boulangerie.nom,
    });

  } catch (err) {
    console.error('[POST /api/boulanger/rejoindre]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}