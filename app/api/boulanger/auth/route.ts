// app/api/boulanger/auth/route.ts
// Auth boulanger — email + password (pas d'OTP).

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidSlug } from '@/lib/sanitize';

// ── Rate Limiting (memory-based, simple) ───────────────────────
// Pour une production à grande échelle, utiliser Upstash Redis

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

// Nettoyage automatique des entrées expirées
setInterval(() => {
  const now = Date.now();
  Array.from(loginAttempts.entries()).forEach(([key, entry]) => {
    if (entry.resetAt < now) loginAttempts.delete(key);
  });
}, 60 * 1000);

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

function checkRateLimit(ip: string): { allowed: boolean; remainingMs: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remainingMs: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, remainingMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remainingMs: 0 };
}

function resetRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

// ── S4 : Validation de la complexité du mot de passe ───────────

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('au moins 8 caractères');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('une lettre minuscule');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('une lettre majuscule');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('un chiffre');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

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
  const clientIp = getClientIp(req);

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

      // Rate limiting sur les tentatives de login
      const rateCheck = checkRateLimit(clientIp);
      if (!rateCheck.allowed) {
        const retryMinutes = Math.ceil(rateCheck.remainingMs / 60000);
        return NextResponse.json(
          { error: `Trop de tentatives. Réessayez dans ${retryMinutes} minute(s).` },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.remainingMs / 1000)) } }
        );
      }

      const { data, error } = await admin.auth.signInWithPassword({ email, password });

      if (error) {
        // Ne pas reset le rate limit en cas d'échec (laisser le compteur incrémenté)
        return NextResponse.json(
          { error: 'Email ou mot de passe incorrect' },
          { status: 401 }
        );
      }

      // Succès : reset le rate limit pour cette IP
      resetRateLimit(clientIp);

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
      // Rate limiting sur les inscriptions également
      const rateCheck = checkRateLimit(clientIp);
      if (!rateCheck.allowed) {
        const retryMinutes = Math.ceil(rateCheck.remainingMs / 60000);
        return NextResponse.json(
          { error: `Trop de tentatives. Réessayez dans ${retryMinutes} minute(s).` },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.remainingMs / 1000)) } }
        );
      }

      if (!email || !password || !nom || !slug) {
        return NextResponse.json(
          { error: 'Email, mot de passe, nom et slug requis' },
          { status: 400 }
        );
      }

      // S1 : Validation du slug avec isValidSlug()
      if (!isValidSlug(slug)) {
        return NextResponse.json(
          { error: 'Slug invalide. Utilisez uniquement des lettres minuscules, chiffres et tirets. Certains slugs sont réservés (api, admin, www...).' },
          { status: 400 }
        );
      }

      // S4 : Validation de la complexité du mot de passe
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { error: `Le mot de passe doit contenir : ${passwordValidation.errors.join(', ')}.` },
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