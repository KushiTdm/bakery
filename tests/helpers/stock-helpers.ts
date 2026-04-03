// tests/helpers/stock-helpers.ts
// Helpers pour les tests de gestion des stocks
// ─────────────────────────────────────────────────────────────

import { APIRequestContext } from '@playwright/test';
import { generateTestEmail } from '../fixtures/test-data';
import { registerViaApi, createTestProduit, buildStockEntry } from './auth-helpers';

// ── Types ─────────────────────────────────────────────────────

export interface StockSetup {
  token: string;
  boulangerieId: string;
  boulangerieSlug: string;
  journeeId: string;
  produits: ProduitSetup[];
}

export interface ProduitSetup {
  id: string;
  nom: string;
  emoji: string;
  prix_vente: number;
  categorie: string;
  production: number;
}

// ── Setup complet : boulangerie + produits + production ──────

export async function setupBoulangerieWithStock(
  request: APIRequestContext,
  options?: {
    produits?: Array<{
      nom: string; emoji: string; categorie: string;
      prix_vente: number; production: number;
    }>;
  }
): Promise<StockSetup | null> {
  // 1. Créer la boulangerie
  const { response, error, user } = await registerViaApi(request);
  if (error || !response) {
    console.error('[setupBoulangerieWithStock] Register:', error);
    return null;
  }

  const token = response.access_token;
  const boulangerieId = response.boulangerie!.id;
  const boulangerieSlug = response.boulangerie!.slug;

  // 2. Créer les produits
  const defaultProduits = options?.produits ?? [
    { nom: 'Baguette Tradition', emoji: '🥖', categorie: 'boulangerie', prix_vente: 1.30, production: 10 },
    { nom: 'Croissant',          emoji: '🥐', categorie: 'viennoiserie', prix_vente: 1.20, production: 5 },
    { nom: 'Pain au chocolat',   emoji: '🍫', categorie: 'viennoiserie', prix_vente: 1.40, production: 3 },
  ];

  const produits: ProduitSetup[] = [];

  for (const p of defaultProduits) {
    const created = await createTestProduit(request, token, {
      nom: p.nom, emoji: p.emoji, categorie: p.categorie, prix_vente: p.prix_vente,
    });
    if (!created) {
      console.error(`[setupBoulangerieWithStock] Produit "${p.nom}" non créé`);
      return null;
    }
    produits.push({
      id: created.id, nom: created.nom, emoji: created.emoji,
      prix_vente: created.prix_vente, categorie: p.categorie,
      production: p.production,
    });
  }

  // 3. Saisir la production du jour
  const stocks = produits.map(p => buildStockEntry(
    { id: p.id, nom: p.nom, emoji: p.emoji, prix_vente: p.prix_vente, categorie: p.categorie },
    p.production,
  ));

  const prodRes = await request.post('/api/boulanger/journee', {
    headers: { Authorization: `Bearer ${token}` },
    data: { stocks, commandesOnline: 0 },
  });

  if (!prodRes.ok()) {
    console.error('[setupBoulangerieWithStock] Journée:', await prodRes.text());
    return null;
  }

  const prodBody = await prodRes.json() as { journee_id?: string };
  if (!prodBody.journee_id) {
    console.error('[setupBoulangerieWithStock] Pas de journee_id');
    return null;
  }

  return {
    token,
    boulangerieId,
    boulangerieSlug,
    journeeId: prodBody.journee_id,
    produits,
  };
}

// ── Passer une commande click & collect ──────────────────────

export async function placeClickCollectOrder(
  request: APIRequestContext,
  slug: string,
  lignes: Array<{ produit_id: string; produit_nom: string; quantite: number; prix_unitaire: number }>,
  options?: {
    client_email?: string;
    heure_retrait?: string;
    client_prenom?: string;
  }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request.post('/api/orders', {
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
    },
    data: {
      boulangerie_slug: slug,
      client_prenom:    options?.client_prenom ?? 'Client Test',
      client_email:     options?.client_email ?? generateTestEmail(),
      heure_retrait:    options?.heure_retrait ?? '08:00',
      lignes,
    },
  });

  const body = await res.json() as Record<string, unknown>;
  return { status: res.status(), body };
}

// ── Créer des paniers flash ──────────────────────────────────

export async function createFlashBaskets(
  request: APIRequestContext,
  token: string,
  paniers: Array<{
    produit_id: string; produit_nom: string; produit_emoji: string;
    categorie: string; prix_original: number; remise_pct: number;
    prix_flash: number; quantite_initiale: number; quantite_restante: number;
    allergenes?: string[];
  }>
): Promise<boolean> {
  const res = await request.post('/api/boulanger/flash', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      paniers: paniers.map(p => ({ ...p, actif: true, allergenes: p.allergenes ?? [] })),
    },
  });

  if (!res.ok()) {
    console.error('[createFlashBaskets]', await res.text());
    return false;
  }
  return true;
}

// ── Mettre à jour le statut d'une commande ───────────────────

export async function updateOrderStatus(
  request: APIRequestContext,
  token: string,
  orderId: string,
  status: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request.patch(`/api/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { status },
  });

  const body = await res.json() as Record<string, unknown>;
  return { status: res.status(), body };
}
