// lib/rate-limit.ts
// ─────────────────────────────────────────────────────────────
// Rate limiting en trois niveaux :
//
//   Niveau 1 (IP commandes) — isMemoryRateLimited()
//     Upstash Redis en production, Map en mémoire en dev.
//     S'applique UNIQUEMENT aux commandes client (/api/orders).
//
//   Niveau 2 (IP auth) — isAuthRateLimited() / resetAuthRateLimit()
//     Même infrastructure (Upstash + fallback mémoire).
//     S'applique UNIQUEMENT à l'auth boulanger (/api/boulanger/auth).
//     Paramètres plus stricts : 5 tentatives / 15 min.
//
//   Niveau 3 (email/Supabase) — isSupabaseRateLimited()
//     24h glissantes sur les commandes, via comptage en base.
//
// IMPORTANT : l'auth Supabase OTP a son propre rate limiting géré
// directement par Supabase (Dashboard → Auth → Settings).
// ─────────────────────────────────────────────────────────────

import type { getSupabaseAdmin } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────

interface MemoryLimitConfig {
  windowMs: number;
  maxCalls: number;
}

interface RateLimitResult {
  blocked:      boolean;
  retryAfterMs: number;
}

interface SupabaseLimitConfig {
  maxOrdersPer24h: number;
}

interface RateLimitEntry {
  count:   number;
  resetAt: number;
}

// ── Singleton Upstash (lazy init, survit aux requêtes chaudes) ─

let _upstashClient: import('@upstash/redis').Redis | null = null;

async function getUpstashClient(): Promise<import('@upstash/redis').Redis | null> {
  if (_upstashClient) return _upstashClient;

  const hasUpstash =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!hasUpstash) return null;

  try {
    const { Redis } = await import('@upstash/redis');
    _upstashClient  = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return _upstashClient;
  } catch (err) {
    console.warn('[rate-limit] Impossible d\'initialiser Upstash:', (err as Error).message);
    return null;
  }
}

// ── Niveau 1A : Upstash Redis (production) ───────────────────
// Fonction unifiée — retourne { blocked, retryAfterMs } pour tous les usages.
// Retourne null si Upstash est absent ou en erreur → déléguer au fallback mémoire.

async function checkUpstashRateLimit(
  key: string,
  config: MemoryLimitConfig
): Promise<RateLimitResult | null> {
  const redis = await getUpstashClient();
  if (!redis) return null;

  try {
    const { Ratelimit } = await import('@upstash/ratelimit');

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        config.maxCalls,
        `${Math.round(config.windowMs / 1000)} s`
      ),
      analytics: false,
    });

    const { success, reset } = await ratelimit.limit(key);
    return {
      blocked:      !success,
      retryAfterMs: success ? 0 : Math.max(0, reset - Date.now()),
    };

  } catch (err) {
    // Fail-open : Upstash inaccessible ne bloque pas les utilisateurs
    console.warn('[rate-limit] Upstash inaccessible, fail-open:', (err as Error).message);
    return null;
  }
}

// ── Niveau 1B : Map en mémoire (dev / fallback sans Upstash) ─

// Stores séparés pour éviter les collisions de clés entre auth et commandes
const ipStoreOrders = new Map<string, RateLimitEntry>();
const ipStoreAuth   = new Map<string, RateLimitEntry>();

// Nettoyage automatique des entrées expirées (toutes les 5 min)
setInterval(() => {
  const now = Date.now();
  for (const store of [ipStoreOrders, ipStoreAuth]) {
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  }
}, 5 * 60 * 1000);

function checkMemoryRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  config: MemoryLimitConfig
): RateLimitResult {
  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { blocked: false, retryAfterMs: 0 };
  }

  if (entry.count >= config.maxCalls) {
    return { blocked: true, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { blocked: false, retryAfterMs: 0 };
}

// ── Helper interne partagé ────────────────────────────────────

async function resolveRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  config: MemoryLimitConfig,
  namespace: string
): Promise<RateLimitResult> {
  const upstashResult = await checkUpstashRateLimit(key, config);
  if (upstashResult !== null) return upstashResult;

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[rate-limit:${namespace}] UPSTASH_REDIS_REST_URL non configuré. ` +
      'Rate limiting IP inactif entre instances serverless. ' +
      'Ajoutez UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.'
    );
  }

  return checkMemoryRateLimit(store, key, config);
}

// ── Niveau 1 Export — Commandes (/api/orders) ────────────────

const ORDERS_CONFIG: MemoryLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 heure
  maxCalls: 5,
};

export async function isMemoryRateLimited(
  key: string,
  config: MemoryLimitConfig = ORDERS_CONFIG
): Promise<boolean> {
  const result = await resolveRateLimit(ipStoreOrders, key, config, 'orders');
  return result.blocked;
}

// ── Niveau 2 Export — Auth (/api/boulanger/auth) ─────────────

const AUTH_CONFIG: MemoryLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxCalls: 5,
};

/**
 * Vérifie si l'IP a dépassé le quota de tentatives d'authentification.
 * Utilise Upstash Redis si disponible, sinon fallback mémoire.
 *
 * @returns { blocked, retryAfterMs } — retryAfterMs > 0 si bloqué
 */
export async function isAuthRateLimited(
  ip: string
): Promise<RateLimitResult> {
  return resolveRateLimit(ipStoreAuth, `auth:${ip}`, AUTH_CONFIG, 'auth');
}

/**
 * Réinitialise le compteur mémoire d'une IP après un login réussi.
 * Sans effet sur Upstash — la fenêtre expire naturellement.
 */
export function resetAuthRateLimit(ip: string): void {
  ipStoreAuth.delete(`auth:${ip}`);
}

// ── Niveau 3 : Supabase (email, 24h glissantes) ───────────────

export async function isSupabaseRateLimited(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  boulangerieId: string,
  config: SupabaseLimitConfig = { maxOrdersPer24h: 3 }
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('commandes')
      .select('*', { count: 'exact', head: true })
      .eq('boulangerie_id', boulangerieId)
      .eq('client_email', email)
      .gte('created_at', since);

    if (error) {
      console.warn('[rate-limit] Supabase count failed, skipping:', error.message);
      return false;
    }

    return (count ?? 0) >= config.maxOrdersPer24h;
  } catch {
    return false;
  }
}