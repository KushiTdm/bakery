import { NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AirtableProduct {
  id: string;
  name: string;
  category: 'boulangerie' | 'viennoiserie' | 'patisserie';
  description: string;
  price: number;
  image: string;
  disponible: boolean;
  estInvendu: boolean;
  stockRestant: number;
}

export interface AirtableFlashConfig {
  heureDebut: number;
  heureFin: number;
  remisePercent: number;
  panierMysterePrix: number;
  panierMystereCount: number;
  flashActif: boolean;
}

// ─── Fallback data (affiché si Airtable est indisponible) ─────────────────────

const FALLBACK_PRODUCTS: AirtableProduct[] = [
  {
    id: 'fallback-1',
    name: 'Baguette Tradition',
    category: 'boulangerie',
    description: 'Notre baguette artisanale du jour',
    price: 0, // Pas de prix en fallback
    image: 'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
    disponible: true,
    estInvendu: false,
    stockRestant: 0,
  },
  {
    id: 'fallback-2',
    name: 'Croissant',
    category: 'viennoiserie',
    description: 'Viennoiserie pur beurre',
    price: 0,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
    disponible: true,
    estInvendu: false,
    stockRestant: 0,
  },
  {
    id: 'fallback-3',
    name: 'Pâtisserie du jour',
    category: 'patisserie',
    description: 'Création de notre pâtissier',
    price: 0,
    image: 'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=800&q=80',
    disponible: true,
    estInvendu: false,
    stockRestant: 0,
  },
];

const FALLBACK_FLASH: AirtableFlashConfig = {
  heureDebut: 15,
  heureFin: 20,
  remisePercent: 40,
  panierMysterePrix: 6.90,
  panierMystereCount: 4,
  flashActif: false,
};

// ─── Helpers Airtable ─────────────────────────────────────────────────────────

function getAirtableImageUrl(record: any): string {
  // Priorité 1 : champ Attachment (photo uploadée dans Airtable)
  const attachments = record.fields?.image;
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    return attachments[0].url;
  }
  // Priorité 2 : champ URL texte
  const imageUrl = record.fields?.image_url;
  if (imageUrl && typeof imageUrl === 'string') {
    return imageUrl;
  }
  // Fallback par catégorie
  const category = record.fields?.categorie;
  const defaults: Record<string, string> = {
    boulangerie: 'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
    viennoiserie: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
    patisserie: 'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=800&q=80',
  };
  return defaults[category] ?? defaults.boulangerie;
}

function parseProduct(record: any): AirtableProduct {
  return {
    id: record.id,
    name: record.fields?.nom ?? 'Produit',
    category: record.fields?.categorie ?? 'boulangerie',
    description: record.fields?.description ?? '',
    price: record.fields?.prix ?? 0,
    image: getAirtableImageUrl(record),
    disponible: record.fields?.disponible ?? true,
    estInvendu: record.fields?.est_invende ?? false,
    stockRestant: record.fields?.stock_restant ?? 0,
  };
}

async function fetchAirtable(table: string) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY; // Clé secrète — jamais exposée au client

  if (!baseId || !apiKey) {
    throw new Error('Airtable env vars missing');
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?filterByFormula={disponible}=1`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // Cache 5 minutes côté serveur Next.js
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Airtable error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── Handler GET ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // Fetch produits et config flash en parallèle
    const [produitsData, flashData] = await Promise.all([
      fetchAirtable('Produits'),
      fetchAirtable('Flash_Config').catch(() => null), // Flash optionnel
    ]);

    const products: AirtableProduct[] = (produitsData.records ?? [])
      .map(parseProduct)
      .filter((p: AirtableProduct) => p.disponible);

    // Config flash (prend le premier enregistrement actif)
    let flashConfig: AirtableFlashConfig = FALLBACK_FLASH;
    if (flashData?.records?.length > 0) {
      const r = flashData.records[0].fields;
      flashConfig = {
        heureDebut: r.heure_debut ?? 15,
        heureFin: r.heure_fin ?? 20,
        remisePercent: r.remise_percent ?? 40,
        panierMysterePrix: r.panier_mystere_prix ?? 6.90,
        panierMystereCount: r.panier_mystere_count ?? 4,
        flashActif: r.flash_actif ?? false,
      };
    }

    return NextResponse.json({
      success: true,
      source: 'airtable',
      products,
      flashConfig,
      unsoldIds: products.filter(p => p.estInvendu).map(p => p.id),
    });

  } catch (error) {
    console.error('[API/products] Airtable fetch failed, using fallback:', error);

    // Fallback propre — l'app continue de fonctionner sans prix
    return NextResponse.json({
      success: false,
      source: 'fallback',
      products: FALLBACK_PRODUCTS,
      flashConfig: FALLBACK_FLASH,
      unsoldIds: [],
    });
  }
}