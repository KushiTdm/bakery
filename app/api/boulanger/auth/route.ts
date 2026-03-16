// app/api/boulanger/auth/route.ts
// Auth boulanger — email + password (pas d'OTP).

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// ── GET — Vérifie la session depuis le token JWT ───────────────

export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await admin.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id, nom, slug, plan')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      boulangerie,
    });
  } catch (err) {
    console.error('[/api/boulanger/auth GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — Login ou Register ───────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const body  = await req.json();
    const { action, email, password, nom, slug } = body;

    // ── Login ──────────────────────────────────────────────────

    if (action === 'login') {
      if (!email || !password) {
        return NextResponse.json(
          { error: 'Email et mot de passe requis' },
          { status: 400 }
        );
      }

      const { data, error } = await admin.auth.signInWithPassword({ email, password });

      if (error) {
        return NextResponse.json(
          { error: 'Email ou mot de passe incorrect' },
          { status: 401 }
        );
      }

      const { data: boulangerie } = await admin
        .from('boulangeries')
        .select('id, nom, slug, plan')
        .eq('user_id', data.user.id)
        .single();

      return NextResponse.json({
        access_token:  data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user:          { id: data.user.id, email: data.user.email },
        boulangerie,
      });
    }

    // ── Register ───────────────────────────────────────────────

    if (action === 'register') {
      if (!email || !password || !nom || !slug) {
        return NextResponse.json(
          { error: 'Email, mot de passe, nom et slug requis' },
          { status: 400 }
        );
      }

      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Le mot de passe doit faire au moins 8 caractères' },
          { status: 400 }
        );
      }

      const { data: existing } = await admin
        .from('boulangeries')
        .select('id')
        .eq('slug', slug)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'Ce slug est déjà utilisé' },
          { status: 409 }
        );
      }

      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      const { data: boulangerie, error: boulangerieError } = await admin
        .from('boulangeries')
        .insert({
          user_id:       authData.user.id,
          nom,
          slug,
          email_contact: email,
          plan:          'starter',
          actif:         true,
        })
        .select()
        .single();

      if (boulangerieError) {
        await admin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { error: 'Erreur création boulangerie' },
          { status: 500 }
        );
      }

      const { data: session } = await admin.auth.signInWithPassword({ email, password });

      return NextResponse.json({
        access_token:  session?.session?.access_token,
        refresh_token: session?.session?.refresh_token,
        user:          { id: authData.user.id, email },
        boulangerie,
      }, { status: 201 });
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });

  } catch (err) {
    console.error('[/api/boulanger/auth POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}