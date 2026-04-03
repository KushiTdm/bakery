// tests/stock/race-condition-stock.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests de concurrence / race conditions sur les stocks
//
// La vérification stock passe maintenant par une RPC PostgreSQL
// atomique (verifier_stock_commande) avec SELECT FOR SHARE,
// ce qui empêche les lectures concurrentes de voir le même état.
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import {
  setupBoulangerieWithStock,
  placeClickCollectOrder,
} from '../helpers/stock-helpers';
import { generateTestEmail } from '../fixtures/test-data';

test.describe('Race conditions — Stock Click & Collect', () => {

  // ── Race condition : 2 commandes simultanées sur le dernier stock ──

  test('deux commandes simultanées ne dépassent pas le stock', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Croissant', emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 3 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const croissant = produits[0];

    // 2 commandes de 2 en parallèle (total: 4 > stock: 3)
    const [order1, order2] = await Promise.all([
      placeClickCollectOrder(request, boulangerieSlug, [
        { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
      ], { client_email: generateTestEmail() }),
      placeClickCollectOrder(request, boulangerieSlug, [
        { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
      ], { client_email: generateTestEmail() }),
    ]);

    const accepted = [order1.status, order2.status].filter(s => s === 201).length;
    const totalCommande = accepted * 2;

    console.log(`📊 2 commandes de 2 (stock=3) : ${accepted} acceptées, total=${totalCommande}`);

    // La RPC atomique garantit que le total commandé ≤ stock
    expect(totalCommande).toBeLessThanOrEqual(3);
    expect(accepted).toBe(1);
  });

  // ── Race condition : 5 commandes simultanées sur stock limité ──

  test('rafale de commandes concurrentes ne dépasse pas le stock', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Pain Campagne', emoji: '🍞', categorie: 'boulangerie', prix_vente: 2.50, production: 5 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const pain = produits[0];

    // 5 commandes de 2 en parallèle (total: 10 > stock: 5)
    const orders = await Promise.all(
      Array.from({ length: 5 }, () =>
        placeClickCollectOrder(request, boulangerieSlug, [
          { produit_id: pain.id, produit_nom: pain.nom, quantite: 2, prix_unitaire: pain.prix_vente },
        ], { client_email: generateTestEmail() })
      )
    );

    const accepted = orders.filter(o => o.status === 201).length;
    const totalCommande = accepted * 2;

    console.log(`📊 Rafale : ${accepted} acceptées, ${orders.length - accepted} refusées, total=${totalCommande}/5`);

    // Le total commandé ne doit JAMAIS dépasser le stock
    expect(totalCommande).toBeLessThanOrEqual(5);
    expect(accepted).toBeGreaterThanOrEqual(1);
    expect(accepted).toBeLessThanOrEqual(2); // max 2 commandes de 2 dans stock=5
  });

  // ── Commande séquentielle (pas de race) : contrôle baseline ──

  test('commandes séquentielles respectent le stock correctement', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Eclair', emoji: '⚡', categorie: 'patisserie', prix_vente: 3.50, production: 4 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const eclair = produits[0];

    const o1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: eclair.id, produit_nom: eclair.nom, quantite: 2, prix_unitaire: eclair.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o1.status).toBe(201);

    const o2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: eclair.id, produit_nom: eclair.nom, quantite: 2, prix_unitaire: eclair.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o2.status).toBe(201);

    // Stock épuisé
    const o3 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: eclair.id, produit_nom: eclair.nom, quantite: 1, prix_unitaire: eclair.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o3.status).toBe(409);
  });

  // ── Race condition : dernier item ──────────────────────────

  test('commandes simultanées au dernier item : exactement 1 acceptée', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Macaron', emoji: '🧁', categorie: 'patisserie', prix_vente: 2.00, production: 1 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const macaron = produits[0];

    // 3 clients veulent le dernier macaron en même temps
    const orders = await Promise.all(
      Array.from({ length: 3 }, () =>
        placeClickCollectOrder(request, boulangerieSlug, [
          { produit_id: macaron.id, produit_nom: macaron.nom, quantite: 1, prix_unitaire: macaron.prix_vente },
        ], { client_email: generateTestEmail() })
      )
    );

    const accepted = orders.filter(o => o.status === 201).length;
    console.log(`📊 Dernier macaron : ${accepted} acceptées sur 3`);

    expect(accepted).toBe(1);
  });
});
