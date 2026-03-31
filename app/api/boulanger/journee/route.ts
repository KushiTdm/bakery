import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { StockEntry } from '@/lib/types';
import { DUREE_CONSERVATION_PAR_CATEGORIE } from '@/lib/types';
import { getTodayInTimezone } from '@/lib/ai-anonymize';

async function getBoulangerieId(req: NextRequest): Promise<{ id: string; timezone: string } | null> {
  const admin = getSupabaseAdmin();
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  // Owner
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id, timezone')
    .eq('user_id', user.id)
    .single();

  if (boulangerie) {
    return { id: boulangerie.id, timezone: (boulangerie.timezone as string) ?? 'Europe/Paris' };
  }

  // Employé actif
  const { data: employe } = await admin
    .from('employes')
    .select('boulangerie_id, boulangeries(timezone)')
    .eq('user_id', user.id)
    .eq('statut', 'actif')
    .single();

  if (employe?.boulangerie_id) {
    const tz = (employe.boulangeries as { timezone?: string } | null)?.timezone ?? 'Europe/Paris';
    return { id: employe.boulangerie_id, timezone: tz };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Helper : chercher les invendus reportables de J-1
//
// Logique :
//   1. Trouver la journée d'hier (en tenant compte du timezone)
//   2. Pour chaque produit avec stock_final > 0 ET duree_conservation > 1 :
//      → Calculer combien de jours il reste (duree - 1)
//      → Si encore valide aujourd'hui : inclure dans le report
//
// Retourne une Map produit_id → { quantite, jourRestant }
// ─────────────────────────────────────────────────────────────

interface ReportInfo {
  quantite:      number;
  joursRestants: number;   // Nombre de jours encore consommables après aujourd'hui
  produitNom:    string;
  produitEmoji:  string;
  categorie:     string;
}

async function getReportsVeille(
  admin: ReturnType<typeof getSupabaseAdmin>,
  boulangerieId: string,
  timezone: string,
): Promise<Map<string, ReportInfo>> {
  const reports = new Map<string, ReportInfo>();

  try {
    const today = getTodayInTimezone(timezone);

    // Date d'hier en tenant compte du timezone
    const todayDate = new Date(today + 'T12:00:00');
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    // Récupérer la journée d'hier avec ses stocks et la durée de conservation des produits
    const { data: journeeHier } = await admin
      .from('journees')
      .select(`
        id,
        date,
        cloturee,
        stocks_journaliers (
          produit_id,
          produit_nom,
          produit_emoji,
          categorie,
          stock_final,
          est_reporte
        )
      `)
      .eq('boulangerie_id', boulangerieId)
      .eq('date', yesterday)
      // Pas de contrainte cloturee=true : les invendus sont visibles même si
      // la journée n'a pas été formellement clôturée (boulanger oublie de fermer)
      .single();

    if (!journeeHier?.stocks_journaliers?.length) {
      return reports;
    }

    // Récupérer les durées de conservation des produits concernés
    const produitIds = journeeHier.stocks_journaliers
      .filter((s: { stock_final: number }) => s.stock_final > 0)
      .map((s: { produit_id: string }) => s.produit_id);

    if (produitIds.length === 0) return reports;

    const { data: produits } = await admin
      .from('produits')
      .select('id, duree_conservation_jours, categorie')
      .in('id', produitIds)
      .eq('boulangerie_id', boulangerieId);

    const dureeMap = new Map<string, number>();
    for (const p of produits ?? []) {
      const duree = p.duree_conservation_jours
        ?? DUREE_CONSERVATION_PAR_CATEGORIE[p.categorie as string]
        ?? 1;
      dureeMap.set(p.id, duree);
    }

    // Construire la map de reports
    for (const stock of journeeHier.stocks_journaliers) {
      if (stock.stock_final <= 0) continue;
      if (stock.est_reporte) continue;     // Déjà reporté depuis J-2, on n'enchaîne pas les reports

      const duree = dureeMap.get(stock.produit_id)
        ?? DUREE_CONSERVATION_PAR_CATEGORIE[stock.categorie as string]
        ?? 1;

      // duree = 1 → non reportable
      // duree = 2 → reportable 1 jour (J+1 = aujourd'hui)
      // duree = 3 → reportable 2 jours (J+1 et J+2)
      if (duree <= 1) continue;

      const joursRestants = duree - 1; // Jours encore consommables après J original

      reports.set(stock.produit_id, {
        quantite:      stock.stock_final,
        joursRestants,
        produitNom:    stock.produit_nom,
        produitEmoji:  stock.produit_emoji ?? '🥖',
        categorie:     stock.categorie ?? 'patisserie',
      });
    }
  } catch (err) {
    // Non bloquant — si ça échoue, on continue sans les reports
    console.warn('[getReportsVeille]', err);
  }

  return reports;
}

// ── GET ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const auth = await getBoulangerieId(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const boulangerieId = auth.id;
    const today = getTodayInTimezone(auth.timezone);

    // Journée du jour
    const { data: journee, error } = await admin
      .from('journees')
      .select('*, stocks_journaliers(*)')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[/api/boulanger/journee GET]', error);
      return NextResponse.json({ error: 'Erreur chargement journée' }, { status: 500 });
    }

    // Charger les reports de J-1 (non bloquant)
    const reportsVeille = await getReportsVeille(admin, boulangerieId, auth.timezone);

    // Enrichir les stocks_journaliers avec les infos de report
    const journeeEnrichie = journee
      ? {
          ...journee,
          stocks_journaliers: (journee.stocks_journaliers ?? []).map((s: Record<string, unknown>) => ({
            ...s,
            report_veille:  reportsVeille.get(s.produit_id as string)?.quantite ?? 0,
            est_reporte:    s.est_reporte ?? false,
          })),
          // Injecter les reports de J-1 non encore dans cette journée
          // (produits reportables mais pas encore dans stocks_journaliers)
          reports_veille_disponibles: Object.fromEntries(reportsVeille),
        }
      : null;

    // Si pas de journée aujourd'hui, retourner quand même les reports disponibles
    const response = {
      journee: journeeEnrichie,
      reports_veille: reportsVeille.size > 0
        ? Object.fromEntries(
            [...reportsVeille.entries()].map(([id, info]) => [id, info])
          )
        : {},
    };

    return NextResponse.json(response);

  } catch (err) {
    console.error('[/api/boulanger/journee GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const auth = await getBoulangerieId(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const boulangerieId = auth.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const { stocks, commandesOnline } = body as {
      stocks: StockEntry[];
      commandesOnline: number;
    };

    if (!stocks || !Array.isArray(stocks)) {
      return NextResponse.json({ error: 'stocks requis (tableau)' }, { status: 400 });
    }

    const commandesOnlineSafe = Math.max(0, Math.min(Math.floor(Number(commandesOnline) || 0), 9999));

    const stocksSafe = stocks.map(s => ({
      ...s,
      production:     Math.max(0, Math.min(Math.floor(Number(s.production)       || 0), 99999)),
      snapshot10h:    Math.max(0, Math.min(Math.floor(Number(s.snapshot10h)      || 0), 99999)),
      snapshot14h:    Math.max(0, Math.min(Math.floor(Number(s.snapshot14h)      || 0), 99999)),
      stockFinal:     Math.max(0, Math.min(Math.floor(Number(s.stockFinal)       || 0), 99999)),
      reportVeille:   Math.max(0, Math.min(Math.floor(Number(s.reportVeille)     || 0), 99999)),
      prixVente:      Math.max(0, Math.min(Math.round(Number(s.prixVente)        * 100) / 100, 9999.99)),
      coutProduction: Math.max(0, Math.min(Math.round(Number(s.coutProduction)   * 100) / 100, 9999.99)),
    }));

    const today = getTodayInTimezone(auth.timezone);

    // La production totale inclut le report pour le CA estimé
    // mais l'invendu est calculé sur le total disponible (production + report)
    const totalProduit     = stocksSafe.reduce((s, p) => s + p.production, 0);
    const totalDisponible  = stocksSafe.reduce((s, p) => s + p.production + (p.reportVeille ?? 0), 0);
    const totalInvendu     = stocksSafe.reduce((s, p) => s + p.stockFinal, 0);
    const caEstime         = stocksSafe.reduce(
      (s, p) => s + (p.production + (p.reportVeille ?? 0) - p.stockFinal) * p.prixVente, 0
    );
    const tauxInvendu      = totalDisponible > 0
      ? parseFloat(((totalInvendu / totalDisponible) * 100).toFixed(2))
      : 0;

    const { data: journee, error: journeeError } = await admin
      .from('journees')
      .upsert(
        {
          boulangerie_id:   boulangerieId,
          date:             today,
          commandes_online: commandesOnlineSafe,
          ca_estime:        parseFloat(Math.min(caEstime, 999999.99).toFixed(2)),
          taux_invendu:     tauxInvendu,
          total_produit:    totalProduit,
          total_invendu:    totalInvendu,
        },
        { onConflict: 'boulangerie_id,date' }
      )
      .select()
      .single();

    if (journeeError || !journee) {
      console.error('[/api/boulanger/journee POST] journee upsert:', journeeError);
      return NextResponse.json({ error: 'Erreur sauvegarde journée' }, { status: 500 });
    }

    const CATEGORIES_VALIDES = ['boulangerie', 'viennoiserie', 'patisserie', 'sandwich'];

    const stocksToUpsert = stocksSafe.map((s) => ({
      journee_id:        journee.id,
      boulangerie_id:    boulangerieId,
      produit_id:        s.id,
      produit_nom:       String(s.name).slice(0, 150),
      produit_emoji:     String(s.emoji).slice(0, 4),
      categorie:         CATEGORIES_VALIDES.includes(s.category) ? s.category : 'boulangerie',
      prix_vente:        s.prixVente,
      cout_production:   s.coutProduction,
      production:        s.production,
      snapshot_10h:      s.snapshot10h,
      snapshot_10h_done: !!s.snapshot10hDone,
      snapshot_14h:      s.snapshot14h,
      snapshot_14h_done: !!s.snapshot14hDone,
      stock_final:       s.stockFinal,
      // ── Report inter-journées ─────────────────────────────
      report_veille:     s.reportVeille ?? 0,
      est_reporte:       s.estReporte ?? false,
    }));

    const { error: stocksError } = await admin
      .from('stocks_journaliers')
      .upsert(stocksToUpsert, { onConflict: 'journee_id,produit_id' });

    if (stocksError) {
      console.error('[/api/boulanger/journee POST] stocks upsert:', stocksError);
      return NextResponse.json({ error: 'Erreur sauvegarde stocks' }, { status: 500 });
    }

    return NextResponse.json({ success: true, journee_id: journee.id });

  } catch (err) {
    console.error('[/api/boulanger/journee POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── PUT — Clôture ────────────────────────────────────────────
// Clôture la journée du jour et prépare le roll-over des invendus
// pour le lendemain (produits avec duree_conservation > 1).

export async function PUT(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const auth = await getBoulangerieId(req);
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const boulangerieId = auth.id;
    const today = getTodayInTimezone(auth.timezone);

    const { error } = await admin
      .from('journees')
      .update({ cloturee: true })
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today);

    if (error) {
      return NextResponse.json({ error: 'Erreur clôture journée' }, { status: 500 });
    }

    // ── Roll-over automatique des invendus pour J+1 ──────────
    // Non-bloquant : si ça échoue, la clôture est quand même valide.
    // Le boulanger pourra toujours ajuster manuellement.
    let rolloverCount = 0;
    try {
      // Récupérer les stocks du jour avec invendus
      const { data: journeeData } = await admin
        .from('journees')
        .select('id')
        .eq('boulangerie_id', boulangerieId)
        .eq('date', today)
        .single();

      if (journeeData) {
        const { data: stocks } = await admin
          .from('stocks_journaliers')
          .select('produit_id, produit_nom, produit_emoji, categorie, stock_final, est_reporte, prix_vente, cout_production')
          .eq('journee_id', journeeData.id)
          .gt('stock_final', 0);

        if (stocks && stocks.length > 0) {
          // Récupérer durées de conservation des produits
          const produitIds = stocks.map(s => s.produit_id);
          const { data: produits } = await admin
            .from('produits')
            .select('id, duree_conservation_jours, categorie')
            .in('id', produitIds)
            .eq('boulangerie_id', boulangerieId);

          const dureeMap = new Map<string, number>();
          for (const p of produits ?? []) {
            dureeMap.set(
              p.id,
              p.duree_conservation_jours
                ?? DUREE_CONSERVATION_PAR_CATEGORIE[p.categorie as string]
                ?? 1
            );
          }

          // Calculer la date de demain
          const todayDate = new Date(today + 'T12:00:00');
          todayDate.setDate(todayDate.getDate() + 1);
          const tomorrow = todayDate.toISOString().split('T')[0];

          // Créer ou récupérer la journée de demain
          const { data: journeeDemain } = await admin
            .from('journees')
            .upsert(
              { boulangerie_id: boulangerieId, date: tomorrow },
              { onConflict: 'boulangerie_id,date' }
            )
            .select('id')
            .single();

          if (journeeDemain) {
            const rolloverStocks = [];

            for (const stock of stocks) {
              if (stock.est_reporte) continue; // Pas d'enchaînement J-2 → J-1 → J

              const duree = dureeMap.get(stock.produit_id)
                ?? DUREE_CONSERVATION_PAR_CATEGORIE[stock.categorie as string]
                ?? 1;

              if (duree <= 1) continue; // Non reportable

              rolloverStocks.push({
                journee_id:      journeeDemain.id,
                boulangerie_id:  boulangerieId,
                produit_id:      stock.produit_id,
                produit_nom:     stock.produit_nom,
                produit_emoji:   stock.produit_emoji ?? '🥖',
                categorie:       stock.categorie ?? 'boulangerie',
                prix_vente:      stock.prix_vente ?? 0,
                cout_production: stock.cout_production ?? 0,
                production:      0,
                report_veille:   stock.stock_final,
                est_reporte:     true,
                stock_final:     0,
                snapshot_10h:    0,
                snapshot_10h_done: false,
                snapshot_14h:    0,
                snapshot_14h_done: false,
              });
            }

            if (rolloverStocks.length > 0) {
              await admin
                .from('stocks_journaliers')
                .upsert(rolloverStocks, { onConflict: 'journee_id,produit_id' });

              rolloverCount = rolloverStocks.length;
            }
          }
        }
      }
    } catch (rolloverErr) {
      console.warn('[/api/boulanger/journee PUT] roll-over non-bloquant:', rolloverErr);
    }

    return NextResponse.json({ success: true, rollover: rolloverCount });

  } catch (err) {
    console.error('[/api/boulanger/journee PUT]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}