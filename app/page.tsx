import type { Metadata } from 'next';
import { headers }          from 'next/headers';
import { CartProvider }     from '@/context/cart-context';
import { ActiveTabProvider } from '@/context/active-tab-context';
import LandingClient        from '@/components/landing-client';
import SavoirFaire          from '@/components/savoir-faire';
import Footer               from '@/components/footer';
import { FaqJsonLd }        from '@/components/seo/json-ld';
import { resolveSlugServer } from '@/lib/resolve-slug';
import { getSupabaseAdmin }  from '@/lib/supabase';

// Requête directe Supabase — évite le self-fetch HTTP
// qui tapait sur le mauvais projet Vercel en production
async function getBoulangerieInfo(slug: string) {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('boulangeries')
      .select('nom, adresse, ville, code_postal, telephone, email_contact, creneaux_retrait, flash_heure_debut, flash_heure_fin, flash_remise_pct, actif, vitrine_hero_image_url, vitrine_histoire, vitrine_horaires')
      .eq('slug', slug)
      .single();

    if (error || !data || !data.actif) return null;

    return {
      nom:              data.nom,
      adresse:          data.adresse ?? null,
      ville:            data.ville ?? null,
      code_postal:      data.code_postal ?? null,
      telephone:        data.telephone ?? null,
      email_contact:    data.email_contact ?? null,
      creneaux_retrait: data.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
      flash: {
        heure_debut: data.flash_heure_debut ?? 18,
        heure_fin:   data.flash_heure_fin ?? 20,
        remise_pct:  data.flash_remise_pct ?? 40,
      },
      vitrine: {
        hero_image_url: data.vitrine_hero_image_url ?? null,
        histoire:       data.vitrine_histoire ?? null,
        horaires:       data.vitrine_horaires ?? null,
      },
    };
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title:       'Boulangerie Artisanale — Click & Collect',
  description: 'Boulangerie artisanale. Pains au levain, viennoiseries pur beurre, pâtisseries créatives. Commandez en ligne, retirez en boutique.',
  openGraph: {
    title:       'Boulangerie Artisanale — Click & Collect',
    description: 'Pains au levain naturel, viennoiseries pur beurre. Click & collect disponible.',
  },
};

export default async function Home() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const resolution = resolveSlugServer(host);
  const slug = resolution?.slug ?? 'artisan-dore';
  const boulangerieInfo = await getBoulangerieInfo(slug);

  const vitrine = boulangerieInfo?.vitrine ?? null;
  const nom     = boulangerieInfo?.nom ?? null;

  return (
    <CartProvider>
      <ActiveTabProvider>
        <FaqJsonLd />
        <LandingClient
          vitrine={vitrine}
          nom={nom}
          adresse={boulangerieInfo?.adresse ?? null}
          ville={boulangerieInfo?.ville ?? null}
          code_postal={boulangerieInfo?.code_postal ?? null}
          telephone={boulangerieInfo?.telephone ?? null}
          savoirFaire={
            <SavoirFaire
              histoire={vitrine?.histoire}
              nom={nom}
            />
          }
          footer={<Footer boulangerie={boulangerieInfo ?? undefined} />}
        />
      </ActiveTabProvider>
    </CartProvider>
  );
}
