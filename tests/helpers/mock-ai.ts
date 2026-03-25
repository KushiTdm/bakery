// tests/helpers/mock-ai.ts
// Mock des réponses IA pour les tests Playwright
// ─────────────────────────────────────────────────────────────

import { Page, Route } from '@playwright/test';
import { MOCK_AI_RAPPORT } from '../fixtures/test-data';

// ── Types ─────────────────────────────────────────────────────

export interface MockRapportOptions {
  score?: number;
  verdict?: string;
  statut?: 'en_cours' | 'genere' | 'erreur';
  delay?: number;
  error?: string;
}

// ── Mock Rapport IA ───────────────────────────────────────────

/**
 * Mock la route de génération de rapport IA
 */
export async function mockAiRapportGeneration(
  page: Page,
  options: MockRapportOptions = {}
): Promise<void> {
  const {
    score = 78,
    verdict = 'Bonne performance globale',
    statut = 'genere',
    delay = 500,
    error,
  } = options;

  await page.route('**/api/boulanger/ai/rapport', async (route: Route) => {
    const request = route.request();
    const method = request.method();

    // GET - Récupérer le rapport
    if (method === 'GET') {
      if (error) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rapport: {
            id: 'rapport-test-123',
            date: new Date().toISOString().split('T')[0],
            score_performance: score,
            verdict_flash: verdict,
            rapport_json: MOCK_AI_RAPPORT,
            statut,
            created_at: new Date().toISOString(),
          },
          previsions: MOCK_AI_RAPPORT.previsions_production.map((p, i) => ({
            id: `prev-${i}`,
            produit_id: p.produit_id,
            produit_nom: `Produit ${i + 1}`,
            produit_emoji: '🥖',
            produit_categorie: 'pains',
            quantite_suggeree: p.quantite_suggeree,
            quantite_base: 100,
            variation_pct: p.variation_pct,
            raison: p.raison,
            appliquee: false,
          })),
          quota_info: {
            can_generate: true,
            plan: 'pro',
            quota_limit: 10,
            quota_used: 1,
            quota_remaining: 9,
          },
          starter_preview: false,
        }),
      });
      return;
    }

    // POST - Générer le rapport
    if (method === 'POST') {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      if (error) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rapport: {
            id: 'rapport-test-123',
            date: new Date().toISOString().split('T')[0],
            score_performance: score,
            verdict_flash: verdict,
            rapport_json: MOCK_AI_RAPPORT,
            statut: 'genere',
            created_at: new Date().toISOString(),
          },
          previsions: MOCK_AI_RAPPORT.previsions_production.map((p, i) => ({
            id: `prev-${i}`,
            produit_id: p.produit_id,
            produit_nom: `Produit ${i + 1}`,
            produit_emoji: '🥖',
            produit_categorie: 'pains',
            quantite_suggeree: p.quantite_suggeree,
            quantite_base: 100,
            variation_pct: p.variation_pct,
            raison: p.raison,
            appliquee: false,
          })),
          cached: false,
          quota_info: {
            can_generate: true,
            plan: 'pro',
            quota_limit: 10,
            quota_used: 1,
            quota_remaining: 9,
          },
        }),
      });
      return;
    }
  });
}

/**
 * Mock quota atteint
 */
export async function mockAiQuotaReached(page: Page): Promise<void> {
  await page.route('**/api/boulanger/ai/rapport', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Quota hebdomadaire atteint',
          quota_reached: true,
          upgrade_required: true,
          quota_info: {
            can_generate: false,
            plan: 'starter',
            quota_limit: 1,
            quota_used: 1,
            quota_remaining: 0,
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock plan starter (aperçu limité)
 */
export async function mockStarterPlan(page: Page): Promise<void> {
  await page.route('**/api/boulanger/ai/rapport', async (route: Route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rapport: {
            id: 'rapport-test-123',
            date: new Date().toISOString().split('T')[0],
            score_performance: 75,
            verdict_flash: 'Journée correcte',
            rapport_json: {
              score: 75,
              verdict: 'Journée correcte',
              message_levain: 'Passez au plan Pro pour débloquer l\'analyse complète.',
              _starter_preview: true,
            },
            statut: 'genere',
          },
          previsions: [], // Starter = pas de prévisions
          quota_info: {
            can_generate: true,
            plan: 'starter',
            quota_limit: 1,
            quota_used: 0,
            quota_remaining: 1,
          },
          starter_preview: true,
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock rapport en cours de génération
 */
export async function mockAiRapportEnCours(page: Page): Promise<void> {
  let callCount = 0;

  await page.route('**/api/boulanger/ai/rapport', async (route: Route) => {
    const method = route.request().method();
    callCount++;

    if (method === 'GET') {
      // Premier appel : en cours
      if (callCount <= 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            rapport: {
              id: 'rapport-test-123',
              date: new Date().toISOString().split('T')[0],
              statut: 'en_cours',
              score_performance: null,
              verdict_flash: null,
            },
            previsions: [],
          }),
        });
      } else {
        // Appels suivants : terminé
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            rapport: {
              id: 'rapport-test-123',
              date: new Date().toISOString().split('T')[0],
              score_performance: 82,
              verdict_flash: 'Excellente journée !',
              rapport_json: MOCK_AI_RAPPORT,
              statut: 'genere',
            },
            previsions: [],
          }),
        });
      }
    } else if (method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rapport: {
            id: 'rapport-test-123',
            statut: 'en_cours',
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock application des prévisions
 */
export async function mockAppliquerPrevisions(page: Page): Promise<void> {
  await page.route('**/api/boulanger/ai/appliquer', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        applied_count: 5,
        date_production: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      }),
    });
  });
}

// ── Mock Date Today ───────────────────────────────────────────

/**
 * Mock la route /api/boulanger/ai/today
 */
export async function mockToday(page: Page, date?: string): Promise<void> {
  const todayDate = date ?? new Date().toISOString().split('T')[0];

  await page.route('**/api/boulanger/ai/today', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        today: todayDate,
        timezone: 'Europe/Paris',
      }),
    });
  });
}

// ── Nettoyage ────────────────────────────────────────────────

/**
 * Supprime tous les mocks
 */
export async function clearAllMocks(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}