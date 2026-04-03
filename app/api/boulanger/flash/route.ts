// app/api/boulanger/flash/route.ts
// ─────────────────────────────────────────────────────────────
// CRUD paniers anti-gaspi (table paniers_flash).
//
// GET    → liste des paniers flash du jour pour ce boulanger
// POST   → upsert en masse (remplace tous les paniers du jour)
// PATCH  → mise à jour partielle d'un panier (quantité, actif)
// DELETE → supprime tous les paniers flash du jour
//
// FIX FUSEAU : la date du jour est calculée dans le fuseau
// configuré via BAKERY_TIMEZONE (défaut: Europe/Paris).
// Cela évite le décalage entre la date UTC du serveur Node.js
// et la date locale de la boulangerie.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { z } from 'zod';

// ── Helper config flash ───────────────────────────────────────
// Récupère uniquement la config flash de la boulangerie (remise, horaires)

async function getFlashConfig(boulangerieId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('boulangeries')
    .select('flash_remise_pct, flash_heure_debut, flash_heure_fin')
    .eq('id', boulangerieId)
    .single();
  return data ?? { flash_remise_pct: 40, flash_heure_debut: 18, flash_heure_fin: 20 };
}

// ── Date locale boulangerie ───────────────────────────────────
// Utilise le timezone stocké en DB pour chaque boulangerie (défaut: Europe/Paris)

async function getBoulangerieTimezone(boulangerieId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('boulangeries')
    .select('timezone')
    .eq('id', boulangerieId)
    .single();
  return (data?.timezone as string) ?? 'Europe/Paris';
}

function todayForTimezone(tz: string): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: tz });
}

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
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'flash', 'read')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;
  const tz = await getBoulangerieTimezone(boulangerieId);
  const dateAujourd = todayForTimezone(tz);

  try {
    const [flashData, config] = await Promise.all([
      admin
        .from('paniers_flash')
        .select('*')
        .eq('boulangerie_id', boulangerieId)
        .eq('date', dateAujourd)
        .order('categorie')
        .order('produit_nom'),
      getFlashConfig(boulangerieId),
    ]);

    if (flashData.error) {
      console.error('[GET /api/boulanger/flash]', flashData.error);
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

    return NextResponse.json({
      paniers: flashData.data ?? [],
      config: {
        remise_pct:  config.flash_remise_pct  ?? 40,
        heure_debut: config.flash_heure_debut ?? 18,
        heure_fin:   config.flash_heure_fin   ?? 20,
      },
    });
  } catch (err) {
    console.error('[GET /api/boulanger/flash]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — upsert en masse (remplace la sélection du jour) ────

export async function POST(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'flash', 'write')) {
    return NextResponse.json({ error: 'Accès refusé — réservé au propriétaire et aux gérants' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;

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
  const tz = await getBoulangerieTimezone(boulangerieId);
  const dateAujourd = todayForTimezone(tz);

  try {
    if (paniers.length === 0) {
      await admin
        .from('paniers_flash')
        .delete()
        .eq('boulangerie_id', boulangerieId)
        .eq('date', dateAujourd);

      return NextResponse.json({ success: true, count: 0 });
    }

    // ── Vérification croisée : stock disponible après réservations C&C ──
    // Récupérer la journée du jour pour les productions
    const { data: journee } = await admin
      .from('journees')
      .select('id')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', dateAujourd)
      .single();

    if (journee) {
      const { data: stocks } = await admin
        .from('stocks_journaliers')
        .select('produit_id, produit_nom, production, report_veille')
        .eq('journee_id', journee.id);

      if (stocks && stocks.length > 0) {
        // Map produit_id → production totale
        const prodMap: Record<string, number> = {};
        for (const s of stocks) {
          prodMap[s.produit_id] = (s.production ?? 0) + (s.report_veille ?? 0);
        }

        // Quantités réservées par commandes C&C actives (bornes timezone-aware)
        const nowForOffset = new Date();
        const localStr = nowForOffset.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
        const localAsUtc = new Date(localStr + 'Z');
        const tzOffsetMs = localAsUtc.getTime() - nowForOffset.getTime();
        const dayStartMs = new Date(`${dateAujourd}T00:00:00Z`).getTime() - tzOffsetMs;
        const dayStartUtcIso = new Date(dayStartMs).toISOString();
        const dayEndUtcIso = new Date(dayStartMs + 86400000).toISOString();
        const { data: activeOrders } = await admin
          .from('commandes')
          .select('lignes')
          .eq('boulangerie_id', boulangerieId)
          .gte('created_at', dayStartUtcIso)
          .lt('created_at', dayEndUtcIso)
          .in('statut', ['en_attente', 'confirmee', 'prete', 'recuperee']);

        // Réservé par C&C indexé par produit_id
        const reservedById: Record<string, number> = {};
        if (activeOrders) {
          for (const order of activeOrders) {
            const lignes = (order.lignes ?? []) as Array<{ produit_id?: string; produit_nom: string; quantite: number }>;
            for (const l of lignes) {
              const pid = l.produit_id;
              if (pid) reservedById[pid] = (reservedById[pid] ?? 0) + l.quantite;
            }
          }
        }

        // Vérifier que chaque panier flash ne dépasse pas le stock disponible
        const warnings: string[] = [];
        for (const p of paniers) {
          const totalProd = prodMap[p.produit_id];
          if (totalProd === undefined) continue; // Produit pas dans la journée → pas de vérif
          const reserved = reservedById[p.produit_id] ?? 0;
          const disponible = totalProd - reserved;
          if (p.quantite_initiale > disponible) {
            warnings.push(
              `${p.produit_nom} : ${Math.max(0, disponible)} dispo (${reserved} réservé C&C), ${p.quantite_initiale} demandé pour flash`
            );
          }
        }

        if (warnings.length > 0) {
          return NextResponse.json(
            { error: 'Stock insuffisant pour certains paniers flash', details: warnings },
            { status: 409 }
          );
        }
      }
    }

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
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'flash', 'write')) {
    return NextResponse.json({ error: 'Accès refusé — réservé au propriétaire et aux gérants' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;

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
  const tz = await getBoulangerieTimezone(session.boulangerieId);
  const dateAujourd = todayForTimezone(tz);

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
      .eq('date', dateAujourd)
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
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'flash', 'write')) {
    return NextResponse.json({ error: 'Accès refusé — réservé au propriétaire et aux gérants' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;
  const tz = await getBoulangerieTimezone(boulangerieId);
  const dateAujourd = todayForTimezone(tz);

  try {
    const { error } = await admin
      .from('paniers_flash')
      .delete()
      .eq('boulangerie_id', boulangerieId)
      .eq('date', dateAujourd);

    if (error) {
      return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[DELETE /api/boulanger/flash]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}