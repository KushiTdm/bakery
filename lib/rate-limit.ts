// lib/rate-limit.ts
// ─────────────────────────────────────────────────────────────
// Rate limiting en deux niveaux :
//
//   Niveau 1 (IP) — Upstash Redis en production, Map en mémoire en dev.
//     S'applique UNIQUEMENT aux commandes client (/api/orders),
//     JAMAIS à l'authentification boulanger.
//
//   Niveau 2 (email/Supabase) — 24h glissantes sur les commandes.
//
// IMPORTANT : l'auth Supabase (OTP) a son propre rate limiting géré
// directement par Supabase (configurable dans Dashboard → Auth → Settings).
// Ne pas ajouter de rate limit applicatif sur les routes d'auth.
// ─────────────────────────────────────────────────────────────

interface MemoryLimitConfig {
  windowMs: number;
  maxCalls: number;
}

interface SupabaseLimitConfig {
  maxOrdersPer24h: number;
}

// ── Niveau 1A : Upstash Redis (production) ───────────────────

async function isUpstashRateLimited(
  key: string,
  config: MemoryLimitConfig
): Promise<boolean> {
  try {
    const { Ratelimit } = await import('@upstash/ratelimit');
    const { Redis }     = await import('@upstash/redis');

    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        config.maxCalls,
        `${Math.round(config.windowMs / 1000)} s`
      ),
      analytics: false,
    });

    const { success } = await ratelimit.limit(key);
    return !success;

  } catch (err) {
    // Fail-open : Upstash inaccessible ne doit pas bloquer les commandes
    console.warn('[rate-limit] Upstash inaccessible, fail-open:', (err as Error).message);
    return false;
  }
}

// ── Niveau 1B : Map en mémoire (dev / fallback sans Upstash) ─

interface RateLimitEntry {
  count:   number;
  resetAt: number;
}

const ipStore = new Map<string, RateLimitEntry>();

// Nettoyage automatique des entrées expirées
setInterval(() => {
  const now = Date.now();
  Array.from(ipStore.entries()).forEach(([key, entry]) => {
    if (entry.resetAt < now) ipStore.delete(key);
  });
}, 5 * 60 * 1000);

function isMemoryRateLimitedSync(key: string, config: MemoryLimitConfig): boolean {
  const now   = Date.now();
  const entry = ipStore.get(key);

  if (!entry || entry.resetAt < now) {
    ipStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return false;
  }

  if (entry.count >= config.maxCalls) return true;
  entry.count++;
  return false;
}

// ── Export principal ──────────────────────────────────────────
// À utiliser UNIQUEMENT pour les commandes (/api/orders).
// Ne jamais appeler depuis les routes d'authentification.

export async function isMemoryRateLimited(
  key: string,
  config: MemoryLimitConfig = { windowMs: 60 * 60 * 1000, maxCalls: 5 }
): Promise<boolean> {
  const hasUpstash =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN;

  if (hasUpstash) {
    return isUpstashRateLimited(key, config);
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[rate-limit] UPSTASH_REDIS_REST_URL non configuré. ' +
      'Rate limiting IP inactif entre instances serverless. ' +
      'Ajoutez UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.'
    );
  }

  return isMemoryRateLimitedSync(key, config);
}

// ── Niveau 2 : Supabase (email, 24h glissantes) ───────────────
// Pour limiter les commandes par email uniquement.

export async function isSupabaseRateLimited(
  supabase: ReturnType<typeof import('@/lib/supabase').getSupabaseAdmin>,
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