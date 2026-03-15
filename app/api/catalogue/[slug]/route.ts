// app/api/catalogue/[slug]/route.ts
// ─────────────────────────────────────────────────────────────
// GET /api/catalogue/:slug
//
// Route PUBLIQUE (anon key uniquement) qui remplace /api/products.
// Appelle la fonction SQL get_catalogue_public() via Supabase RPC.
//
// SÉCURITÉ :
//   - Utilise le client anon (pas service_role) — ce qui est suffisant
//     car la fonction SQL SECURITY DEFINER gère elle-même les contrôles
//   - Ne retourne jamais les stocks, invendus, ou données internes
//   - Isolation par slug : impossible d'accéder aux données d'une autre
//     boulangerie même avec un UUID deviné
//   - Cache 5 minutes côté CDN (Netlify Edge)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveSlugServer } from '@/lib/resolve-slug';

export const dynamic = 'force-dynamic';

// Produit tel que retourné par get_catalogue_public()
interface ProduitPublic {
  id:          string;
  nom:         string;
  description: string | null;
  categorie:   'boulangerie' | 'viennoiserie' | 'patisserie';
  emoji:       string;
  prix_vente:  number;
  image_url:   string | null;
}

// Format compatible avec l'existant (lib/products.ts Product type)
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

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug?.trim().toLowerCase();

  if (!slug || slug.length > 60) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 503 });
  }

  // Client anon — volontairement pas service_role ici
  // La fonction SQL SECURITY DEFINER gère la sécurité
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
  });

  try {
    const { data, error } = await supabase.rpc('get_catalogue_public', {
      p_slug: slug,
    });

    if (error) {
      console.error('[GET /api/catalogue/[slug]]', error);
      return NextResponse.json({ error: 'Erreur catalogue' }, { status: 500 });
    }

    const products = (data as ProduitPublic[] ?? []).map(toProduct);

    return NextResponse.json(
      { success: true, source: 'supabase', products },
      {
        headers: {
          // Cache 5 min CDN, 1 min navigateur
          'Cache-Control': 'public, s-maxage=300, max-age=60, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('[GET /api/catalogue/[slug]] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}