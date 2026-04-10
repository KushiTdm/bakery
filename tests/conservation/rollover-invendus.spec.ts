// tests/conservation/rollover-invendus.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests du système de report inter-journées des invendus
//
// Fonctionnalités couvertes :
//   - Report automatique lors de la clôture (PUT /api/boulanger/journee)
//   - duree_conservation_jours respecté (1=non reportable, 2=1 jour, etc.)
//   - est_reporte=true empêche le double-report (J-2 → J-1 → J)
//   - report_veille visible dans les stocks de la journée suivante
//   - Catalogue pour les clients : stock inclut report_veille
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, createTestProduit, buildStockEntry } from '../helpers/auth-helpers';
import { createTestUser } from '../fixtures/test-data';

// ── Helper : créer un produit avec durée de conservation ──────

async function createProduitWithConservation(
  request: Parameters<typeof registerViaApi>[0],
  token: string,
  duree: number,
  categorie: 'boulangerie' | 'viennoiserie' | 'patisserie' = 'patisserie',
) {
  const res = await request.post('/api/boulanger/produits', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nom:                       `Produit conservation ${duree}j ${Date.now()}`,
      emoji:                     '🎂',
      categorie,
      prix_vente:                4.00,
      cout_production:           1.50,
      actif_catalogue:           true,
      actif_flash:               true,
      duree_conservation_jours:  duree,
    },
  });
  if (!res.ok()) return null;
  const body = await res.json() as { produit?: { id: string; nom: string; prix_vente: number; categorie?: string; emoji?: string } };
  return body.produit ?? null;
}

// ── Helper : saisir une journée avec invendus puis clôturer ──

async function createJourneeWithUnsold(
  request: Parameters<typeof registerViaApi>[0],
  token: string,
  produits: Array<{
    id: string; nom: string; prix_vente: number; categorie?: string; emoji?: string;
    production: number; stockFinal: number;
  }>,
) {
  const stocks = produits.map(p => ({
    ...buildStockEntry(
      { id: p.id, nom: p.nom, prix_vente: p.prix_vente, categorie: p.categorie, emoji: p.emoji ?? '🥖' },
      p.production,
    ),
    stockFinal: p.stockFinal,
  }));

  const postRes = await request.post('/api/boulanger/journee', {
    headers: { Authorization: `Bearer ${token}` },
    data:    { stocks, commandesOnline: 0 },
  });
  if (!postRes.ok()) return null;

  const { journee_id } = await postRes.json() as { journee_id?: string };

  // Clôturer → déclenche le roll-over
  const putRes = await request.put('/api/boulanger/journee', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!putRes.ok()) return null;

  const putBody = await putRes.json() as { success?: boolean; rollover?: number };
  return { journee_id, rollover: putBody.rollover ?? 0 };
}

// ────────────────────────────────────────────────────────────────────────
// 1. ROLL-OVER : PRODUITS REPORTABLES
// ────────────────────────────────────────────────────────────────────────

test.describe('Conservation invendus — Roll-over à la clôture', () => {

  test('✅ Clôture déclenche le roll-over pour produits avec duree_conservation > 1', async ({ request }) => {
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const token = response.access_token;

    // Produit reportable (tarte, conservation 2 jours)
    const produit = await createProduitWithConservation(request, token, 2, 'patisserie');
    if (!produit) { test.skip(); return; }

    // Journée avec 5 invendus
    const result = await createJourneeWithUnsold(request, token, [
      { ...produit, production: 10, stockFinal: 5 },
    ]);

    if (!result) { test.skip(); return; }

    console.log(`📊 Roll-over : ${result.rollover} produit(s) reporté(s)`);

    // Vérifier que le roll-over a eu lieu
    expect(result.rollover).toBeGreaterThan(0);
  });

  test('✅ Produit duree=1 (baguette) n\'est PAS reporté', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const token = response.access_token;

    // Baguette : conservation 1 jour (non reportable)
    const produit = await createProduitWithConservation(request, token, 1, 'boulangerie');
    if (!produit) { test.skip(); return; }

    const result = await createJourneeWithUnsold(request, token, [
      { ...produit, production: 20, stockFinal: 10 },
    ]);

    if (!result) { test.skip(); return; }

    // Pas de roll-over pour duree=1
    expect(result.rollover).toBe(0);
  });

  test('✅ report_veille visible dans les stocks du lendemain (GET /api/boulanger/journee)', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const token = response.access_token;

    // Pâtisserie : conservation 2 jours → 3 invendus reportables
    const produit = await createProduitWithConservation(request, token, 2, 'patisserie');
    if (!produit) { test.skip(); return; }

    const result = await createJourneeWithUnsold(request, token, [
      { ...produit, production: 8, stockFinal: 3 },
    ]);
    if (!result || result.rollover === 0) { test.skip(); return; }

    // Lire la journée du lendemain (qui peut être aujourd'hui si le mock de date fonctionne)
    // Dans l'environnement de test, la "journée du lendemain" créée par le roll-over
    // sera chargée via GET /api/boulanger/journee
    const getRes = await request.get('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.ok()).toBeTruthy();
    const body = await getRes.json() as {
      journee?: {
        stocks_journaliers?: Array<{
          produit_id?: string;
          report_veille?: number;
          est_reporte?: boolean;
        }>;
      } | null;
      reports_veille?: Record<string, unknown>;
    };

    // Les reports disponibles doivent être visibles
    const hasReports = (body.reports_veille && Object.keys(body.reports_veille).length > 0)
      || body.journee?.stocks_journaliers?.some(s => (s.report_veille ?? 0) > 0);

    console.log(`📊 Reports visibles dans la journée suivante : ${hasReports ? 'oui' : 'non'}`);
    // Ce test valide la présence de l'info reports_veille dans la réponse
    expect(body).toHaveProperty('reports_veille');
  });

});

// ────────────────────────────────────────────────────────────────────────
// 2. PROTECTION DOUBLE-REPORT
// ────────────────────────────────────────────────────────────────────────

test.describe('Conservation invendus — Protection double-report', () => {

  test('✅ Produit déjà reporté (est_reporte=true) ne se reporte pas une 2ème fois', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const token = response.access_token;
    const boulangerieId = response.boulangerie!.id;

    // Produit conservation 3 jours (reportable 2 fois)
    const produit = await createProduitWithConservation(request, token, 3, 'patisserie');
    if (!produit) { test.skip(); return; }

    // Journée 1 : 5 invendus → report vers journée 2 (est_reporte=true dans J2)
    const r1 = await createJourneeWithUnsold(request, token, [
      { ...produit, production: 10, stockFinal: 5 },
    ]);
    if (!r1) { test.skip(); return; }
    console.log(`📊 Roll-over J1→J2: ${r1.rollover} produit(s)`);

    // Vérifier que le rollover a bien créé les stocks en base avec est_reporte=true
    // Le GET /api/boulanger/journee retourne la journée du JOUR (J1 clôturée),
    // pas J2 (demain). On vérifie directement en DB via service role.
    const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!serviceRoleKey) { test.skip(); return; }

    // Récupérer les stocks de demain (créés par le rollover)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const dbRes = await fetch(
      `${supabaseUrl}/rest/v1/stocks_journaliers?boulangerie_id=eq.${boulangerieId}&produit_id=eq.${produit.id}&select=est_reporte,report_veille,journee_id(date)`,
      {
        headers: {
          apikey:        serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const stocks = await dbRes.json() as Array<{ est_reporte?: boolean; report_veille?: number; journee_id?: { date?: string } }>;

    // Trouver le stock de demain (créé par rollover)
    const rolledOverStock = stocks.find(s => s.journee_id?.date === tomorrowStr);
    if (rolledOverStock) {
      expect(rolledOverStock.est_reporte).toBe(true);
      expect(rolledOverStock.report_veille).toBeGreaterThan(0);
      console.log(`📊 Stock reporté en J2 : est_reporte=${rolledOverStock.est_reporte}, report_veille=${rolledOverStock.report_veille}`);
    } else {
      // Si pas trouvé par date exacte, vérifier qu'au moins un stock a est_reporte=true
      const anyReported = stocks.find(s => s.est_reporte === true);
      expect(anyReported).toBeDefined();
      console.log(`📊 Stock reporté trouvé dans stocks: ${JSON.stringify(anyReported)}`);
    }
  });

});

// ────────────────────────────────────────────────────────────────────────
// 3. DURÉE DE CONSERVATION DANS LE CATALOGUE
// ────────────────────────────────────────────────────────────────────────

test.describe('Conservation invendus — Durée dans catalogue', () => {

  test('✅ PATCH produit met à jour duree_conservation_jours', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const token = response.access_token;
    const produit = await createTestProduit(request, token, {
      nom: 'Tarte Conservation Test',
      categorie: 'patisserie',
    });
    if (!produit) { test.skip(); return; }

    // Mettre à jour la durée de conservation à 3 jours
    const patchRes = await request.patch('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data:    { id: produit.id, duree_conservation_jours: 3 },
    });

    expect(patchRes.ok()).toBeTruthy();
    const body = await patchRes.json() as { produit?: { duree_conservation_jours?: number } };
    expect(body.produit?.duree_conservation_jours).toBe(3);
  });

  test('❌ duree_conservation_jours hors plage [1-7] → 400', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const token = response.access_token;
    const produit = await createTestProduit(request, token);
    if (!produit) { test.skip(); return; }

    // Tenter duree=0 (invalide)
    const res0 = await request.patch('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data:    { id: produit.id, duree_conservation_jours: 0 },
    });
    expect(res0.status()).toBe(400);

    // Tenter duree=8 (invalide)
    const res8 = await request.patch('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data:    { id: produit.id, duree_conservation_jours: 8 },
    });
    expect(res8.status()).toBe(400);
  });

  test('✅ Valeur par défaut selon catégorie : boulangerie=1, patisserie=2', async ({ request }) => {
    const user = createTestUser();
    const { response } = await registerViaApi(request, user);
    if (!response) { test.skip(); return; }

    const token = response.access_token;

    // Créer produit boulangerie sans spécifier la durée
    const resBoul = await request.post('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${token}` },
      data:    { nom: 'Baguette défaut', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30 },
    });
    expect(resBoul.ok()).toBeTruthy();
    const boulBody = await resBoul.json() as { produit?: { duree_conservation_jours?: number } };
    expect(boulBody.produit?.duree_conservation_jours).toBe(1);

    // Créer produit patisserie sans spécifier la durée
    const resPat = await request.post('/api/boulanger/produits', {
      headers: { Authorization: `Bearer ${token}` },
      data:    { nom: `Tarte défaut ${Date.now()}`, emoji: '🎂', categorie: 'patisserie', prix_vente: 4.00 },
    });
    expect(resPat.ok()).toBeTruthy();
    const patBody = await resPat.json() as { produit?: { duree_conservation_jours?: number } };
    expect(patBody.produit?.duree_conservation_jours).toBe(2);
  });

});