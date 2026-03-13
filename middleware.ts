// middleware.ts  — à placer à la RACINE du repo app (même niveau que /app)
// Protège toutes les routes /boulanger/* côté serveur via Supabase Auth.
// Next.js exécute ce fichier à l'edge AVANT le rendu : aucun flash de contenu.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Seules les routes /boulanger/* sont protégées
  if (!pathname.startsWith('/boulanger')) {
    return NextResponse.next()
  }

  // Crée la réponse modifiable pour que Supabase rafraîchisse les cookies
  let res = NextResponse.next({
    request: { headers: req.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () =>
          req.cookies.getAll().map(({ name, value }) => ({ name, value })),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // getUser() valide le JWT côté Supabase et rafraîchit la session si besoin
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Pas de session → redirige vers /boulanger (qui affiche le LoginForm)
    const loginUrl = new URL('/boulanger', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Injecte l'user_id dans un header custom pour les Server Components si besoin
  res.headers.set('x-boulanger-user-id', user.id)
  return res
}

export const config = {
  matcher: ['/boulanger/:path*'],
}