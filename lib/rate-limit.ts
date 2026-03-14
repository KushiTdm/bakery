// lib/rate-limit.ts

// ── Couche 1 : Map en mémoire ─────────────────────────────────

interface RateLimitEntry {
  count:     number;
  resetAt:   number; // timestamp ms
}

const ipStore = new Map<string, RateLimitEntry>();

// Nettoyage périodique pour éviter une fuite mémoire

setInterval(() => {
  const now = Date.now();
  Array.from(ipStore.entries()).forEach(([key, entry]) => {
    if (entry.resetAt < now) ipStore.delete(key);
  });
}, 5 * 60 * 1000); // toutes les 5 minutes

interface MemoryLimitConfig {
  windowMs:  number; // durée de la fenêtre en ms
  maxCalls:  number; // appels max pendant la fenêtre
}

/**
 * Vérifie la limite en mémoire pour une clé donnée (ex: IP).
 * Retourne true si la limite est dépassée.
 */
export function isMemoryRateLimited(
  key: string,
  config: MemoryLimitConfig = { windowMs: 60 * 60 * 1000, maxCalls: 5 }
): boolean {
  const now  = Date.now();
  const entry = ipStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Fenêtre expirée ou première requête
    ipStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return false;
  }

  if (entry.count >= config.maxCalls) {
    return true; // limite atteinte
  }

  entry.count++;
  return false;
}

// ── Couche 2 : Supabase (par email, 24h glissantes) ───────────

interface SupabaseLimitConfig {
  maxOrdersPer24h: number;
}

/**
 * Vérifie dans Supabase combien de commandes l'email
 * a passé dans les dernières 24h.
 * Utilise la table commandes existante — zéro table supplémentaire.
 *
 * Retourne true si la limite est dépassée.
 */
export async function isSupabaseRateLimited(
  supabase: ReturnType<typeof import('@/lib/supabase').getSupabaseAdmin>,
  email: string,
  boulangerieId: string,
  config: SupabaseLimitConfig = { maxOrdersPer24h: 5 }
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('commandes')
      .select('*', { count: 'exact', head: true }) // head=true → pas de données, juste le count
      .eq('boulangerie_id', boulangerieId)
      .eq('client_email', email)
      .gte('created_at', since);

    if (error) {
      // En cas d'erreur Supabase, on laisse passer (fail open)
      // pour ne pas bloquer de vraies commandes
      console.warn('[rate-limit] Supabase count failed, skipping:', error.message);
      return false;
    }

    return (count ?? 0) >= config.maxOrdersPer24h;
  } catch {
    return false; // fail open
  }
}