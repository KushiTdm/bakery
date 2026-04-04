// app/api/boulanger/auth/route.ts
// Auth boulanger — email + password (pas d'OTP).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidSlug } from '@/lib/sanitize';
import { isAuthRateLimited, resetAuthRateLimit } from '@/lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Schémas Zod ───────────────────────────────────────────────

const LoginSchema = z.object({
  action:   z.literal('login'),
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

const RegisterSchema = z.object({
  action:   z.literal('register'),
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  nom:      z.string().min(1).max(100),
  slug:     z.string().min(1).max(60),
});

const AuthBodySchema = z.discriminatedUnion('action', [LoginSchema, RegisterSchema]);

// ── Helpers ───────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

// ── Validation mot de passe ───────────────────────────────────

interface PasswordValidationResult {
  valid:  boolean;
  errors: string[];
}

function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8)     errors.push('au moins 8 caractères');
  if (!/[a-z]/.test(password)) errors.push('une lettre minuscule');
  if (!/[A-Z]/.test(password)) errors.push('une lettre majuscule');
  if (!/[0-9]/.test(password)) errors.push('un chiffre');

  return { valid: errors.length === 0, errors };
}

// ── GET — Vérifie la session depuis le token JWT ───────────────

export async function GET(req: NextRequest) {
  try {
    const admin      = getSupabaseAdmin();
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
  const clientIp = getClientIp(req);

  // 1. Rate limiting — avant tout traitement, avant même le parsing
  const rateCheck = await isAuthRateLimited(clientIp);
  if (rateCheck.blocked) {
    const retryMinutes = Math.ceil(rateCheck.retryAfterMs / 60_000);
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${retryMinutes} minute(s).` },
      {
        status:  429,
        headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
      }
    );
  }

  // 2. Parsing JSON
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  // 3. Validation Zod — discriminatedUnion sur 'action'
  const parsed = AuthBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  try {
    const admin = getSupabaseAdmin();

    // ── Login ────────────────────────────────────────────────

    if (body.action === 'login') {
      const { data, error } = await admin.auth.signInWithPassword({
        email:    body.email,
        password: body.password,
      });

      if (error || !data.session) {
        // Compteur conservé en cas d'échec — pas de reset
        return NextResponse.json(
          { error: 'Email ou mot de passe incorrect' },
          { status: 401 }
        );
      }

      // Succès : réinitialiser le compteur pour cette IP
      resetAuthRateLimit(clientIp);

      const { data: boulangerie } = await admin
        .from('boulangeries')
        .select('id, nom, slug, plan')
        .eq('user_id', data.user.id)
        .single();

      return NextResponse.json({
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
        user:          { id: data.user.id, email: data.user.email },
        boulangerie,
      });
    }

    // ── Register ─────────────────────────────────────────────

    if (body.action === 'register') {
      if (!isValidSlug(body.slug)) {
        return NextResponse.json(
          {
            error:
              'Slug invalide. Utilisez uniquement des lettres minuscules, chiffres et tirets. ' +
              'Certains slugs sont réservés (api, admin, www…)',
          },
          { status: 400 }
        );
      }

      const passwordValidation = validatePasswordStrength(body.password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { error: `Le mot de passe doit contenir : ${passwordValidation.errors.join(', ')}.` },
          { status: 400 }
        );
      }

      const { data: existing } = await admin
        .from('boulangeries')
        .select('id')
        .eq('slug', body.slug)
        .single();

      if (existing) {
        return NextResponse.json({ error: 'Ce slug est déjà utilisé' }, { status: 409 });
      }

      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email:         body.email,
        password:      body.password,
        email_confirm: true,
      });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      const { data: boulangerie, error: boulangerieError } = await admin
        .from('boulangeries')
        .insert({
          user_id:       authData.user.id,
          nom:           body.nom,
          slug:          body.slug,
          email_contact: body.email,
          plan:          'starter',
          actif:         true,
        })
        .select()
        .single();

      if (boulangerieError) {
        // Rollback : supprimer l'utilisateur Supabase créé
        await admin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: 'Erreur création boulangerie' }, { status: 500 });
      }

      const { data: session } = await admin.auth.signInWithPassword({
        email:    body.email,
        password: body.password,
      });

      // Email de bienvenue (non bloquant)
      const fromDomain = process.env.RESEND_FROM_DOMAIN;
      const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sauve-mie.fr';
      resend.emails.send({
        from:    fromDomain ? `Sauve Mie <noreply@${fromDomain}>` : 'Sauve Mie <onboarding@resend.dev>',
        to:      body.email,
        subject: `🥖 Bienvenue sur Sauve Mie — ${body.nom} est prête !`,
        html: `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;background:#fafafa;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.05)">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:30px 20px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">🥖 Bienvenue sur Sauve Mie !</h1>
    </div>
    <div style="padding:30px 20px">
      <p style="font-size:16px;color:#374151">Bonjour,</p>
      <p style="font-size:16px;color:#374151">
        Votre boulangerie <strong>${body.nom}</strong> est créée et prête à l'emploi.<br>
        Connectez-vous pour saisir votre production du matin, gérer vos paniers flash et générer vos premiers rapports IA.
      </p>
      <div style="text-align:center;margin:30px 0">
        <a href="${appUrl}/boulanger" style="background:#f59e0b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px">
          Accéder à mon tableau de bord
        </a>
      </div>
      <p style="font-size:13px;color:#6b7280">
        En cas de question, répondez directement à cet email.<br>
        À très bientôt — L'équipe Sauve Mie
      </p>
    </div>
  </div>
</body></html>`,
        text: `Bienvenue sur Sauve Mie !\n\nVotre boulangerie ${body.nom} est créée.\nConnectez-vous : ${appUrl}/boulanger\n\nL'équipe Sauve Mie`,
      }).catch(e => console.warn('[auth/register] email bienvenue non envoyé:', e));

      return NextResponse.json(
        {
          access_token:  session?.session?.access_token,
          refresh_token: session?.session?.refresh_token,
          user:          { id: authData.user.id, email: body.email },
          boulangerie,
        },
        { status: 201 }
      );
    }

  } catch (err) {
    console.error('[/api/boulanger/auth POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}