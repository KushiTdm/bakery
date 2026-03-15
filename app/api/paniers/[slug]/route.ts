// app/api/paniers/[slug]/route.ts
// ─────────────────────────────────────────────────────────────
// GET /api/paniers/:slug
//
// Retourne les paniers anti-gaspi du soir pour une boulangerie.
// Appelle get_paniers_flash() — fonction SQL SECURITY DEFINER.
//
// SÉCURITÉ :
//   - Anon key uniquement — la fonction SQL contrôle l'accès
//   - Ne retourne jamais stock_final ni données de production
//   - Retourne uniquement : nb paniers + prix + liste produits (sans qtés)
//   - Si flash inactif (hors horaire) : retourne flashActif=false, liste vide
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export interface PanierFlashResponse {
  flashActif:  boolean;
  heureDebut:  number;
  heureFin:    number;
  remise:      number;
  nbPaniers:   number;
  invendus: {
    nom:          string;
    emoji:        string;
    categorie:    string;
    prixOriginal: number;
    prixFlash:    number;
  }[];
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

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
  });

  try {
    const { data, error } = await supabase.rpc('get_paniers_flash', {
      p_slug: slug,
    });

    if (error) {
      console.error('[GET /api/paniers/[slug]]', error);
      // Fail gracefully — la banner reste en mode teaser
      return NextResponse.json({
        flashActif: false,
        heureDebut: 18,
        heureFin:   20,
        remise:     40,
        nbPaniers:  0,
        invendus:   [],
      } satisfies PanierFlashResponse);
    }

    const result = data as PanierFlashResponse;

    return NextResponse.json(result, {
      headers: {
        // Pas de cache sur les paniers — données en temps réel
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[GET /api/paniers/[slug]] unexpected:', err);
    return NextResponse.json({
      flashActif: false,
      heureDebut: 18,
      heureFin:   20,
      remise:     40,
      nbPaniers:  0,
      invendus:   [],
    } satisfies PanierFlashResponse);
  }
}