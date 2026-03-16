// app/api/boulangerie/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/;

const NO_CACHE_HEADERS = {
  'Cache-Control':             'no-store, no-cache, must-revalidate',
  'Pragma':                    'no-cache',
  'Netlify-CDN-Cache-Control': 'no-store',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  noStore();

  const slug = params.slug?.trim().toLowerCase();

  if (!slug || !SLUG_REGEX.test(slug)) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await admin
      .from('boulangeries')
      .select('nom, adresse, ville, code_postal, telephone, creneaux_retrait, flash_heure_debut, flash_heure_fin, flash_remise_pct, actif')
      .eq('slug', slug)
      .single();

    if (error || !data) {
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
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[GET /api/boulangerie/[slug]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}