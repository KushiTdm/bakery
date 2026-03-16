// app/api/catalogue/[slug]/route.ts
// 🆕 Expose aussi les infos publiques de la boulangerie (adresse, créneaux)
//    pour le CartSidebar et la vitrine cliente

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
    boulangerie:  'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
    viennoiserie: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
    patisserie:   'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=800&q=80',
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

// Regex slug valide
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
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
  });

  try {
    // Récupère le catalogue + les infos publiques de la boulangerie en parallèle
    const [catalogueResult, boulangerieResult] = await Promise.all([
      supabase.rpc('get_catalogue_public', { p_slug: slug }),
      supabase
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

    // Infos boulangerie — null si erreur (ne bloque pas le catalogue)
    const boulangerieData = boulangerieResult.data;
    const boulangeriePublic = boulangerieData ? {
      nom:              boulangerieData.nom,
      adresse:          boulangerieData.adresse ?? null,
      ville:            boulangerieData.ville ?? null,
      code_postal:      boulangerieData.code_postal ?? null,
      telephone:        boulangerieData.telephone ?? null,
      creneaux_retrait: boulangerieData.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
    } : null;

    return NextResponse.json(
      { success: true, source: 'supabase', products, boulangerie: boulangeriePublic },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, max-age=60, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('[GET /api/catalogue/[slug]] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}