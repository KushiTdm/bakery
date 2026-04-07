// app/api/boulangerie/[slug]/route.ts
// Données vitrine publiques — cachées 5 min (changent rarement)

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/;

// Cache CDN 5 min + stale-while-revalidate 10 min
const CACHE_HEADERS = {
  'Cache-Control':             'public, s-maxage=300, stale-while-revalidate=600',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug?.trim().toLowerCase();

  if (!slug || !SLUG_REGEX.test(slug)) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await admin
      .from('boulangeries')
      .select('nom, adresse, ville, code_postal, telephone, email_contact, creneaux_retrait, flash_heure_debut, flash_heure_fin, flash_remise_pct, actif, vitrine_hero_image_url, vitrine_histoire, vitrine_horaires')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    if (!data.actif) {
      return NextResponse.json({ error: 'Boulangerie inactive' }, { status: 404 });
    }

    const d = data as Record<string, unknown>;
    return NextResponse.json(
      {
        nom:              data.nom,
        adresse:          data.adresse ?? null,
        ville:            data.ville ?? null,
        code_postal:      data.code_postal ?? null,
        telephone:        data.telephone ?? null,
        email_contact:    (d.email_contact as string) ?? null,
        creneaux_retrait: data.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
        flash: {
          heure_debut: data.flash_heure_debut ?? 18,
          heure_fin:   data.flash_heure_fin ?? 20,
          remise_pct:  data.flash_remise_pct ?? 40,
        },
        vitrine: {
          hero_image_url: d.vitrine_hero_image_url ?? null,
          histoire:       d.vitrine_histoire ?? null,
          horaires:       d.vitrine_horaires ?? null,
        },
      },
      { headers: CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[GET /api/boulangerie/[slug]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
