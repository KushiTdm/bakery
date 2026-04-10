// tests/security/auth-helpers-employe.spec.ts
// ─────────────────────────────────────────────────────────────
// VULN-003 : Routes utilisant des helpers d'auth locaux au lieu de
// getBoulangerSession() — les employés actifs reçoivent 401 au lieu
// de leur accès normal.
//
// Fichiers concernés :
//   - app/api/boulanger/journee/route.ts         (getBoulangerieId local)
//   - app/api/boulanger/journee/feedback/route.ts (getAuth local)
//   - app/api/boulanger/ai/today/route.ts         (auth Bearer manuel)
//
// Ces tests ÉCHOUERONT tant que le fix n'est pas appliqué.
// Fix : remplacer les helpers locaux par getBoulangerSession() de lib/auth-boulanger.ts
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, createTestProduit, buildStockEntry, createEmployeeViaInvitation } from '../helpers/auth-helpers';
import { createTestUser } from '../fixtures/test-data';

// ── Setup : owner + employé actif ────────────────────────────

async function setupOwnerAndEmployee(request: Parameters<typeof registerViaApi>[0]) {
  const user = createTestUser();
  const { response, error } = await registerViaApi(request, user);
  if (error || !response) throw new Error(`Owner échoué: ${error}`);

  const ownerToken   = response.access_token;
  const boulangerieId = response.boulangerie!.id;

  const emp = await createEmployeeViaInvitation(request, ownerToken, boulangerieId);

  // Créer produit + journée avec le token owner
  const produit = await createTestProduit(request, ownerToken);
  let journeeId: string | null = null;

  if (produit) {
    const stocks = [buildStockEntry(produit, 50)];
    const res    = await request.post('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data:    { stocks, commandesOnline: 0 },
    });
    if (res.ok()) {
      const body = await res.json() as { journee_id?: string };
      journeeId  = body.journee_id ?? null;
    }
  }

  return { ownerToken, boulangerieId, emp, produit, journeeId };
}

// ────────────────────────────────────────────────────────────────────────
// 1. GET /api/boulanger/journee — doit accepter les employés
// ────────────────────────────────────────────────────────────────────────

test.describe('VULN-003 — journee/route.ts : employé doit avoir accès', () => {

  test('✅ Employé actif peut lire la journée du jour (GET)', async ({ request }) => {
    const { emp } = await setupOwnerAndEmployee(request);
    if (!emp) { test.skip(); return; }

    const res = await request.get('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${emp.employeeToken}` },
    });

    // Avant fix : 401 (helper local getBoulangerieId ne connaît pas les employés)
    // Après fix  : 200
    expect(res.status()).toBe(200);
    const body = await res.json() as { journee?: unknown };
    expect(body).toHaveProperty('journee');
  });

  test('✅ Employé actif peut saisir la production (POST)', async ({ request }) => {
    const { emp, ownerToken, boulangerieId } = await setupOwnerAndEmployee(request);
    if (!emp) { test.skip(); return; }

    // Créer un produit avec le token owner
    const produit = await createTestProduit(request, ownerToken);
    if (!produit) { test.skip(); return; }

    const stocks = [buildStockEntry(produit, 30)];
    const res    = await request.post('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${emp.employeeToken}` },
      data:    { stocks, commandesOnline: 0 },
    });

    // Avant fix : 401
    // Après fix  : 200 si l'employé a 'matin': 'write' (dépend du rôle)
    // Un employé standard n'a pas 'matin': 'write' → 403 attendu
    // Un gérant l'a → 200
    expect([200, 403]).toContain(res.status());
    expect(res.status()).not.toBe(401);
  });

});

// ────────────────────────────────────────────────────────────────────────
// 2. POST /api/boulanger/journee/feedback — doit accepter les employés
// ────────────────────────────────────────────────────────────────────────

test.describe('VULN-003 — journee/feedback/route.ts : employé doit avoir accès', () => {

  test('✅ Employé actif peut soumettre un feedback de fin de journée', async ({ request }) => {
    const { emp, journeeId } = await setupOwnerAndEmployee(request);
    if (!emp || !journeeId) { test.skip(); return; }

    const res = await request.post('/api/boulanger/journee/feedback', {
      headers: { Authorization: `Bearer ${emp.employeeToken}` },
      data: {
        journee_id:       journeeId,
        rating_journee:   3,
        points_forts:     ['Bonne ambiance'],
        points_ameliorer: [],
        commentaire_libre: 'Test employé',
      },
    });

    // Avant fix : 401 (helper local getAuth ne connaît pas les employés)
    // Après fix  : 200
    expect(res.status()).toBe(200);
    expect(res.status()).not.toBe(401);
    const body = await res.json() as { success?: boolean };
    expect(body.success).toBe(true);
  });

  test('✅ Employé peut lire le feedback existant (GET)', async ({ request }) => {
    const { emp, ownerToken, journeeId } = await setupOwnerAndEmployee(request);
    if (!emp || !journeeId) { test.skip(); return; }

    // Owner soumet le feedback
    await request.post('/api/boulanger/journee/feedback', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data:    { journee_id: journeeId, rating_journee: 4 },
    });

    // Employé lit le feedback
    const res = await request.get(`/api/boulanger/journee/feedback?journee_id=${journeeId}`, {
      headers: { Authorization: `Bearer ${emp.employeeToken}` },
    });

    expect(res.status()).not.toBe(401);
    expect([200, 403]).toContain(res.status());
  });

});

// ────────────────────────────────────────────────────────────────────────
// 3. GET /api/boulanger/ai/today — doit accepter les employés
// ────────────────────────────────────────────────────────────────────────

test.describe('VULN-003 — ai/today/route.ts : employé doit avoir accès', () => {

  test('✅ Employé actif peut récupérer la date du jour (GET /api/boulanger/ai/today)', async ({ request }) => {
    const { emp } = await setupOwnerAndEmployee(request);
    if (!emp) { test.skip(); return; }

    const res = await request.get('/api/boulanger/ai/today', {
      headers: { Authorization: `Bearer ${emp.employeeToken}` },
    });

    // Avant fix : 404 (l'employé ne possède pas de boulangerie → getUser ok mais boulangerie introuvable)
    // Après fix  : 200 avec today et timezone
    expect(res.status()).toBe(200);
    const body = await res.json() as { today?: string; timezone?: string };
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.timezone).toBeDefined();
  });

});

// ────────────────────────────────────────────────────────────────────────
// 4. Régression : l'owner doit toujours avoir accès (pas de régression)
// ────────────────────────────────────────────────────────────────────────

test.describe('Régression — Owner toujours fonctionnel après fix', () => {

  test('✅ Owner conserve accès GET /api/boulanger/journee', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const res = await request.get('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${response.access_token}` },
    });

    expect(res.status()).toBe(200);
  });

  test('✅ Owner conserve accès GET /api/boulanger/ai/today', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const res = await request.get('/api/boulanger/ai/today', {
      headers: { Authorization: `Bearer ${response.access_token}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json() as { today?: string };
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('✅ Owner conserve accès POST /api/boulanger/journee/feedback', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const ownerToken = response.access_token;
    const produit    = await createTestProduit(request, ownerToken);
    if (!produit) { test.skip(); return; }

    const stocks = [buildStockEntry(produit, 20)];
    const jourRes = await request.post('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data:    { stocks, commandesOnline: 0 },
    });
    if (!jourRes.ok()) { test.skip(); return; }
    const { journee_id } = await jourRes.json() as { journee_id?: string };
    if (!journee_id) { test.skip(); return; }

    const res = await request.post('/api/boulanger/journee/feedback', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data:    { journee_id, rating_journee: 4 },
    });

    expect(res.status()).toBe(200);
  });

});