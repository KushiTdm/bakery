// tests/stock/client-stock-exposure.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests vérifiant l'exposition des stocks au client
//
// Corrections appliquées :
//   - API catalogue retourne maintenant stock + en_stock par produit
//   - La RPC atomique refuse si pas de journée saisie
//   - Le matching se fait par produit_id (plus de bypass par nom)
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import {
  setupBoulangerieWithStock,
  placeClickCollectOrder,
  updateOrderStatus,
} from '../helpers/stock-helpers';
import { generateTestEmail } from '../fixtures/test-data';
import { registerViaApi, createTestProduit } from '../helpers/auth-helpers';

test.describe('Exposition stock côté client', () => {

  // ── L'API catalogue retourne les infos de stock ─────────────

  test('API catalogue contient stock et en_stock par produit', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request);
    expect(setup).not.toBeNull();
    const { boulangerieSlug } = setup!;

    const res = await request.get(`/api/catalogue/${boulangerieSlug}`);
    expect(res.ok()).toBeTruthy();

    const data = await res.json() as {
      products: Array<Record<string, unknown>>;
      hasStock: boolean;
    };

    expect(data.products).toBeDefined();
    expect(data.products.length).toBeGreaterThan(0);
    expect(data.hasStock).toBe(true);

    const firstProduct = data.products[0];
    expect('stock' in firstProduct).toBe(true);
    expect('en_stock' in firstProduct).toBe(true);
    expect(typeof firstProduct.stock).toBe('number');
    expect(typeof firstProduct.en_stock).toBe('boolean');
  });

  // ── Stock catalogue reflète les commandes en cours ──────────

  test('stock catalogue décrémenté après commande', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 5 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    // Vérifier stock initial
    const res1 = await request.get(`/api/catalogue/${boulangerieSlug}`);
    const data1 = await res1.json() as { products: Array<Record<string, unknown>> };
    const stockBefore = data1.products.find((p: Record<string, unknown>) => p.id === baguette.id)?.stock as number;
    expect(stockBefore).toBe(5);

    // Commander 3 baguettes
    await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 3, prix_unitaire: baguette.prix_vente },
    ], { client_email: generateTestEmail() });

    // Vérifier stock après commande
    const res2 = await request.get(`/api/catalogue/${boulangerieSlug}`);
    const data2 = await res2.json() as { products: Array<Record<string, unknown>> };
    const stockAfter = data2.products.find((p: Record<string, unknown>) => p.id === baguette.id)?.stock as number;
    expect(stockAfter).toBe(2);
  });

  // ── Validation serveur bloque les commandes hors stock ──────

  test('validation serveur refuse 50 baguettes pour stock=2', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 2 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 50, prix_unitaire: baguette.prix_vente },
    ]);

    expect(result.status).toBe(409);
  });

  // ── Message d'erreur stock clair ────────────────────────────

  test('message erreur stock clair pour le client', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Croissant', emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 1 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const croissant = produits[0];

    // Épuiser le stock
    await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 1, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });

    // Tentative sur stock épuisé
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 1, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });

    expect(result.status).toBe(409);
    expect(result.body.error).toBeDefined();
    const error = result.body.error as string;
    expect(error.toLowerCase()).toContain('stock');
  });

  // ── Commandes annulées libèrent le stock ────────────────────

  test('commandes annulées ne comptent plus dans le calcul stock', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Pain Special', emoji: '🥖', categorie: 'boulangerie', prix_vente: 2.50, production: 4 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const pain = produits[0];

    // 4 commandes de 1 = épuise le stock
    const orderIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const o = await placeClickCollectOrder(request, boulangerieSlug, [
        { produit_id: pain.id, produit_nom: pain.nom, quantite: 1, prix_unitaire: pain.prix_vente },
      ], { client_email: generateTestEmail() });
      expect(o.status).toBe(201);
      orderIds.push(o.body.commande_id as string);
    }

    // 5e commande refusée
    const o5 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: pain.id, produit_nom: pain.nom, quantite: 1, prix_unitaire: pain.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o5.status).toBe(409);

    // Annuler 2 commandes
    for (const id of orderIds.slice(0, 2)) {
      await updateOrderStatus(request, token, id, 'annulee');
    }

    // 2 places libres → commande de 2 passe
    const o6 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: pain.id, produit_nom: pain.nom, quantite: 2, prix_unitaire: pain.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o6.status).toBe(201);

    // Plus de stock → refusé
    const o7 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: pain.id, produit_nom: pain.nom, quantite: 1, prix_unitaire: pain.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o7.status).toBe(409);
  });

  // ── FIX : commande refusée sans journée saisie ─────────────

  test('commande refusée si boulanger n a pas saisi la journée', async ({ request }) => {
    // Créer boulangerie SANS saisir de production
    const { response, error } = await registerViaApi(request);
    expect(error).toBeNull();
    const token = response!.access_token;
    const slug = response!.boulangerie!.slug;

    const produit = await createTestProduit(request, token, {
      nom: 'Baguette', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30,
    });
    expect(produit).not.toBeNull();

    // Commander sans production saisie → refusé par la RPC
    const result = await placeClickCollectOrder(request, slug, [
      { produit_id: produit!.id, produit_nom: produit!.nom, quantite: 1, prix_unitaire: 1.30 },
    ]);

    expect(result.status).toBe(409);
    const error2 = result.body.error as string;
    expect(error2.toLowerCase()).toContain('production');
  });

  // ── FIX : matching par produit_id, pas par nom ──────────────

  test('matching par produit_id : nom modifié ne bypass pas la validation', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 2 },
      ],
    });
    expect(setup).not.toBeNull();
    const { boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    // Nom en minuscules → la RPC matche par produit_id, pas par nom
    const result = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: 'baguette tradition', quantite: 99, prix_unitaire: 1.30 },
    ]);
    expect(result.status).toBe(409);

    // Nom totalement bidon → toujours refusé car produit_id est le même
    const result2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: 'Nom Bidon', quantite: 99, prix_unitaire: 1.30 },
    ], { client_email: generateTestEmail() });
    expect(result2.status).toBe(409);
  });
});
