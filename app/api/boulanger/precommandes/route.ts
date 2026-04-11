// app/api/boulanger/precommandes/route.ts
// GET — Pré-commandes pour une date donnée (commandes avec date_retrait = date)
// Agrège les quantités par produit_id pour affichage dans vue-matin

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

interface PreCommandeProduit {
  produit_id:  string;
  produit_nom: string;
  quantite:    number;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!canAccess(session, 'commandes', 'read')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { boulangerieId } = session;
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Paramètre date requis (YYYY-MM-DD)' }, { status: 400 });
    }

    // Récupère les pré-commandes avec date_retrait = date demandée
    const { data: commandes, error } = await admin
      .from('commandes')
      .select('id, client_prenom, client_email, montant_total, statut, heure_retrait, lignes, created_at')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_retrait', date)
      .in('statut', ['en_attente', 'confirmee', 'prete']);

    if (error) {
      console.error('[GET /api/boulanger/precommandes]', error);
      return NextResponse.json({ error: 'Erreur chargement pré-commandes' }, { status: 500 });
    }

    // Agrégation par produit
    const parProduit: Record<string, PreCommandeProduit> = {};
    let totalCommandes = 0;
    let totalCA = 0;

    for (const c of commandes ?? []) {
      totalCommandes++;
      totalCA += Number(c.montant_total ?? 0);
      const lignes = (c.lignes ?? []) as Array<{ produit_id?: string; produit_nom: string; quantite: number }>;
      for (const l of lignes) {
        const key = l.produit_id ?? l.produit_nom;
        if (!parProduit[key]) {
          parProduit[key] = { produit_id: l.produit_id ?? '', produit_nom: l.produit_nom, quantite: 0 };
        }
        parProduit[key].quantite += l.quantite;
      }
    }

    return NextResponse.json({
      precommandes: commandes ?? [],
      par_produit: Object.values(parProduit),
      total_commandes: totalCommandes,
      total_ca: Math.round(totalCA * 100) / 100,
    });
  } catch (err) {
    console.error('[GET /api/boulanger/precommandes]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
