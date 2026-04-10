// tests/security/flash-achat-hors-periode.spec.ts
// ─────────────────────────────────────────────────────────────
// VULN-002 : Achat flash hors période horaire
//
// La route /api/paniers/[slug]/acheter ne vérifiait pas si l'heure
// locale de la boulangerie est dans [flash_heure_debut, flash_heure_fin].
// Un client pouvait acheter des paniers flash à n'importe quelle heure.
//
// Fix attendu dans la route : comparer l'heure locale du boulangerie.timezone
// avec flash_heure_debut et flash_heure_fin avant d'appeler la RPC.
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, createTestProduit, buildStockEntry } from '../helpers/auth-helpers';
import { createFlashBaskets } from '../helpers/stock-helpers';
import { createTestUser, generateTestEmail } from '../fixtures/test-data';

// ── Helper : setup boulangerie + produit + journée + flash ────

async function setupFlashScenario(
  request: Parameters<typeof registerViaApi>[0],
  flashHeureDebut = 18,
  flashHeureFin = 20,
) {
  const user = createTestUser();
  const { response, error } = await registerViaApi(request, user);
  if (error || !response) throw new Error(`Inscription échouée: ${error}`);

  const token = response.access_token;
  const slug  = response.boulangerie!.slug;
  const id    = response.boulangerie!.id;

  // Configurer les heures flash via le profil
  await request.patch('/api/boulanger/profil', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      flash_heure_debut: flashHeureDebut,
      flash_heure_fin:   flashHeureFin,
    },
  });

  // Créer un produit
  const produit = await createTestProduit(request, token);
  if (!produit) throw new Error('Produit non créé');

  // Saisir la production
  const stocks = [buildStockEntry(produit, 10)];
  await request.post('/api/boulanger/journee', {
    headers: { Authorization: `Bearer ${token}` },
    data:    { stocks, commandesOnline: 0 },
  });

  // Créer des paniers flash
  await createFlashBaskets(request, token, [{
    produit_id:        produit.id,
    produit_nom:       produit.nom,
    produit_emoji:     produit.emoji ?? '🥖',
    categorie:         produit.categorie ?? 'boulangerie',
    prix_original:     produit.prix_vente,
    remise_pct:        40,
    prix_flash:        Math.round(produit.prix_vente * 0.6 * 100) / 100,
    quantite_initiale: 5,
    quantite_restante: 5,
  }]);

  // Créer un compte client pour l'achat
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const clientEmail     = generateTestEmail();
  const clientPwd       = 'ClientPass123';

  const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
    body:    JSON.stringify({ email: clientEmail, password: clientPwd }),
  });
  const signupBody    = await signupRes.json() as { access_token?: string };
  const clientToken   = signupBody.access_token ?? null;

  return { token, slug, id, produit, clientToken, clientEmail };
}

// ────────────────────────────────────────────────────────────────────────
// 1. COMPORTEMENT ATTENDU : blocage hors période
// ────────────────────────────────────────────────────────────────────────

test.describe('Flash — Contrôle période horaire', () => {

  test('❌ Achat flash refusé si heure hors période (flash_heure_debut=23, flash_heure_fin=24)', async ({ request }) => {
    // On configure un créneau flash dans le futur (23h-24h) pour simuler
    // un achat hors période au moment où le test s'exécute (< 23h en général).
    const { slug, clientToken } = await setupFlashScenario(request, 23, 24);

    if (!clientToken) { test.skip(); return; }

    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    { panier_complet: true },
    });

    // La route doit vérifier l'heure locale et retourner 403 ou 409 hors période
    // Avant le fix : retournait 201 (achat réussi à n'importe quelle heure)
    // Après le fix  : retourne 403 (hors période flash)
    expect([403, 409]).toContain(res.status());
    if (res.status() === 403) {
      const body = await res.json() as { error?: string };
      expect(body.error?.toLowerCase()).toMatch(/hors période|période flash|flash/i);
    }
  });

  test('❌ Achat flash refusé si heure hors période (flash_heure_debut=0, flash_heure_fin=1)', async ({ request }) => {
    // Créneau 0h-1h : sauf si le test tourne exactement à minuit, hors période
    const now = new Date();
    const currentHour = now.getHours();

    // Si on est entre 0h et 1h, ce test ne peut pas valider le comportement attendu
    if (currentHour === 0) { test.skip(); return; }

    const { slug, clientToken } = await setupFlashScenario(request, 0, 1);
    if (!clientToken) { test.skip(); return; }

    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    { panier_complet: true },
    });

    expect([403, 409]).toContain(res.status());
  });

  test('⚠️ API publique /api/paniers/[slug] reflète flashActif=false hors période', async ({ request }) => {
    // La route GET /api/paniers/[slug] retourne flashActif basé sur l'heure locale.
    // Si on est hors période, flashActif doit être false.
    const { slug } = await setupFlashScenario(request, 23, 24);

    const res = await request.get(`/api/paniers/${slug}`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json() as { flashActif?: boolean; heureDebut?: number; heureFin?: number };
    // Hors période → flashActif false (sauf si on tourne entre 23h et 24h)
    const currentHour = new Date().getHours();
    if (currentHour < 23) {
      expect(body.flashActif).toBe(false);
    }
  });

  test('✅ Achat flash accepté pendant la période (flash_heure_debut=0, flash_heure_fin=24)', async ({ request }) => {
    // Créneau 0h-24h = toujours ouvert : doit être accepté
    const { slug, clientToken } = await setupFlashScenario(request, 0, 24);
    if (!clientToken) { test.skip(); return; }

    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    { panier_complet: true },
    });

    // 201 = achat réussi, 409 = épuisé (mais achat tenté), 404 = slug invalide
    // En aucun cas 403 (hors période) car le créneau couvre 24h
    expect(res.status()).not.toBe(403);
    expect([201, 409, 404]).toContain(res.status());
  });

});

// ────────────────────────────────────────────────────────────────────────
// 2. DOUBLON D'ACHAT (même client, même session)
// ────────────────────────────────────────────────────────────────────────

test.describe('Flash — Protection doublon achat concurrent', () => {

  test('❌ Deux achats simultanés du même client ne dépassent pas le stock', async ({ request }) => {
    const { slug, clientToken } = await setupFlashScenario(request, 0, 24);
    if (!clientToken) { test.skip(); return; }

    // Deux requêtes simultanées depuis le même compte client
    const [r1, r2] = await Promise.all([
      request.post(`/api/paniers/${slug}/acheter`, {
        headers: { Authorization: `Bearer ${clientToken}` },
        data:    { panier_complet: true },
      }),
      request.post(`/api/paniers/${slug}/acheter`, {
        headers: { Authorization: `Bearer ${clientToken}` },
        data:    { panier_complet: true },
      }),
    ]);

    const statuses = [r1.status(), r2.status()];
    const accepted = statuses.filter(s => s === 201).length;

    // La RPC atomique `acheter_paniers_flash` avec SELECT FOR UPDATE garantit
    // qu'au plus UNE des deux requêtes réussit par panier flash
    console.log(`📊 Deux achats simultanés → statuts: ${statuses.join(', ')}, acceptés: ${accepted}`);

    // Un des deux doit échouer (409 = épuisé)
    expect(accepted).toBeLessThanOrEqual(1);
  });

  test('❌ Achat flash sans authentification → 401', async ({ request }) => {
    const { slug } = await setupFlashScenario(request, 0, 24);

    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      data: { panier_complet: true },
    });

    expect(res.status()).toBe(401);
  });

  test('❌ Achat flash avec client bloqué (pénalités) → 403', async ({ request }) => {
    // Ce test vérifie que le système de pénalités bloque aussi les achats flash
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const token = response.access_token;
    const slug  = response.boulangerie!.slug;

    // Configurer flash 0h-24h pour que le check horaire ne bloque pas avant le check pénalités
    await request.patch('/api/boulanger/profil', {
      headers: { Authorization: `Bearer ${token}` },
      data: { flash_heure_debut: 0, flash_heure_fin: 24 },
    });

    // Créer produit + journée
    const produit = await createTestProduit(request, token);
    if (!produit) { test.skip(); return; }
    const stocks = [buildStockEntry(produit, 10)];
    await request.post('/api/boulanger/journee', {
      headers: { Authorization: `Bearer ${token}` },
      data:    { stocks, commandesOnline: 0 },
    });

    // Créer flash
    await createFlashBaskets(request, token, [{
      produit_id:        produit.id,
      produit_nom:       produit.nom,
      produit_emoji:     '🥖',
      categorie:         'boulangerie',
      prix_original:     produit.prix_vente,
      remise_pct:        40,
      prix_flash:        0.78,
      quantite_initiale: 5,
      quantite_restante: 5,
    }]);

    // Créer un client et le bloquer manuellement via l'API boulanger
    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const clientEmail     = generateTestEmail();

    const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body:    JSON.stringify({ email: clientEmail, password: 'ClientPass123' }),
    });
    const signupBody  = await signupRes.json() as { access_token?: string };
    const clientToken = signupBody.access_token;
    if (!clientToken) { test.skip(); return; }

    // Bloquer le client via la table client_penalites (via service_role direct)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!serviceRoleKey) { test.skip(); return; }

    await fetch(`${supabaseUrl}/rest/v1/client_penalites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:          serviceRoleKey,
        Authorization:  `Bearer ${serviceRoleKey}`,
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({
        boulangerie_id:  response.boulangerie!.id,
        client_email:    clientEmail,
        nb_non_recupere: 5,
        bloque:          true,
        blocage_date:    new Date().toISOString(),
      }),
    });

    // Tenter l'achat flash avec le client bloqué
    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    { panier_complet: true },
    });

    expect(res.status()).toBe(403);
    const body = await res.json() as { error?: string };
    expect(body.error?.toLowerCase()).toContain('suspendu');
  });

});

// ────────────────────────────────────────────────────────────────────────
// 3. VALIDATION DES INPUTS
// ────────────────────────────────────────────────────────────────────────

test.describe('Flash — Validation inputs achat', () => {

  test('❌ Slug invalide → 400', async ({ request }) => {
    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body:    JSON.stringify({ email: generateTestEmail(), password: 'ClientPass123' }),
    });
    const { access_token: clientToken } = await signupRes.json() as { access_token?: string };
    if (!clientToken) { test.skip(); return; }

    const res = await request.post('/api/paniers/INVALID_SLUG_WITH_CAPS/acheter', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    { panier_complet: true },
    });

    expect(res.status()).toBe(400);
  });

  test('❌ Body vide (ni panier_complet ni produit_ids) → 400', async ({ request }) => {
    const { slug, clientToken } = await setupFlashScenario(request, 0, 24);
    if (!clientToken) { test.skip(); return; }

    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    {},
    });

    expect(res.status()).toBe(400);
  });

  test('❌ produit_ids vide [] → 400', async ({ request }) => {
    const { slug, clientToken } = await setupFlashScenario(request, 0, 24);
    if (!clientToken) { test.skip(); return; }

    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    { produit_ids: [] },
    });

    expect(res.status()).toBe(400);
  });

  test('❌ Boulangerie inactive → 403', async ({ request }) => {
    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const slug           = response.boulangerie!.slug;
    const boulangerieId  = response.boulangerie!.id;

    // Désactiver la boulangerie
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!serviceRoleKey) { test.skip(); return; }
    await fetch(`${supabaseUrl}/rest/v1/boulangeries?id=eq.${boulangerieId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey:          serviceRoleKey,
        Authorization:  `Bearer ${serviceRoleKey}`,
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({ actif: false }),
    });

    const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body:    JSON.stringify({ email: generateTestEmail(), password: 'ClientPass123' }),
    });
    const { access_token: clientToken } = await signupRes.json() as { access_token?: string };
    if (!clientToken) { test.skip(); return; }

    const res = await request.post(`/api/paniers/${slug}/acheter`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data:    { panier_complet: true },
    });

    expect(res.status()).toBe(403);
  });

});