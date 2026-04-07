import type { Metadata } from 'next';
import { CartProvider }     from '@/context/cart-context';
import { ActiveTabProvider } from '@/context/active-tab-context';
import LandingClient        from '@/components/landing-client';
import SavoirFaire          from '@/components/savoir-faire';
import Footer               from '@/components/footer';
import { FaqJsonLd }        from '@/components/seo/json-ld';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://artisandore.fr';

// ISR : les données vitrine changent rarement (nom, image, horaires)
// → cache 5 min, revalidation en arrière-plan
async function getBoulangerieInfo(slug: string) {
  try {
    const res = await fetch(
      `${BASE_URL}/api/boulangerie/${slug}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title:       'Boulangerie Artisanale — Click & Collect',
  description: 'Boulangerie artisanale. Pains au levain, viennoiseries pur beurre, pâtisseries créatives. Commandez en ligne, retirez en boutique.',
  alternates:  { canonical: BASE_URL },
  openGraph: {
    title:       'Boulangerie Artisanale — Click & Collect',
    description: 'Pains au levain naturel, viennoiseries pur beurre. Click & collect disponible.',
    url:         BASE_URL,
  },
};

export default async function Home() {
  const slug = process.env.NEXT_PUBLIC_BAKERY_SLUG ?? 'artisan-dore';
  const boulangerieInfo = await getBoulangerieInfo(slug).catch(() => null);

  const vitrine = boulangerieInfo?.vitrine ?? null;
  const nom     = boulangerieInfo?.nom ?? null;

  return (
    <CartProvider>
      <ActiveTabProvider>
        <FaqJsonLd />
        <LandingClient
          vitrine={vitrine}
          nom={nom}
          savoirFaire={
            <SavoirFaire
              histoire={vitrine?.histoire}
              nom={nom}
            />
          }
          footer={<Footer boulangerie={boulangerieInfo} />}
        />
      </ActiveTabProvider>
    </CartProvider>
  );
}
