import type { Metadata } from 'next';
import { CartProvider }     from '@/context/cart-context';
import { ActiveTabProvider } from '@/context/active-tab-context';
import LandingClient        from '@/components/landing-client';
import SavoirFaire          from '@/components/savoir-faire';
import Ingredients          from '@/components/ingredients';
import Footer               from '@/components/footer';
import { FaqJsonLd }        from '@/components/seo/json-ld';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://artisandore.fr';

// Charge les infos publiques de la boulangerie (SSR, sans cache)
// no-store : on veut toujours les données fraîches (adresse, téléphone, flash…)
async function getBoulangerieInfo(slug: string) {
  try {
    const res = await fetch(
      `${BASE_URL}/api/boulangerie/${slug}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: "L'Artisan Doré — Boulangerie Artisanale Paris depuis 1952",
  description:
    'Boulangerie artisanale au cœur de Paris depuis 1952. ' +
    'Pains au levain, viennoiseries pur beurre AOP, pâtisseries créatives. ' +
    'Click & collect — commandez en ligne, retirez dès 7h.',
  alternates: { canonical: BASE_URL },
  openGraph: {
    title:       "L'Artisan Doré — Boulangerie Artisanale Paris depuis 1952",
    description: 'Pains au levain naturel, viennoiseries pur beurre AOP. Click & collect disponible.',
    url:         BASE_URL,
  },
};

export default async function Home() {
  const slug = process.env.NEXT_PUBLIC_BAKERY_SLUG ?? 'artisan-dore';
  const boulangerieInfo = await getBoulangerieInfo(slug).catch(() => null);

  return (
    <CartProvider>
      <ActiveTabProvider>
        <FaqJsonLd />
        <LandingClient
          savoirFaire={<SavoirFaire />}
          ingredients={<Ingredients />}
          footer={<Footer boulangerie={boulangerieInfo} />}
        />
      </ActiveTabProvider>
    </CartProvider>
  );
}