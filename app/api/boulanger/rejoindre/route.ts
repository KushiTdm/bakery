// app/api/boulanger/rejoindre/route.ts
// GET  — info invitation (affichage avant acceptation)
// POST — accepter l'invitation via token

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET — info sur l'invitation ──────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token || !UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    // Étape 1 : récupérer l'invitation
    const { data: invite, error } = await admin
      .from('employes')
      .select('id, role, statut, invite_email, invite_expires_at, boulangerie_id')
      .eq('invite_token', token)
      .single();

    if (error || !invite) {
      console.error('[GET /api/boulanger/rejoindre] invite not found:', error?.message);
      return NextResponse.json({ error: 'Invitation introuvable ou déjà utilisée' }, { status: 404 });
    }

    if (invite.statut !== 'invite') {
      return NextResponse.json({ error: 'Cette invitation a déjà été utilisée' }, { status: 410 });
    }

    if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Cette invitation a expiré' }, { status: 410 });
    }

    // Étape 2 : récupérer la boulangerie séparément
    const { data: boulangerie, error: bErr } = await admin
      .from('boulangeries')
      .select('nom, slug')
      .eq('id', invite.boulangerie_id)
      .single();

    if (bErr || !boulangerie) {
      console.error('[GET /api/boulanger/rejoindre] boulangerie not found:', bErr?.message);
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      invite: {
        email:           invite.invite_email,
        role:            invite.role,
        expiresAt:       invite.invite_expires_at,
        boulangerieNom:  boulangerie.nom,
        boulangerieSlug: boulangerie.slug,
      },
    });

  } catch (err) {
    console.error('[GET /api/boulanger/rejoindre] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — accepter l'invitation ─────────────────────────────

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: "Token d'invitation invalide" }, { status: 400 });
    }

    // Récupérer l'invitation
    const { data: invite, error: inviteError } = await admin
      .from('employes')
      .select('id, role, statut, invite_email, invite_expires_at, boulangerie_id')
      .eq('invite_token', inviteToken)
      .single();

    if (inviteError || !invite) {
      console.error('[POST /api/boulanger/rejoindre] invite not found:', inviteError?.message);
      return NextResponse.json({ error: 'Invitation introuvable ou déjà utilisée' }, { status: 404 });
    }

    if (invite.statut !== 'invite') {
      return NextResponse.json({ error: 'Cette invitation a déjà été utilisée' }, { status: 410 });
    }

    if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Cette invitation a expiré. Demandez une nouvelle invitation.' }, { status: 410 });
    }

    // Vérifier que l'utilisateur n'est pas déjà owner d'une boulangerie
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

    // Vérifier que l'utilisateur n'est pas déjà actif dans cette boulangerie
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

    // Accepter : lier l'utilisateur, activer, invalider le token
    const { data: updated, error: updateError } = await admin
      .from('employes')
      .update({
        user_id:           user.id,
        statut:            'actif',
        prenom:            profil?.prenom ?? null,
        invite_token:      null,
        invite_expires_at: null,
      })
      .eq('id', invite.id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[POST /api/boulanger/rejoindre] update:', updateError?.message);
      return NextResponse.json({ error: "Erreur acceptation invitation" }, { status: 500 });
    }

    // Récupérer le nom de la boulangerie pour la réponse
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('nom')
      .eq('id', invite.boulangerie_id)
      .single();

    // Audit
    await admin.from('audit_equipe').insert({
      boulangerie_id: invite.boulangerie_id,
      acteur_id:      user.id,
      cible_id:       invite.id,
      action:         'accept',
      details:        { email: user.email, role: invite.role },
    });

    return NextResponse.json({
      success:        true,
      role:           updated.role,
      boulangerieNom: boulangerie?.nom ?? '',
    });

  } catch (err) {
    console.error('[POST /api/boulanger/rejoindre] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}