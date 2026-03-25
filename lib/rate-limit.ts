// lib/rate-limit.ts
// ─────────────────────────────────────────────────────────────
// Rate limiting en trois niveaux :
//
//   Niveau 1 (IP commandes) — isMemoryRateLimited()
//   Niveau 2 (IP auth) — isAuthRateLimited() / resetAuthRateLimit()
//   Niveau 3 (email/Supabase) — isSupabaseRateLimited()
//
// TEST BYPASS : si BYPASS_RATE_LIMIT=true, toutes les vérifications
// retournent { blocked: false } — à activer uniquement en test/CI.
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

// ── Bypass test environment ────────────────────────────────────
// Activer via BYPASS_RATE_LIMIT=true dans .env.test ou playwright.config.ts webServer env

function isTestBypassEnabled(): boolean {
  return process.env.BYPASS_RATE_LIMIT === 'true';
}

const TEST_BYPASS_RESULT: RateLimitResult = { blocked: false, retryAfterMs: 0 };

// ── Singleton Upstash (lazy init) ──────────────────────────────

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

// ── Niveau 1A : Upstash Redis ─────────────────────────────────

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
    console.warn('[rate-limit] Upstash inaccessible, fail-open:', (err as Error).message);
    return null;
  }
}

// ── Niveau 1B : Map en mémoire ────────────────────────────────

const ipStoreOrders = new Map<string, RateLimitEntry>();
const ipStoreAuth   = new Map<string, RateLimitEntry>();

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

// ── Helper interne partagé ─────────────────────────────────────

async function resolveRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  config: MemoryLimitConfig,
  namespace: string
): Promise<RateLimitResult> {
  // Bypass pour les tests automatisés
  if (isTestBypassEnabled()) return TEST_BYPASS_RESULT;

  const upstashResult = await checkUpstashRateLimit(key, config);
  if (upstashResult !== null) return upstashResult;

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[rate-limit:${namespace}] UPSTASH_REDIS_REST_URL non configuré. ` +
      'Rate limiting IP inactif entre instances serverless.'
    );
  }

  return checkMemoryRateLimit(store, key, config);
}

// ── Niveau 1 Export — Commandes ───────────────────────────────

const ORDERS_CONFIG: MemoryLimitConfig = {
  windowMs: 60 * 60 * 1000,
  maxCalls: 5,
};

export async function isMemoryRateLimited(
  key: string,
  config: MemoryLimitConfig = ORDERS_CONFIG
): Promise<boolean> {
  const result = await resolveRateLimit(ipStoreOrders, key, config, 'orders');
  return result.blocked;
}

// ── Niveau 2 Export — Auth ────────────────────────────────────

const AUTH_CONFIG: MemoryLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxCalls: 5,
};

export async function isAuthRateLimited(
  ip: string
): Promise<RateLimitResult> {
  return resolveRateLimit(ipStoreAuth, `auth:${ip}`, AUTH_CONFIG, 'auth');
}

export function resetAuthRateLimit(ip: string): void {
  ipStoreAuth.delete(`auth:${ip}`);
}

// ── Niveau 3 : Supabase ───────────────────────────────────────

export async function isSupabaseRateLimited(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  boulangerieId: string,
  config: SupabaseLimitConfig = { maxOrdersPer24h: 3 }
): Promise<boolean> {
  // Bypass pour les tests
  if (isTestBypassEnabled()) return false;

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