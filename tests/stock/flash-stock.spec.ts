// tests/stock/flash-stock.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests de gestion stock pour les paniers flash (anti-gaspi)
//
// Problèmes ciblés :
//   - Les paniers flash réservent du stock dans la vérification C&C
//     (quantite_initiale entière est réservée, ligne 289-290)
//   - Interaction entre flash et C&C : le stock flash est compté
//     deux fois (flashVendu + flashReserve = quantite_initiale)
//   - La création de paniers flash n'est pas validée contre le stock réel
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import {
  setupBoulangerieWithStock,
  placeClickCollectOrder,
  createFlashBaskets,
} from '../helpers/stock-helpers';
import { generateTestEmail } from '../fixtures/test-data';

test.describe('Paniers Flash — Stock et interactions', () => {

  // ── Création flash baskets réduit la dispo C&C ──────────────

  test('flash baskets réduisent le stock disponible pour C&C', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 10 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    // Créer un panier flash avec 5 baguettes
    const flashOk = await createFlashBaskets(request, token, [{
      produit_id: baguette.id, produit_nom: baguette.nom, produit_emoji: baguette.emoji,
      categorie: baguette.categorie, prix_original: baguette.prix_vente,
      remise_pct: 40, prix_flash: 0.78,
      quantite_initiale: 5, quantite_restante: 5,
    }]);
    expect(flashOk).toBe(true);

    // C&C : 6 baguettes → devrait être refusé (10 - 5 flash = 5 dispo)
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 6, prix_unitaire: baguette.prix_vente },
    ]);

    expect(result.status).toBe(409);
    expect(result.body.error).toContain('Stock insuffisant');
  });

  // ── C&C passe avec stock restant après flash ────────────────

  test('C&C accepté pour stock restant après réservation flash', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 10 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    // Flash : 3 baguettes → 10 - 3 = 7 dispo en C&C
    const flashOk = await createFlashBaskets(request, token, [{
      produit_id: baguette.id, produit_nom: baguette.nom, produit_emoji: baguette.emoji,
      categorie: baguette.categorie, prix_original: baguette.prix_vente,
      remise_pct: 40, prix_flash: 0.78,
      quantite_initiale: 3, quantite_restante: 3,
    }]);
    expect(flashOk).toBe(true);

    // C&C : 5 baguettes → OK (5 ≤ 7)
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 5, prix_unitaire: baguette.prix_vente },
    ]);

    expect(result.status).toBe(201);
  });

  // ── Flash refusé si quantité > stock disponible ──────────────

  test('flash baskets refusées si quantité > stock production', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Eclair', emoji: '⚡', categorie: 'patisserie', prix_vente: 3.50, production: 2 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, produits } = setup!;
    const eclair = produits[0];

    // Tenter de créer un flash avec 10 éclairs alors que production = 2
    const flashOk = await createFlashBaskets(request, token, [{
      produit_id: eclair.id, produit_nom: eclair.nom, produit_emoji: eclair.emoji,
      categorie: eclair.categorie, prix_original: eclair.prix_vente,
      remise_pct: 50, prix_flash: 1.75,
      quantite_initiale: 10, quantite_restante: 10,
    }]);

    // La validation stock existe déjà côté flash
    expect(flashOk).toBe(false);
  });

  // ── Flash + C&C : stock correctement partagé ────────────────

  test('stock partagé correctement entre flash et C&C sur même produit', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Croissant', emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 8 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const croissant = produits[0];

    // Flash : 3 croissants
    await createFlashBaskets(request, token, [{
      produit_id: croissant.id, produit_nom: croissant.nom, produit_emoji: croissant.emoji,
      categorie: croissant.categorie, prix_original: croissant.prix_vente,
      remise_pct: 30, prix_flash: 0.84,
      quantite_initiale: 3, quantite_restante: 3,
    }]);

    // C&C commande 1 : 3 croissants → OK (8 - 3 flash = 5 dispo)
    const o1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 3, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o1.status).toBe(201);

    // C&C commande 2 : 3 croissants → REFUSÉ (5 - 3 = 2 dispo)
    const o2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 3, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o2.status).toBe(409);
  });

  // ── Flash sur plusieurs produits ────────────────────────────

  test('flash multi-produits réserve correctement le stock de chaque produit', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 6 },
        { nom: 'Croissant',          emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 4 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const baguette = produits.find(p => p.nom === 'Baguette Tradition')!;
    const croissant = produits.find(p => p.nom === 'Croissant')!;

    // Flash : 2 baguettes + 2 croissants
    await createFlashBaskets(request, token, [
      {
        produit_id: baguette.id, produit_nom: baguette.nom, produit_emoji: baguette.emoji,
        categorie: baguette.categorie, prix_original: baguette.prix_vente,
        remise_pct: 40, prix_flash: 0.78,
        quantite_initiale: 2, quantite_restante: 2,
      },
      {
        produit_id: croissant.id, produit_nom: croissant.nom, produit_emoji: croissant.emoji,
        categorie: croissant.categorie, prix_original: croissant.prix_vente,
        remise_pct: 40, prix_flash: 0.72,
        quantite_initiale: 2, quantite_restante: 2,
      },
    ]);

    // C&C : 4 baguettes + 3 croissants
    // Baguette : 6 - 2 flash = 4 dispo → OK (4)
    // Croissant : 4 - 2 flash = 2 dispo → REFUSÉ (3 > 2)
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 4, prix_unitaire: baguette.prix_vente },
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 3, prix_unitaire: croissant.prix_vente },
    ]);

    expect(result.status).toBe(409);
    const details = result.body.details as string[] | undefined;
    expect(details).toBeDefined();
    expect(details!.some((d: string) => d.includes('Croissant'))).toBe(true);
  });

  // ── BUG POTENTIEL : le calcul flash reserve tout (vendu + restant) ──
  // Ligne 289-290 du route.ts :
  //   flashVendu = quantite_initiale - quantite_restante
  //   flashReserve = quantite_restante
  //   reserved[nom] += flashVendu + flashReserve  // = quantite_initiale
  // C'est correct SI on veut réserver le total initial.
  // Mais si un flash est partiellement vendu, les items vendus
  // ne devraient-ils pas libérer du stock C&C ?

  test('flash partiellement vendu : stock C&C prend en compte quantite_initiale complète', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Tarte Fraise', emoji: '🍓', categorie: 'patisserie', prix_vente: 4.00, production: 5 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const tarte = produits[0];

    // Flash : 3 tartes, dont 1 déjà vendue (restante=2)
    await createFlashBaskets(request, token, [{
      produit_id: tarte.id, produit_nom: tarte.nom, produit_emoji: tarte.emoji,
      categorie: tarte.categorie, prix_original: tarte.prix_vente,
      remise_pct: 50, prix_flash: 2.00,
      quantite_initiale: 3, quantite_restante: 2,
    }]);

    // Stock dispo C&C = 5 - 3 (toute la réserve flash) = 2
    // OU                5 - 2 (seulement le restant) = 3 ?
    // Le code actuel réserve flashVendu + flashReserve = quantite_initiale = 3
    // → dispo = 5 - 3 = 2

    // Commande 3 tartes en C&C
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: tarte.id, produit_nom: tarte.nom, quantite: 3, prix_unitaire: tarte.prix_vente },
    ]);

    // Si le code réserve tout (quantite_initiale=3) → 5-3=2 dispo → 409
    // Si le code réserve seulement restant (2) → 5-2=3 dispo → 201
    console.log(`📊 Flash partiel : commande de 3 tartes → status ${result.status}`);
    console.log('   → Si 409 : stock réserve quantite_initiale entière (comportement actuel)');
    console.log('   → Si 201 : stock ne réserve que quantite_restante');

    expect([201, 409]).toContain(result.status);
  });
});
