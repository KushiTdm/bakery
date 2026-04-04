// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import SwRegister from '@/components/sw-register';
import { BreadcrumbJsonLd, LocalBusinessJsonLd } from '@/components/seo/json-ld';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://artisandore.fr';
const OG_IMAGE = 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default:  "L'Artisan Doré — Boulangerie Artisanale Paris 1er",
    template: "%s | L'Artisan Doré",
  },

  description:
    'Boulangerie artisanale au cœur de Paris depuis 1952. ' +
    'Pains au levain naturel, viennoiseries pur beurre et pâtisseries créatives. ' +
    'Click & collect disponible — retrait dès 7h, paiement sur place.',

  keywords: [
    'boulangerie artisanale Paris',
    'boulangerie Paris 1er',
    'pain au levain Paris',
    'viennoiserie artisanale',
    'pâtisserie française',
    'baguette tradition Paris',
    'click and collect boulangerie',
    'boulangerie depuis 1952',
    'pain artisan Paris',
    'croissant pur beurre Paris',
  ],

  alternates: {
    canonical: BASE_URL,
    languages: { 'fr-FR': BASE_URL },
  },

  robots: {
    index:  true,
    follow: true,
    googleBot: {
      index:               true,
      follow:              true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet':       -1,
    },
  },

  openGraph: {
    type:        'website',
    locale:      'fr_FR',
    url:         BASE_URL,
    siteName:    "L'Artisan Doré",
    title:       "L'Artisan Doré — Boulangerie Artisanale Paris depuis 1952",
    description:
      'Pains au levain, viennoiseries pur beurre, pâtisseries créatives. ' +
      'Commandez en ligne, retirez le lendemain dès 7h.',
    images: [
      {
        url:    OG_IMAGE,
        width:  1200,
        height: 630,
        alt:    "L'Artisan Doré — Boulangerie artisanale à Paris",
        type:   'image/jpeg',
      },
    ],
  },

  twitter: {
    card:        'summary_large_image',
    title:       "L'Artisan Doré — Boulangerie Artisanale Paris",
    description: 'Pains au levain, viennoiseries pur beurre et pâtisseries créatives depuis 1952.',
    images:      [OG_IMAGE],
  },

  manifest: '/manifest.json',
  applicationName: 'Sauve Mie',

  appleWebApp: {
    capable:        true,
    title:          "L'Artisan Doré",
    statusBarStyle: 'black-translucent',
  },

  authors:   [{ name: "L'Artisan Doré", url: BASE_URL }],
  creator:   "L'Artisan Doré",
  publisher: "L'Artisan Doré",
  category:  'food',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="scroll-smooth">
      <head>
        {/* themeColor — meta tag direct, Next.js 13 compatible */}
        <meta name="theme-color" content="#C19A6B" />
        <meta name="color-scheme" content="light" />

        {/* Viewport explicite */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />

        {/* PWA — Apple */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="L'Artisan Doré" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />

        {/* PWA — Android */}
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Préconnexion aux domaines tiers critiques */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.unsplash.com" />

        {/* DNS prefetch */}
        <link rel="dns-prefetch" href="https://api.airtable.com" />

        {/* Favicon */}
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/icons/icon-96x96.png" />
      </head>
      <body className="antialiased">
        <LocalBusinessJsonLd />
        <BreadcrumbJsonLd />
        {children}
        <SwRegister />
      </body>
    </html>
  );
}