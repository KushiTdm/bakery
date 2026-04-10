// tests/unit/products.spec.ts
// Tests unitaires pour lib/products.ts
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { products, categories } from '../../lib/products';
import type { Product } from '../../lib/products';

// ── Structure du catalogue ────────────────────────────────────

test.describe('Catalogue produits - Structure', () => {
  test('✅ Le catalogue contient des produits', () => {
    expect(products.length).toBeGreaterThan(0);
  });

  test('✅ Chaque produit a les champs requis', () => {
    for (const product of products) {
      expect(product.id).toBeDefined();
      expect(product.id).not.toBe('');

      expect(product.name).toBeDefined();
      expect(product.name.length).toBeGreaterThan(0);

      expect(['boulangerie', 'viennoiserie', 'patisserie']).toContain(product.category);

      expect(product.description).toBeDefined();

      expect(typeof product.price).toBe('number');
      expect(product.price).toBeGreaterThan(0);

      expect(product.image).toBeDefined();
      expect(product.image).toMatch(/^(https?:\/\/|\/products\/)/)
    }
  });

  test('✅ Tous les IDs sont uniques', () => {
    const ids = products.map(p => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('✅ Tous les noms sont uniques', () => {
    const names = products.map(p => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  test('✅ Les prix sont raisonnables (0.50€ - 50€)', () => {
    for (const product of products) {
      expect(product.price).toBeGreaterThanOrEqual(0.5);
      expect(product.price).toBeLessThanOrEqual(50);
    }
  });
});

// ── Catégories ────────────────────────────────────────────────

test.describe('Catalogue produits - Catégories', () => {
  test('✅ Les catégories contiennent "all" et les 3 types', () => {
    const catIds = categories.map(c => c.id);
    expect(catIds).toContain('all');
    expect(catIds).toContain('boulangerie');
    expect(catIds).toContain('viennoiserie');
    expect(catIds).toContain('patisserie');
  });

  test('✅ Chaque catégorie a un label', () => {
    for (const cat of categories) {
      expect(cat.label).toBeDefined();
      expect(cat.label.length).toBeGreaterThan(0);
    }
  });

  test('✅ Il y a des produits dans chaque catégorie', () => {
    const boulangerie  = products.filter(p => p.category === 'boulangerie');
    const viennoiserie = products.filter(p => p.category === 'viennoiserie');
    const patisserie   = products.filter(p => p.category === 'patisserie');

    expect(boulangerie.length).toBeGreaterThan(0);
    expect(viennoiserie.length).toBeGreaterThan(0);
    expect(patisserie.length).toBeGreaterThan(0);
  });

  test('✅ Filtre par catégorie fonctionne', () => {
    const boulangerie = products.filter(p => p.category === 'boulangerie');
    for (const p of boulangerie) {
      expect(p.category).toBe('boulangerie');
    }
  });
});

// ── Produits spécifiques ──────────────────────────────────────

test.describe('Catalogue produits - Produits clés', () => {
  test('✅ La baguette tradition existe', () => {
    const baguette = products.find(p => p.name.toLowerCase().includes('baguette'));
    expect(baguette).toBeDefined();
    expect(baguette!.category).toBe('boulangerie');
  });

  test('✅ Le croissant existe', () => {
    const croissant = products.find(p => p.name.toLowerCase().includes('croissant'));
    expect(croissant).toBeDefined();
    expect(croissant!.category).toBe('viennoiserie');
  });

  test('✅ Les images sont des chemins locaux valides', () => {
    for (const product of products) {
      expect(product.image).toMatch(/^\/products\/.+\.(jpg|png)$/);
    }
  });
});

// ── Type safety ───────────────────────────────────────────────

test.describe('Catalogue produits - Types', () => {
  test('✅ Type Product est correctement typé', () => {
    // Vérifie que le premier produit est conforme à l'interface Product
    const p: Product = products[0];
    expect(typeof p.id).toBe('string');
    expect(typeof p.name).toBe('string');
    expect(typeof p.price).toBe('number');
    expect(typeof p.image).toBe('string');
    expect(typeof p.description).toBe('string');
    expect(['boulangerie', 'viennoiserie', 'patisserie']).toContain(p.category);
  });
});