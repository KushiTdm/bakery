// lib/ai-production-compute.ts
import { analyserImpactMeteo } from './weather';
import type { MeteoComplet } from './weather';

export interface ProduitMinimal {
  id:        string;
  nom:       string;
  emoji:     string;
  categorie: string;
  prix_vente: number;
}

export interface StockRow {
  produit_id:  string;
  production:  number;
  stock_final: number;
}

export interface JourneeHistoRow {
  date:              string;
  stocks_journaliers: StockRow[];
}

export interface ProductionSuggestion {
  produit_id:     string;
  produit_nom:    string;
  qty_suggere:    number;
  qty_min:        number;
  qty_max:        number;
  qty_base:       number;
  variation_pct:  number;
  nb_jours_histo: number;
  facteur_meteo:  number;
  raison_calcul:  string;
}

function getCoeffMeteo(categorie: string, meteo: MeteoComplet | null): number {
  if (!meteo) return 1.0;
  const analyse = analyserImpactMeteo(meteo);
  const cat = analyse.impact_par_categorie;
  const trafic = analyse.facteur_trafic;

  const parseCoeff = (label: string): number => {
    if (label.includes('+20') || label.includes('+15-20')) return 1.18;
    if (label.includes('+15'))  return 1.15;
    if (label.includes('+10-15')) return 1.12;
    if (label.includes('+10'))  return 1.10;
    if (label.includes('+5'))   return 1.05;
    if (label.includes('-30'))  return 0.70;
    if (label.includes('-25'))  return 0.75;
    if (label.includes('-20'))  return 0.80;
    if (label.includes('-15-20')) return 0.82;
    if (label.includes('-15'))  return 0.85;
    if (label.includes('-10'))  return 0.90;
    if (label.includes('-5'))   return 0.95;
    return 1.0;
  };

  // Parse overall traffic factor (e.g. "-25 à -40% fréquentation" → 0.70)
  const parseTrafic = (label: string): number => {
    if (label.includes('-40') || label.includes('-60')) return 0.65;
    if (label.includes('-25') || label.includes('-40')) return 0.72;
    if (label.includes('-20')) return 0.80;
    if (label.includes('-15')) return 0.85;
    if (label.includes('-10')) return 0.90;
    if (label.includes('-8'))  return 0.92;
    if (label.includes('+20')) return 1.20;
    if (label.includes('+15')) return 1.15;
    if (label.includes('+10')) return 1.10;
    if (label.includes('+5'))  return 1.05;
    return 1.0;
  };

  const coeffTrafic = parseTrafic(trafic);
  const catNorm = categorie.toLowerCase();

  let coeffCat: number;
  if (catNorm === 'boulangerie')  coeffCat = parseCoeff(cat.boulangerie);
  else if (catNorm === 'viennoiserie') coeffCat = parseCoeff(cat.viennoiserie);
  else if (catNorm === 'patisserie' || catNorm === 'pâtisserie') coeffCat = parseCoeff(cat.patisserie);
  else if (catNorm === 'sandwich') coeffCat = parseCoeff(cat.sandwich);
  else return 1.0;

  // When overall traffic is significantly down, combine traffic + category shift
  if (coeffTrafic < 0.90) {
    return Math.round(coeffTrafic * coeffCat * 100) / 100;
  }
  return coeffCat;
}

function arrondir(qty: number, categorie: string): number {
  const cat = categorie.toLowerCase();
  if (cat === 'boulangerie') return Math.round(qty / 5) * 5;
  if (cat === 'viennoiserie' || cat === 'patisserie' || cat === 'pâtisserie') {
    return Math.round(qty / 2) * 2;
  }
  return Math.round(qty);
}

export function computeProductionSuggestions(params: {
  produits:      ProduitMinimal[];
  stocksAujourd: StockRow[];
  histoMemeJour: JourneeHistoRow[];
  meteo:         MeteoComplet | null;
  preCommandes:  Record<string, { nom: string; quantite: number }>;
}): ProductionSuggestion[] {
  const { produits, stocksAujourd, histoMemeJour, meteo, preCommandes } = params;

  return produits.map(produit => {
    const stockAuj = stocksAujourd.find(s => s.produit_id === produit.id);
    const productionAuj = stockAuj?.production ?? 0;
    const stockFinalAuj = stockAuj?.stock_final ?? 0;
    const tauxInvenduAuj = productionAuj > 0 ? (stockFinalAuj / productionAuj) * 100 : 0;

    const pointsHisto = histoMemeJour
      .map(j => {
        const s = j.stocks_journaliers.find(s => s.produit_id === produit.id);
        return s && s.production > 0
          ? { production: s.production, taux_invendu: s.production > 0 ? (s.stock_final / s.production) * 100 : 0 }
          : null;
      })
      .filter((x): x is { production: number; taux_invendu: number } => x !== null);

    const nbHisto = pointsHisto.length;

    let qtyBase: number;
    let taux_invendu_moy = tauxInvenduAuj;

    if (nbHisto >= 2) {
      let somme = 0;
      let totalPoids = 0;
      pointsHisto.forEach((p, i) => {
        const poids = nbHisto - i;
        somme += p.production * poids;
        totalPoids += poids;
      });
      qtyBase = somme / totalPoids;
      taux_invendu_moy = pointsHisto.reduce((acc, p) => acc + p.taux_invendu, 0) / nbHisto;
    } else {
      qtyBase = productionAuj;
    }

    let coeffInvendu = 1.0;
    if (taux_invendu_moy > 20)       coeffInvendu = 0.75;
    else if (taux_invendu_moy > 10)  coeffInvendu = 0.88;
    else if (taux_invendu_moy > 5)   coeffInvendu = 0.95;
    if (tauxInvenduAuj === 0 && productionAuj > 0) coeffInvendu = Math.max(coeffInvendu, 1.10);

    const coeffMeteo = getCoeffMeteo(produit.categorie, meteo);

    const qtySuggereRaw = qtyBase * coeffInvendu * coeffMeteo;
    const precoQte = preCommandes[produit.id]?.quantite ?? 0;

    const qtySuggere = arrondir(Math.max(qtySuggereRaw, precoQte), produit.categorie);
    const qtyMin     = Math.max(arrondir(qtySuggereRaw * 0.88, produit.categorie), precoQte);
    const qtyMax     = arrondir(qtySuggereRaw * 1.12, produit.categorie);
    const qtyBaseArr = arrondir(qtyBase, produit.categorie);

    const variation = qtyBaseArr > 0 ? Math.round(((qtySuggere - qtyBaseArr) / qtyBaseArr) * 100) : 0;

    const baseLabel  = nbHisto >= 2 ? `moy ${nbHisto} sem=${qtyBaseArr}` : `fallback_auj=${qtyBaseArr}`;
    const invenduLbl = coeffInvendu !== 1.0 ? ` inv${taux_invendu_moy.toFixed(0)}%→${Math.round((coeffInvendu - 1) * 100)}%` : '';
    const meteoLbl   = coeffMeteo !== 1.0 ? ` meteo${Math.round((coeffMeteo - 1) * 100)}%` : '';
    const precoLbl   = precoQte > 0 ? ` +${precoQte}préco` : '';
    const raison = `${baseLabel}${invenduLbl}${meteoLbl}${precoLbl}`.slice(0, 80);

    return {
      produit_id:     produit.id,
      produit_nom:    produit.nom,
      qty_suggere:    Math.max(0, qtySuggere),
      qty_min:        Math.max(0, qtyMin),
      qty_max:        Math.max(0, qtyMax),
      qty_base:       Math.max(0, qtyBaseArr),
      variation_pct:  variation,
      nb_jours_histo: nbHisto,
      facteur_meteo:  coeffMeteo,
      raison_calcul:  raison,
    };
  });
}
