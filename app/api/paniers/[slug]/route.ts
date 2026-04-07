// app/api/paniers/[slug]/route.ts
// ─────────────────────────────────────────────────────────────
// Route publique — lit get_paniers_flash() depuis Supabase
// Retourne les paniers actifs du jour avec quantités et allergènes
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

// ── Type de réponse (partagé avec le hook client) ─────────────

export interface PanierFlashResponse {
  flashActif: boolean;
  heureDebut: number;
  heureFin:   number;
  remise:     number;
  nbPaniers:  number;
  invendus: {
    nom:          string;
    emoji:        string;
    categorie:    string;
    prixOriginal: number;
    prixFlash:    number;
    quantite:     number;      // ← nouveau : quantité restante en rayon
    allergenes:   string[];    // ← nouveau : liste des codes allergènes
  }[];
}

const NO_CACHE_HEADERS = {
  'Cache-Control':             'no-store, no-cache, must-revalidate',
  'Pragma':                    'no-cache',
  'Netlify-CDN-Cache-Control': 'no-store',
};

const FALLBACK: PanierFlashResponse = {
  flashActif: false,
  heureDebut: 18,
  heureFin:   20,
  remise:     40,
  nbPaniers:  0,
  invendus:   [],
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  noStore();

  const { slug: rawSlug } = await params;
  const slug = rawSlug?.trim().toLowerCase();
  if (!slug || slug.length > 60) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
    global: {
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });

  try {
    const { data, error } = await supabase.rpc('get_paniers_flash', { p_slug: slug });

    if (error) {
      console.error('[GET /api/paniers/[slug]]', error);
      return NextResponse.json(FALLBACK, { headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json(data as PanierFlashResponse, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.error('[GET /api/paniers/[slug]] unexpected:', err);
    return NextResponse.json(FALLBACK, { headers: NO_CACHE_HEADERS });
  }
}