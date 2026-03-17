// app/api/boulanger/flash/route.ts
// ─────────────────────────────────────────────────────────────
// CRUD paniers anti-gaspi (table paniers_flash).
//
// GET    → liste des paniers flash du jour pour ce boulanger
// POST   → upsert en masse (remplace tous les paniers du jour)
// PATCH  → mise à jour partielle d'un panier (quantité, actif)
// DELETE → supprime tous les paniers flash du jour
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// ── Auth helper ───────────────────────────────────────────────

async function getAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const admin = getSupabaseAdmin();
  const token = authHeader.slice(7);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id, flash_remise_pct, flash_heure_debut, flash_heure_fin')
    .eq('user_id', user.id)
    .single();

  if (!boulangerie) return null;
  return { admin, boulangerieId: boulangerie.id as string, config: boulangerie };
}

const today = () => new Date().toISOString().split('T')[0];

// ── Schémas Zod ───────────────────────────────────────────────

const PanierFlashItemSchema = z.object({
  produit_id:        z.string().min(1).max(100),
  produit_nom:       z.string().min(1).max(150),
  produit_emoji:     z.string().max(4).default('🥖'),
  categorie:         z.enum(['boulangerie', 'viennoiserie', 'patisserie']),
  prix_original:     z.number().positive(),
  remise_pct:        z.number().int().min(1).max(100),
  prix_flash:        z.number().positive(),
  quantite_initiale: z.number().int().min(0),
  quantite_restante: z.number().int().min(0),
  allergenes:        z.array(z.string()).default([]),
  actif:             z.boolean().default(true),
});

const UpsertBodySchema = z.object({
  paniers: z.array(PanierFlashItemSchema).min(0).max(50),
});

const PatchBodySchema = z.object({
  produit_id:        z.string().min(1),
  quantite_restante: z.number().int().min(0).optional(),
  actif:             z.boolean().optional(),
});

// ── GET — liste du jour ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { admin, boulangerieId } = auth;

  try {
    const { data, error } = await admin
      .from('paniers_flash')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today())
      .order('categorie')
      .order('produit_nom');

    if (error) {
      console.error('[GET /api/boulanger/flash]', error);
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

    return NextResponse.json({
      paniers: data ?? [],
      config: {
        remise_pct:  auth.config.flash_remise_pct  ?? 40,
        heure_debut: auth.config.flash_heure_debut ?? 18,
        heure_fin:   auth.config.flash_heure_fin   ?? 20,
      },
    });
  } catch (err) {
    console.error('[GET /api/boulanger/flash]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — upsert en masse (remplace la sélection du jour) ────

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { admin, boulangerieId } = auth;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  const parsed = UpsertBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { paniers } = parsed.data;
  const dateAujourd = today();

  try {
    if (paniers.length === 0) {
      // Supprimer tous les paniers du jour si tableau vide
      await admin
        .from('paniers_flash')
        .delete()
        .eq('boulangerie_id', boulangerieId)
        .eq('date', dateAujourd);

      return NextResponse.json({ success: true, count: 0 });
    }

    // Sanitize + prépare les lignes
    const rows = paniers.map(p => ({
      boulangerie_id:    boulangerieId,
      date:              dateAujourd,
      produit_id:        String(p.produit_id).slice(0, 100),
      produit_nom:       String(p.produit_nom).slice(0, 150),
      produit_emoji:     String(p.produit_emoji || '🥖').slice(0, 4),
      categorie:         p.categorie,
      prix_original:     Math.round(p.prix_original * 100) / 100,
      remise_pct:        Math.max(1, Math.min(100, Math.floor(p.remise_pct))),
      prix_flash:        Math.round(p.prix_flash * 100) / 100,
      quantite_initiale: Math.max(0, Math.floor(p.quantite_initiale)),
      quantite_restante: Math.max(0, Math.floor(p.quantite_restante)),
      allergenes:        (p.allergenes ?? []).slice(0, 20).map(a => String(a).slice(0, 50)),
      actif:             p.actif,
    }));

    const { data, error } = await admin
      .from('paniers_flash')
      .upsert(rows, { onConflict: 'boulangerie_id,date,produit_id' })
      .select();

    if (error) {
      console.error('[POST /api/boulanger/flash] upsert:', error);
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });
    }

    // Supprimer les produits qui ne sont plus dans la sélection
    const produitIds = rows.map(r => r.produit_id);
    await admin
      .from('paniers_flash')
      .delete()
      .eq('boulangerie_id', boulangerieId)
      .eq('date', dateAujourd)
      .not('produit_id', 'in', `(${produitIds.map(id => `"${id}"`).join(',')})`);

    return NextResponse.json({ success: true, count: data?.length ?? 0 });

  } catch (err) {
    console.error('[POST /api/boulanger/flash]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── PATCH — mise à jour d'un produit flash (quantité / actif) ─

export async function PATCH(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { admin, boulangerieId } = auth;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }); }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { produit_id, quantite_restante, actif } = parsed.data;
  const updates: Record<string, unknown> = {};

  if (quantite_restante !== undefined) {
    updates.quantite_restante = Math.max(0, Math.floor(quantite_restante));
  }
  if (actif !== undefined) {
    updates.actif = actif;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, message: 'Aucun changement' });
  }

  try {
    const { data, error } = await admin
      .from('paniers_flash')
      .update(updates)
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today())
      .eq('produit_id', produit_id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Panier introuvable ou accès refusé' }, { status: 404 });
    }

    return NextResponse.json({ success: true, panier: data });

  } catch (err) {
    console.error('[PATCH /api/boulanger/flash]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── DELETE — supprime tous les paniers flash du jour ──────────

export async function DELETE(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { admin, boulangerieId } = auth;

  try {
    const { error } = await admin
      .from('paniers_flash')
      .delete()
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today());

    if (error) {
      return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[DELETE /api/boulanger/flash]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}