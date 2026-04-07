// app/api/orders/[id]/route.ts
// ─────────────────────────────────────────────────────────────
// PATCH — met à jour le statut d'une commande
// GET   — récupère une commande par ID
//
// Auth : getBoulangerSession (owner, gérant, employé avec commandes:read/write)
// Pénalisation : raison='non_recuperee' → incrémente client_penalites
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { isValidUUID } from '@/lib/sanitize';

const VALID_STATUSES = ['en_attente', 'confirmee', 'prete', 'recuperee', 'annulee', 'non_recuperee'] as const;
type Status = typeof VALID_STATUSES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'ID de commande invalide' }, { status: 400 });
    }

    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!canAccess(session, 'commandes', 'write')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 }); }

    const status = (body as Record<string, unknown>)?.status as Status;

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // Mettre à jour le statut de la commande
    const { data, error } = await admin
      .from('commandes')
      .update({ statut: status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('boulangerie_id', session.boulangerieId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Commande introuvable ou accès refusé' }, { status: 404 });
    }

    // ── Restauration stock flash si annulation/non-récup ─────
    // Si la commande est de type anti_gaspi et qu'elle est annulée
    // ou non récupérée, on restaure quantite_restante dans paniers_flash.
    if ((status === 'annulee' || status === 'non_recuperee') && data.type === 'anti_gaspi') {
      try {
        const lignes = (data.lignes ?? []) as Array<{ produit_id?: string; produit_nom: string; quantite: number }>;
        const tz = 'Europe/Paris'; // Fallback safe
        const todayLocal = new Date().toLocaleDateString('sv-SE', { timeZone: tz });

        for (const ligne of lignes) {
          // Extraire le produit_id (flash items ont un produit_id dans lignes)
          if (!ligne.produit_id) continue;

          // Incrémenter quantite_restante
          const { data: panier } = await admin
            .from('paniers_flash')
            .select('id, quantite_restante')
            .eq('boulangerie_id', session.boulangerieId)
            .eq('date', todayLocal)
            .eq('produit_id', ligne.produit_id)
            .single();

          if (panier) {
            await admin
              .from('paniers_flash')
              .update({ quantite_restante: panier.quantite_restante + ligne.quantite })
              .eq('id', panier.id);
          }
        }
      } catch (restoreErr) {
        console.warn('[PATCH /api/orders/[id]] restauration stock flash:', restoreErr);
      }
    }

    // ── Pénalisation client (non récupérée) ──────────────────
    if (status === 'non_recuperee' && data.client_email) {
      try {
        const email = data.client_email.toLowerCase().trim();

        // Chercher une pénalité existante
        const { data: existing } = await admin
          .from('client_penalites')
          .select('id, nb_non_recupere, bloque')
          .eq('boulangerie_id', session.boulangerieId)
          .eq('client_email', email)
          .single();

        let newCount: number;

        if (existing) {
          // Incrémenter le compteur
          newCount = existing.nb_non_recupere + 1;
          await admin
            .from('client_penalites')
            .update({ nb_non_recupere: newCount })
            .eq('id', existing.id);
        } else {
          // Créer l'entrée
          newCount = 1;
          await admin
            .from('client_penalites')
            .insert({
              boulangerie_id: session.boulangerieId,
              client_email:   email,
              nb_non_recupere: 1,
            });
        }

        // Vérifier seuil de blocage
        const { data: boul } = await admin
          .from('boulangeries')
          .select('seuil_penalite, penalite_active')
          .eq('id', session.boulangerieId)
          .single();

        if (boul?.penalite_active && newCount >= boul.seuil_penalite && !existing?.bloque) {
          await admin
            .from('client_penalites')
            .update({ bloque: true, blocage_date: new Date().toISOString() })
            .eq('boulangerie_id', session.boulangerieId)
            .eq('client_email', email);
        }

        // Audit log (non-bloquant)
        admin.from('audit_logs').insert({
          boulangerie_id: session.boulangerieId,
          user_id:        session.userId,
          action:         'commande_non_recuperee',
          details:        { commande_id: data.id, client_email: email, count: newCount },
        }).then(() => {}, () => {});
      } catch (penaltyErr) {
        console.warn('[PATCH /api/orders/[id]] pénalité non enregistrée:', penaltyErr);
      }
    }

    return NextResponse.json({ success: true, commande: data });

  } catch (err) {
    console.error('[PATCH /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'ID de commande invalide' }, { status: 400 });
    }

    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!canAccess(session, 'commandes', 'read')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from('commandes')
      .select('*')
      .eq('id', id)
      .eq('boulangerie_id', session.boulangerieId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    return NextResponse.json({ commande: data });

  } catch (err) {
    console.error('[GET /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
