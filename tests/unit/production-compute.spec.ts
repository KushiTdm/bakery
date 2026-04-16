// tests/unit/production-compute.spec.ts
import { test, expect } from '@playwright/test';

test.describe('computeProductionSuggestions', () => {
  const produitBaguette = {
    id: 'uuid-baguette', nom: 'Baguette Tradition', emoji: '🥖',
    categorie: 'boulangerie', prix_vente: 1.2,
  };
  const produitCroissant = {
    id: 'uuid-croissant', nom: 'Croissant', emoji: '🥐',
    categorie: 'viennoiserie', prix_vente: 1.5,
  };
  const stocksAujourd = [
    { produit_id: 'uuid-baguette', production: 100, stock_final: 10 },
    { produit_id: 'uuid-croissant', production: 50, stock_final: 0 },
  ];
  const histoMemeJour = [
    { date: '2026-04-10', stocks_journaliers: [
      { produit_id: 'uuid-baguette', production: 95, stock_final: 5 },
      { produit_id: 'uuid-croissant', production: 55, stock_final: 0 },
    ]},
    { date: '2026-04-03', stocks_journaliers: [
      { produit_id: 'uuid-baguette', production: 90, stock_final: 8 },
      { produit_id: 'uuid-croissant', production: 50, stock_final: 2 },
    ]},
    { date: '2026-03-27', stocks_journaliers: [
      { produit_id: 'uuid-baguette', production: 100, stock_final: 6 },
      { produit_id: 'uuid-croissant', production: 48, stock_final: 1 },
    ]},
  ];

  test('produit avec historique : utilise moyenne pondérée', async ({ request }) => {
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd,
        histoMemeJour,
        meteo: null,
        preCommandes: {},
      },
    });
    expect(res.ok()).toBeTruthy();
    const { suggestions } = await res.json();
    const baguette = suggestions.find((s: { produit_id: string }) => s.produit_id === 'uuid-baguette');
    expect(baguette).toBeDefined();
    expect(baguette.qty_suggere).toBeGreaterThanOrEqual(85);
    expect(baguette.qty_suggere).toBeLessThanOrEqual(105);
    expect(baguette.nb_jours_histo).toBe(3);
  });

  test('produit sans historique : utilise production aujourd\'hui', async ({ request }) => {
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd,
        histoMemeJour: [],
        meteo: null,
        preCommandes: {},
      },
    });
    const { suggestions } = await res.json();
    const baguette = suggestions.find((s: { produit_id: string }) => s.produit_id === 'uuid-baguette');
    expect(baguette.nb_jours_histo).toBe(0);
    expect(baguette.qty_base).toBe(100);
  });

  test('produit 100% vendu aujourd\'hui → qty_suggere augmente', async ({ request }) => {
    const stockToutVendu = [{ produit_id: 'uuid-croissant', production: 50, stock_final: 0 }];
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitCroissant],
        stocksAujourd: stockToutVendu,
        histoMemeJour: [],
        meteo: null,
        preCommandes: {},
      },
    });
    const { suggestions } = await res.json();
    const croissant = suggestions[0];
    expect(croissant.qty_suggere).toBeGreaterThan(50);
  });

  test('météo pluie forte → coefficient réduit boulangerie', async ({ request }) => {
    const meteoOrage = {
      actuelle: { temperature_c: 14, ressenti_c: 12, humidite_pct: 90, precipitations_mm: 8,
                  vitesse_vent_kmh: 20, code_meteo: 95, description: 'Orage', icone: '⛈️' },
      demain:   { temp_max_c: 12, temp_min_c: 9, precip_mm: 12, code_meteo: 95,
                  description: 'Orage', icone: '⛈️' },
    };
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd,
        histoMemeJour,
        meteo: meteoOrage,
        preCommandes: {},
      },
    });
    const { suggestions } = await res.json();
    const baguette = suggestions[0];
    expect(baguette.facteur_meteo).toBeLessThan(1.0);
  });

  test('pré-commandes forcent qty_min', async ({ request }) => {
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd: [{ produit_id: 'uuid-baguette', production: 10, stock_final: 0 }],
        histoMemeJour: [],
        meteo: null,
        preCommandes: { 'uuid-baguette': { nom: 'Baguette Tradition', quantite: 25 } },
      },
    });
    const { suggestions } = await res.json();
    expect(suggestions[0].qty_min).toBeGreaterThanOrEqual(25);
  });
});
