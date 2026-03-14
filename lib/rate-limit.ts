// lib/rate-limit.ts
//
// BC3 FIX : Le rate limiting en mémoire (Map) ne fonctionne pas entre les
// instances serverless (Netlify/Vercel). Chaque invocation peut tomber sur
// une instance froide avec une Map vide.
//
// Stratégie adoptée :
// - Couche 1 (IP) : on conserve la Map en mémoire MAIS on l'utilise comme
//   "best-effort" sur une même instance. Pour une protection robuste,
//   ajouter Upstash Redis (voir commentaire ci-dessous).
// - Couche 2 (email/Supabase) : déjà persistante → fonctionne correctement.
//
// Pour migrer vers Upstash Redis (recommandé en production) :
//   npm install @upstash/ratelimit @upstash/redis
//   Remplacer isMemoryRateLimited par le Ratelimit d'Upstash.

// ── Couche 1 : Map en mémoire (best-effort par instance) ──────

interface RateLimitEntry {
  count:   number;
  resetAt: number;
}

const ipStore = new Map<string, RateLimitEntry>();

// Nettoyage périodique — Array.from() requis pour target ES2017+
setInterval(() => {
  const now = Date.now();
  Array.from(ipStore.entries()).forEach(([key, entry]) => {
    if (entry.resetAt < now) ipStore.delete(key);
  });
}, 5 * 60 * 1000);

interface MemoryLimitConfig {
  windowMs: number;
  maxCalls: number;
}

/**
 * Rate limiting en mémoire — best-effort sur une même instance serverless.
 * Protège contre les abus simples sur une même instance chaude.
 * Pour une protection cross-instances, utiliser Upstash Redis.
 */
export function isMemoryRateLimited(
  key: string,
  config: MemoryLimitConfig = { windowMs: 60 * 60 * 1000, maxCalls: 5 }
): boolean {
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

// ── Couche 2 : Supabase (par email, 24h glissantes) ───────────
// Cette couche fonctionne correctement en serverless car elle interroge
// la base de données persistante.

interface SupabaseLimitConfig {
  maxOrdersPer24h: number;
}

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
    return false; // fail open — ne jamais bloquer une commande légitime sur erreur
  }
}

// ── NOTE : Migration Upstash Redis ────────────────────────────
// Pour une protection robuste cross-instances en production :
//
// import { Ratelimit } from '@upstash/ratelimit';
// import { Redis }     from '@upstash/redis';
//
// const ratelimit = new Ratelimit({
//   redis: Redis.fromEnv(),
//   limiter: Ratelimit.slidingWindow(5, '1 h'),
// });
//
// export async function isUpstashRateLimited(ip: string): Promise<boolean> {
//   const { success } = await ratelimit.limit(`orders:${ip}`);
//   return !success;
// }