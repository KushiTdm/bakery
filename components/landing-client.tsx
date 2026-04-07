'use client';

import { useState, type ReactNode } from 'react';
import { useActiveTab }    from '@/context/active-tab-context';
import Navbar              from '@/components/navbar';
import Hero                from '@/components/hero';
import ClickCollect        from '@/components/click-collect';
import CartSidebar         from '@/components/cart-sidebar';
import AuthModal           from '@/components/auth-modal';
import LoadingScreen       from '@/components/Loadingscreen';
import FlashBanner         from '@/components/FlashBanner';

interface LandingClientProps {
  savoirFaire: ReactNode;
  footer:      ReactNode;
  vitrine?: {
    hero_image_url?: string | null;
  } | null;
  nom?: string | null;
}

export default function LandingClient({
  savoirFaire,
  footer,
  vitrine,
  nom,
}: LandingClientProps) {
  const { activeTab, setActiveTab } = useActiveTab();
  const [loading, setLoading]       = useState(true);

  return (
    <>
      {loading && <LoadingScreen onFinish={() => setLoading(false)} nom={nom} />}
      <FlashBanner activeTab={activeTab} setActiveTab={setActiveTab} />

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} nom={nom} />

      <main className="min-h-screen">
        {activeTab === 'vitrine' ? (
          <>
            <Hero
              heroImage={vitrine?.hero_image_url}
              nom={nom}
            />
            {savoirFaire}
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
