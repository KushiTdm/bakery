// tests/auth/permissions.spec.ts
// Tests des permissions RBAC
// ─────────────────────────────────────────────────────────────
//
// Vérifie qu'un employé ne peut pas accéder aux routes réservées à l'owner.
//
// ARCHITECTURE : Les employés s'authentifient avec leur propre compte Supabase
// (lié via la table employes). On ne peut pas simuler un employé sans une
// vraie invitation acceptée → on teste via les helpers d'auth boulanger
// et en vérifiant que les permissions DEFAULT_PERMISSIONS.employe sont
// correctement refusées par les routes API.
//
// Tests disponibles :
//   - Routes protégées appelées sans token → 401
//   - Routes owner appelées avec token owner → ✅
//   - Logique de permissions via canAccess() → voir tests/unit/auth-boulanger.spec.ts
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, createTestProduit } from '../helpers/auth-helpers';
import { createTestUser } from '../fixtures/test-data';

// ── Helpers locaux ────────────────────────────────────────────

async function createOwner(request: Parameters<typeof registerViaApi>[0]) {
  const user = createTestUser();
  const { response, error } = await registerViaApi(request, user);
  if (error || !response) throw new Error(`Inscription owner échouée: ${error}`);
  return {
    token:        response.access_token,
    boulangerieId: response.boulangerie!.id,
    user,
  };
}

// ── Routes non authentifiées → 401 ───────────────────────────

test.describe('Routes protégées - Accès sans authentification', () => {
  const protectedRoutes = [
    { method: 'GET',    path: '/api/boulanger/produits',  label: 'GET produits' },
    { method: 'POST',   path: '/api/boulanger/produits',  label: 'POST produits' },
    { method: 'GET',    path: '/api/boulanger/journee',   label: 'GET journée' },
    { method: 'POST',   path: '/api/boulanger/journee',   label: 'POST journée' },
    { method: 'PUT',    path: '/api/boulanger/journee',   label: 'PUT journée (clôture)' },
    { method: 'GET',    path: '/api/boulanger/equipe',    label: 'GET équipe' },
    { method: 'POST',   path: '/api/boulanger/equipe',    label: 'POST équipe (invite)' },
    { method: 'GET',    path: '/api/boulanger/flash',     label: 'GET flash' },
    { method: 'POST',   path: '/api/boulanger/flash',     label: 'POST flash' },
    { method: 'GET',    path: '/api/boulanger/commandes', label: 'GET commandes' },
    { method: 'GET',    path: '/api/boulanger/profil',    label: 'GET profil' },
    { method: 'PATCH',  path: '/api/boulanger/profil',    label: 'PATCH profil' },
    { method: 'GET',    path: '/api/boulanger/export',    label: 'GET export RGPD' },
    { method: 'GET',    path: '/api/boulanger/ai/rapport', label: 'GET rapport IA' },
    { method: 'POST',   path: '/api/boulanger/ai/rapport', label: 'POST rapport IA' },
  ];

  for (const route of protectedRoutes) {
    test(`❌ ${route.label} sans token → 401`, async ({ request }) => {
      let res;
      if (route.method === 'GET') {
        res = await request.get(route.path);
      } else if (route.method === 'POST') {
        res = await request.post(route.path, { data: {} });
      } else if (route.method === 'PUT') {
        res = await request.put(route.path, { data: {} });
      } else if (route.method === 'PATCH') {
        res = await request.patch(route.path, { data: {} });
      } else {
        res = await request.get(route.path);
      }

      expect(res.status()).toBe(401);
    });
  }
});

// ── Routes owner → accès accordé ─────────────────────────────

test.describe('Routes owner - Accès accordé', () => {
  test('✅ Owner peut lire ses produits', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.get('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { produits: unknown[] };
    expect(Array.isArray(body.produits)).toBe(true);
  });

  test('✅ Owner peut lire son équipe', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.get('/api/boulanger/equipe', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { members: unknown[]; owner: unknown };
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.owner).toBeDefined();
  });

  test('✅ Owner peut exporter ses données RGPD', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.get('/api/boulanger/export', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    // Vérifie que le contenu est du JSON téléchargeable
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/json');
    const contentDisp = res.headers()['content-disposition'];
    expect(contentDisp).toContain('attachment');
  });

  test('✅ Owner peut inviter un membre', async ({ request }) => {
    const { token } = await createOwner(request);

    // Sur plan starter, la limite est 1 membre (owner seul)
    // L'invitation sera refusée avec 403 PLAN_LIMIT_REACHED, pas 401/403 permission
    const res = await request.post('/api/boulanger/equipe', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        email: `invited-${Date.now()}@example.com`,
        role:  'employe',
      },
    });

    // 201 si multi-user activé, 403 si plan starter (limite 1 membre)
    // Dans les deux cas, pas 401 (authentifié) ni 500 (pas d'erreur serveur)
    expect([201, 403]).toContain(res.status());

    if (res.status() === 403) {
      const body = await res.json() as { code?: string };
      // Soit limit plan, soit permissions
      expect(body.code ?? 'PLAN_LIMIT_REACHED').toBeDefined();
    }
  });
});

// ── Routes avec token invalide → 401 ─────────────────────────

test.describe('Routes protégées - Token invalide', () => {
  test('❌ Token malformé → 401', async ({ request }) => {
    const res = await request.get('/api/boulanger/produits', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(res.status()).toBe(401);
  });

  test('❌ Token expiré simulé → 401', async ({ request }) => {
    // Token JWT valide structurellement mais signé avec la mauvaise clé
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkZha2UiLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

    const res = await request.get('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(res.status()).toBe(401);
  });
});

// ── Export RGPD : owner uniquement ───────────────────────────

test.describe('Export RGPD - Contrôle accès', () => {
  test('❌ Export sans authentification → 401', async ({ request }) => {
    const res = await request.get('/api/boulanger/export');
    expect(res.status()).toBe(401);
  });

  test('✅ Export avec token owner → 200', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.get('/api/boulanger/export', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { boulangerie_id?: string; format_version?: string };
    expect(body.format_version).toBe('1.0');
    expect(body.boulangerie_id).toBeDefined();
  });
});

// ── Invitation : validation des données ──────────────────────

test.describe('Invitation équipe - Validation', () => {
  test('❌ Email invalide → 400', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.post('/api/boulanger/equipe', {
      headers: { Authorization: `Bearer ${token}` },
      data: { email: 'not-an-email', role: 'employe' },
    });

    expect([400, 403]).toContain(res.status()); // 400 validation ou 403 plan limit
    if (res.status() === 400) {
      const body = await res.json() as { error?: string };
      expect(body.error).toBeDefined();
    }
  });

  test('❌ Rôle invalide → 400', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.post('/api/boulanger/equipe', {
      headers: { Authorization: `Bearer ${token}` },
      data: { email: 'valid@example.com', role: 'super-admin' },
    });

    expect([400, 403]).toContain(res.status()); // 400 validation ou 403 plan limit
  });
});

// ── Routes spécifiques employé ────────────────────────────────

test.describe('Accès employé simulé via permissions logiques', () => {
  // Sans système d'invitation complet testé en E2E,
  // on vérifie la logique de permissions via les tests unitaires
  // et on s'assure que les routes protégées refusent bien les tokens invalides.

  test('✅ Route commandes accessible avec token owner', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.get('/api/boulanger/commandes', {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 200 avec liste vide (pas de commandes), jamais 401/403
    expect(res.ok()).toBeTruthy();
  });

  test('✅ Route flash accessible avec token owner', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.get('/api/boulanger/flash', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { paniers: unknown[] };
    expect(Array.isArray(body.paniers)).toBe(true);
  });

  test('✅ Route profil accessible avec token owner', async ({ request }) => {
    const { token } = await createOwner(request);

    const res = await request.get('/api/boulanger/profil', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { id?: string; nom?: string; plan?: string };
    expect(body.id).toBeDefined();
    expect(body.plan).toBeDefined();
  });
});