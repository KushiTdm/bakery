// app/page.tsx
// Server Component shell avec metadata SEO par page
// et injection des Server Components déjà optimisés pour le crawl.

import type { Metadata } from 'next';
import { CartProvider }     from '@/context/cart-context';
import { ActiveTabProvider } from '@/context/active-tab-context';
import LandingClient        from '@/components/landing-client';
import SavoirFaire          from '@/components/savoir-faire';
import Ingredients          from '@/components/ingredients';
import Footer               from '@/components/footer';
import { FaqJsonLd }        from '@/components/seo/json-ld';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://artisandore.fr';

// ── Metadata spécifique à la page d'accueil ────────────────────
// Surcharge les valeurs par défaut de layout.tsx
export const metadata: Metadata = {
  title: "L'Artisan Doré — Boulangerie Artisanale Paris depuis 1952",
  description:
    'Boulangerie artisanale au cœur de Paris depuis 1952. ' +
    'Pains au levain, viennoiseries pur beurre AOP, pâtisseries créatives. ' +
    'Click & collect — commandez en ligne, retirez dès 7h.',
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    title:       "L'Artisan Doré — Boulangerie Artisanale Paris depuis 1952",
    description: 'Pains au levain naturel, viennoiseries pur beurre AOP. Click & collect disponible.',
    url:         BASE_URL,
  },
};

export default function Home() {
  return (
    <CartProvider>
      <ActiveTabProvider>
        {/* FAQ Schema — enrichit les résultats Google */}
        <FaqJsonLd />

        {/*
          LandingClient gère (client islands) :
          - LoadingScreen, FlashBanner, Navbar
          - Hero (animations + CTA interactif)
          - Galerie (hover animations)
          - ClickCollect, CartSidebar, AuthModal

          Server Components injectés en props :
          - SavoirFaire, Ingredients, Footer
          → Rendus côté serveur, indexés par Google sans JS
        */}
        <LandingClient
          savoirFaire={<SavoirFaire />}
          ingredients={<Ingredients />}
          footer={<Footer />}
        />
      </ActiveTabProvider>
    </CartProvider>
  );
}