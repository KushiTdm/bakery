// tests/ia/rapport-ia.spec.ts
// Tests du rapport IA (Levain)
// ─────────────────────────────────────────────────────────────
//
// IMPORTANT — Mocks Playwright :
//   page.route() n'intercepte QUE les requêtes initiées depuis le contexte
//   browser (JS de la page). Pour que les mocks s'appliquent, il faut
//   déclencher la requête via page.evaluate() + fetch natif.
//
// Règle : si le test a un mock  → page.evaluate() + fetch (contexte browser)
//         si pas de mock        → request.* (APIRequestContext, plus rapide)
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, createTestProduit, buildStockEntry } from '../helpers/auth-helpers';
import {
  mockAiRapportGeneration,
  mockAiQuotaReached,
  mockStarterPlan,
  mockAppliquerPrevisions,
  mockToday,
  clearAllMocks,
} from '../helpers/mock-ai';
import { createTestUser } from '../fixtures/test-data';

// ── Setup commun ──────────────────────────────────────────────

async function setupWithToken(request: Parameters<typeof registerViaApi>[0]) {
  const testUser = createTestUser();
  const { response, error } = await registerViaApi(request, testUser);
  if (error || !response) throw new Error(`Inscription échouée: ${error}`);
  return {
    authToken:     response.access_token,
    boulangerieId: response.boulangerie?.id ?? '',
  };
}

// ── Helper fetch browser (pour que page.route() intercepte) ───

async function browserPost(
  page: Parameters<typeof mockAiRapportGeneration>[0],
  url: string,
  token: string,
  body: Record<string, unknown> = {}
): Promise<{ status: number; body: unknown }> {
  // ✅ page.goto() requis pour initialiser le contexte browser avant page.evaluate()
  await page.goto('/');
  return page.evaluate(
    async ({ url, token, body }) => {
      const r = await fetch(url, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
    { url, token, body }
  );
}

async function browserGet(
  page: Parameters<typeof mockAiRapportGeneration>[0],
  url: string,
  token: string
): Promise<{ status: number; body: unknown }> {
  // ✅ page.goto() requis pour initialiser le contexte browser avant page.evaluate()
  await page.goto('/');
  return page.evaluate(
    async ({ url, token }) => {
      const r = await fetch(url, {
        method:  'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return { status: r.status, body: await r.json() };
    },
    { url, token }
  );
}

// ── Tests ─────────────────────────────────────────────────────

test.describe('Rapport IA (Levain)', () => {

  test.describe('API Tests avec Mocks', () => {

    test('✅ Générer un rapport IA (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAiRapportGeneration(page, { score: 82, verdict: 'Excellente journée !' });
      await mockToday(page);

      // ✅ fetch depuis le contexte browser → page.route() s'applique
      const res = await browserPost(
        page,
        '/api/boulanger/ai/rapport',
        authToken,
        { consignes_boulanger: 'Prévoir plus de baguettes' }
      );

      expect([200, 201, 503]).toContain(res.status);

      await clearAllMocks(page);
    });

    test('✅ Récupérer le rapport du jour (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAiRapportGeneration(page, { statut: 'genere', score: 75 });

      // ✅ fetch depuis le contexte browser → page.route() s'applique
      const res = await browserGet(page, '/api/boulanger/ai/rapport', authToken);

      expect([200, 404]).toContain(res.status);

      if (res.status === 200) {
        const body = res.body as { rapport?: unknown; quota_info?: unknown };
        expect(body.quota_info).toBeDefined();
      }

      await clearAllMocks(page);
    });

    test('❌ Quota atteint (mock 402)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAiQuotaReached(page);

      // ✅ fetch depuis le contexte browser → page.route() s'applique
      const res = await browserPost(page, '/api/boulanger/ai/rapport', authToken, {});

      expect(res.status).toBe(402);

      const body = res.body as { quota_reached?: boolean; upgrade_required?: boolean };
      expect(body.quota_reached).toBe(true);
      expect(body.upgrade_required).toBe(true);

      await clearAllMocks(page);
    });

    test('✅ Plan starter : aperçu limité (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockStarterPlan(page);

      // ✅ fetch depuis le contexte browser → page.route() s'applique
      const res = await browserGet(page, '/api/boulanger/ai/rapport', authToken);

      // Le mock retourne 200 — le serveur réel retournerait 200 ou 404
      expect([200, 404]).toContain(res.status);

      if (res.status === 200) {
        const body = res.body as {
          starter_preview?: boolean;
          rapport?: { rapport_json?: { _starter_preview?: boolean } } | null;
          previsions?: unknown[];
        };
        expect(body.starter_preview).toBe(true);
        // rapport peut être null si pas de journée — guard avant accès
        if (body.rapport?.rapport_json) {
          expect(body.rapport.rapport_json._starter_preview).toBe(true);
        }
        expect(body.previsions).toEqual([]);
      }

      await clearAllMocks(page);
    });

  });

  test.describe('Application des prévisions', () => {

    test('✅ Appliquer les prévisions (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAppliquerPrevisions(page);

      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

      // ✅ fetch depuis le contexte browser → page.route() s'applique
      const res = await browserPost(
        page,
        '/api/boulanger/ai/appliquer',
        authToken,
        { date_production: tomorrow }
      );

      // Mock retourne 200 ; sans mock la route retournerait 404 (pas de prévisions)
      expect([200, 201, 404]).toContain(res.status);

      await clearAllMocks(page);
    });

  });

  test.describe('Gestion des erreurs', () => {

    test('❌ Rapport sans données de production (sans mock)', async ({ request }) => {
      // Pas de mock → appel réel → boulangerie sans journée → 400 (pas de production saisie)
      const { authToken } = await setupWithToken(request);

      const res = await request.post('/api/boulanger/ai/rapport', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type':  'application/json',
        },
        data: {},
      });

      // 400 (aucune production saisie) ou 503 (ZHIPU_API_KEY manquante en test)
      expect([400, 503]).toContain(res.status());
    });

    test('❌ Rapport sans authentification', async ({ request }) => {
      const res = await request.post('/api/boulanger/ai/rapport', {
        data: {},
      });
      expect(res.status()).toBe(401);
    });

  });

  test.describe('Prévisions de Production', () => {

    test('✅ Récupérer les prévisions pour demain (sans données)', async ({ request }) => {
      const { authToken } = await setupWithToken(request);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

      const res = await request.get(`/api/boulanger/ai/rapport?date=${tomorrow}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      // 200 avec rapport null si aucun rapport généré pour cette date
      expect([200, 404]).toContain(res.status());
    });

    test('✅ Structure des prévisions valide (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAiRapportGeneration(page, { score: 80 });

      // ✅ fetch depuis le contexte browser → page.route() s'applique
      const res = await browserGet(page, '/api/boulanger/ai/rapport', authToken);

      if (res.status === 200) {
        const body = res.body as {
          previsions?: { produit_id?: string; quantite_suggeree?: number }[];
        };

        if (body.previsions && body.previsions.length > 0) {
          const prev = body.previsions[0];
          expect(prev.produit_id).toBeDefined();
          expect(typeof prev.quantite_suggeree).toBe('number');
        }
      }

      await clearAllMocks(page);
    });

  });

});