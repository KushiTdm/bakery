import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
    const { data, error } = await supabase
      .from('boulangeries')
      .select('nom, adresse, ville, code_postal, telephone, creneaux_retrait, flash_heure_debut, flash_heure_fin, flash_remise_pct, actif')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      // Ne pas révéler si la boulangerie existe ou non
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    if (!data.actif) {
      return NextResponse.json({ error: 'Boulangerie inactive' }, { status: 404 });
    }

    return NextResponse.json(
      {
        nom:              data.nom,
        adresse:          data.adresse ?? null,
        ville:            data.ville ?? null,
        code_postal:      data.code_postal ?? null,
        telephone:        data.telephone ?? null,
        creneaux_retrait: data.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
        flash: {
          heure_debut: data.flash_heure_debut ?? 18,
          heure_fin:   data.flash_heure_fin ?? 20,
          remise_pct:  data.flash_remise_pct ?? 40,
        },
      },
      {
        headers: {
          // Cache 5 min — les configs changent rarement
          'Cache-Control': 'public, s-maxage=300, max-age=60, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('[GET /api/boulangerie/[slug]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}