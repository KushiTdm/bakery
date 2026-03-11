'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/lib/products';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlashConfig {
  heureDebut: number;
  heureFin: number;
  remisePercent: number;
  panierMysterePrix: number;
  panierMystereCount: number;
  flashActif: boolean;
}

interface ProductsState {
  products: Product[];
  flashConfig: FlashConfig;
  unsoldIds: string[];
  loading: boolean;
  error: boolean;
  source: 'airtable' | 'fallback' | 'local';
}

// ─── Produits locaux (utilisés avant que l'API réponde) ───────────────────────

import { products as LOCAL_PRODUCTS } from '@/lib/products';

const DEFAULT_FLASH: FlashConfig = {
  heureDebut: 15,
  heureFin: 20,
  remisePercent: 40,
  panierMysterePrix: 6.90,
  panierMystereCount: 4,
  flashActif: false,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProducts() {
  const [state, setState] = useState<ProductsState>({
    products: LOCAL_PRODUCTS, // Affichage immédiat avec données locales
    flashConfig: DEFAULT_FLASH,
    unsoldIds: [],
    loading: true,
    error: false,
    source: 'local',
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/products', {
          // Cache navigateur 5 minutes
          headers: { 'Cache-Control': 'max-age=300' },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        if (!cancelled) {
          setState({
            // Si fallback, on garde les produits locaux avec leurs prix
            products: data.source === 'fallback' ? LOCAL_PRODUCTS : data.products,
            flashConfig: data.flashConfig,
            unsoldIds: data.unsoldIds,
            loading: false,
            error: data.source === 'fallback',
            source: data.source,
          });
        }
      } catch (err) {
        console.error('[useProducts] API unreachable, keeping local data:', err);
        if (!cancelled) {
          setState(prev => ({ ...prev, loading: false, error: true, source: 'local' }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}