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

  if (!res.ok()) {
    return {
      response: null,
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

export async function loginViaApi(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<{ response: AuthResponse | null; error: string | null }> {
  const res = await request.post('/api/boulanger/auth', {
    data: { action: 'login', email, password },
  });

  const body = await res.json();

  if (!res.ok()) {
    return {
      response: null,
      error: body?.error ?? body?.message ?? `Erreur HTTP ${res.status()}`,
    };
  }

  return { response: body as AuthResponse, error: null };
}

export async function verifySessionViaApi(
  request: APIRequestContext,
  token: string
): Promise<{ valid: boolean; user?: AuthResponse['user']; boulangerie?: AuthResponse['boulangerie'] }> {
  const res = await request.get('/api/boulanger/auth', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok()) return { valid: false };

  const body = await res.json();
  return { valid: true, user: body.user, boulangerie: body.boulangerie };
}

// ── UI Helpers ────────────────────────────────────────────────

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
    token:         response.access_token,
    boulangerieId: response.boulangerie?.id ?? '',
  };
}

export async function createTestProduit(
  request: APIRequestContext,
  token: string,
  overrides?: Partial<{
    nom:             string;
    emoji:           string;
    categorie:       string;
    prix_vente:      number;
    cout_production: number;
  }>
): Promise<{ id: string; nom: string; emoji: string; prix_vente: number; categorie?: string } | null> {
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
  return body.produit as { id: string; nom: string; emoji: string; prix_vente: number; categorie?: string };
}

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
    stockFinal:      Math.floor(production * 0.1),
  };
}

// ── Helper : upgrade plan via API Supabase admin ──────────────
//
// Les boulangeries sont créées avec plan='starter' par défaut.
// Pour les tests employé, on doit passer en 'pro' AVANT d'inviter.
// On appelle directement l'API REST Supabase avec la service role key
// pour ne pas avoir à créer une route API dédiée aux tests.

async function upgradeBoulangerieToPro(boulangerieId: string): Promise<boolean> {
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!serviceRoleKey) {
    console.error('[upgradeBoulangerieToPro] SUPABASE_SERVICE_ROLE_KEY manquante');
    return false;
  }

  // API REST PostgREST de Supabase — PATCH sur la table boulangeries
  const res = await fetch(
    `${supabaseUrl}/rest/v1/boulangeries?id=eq.${boulangerieId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ plan: 'pro' }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[upgradeBoulangerieToPro] Échec HTTP ${res.status}:`, text);
    return false;
  }

  return true;
}

// ── Helper isolation multi-tenant ─────────────────────────────
//
// Crée un employé lié à la boulangerie A via le flow invitation complet :
//   1. Upgrade le plan de A en 'pro' via l'API Supabase admin
//      (les nouvelles boulangeries sont créées en 'starter' par défaut)
//   2. Owner A invite l'email de l'employé (POST /api/boulanger/equipe)
//   3. L'employé crée son compte Supabase via l'API anon directement
//      (pas via /api/boulanger/auth register qui créerait une boulangerie,
//      ce qui bloquerait l'acceptation avec 409 "déjà owner")
//   4. L'employé accepte l'invitation (POST /api/boulanger/rejoindre)
//   5. Retourne le token JWT de l'employé (lié à la boulangerie A)

export async function createEmployeeViaInvitation(
  request: APIRequestContext,
  ownerToken: string,
  boulangerieId: string,
): Promise<{
  employeeToken: string;
  employeeUser:  TestUser;
  inviteToken:   string;
} | null> {

  // ── Étape 1 : Upgrade plan → pro ──────────────────────────
  const upgraded = await upgradeBoulangerieToPro(boulangerieId);
  if (!upgraded) {
    console.error('[createEmployeeViaInvitation] Upgrade plan échoué');
    return null;
  }

  // ── Étape 2 : Owner invite un nouvel email ─────────────────
  const employeeUser: TestUser = {
    email:    generateTestEmail(),
    password: generateTestPassword(),
    nom:      'Employé Test',
    slug:     generateTestSlug(),
  };

  const inviteRes = await request.post('/api/boulanger/equipe', {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: {
      email: employeeUser.email,
      role:  'employe',
    },
  });

  if (!inviteRes.ok()) {
    const body = await inviteRes.json().catch(() => ({})) as { error?: string; code?: string };
    console.error(
      `[createEmployeeViaInvitation] Invitation échouée (${inviteRes.status()}):`,
      body.error ?? body.code ?? 'inconnu',
    );
    return null;
  }

  const inviteBody  = await inviteRes.json() as { inviteUrl?: string };
  const inviteUrl   = inviteBody.inviteUrl ?? '';
  const tokenMatch  = inviteUrl.match(/[?&]token=([0-9a-f-]{36})/i);

  if (!tokenMatch?.[1]) {
    console.error('[createEmployeeViaInvitation] Token d\'invitation introuvable dans:', inviteUrl);
    return null;
  }

  const inviteToken = tokenMatch[1];

  // ── Étape 3 : Signup Supabase anon (sans créer de boulangerie) ─
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        supabaseAnonKey,
    },
    body: JSON.stringify({
      email:    employeeUser.email,
      password: employeeUser.password,
    }),
  });

  if (!signupRes.ok) {
    const body = await signupRes.json().catch(() => ({})) as { error_description?: string };
    console.error('[createEmployeeViaInvitation] Signup Supabase échoué:', body.error_description ?? signupRes.status);
    return null;
  }

  const signupBody    = await signupRes.json() as { access_token?: string };
  const employeeToken = signupBody.access_token;

  if (!employeeToken) {
    console.error('[createEmployeeViaInvitation] Pas de token dans la réponse signup:', signupBody);
    return null;
  }

  // ── Étape 4 : Acceptation invitation ──────────────────────
  const joinRes = await request.post('/api/boulanger/rejoindre', {
    headers: {
      Authorization:  `Bearer ${employeeToken}`,
      'Content-Type': 'application/json',
    },
    data: { token: inviteToken },
  });

  if (!joinRes.ok()) {
    const body = await joinRes.json().catch(() => ({})) as { error?: string };
    console.error(
      `[createEmployeeViaInvitation] Acceptation invitation échouée (${joinRes.status()}):`,
      body.error ?? 'inconnu',
    );
    return null;
  }

  return { employeeToken, employeeUser, inviteToken };
}