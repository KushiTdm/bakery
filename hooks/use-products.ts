'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/lib/products';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlashConfig {
  // Champs API Airtable / backend
  heureDebut:         number;
  heureFin:           number;
  remisePercent:      number;
  panierMysterePrix:  number;
  panierMystereCount: number;
  flashActif:         boolean;
  // Alias pour FlashBanner (rétro-compatibilité)
  startHour?:   number;
  endHour?:     number;
  warningHour?: number;
}

interface ProductsState {
  products:    Product[];
  flashConfig: FlashConfig;
  unsoldIds:   string[];
  loading:     boolean;
  error:       boolean;
  source:      'airtable' | 'fallback' | 'local';
}

import { products as LOCAL_PRODUCTS } from '@/lib/products';

const DEFAULT_FLASH: FlashConfig = {
  heureDebut:         15,
  heureFin:           20,
  remisePercent:      40,
  panierMysterePrix:  6.90,
  panierMystereCount: 4,
  flashActif:         false,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProducts() {
  const [state, setState] = useState<ProductsState>({
    products:    LOCAL_PRODUCTS,
    flashConfig: DEFAULT_FLASH,
    unsoldIds:   [],
    loading:     true,
    error:       false,
    source:      'local',
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/products', {
          headers: { 'Cache-Control': 'max-age=300' },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json() as {
          source:      'airtable' | 'fallback';
          products:    Product[];
          flashConfig: FlashConfig;
          unsoldIds:   string[];
        };

        if (!cancelled) {
          setState({
            products:    data.source === 'fallback' ? LOCAL_PRODUCTS : data.products,
            flashConfig: data.flashConfig,
            unsoldIds:   data.unsoldIds,
            loading:     false,
            error:       data.source === 'fallback',
            source:      data.source,
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