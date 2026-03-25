// tests/helpers/auth-helpers.ts
// Helpers d'authentification pour les tests Playwright
// ─────────────────────────────────────────────────────────────

import { Page, APIRequestContext } from '@playwright/test';
import { TestUser, createTestUser, generateTestPassword, generateTestSlug, generateTestEmail } from '../fixtures/test-data';

// ── Types ─────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string };
  boulangerie: { id: string; nom: string; slug: string; plan: string } | null;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  boulangerie?: AuthResponse['boulangerie'];
  error?: string;
}

// ── API Helpers (via request context) ─────────────────────────

/**
 * Inscription via API directe.
 *
 * IMPORTANT : utilise response.ok() (méthode Playwright, pas une propriété).
 * Le corps JSON est retourné dans `response` si HTTP 2xx, dans `error` sinon.
 */
export async function registerViaApi(
  request: APIRequestContext,
  user?: Partial<TestUser>
): Promise<{ response: AuthResponse | null; error: string | null; user: TestUser }> {
  const testUser: TestUser = {
    email:    user?.email    ?? generateTestEmail(),
    password: user?.password ?? generateTestPassword(),
    nom:      user?.nom      ?? 'Boulangerie Test',
    slug:     user?.slug     ?? generateTestSlug(),
  };

  const res = await request.post('/api/boulanger/auth', {
    data: {
      action:   'register',
      email:    testUser.email,
      password: testUser.password,
      nom:      testUser.nom,
      slug:     testUser.slug,
    },
  });

  const body = await res.json();

  // ✅ res.ok() est une MÉTHODE, pas une propriété — toujours appeler avec ()
  if (!res.ok()) {
    return {
      response: null,
      // Normalise le message d'erreur : champ `error` ou message JSON brut
      error: body?.error ?? body?.message ?? `Erreur HTTP ${res.status()}`,
      user:  testUser,
    };
  }

  return {
    response: body as AuthResponse,
    error:    null,
    user:     testUser,
  };
}

/**
 * Connexion via API directe.
 */
export async function loginViaApi(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<{ response: AuthResponse | null; error: string | null }> {
  const res = await request.post('/api/boulanger/auth', {
    data: {
      action: 'login',
      email,
      password,
    },
  });

  const body = await res.json();

  // ✅ res.ok() — méthode Playwright
  if (!res.ok()) {
    return {
      response: null,
      error: body?.error ?? body?.message ?? `Erreur HTTP ${res.status()}`,
    };
  }

  return {
    response: body as AuthResponse,
    error:    null,
  };
}

/**
 * Vérifie la session via API.
 */
export async function verifySessionViaApi(
  request: APIRequestContext,
  token: string
): Promise<{ valid: boolean; user?: AuthResponse['user']; boulangerie?: AuthResponse['boulangerie'] }> {
  const res = await request.get('/api/boulanger/auth', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok()) return { valid: false };

  const body = await res.json();
  return {
    valid:       true,
    user:        body.user,
    boulangerie: body.boulangerie,
  };
}

// ── UI Helpers (via page browser) ─────────────────────────────

export async function loginViaUi(
  page: Page,
  email: string,
  password: string
): Promise<boolean> {
  await page.goto('/boulanger');
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL('**/boulanger**', { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

// ── Helpers combinés ──────────────────────────────────────────

/**
 * Crée un utilisateur et retourne token + boulangerieId.
 * Retourne null et logue l'erreur si l'inscription échoue.
 */
export async function createAuthenticatedUser(
  request: APIRequestContext
): Promise<{ user: TestUser; token: string; boulangerieId: string } | null> {
  const { response, error, user } = await registerViaApi(request);

  if (error || !response) {
    console.error('Erreur création utilisateur test:', error);
    return null;
  }

  return {
    user,
    token:        response.access_token,
    boulangerieId: response.boulangerie?.id ?? '',
  };
}

/**
 * Crée un produit de test pour une boulangerie.
 * Retourne le produit créé avec son id réel (UUID Supabase).
 */
export async function createTestProduit(
  request: APIRequestContext,
  token: string,
  overrides?: Partial<{
    nom:            string;
    emoji:          string;
    categorie:      string;
    prix_vente:     number;
    cout_production: number;
  }>
): Promise<{ id: string; nom: string; emoji: string; prix_vente: number } | null> {
  const res = await request.post('/api/boulanger/produits', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nom:             overrides?.nom             ?? 'Baguette Tradition',
      emoji:           overrides?.emoji           ?? '🥖',
      categorie:       overrides?.categorie       ?? 'boulangerie',
      prix_vente:      overrides?.prix_vente      ?? 1.30,
      cout_production: overrides?.cout_production ?? 0.45,
      actif_catalogue: true,
      actif_flash:     true,
    },
  });

  if (!res.ok()) {
    console.error('Erreur création produit test:', await res.text());
    return null;
  }

  const body = await res.json();
  return body.produit as { id: string; nom: string; emoji: string; prix_vente: number };
}

/**
 * Construit un StockEntry valide depuis un produit créé en base.
 * Correspond exactement au type StockEntry de lib/types.ts.
 */
export function buildStockEntry(produit: {
  id:         string;
  nom:        string;
  emoji:      string;
  prix_vente: number;
  categorie?: string;
}, production = 100): Record<string, unknown> {
  return {
    id:              produit.id,
    name:            produit.nom,
    emoji:           produit.emoji,
    category:        produit.categorie ?? 'boulangerie',
    prixVente:       produit.prix_vente,
    coutProduction:  0.45,
    production,
    snapshot10h:     0,
    snapshot10hDone: false,
    snapshot14h:     0,
    snapshot14hDone: false,
    stockFinal:      Math.floor(production * 0.1), // 10% invendu
  };
}