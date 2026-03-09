'use client';

import { useState } from 'react';
import { CartProvider } from '@/context/cart-context';
import Navbar from '@/components/navbar';
import Hero from '@/components/hero';
import ProductMenu from '@/components/product-menu';
import SavoirFaire from '@/components/savoir-faire';
import Footer from '@/components/footer';
import CartSidebar from '@/components/cart-sidebar';
import AuthModal from '@/components/auth-modal';
import LoadingScreen from '@/components/Loadingscreen';
import FlashBanner from '@/components/FlashBanner';


export default function Home() {
  const [loading, setLoading] = useState(true);

  return (
    <CartProvider>
      {loading && <LoadingScreen onFinish={() => setLoading(false)} />}
      <main className="min-h-screen">
        <Navbar />
        <FlashBanner />
        <Hero />
        <ProductMenu />
        <SavoirFaire />
        <Footer />
      </main>
      <CartSidebar />
      <AuthModal />
    </CartProvider>
  );
}