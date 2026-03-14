// middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res  = NextResponse.next();
  const path = req.nextUrl.pathname;

  // ── Routes publiques — ne jamais intercepter ─────────────
  // /boulanger exact est géré par BoulangerProvider (LoginForm inline)
  // Seuls les sous-chemins protégés sont interceptés
  const PUBLIC_PATHS = [
    '/boulanger',           // Page principale — gère son propre auth state
    '/boulanger/login',     // Au cas où cette route serait créée plus tard
    '/boulanger/auth',
    '/boulanger/register',
  ];

  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    // Laisse passer /boulanger et /boulanger/xxx
    // La vérification auth est dans BoulangerProvider / BoulangerContext
    return res;
  }

  return res;
}

// N'intercepte que les routes boulanger
// Le matcher :path+ exclut /boulanger exact — mais on laisse tout passer
// car l'auth est gérée dans le contexte React, pas dans le middleware
export const config = {
  matcher: ['/boulanger/:path+'],
};