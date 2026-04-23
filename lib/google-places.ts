// lib/google-places.ts
// ─────────────────────────────────────────────────────────────
// Fetch contexte quartier via Google Places API (Nearby Search + Place Details)
// avec cache DB 30 jours (table `neighborhood_cache`).
//
// Appels serveur uniquement — la clé GOOGLE_PLACES_API_KEY ne doit JAMAIS
// être exposée côté client.
//
// Fallback gracieux : si la clé est absente ou un appel échoue, on retourne
// `null` et le rapport mensuel est généré sans contexte quartier.
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types exportés ────────────────────────────────────────────

export interface NeighborhoodData {
  type_quartier: string;
  density_score: number;
  concurrents: Array<{
    nom: string;
    distance_m: number;
    note_google: number | null;
    nombre_avis: number | null;
    type: string;
  }>;
  commerces_proximite: {
    boulangeries: number;
    cafes: number;
    restaurants: number;
    ecoles: number;
    bureaux: number;
    supermarches: number;
  };
  population_estimee_rayon_500m: number | null;
  source: 'google_places' | 'cache';
  fetched_at: string;
}

// ── Constantes ────────────────────────────────────────────────

const CACHE_TTL_DAYS    = 30;
const RADIUS_METERS     = 800;
/** Délai min entre deux tentatives d'appel Google Places (anti-boucle bug) */
const COOLDOWN_HOURS    = 24;
/** Cap absolu de tentatives avant reset manuel (anti-explosion facture) */
const MAX_FETCH_ATTEMPTS = 3;
/** Timeout court sur chaque requête pour éviter que le rapport bloque */
const FETCH_TIMEOUT_MS  = 8_000;

const PLACE_TYPES = {
  boulangeries: 'bakery',
  cafes:        'cafe',
  restaurants:  'restaurant',
  ecoles:       'school',
  bureaux:      'accounting', // proxy : pas de "office" générique dans Places
  supermarches: 'supermarket',
} as const;

// ── Helpers ───────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GooglePlace {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
}

interface NearbyResponse {
  results?: GooglePlace[];
  status: string;
  error_message?: string;
}

async function nearbySearch(lat: number, lng: number, type: string, apiKey: string): Promise<GooglePlace[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(RADIUS_METERS));
  url.searchParams.set('type', type);
  url.searchParams.set('key', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`Google Places ${type} → HTTP ${res.status}`);
    const json = (await res.json()) as NearbyResponse;
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places ${type} → ${json.status}: ${json.error_message ?? '?'}`);
    }
    return json.results ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function classifyQuartier(counts: NeighborhoodData['commerces_proximite']): { type: string; density: number } {
  const density = counts.boulangeries + counts.cafes + counts.restaurants + counts.ecoles + counts.bureaux + counts.supermarches;

  if (counts.ecoles >= 2 && counts.bureaux < 3) return { type: 'residentiel_familial', density };
  if (counts.bureaux >= 5)                      return { type: 'affaires',             density };
  if (counts.restaurants >= 8 && counts.cafes >= 5) return { type: 'centre_ville',     density };
  if (counts.supermarches >= 2)                 return { type: 'commercant_dense',     density };
  if (density < 8)                              return { type: 'residentiel_calme',    density };
  return { type: 'mixte', density };
}

// Très grossier : proxy population ≈ density × facteur
function estimatePopulation(counts: NeighborhoodData['commerces_proximite']): number | null {
  const density = counts.boulangeries + counts.cafes + counts.restaurants + counts.ecoles + counts.supermarches;
  if (density === 0) return null;
  return Math.round(density * 180);
}

// ── API principale ────────────────────────────────────────────

/**
 * Récupère le contexte quartier d'une boulangerie.
 *
 * Ordre des gardes :
 *  1. Cache DB valide (< 30j)            → return cache
 *  2. Cooldown 24h depuis dernière tentative → return null (anti-boucle)
 *  3. Cap 3 tentatives dépassé            → return null (anti-explosion facture)
 *  4. Clé API absente                     → return null
 *  5. Marque la tentative EN DB avant l'appel (bloque concurrents)
 *  6. Appel Google Places (timeout 8s)
 *  7. Succès → upsert data + reset compteur
 *     Échec  → garde compteur incrémenté, stocke erreur
 *
 * Dans TOUS les cas : ne throw jamais, renvoie null sur tout problème.
 */
export async function fetchNeighborhood(
  admin: SupabaseClient,
  boulangerieId: string,
): Promise<NeighborhoodData | null> {
  try {
    // 1. Lecture cache + tracking
    const { data: cached } = await admin
      .from('neighborhood_cache')
      .select('data, expires_at, fetch_attempts, last_attempt_at')
      .eq('boulangerie_id', boulangerieId)
      .maybeSingle();

    const now = Date.now();

    // Cache valide ?
    if (cached?.data && cached.expires_at && new Date(cached.expires_at as string).getTime() > now) {
      return { ...(cached.data as NeighborhoodData), source: 'cache' };
    }

    // Cooldown : dernière tentative < 24h → on ne refait pas (anti-boucle)
    const lastAttempt = cached?.last_attempt_at ? new Date(cached.last_attempt_at as string).getTime() : 0;
    if (lastAttempt > 0 && (now - lastAttempt) < COOLDOWN_HOURS * 3600 * 1000) {
      console.warn(`[google-places] cooldown actif pour ${boulangerieId} (dernier appel < ${COOLDOWN_HOURS}h)`);
      return null;
    }

    // Cap absolu de tentatives
    const attempts = (cached?.fetch_attempts as number | null) ?? 0;
    if (attempts >= MAX_FETCH_ATTEMPTS) {
      console.warn(`[google-places] cap atteint pour ${boulangerieId} (${attempts}/${MAX_FETCH_ATTEMPTS}) — reset manuel requis`);
      return null;
    }

    // 2. Coordonnées
    const { data: boul } = await admin
      .from('boulangeries')
      .select('latitude, longitude')
      .eq('id', boulangerieId)
      .single();

    const lat = boul?.latitude ? Number(boul.latitude) : null;
    const lng = boul?.longitude ? Number(boul.longitude) : null;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    // 3. Clé API
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn('[google-places] GOOGLE_PLACES_API_KEY absent — pas de contexte quartier');
      return null;
    }

    // 4. MARQUE LA TENTATIVE AVANT l'appel (bloque retries concurrents)
    const attemptAt = new Date().toISOString();
    await admin
      .from('neighborhood_cache')
      .upsert(
        {
          boulangerie_id:  boulangerieId,
          fetch_attempts:  attempts + 1,
          last_attempt_at: attemptAt,
          // expires_at requis NOT NULL : placeholder court (recalculé en cas de succès)
          expires_at:      cached?.expires_at ?? attemptAt,
        },
        { onConflict: 'boulangerie_id' },
      );

    // 5. Appels Google Places
    let data: NeighborhoodData;
    try {
      const [bakeries, cafes, restaurants, schools, offices, supermarkets] = await Promise.all([
        nearbySearch(lat, lng, PLACE_TYPES.boulangeries, apiKey),
        nearbySearch(lat, lng, PLACE_TYPES.cafes,        apiKey),
        nearbySearch(lat, lng, PLACE_TYPES.restaurants,  apiKey),
        nearbySearch(lat, lng, PLACE_TYPES.ecoles,       apiKey),
        nearbySearch(lat, lng, PLACE_TYPES.bureaux,      apiKey),
        nearbySearch(lat, lng, PLACE_TYPES.supermarches, apiKey),
      ]);

      const commerces: NeighborhoodData['commerces_proximite'] = {
        boulangeries: bakeries.length,
        cafes:        cafes.length,
        restaurants:  restaurants.length,
        ecoles:       schools.length,
        bureaux:      offices.length,
        supermarches: supermarkets.length,
      };

      const concurrents = bakeries
        .map(b => ({
          nom:          b.name,
          distance_m:   Math.round(haversineMeters(lat, lng, b.geometry.location.lat, b.geometry.location.lng)),
          note_google:  b.rating ?? null,
          nombre_avis:  b.user_ratings_total ?? null,
          type:         'boulangerie',
        }))
        .sort((a, b) => a.distance_m - b.distance_m)
        .slice(0, 10);

      const { type, density } = classifyQuartier(commerces);

      data = {
        type_quartier: type,
        density_score: density,
        concurrents,
        commerces_proximite: commerces,
        population_estimee_rayon_500m: estimatePopulation(commerces),
        source: 'google_places',
        fetched_at: new Date().toISOString(),
      };
    } catch (apiErr) {
      // L'appel Google Places a échoué → on garde fetch_attempts incrémenté
      // (déjà marqué en DB ci-dessus), on stocke l'erreur pour debug.
      const msg = apiErr instanceof Error ? apiErr.message.slice(0, 400) : 'inconnue';
      console.error('[google-places] fetch error', apiErr);
      await admin
        .from('neighborhood_cache')
        .update({ last_error: msg })
        .eq('boulangerie_id', boulangerieId);
      return null;
    }

    // 6. Succès → upsert cache complet + reset compteur
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
    const { error: upErr } = await admin
      .from('neighborhood_cache')
      .upsert(
        {
          boulangerie_id:  boulangerieId,
          data,
          fetched_at:      data.fetched_at,
          expires_at:      expiresAt,
          fetch_attempts:  0,
          last_attempt_at: data.fetched_at,
          last_error:      null,
        },
        { onConflict: 'boulangerie_id' },
      );
    if (upErr) console.warn('[google-places] cache upsert failed', upErr);

    return data;
  } catch (unexpected) {
    // Filet de sécurité : rien ne doit remonter de cette fonction
    console.error('[google-places] unexpected error', unexpected);
    return null;
  }
}
