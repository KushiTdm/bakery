// app/page.tsx
// Server Component shell — importe les SC directement,
// délègue l'interactivité à LandingClient.

import { CartProvider }    from '@/context/cart-context';
import { ActiveTabProvider } from '@/context/active-tab-context';
import LandingClient       from '@/components/landing-client';

// Server Components — rendus côté serveur, indexés par Google
import SavoirFaire  from '@/components/savoir-faire';
import Ingredients  from '@/components/ingredients';
import Footer       from '@/components/footer';

export default function Home() {
  return (
    <CartProvider>
      <ActiveTabProvider>
        {/*
          LandingClient gère :
          - LoadingScreen
          - FlashBanner
          - Navbar
          - Hero (avec HeroCTA client island)
          - Galerie (animations hover)
          - ClickCollect
          - CartSidebar
          - AuthModal
          - activeTab state
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