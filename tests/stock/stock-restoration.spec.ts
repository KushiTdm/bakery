// tests/stock/stock-restoration.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests de restauration stock lors d'annulation/non-récupération
//
// Problèmes ciblés :
//   - Restauration flash fonctionne-t-elle pour tous les statuts ?
//   - Le stock C&C n'est PAS restauré (pas de décrémentation côté stocks_journaliers)
//   - La restauration flash utilise la date du jour → échoue si annulé le lendemain
//   - Le stock C&C annulé libère-t-il la réservation pour de nouvelles commandes ?
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import {
  setupBoulangerieWithStock,
  placeClickCollectOrder,
  createFlashBaskets,
  updateOrderStatus,
} from '../helpers/stock-helpers';
import { generateTestEmail } from '../fixtures/test-data';

test.describe('Restauration stock — Annulation et non-récupération', () => {

  // ── C&C annulé : le stock est-il libéré pour les prochaines commandes ? ──

  test('stock C&C libéré après annulation de commande', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 5 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const baguette = produits[0];

    // Commande 1 : prend 4 sur 5
    const order1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 4, prix_unitaire: baguette.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(order1.status).toBe(201);
    const orderId1 = order1.body.commande_id as string;

    // Vérifier que stock restant = 1
    const order2Fail = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 3, prix_unitaire: baguette.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(order2Fail.status).toBe(409);

    // Annuler la commande 1
    const cancel = await updateOrderStatus(request, token, orderId1, 'annulee');
    expect(cancel.status).toBe(200);

    // Maintenant le stock devrait être libéré (5 dispo à nouveau)
    const order3 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 4, prix_unitaire: baguette.prix_vente },
    ], { client_email: generateTestEmail() });

    // Le stock devrait être libéré car la commande annulée n'est plus
    // dans les statuts ['en_attente', 'confirmee', 'prete']
    expect(order3.status).toBe(201);
  });

  // ── C&C non récupéré : même logique ─────────────────────────

  test('stock C&C libéré après commande non_recuperee', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Croissant', emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 3 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const croissant = produits[0];

    // Prend tout le stock
    const order1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 3, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(order1.status).toBe(201);
    const orderId1 = order1.body.commande_id as string;

    // Marquer comme non récupérée
    const noShow = await updateOrderStatus(request, token, orderId1, 'non_recuperee');
    expect(noShow.status).toBe(200);

    // Le stock devrait être libéré
    const order2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });

    expect(order2.status).toBe(201);
  });

  // ── FIX : C&C récupéré = stock consommé (ne revient pas) ────

  test('stock C&C reste consommé après commande recuperee', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Pain Complet', emoji: '🍞', categorie: 'boulangerie', prix_vente: 2.00, production: 3 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const pain = produits[0];

    // Prend tout le stock
    const order1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: pain.id, produit_nom: pain.nom, quantite: 3, prix_unitaire: pain.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(order1.status).toBe(201);
    const orderId1 = order1.body.commande_id as string;

    // Marquer comme récupérée
    await updateOrderStatus(request, token, orderId1, 'confirmee');
    await updateOrderStatus(request, token, orderId1, 'prete');
    await updateOrderStatus(request, token, orderId1, 'recuperee');

    // Le stock ne revient PAS — 'recuperee' est maintenant inclus
    // dans le filtre de la RPC atomique → stock reste consommé
    const order2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: pain.id, produit_nom: pain.nom, quantite: 1, prix_unitaire: pain.prix_vente },
    ], { client_email: generateTestEmail() });

    expect(order2.status).toBe(409);
  });

  // ── Workflow complet : commande → annulation → nouvelle commande ──

  test('cycle complet : commande → annulation → re-commande avec même stock', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Fougasse', emoji: '🫓', categorie: 'boulangerie', prix_vente: 3.00, production: 2 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const fougasse = produits[0];

    // Commande 1 : 2 fougasses (tout le stock)
    const o1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: fougasse.id, produit_nom: fougasse.nom, quantite: 2, prix_unitaire: fougasse.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o1.status).toBe(201);

    // Commande 2 : refusée
    const o2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: fougasse.id, produit_nom: fougasse.nom, quantite: 1, prix_unitaire: fougasse.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o2.status).toBe(409);

    // Annuler commande 1
    await updateOrderStatus(request, token, o1.body.commande_id as string, 'annulee');

    // Commande 3 : acceptée (stock libéré)
    const o3 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: fougasse.id, produit_nom: fougasse.nom, quantite: 2, prix_unitaire: fougasse.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o3.status).toBe(201);
  });

  // ── Annulation partielle : une commande multi-produit ───────

  test('annulation libère tous les produits de la commande', async ({ request }) => {
    const setup = await setupBoulangerieWithStock(request, {
      produits: [
        { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 3 },
        { nom: 'Croissant',          emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 2 },
      ],
    });
    expect(setup).not.toBeNull();
    const { token, boulangerieSlug, produits } = setup!;
    const baguette = produits.find(p => p.nom === 'Baguette Tradition')!;
    const croissant = produits.find(p => p.nom === 'Croissant')!;

    // Commande 1 : 3 baguettes + 2 croissants (tout le stock)
    const o1 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 3, prix_unitaire: baguette.prix_vente },
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o1.status).toBe(201);

    // Annuler
    await updateOrderStatus(request, token, o1.body.commande_id as string, 'annulee');

    // Commande 2 : même chose → doit passer
    const o2 = await placeClickCollectOrder(request, boulangerieSlug, [
      { produit_id: baguette.id, produit_nom: baguette.nom, quantite: 3, prix_unitaire: baguette.prix_vente },
      { produit_id: croissant.id, produit_nom: croissant.nom, quantite: 2, prix_unitaire: croissant.prix_vente },
    ], { client_email: generateTestEmail() });
    expect(o2.status).toBe(201);
  });
});
