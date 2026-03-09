import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
   metadataBase: new URL('https://artisandore.fr'),
  title: "L'Artisan Doré - Boulangerie Artisanale Française",
  description:
    "Découvrez notre boulangerie artisanale au cœur de Paris. Pains au levain, viennoiseries et pâtisseries préparés avec passion selon la tradition française depuis 1952.",
  keywords:
    'boulangerie, artisan, pain au levain, pâtisserie française, croissants, Paris, tradition',
  openGraph: {
    title: "L'Artisan Doré - Boulangerie Artisanale",
    description:
      'Pains au levain et pâtisseries artisanales préparés avec passion',
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
    description:
      'Pains au levain et pâtisseries artisanales préparés avec passion',
    images: [
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80',
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="scroll-smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
