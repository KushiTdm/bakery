import './globals.css';
import type { Metadata } from 'next';
import SwRegister from '@/components/sw-register';

export const metadata: Metadata = {
  metadataBase: new URL('https://artisandore.fr'),
  title: "L'Artisan Doré - Boulangerie Artisanale Française",
  description:
    "Découvrez notre boulangerie artisanale au cœur de Paris. Pains au levain, viennoiseries et pâtisseries préparés avec passion selon la tradition française depuis 1952.",
  keywords:
    'boulangerie, artisan, pain au levain, pâtisserie française, croissants, Paris, tradition',
  manifest: '/manifest.json',
  openGraph: {
    title: "L'Artisan Doré - Boulangerie Artisanale",
    description: 'Pains au levain et pâtisseries artisanales préparés avec passion',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Boulangerie artisanale',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "L'Artisan Doré - Boulangerie Artisanale",
    description: 'Pains au levain et pâtisseries artisanales préparés avec passion',
    images: [
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80',
    ],
  },
  // Faux avis supprimés — risque légal DGCCRF
  // À réintégrer uniquement avec de vraies données Google Business Profile
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="scroll-smooth">
      <head>
        <meta name="application-name" content="BakeryOS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BakeryOS" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#C19A6B" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
      </head>
      <body className="antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}