// middleware.ts
// ─────────────────────────────────────────────────────────────
// Protection SSR des routes boulanger.
//
// FIX S0 : Un client authentifié (OTP Magic Link) ne peut plus
// accéder à /boulanger/xxx. Seuls les utilisateurs ayant une
// entrée dans la table `boulangeries` sont autorisés.
//
// /boulanger (exact) est laissé passer — il affiche soit le
// LoginForm, soit l'AppShell qui a sa propre vérification.
// Les sous-chemins (/boulanger/commandes, etc.) sont protégés
// ici au niveau SSR avant même que React ne se charge.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res  = NextResponse.next();
  const path = req.nextUrl.pathname;

  // Routes publiques — jamais interceptées
  if (
    path === '/boulanger' ||
    path.startsWith('/boulanger/login') ||
    path.startsWith('/boulanger/register') ||
    path.startsWith('/api/') ||
    path === '/auth/callback'
  ) {
    return res;
  }

  // ── Protection des sous-chemins /boulanger/* ──────────────

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 1. Vérifier la session
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const redirectUrl = new URL('/', req.url);
    redirectUrl.searchParams.set('auth', 'required');
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Vérifier que l'utilisateur a une boulangerie (rôle owner)
  //    Un client OTP authentifié n'a pas de boulangerie → accès refusé
  const { data: boulangerie, error } = await supabase
    .from('boulangeries')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  if (error || !boulangerie) {
    const redirectUrl = new URL('/', req.url);
    redirectUrl.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

// Intercepte uniquement les sous-chemins (pas /boulanger exact)
export const config = {
  matcher: ['/boulanger/:path+'],
};