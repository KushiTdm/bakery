// app/api/catalogue/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
// Désactive le Data Cache Next.js pour tous les fetch internes (Supabase inclus)
export const fetchCache = 'force-no-store';

interface ProduitPublic {
  id:          string;
  nom:         string;
  description: string | null;
  categorie:   'boulangerie' | 'viennoiserie' | 'patisserie';
  emoji:       string;
  prix_vente:  number;
  image_url:   string | null;
}

function toProduct(p: ProduitPublic) {
  const imageDefaults: Record<string, string> = {
    boulangerie:  '/products/BaguetteTradition.jpg',
    viennoiserie: '/products/Croissant.png',
    patisserie:   '/products/Tarte_au_citron.png',
  };
  return {
    id:          p.id,
    name:        p.nom,
    description: p.description ?? '',
    category:    p.categorie,
    price:       Number(p.prix_vente),
    image:       p.image_url ?? imageDefaults[p.categorie] ?? imageDefaults.boulangerie,
  };
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/;

// Headers qui désactivent TOUS les caches : Next.js, Netlify CDN, navigateur
const NO_CACHE_HEADERS = {
  'Cache-Control':          'no-store, no-cache, must-revalidate',
  'Pragma':                 'no-cache',
  'Netlify-CDN-Cache-Control': 'no-store',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // Opt-out du Data Cache Next.js (intercepte fetch() en interne)
  noStore();

  const slug = params.slug?.trim().toLowerCase();

  if (!slug || !SLUG_REGEX.test(slug)) {
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
      // Force no-store sur chaque fetch que le client Supabase émet
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });

  const admin = getSupabaseAdmin();

  try {
    const [catalogueResult, boulangerieResult] = await Promise.all([
      supabase.rpc('get_catalogue_public', { p_slug: slug }),
      admin
        .from('boulangeries')
        .select('nom, adresse, ville, code_postal, telephone, creneaux_retrait, flash_heure_debut, flash_heure_fin, flash_remise_pct')
        .eq('slug', slug)
        .eq('actif', true)
        .single(),
    ]);

    if (catalogueResult.error) {
      console.error('[GET /api/catalogue/[slug]]', catalogueResult.error);
      return NextResponse.json({ error: 'Erreur catalogue' }, { status: 500 });
    }

    const products = (catalogueResult.data as ProduitPublic[] ?? []).map(toProduct);

    const d = boulangerieResult.data;
    const boulangeriePublic = d ? {
      nom:              d.nom,
      adresse:          d.adresse ?? null,
      ville:            d.ville ?? null,
      code_postal:      d.code_postal ?? null,
      telephone:        d.telephone ?? null,
      creneaux_retrait: d.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
    } : null;

    return NextResponse.json(
      { success: true, source: 'supabase', products, boulangerie: boulangeriePublic },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[GET /api/catalogue/[slug]] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}