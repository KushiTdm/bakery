// app/api/boulanger/produits/route.ts
// ─────────────────────────────────────────────────────────────
// CRUD produits pour l'espace boulanger.
// Toutes les opérations sont auth-protégées (JWT Bearer).
//
// GET    /api/boulanger/produits          → liste tous les produits
// POST   /api/boulanger/produits          → créer un produit
// PATCH  /api/boulanger/produits          → modifier (body: { id, ...fields })
// DELETE /api/boulanger/produits?id=xxx   → supprimer + photo Storage
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// ── Auth helper ───────────────────────────────────────────────

async function getOwnerBoulangerieId(req: NextRequest): Promise<{
  boulangerieId: string;
  admin: ReturnType<typeof getSupabaseAdmin>;
} | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const admin = getSupabaseAdmin();
  const token = authHeader.slice(7);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  const { data: b } = await admin
    .from('boulangeries')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!b) return null;
  return { boulangerieId: b.id, admin };
}

// ── Validation ────────────────────────────────────────────────

const ALLERGENES_VALIDES = [
  'gluten', 'crustaces', 'oeufs', 'poisson', 'arachides',
  'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde',
  'sesame', 'sulfites', 'lupin', 'mollusques',
] as const;

const ProduitSchema = z.object({
  nom:                  z.string().min(1).max(100),
  description:          z.string().max(500).optional().nullable(),
  categorie:            z.enum(['boulangerie', 'viennoiserie', 'patisserie']),
  emoji:                z.string().max(4).optional().default('🥖'),
  prix_vente:           z.number().positive(),
  cout_production:      z.number().min(0).optional().default(0),
  actif_catalogue:      z.boolean().optional().default(true),
  actif_flash:          z.boolean().optional().default(true),
  ordre:                z.number().int().min(0).optional().default(0),
  prix_flash_override:  z.number().positive().optional().nullable(),
  allergenes:           z.array(z.string()).optional().default([]),
  disponible_du:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  disponible_au:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  stock_alerte:         z.number().int().min(0).optional().nullable(),
  note_interne:         z.string().max(500).optional().nullable(),
  image_url:            z.string().url().optional().nullable(),
  image_storage_path:   z.string().optional().nullable(),
});

const ProduitUpdateSchema = ProduitSchema.partial().extend({
  id: z.string().uuid(),
});

// ── GET — Liste tous les produits ─────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await getOwnerBoulangerieId(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { boulangerieId, admin } = auth;
    const { searchParams } = new URL(req.url);
    const categorie   = searchParams.get('categorie');
    const actifOnly   = searchParams.get('actif') !== 'false';
    const flashOnly   = searchParams.get('flash') === 'true';

    let query = admin
      .from('produits')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .order('categorie')
      .order('ordre')
      .order('nom');

    if (actifOnly)   query = query.eq('actif_catalogue', true);
    if (flashOnly)   query = query.eq('actif_flash', true);
    if (categorie)   query = query.eq('categorie', categorie);

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/boulanger/produits]', error);
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

    // Construit les URLs publiques Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const produits = (data ?? []).map(p => ({
      ...p,
      image_public_url: p.image_storage_path
        ? `${supabaseUrl}/storage/v1/object/public/produits-photos/${p.image_storage_path}`
        : p.image_url ?? null,
    }));

    return NextResponse.json({ produits });

  } catch (err) {
    console.error('[GET /api/boulanger/produits]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — Créer un produit ───────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await getOwnerBoulangerieId(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { boulangerieId, admin } = auth;
    const body = await req.json();
    const parsed = ProduitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Vérifie la limite du plan (Starter : 20 produits max)
    const { count } = await admin
      .from('produits')
      .select('*', { count: 'exact', head: true })
      .eq('boulangerie_id', boulangerieId)
      .eq('actif_catalogue', true);

    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('plan')
      .eq('id', boulangerieId)
      .single();

    if (boulangerie?.plan === 'starter' && (count ?? 0) >= 20) {
      return NextResponse.json(
        { error: 'Limite atteinte (20 produits en plan Starter). Passez au plan Pro pour un catalogue illimité.' },
        { status: 403 }
      );
    }

    const { data, error } = await admin
      .from('produits')
      .insert({ ...parsed.data, boulangerie_id: boulangerieId })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/boulanger/produits]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ produit: data }, { status: 201 });

  } catch (err) {
    console.error('[POST /api/boulanger/produits]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── PATCH — Modifier un produit ───────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getOwnerBoulangerieId(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { boulangerieId, admin } = auth;
    const body = await req.json();
    const parsed = ProduitUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;

    const { data, error } = await admin
      .from('produits')
      .update(updates)
      .eq('id', id)
      .eq('boulangerie_id', boulangerieId) // sécurité : ownership
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Produit introuvable ou accès refusé' },
        { status: 404 }
      );
    }

    return NextResponse.json({ produit: data });

  } catch (err) {
    console.error('[PATCH /api/boulanger/produits]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── DELETE — Supprimer un produit + photo Storage ─────────────

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getOwnerBoulangerieId(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { boulangerieId, admin } = auth;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    // Récupère le produit pour connaître le chemin Storage
    const { data: produit } = await admin
      .from('produits')
      .select('id, image_storage_path')
      .eq('id', id)
      .eq('boulangerie_id', boulangerieId)
      .single();

    if (!produit) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
    }

    // Supprime la photo Storage si elle existe
    if (produit.image_storage_path) {
      const { error: storageErr } = await admin.storage
        .from('produits-photos')
        .remove([produit.image_storage_path]);

      if (storageErr) {
        console.warn('[DELETE /api/boulanger/produits] Storage cleanup failed:', storageErr);
        // Non bloquant — on continue la suppression du produit
      }
    }

    // Supprime le produit
    const { error } = await admin
      .from('produits')
      .delete()
      .eq('id', id)
      .eq('boulangerie_id', boulangerieId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[DELETE /api/boulanger/produits]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}