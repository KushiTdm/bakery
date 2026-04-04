// tests/auth/tenant-isolation.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests d'isolation multi-tenant — Sauve Mie
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import {
  registerViaApi,
  createTestProduit,
  buildStockEntry,
  createEmployeeViaInvitation,
} from '../helpers/auth-helpers';
import { createTestUser } from '../fixtures/test-data';

async function setupTwoTenants(request: Parameters<typeof registerViaApi>[0]) {
  const userA = createTestUser();
  const userB = createTestUser();

  const [resultA, resultB] = await Promise.all([
    registerViaApi(request, userA),
    registerViaApi(request, userB),
  ]);

  if (resultA.error || !resultA.response) throw new Error(`Inscription A échouée: ${resultA.error}`);
  if (resultB.error || !resultB.response) throw new Error(`Inscription B échouée: ${resultB.error}`);

  const tokenA         = resultA.response.access_token;
  const tokenB         = resultB.response.access_token;
  const boulangerieIdA = resultA.response.boulangerie!.id;
  const boulangerieIdB = resultB.response.boulangerie!.id;

  const produitB = await createTestProduit(request, tokenB, {
    nom:       'Baguette Boulangerie B',
    emoji:     '🥖',
    categorie: 'boulangerie',
  });
  if (!produitB) throw new Error('Création produit B échouée');

  const stocksB    = [buildStockEntry(produitB, 80)];
  const journeeRes = await request.post('/api/boulanger/journee', {
    headers: { Authorization: `Bearer ${tokenB}` },
    data:    { stocks: stocksB, commandesOnline: 0 },
  });
  if (!journeeRes.ok()) throw new Error(`Création journée B échouée: ${journeeRes.status()}`);
  const journeeBody = await journeeRes.json() as { journee_id?: string };
  const journeeIdB  = journeeBody.journee_id ?? null;

  return {
    tokenA, tokenB,
    boulangerieIdA, boulangerieIdB,
    produitB, journeeIdB,
    userA, userB,
  };
}

// ═════════════════════════════════════════════════════════════
// 1. ISOLATION JOURNÉE / STOCKS
// ═════════════════════════════════════════════════════════════

test.describe('Isolation multi-tenant — Journée & Stocks', () => {

  test('❌ A ne voit que sa propre journée, pas celle de B', async ({ request }) => {
    const { tokenA, tokenB } = await setupTwoTenants(request);

    const resA = await request.get('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(resA.ok()).toBeTruthy();
    const bodyA = await resA.json() as { journee: { boulangerie_id?: string } | null };

    const resB         = await request.get('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bodyB        = await resB.json() as { journee: { boulangerie_id?: string } | null };
    const boulangerieIdB = bodyB.journee?.boulangerie_id;

    if (bodyA.journee?.boulangerie_id && boulangerieIdB) {
      expect(bodyA.journee.boulangerie_id).not.toBe(boulangerieIdB);
    }
  });

  test('❌ A ne peut pas clôturer la journée de B via PUT /api/boulanger/journee', async ({ request }) => {
    const { tokenA, tokenB } = await setupTwoTenants(request);

    const clotureWithA = await request.put('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(clotureWithA.ok()).toBeTruthy();

    const journeeBRes  = await request.get('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const journeeBBody = await journeeBRes.json() as { journee: { cloturee?: boolean } | null };
    expect(journeeBBody.journee?.cloturee).not.toBe(true);
  });

  test('❌ A ne peut pas soumettre un feedback sur la journée de B', async ({ request }) => {
    const { tokenA, journeeIdB } = await setupTwoTenants(request);

    if (!journeeIdB) { test.skip(); return; }

    const res = await request.post('/api/boulanger/journee/feedback', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: {
        journee_id:     journeeIdB,
        rating_journee: 5,
        points_forts:   ['Tout était parfait'],
      },
    });

    expect([403, 404]).toContain(res.status());
  });

  test('❌ Historique de A ne contient pas les journées de B', async ({ request }) => {
    const { tokenA, boulangerieIdB } = await setupTwoTenants(request);

    const res = await request.get('/api/boulanger/historique', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { historique: { boulangerie_id?: string }[] };

    for (const journee of body.historique ?? []) {
      if (journee.boulangerie_id) {
        expect(journee.boulangerie_id).not.toBe(boulangerieIdB);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════
// 2. ISOLATION RAPPORT IA
// ═════════════════════════════════════════════════════════════

test.describe('Isolation multi-tenant — Rapport IA', () => {

  test('❌ A ne peut pas récupérer le rapport IA de B', async ({ request }) => {
    const { tokenA, boulangerieIdB } = await setupTwoTenants(request);

    const today = new Date().toISOString().split('T')[0];
    const resA  = await request.get(`/api/boulanger/ai/rapport?date=${today}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(resA.ok()).toBeTruthy();
    const bodyA = await resA.json() as { rapport: { boulangerie_id?: string } | null };

    if (bodyA.rapport?.boulangerie_id) {
      expect(bodyA.rapport.boulangerie_id).not.toBe(boulangerieIdB);
    }
  });

  test('❌ A ne peut pas déclencher la génération du rapport IA de B', async ({ request }) => {
    const { tokenA, tokenB } = await setupTwoTenants(request);

    const today = new Date().toISOString().split('T')[0];

    await request.post('/api/boulanger/ai/rapport', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data:    {},
    });

    const rapportBRes  = await request.get(`/api/boulanger/ai/rapport?date=${today}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const rapportBBody = await rapportBRes.json() as { rapport: null | { boulangerie_id?: string } };
    expect(rapportBBody.rapport).toBeNull();
  });

  test('❌ A ne peut pas lire l\'historique IA de B', async ({ request }) => {
    const { tokenA, boulangerieIdB } = await setupTwoTenants(request);

    const res = await request.get('/api/boulanger/ai/historique', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { rapports: { boulangerie_id?: string }[] };

    for (const rapport of body.rapports ?? []) {
      if (rapport.boulangerie_id) {
        expect(rapport.boulangerie_id).not.toBe(boulangerieIdB);
      }
    }
  });

  test('❌ A ne peut pas récupérer les prévisions IA de B', async ({ request }) => {
    const { tokenA, boulangerieIdB } = await setupTwoTenants(request);

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    const res      = await request.get(`/api/boulanger/ai/appliquer?date=${tomorrow}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { previsions: { boulangerie_id?: string }[] };

    for (const prev of body.previsions ?? []) {
      if (prev.boulangerie_id) {
        expect(prev.boulangerie_id).not.toBe(boulangerieIdB);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════
// 3. ISOLATION PRODUITS (PATCH / DELETE)
// ═════════════════════════════════════════════════════════════

test.describe('Isolation multi-tenant — Produits', () => {

  test('❌ A ne peut pas modifier un produit appartenant à B (PATCH)', async ({ request }) => {
    const { tokenA, produitB } = await setupTwoTenants(request);

    const res = await request.patch('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: {
        id:         produitB.id,
        nom:        'Produit piraté par A',
        prix_vente: 0.01,
      },
    });

    expect(res.status()).toBe(404);
  });

  test('❌ A ne peut pas supprimer un produit appartenant à B (DELETE)', async ({ request }) => {
    const { tokenA, tokenB, produitB } = await setupTwoTenants(request);

    const res = await request.delete(
      `/api/boulanger/produits?id=${produitB.id}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );

    expect(res.status()).toBe(404);

    const produitsRes  = await request.get('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(produitsRes.ok()).toBeTruthy();
    const produitsBody = await produitsRes.json() as { produits: { id: string }[] };
    expect(produitsBody.produits.map(p => p.id)).toContain(produitB.id);
  });

  test('❌ A ne voit que ses propres produits (GET)', async ({ request }) => {
    const { tokenA, produitB } = await setupTwoTenants(request);

    const res  = await request.get('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { produits: { id: string }[] };
    expect(body.produits.map(p => p.id)).not.toContain(produitB.id);
  });
});

// ═════════════════════════════════════════════════════════════
// 4. ISOLATION COMMANDES
// ═════════════════════════════════════════════════════════════

test.describe('Isolation multi-tenant — Commandes', () => {

  test('❌ A ne voit pas les commandes de B via GET /api/boulanger/commandes', async ({ request }) => {
    const userA = createTestUser();
    const userB = createTestUser();

    const [resultA, resultB] = await Promise.all([
      registerViaApi(request, userA),
      registerViaApi(request, userB),
    ]);
    if (resultA.error || !resultA.response) throw new Error(`A: ${resultA.error}`);
    if (resultB.error || !resultB.response) throw new Error(`B: ${resultB.error}`);

    const tokenA         = resultA.response.access_token;
    const tokenB         = resultB.response.access_token;
    const boulangerieIdB = resultB.response.boulangerie!.id;
    const slugB          = resultB.response.boulangerie!.slug;

    const prodB = await createTestProduit(request, tokenB);
    if (prodB) {
      await request.post('/api/orders', {
        data: {
          boulangerie_slug: slugB,
          client_prenom:    'Client Test',
          client_email:     `client-${Date.now()}@example.com`,
          heure_retrait:    '08:00',
          lignes: [{
            produit_id:    prodB.id,
            produit_nom:   prodB.nom,
            quantite:      1,
            prix_unitaire: prodB.prix_vente,
          }],
        },
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const resA  = await request.get(`/api/boulanger/commandes?date=${today}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(resA.ok()).toBeTruthy();
    const bodyA = await resA.json() as { commandes: { boulangerie_id?: string }[] };

    for (const commande of bodyA.commandes ?? []) {
      if (commande.boulangerie_id) {
        expect(commande.boulangerie_id).not.toBe(boulangerieIdB);
      }
    }
  });

  test('❌ A ne peut pas changer le statut d\'une commande de B (PATCH /api/orders/:id)', async ({ request }) => {
    const userA = createTestUser();
    const userB = createTestUser();

    const [resultA, resultB] = await Promise.all([
      registerViaApi(request, userA),
      registerViaApi(request, userB),
    ]);
    if (resultA.error || !resultA.response) throw new Error(`A: ${resultA.error}`);
    if (resultB.error || !resultB.response) throw new Error(`B: ${resultB.error}`);

    const tokenA = resultA.response.access_token;
    const tokenB = resultB.response.access_token;
    const slugB  = resultB.response.boulangerie!.slug;

    const prodB = await createTestProduit(request, tokenB);
    let commandeIdB: string | null = null;

    if (prodB) {
      const orderRes = await request.post('/api/orders', {
        data: {
          boulangerie_slug: slugB,
          client_prenom:    'Client',
          client_email:     `client-${Date.now()}@example.com`,
          heure_retrait:    '08:00',
          lignes: [{
            produit_id:    prodB.id,
            produit_nom:   prodB.nom,
            quantite:      1,
            prix_unitaire: prodB.prix_vente,
          }],
        },
      });
      if (orderRes.ok()) {
        const orderBody = await orderRes.json() as { commande_id?: string };
        commandeIdB = orderBody.commande_id ?? null;
      }
    }

    if (!commandeIdB) { test.skip(); return; }

    const patchRes = await request.patch(`/api/orders/${commandeIdB}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
      data:    { status: 'confirmee' },
    });

    expect(patchRes.status()).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════
// 5. ISOLATION — EMPLOYÉ DE A ACCÈDE AUX DONNÉES DE B
// ═════════════════════════════════════════════════════════════

test.describe('Isolation multi-tenant — Employé de A vs données de B', () => {

  test('❌ Employé de A ne voit pas les produits de B', async ({ request }) => {
    const { tokenA, boulangerieIdA, produitB } = await setupTwoTenants(request);

    // boulangerieIdA passé pour que createEmployeeViaInvitation puisse upgrader le plan
    const employeeResult = await createEmployeeViaInvitation(request, tokenA, boulangerieIdA);
    if (!employeeResult) { test.skip(); return; }

    const res  = await request.get('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${employeeResult.employeeToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { produits: { id: string }[] };
    expect(body.produits.map(p => p.id)).not.toContain(produitB.id);
  });

  test('❌ Employé de A ne voit pas les commandes de B', async ({ request }) => {
    const { tokenA, boulangerieIdA, boulangerieIdB } = await setupTwoTenants(request);

    const employeeResult = await createEmployeeViaInvitation(request, tokenA, boulangerieIdA);
    if (!employeeResult) { test.skip(); return; }

    const today = new Date().toISOString().split('T')[0];
    const res   = await request.get(`/api/boulanger/commandes?date=${today}`, {
      headers: { Authorization: `Bearer ${employeeResult.employeeToken}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { commandes: { boulangerie_id?: string }[] };
    for (const c of body.commandes ?? []) {
      if (c.boulangerie_id) expect(c.boulangerie_id).not.toBe(boulangerieIdB);
    }
  });

  test('❌ Employé de A ne peut pas modifier un produit de B', async ({ request }) => {
    const { tokenA, boulangerieIdA, produitB } = await setupTwoTenants(request);

    const employeeResult = await createEmployeeViaInvitation(request, tokenA, boulangerieIdA);
    if (!employeeResult) { test.skip(); return; }

    const res = await request.patch('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${employeeResult.employeeToken}` },
      data: {
        id:         produitB.id,
        nom:        'Produit piraté par employé A',
        prix_vente: 0.01,
      },
    });

    // 403 (pas les droits write catalogue) ou 404 (produit hors tenant)
    expect([403, 404]).toContain(res.status());
  });

  test('❌ Employé de A ne peut pas lire le rapport IA de B', async ({ request }) => {
    const { tokenA, boulangerieIdA, boulangerieIdB } = await setupTwoTenants(request);

    const employeeResult = await createEmployeeViaInvitation(request, tokenA, boulangerieIdA);
    if (!employeeResult) { test.skip(); return; }

    const today = new Date().toISOString().split('T')[0];
    const res   = await request.get(`/api/boulanger/ai/rapport?date=${today}`, {
      headers: { Authorization: `Bearer ${employeeResult.employeeToken}` },
    });

    if (res.ok()) {
      const body = await res.json() as { rapport: { boulangerie_id?: string } | null };
      if (body.rapport?.boulangerie_id) {
        expect(body.rapport.boulangerie_id).not.toBe(boulangerieIdB);
      }
    } else {
      expect(res.status()).toBe(403);
    }
  });
});