'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DUREE_CONSERVATION_PAR_CATEGORIE } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────

export interface Produit {
  id:                        string;
  boulangerie_id:            string;
  nom:                       string;
  description:               string | null;
  categorie:                 'boulangerie' | 'viennoiserie' | 'patisserie' | 'sandwich';
  emoji:                     string;
  prix_vente:                number;
  cout_production:           number;
  actif_catalogue:           boolean;
  actif_flash:               boolean;
  ordre:                     number;
  prix_flash_override:       number | null;
  allergenes:                string[];
  disponible_du:             string | null;
  disponible_au:             string | null;
  stock_alerte:              number | null;
  note_interne:              string | null;
  image_url:                 string | null;
  image_storage_path:        string | null;
  image_public_url:          string | null;
  /** Durée de conservation en jours (1 = non reportable, 2 = J+1, 3 = J+2) */
  duree_conservation_jours:  number;
  created_at:                string;
  updated_at:                string;
}

export type ProduitDraft = Omit<Produit,
  'id' | 'boulangerie_id' | 'created_at' | 'updated_at' | 'image_public_url'
>;

export const ALLERGENES_LABELS: Record<string, string> = {
  gluten:          'Gluten',
  crustaces:       'Crustacés',
  oeufs:           'Œufs',
  poisson:         'Poisson',
  arachides:       'Arachides',
  soja:            'Soja',
  lait:            'Lait',
  fruits_a_coque:  'Fruits à coque',
  celeri:          'Céleri',
  moutarde:        'Moutarde',
  sesame:          'Sésame',
  sulfites:        'Sulfites',
  lupin:           'Lupin',
  mollusques:      'Mollusques',
};

export const ALLERGENES_LIST = Object.keys(ALLERGENES_LABELS);

export const CATEGORIE_LABELS: Record<Produit['categorie'], string> = {
  boulangerie:  '🥖 Boulangerie',
  viennoiserie: '🥐 Viennoiserie',
  patisserie:   '🎂 Pâtisserie',
  sandwich:     '🥪 Sandwich',
};

// ── Hook principal ────────────────────────────────────────────

interface UseProduitsBoulangerReturn {
  produits:        Produit[];
  loading:         boolean;
  error:           string | null;
  saving:          boolean;
  uploading:       boolean;
  creer:           (draft: ProduitDraft) => Promise<Produit | null>;
  modifier:        (id: string, updates: Partial<ProduitDraft>) => Promise<boolean>;
  supprimer:       (id: string) => Promise<boolean>;
  toggleActif:     (id: string, champ: 'actif_catalogue' | 'actif_flash') => Promise<boolean>;
  reordonner:      (ids: string[]) => Promise<void>;
  uploaderPhoto:   (produitId: string, file: File) => Promise<string | null>;
  refetch:         () => void;
}

export function useProduitsBoulanger(): UseProduitsBoulangerReturn {
  const [produits, setProduits]   = useState<Produit[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tick, setTick]           = useState(0);

  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const authHeaders = async () => {
    const token = await getToken();
    if (!token) return null;
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  // ── Chargement ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) { setError('Non authentifié'); return; }

        const res = await fetch('/api/boulanger/produits?actif=false', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string };
          setError(j.error ?? 'Erreur chargement');
          return;
        }

        const { produits: data } = await res.json() as { produits: Produit[] };
        if (!cancelled) {
          // S'assurer que duree_conservation_jours a toujours une valeur
          const normalized = (data ?? []).map(p => ({
            ...p,
            duree_conservation_jours: p.duree_conservation_jours
              ?? DUREE_CONSERVATION_PAR_CATEGORIE[p.categorie]
              ?? 1,
          }));
          setProduits(normalized);
        }
      } catch {
        if (!cancelled) setError('Erreur réseau');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick]);

  // ── Créer ──────────────────────────────────────────────────
  const creer = useCallback(async (draft: ProduitDraft): Promise<Produit | null> => {
    setSaving(true);
    try {
      const headers = await authHeaders();
      if (!headers) return null;

      // Appliquer la durée par défaut selon catégorie si non renseignée
      const draftWithDefaults: ProduitDraft = {
        ...draft,
        duree_conservation_jours: draft.duree_conservation_jours
          ?? DUREE_CONSERVATION_PAR_CATEGORIE[draft.categorie]
          ?? 1,
      };

      const res = await fetch('/api/boulanger/produits', {
        method: 'POST',
        headers,
        body: JSON.stringify(draftWithDefaults),
      });

      const j = await res.json() as { produit?: Produit; error?: string };
      if (!res.ok) { setError(j.error ?? 'Erreur création'); return null; }

      setProduits(prev => [...prev, j.produit!]);
      return j.produit ?? null;
    } finally {
      setSaving(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modifier ───────────────────────────────────────────────
  const modifier = useCallback(async (
    id: string,
    updates: Partial<ProduitDraft>
  ): Promise<boolean> => {
    setProduits(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setSaving(true);
    try {
      const headers = await authHeaders();
      if (!headers) return false;

      const res = await fetch('/api/boulanger/produits', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id, ...updates }),
      });

      if (!res.ok) {
        setTick(t => t + 1);
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Erreur modification');
        return false;
      }

      const { produit } = await res.json() as { produit: Produit };
      setProduits(prev => prev.map(p => p.id === id ? { ...p, ...produit } : p));
      return true;
    } finally {
      setSaving(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Supprimer ──────────────────────────────────────────────
  const supprimer = useCallback(async (id: string): Promise<boolean> => {
    const backup = produits.find(p => p.id === id);
    setProduits(prev => prev.filter(p => p.id !== id));
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return false;

      const res = await fetch(`/api/boulanger/produits?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (backup) setProduits(prev => [...prev, backup].sort((a, b) => a.ordre - b.ordre));
        return false;
      }
      return true;
    } finally {
      setSaving(false);
    }
  }, [produits]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle actif ───────────────────────────────────────────
  const toggleActif = useCallback(async (
    id: string,
    champ: 'actif_catalogue' | 'actif_flash'
  ): Promise<boolean> => {
    const produit = produits.find(p => p.id === id);
    if (!produit) return false;
    return modifier(id, { [champ]: !produit[champ] });
  }, [produits, modifier]);

  // ── Réordonner ─────────────────────────────────────────────
  const reordonner = useCallback(async (ids: string[]): Promise<void> => {
    setProduits(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      return ids.map((id, i) => ({ ...map.get(id)!, ordre: i }))
                .concat(prev.filter(p => !ids.includes(p.id)));
    });

    const token = await getToken();
    if (!token) return;

    await Promise.all(
      ids.map((id, i) =>
        fetch('/api/boulanger/produits', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id, ordre: i }),
        })
      )
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload photo ───────────────────────────────────────────
  const uploaderPhoto = useCallback(async (
    produitId: string,
    file: File
  ): Promise<string | null> => {
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) return null;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('produit_id', produitId);

      const res = await fetch('/api/boulanger/produits/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Échec upload');
        return null;
      }

      const { image_public_url, image_storage_path } = await res.json() as {
        image_public_url: string;
        image_storage_path: string;
      };

      setProduits(prev => prev.map(p =>
        p.id === produitId
          ? { ...p, image_storage_path, image_public_url, image_url: null }
          : p
      ));

      return image_public_url;
    } finally {
      setUploading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    produits,
    loading,
    error,
    saving,
    uploading,
    creer,
    modifier,
    supprimer,
    toggleActif,
    reordonner,
    uploaderPhoto,
    refetch: () => setTick(t => t + 1),
  };
}