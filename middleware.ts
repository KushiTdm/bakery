// middleware.ts
// ─────────────────────────────────────────────────────────────
// Protection SSR des routes /boulanger/:path+
//
// NOTE ARCHITECTURE : Le boulanger s'authentifie via supabase.signInWithPassword()
// côté client, qui stocke la session en localStorage (pas en cookies).
// Le createServerClient lit les cookies → incompatible pour les sous-pages.
// Les sous-pages gèrent leur propre auth via BoulangerProvider (client-side).
// Seules les pages sans leur propre guard méritent la protection SSR.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res  = NextResponse.next();
  const path = req.nextUrl.pathname;

  // Routes publiques — jamais interceptées
  // Les sous-pages /boulanger/* gèrent leur propre auth via BoulangerProvider
  // (session stockée en localStorage, pas en cookies → SSR blind)
  if (
    path === '/boulanger' ||
    path.startsWith('/boulanger/login') ||
    path.startsWith('/boulanger/rejoindre') || // Acceptation invitation
    path.startsWith('/boulanger/commandes') ||  // Auth gérée client-side par useBoulanger
    path.startsWith('/api/') ||
    path === '/auth/callback'
  ) {
    return res;
  }

  // ── Protection /boulanger/* ───────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 1. Session valide ?
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/?auth=required', req.url));
  }

  // 2. Owner OU employé actif ?
  //    check_boulanger_access() est SECURITY DEFINER — bypass RLS.
  //    Retourne boulangerie_id ou null.
  const { data: boulangerieId, error } = await supabase.rpc(
    'check_boulanger_access',
    { p_user_id: session.user.id }
  );

  if (error || !boulangerieId) {
    return NextResponse.redirect(new URL('/?error=unauthorized', req.url));
  }

  // 3. Injecter boulangerie_id dans les headers (disponible dans Server Components)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-boulangerie-id', boulangerieId as string);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Intercepte tous les sous-chemins de /boulanger (pas /boulanger exact)
export const config = {
  matcher: ['/boulanger/:path+'],
};