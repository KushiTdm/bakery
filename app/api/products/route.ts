// app/api/products/route.ts
// ─────────────────────────────────────────────────────────────
// Récupère le catalogue depuis Airtable.
// Supabase est importé LAZILY (seulement si un token boulanger
// est présent dans le header) pour éviter tout crash au
// démarrage si les variables Supabase ne sont pas configurées.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────

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

// ─── Fallback si Airtable indisponible ────────────────────────

const FALLBACK_PRODUCTS: AirtableProduct[] = [
  {
    id: 'fallback-1', name: 'Baguette Tradition', category: 'boulangerie',
    description: 'Notre baguette artisanale du jour', price: 0,
    image: 'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
    disponible: true, estInvendu: false, stockRestant: 0,
  },
  {
    id: 'fallback-2', name: 'Croissant', category: 'viennoiserie',
    description: 'Viennoiserie pur beurre', price: 0,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
    disponible: true, estInvendu: false, stockRestant: 0,
  },
  {
    id: 'fallback-3', name: 'Pâtisserie du jour', category: 'patisserie',
    description: 'Création de notre pâtissier', price: 0,
    image: 'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=800&q=80',
    disponible: true, estInvendu: false, stockRestant: 0,
  },
];

const FALLBACK_FLASH: AirtableFlashConfig = {
  heureDebut: 15, heureFin: 20, remisePercent: 40,
  panierMysterePrix: 6.90, panierMystereCount: 4, flashActif: false,
};

// ─── Helpers Airtable ─────────────────────────────────────────

function getAirtableImageUrl(record: any): string {
  const attachments = record.fields?.image;
  if (Array.isArray(attachments) && attachments.length > 0) return attachments[0].url;
  const imageUrl = record.fields?.image_url;
  if (imageUrl && typeof imageUrl === 'string') return imageUrl;
  const defaults: Record<string, string> = {
    boulangerie:  'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
    viennoiserie: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
    patisserie:   'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=800&q=80',
  };
  return defaults[record.fields?.categorie] ?? defaults.boulangerie;
}

function parseProduct(record: any): AirtableProduct {
  return {
    id:           record.id,
    name:         record.fields?.nom         ?? 'Produit',
    category:     record.fields?.categorie   ?? 'boulangerie',
    description:  record.fields?.description ?? '',
    price:        record.fields?.prix        ?? 0,
    image:        getAirtableImageUrl(record),
    disponible:   record.fields?.disponible  ?? true,
    estInvendu:   record.fields?.est_invende ?? false,
    stockRestant: record.fields?.stock_restant ?? 0,
  };
}

async function fetchAirtableTable(baseId: string, apiKey: string, table: string) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?filterByFormula={disponible}=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Résolution des credentials Airtable ─────────────────────
// Priorité :
//   1. Token JWT boulanger → clés stockées dans Supabase (multi-tenant)
//   2. Variables d'environnement AIRTABLE_* (mono-tenant / démo)

async function resolveAirtableCredentials(
  req: NextRequest
): Promise<{ baseId: string; apiKey: string } | null> {

  // ── Tentative multi-tenant (lazy import Supabase) ──────────
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && serviceKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await admin.auth.getUser(token);
        if (user) {
          const { data: boulangerie } = await admin
            .from('boulangeries')
            .select('airtable_api_key, airtable_base_id')
            .eq('user_id', user.id)
            .single();
          if (boulangerie?.airtable_api_key && boulangerie?.airtable_base_id) {
            return { baseId: boulangerie.airtable_base_id, apiKey: boulangerie.airtable_api_key };
          }
        }
      } catch (err) {
        console.warn('[API/products] Supabase lookup failed, falling back to env vars:', err);
      }
    }
  }

  // ── Fallback : variables d'environnement ──────────────────
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (baseId && apiKey) return { baseId, apiKey };

  return null;
}

// ─── Handler GET ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const credentials = await resolveAirtableCredentials(req);

    if (!credentials) {
      console.warn('[API/products] Aucun credentials Airtable — vérifiez AIRTABLE_API_KEY et AIRTABLE_BASE_ID dans .env.local');
      return NextResponse.json({
        success: false,
        source: 'fallback',
        products: FALLBACK_PRODUCTS,
        flashConfig: FALLBACK_FLASH,
        unsoldIds: [],
      });
    }

    const { baseId, apiKey } = credentials;

    const [produitsData, flashData] = await Promise.all([
      fetchAirtableTable(baseId, apiKey, 'Produits'),
      fetchAirtableTable(baseId, apiKey, 'Flash_Config').catch(() => null),
    ]);

    const products: AirtableProduct[] = (produitsData.records ?? [])
      .map(parseProduct)
      .filter((p: AirtableProduct) => p.disponible);

    let flashConfig: AirtableFlashConfig = FALLBACK_FLASH;
    if (flashData?.records?.length > 0) {
      const r = flashData.records[0].fields;
      flashConfig = {
        heureDebut:         r.heure_debut          ?? 15,
        heureFin:           r.heure_fin            ?? 20,
        remisePercent:      r.remise_percent        ?? 40,
        panierMysterePrix:  r.panier_mystere_prix   ?? 6.90,
        panierMystereCount: r.panier_mystere_count  ?? 4,
        flashActif:         r.flash_actif           ?? false,
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
    console.error('[API/products] Airtable fetch failed:', error);
    return NextResponse.json({
      success: false,
      source: 'fallback',
      products: FALLBACK_PRODUCTS,
      flashConfig: FALLBACK_FLASH,
      unsoldIds: [],
    });
  }
}