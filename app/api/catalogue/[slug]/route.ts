// app/api/catalogue/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
// Désactive le Data Cache Next.js pour tous les fetch internes (Supabase inclus)
export const fetchCache = 'force-no-store';

interface ProduitPublic {
  id:          string;
  nom:         string;
  description: string | null;
  categorie:   'boulangerie' | 'viennoiserie' | 'patisserie';
  emoji:       string;
  prix_vente:  number;
  image_url:   string | null;
}

interface StockInfo {
  produit_id: string;
  disponible: number;
}

function toProduct(p: ProduitPublic) {
  const imageDefaults: Record<string, string> = {
    boulangerie:  '/products/BaguetteTradition.jpg',
    viennoiserie: '/products/Croissant.png',
    patisserie:   '/products/Tarte_au_citron.png',
  };
  return {
    id:          p.id,
    name:        p.nom,
    description: p.description ?? '',
    category:    p.categorie,
    price:       Number(p.prix_vente),
    image:       p.image_url ?? imageDefaults[p.categorie] ?? imageDefaults.boulangerie,
  };
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]{2}$/;

// Headers qui désactivent TOUS les caches : Next.js, Netlify CDN, navigateur
const NO_CACHE_HEADERS = {
  'Cache-Control':          'no-store, no-cache, must-revalidate',
  'Pragma':                 'no-cache',
  'Netlify-CDN-Cache-Control': 'no-store',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // Opt-out du Data Cache Next.js (intercepte fetch() en interne)
  noStore();

  const slug = params.slug?.trim().toLowerCase();

  if (!slug || !SLUG_REGEX.test(slug)) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
    global: {
      // Force no-store sur chaque fetch que le client Supabase émet
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });

  const admin = getSupabaseAdmin();

  try {
    const [catalogueResult, boulangerieResult] = await Promise.all([
      supabase.rpc('get_catalogue_public', { p_slug: slug }),
      admin
        .from('boulangeries')
        .select('nom, adresse, ville, code_postal, telephone, creneaux_retrait, flash_heure_debut, flash_heure_fin, flash_remise_pct, timezone')
        .eq('slug', slug)
        .eq('actif', true)
        .single(),
    ]);

    if (catalogueResult.error) {
      console.error('[GET /api/catalogue/[slug]]', catalogueResult.error);
      return NextResponse.json({ error: 'Erreur catalogue' }, { status: 500 });
    }

    const rawProducts = (catalogueResult.data as ProduitPublic[] ?? []);
    const products = rawProducts.map(toProduct);

    const d = boulangerieResult.data;
    const boulangeriePublic = d ? {
      nom:              d.nom,
      adresse:          d.adresse ?? null,
      ville:            d.ville ?? null,
      code_postal:      d.code_postal ?? null,
      telephone:        d.telephone ?? null,
      creneaux_retrait: d.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
    } : null;

    // ── Enrichir avec la disponibilité stock du jour ──────────
    const stockMap: Record<string, number> = {};
    let hasStock = false;

    if (d) {
      const tz = (boulangerieResult.data as Record<string, unknown>)?.timezone as string ?? 'Europe/Paris';
      const todayLocal = new Date().toLocaleDateString('sv-SE', { timeZone: tz });

      // Bornes UTC de la journée locale
      const now = new Date();
      const localStr = now.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
      const localAsUtc = new Date(localStr + 'Z');
      const tzOffsetMs = localAsUtc.getTime() - now.getTime();
      const dayStartUtc = new Date(new Date(`${todayLocal}T00:00:00Z`).getTime() - tzOffsetMs).toISOString();
      const dayEndUtc = new Date(new Date(`${todayLocal}T00:00:00Z`).getTime() - tzOffsetMs + 86400000).toISOString();

      // Chercher la boulangerie_id et la journée du jour
      const { data: boul } = await admin
        .from('boulangeries')
        .select('id')
        .eq('slug', slug)
        .single();

      if (boul) {
        const { data: journee } = await admin
          .from('journees')
          .select('id')
          .eq('boulangerie_id', boul.id)
          .eq('date', todayLocal)
          .single();

        if (journee) {
          // Production du jour
          const { data: stocks } = await admin
            .from('stocks_journaliers')
            .select('produit_id, production, report_veille')
            .eq('journee_id', journee.id);

          if (stocks && stocks.length > 0) {
            hasStock = true;
            const prodTotal: Record<string, number> = {};
            for (const s of stocks) {
              prodTotal[s.produit_id] = (s.production ?? 0) + (s.report_veille ?? 0);
            }

            // Réservations par commandes actives + récupérées (par produit_id)
            const { data: activeOrders } = await admin
              .from('commandes')
              .select('lignes')
              .eq('boulangerie_id', boul.id)
              .gte('created_at', dayStartUtc)
              .lt('created_at', dayEndUtc)
              .in('statut', ['en_attente', 'confirmee', 'prete', 'recuperee']);

            const reservedById: Record<string, number> = {};
            if (activeOrders) {
              for (const order of activeOrders) {
                const lignes = (order.lignes ?? []) as Array<{ produit_id?: string; produit_nom: string; quantite: number }>;
                for (const l of lignes) {
                  if (l.produit_id) {
                    reservedById[l.produit_id] = (reservedById[l.produit_id] ?? 0) + l.quantite;
                  }
                }
              }
            }

            // Réservations flash
            const { data: flashPaniers } = await admin
              .from('paniers_flash')
              .select('produit_id, quantite_initiale')
              .eq('boulangerie_id', boul.id)
              .eq('date', todayLocal)
              .eq('actif', true);

            const flashById: Record<string, number> = {};
            if (flashPaniers) {
              for (const fp of flashPaniers) {
                flashById[fp.produit_id] = (flashById[fp.produit_id] ?? 0) + (fp.quantite_initiale ?? 0);
              }
            }

            // Calculer le disponible par produit
            for (const [pid, total] of Object.entries(prodTotal)) {
              const reserved = (reservedById[pid] ?? 0) + (flashById[pid] ?? 0);
              stockMap[pid] = Math.max(0, total - reserved);
            }
          }
        }
      }
    }

    // Ajouter stock aux produits
    const productsWithStock = products.map(p => ({
      ...p,
      ...(hasStock ? { stock: stockMap[p.id] ?? 0, en_stock: (stockMap[p.id] ?? 0) > 0 } : {}),
    }));

    return NextResponse.json(
      { success: true, source: 'supabase', products: productsWithStock, boulangerie: boulangeriePublic, hasStock },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[GET /api/catalogue/[slug]] unexpected:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}