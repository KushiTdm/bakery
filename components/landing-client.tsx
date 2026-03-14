'use client';

import { useState, type ReactNode } from 'react';
import { useActiveTab }    from '@/context/active-tab-context';
import Navbar              from '@/components/navbar';
import Hero                from '@/components/hero';
import Galerie             from '@/components/galerie';
import ClickCollect        from '@/components/click-collect';
import CartSidebar         from '@/components/cart-sidebar';
import AuthModal           from '@/components/auth-modal';
import LoadingScreen       from '@/components/Loadingscreen';
import FlashBanner         from '@/components/FlashBanner';

interface LandingClientProps {
  savoirFaire: ReactNode;
  ingredients: ReactNode;
  footer:      ReactNode;
}

export default function LandingClient({
  savoirFaire,
  ingredients,
  footer,
}: LandingClientProps) {
  const { activeTab, setActiveTab } = useActiveTab();
  const [loading, setLoading]       = useState(true);

  return (
    <>
      {loading && <LoadingScreen onFinish={() => setLoading(false)} />}
      <FlashBanner activeTab={activeTab} setActiveTab={setActiveTab} />
      <Navbar      activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="min-h-screen">
        {activeTab === 'vitrine' ? (
          <>
            {/* Hero reste client (animations framer-motion + CTA interactif) */}
            <Hero />
            {/* Server Components injectés — déjà rendus par le serveur */}
            {savoirFaire}
            {ingredients}
            <Galerie />
            {footer}
          </>
        ) : (
          <ClickCollect />
        )}
      </main>

      <CartSidebar />
      <AuthModal />
    </>
  );
}