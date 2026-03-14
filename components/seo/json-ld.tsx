// components/seo/json-ld.tsx
// Données structurées JSON-LD pour Google Rich Results
// Docs : https://schema.org/Bakery + https://developers.google.com/search/docs/appearance/structured-data

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://artisandore.fr';

// ── LocalBusiness (Bakery) ────────────────────────────────────
// Permet d'apparaître dans Google Maps, Knowledge Graph et les recherches locales.
// Rich result testé sur : https://search.google.com/test/rich-results

export function LocalBusinessJsonLd() {
  const schema = {
    '@context':    'https://schema.org',
    '@type':       ['Bakery', 'FoodEstablishment', 'LocalBusiness'],
    '@id':         `${BASE_URL}/#organization`,

    name:          "L'Artisan Doré",
    alternateName: 'Artisan Doré',
    description:
      'Boulangerie artisanale parisienne depuis 1952. ' +
      'Pains au levain naturel, viennoiseries pur beurre AOP et pâtisseries créatives. ' +
      'Click & collect disponible.',

    url:       BASE_URL,
    telephone: '+33142869522',
    email:     'contact@artisandore.fr',

    // Adresse
    address: {
      '@type':           'PostalAddress',
      streetAddress:     '42 Rue de la Boulangerie',
      addressLocality:   'Paris',
      postalCode:        '75001',
      addressCountry:    'FR',
      addressRegion:     'Île-de-France',
    },

    // Géolocalisation (approximative — remplacer par les vraies coordonnées)
    geo: {
      '@type':     'GeoCoordinates',
      latitude:    48.8603,
      longitude:   2.3477,
    },

    // Image principale
    image: [
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80',
      'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
      'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
    ],

    logo: {
      '@type': 'ImageObject',
      url:     `${BASE_URL}/icons/icon.svg`,
    },

    // Horaires d'ouverture
    openingHoursSpecification: [
      {
        '@type':     'OpeningHoursSpecification',
        dayOfWeek:   ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens:       '06:30',
        closes:      '20:00',
      },
      {
        '@type':     'OpeningHoursSpecification',
        dayOfWeek:   'Saturday',
        opens:       '07:00',
        closes:      '20:00',
      },
      {
        '@type':     'OpeningHoursSpecification',
        dayOfWeek:   'Sunday',
        opens:       '07:00',
        closes:      '13:00',
      },
    ],

    // Modes de paiement acceptés
    paymentAccepted: 'Cash, Credit Card',
    currenciesAccepted: 'EUR',

    // Prix approximatif (1 = < 10€, 2 = 10-30€, 3 = 30-100€, 4 = > 100€)
    priceRange: '€',

    // Services proposés
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name:    'Catalogue L\'Artisan Doré',
      itemListElement: [
        {
          '@type': 'OfferCatalog',
          name:    'Boulangerie',
          description: 'Baguettes tradition, pains au levain, pains aux céréales',
        },
        {
          '@type': 'OfferCatalog',
          name:    'Viennoiserie',
          description: 'Croissants pur beurre AOP, pains au chocolat, brioches',
        },
        {
          '@type': 'OfferCatalog',
          name:    'Pâtisserie',
          description: 'Tartes, éclairs, millefeuilles, Paris-Brest',
        },
      ],
    },

    // Click & Collect
    hasMap: `https://maps.google.com/?q=42+Rue+de+la+Boulangerie+Paris`,
    amenityFeature: [
      {
        '@type':      'LocationFeatureSpecification',
        name:         'Click & Collect',
        value:        true,
      },
    ],

    // Fondée en
    foundingDate: '1952',

    // Réseaux sociaux
    sameAs: [
      'https://www.instagram.com/artisandore',
      'https://www.facebook.com/artisandore',
    ],

    // Zone de service
    areaServed: {
      '@type':      'City',
      name:         'Paris',
      addressCountry: 'FR',
    },

    // Caractéristiques cuisines
    servesCuisine: ['French', 'Bakery', 'Pastry'],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── BreadcrumbList ────────────────────────────────────────────
// Affiche le fil d'Ariane dans les résultats Google.

export function BreadcrumbJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    itemListElement: [
      {
        '@type':  'ListItem',
        position: 1,
        name:     'Accueil',
        item:     BASE_URL,
      },
      {
        '@type':  'ListItem',
        position: 2,
        name:     'Notre Savoir-Faire',
        item:     `${BASE_URL}/#notre-histoire`,
      },
      {
        '@type':  'ListItem',
        position: 3,
        name:     'Click & Collect',
        item:     `${BASE_URL}/?tab=commander`,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── FAQPage ───────────────────────────────────────────────────
// Affiché dans les résultats de recherche avec les questions dépliables.
// À importer dans la landing si une section FAQ est ajoutée.

export function FaqJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name:    'Comment fonctionne le Click & Collect ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:    'Commandez en ligne sur notre site, payez sur place lors du retrait. Votre commande est disponible le lendemain matin à partir de 7h, jusqu\'à 10h.',
        },
      },
      {
        '@type': 'Question',
        name:    'Quels sont vos horaires d\'ouverture ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:    'Du lundi au vendredi de 6h30 à 20h, le samedi de 7h à 20h, le dimanche de 7h à 13h.',
        },
      },
      {
        '@type': 'Question',
        name:    'Proposez-vous des produits sans gluten ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:    'Nos pains sont fabriqués artisanalement avec des farines de blé. Nous ne proposons pas de produits certifiés sans gluten. Consultez-nous pour les allergènes.',
        },
      },
      {
        '@type': 'Question',
        name:    'Qu\'est-ce que le Flash Invendus ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:    'Chaque soir à partir de 18h, nos invendus du jour sont proposés avec une remise de 40% via notre site. Premier arrivé, premier servi, jusqu\'à épuisement ou 20h.',
        },
      },
      {
        '@type': 'Question',
        name:    'Où se situe la boulangerie ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:    '42 Rue de la Boulangerie, 75001 Paris. Métro : Châtelet-Les Halles.',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── Product (pour le Click & Collect) ────────────────────────
// À utiliser sur la page commander pour les produits phares.

interface ProductSchemaProps {
  name:        string;
  description: string;
  price:       number;
  image:       string;
  category:    string;
}

export function ProductJsonLd({ name, description, price, image, category }: ProductSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type':    'Product',
    name,
    description,
    image,
    category,
    offers: {
      '@type':         'Offer',
      price:           price.toFixed(2),
      priceCurrency:   'EUR',
      availability:    'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name:    "L'Artisan Doré",
      },
    },
    brand: {
      '@type': 'Brand',
      name:    "L'Artisan Doré",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}