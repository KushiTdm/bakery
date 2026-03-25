// app/api/boulanger/export/route.ts
// ─────────────────────────────────────────────────────────────
// Export données RGPD — Article 20 (droit à la portabilité)
//
// Accès : owner uniquement (responsable de traitement)
// Format : JSON téléchargeable
// Audit  : chaque export est tracé dans audit_logs
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getBoulangerSession } from '@/lib/auth-boulanger';
import { getSupabaseAdmin } from '@/lib/supabase';
import { logAuditAction } from '@/lib/audit';

// ── Helpers ───────────────────────────────────────────────────

function getClientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    undefined
  );
}

// ── Route GET ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await getBoulangerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // 2. Owner uniquement — responsable de traitement RGPD
  // Les gérants et employés n'ont pas accès à l'export complet
  if (session.role !== 'owner') {
    return NextResponse.json(
      { error: 'Seul le propriétaire peut exporter les données RGPD.' },
      { status: 403 }
    );
  }

  const admin        = getSupabaseAdmin();
  const boulangerieId = session.boulangerieId;

  try {
    // 3. Collecte des données (90 jours pour les données volumineuses,
    //    tout l'historique pour les données légales)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoff = ninetyDaysAgo.toISOString();

    const [
      boulangerie,
      employes,
      produits,
      journees,
      commandes,
      paniers,
      rapports,
    ] = await Promise.all([
      admin.from('boulangeries').select('*').eq('id', boulangerieId).single(),
      admin.from('employes').select('*').eq('boulangerie_id', boulangerieId),
      admin.from('produits').select('*').eq('boulangerie_id', boulangerieId),
      // Journées : sans limite (données légales comptabilité)
      admin.from('journees').select('*').eq('boulangerie_id', boulangerieId)
        .order('date', { ascending: false }),
      // Commandes : sans limite (obligation légale 5 ans)
      admin.from('commandes').select('*').eq('boulangerie_id', boulangerieId)
        .order('created_at', { ascending: false }),
      // Paniers flash : 90 jours (historique opérationnel)
      admin.from('paniers_flash').select('*').eq('boulangerie_id', boulangerieId)
        .gte('date', cutoff.split('T')[0])
        .order('date', { ascending: false }),
      // Rapports IA : 90 jours
      admin.from('ai_rapports').select('*').eq('boulangerie_id', boulangerieId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false }),
    ]);

    // Stocks journaliers récupérés séparément (volume élevé — filtrés par journées)
    let stocksData: unknown[] = [];
    if (journees.data && journees.data.length > 0) {
      const journeeIds = journees.data.map(j => j.id);
      // Supabase .in() accepte max ~1000 valeurs — pagination si nécessaire
      const { data: stocks } = await admin
        .from('stocks_journaliers')
        .select('*')
        .in('journee_id', journeeIds.slice(0, 500)); // sécurité : plafond
      stocksData = stocks ?? [];
    }

    // 4. Construction du payload
    const exportData = {
      exported_at:        new Date().toISOString(),
      boulangerie_id:     boulangerieId,
      format_version:     '1.0',
      boulangerie:        boulangerie.data   ?? null,
      employes:           employes.data      ?? [],
      produits:           produits.data      ?? [],
      journees:           journees.data      ?? [],
      stocks_journaliers: stocksData,
      commandes:          commandes.data     ?? [],
      paniers_flash:      paniers.data       ?? [],
      ai_rapports:        rapports.data      ?? [],
    };

    // 5. Log audit (non-bloquant, après la collecte)
    await logAuditAction({
      boulangerieId,
      userId:     session.userId,
      action:     'export_rgpd',
      entityType: 'boulangerie',
      entityId:   boulangerieId,
      details: {
        nb_journees:  journees.data?.length  ?? 0,
        nb_commandes: commandes.data?.length ?? 0,
        nb_produits:  produits.data?.length  ?? 0,
      },
      ipAddress:  getClientIp(req),
      userAgent:  req.headers.get('user-agent') ?? undefined,
    });

    // 6. Réponse JSON téléchargeable
    const filename = `bakeryos-export-${boulangerieId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type':        'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Pas de cache — export sensible
        'Cache-Control':       'no-store, no-cache',
      },
    });

  } catch (err) {
    console.error('[GET /api/boulanger/export]', err);
    return NextResponse.json(
      { error: 'Erreur lors de l\'export des données.' },
      { status: 500 }
    );
  }
}