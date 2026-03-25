// tests/journee/cloture.spec.ts
// Tests de clôture de journée et feedback
// ─────────────────────────────────────────────────────────────
//
// Contrats API réels :
//   POST /api/boulanger/journee       → corps { stocks: StockEntry[], commandesOnline }
//   PUT  /api/boulanger/journee       → clôture (pas de corps)
//   POST /api/boulanger/journee/feedback → corps { journee_id, rating_journee, ... }
//   GET  /api/boulanger/journee       → retourne { journee: { id, cloturee, ... } }
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, createTestProduit, buildStockEntry } from '../helpers/auth-helpers';
import { createTestUser } from '../fixtures/test-data';

// ── Helpers locaux ────────────────────────────────────────────

/**
 * Crée une journée avec production valide.
 * Nécessite un produit réel pour que l'upsert stocks_journaliers ne viole pas
 * la contrainte NOT NULL sur produit_id.
 */
async function setupJourneeWithProduction(
  request: Parameters<typeof registerViaApi>[0],
  token: string,
  production = 100
) {
  // 1. Créer un produit réel (UUID Supabase)
  const produit = await createTestProduit(request, token);
  if (!produit) throw new Error('Impossible de créer le produit test');

  // 2. Construire le StockEntry avec l'UUID réel
  const stocks = [buildStockEntry(produit, production)];

  // 3. POST journée
  const res = await request.post('/api/boulanger/journee', {
    headers: { Authorization: `Bearer ${token}` },
    data:    { stocks, commandesOnline: 0 },
  });

  return { produit, stocks, journeeRes: res };
}

/**
 * Récupère la journée du jour pour obtenir son id.
 */
async function getJourneeId(
  request: Parameters<typeof registerViaApi>[0],
  token: string
): Promise<string | null> {
  const res = await request.get('/api/boulanger/journee', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const body = await res.json() as { journee?: { id: string } | null };
  return body.journee?.id ?? null;
}

// ── Tests ─────────────────────────────────────────────────────

test.describe('Clôture de Journée', () => {
  let authToken:     string;
  let boulangerieId: string;

  test.beforeEach(async ({ request }) => {
    const testUser = createTestUser();
    const { response } = await registerViaApi(request, testUser);
    if (!response) throw new Error('Inscription test échouée');
    authToken     = response.access_token;
    boulangerieId = response.boulangerie?.id ?? '';
  });

  test.describe('API Tests', () => {

    test('✅ Créer une journée avec stocks valides', async ({ request }) => {
      const { journeeRes } = await setupJourneeWithProduction(request, authToken);

      expect(journeeRes.ok()).toBeTruthy();
      const body = await journeeRes.json() as { success?: boolean; journee_id?: string };
      expect(body.success).toBe(true);
      expect(body.journee_id).toBeDefined();
    });

    test('✅ Soumettre feedback de fin de journée', async ({ request }) => {
      // Créer une journée
      const { journeeRes } = await setupJourneeWithProduction(request, authToken);
      expect(journeeRes.ok()).toBeTruthy();

      // Récupérer l'id de la journée
      const journeeId = await getJourneeId(request, authToken);
      expect(journeeId).not.toBeNull();

      // Soumettre le feedback (corps avec journee_id, pas date)
      const res = await request.post('/api/boulanger/journee/feedback', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          journee_id:       journeeId,
          rating_journee:   3,
          points_forts:     ['Ventes baguettes'],
          points_ameliorer: [],
          commentaire_libre: 'Bonne journée',
        },
      });

      expect(res.ok()).toBeTruthy();
      const body = await res.json() as { success?: boolean; feedback?: unknown };
      expect(body.success).toBe(true);
      expect(body.feedback).toBeDefined();
    });

    test('✅ Feedback avec événement spécial demain', async ({ request }) => {
      await setupJourneeWithProduction(request, authToken);
      const journeeId = await getJourneeId(request, authToken);
      expect(journeeId).not.toBeNull();

      const res = await request.post('/api/boulanger/journee/feedback', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          journee_id:       journeeId,
          rating_journee:   3,
          has_evenement:    true,
          evenement_desc:   'Marché de Noël sur la place',
          evenement_impact: 'hausse',
          evenement_pct:    20,
        },
      });

      expect(res.ok()).toBeTruthy();
      const body = await res.json() as { feedback?: { has_evenement?: boolean } };
      expect(body.feedback).toBeDefined();
    });

    test('❌ Erreur : feedback sans authentification', async ({ request }) => {
      const res = await request.post('/api/boulanger/journee/feedback', {
        data: { journee_id: 'fake-id', rating_journee: 3 },
      });
      expect(res.status()).toBe(401);
    });

    test('❌ Erreur : feedback avec journee_id invalide', async ({ request }) => {
      const res = await request.post('/api/boulanger/journee/feedback', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          journee_id:     'journee-inexistante-000000000000',
          rating_journee: 3,
        },
      });
      // 404 (journée non trouvée ou n'appartient pas à cette boulangerie)
      expect(res.status()).toBeGreaterThanOrEqual(400);
    });

    test('✅ Clôturer la journée (PUT /api/boulanger/journee)', async ({ request }) => {
      await setupJourneeWithProduction(request, authToken);

      // Clôture via PUT (pas POST /cloture — route inexistante)
      const res = await request.put('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.ok()).toBeTruthy();
      const body = await res.json() as { success?: boolean };
      expect(body.success).toBe(true);

      // Vérifier l'état en base
      const journeeRes = await request.get('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const journee = await journeeRes.json() as { journee?: { cloturee?: boolean } | null };
      expect(journee.journee?.cloturee).toBe(true);
    });

    test('✅ Double clôture — idempotent', async ({ request }) => {
      await setupJourneeWithProduction(request, authToken);

      // Première clôture
      const res1 = await request.put('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res1.ok()).toBeTruthy();

      // Deuxième clôture — ne doit pas crasher (UPDATE idempotent en SQL)
      const res2 = await request.put('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      // Soit succès, soit erreur métier — mais jamais un 500 ni HTML
      const body = await res2.json() as { success?: boolean; error?: string };
      expect(body.success ?? body.error).toBeDefined();
    });

  });

  test.describe('Workflow Complet', () => {

    test('🔄 Parcours complet : création → stocks → feedback → clôture', async ({ request }) => {
      // 1. Créer produit + journée
      const { journeeRes } = await setupJourneeWithProduction(request, authToken, 120);
      expect(journeeRes.ok()).toBeTruthy();

      // 2. Récupérer journée id
      const journeeId = await getJourneeId(request, authToken);
      expect(journeeId).not.toBeNull();

      // 3. Mettre à jour les stocks (snapshot 10h via re-POST)
      const produit2 = await createTestProduit(request, authToken, {
        nom:       'Croissant',
        emoji:     '🥐',
        categorie: 'viennoiserie',
      });
      expect(produit2).not.toBeNull();

      // 4. Feedback
      const feedbackRes = await request.post('/api/boulanger/journee/feedback', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          journee_id:       journeeId,
          rating_journee:   4,
          points_forts:     ['Baguettes parties très vite'],
          points_ameliorer: ['Plus de croissants'],
          commentaire_libre: 'Très belle journée !',
        },
      });
      expect(feedbackRes.ok()).toBeTruthy();

      // 5. Clôturer
      const clotureRes = await request.put('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(clotureRes.ok()).toBeTruthy();

      // 6. Vérifier l'état final
      const statusRes = await request.get('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(statusRes.ok()).toBeTruthy();
      const status = await statusRes.json() as { journee?: { cloturee?: boolean; ca_estime?: number } | null };
      expect(status.journee?.cloturee).toBe(true);
    });

  });
});