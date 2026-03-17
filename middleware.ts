// middleware.ts
// ─────────────────────────────────────────────────────────────
// Protection SSR des routes /boulanger/:path+
//
// Vérifie en un seul appel RPC (check_boulanger_access) si l'utilisateur
// est owner OU employé actif. Owner = entrée dans boulangeries.
// Employé = entrée actif dans employes.
// La page /boulanger (exact) gère son propre état (LoginForm/AppShell).
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
    path.startsWith('/boulanger/rejoindre') || // Acceptation invitation
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