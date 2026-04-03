// tests/stock/click-collect-stock.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests de validation stock pour le Click & Collect
//
// Problèmes ciblés :
//   - Le C&C permet de commander sans vérifier les stocks côté client
//   - La validation serveur skip les produits sans production saisie (ligne 299)
//   - Le matching se fait par produit_nom (fragile) au lieu de produit_id
//   - Pas de vérification atomique (race condition entre check et insert)
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import {
  setupBoulangerieWithStock,
  placeClickCollectOrder,
} from '../helpers/stock-helpers';
import { generateTestEmail } from '../fixtures/test-data';

test.describe('Click & Collect — Validation stock serveur', () => {

  // ── Cas nominal : commande dans les limites du stock ────────

  test('commande acceptée quand stock suffisant', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;

    // Baguette : production=10, on commande 3
    const baguette = produits.find(p => p.nom === 'Baguette Tradition')!;
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 3, prix_unitaire: baguette.prix_vente },
    ]);

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.commande_id).toBeDefined();
  });

  // ── Commande exactement au stock disponible ─────────────────

  test('commande acceptée quand quantite = stock exact', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;

    // Pain au chocolat : production=3, on commande exactement 3
    const painChoco = produits.find(p => p.nom === 'Pain au chocolat')!;
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: painChoco.id, produit_nom: painChoco.nom, quantite: 3, prix_unitaire: painChoco.prix_vente },
    ]);

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
  });

  // ── Refus quand stock insuffisant ───────────────────────────

  test('commande refusée (409) quand stock insuffisant', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;

    // Pain au chocolat : production=3, on commande 10
    const painChoco = produits.find(p => p.nom === 'Pain au chocolat')!;
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: painChoco.id, produit_nom: painChoco.nom, quantite: 10, prix_unitaire: painChoco.prix_vente },
    ]);

    expect(result.status).toBe(409);
    expect(result.body.error).toContain('Stock insuffisant');
  });

  // ── BUG : commande de 0 stock disponible après commandes précédentes ──

  test('commande refusée quand stock épuisé par commandes précédentes', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;

    const painChoco = produits.find(p => p.nom === 'Pain au chocolat')!;

    // Première commande : prend tout le stock (3)
    const order1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: painChoco.id, produit_nom: painChoco.nom, quantite: 3, prix_unitaire: painChoco.prix_vente },
    ], { client_email: generateTestEmail() });

    expect(order1.status).toBe(201);

    // Deuxième commande : devrait être refusée car stock=0
    const order2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: painChoco.id, produit_nom: painChoco.nom, quantite: 1, prix_unitaire: painChoco.prix_vente },
    ], { client_email: generateTestEmail() });

    expect(order2.status).toBe(409);
    expect(order2.body.error).toContain('Stock insuffisant');
  });

  // ── Commande multi-produits avec un seul en rupture ─────────

  test('commande multi-produits refusée si un seul produit en rupture', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;

    const baguette = produits.find(p => p.nom === 'Baguette Tradition')!;
    const painChoco = produits.find(p => p.nom === 'Pain au chocolat')!;

    // Baguette OK (3 sur 10), Pain au chocolat KO (5 sur 3)
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 3, prix_unitaire: baguette.prix_vente },
      { produit_id: painChoco.id, produit_nom: painChoco.nom, quantite: 5, prix_unitaire: painChoco.prix_vente },
    ]);

    expect(result.status).toBe(409);
    expect(result.body.error).toContain('Stock insuffisant');
    // Les détails doivent mentionner le produit en rupture
    const details = result.body.details as string[] | undefined;
    expect(details).toBeDefined();
    expect(details!.some((d: string) => d.includes('Pain au chocolat'))).toBe(true);
  });

  // ── FIX : produit absent des stocks journaliers → refusé ───

  test('commande refusée si produit absent des stocks journaliers', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 10 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug } = setup!;

    // Commande un produit qui n'est PAS dans la production du jour
    // La RPC atomique refuse les produits non trouvés dans stocks_journaliers
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: 'fake-id', produit_nom: 'Produit Fantôme', quantite: 1, prix_unitaire: 1.00 },
    ]);

    expect(result.status).toBe(409);
  });

  // ── Décompte cumulatif : plusieurs commandes épuisent le stock ──

  test('stock décrémenté correctement sur commandes successives', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Croissant', emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 5 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const croissant = produits[0];

    // 3 commandes de 2 = 6 > stock de 5
    const order1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(order1.status).toBe(201);

    const order2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(order2.status).toBe(201);

    // 3e commande : 2 + 2 + 2 = 6 > 5 → refus
    const order3 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });

    expect(order3.status).toBe(409);
    expect(order3.body.error).toContain('Stock insuffisant');
  });

  // ── Commande avec quantité 0 ou négative ────────────────────

  test('commande refusée avec quantité invalide (0)', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 0, prix_unitaire: baguette.prix_vente },
    ]);

    expect(result.status).toBe(400);
  });

  test('commande refusée avec quantité invalide (négative)', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: -1, prix_unitaire: baguette.prix_vente },
    ]);

    expect(result.status).toBe(400);
  });

  // ── Commande avec quantité > 99 (max Zod) ──────────────────

  test('commande refusée avec quantité > 99', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 100, prix_unitaire: baguette.prix_vente },
    ]);

    expect(result.status).toBe(400);
  });

  // ── Panier vide ─────────────────────────────────────────────

  test('commande refusée avec panier vide', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug } = setup!;

    const result = await placeClickCollectOrder(request, boulangerieSlug, []);
    expect(result.status).toBe(400);
  });
});
