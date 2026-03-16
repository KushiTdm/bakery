// app/api/boulanger/produits/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import {
  isValidUUID,
  sanitizeText,
  sanitizeProductName,
  sanitizeDescription,
  sanitizeEmoji,
  sanitizePositiveNumber,
  sanitizeStringArray,
  sanitizeUrl,
  sanitizeDate,
} from '@/lib/sanitize';

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

// ── Constantes ────────────────────────────────────────────────

const ALLERGENES_VALIDES = [
  'gluten', 'crustaces', 'oeufs', 'poisson', 'arachides',
  'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde',
  'sesame', 'sulfites', 'lupin', 'mollusques',
] as const;

const CATEGORIES_VALIDES = ['boulangerie', 'viennoiserie', 'patisserie'] as const;

// ── Schémas Zod (validation de structure) ────────────────────

const ProduitSchema = z.object({
  nom:                  z.string().min(1).max(100),
  description:          z.string().max(500).optional().nullable(),
  categorie:            z.enum(CATEGORIES_VALIDES),
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

/**
 * Applique la sanitization métier sur les données validées par Zod.
 * Zod valide la structure, sanitize nettoie le contenu.
 */
function sanitizeProduitData(data: z.infer<typeof ProduitSchema>) {
  return {
    ...data,
    nom:                sanitizeProductName(data.nom),
    description:        data.description ? sanitizeDescription(data.description) : null,
    emoji:              sanitizeEmoji(data.emoji),
    allergenes:         sanitizeStringArray(data.allergenes, [...ALLERGENES_VALIDES]),
    note_interne:       data.note_interne ? sanitizeText(data.note_interne, 500) : null,
    image_url:          data.image_url ? sanitizeUrl(data.image_url) : null,
    disponible_du:      sanitizeDate(data.disponible_du),
    disponible_au:      sanitizeDate(data.disponible_au),
    prix_vente:         Math.round(data.prix_vente * 100) / 100,
    cout_production:    Math.round((data.cout_production ?? 0) * 100) / 100,
    prix_flash_override: data.prix_flash_override
      ? Math.round(data.prix_flash_override * 100) / 100
      : null,
  };
}

// ── GET — Liste tous les produits ─────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await getOwnerBoulangerieId(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { boulangerieId, admin } = auth;
    const { searchParams }         = new URL(req.url);

    // Sanitise les query params (utilisés uniquement dans des .eq() paramétrés)
    const categorie  = searchParams.get('categorie');
    const actifOnly  = searchParams.get('actif') !== 'false';
    const flashOnly  = searchParams.get('flash') === 'true';

    // Validation catégorie si fournie
    if (categorie && !CATEGORIES_VALIDES.includes(categorie as typeof CATEGORIES_VALIDES[number])) {
      return NextResponse.json({ error: 'Catégorie invalide' }, { status: 400 });
    }

    let query = admin
      .from('produits')
      .select('*')
      .eq('boulangerie_id', boulangerieId) // UUID paramétré — pas d'injection possible
      .order('categorie')
      .order('ordre')
      .order('nom');

    if (actifOnly) query = query.eq('actif_catalogue', true);
    if (flashOnly) query = query.eq('actif_flash', true);
    if (categorie) query = query.eq('categorie', categorie);

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/boulanger/produits]', error);
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête JSON invalide' }, { status: 400 });
    }

    const parsed = ProduitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Sanitization après validation structurelle
    const sanitized = sanitizeProduitData(parsed.data);

    // Vérification limite plan Starter
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
        { error: 'Limite atteinte (20 produits en plan Starter). Passez au plan Pro.' },
        { status: 403 }
      );
    }

    const { data, error } = await admin
      .from('produits')
      .insert({ ...sanitized, boulangerie_id: boulangerieId })
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête JSON invalide' }, { status: 400 });
    }

    const parsed = ProduitUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...rest } = parsed.data;

    // Validation UUID explicite (défense en profondeur)
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 });
    }

    // Sanitize uniquement les champs présents dans la mise à jour partielle
    const updates: Record<string, unknown> = {};
    if (rest.nom              !== undefined) updates.nom              = sanitizeProductName(rest.nom);
    if (rest.description      !== undefined) updates.description      = rest.description ? sanitizeDescription(rest.description) : null;
    if (rest.emoji            !== undefined) updates.emoji            = sanitizeEmoji(rest.emoji);
    if (rest.allergenes       !== undefined) updates.allergenes       = sanitizeStringArray(rest.allergenes, [...ALLERGENES_VALIDES]);
    if (rest.note_interne     !== undefined) updates.note_interne     = rest.note_interne ? sanitizeText(rest.note_interne, 500) : null;
    if (rest.image_url        !== undefined) updates.image_url        = rest.image_url ? sanitizeUrl(rest.image_url) : null;
    if (rest.disponible_du    !== undefined) updates.disponible_du    = sanitizeDate(rest.disponible_du);
    if (rest.disponible_au    !== undefined) updates.disponible_au    = sanitizeDate(rest.disponible_au);
    if (rest.prix_vente       !== undefined) updates.prix_vente       = Math.round((rest.prix_vente ?? 0) * 100) / 100;
    if (rest.cout_production  !== undefined) updates.cout_production  = Math.round((rest.cout_production ?? 0) * 100) / 100;
    if (rest.prix_flash_override !== undefined) updates.prix_flash_override = rest.prix_flash_override ? Math.round(rest.prix_flash_override * 100) / 100 : null;
    // Champs booléens et entiers — pas de sanitization textuelle nécessaire
    if (rest.actif_catalogue  !== undefined) updates.actif_catalogue  = rest.actif_catalogue;
    if (rest.actif_flash      !== undefined) updates.actif_flash      = rest.actif_flash;
    if (rest.ordre            !== undefined) updates.ordre            = Math.max(0, Math.floor(rest.ordre ?? 0));
    if (rest.stock_alerte     !== undefined) updates.stock_alerte     = rest.stock_alerte !== null ? Math.max(0, Math.floor(rest.stock_alerte ?? 0)) : null;
    if (rest.categorie        !== undefined) updates.categorie        = rest.categorie;
    if (rest.image_storage_path !== undefined) updates.image_storage_path = rest.image_storage_path;

    const { data, error } = await admin
      .from('produits')
      .update(updates)
      .eq('id', id)
      .eq('boulangerie_id', boulangerieId) // ownership — pas d'accès croisé
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
    const { searchParams }         = new URL(req.url);
    const id                       = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    // Validation UUID (évite tout path traversal ou injection)
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 });
    }

    const { data: produit } = await admin
      .from('produits')
      .select('id, image_storage_path')
      .eq('id', id)
      .eq('boulangerie_id', boulangerieId) // ownership
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
      }
    }

    const { error } = await admin
      .from('produits')
      .delete()
      .eq('id', id)
      .eq('boulangerie_id', boulangerieId); // ownership

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[DELETE /api/boulanger/produits]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}