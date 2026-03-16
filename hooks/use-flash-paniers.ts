'use client';

import { useState, useEffect } from 'react';
import { useSlug } from '@/hooks/use-slug';
import type { PanierFlashResponse } from '@/app/api/paniers/[slug]/route';

export type { PanierFlashResponse };

export const DEFAULT_FLASH: PanierFlashResponse = {
  flashActif: false,
  heureDebut: 18,   // valeur par défaut tant que l'API n'a pas répondu
  heureFin:   20,
  remise:     40,
  nbPaniers:  0,
  invendus:   [],
};

interface UseFlashPaniersReturn {
  data:    PanierFlashResponse;
  loading: boolean;
  refetch: () => void;
}

export function useFlashPaniers(): UseFlashPaniersReturn {
  const resolution            = useSlug();
  const [data, setData]       = useState<PanierFlashResponse>(DEFAULT_FLASH);
  const [loading, setLoading] = useState(true);
  const [tick, setTick]       = useState(0);

  useEffect(() => {
    // Attend le montage côté client + résolution du slug
    if (!resolution?.slug) return;

    const slug = resolution.slug;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/paniers/${slug}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as PanierFlashResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        console.warn('[useFlashPaniers]', err);
        if (!cancelled) setData(DEFAULT_FLASH);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Rafraîchissement toutes les 2 minutes
    const interval = setInterval(load, 2 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [resolution?.slug, tick]);

  return {
    data,
    loading: loading || !resolution,
    refetch: () => setTick(t => t + 1),
  };
}