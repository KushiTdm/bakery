'use client';

import { useState } from 'react';
import { CartProvider } from '@/context/cart-context';
import Navbar from '@/components/navbar';
import Hero from '@/components/hero';
import SavoirFaire from '@/components/savoir-faire';
import Ingredients from '@/components/ingredients';
import Galerie from '@/components/galerie';
import ClickCollect from '@/components/click-collect';
import Footer from '@/components/footer';
import CartSidebar from '@/components/cart-sidebar';
import AuthModal from '@/components/auth-modal';
import LoadingScreen from '@/components/Loadingscreen';
import FlashBanner from '@/components/FlashBanner';

export type ActiveTab = 'vitrine' | 'commander';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('vitrine');

  return (
    <CartProvider>
      {loading && <LoadingScreen onFinish={() => setLoading(false)} />}
      <FlashBanner activeTab={activeTab} setActiveTab={setActiveTab} />
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="min-h-screen">
        {activeTab === 'vitrine' ? (
          <>
            <Hero setActiveTab={setActiveTab} />
            <SavoirFaire />
            <Ingredients />
            <Galerie />
            <Footer />
          </>
        ) : (
          <ClickCollect />
        )}
      </main>
      <CartSidebar />
      <AuthModal />
    </CartProvider>
  );
}