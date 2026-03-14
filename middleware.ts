// middleware.ts
// CORRECTIF TS2305 :
//   createMiddlewareClient n'existe pas dans @supabase/auth-helpers-nextjs.
//   Le projet utilise @supabase/ssr — on remplace par createServerClient
//   avec l'API cookies() compatible Next.js middleware.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res  = NextResponse.next();
  const path = req.nextUrl.pathname;

  // ── 1. Routes publiques — ne jamais intercepter ─────────────
  const PUBLIC_PATHS = [
    '/boulanger/login',
    '/boulanger/auth',
    '/boulanger/register',
  ];

  if (PUBLIC_PATHS.some(p => path.startsWith(p))) {
    return res;
  }

  // ── 2. Vérification session via @supabase/ssr ───────────────
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // En middleware on écrit sur la response, pas la request
            cookiesToSet.forEach(({ name, value, options }) =>
              res.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/boulanger/login';
      loginUrl.searchParams.set('redirect', path);
      return NextResponse.redirect(loginUrl);
    }
  } catch (err) {
    // Erreur Supabase → laisser passer plutôt que boucler
    console.error('[middleware]', err);
    return res;
  }

  return res;
}

export const config = {
  matcher: ['/boulanger/:path+'], // :path+ exclut /boulanger exact
};