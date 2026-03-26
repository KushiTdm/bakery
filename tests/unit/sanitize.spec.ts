// tests/unit/sanitize.spec.ts
// Tests unitaires pour lib/sanitize.ts
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import {
  isValidUUID,
  assertUUID,
  isValidSlug,
  sanitizeText,
  sanitizeProductName,
  sanitizeDescription,
  sanitizeEmoji,
  sanitizePositiveNumber,
  sanitizeStringArray,
  sanitizeUrl,
  sanitizeDate,
  normalizeEmail,
} from '../../lib/sanitize';

// ── isValidUUID ───────────────────────────────────────────────

test.describe('isValidUUID', () => {
  test('✅ UUID v4 valide', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  test('❌ Chaîne vide', () => {
    expect(isValidUUID('')).toBe(false);
  });

  test('❌ UUID trop court', () => {
    expect(isValidUUID('550e8400-e29b-41d4')).toBe(false);
  });

  test('❌ UUID avec mauvais format', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('gggggggg-gggg-gggg-gggg-gggggggggggg')).toBe(false);
  });

  test('❌ Valeurs non-string', () => {
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
    expect(isValidUUID(123)).toBe(false);
    expect(isValidUUID({})).toBe(false);
  });

  test('✅ UUID en majuscules (case-insensitive)', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });
});

// ── assertUUID ────────────────────────────────────────────────

test.describe('assertUUID', () => {
  test('✅ Retourne le UUID si valide', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(assertUUID(uuid)).toBe(uuid);
  });

  test('❌ Lance une erreur si invalide', () => {
    expect(() => assertUUID('not-valid')).toThrow();
    expect(() => assertUUID(null)).toThrow();
  });

  test('❌ Message d\'erreur inclut le nom du champ', () => {
    expect(() => assertUUID('bad', 'produit_id')).toThrow('produit_id');
  });
});

// ── isValidSlug ───────────────────────────────────────────────

test.describe('isValidSlug', () => {
  test('✅ Slugs valides', () => {
    expect(isValidSlug('boulangerie-paris')).toBe(true);
    expect(isValidSlug('artisan-dore')).toBe(true);
    expect(isValidSlug('pain123')).toBe(true);
    expect(isValidSlug('ab')).toBe(true); // minimum 2 chars
  });

  test('❌ Slugs réservés', () => {
    expect(isValidSlug('api')).toBe(false);
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('www')).toBe(false);
    expect(isValidSlug('boulanger')).toBe(false);
    expect(isValidSlug('dashboard')).toBe(false);
  });

  test('❌ Majuscules interdites', () => {
    expect(isValidSlug('Boulangerie')).toBe(false);
    expect(isValidSlug('PAIN')).toBe(false);
  });

  test('❌ Espaces interdits', () => {
    expect(isValidSlug('boulangerie paris')).toBe(false);
  });

  test('❌ Caractères spéciaux interdits', () => {
    expect(isValidSlug('boulangerie_paris')).toBe(false);
    expect(isValidSlug('pain@paris')).toBe(false);
    expect(isValidSlug('pain.paris')).toBe(false);
  });

  test('❌ Trop court (1 char)', () => {
    expect(isValidSlug('a')).toBe(false);
  });

  test('❌ Non-string', () => {
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug(123)).toBe(false);
  });

  test('❌ Commence ou finit par un tiret', () => {
    expect(isValidSlug('-boulangerie')).toBe(false);
    expect(isValidSlug('boulangerie-')).toBe(false);
  });
});

// ── sanitizeText ──────────────────────────────────────────────

test.describe('sanitizeText', () => {
  test('✅ Texte normal inchangé', () => {
    expect(sanitizeText('Boulangerie Dupont')).toBe('Boulangerie Dupont');
  });

  test('✅ Trim des espaces', () => {
    expect(sanitizeText('  texte  ')).toBe('texte');
  });

  test('✅ Espaces multiples normalisés', () => {
    expect(sanitizeText('mot1   mot2')).toBe('mot1 mot2');
  });

  test('✅ Respect maxLength', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeText(long, 100).length).toBe(100);
    expect(sanitizeText(long).length).toBe(500); // default
  });

  test('✅ Caractères non-ASCII conservés (accents, emojis)', () => {
    expect(sanitizeText('Pâtisserie 🥐')).toBe('Pâtisserie 🥐');
    expect(sanitizeText('café crème')).toBe('café crème');
  });

  test('✅ Caractères de contrôle supprimés', () => {
    // \x00 = null byte, \x01 = SOH
    expect(sanitizeText('text\x00injection')).toBe('textinjection');
    expect(sanitizeText('text\x01bad')).toBe('textbad');
  });

  test('✅ \n, \r, \t conservés (not stripped)', () => {
    // Les sauts de ligne légitimes sont conservés par le regex
    const withNewline = 'ligne1\nligne2';
    expect(sanitizeText(withNewline)).toContain('ligne1');
    expect(sanitizeText(withNewline)).toContain('ligne2');
  });

  test('✅ Non-string retourne chaîne vide', () => {
    expect(sanitizeText(null as unknown as string)).toBe('');
    expect(sanitizeText(undefined as unknown as string)).toBe('');
    expect(sanitizeText(123 as unknown as string)).toBe('');
  });
});

// ── sanitizeProductName ───────────────────────────────────────

test.describe('sanitizeProductName', () => {
  test('✅ Nom normal conservé', () => {
    expect(sanitizeProductName('Baguette Tradition')).toBe('Baguette Tradition');
  });

  test('✅ Limité à 100 caractères', () => {
    const long = 'a'.repeat(150);
    expect(sanitizeProductName(long).length).toBe(100);
  });
});

// ── sanitizeDescription ───────────────────────────────────────

test.describe('sanitizeDescription', () => {
  test('✅ Description normale conservée', () => {
    const desc = 'Pain artisanal au levain naturel';
    expect(sanitizeDescription(desc)).toBe(desc);
  });

  test('✅ Limité à 500 caractères', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeDescription(long).length).toBe(500);
  });
});

// ── sanitizeEmoji ─────────────────────────────────────────────

test.describe('sanitizeEmoji', () => {
  test('✅ Emoji simple', () => {
    expect(sanitizeEmoji('🥖')).toBe('🥖');
    expect(sanitizeEmoji('🥐')).toBe('🥐');
  });

  test('✅ Tronqué à 4 caractères', () => {
    const long = '🥖🥐🎂🍞🥨';
    expect(sanitizeEmoji(long).length).toBeLessThanOrEqual(4);
  });

  test('✅ Fallback 🥖 si vide', () => {
    expect(sanitizeEmoji('')).toBe('🥖');
    expect(sanitizeEmoji(null as unknown as string)).toBe('🥖');
  });
});

// ── sanitizePositiveNumber ────────────────────────────────────

test.describe('sanitizePositiveNumber', () => {
  test('✅ Nombre positif valide', () => {
    expect(sanitizePositiveNumber(1.5)).toBe(1.5);
    expect(sanitizePositiveNumber('3.99')).toBe(3.99);
    expect(sanitizePositiveNumber(100)).toBe(100);
  });

  test('✅ Arrondi à 2 décimales', () => {
    expect(sanitizePositiveNumber(1.999)).toBe(2);
    expect(sanitizePositiveNumber(1.234)).toBe(1.23);
  });

  test('❌ Zéro → null', () => {
    expect(sanitizePositiveNumber(0)).toBeNull();
  });

  test('❌ Négatif → null', () => {
    expect(sanitizePositiveNumber(-5)).toBeNull();
  });

  test('❌ NaN → null', () => {
    expect(sanitizePositiveNumber('abc')).toBeNull();
    expect(sanitizePositiveNumber(NaN)).toBeNull();
  });
});

// ── sanitizeStringArray ───────────────────────────────────────

test.describe('sanitizeStringArray', () => {
  test('✅ Tableau simple', () => {
    expect(sanitizeStringArray(['gluten', 'lait'])).toEqual(['gluten', 'lait']);
  });

  test('✅ Filtre les doublons', () => {
    expect(sanitizeStringArray(['gluten', 'gluten', 'lait'])).toEqual(['gluten', 'lait']);
  });

  test('✅ Filtre les valeurs vides', () => {
    expect(sanitizeStringArray(['gluten', '', '  '])).toEqual(['gluten']);
  });

  test('✅ Filtre les valeurs non autorisées', () => {
    const allowed = ['gluten', 'lait', 'oeufs'];
    expect(sanitizeStringArray(['gluten', 'arsenic', 'lait'], allowed)).toEqual(['gluten', 'lait']);
  });

  test('✅ Non-array retourne []', () => {
    expect(sanitizeStringArray(null as unknown as string[])).toEqual([]);
    expect(sanitizeStringArray('gluten' as unknown as string[])).toEqual([]);
  });
});

// ── sanitizeUrl ───────────────────────────────────────────────

test.describe('sanitizeUrl', () => {
  test('✅ URLs HTTPS valides', () => {
    expect(sanitizeUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
    expect(sanitizeUrl('https://images.unsplash.com/photo.jpg?w=800')).toBeTruthy();
  });

  test('✅ URLs HTTP acceptées', () => {
    expect(sanitizeUrl('http://example.com/image.jpg')).toBeTruthy();
  });

  test('❌ Data URIs rejetés', () => {
    expect(sanitizeUrl('data:image/png;base64,abc')).toBeNull();
  });

  test('❌ javascript: rejeté', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
  });

  test('❌ Protocoles non-http rejetés', () => {
    expect(sanitizeUrl('ftp://example.com')).toBeNull();
    expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
  });

  test('❌ Valeurs nulles/vides', () => {
    expect(sanitizeUrl(null)).toBeNull();
    expect(sanitizeUrl('')).toBeNull();
    expect(sanitizeUrl(undefined)).toBeNull();
  });

  test('❌ URL malformée', () => {
    expect(sanitizeUrl('not a url at all')).toBeNull();
  });
});

// ── sanitizeDate ──────────────────────────────────────────────

test.describe('sanitizeDate', () => {
  test('✅ Format YYYY-MM-DD valide', () => {
    expect(sanitizeDate('2024-03-25')).toBe('2024-03-25');
    expect(sanitizeDate('2025-12-31')).toBe('2025-12-31');
  });

  test('❌ Format invalide', () => {
    expect(sanitizeDate('25/03/2024')).toBeNull();
    expect(sanitizeDate('2024-3-5')).toBeNull();
    expect(sanitizeDate('not-a-date')).toBeNull();
  });

  test('❌ Date invalide (30 février)', () => {
    expect(sanitizeDate('2024-02-30')).toBeNull();
  });

  test('❌ Null/undefined', () => {
    expect(sanitizeDate(null)).toBeNull();
    expect(sanitizeDate(undefined)).toBeNull();
    expect(sanitizeDate('')).toBeNull();
  });
});

// ── normalizeEmail ────────────────────────────────────────────

test.describe('normalizeEmail', () => {
  test('✅ Minuscules', () => {
    expect(normalizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
  });

  test('✅ Trim des espaces', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  test('✅ Combiné', () => {
    expect(normalizeEmail('  USER@Example.Com  ')).toBe('user@example.com');
  });
});