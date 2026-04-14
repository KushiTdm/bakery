// app/api/boulanger/recettes/route.ts
// ─────────────────────────────────────────────────────────────
// GET  → liste des produits avec leur statut de recette
// POST → enregistre (ou remplace) une recette spécifique boulangerie+produit
// DELETE?produit_id=... → supprime la recette spécifique (retour au template/catégorie)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { z } from 'zod';
import { findBestTemplateMatch, type RecetteProduit } from '@/lib/ai-anonymize';

// ── Types exportés ────────────────────────────────────────────

export type RecipeStatus = 'specific' | 'template' | 'categorie';

export interface ProduitAvecRecette {
  produit_id: string;
  nom:        string;
  categorie:  string;
  emoji:      string;
  status:     RecipeStatus;
  recette:    RecetteProduit | null;
}

// ── Schéma validation ─────────────────────────────────────────

const RecetteSchema = z.object({
  produit_id:           z.string().uuid(),
  farine_g:             z.number().min(0).default(0),
  beurre_g:             z.number().min(0).default(0),
  oeufs_n:              z.number().min(0).default(0),
  sucre_g:              z.number().min(0).default(0),
  sel_g:                z.number().min(0).default(0),
  levure_boulangere_g:  z.number().min(0).default(0),
  levain_g:             z.number().min(0).default(0),
  eau_ml:               z.number().min(0).default(0),
  lait_ml:              z.number().min(0).default(0),
  chocolat_g:           z.number().min(0).default(0),
  huile_ml:             z.number().min(0).default(0),
  creme_g:              z.number().min(0).default(0),
});

// ── GET — liste produits + statut recette ─────────────────────

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'catalogue', 'read')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { boulangerieId } = session;
  const admin = getSupabaseAdmin();

  // 1. Tous les produits actifs (non supprimés) de cette boulangerie
  const { data: produits } = await admin
    .from('produits')
    .select('id, nom, categorie, emoji')
    .eq('boulangerie_id', boulangerieId)
    .is('deleted_at', null)
    .eq('actif', true)
    .order('ordre');

  if (!produits?.length) return NextResponse.json({ produits: [] });

  const produitIds = produits.map(p => p.id);

  // 2. Recettes spécifiques de cette boulangerie
  const { data: specificRecettes } = await admin
    .from('recettes_produits')
    .select('*')
    .eq('boulangerie_id', boulangerieId)
    .in('produit_id', produitIds);

  const specificMap = new Map<string, RecetteProduit>();
  for (const r of specificRecettes ?? []) {
    specificMap.set(r.produit_id, r as RecetteProduit);
  }

  // 3. Templates globaux nommés (niveau 2)
  const { data: globalRecettes, error: globalErr } = await admin
    .from('recettes_produits')
    .select('*')
    .is('boulangerie_id', null)
    .not('nom_recette', 'is', null);

  if (globalErr) {
    console.error('[recettes/GET] templates fetch error — migration may not have run:', globalErr.message);
  }

  const byName = new Map<string, RecetteProduit>();
  for (const r of globalRecettes ?? []) {
    if (r.nom_recette) byName.set(r.nom_recette.toLowerCase(), r as RecetteProduit);
  }

  // 4. Calcul du statut pour chaque produit
  const result: ProduitAvecRecette[] = produits.map(p => {
    if (specificMap.has(p.id)) {
      return {
        produit_id: p.id, nom: p.nom, categorie: p.categorie, emoji: p.emoji,
        status: 'specific',
        recette: specificMap.get(p.id)!,
      };
    }
    const exact = byName.get(p.nom.toLowerCase());
    if (exact) {
      return {
        produit_id: p.id, nom: p.nom, categorie: p.categorie, emoji: p.emoji,
        status: 'template',
        recette: exact,
      };
    }
    const fuzzy = findBestTemplateMatch(p.nom, byName, 0.80);
    if (fuzzy) {
      return {
        produit_id: p.id, nom: p.nom, categorie: p.categorie, emoji: p.emoji,
        status: 'template',
        recette: fuzzy,
      };
    }
    return {
      produit_id: p.id, nom: p.nom, categorie: p.categorie, emoji: p.emoji,
      status: 'categorie',
      recette: null,
    };
  });

  return NextResponse.json({ produits: result });
}

// ── POST — enregistre une recette personnalisée ───────────────

export async function POST(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'catalogue', 'write')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { boulangerieId } = session;

  const body = await req.json() as unknown;
  const parsed = RecetteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
  }

  const { produit_id, ...ingredients } = parsed.data;
  const admin = getSupabaseAdmin();

  // Vérifie que le produit appartient à cette boulangerie
  const { data: produit } = await admin
    .from('produits')
    .select('id, categorie')
    .eq('id', produit_id)
    .eq('boulangerie_id', boulangerieId)
    .single();

  if (!produit) {
    return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
  }

  // Suppression de l'éventuelle recette existante pour ce produit,
  // puis insertion — évite les problèmes d'upsert sur index partiel.
  await admin
    .from('recettes_produits')
    .delete()
    .eq('boulangerie_id', boulangerieId)
    .eq('produit_id', produit_id);

  const { error: insertError } = await admin
    .from('recettes_produits')
    .insert({
      boulangerie_id: boulangerieId,
      produit_id,
      categorie:  produit.categorie,
      source:     'manual',
      confidence: 1.0,
      ...ingredients,
    });

  if (insertError) {
    console.error('[recettes] insert error', insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ── DELETE — supprime la recette spécifique (retour template) ─

export async function DELETE(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'catalogue', 'write')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { boulangerieId } = session;
  const { searchParams } = new URL(req.url);
  const produit_id = searchParams.get('produit_id');

  if (!produit_id) {
    return NextResponse.json({ error: 'produit_id requis' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error: deleteError } = await admin
    .from('recettes_produits')
    .delete()
    .eq('boulangerie_id', boulangerieId)
    .eq('produit_id', produit_id);

  if (deleteError) {
    console.error('[recettes] delete error', deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
