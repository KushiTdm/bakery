'use client';

import Navbar from '@/components/navbar';
import Hero from '@/components/hero';
import ProductMenu from '@/components/product-menu';
import SavoirFaire from '@/components/savoir-faire';
import Footer from '@/components/footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <ProductMenu />
      <SavoirFaire />
      <Footer />
    </main>
  );
}
