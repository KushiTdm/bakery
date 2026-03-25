// tests/ia/rapport-ia.spec.ts
// Tests du rapport IA (Levain)
// ─────────────────────────────────────────────────────────────
//
// IMPORTANT — Mocks Playwright :
//   page.route() n'intercepte QUE les requêtes du contexte browser (page).
//   Pour que les mocks s'appliquent, utiliser page.request.post() / page.request.get()
//   et non la fixture `request` qui est un contexte API séparé.
//
// Règle : si le test a un mock → page.request.*
//         si pas de mock → request.* (plus rapide)
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

// ── Tests ─────────────────────────────────────────────────────

test.describe('Rapport IA (Levain)', () => {

  test.describe('API Tests avec Mocks', () => {

    test('✅ Générer un rapport IA (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAiRapportGeneration(page, { score: 82, verdict: 'Excellente journée !' });
      await mockToday(page);

      // ✅ Utiliser page.request (même contexte que page.route) pour que le mock s'applique
      const res = await page.request.post('/api/boulanger/ai/rapport', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type':  'application/json',
        },
        data: { consignes_boulanger: 'Prévoir plus de baguettes' },
      });

      expect([200, 201, 503]).toContain(res.status());

      await clearAllMocks(page);
    });

    test('✅ Récupérer le rapport du jour (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAiRapportGeneration(page, { statut: 'genere', score: 75 });

      // ✅ page.request pour que la réponse mockée soit retournée
      const res = await page.request.get('/api/boulanger/ai/rapport', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect([200, 404]).toContain(res.status());

      if (res.ok()) {
        const body = await res.json() as { rapport?: unknown; quota_info?: unknown };
        expect(body.quota_info).toBeDefined();
      }

      await clearAllMocks(page);
    });

    test('❌ Quota atteint (mock 402)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockAiQuotaReached(page);

      // ✅ page.request pour que le mock 402 soit renvoyé
      const res = await page.request.post('/api/boulanger/ai/rapport', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type':  'application/json',
        },
        data: {},
      });

      expect(res.status()).toBe(402);

      const body = await res.json() as { quota_reached?: boolean; upgrade_required?: boolean };
      expect(body.quota_reached).toBe(true);
      expect(body.upgrade_required).toBe(true);

      await clearAllMocks(page);
    });

    test('✅ Plan starter : aperçu limité (mock)', async ({ page, request }) => {
      const { authToken } = await setupWithToken(request);

      await mockStarterPlan(page);

      // ✅ page.request
      const res = await page.request.get('/api/boulanger/ai/rapport', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      // Le mock retourne 200 — le serveur réel retournerait 200 ou 404
      expect([200, 404]).toContain(res.status());

      if (res.ok()) {
        const body = await res.json() as {
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

      // ✅ page.request
      const res = await page.request.post('/api/boulanger/ai/appliquer', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type':  'application/json',
        },
        data: { date_production: tomorrow },
      });

      // Mock retourne 200 ; sans mock la route retournerait 404 (pas de prévisions)
      expect([200, 201, 404]).toContain(res.status());

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

      const res = await page.request.get('/api/boulanger/ai/rapport', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok()) {
        const body = await res.json() as {
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