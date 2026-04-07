// lib/resolve-slug.ts
// ─────────────────────────────────────────────────────────────
// Résout le slug du tenant (boulangerie) courant.
//
// ARCHITECTURE MULTI-TENANT :
//   Production  → sous-domaine
//                 monpain.sauvemie.fr            → "monpain"
//                 boulangerie-dupont.sauvemie.fr → "boulangerie-dupont"
//
//   Dev local   → ?slug=xxx  OU  NEXT_PUBLIC_BAKERY_SLUG
//                 localhost:3000?slug=artisan-dore
//
// DOMAINE RACINE configuré via NEXT_PUBLIC_ROOT_DOMAIN (.env.local)
//   Ex: NEXT_PUBLIC_ROOT_DOMAIN=sauvemie.fr
//
// SÉCURITÉ :
//   - Slug validé regex avant toute utilisation
//   - Retourne null si indéterminable en prod → 404 propre chez l'appelant
//   - Jamais de fallback silencieux en production
// ─────────────────────────────────────────────────────────────

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'sauvemie.fr';

// Slug valide : alphanumérique + tirets internes, 2–60 chars
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/;

// Sous-domaines réservés — jamais des slugs boulangerie
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp', 'boulanger']);

export interface SlugResolution {
  slug:   string;
  source: 'subdomain' | 'env' | 'queryparam' | 'localhost-default';
}

function isValidSlug(s: string): boolean {
  return Boolean(s) && SLUG_REGEX.test(s) && !RESERVED.has(s);
}

/**
 * Résout le slug côté CLIENT (navigateur / composants React).
 * Retourne null pendant le SSR ou si indéterminable en production.
 */
export function resolveSlugClient(): SlugResolution | null {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname.toLowerCase();
  const isDev    = hostname === 'localhost'
                || hostname.startsWith('127.')
                || hostname.startsWith('192.168.');

  // 1. Env var — override absolu, pratique pour Netlify preview deploys
  const envSlug = process.env.NEXT_PUBLIC_BAKERY_SLUG?.trim().toLowerCase();
  if (envSlug && isValidSlug(envSlug)) {
    return { slug: envSlug, source: 'env' };
  }

  // 2. Sous-domaine — chemin principal en production
  //    monpain.sauvemie.fr → slug = "monpain"
  if (!isDev) {
    const suffix = `.${ROOT_DOMAIN}`;
    if (hostname.endsWith(suffix)) {
      const sub = hostname.slice(0, hostname.length - suffix.length);
      if (isValidSlug(sub)) {
        return { slug: sub, source: 'subdomain' };
      }
    }
    // Production sans sous-domaine valide → refus, pas de devine
    return null;
  }

  // 3. Dev : query param pour tester plusieurs tenants sans changer .env
  //    localhost:3000?slug=artisan-dore
  const qp = new URLSearchParams(window.location.search).get('slug')?.trim().toLowerCase();
  if (qp && isValidSlug(qp)) {
    return { slug: qp, source: 'queryparam' };
  }

  // 4. Dev : fallback pour ne pas bloquer le hot-reload
  return { slug: 'artisan-dore', source: 'localhost-default' };
}

/**
 * Résout le slug côté SERVEUR (API Routes, middleware Next.js).
 * Utilise le header Host de la requête.
 *
 * @param hostHeader  req.headers.get('host')  →  "monpain.sauvemie.fr" ou "localhost:3000"
 */
export function resolveSlugServer(hostHeader: string | null): SlugResolution | null {
  if (!hostHeader) return null;

  // Retire le port éventuel
  const hostname = hostHeader.split(':')[0].toLowerCase();
  const isDev    = hostname === 'localhost' || hostname.startsWith('127.');

  const envSlug = process.env.NEXT_PUBLIC_BAKERY_SLUG?.trim().toLowerCase();
  if (envSlug && isValidSlug(envSlug)) {
    return { slug: envSlug, source: 'env' };
  }

  if (!isDev) {
    const suffix = `.${ROOT_DOMAIN}`;
    if (hostname.endsWith(suffix)) {
      const sub = hostname.slice(0, hostname.length - suffix.length);
      if (isValidSlug(sub)) {
        return { slug: sub, source: 'subdomain' };
      }
    }
    return null;
  }

  return { slug: 'artisan-dore', source: 'localhost-default' };
}