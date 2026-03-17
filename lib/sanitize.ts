// lib/sanitize.ts
// ─────────────────────────────────────────────────────────────
// Utilitaires de validation et sanitisation partagés.
// ─────────────────────────────────────────────────────────────

// ── Validation UUID ───────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function assertUUID(value: unknown, fieldName = 'id'): string {
  if (!isValidUUID(value)) {
    throw new Error(`${fieldName} invalide : doit être un UUID`);
  }
  return value;
}

// ── Validation slug (sous-domaine multi-tenant) ───────────────

const SLUG_REGEX    = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/;
const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp', 'boulanger',
  'dashboard', 'static', 'assets', 'cdn', 'dev', 'staging', 'prod',
]);

export function isValidSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SLUG_REGEX.test(value) &&
    !RESERVED_SLUGS.has(value)
  );
}

// ── Sanitisation des chaînes texte ────────────────────────────

/**
 * Supprime les caractères de contrôle Unicode et normalise les espaces.
 * Ne supprime pas les caractères non-ASCII (émojis, accents) — ils sont légitimes.
 */
export function sanitizeText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';

  return value
    // Caractères de contrôle (sauf \n, \r, \t)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalise les espaces multiples en un seul
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitise un nom de produit (texte court, pas de HTML).
 */
export function sanitizeProductName(value: unknown): string {
  return sanitizeText(value, 100);
}

/**
 * Sanitise une description (texte long, pas de HTML).
 */
export function sanitizeDescription(value: unknown): string {
  return sanitizeText(value, 500);
}

/**
 * Sanitise un emoji (1-4 caractères).
 */
export function sanitizeEmoji(value: unknown): string {
  if (typeof value !== 'string') return '🥖';
  // Garde uniquement les caractères emoji et symboles, max 4 chars
  return value.trim().slice(0, 4) || '🥖';
}

/**
 * Valide et nettoie un nombre positif.
 */
export function sanitizePositiveNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100) / 100; // 2 décimales max
}

/**
 * Valide un tableau de chaînes (allergènes, tags, etc.).
 * Filtre les valeurs vides et les doublons.
 */
export function sanitizeStringArray(value: unknown, allowedValues?: string[]): string[] {
  if (!Array.isArray(value)) return [];

  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => sanitizeText(item, 50))
    .filter(Boolean);

  const unique = [...new Set(cleaned)];

  if (allowedValues) {
    return unique.filter(item => allowedValues.includes(item));
  }

  return unique;
}

/**
 * Valide une URL (image externe).
 * N'accepte que http/https, refuse les data URIs et les URLs javascript:.
 */
export function sanitizeUrl(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    // Refuse les data URIs déguisées et les protocoles dangereux
    if (trimmed.toLowerCase().startsWith('javascript:')) return null;
    if (trimmed.toLowerCase().startsWith('data:')) return null;
    return trimmed.slice(0, 2048); // max 2KB pour une URL
  } catch {
    return null;
  }
}

/**
 * Valide une date au format YYYY-MM-DD.
 */
export function sanitizeDate(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return value;
}

/**
 * Nettoie et normalise un email (trim + lowercase).
 * Utilisé dans les routes API multi-user.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}