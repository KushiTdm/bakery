import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

// Statistiques agrégées par jour de la semaine
// Exploite journees.jour_semaine (0=dim..6=sam) + stocks_journaliers + commandes + paniers_flash

export async function GET(req: NextRequest) {
  try {
    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (!canAccess(session, 'dashboard', 'read')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { boulangerieId } = session;

    // 1. Toutes les journées clôturées avec stocks
    const { data: journees, error: jErr } = await admin
      .from('journees')
      .select('id, date, jour_semaine, ca_estime, taux_invendu, total_produit, total_invendu, commandes_online')
      .eq('boulangerie_id', boulangerieId)
      .eq('cloturee', true)
      .not('jour_semaine', 'is', null)
      .order('date', { ascending: true });

    if (jErr) {
      console.error('[stats-semaine] journees error', jErr);
      return NextResponse.json({ error: 'Erreur chargement' }, { status: 500 });
    }

    if (!journees || journees.length === 0) {
      return NextResponse.json({ jours: [], totalJournees: 0 });
    }

    // Collect journee IDs for batch queries
    const journeeIds = journees.map(j => j.id);

    // 2. Stocks journaliers (batch)
    const { data: stocks } = await admin
      .from('stocks_journaliers')
      .select('journee_id, produit_id, produit_nom, produit_emoji, production, stock_final, prix_vente, cout_production')
      .in('journee_id', journeeIds);

    // 3. Commandes (click & collect + anti-gaspi) liées à cette boulangerie
    const { data: commandes } = await admin
      .from('commandes')
      .select('id, type, statut, montant_total, lignes, created_at')
      .eq('boulangerie_id', boulangerieId)
      .in('statut', ['recuperee', 'confirmee', 'prete']);

    // 4. Paniers flash
    const { data: paniers } = await admin
      .from('paniers_flash')
      .select('id, date, produit_nom, produit_emoji, prix_original, prix_flash, quantite_initiale, quantite_restante')
      .eq('boulangerie_id', boulangerieId);

    // Index stocks by journee_id
    const stocksByJournee: Record<string, typeof stocks> = {};
    (stocks ?? []).forEach(s => {
      if (!stocksByJournee[s.journee_id]) stocksByJournee[s.journee_id] = [];
      stocksByJournee[s.journee_id]!.push(s);
    });

    // Index journees by date for command matching
    const journeeByDate: Record<string, (typeof journees)[0]> = {};
    journees.forEach(j => { journeeByDate[j.date] = j; });

    // Group journees by jour_semaine
    const grouped: Record<number, (typeof journees)> = {};
    journees.forEach(j => {
      const dow = j.jour_semaine as number;
      if (!grouped[dow]) grouped[dow] = [];
      grouped[dow]!.push(j);
    });

    // Group commandes by day of week (using created_at date)
    const commandesByDow: Record<number, { clickcollect: number; anti_gaspi: number; cc_montant: number; ag_montant: number }> = {};
    (commandes ?? []).forEach(c => {
      const dateStr = c.created_at.split('T')[0];
      const jEntry = journeeByDate[dateStr];
      if (!jEntry || jEntry.jour_semaine == null) return;
      const dow = jEntry.jour_semaine as number;
      if (!commandesByDow[dow]) commandesByDow[dow] = { clickcollect: 0, anti_gaspi: 0, cc_montant: 0, ag_montant: 0 };
      if (c.type === 'clickcollect') {
        commandesByDow[dow]!.clickcollect++;
        commandesByDow[dow]!.cc_montant += Number(c.montant_total) || 0;
      } else {
        commandesByDow[dow]!.anti_gaspi++;
        commandesByDow[dow]!.ag_montant += Number(c.montant_total) || 0;
      }
    });

    // Group paniers flash by day of week
    const paniersByDow: Record<number, { total: number; vendus: number; produits: Record<string, { nom: string; emoji: string; count: number }> }> = {};
    (paniers ?? []).forEach(p => {
      const jEntry = journeeByDate[p.date];
      if (!jEntry || jEntry.jour_semaine == null) return;
      const dow = jEntry.jour_semaine as number;
      if (!paniersByDow[dow]) paniersByDow[dow] = { total: 0, vendus: 0, produits: {} };
      const qtyVendu = (p.quantite_initiale ?? 0) - (p.quantite_restante ?? 0);
      paniersByDow[dow]!.total += p.quantite_initiale ?? 0;
      paniersByDow[dow]!.vendus += qtyVendu;
      const key = p.produit_nom;
      if (!paniersByDow[dow]!.produits[key]) {
        paniersByDow[dow]!.produits[key] = { nom: p.produit_nom, emoji: p.produit_emoji ?? '', count: 0 };
      }
      paniersByDow[dow]!.produits[key]!.count += qtyVendu;
    });

    // Build stats per day
    const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    const jours = Object.entries(grouped).map(([dowStr, days]) => {
      const dow = parseInt(dowStr);
      const count = days.length;

      // CA stats
      const caValues = days.map(d => Number(d.ca_estime) || 0);
      const avgCA = caValues.reduce((s, v) => s + v, 0) / count;
      const bestCAEntry = days.reduce((best, d) => (Number(d.ca_estime) || 0) > (Number(best.ca_estime) || 0) ? d : best);
      const worstCAEntry = days.reduce((worst, d) => (Number(d.ca_estime) || 0) < (Number(worst.ca_estime) || 0) ? d : worst);

      // Invendu stats
      const invenduRates = days.map(d => Number(d.taux_invendu) || 0);
      const avgInvendu = invenduRates.reduce((s, v) => s + v, 0) / count;

      // Valeur invendus moyenne
      const valeurInvendus = days.map(d => {
        const dayStocks = stocksByJournee[d.id] ?? [];
        return dayStocks.reduce((s, st) => s + (st.stock_final ?? 0) * (Number(st.prix_vente) || 0), 0);
      });
      const avgValeurInvendus = valeurInvendus.reduce((s, v) => s + v, 0) / count;

      // Produits : agrégation ventes et invendus
      const productStats: Record<string, {
        nom: string; emoji: string;
        totalProduction: number; totalVendu: number; totalInvendu: number;
        apparitions: number;
      }> = {};

      days.forEach(d => {
        const dayStocks = stocksByJournee[d.id] ?? [];
        dayStocks.forEach(st => {
          if (!productStats[st.produit_id]) {
            productStats[st.produit_id] = {
              nom: st.produit_nom, emoji: st.produit_emoji ?? '',
              totalProduction: 0, totalVendu: 0, totalInvendu: 0, apparitions: 0,
            };
          }
          const ps = productStats[st.produit_id]!;
          ps.totalProduction += st.production ?? 0;
          ps.totalInvendu += st.stock_final ?? 0;
          ps.totalVendu += Math.max(0, (st.production ?? 0) - (st.stock_final ?? 0));
          ps.apparitions++;
        });
      });

      const products = Object.entries(productStats).map(([id, p]) => ({
        id,
        ...p,
        avgVendu: p.apparitions > 0 ? p.totalVendu / p.apparitions : 0,
        avgInvendu: p.apparitions > 0 ? p.totalInvendu / p.apparitions : 0,
        tauxInvendu: p.totalProduction > 0 ? (p.totalInvendu / p.totalProduction) * 100 : 0,
      }));

      const meilleuresVentes = [...products].sort((a, b) => b.avgVendu - a.avgVendu).slice(0, 5);
      const piresVentes = [...products].sort((a, b) => a.avgVendu - b.avgVendu).slice(0, 5);

      // Commandes stats
      const cmdStats = commandesByDow[dow] ?? { clickcollect: 0, anti_gaspi: 0, cc_montant: 0, ag_montant: 0 };
      const totalCommandes = cmdStats.clickcollect + cmdStats.anti_gaspi;
      const txClickCollect = totalCommandes > 0 ? (cmdStats.clickcollect / totalCommandes) * 100 : 0;
      const txAntiGaspi = totalCommandes > 0 ? (cmdStats.anti_gaspi / totalCommandes) * 100 : 0;

      // Paniers flash stats
      const pStats = paniersByDow[dow] ?? { total: 0, vendus: 0, produits: {} };
      const txVentePaniers = pStats.total > 0 ? (pStats.vendus / pStats.total) * 100 : 0;
      const compositionPaniers = Object.values(pStats.produits)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      return {
        jour_semaine: dow,
        nom: JOURS_FR[dow],
        count,
        // Card data
        avgCA: Math.round(avgCA),
        avgInvendu: Math.round(avgInvendu * 10) / 10,
        avgValeurInvendus: Math.round(avgValeurInvendus),
        // Detail data
        bestCA: { montant: Math.round(Number(bestCAEntry.ca_estime) || 0), date: bestCAEntry.date },
        worstCA: { montant: Math.round(Number(worstCAEntry.ca_estime) || 0), date: worstCAEntry.date },
        meilleuresVentes,
        piresVentes,
        // Commandes
        commandesTotal: totalCommandes,
        commandesMoyennes: count > 0 ? Math.round((totalCommandes / count) * 10) / 10 : 0,
        txClickCollect: Math.round(txClickCollect * 10) / 10,
        txAntiGaspi: Math.round(txAntiGaspi * 10) / 10,
        caMoyenClickCollect: count > 0 ? Math.round(cmdStats.cc_montant / count) : 0,
        // Paniers anti-gaspi
        txVentePaniers: Math.round(txVentePaniers * 10) / 10,
        compositionPaniers,
        totalPaniersProposés: pStats.total,
        totalPaniersVendus: pStats.vendus,
      };
    }).sort((a, b) => {
      // Ordre lundi(1) → dimanche(0 en fin)
      const order = (d: number) => d === 0 ? 7 : d;
      return order(a.jour_semaine) - order(b.jour_semaine);
    });

    return NextResponse.json({ jours, totalJournees: journees.length });

  } catch (err) {
    console.error('[stats-semaine]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
