// lib/ai-anonymize.ts — Levain, l'assistant IA du boulanger Sauve Mie
// ─────────────────────────────────────────────────────────────────────
// ✅ DONNÉES RÉELLES — Noms de produits transmis en clair à l'IA
// ✅ L'IA reçoit les quantités de base réelles pour calculer des prévisions précises
// ✅ Retour par produit_id UUID (stable) au lieu de produit_index (fragile)
// ✅ Météo, commandes, clients, événements intégrés
// ─────────────────────────────────────────────────────────────────────

import { analyserImpactMeteo } from './weather';
import type { MeteoComplet, ImpactParCategorie } from './weather';

// ── Types entrée ──────────────────────────────────────────────

export interface StockJournalierRaw {
  produit_id: string; produit_nom: string; produit_emoji: string; categorie: string;
  production: number; snapshot_10h: number; snapshot_10h_done: boolean;
  snapshot_14h: number; snapshot_14h_done: boolean; stock_final: number;
  prix_vente: number; cout_production: number;
}
export interface JourneeRaw {
  date: string; ca_estime: number; taux_invendu: number; total_produit: number;
  total_invendu: number; commandes_online: number; stocks_journaliers: StockJournalierRaw[];
}
export interface ProduitRaw {
  id: string; nom: string; emoji: string; categorie: string;
  prix_vente: number; cout_production?: number;
}

// ── Types pour les nouvelles analyses ─────────────────────────

export interface CommandeRaw {
  id: string;
  type: 'click_collect' | 'anti_gaspi';
  client_prenom: string | null;
  client_email: string;
  montant_total: number;
  statut: string;
  heure_retrait: string | null;
  created_at: string;
  lignes?: { produit_nom: string; quantite: number; prix_unitaire: number }[];
}

export interface PanierFlashRaw {
  id: string;
  produit_nom: string;
  categorie: string;
  quantite: number;
  prix_final: number;
  remise_pct: number;
  vendu: boolean;
}

export interface ClientProfilRaw {
  id: string;
  created_at: string;
  nb_commandes: number;
  total_depense: number;
}

// ── Types recettes matières premières ────────────────────────

export interface RecetteProduit {
  farine_g: number;
  beurre_g: number;
  oeufs_n: number;
  sucre_g: number;
  sel_g: number;
  levure_boulangere_g: number;
  levain_g: number;
  eau_ml: number;
  lait_ml: number;
  chocolat_g: number;
  huile_ml: number;
  creme_g: number;
  source: 'manual' | 'auto' | 'default';
}

/** key = produit_id UUID */
export type RecipeMap = Map<string, RecetteProduit>;

// ── Types payload enrichi ─────────────────────────────────────

export interface DonneesProduitEnrichies {
  produit_id: string;  // UUID stable pour le mapping retour IA
  index: number;
  nom: string;
  categorie: string;
  emoji: string;
  production: number;
  snapshot_10h: number | null;
  snapshot_14h: number | null;
  invendu: number;
  taux_invendu: number;
  taux_vente: number;
  ca_contribution: number;
  performance: 'excellent' | 'bon' | 'moyen' | 'faible';
  mp_farine_g: number;
  mp_beurre_g: number;
  mp_oeufs_n: number;
  mp_sucre_g: number;
  mp_sel_g: number;
  mp_eau_ml: number;
  mp_lait_ml: number;
  mp_chocolat_g: number;
}

export interface DonneesJourneeEnrichies {
  jour_semaine: string;
  jour_semaine_en: string;
  semaine_annee: number;
  est_weekend: boolean;
  ca_estime: number;
  taux_invendu: number;
  total_produit: number;
  total_invendu: number;
  commandes_online: number;
  produits: DonneesProduitEnrichies[];
  total_mp: {
    farine_kg: number;
    beurre_kg: number;
    oeufs: number;
    sucre_kg: number;
    sel_kg: number;
    eau_l: number;
    lait_l: number;
    chocolat_kg: number;
  };
}

export interface DonneesHistoriqueEnrichies {
  jour_semaine: string;
  est_weekend: boolean;
  ca: number;
  taux_invendu: number;
  total_produit: number;
  total_invendu: number;
  commandes_online: number;
}

export interface DonneesCommandes {
  click_collect: {
    nb_commandes: number;
    ca_total: number;
    panier_moyen: number;
    taux_recupere: number;
    top_produits: { nom: string; quantite: number }[];
    heures_pointe: string[];
  };
  anti_gaspi: {
    nb_paniers: number;
    ca_genere: number;
    invendus_ecartes: number;
    taux_vente: number;
  };
}

export interface DonneesClients {
  nouveaux_clients_jour: number;
  nouveaux_clients_semaine: number;
  nouveaux_clients_mois: number;
  total_clients: number;
  clients_actifs: number;
  retention_30j: number;
}

export interface DonneesMeteo {
  actuelle: { temperature: number; ressenti: number; humidite: number; precipitations: number; description: string; icone: string };
  demain:   { temp_max: number; temp_min: number; precipitations: number; description: string; icone: string };
  impact:   { global: string; conseils: string[]; facteur_trafic: string; par_categorie: ImpactParCategorie };
}

export interface DonneesEvenements {
  vacances_scolaires: boolean;
  vacances_zone: string | null;
  fete_nationale: boolean;
  fete_nom: string | null;
  evenements_locaux: string[];
  jour_ferie: boolean;
}

// ── Catalogue enrichi pour l'IA ───────────────────────────────
// Inclut les données nécessaires pour calculer des prévisions précises

export interface CatalogueEntree {
  produit_id: string;   // UUID — utilisé dans le retour IA pour éviter les index fragiles
  index: number;
  nom: string;
  categorie: string;
  emoji: string;
  prix_vente: number;
  quantite_produite_hier: number;       // base de calcul pour demain
  taux_vente_hier: number;              // % vendu aujourd'hui
  invendu_hier: number;                 // pièces invendues aujourd'hui
  moy_meme_jour: number | null;         // moyenne des mêmes jours de semaine (null si pas d'histo)
}

export interface PayloadEnrichi {
  journee:        DonneesJourneeEnrichies;
  demain_info:    { jour_semaine: string; est_weekend: boolean; jour_semaine_en: string; date: string };
  historique_14j: DonneesHistoriqueEnrichies[];
  histo_meme_jour: DonneesHistoriqueEnrichies[];
  nb_jours_histo: number;
  catalogue:      CatalogueEntree[];   // enrichi avec quantités réelles
  meteo?:         DonneesMeteo;
  commandes?:     DonneesCommandes;
  clients?:       DonneesClients;
  evenements?:    DonneesEvenements;
  performance_globale: {
    score_jour: number;
    tendance_vs_hier: number;
    tendance_vs_meme_jour: number;
    top_succes: { nom: string; emoji: string; taux_vente: number }[];
    flops: { nom: string; emoji: string; taux_invendu: number }[];
  };
  // New fields for pre-computed production suggestions (Task 4/5)
  suggestions_algo?:    import('./ai-production-compute').ProductionSuggestion[];
  histo_meme_jour_raw?: { date: string; stocks_journaliers: { produit_id: string; production: number; stock_final: number }[] }[];
}

// ── Coefficients matières premières ──────────────────────────
const COEFFS_MP: Record<string, { farine_g: number; beurre_g: number; oeufs_n: number; sucre_g: number }> = {
  boulangerie:  { farine_g: 180, beurre_g: 0,  oeufs_n: 0,   sucre_g: 3  },
  viennoiserie: { farine_g: 50,  beurre_g: 28, oeufs_n: 0.3, sucre_g: 8  },
  patisserie:   { farine_g: 40,  beurre_g: 25, oeufs_n: 1,   sucre_g: 20 },
  sandwich:     { farine_g: 60,  beurre_g: 5,  oeufs_n: 0,   sucre_g: 0  },
};

// ── Résolution recette : recipeMap > COEFFS_MP (fallback) ────
function resolveRecipe(
  produitId: string,
  categorie: string,
  recipeMap?: RecipeMap,
): RecetteProduit & { farine_g: number; beurre_g: number; oeufs_n: number; sucre_g: number } {
  if (recipeMap?.has(produitId)) return recipeMap.get(produitId)!;
  const c = COEFFS_MP[categorie] ?? COEFFS_MP.boulangerie;
  return {
    farine_g: c.farine_g, beurre_g: c.beurre_g, oeufs_n: c.oeufs_n, sucre_g: c.sucre_g,
    sel_g: 0, levure_boulangere_g: 0, levain_g: 0, eau_ml: 0,
    lait_ml: 0, chocolat_g: 0, huile_ml: 0, creme_g: 0,
    source: 'default',
  };
}

// ── Fuzzy matching : Dice coefficient sur bigrammes ───────────
// Robuste pour les noms français avec accents et variantes partielles.
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };
  const aB = bigrams(a.toLowerCase());
  const bB = bigrams(b.toLowerCase());
  let intersection = 0;
  for (const [bg, count] of aB) {
    intersection += Math.min(count, bB.get(bg) ?? 0);
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

export function findBestTemplateMatch(
  productName: string,
  templateMap: Map<string, RecetteProduit>,
  threshold = 0.80,
): RecetteProduit | null {
  let bestScore = 0;
  let bestMatch: RecetteProduit | null = null;
  for (const [name, recipe] of templateMap) {
    const score = diceCoefficient(productName, name);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = recipe;
    }
  }
  return bestMatch;
}

// ── Utilitaires dates & timezone ─────────────────────────────

const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const JOURS_EN = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

export function getTodayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

function getDayOfWeekInTimezone(dateStr: string, timezone: string): number {
  const date = new Date(dateStr + 'T12:00:00');
  const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(date);
  const map: Record<string, number> = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
  return map[dayStr] ?? date.getDay();
}

function getTomorrowDate(todayStr: string): string {
  const d = new Date(todayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

// ── Détection des événements ─────────────────────────────────

// Calcul de Pâques par l'algorithme de Meeus (Gauss amélioré)
function calculerPaques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

// Nième jour de semaine d'un mois (ex: 3e dimanche de mai)
function getNiemeJourSemaine(annee: number, mois: number, jourSemaine: number, n: number): Date {
  const premier = new Date(annee, mois - 1, 1);
  let decalage = (jourSemaine - premier.getDay() + 7) % 7;
  const jour = 1 + decalage + (n - 1) * 7;
  return new Date(annee, mois - 1, jour);
}

// Dernier jour de semaine d'un mois (ex: dernier dimanche de mai)
function getDernierJourSemaine(annee: number, mois: number, jourSemaine: number): Date {
  const dernier = new Date(annee, mois, 0); // dernier jour du mois
  const decalage = (dernier.getDay() - jourSemaine + 7) % 7;
  return new Date(annee, mois - 1, dernier.getDate() - decalage);
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function detecterEvenements(date: string): DonneesEvenements {
  const d = new Date(date + 'T12:00:00');
  const annee = d.getFullYear();
  const mois = d.getMonth() + 1;
  const jour = d.getDate();
  const jourSemaine = d.getDay();

  const vacancesHiver     = (mois === 2 && jour >= 10 && jour <= 26);
  const vacancesPrintemps = (mois === 4 && jour >= 8  && jour <= 25);
  const vacancesEte       = (mois >= 7 && mois <= 8);
  const vacancesToussaint = (mois === 10 && jour >= 18 && jour <= 31);
  const vacancesNoel      = (mois === 12 && jour >= 20) || (mois === 1 && jour <= 5);
  const vacances_scolaires = vacancesHiver || vacancesPrintemps || vacancesEte || vacancesToussaint || vacancesNoel;

  // Jours fériés fixes
  const fetes: { mois: number; jour: number; nom: string }[] = [
    { mois: 1,  jour: 1,  nom: "Jour de l'An" },
    { mois: 5,  jour: 1,  nom: "Fête du Travail" },
    { mois: 5,  jour: 8,  nom: "Victoire 1945" },
    { mois: 7,  jour: 14, nom: "Fête Nationale" },
    { mois: 8,  jour: 15, nom: "Assomption" },
    { mois: 11, jour: 1,  nom: "Toussaint" },
    { mois: 11, jour: 11, nom: "Armistice 1918" },
    { mois: 12, jour: 25, nom: "Noël" },
  ];

  // Jours fériés mobiles (basés sur Pâques)
  const paques = calculerPaques(annee);
  const lundiPaques = new Date(paques); lundiPaques.setDate(paques.getDate() + 1);
  const ascension = new Date(paques); ascension.setDate(paques.getDate() + 39);
  const lundiPentecote = new Date(paques); lundiPentecote.setDate(paques.getDate() + 50);

  const feteDuJour = fetes.find(f => f.mois === mois && f.jour === jour);
  let jour_ferie = !!feteDuJour;
  let fete_nom = feteDuJour?.nom ?? null;

  if (isSameDay(d, lundiPaques))     { jour_ferie = true; fete_nom = 'Lundi de Pâques'; }
  if (isSameDay(d, ascension))       { jour_ferie = true; fete_nom = 'Ascension'; }
  if (isSameDay(d, lundiPentecote))  { jour_ferie = true; fete_nom = 'Lundi de Pentecôte'; }

  // Détection de pont (veille ou lendemain d'un jour férié)
  const demain = new Date(d); demain.setDate(d.getDate() + 1);
  const hier = new Date(d); hier.setDate(d.getDate() - 1);
  const estVeilleFerie = fetes.some(f => demain.getMonth() + 1 === f.mois && demain.getDate() === f.jour)
    || isSameDay(demain, lundiPaques) || isSameDay(demain, ascension) || isSameDay(demain, lundiPentecote);
  const estLendemainFerie = fetes.some(f => hier.getMonth() + 1 === f.mois && hier.getDate() === f.jour)
    || isSameDay(hier, lundiPaques) || isSameDay(hier, ascension) || isSameDay(hier, lundiPentecote);

  // Événements commerciaux spécifiques boulangerie
  const evenements_locaux: string[] = [];

  // Week-end
  if (jourSemaine === 6 || jourSemaine === 0) {
    evenements_locaux.push('Week-end — affluence habituelle +20-40%');
  }

  // Pont
  if (!jour_ferie && (estVeilleFerie || estLendemainFerie)) {
    evenements_locaux.push('⚡ Pont probable — hausse fréquentation +20-35%, achats anticipés');
  }

  // Galette des Rois (tout janvier + 1er week-end de janvier = pic)
  if (mois === 1) {
    if (jour <= 7 && (jourSemaine === 0 || jourSemaine === 6)) {
      evenements_locaux.push('👑 Épiphanie — PIC galettes des Rois (+++ CA). Production massive galettes.');
    } else if (jour >= 1 && jour <= 31) {
      evenements_locaux.push('👑 Saison galettes des Rois — 15-40% du CA mensuel. Proposer galettes frangipane/pommes.');
    }
  }

  // Chandeleur
  if (mois === 2 && jour === 2) {
    evenements_locaux.push('🥞 Chandeleur — proposer kits crêpes, pâte à crêpes, produits associés.');
  }

  // Saint-Valentin
  if (mois === 2 && jour >= 10 && jour <= 14) {
    const daysLeft = 14 - jour;
    evenements_locaux.push(daysLeft === 0
      ? '❤️ Saint-Valentin — Gâteaux personnalisés, cœurs en pâtisserie. Hausse pâtisserie fine.'
      : `❤️ Saint-Valentin dans ${daysLeft}j — anticiper commandes gâteaux personnalisés.`);
  }

  // Mardi Gras (47 jours avant Pâques)
  const mardiGras = new Date(paques); mardiGras.setDate(paques.getDate() - 47);
  if (isSameDay(d, mardiGras)) {
    evenements_locaux.push('🎭 Mardi Gras — Forte demande beignets, bugnes, merveilles, gaufres (+++)');
  }

  // Fête des Grands-Mères (1er dimanche de mars)
  const feteGrandsMeres = getNiemeJourSemaine(annee, 3, 0, 1);
  if (isSameDay(d, feteGrandsMeres)) {
    evenements_locaux.push('👵 Fête des Grands-Mères — Gâteaux traditionnels, commandes spéciales.');
  }

  // Pâques (semaine pascale)
  const debutSemainePascale = new Date(paques); debutSemainePascale.setDate(paques.getDate() - 7);
  if (d >= debutSemainePascale && d <= lundiPaques) {
    evenements_locaux.push('🐣 Semaine de Pâques — Hausse brioches, pains tressés, chocolats +15-25%.');
  }

  // Fête des Mères (dernier dimanche de mai)
  const feteMeres = getDernierJourSemaine(annee, 5, 0);
  // Si ça tombe le jour de Pentecôte, c'est reporté au 1er dimanche de juin
  const feteMeresEffective = isSameDay(feteMeres, lundiPentecote) || (lundiPentecote.getDate() - 1 === feteMeres.getDate() && lundiPentecote.getMonth() === feteMeres.getMonth())
    ? getNiemeJourSemaine(annee, 6, 0, 1)
    : feteMeres;
  if (isSameDay(d, feteMeresEffective)) {
    evenements_locaux.push('💐 Fête des Mères — PIC gâteaux commandes, entremets, fraisiers (+++)');
  } else {
    const joursAvant = Math.round((feteMeresEffective.getTime() - d.getTime()) / 86400000);
    if (joursAvant > 0 && joursAvant <= 3) {
      evenements_locaux.push(`💐 Fête des Mères dans ${joursAvant}j — anticiper commandes gâteaux.`);
    }
  }

  // Fête des Pères (3e dimanche de juin)
  const fetePeres = getNiemeJourSemaine(annee, 6, 0, 3);
  if (isSameDay(d, fetePeres)) {
    evenements_locaux.push('👔 Fête des Pères — Commandes gâteaux, pâtisseries.');
  } else {
    const joursAvant = Math.round((fetePeres.getTime() - d.getTime()) / 86400000);
    if (joursAvant > 0 && joursAvant <= 3) {
      evenements_locaux.push(`👔 Fête des Pères dans ${joursAvant}j — anticiper commandes gâteaux.`);
    }
  }

  // 14 Juillet
  if (mois === 7 && jour === 14) {
    evenements_locaux.push('🇫🇷 Fête Nationale — pique-niques, sandwichs, pain. Fréquentation familiale.');
  }

  // Saint-Nicolas (nord/est de la France)
  if (mois === 12 && jour === 6) {
    evenements_locaux.push('🎅 Saint-Nicolas — Mannalas, pains d\'épices, pains spéciaux (impact fort nord/est).');
  }

  // Période avant Noël
  if (mois === 12 && jour >= 15 && jour <= 24) {
    evenements_locaux.push('🎄 Période pré-Noël — Bûches (réservations), pains d\'épices, sablés, bredele. CA +30-60%.');
  }

  // Réveillon
  if (mois === 12 && jour === 31) {
    evenements_locaux.push('🥂 Réveillon du Nouvel An — Produits festifs, pains spéciaux, pâtisseries de fête.');
  }

  // Beaujolais Nouveau (3e jeudi de novembre)
  const beaujolais = getNiemeJourSemaine(annee, 11, 4, 3);
  if (isSameDay(d, beaujolais)) {
    evenements_locaux.push('🍷 Beaujolais Nouveau — impact neutre en boulangerie, convivialité ambiante.');
  }

  // Rentrée scolaire (début septembre)
  if (mois === 9 && jour >= 1 && jour <= 5) {
    evenements_locaux.push('📚 Rentrée scolaire — Forte reprise. Retour goûters 16h30, snacking bureau. Excellent.');
  }

  // Contexte saisonnier mensuel
  if (mois === 1 && jour > 5) evenements_locaux.push('❄️ Janvier post-fêtes — budgets contraints, résolutions. Mois structurellement faible hors galettes.');
  if (mois === 6) evenements_locaux.push('☀️ Juin — Fin d\'année scolaire, fêtes de village. Sandwichs et produits frais dominent.');
  if (mois === 11 && jour > 11) evenements_locaux.push('🌫️ Novembre — Temps gris, journées courtes. Miser sur les viennoiseries réconfort.');

  return {
    vacances_scolaires,
    vacances_zone: vacances_scolaires ? 'A/B/C' : null,
    fete_nationale: jour_ferie,
    fete_nom: fete_nom,
    evenements_locaux,
    jour_ferie,
  };
}

// ── Fonction principale d'enrichissement ────────────────────

export function anonymiserDonnees(
  journee:      JourneeRaw,
  historique:   JourneeRaw[],
  produits:     ProduitRaw[],
  timezone:     string = 'Europe/Paris',
  meteoComplet?: MeteoComplet | null,
  commandes?:   CommandeRaw[],
  paniersFlash?: PanierFlashRaw[],
  clients?:     ClientProfilRaw[],
  recipeMap?:   RecipeMap,
): PayloadEnrichi {

  const today      = journee.date;
  const jourIdx    = getDayOfWeekInTimezone(today, timezone);
  const jourFr     = JOURS_FR[jourIdx];
  const jourEn     = JOURS_EN[jourIdx];
  const estWeekend = jourIdx === 0 || jourIdx === 6;

  const startOfYear = new Date(today.substring(0, 4) + '-01-01T12:00:00');
  const todayDate   = new Date(today + 'T12:00:00');
  const semaine     = Math.ceil(((todayDate.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

  const demainDate = getTomorrowDate(today);
  const demainIdx  = getDayOfWeekInTimezone(demainDate, timezone);
  const demainFr   = JOURS_FR[demainIdx];
  const demainEn   = JOURS_EN[demainIdx];
  const demainWE   = demainIdx === 0 || demainIdx === 6;

  // ── Produits enrichis ──────────────────────────────────────
  let tF = 0, tB = 0, tO = 0, tS = 0, tSel = 0, tEau = 0, tLait = 0, tChoc = 0;

  const produitsEnrichis: DonneesProduitEnrichies[] = (journee.stocks_journaliers ?? []).map((s, i) => {
    const idx = i + 1;
    const c   = resolveRecipe(s.produit_id, s.categorie, recipeMap);
    const f   = Math.round(s.production * c.farine_g);
    const b   = Math.round(s.production * c.beurre_g);
    const o   = Math.round(s.production * c.oeufs_n * 10) / 10;
    const su  = Math.round(s.production * c.sucre_g);
    const se  = Math.round(s.production * (c.sel_g ?? 0));
    const ea  = Math.round(s.production * (c.eau_ml ?? 0));
    const la  = Math.round(s.production * (c.lait_ml ?? 0));
    const ch  = Math.round(s.production * (c.chocolat_g ?? 0));
    tF += f; tB += b; tO += o; tS += su; tSel += se; tEau += ea; tLait += la; tChoc += ch;

    const tauxVente   = s.production > 0 ? ((s.production - s.stock_final) / s.production) * 100 : 0;
    const tauxInvendu = s.production > 0 ? (s.stock_final / s.production) * 100 : 0;

    let performance: 'excellent' | 'bon' | 'moyen' | 'faible';
    if (tauxVente >= 95)      performance = 'excellent';
    else if (tauxVente >= 85) performance = 'bon';
    else if (tauxVente >= 70) performance = 'moyen';
    else                      performance = 'faible';

    return {
      produit_id:      s.produit_id,
      index:           idx,
      nom:             s.produit_nom,
      categorie:       s.categorie,
      emoji:           s.produit_emoji,
      production:      s.production,
      snapshot_10h:    s.snapshot_10h_done ? s.snapshot_10h : null,
      snapshot_14h:    s.snapshot_14h_done ? s.snapshot_14h : null,
      invendu:         s.stock_final,
      taux_invendu:    Math.round(tauxInvendu * 10) / 10,
      taux_vente:      Math.round(tauxVente * 10) / 10,
      ca_contribution: Math.round((s.production - s.stock_final) * s.prix_vente),
      performance,
      mp_farine_g: f, mp_beurre_g: b, mp_oeufs_n: o, mp_sucre_g: su,
      mp_sel_g: se, mp_eau_ml: ea, mp_lait_ml: la, mp_chocolat_g: ch,
    } satisfies DonneesProduitEnrichies;
  });

  // ── Historique général (14j) ───────────────────────────────
  const histoEnrichi: DonneesHistoriqueEnrichies[] = (historique ?? []).slice(0, 14).map(j => {
    const jIdx = getDayOfWeekInTimezone(j.date, timezone);
    return {
      jour_semaine:     JOURS_FR[jIdx],
      est_weekend:      jIdx === 0 || jIdx === 6,
      ca:               Math.round(j.ca_estime),
      taux_invendu:     Math.round(j.taux_invendu * 10) / 10,
      total_produit:    j.total_produit,
      total_invendu:    j.total_invendu,
      commandes_online: j.commandes_online,
    };
  });

  // ── Historique même jour de semaine ───────────────────────
  const histoMemeJour: DonneesHistoriqueEnrichies[] = (historique ?? [])
    .filter(j => getDayOfWeekInTimezone(j.date, timezone) === demainIdx)
    .slice(0, 4)
    .map(j => {
      const jIdx = getDayOfWeekInTimezone(j.date, timezone);
      return {
        jour_semaine:     JOURS_FR[jIdx],
        est_weekend:      jIdx === 0 || jIdx === 6,
        ca:               Math.round(j.ca_estime),
        taux_invendu:     Math.round(j.taux_invendu * 10) / 10,
        total_produit:    j.total_produit,
        total_invendu:    j.total_invendu,
        commandes_online: j.commandes_online,
      };
    });

  // ── Catalogue enrichi pour prévisions précises ────────────
  // Pour chaque produit du catalogue, on calcule :
  // - la quantité produite aujourd'hui (base de calcul)
  // - la moyenne sur les mêmes jours de semaine passés
  const catalogueEnrichi: CatalogueEntree[] = (produits ?? []).map((p, i) => {
    // Quantité produite aujourd'hui pour ce produit
    const stockAujourd = journee.stocks_journaliers?.find(s => s.produit_id === p.id);
    const quantiteHier = stockAujourd?.production ?? 0;
    const invenduHier  = stockAujourd?.stock_final ?? 0;
    const tauxVenteHier = quantiteHier > 0
      ? Math.round(((quantiteHier - invenduHier) / quantiteHier) * 100)
      : 0;

    // Moyenne sur les mêmes jours de semaine dans l'historique
    const memeJoursHisto = (historique ?? [])
      .filter(j => getDayOfWeekInTimezone(j.date, timezone) === demainIdx)
      .slice(0, 4);

    let moyMemeJour: number | null = null;
    if (memeJoursHisto.length > 0) {
      const productions = memeJoursHisto
        .map(j => j.stocks_journaliers?.find(s => s.produit_id === p.id)?.production ?? 0)
        .filter(v => v > 0);
      if (productions.length > 0) {
        moyMemeJour = Math.round(productions.reduce((a, b) => a + b, 0) / productions.length);
      }
    }

    return {
      produit_id:             p.id,
      index:                  i + 1,
      nom:                    p.nom,
      categorie:              p.categorie,
      emoji:                  p.emoji,
      prix_vente:             p.prix_vente,
      quantite_produite_hier: quantiteHier,
      taux_vente_hier:        tauxVenteHier,
      invendu_hier:           invenduHier,
      moy_meme_jour:          moyMemeJour,
    };
  });

  // ── Météo ──────────────────────────────────────────────────
  let meteoAnon: DonneesMeteo | undefined;
  if (meteoComplet) {
    const { actuelle: a, demain: dm } = meteoComplet;
    const impact = analyserImpactMeteo(meteoComplet);
    meteoAnon = {
      actuelle: {
        temperature:    a.temperature_c,
        ressenti:       a.ressenti_c,
        humidite:       a.humidite_pct,
        precipitations: a.precipitations_mm,
        description:    a.description,
        icone:          a.icone,
      },
      demain: {
        temp_max:       dm.temp_max_c,
        temp_min:       dm.temp_min_c,
        precipitations: dm.precip_mm,
        description:    dm.description,
        icone:          dm.icone,
      },
      impact: {
        global:          impact.impact_global,
        conseils:        impact.conseils,
        facteur_trafic:  impact.facteur_trafic,
        par_categorie:   impact.impact_par_categorie,
      },
    };
  }

  // ── Analyse des commandes ──────────────────────────────────
  let commandesData: DonneesCommandes | undefined;
  if (commandes && commandes.length > 0) {
    const clickCollect = commandes.filter(c => c.type === 'click_collect');
    const antiGaspi    = commandes.filter(c => c.type === 'anti_gaspi');

    const produitsCount: Record<string, number> = {};
    clickCollect.forEach(c => {
      c.lignes?.forEach(l => {
        produitsCount[l.produit_nom] = (produitsCount[l.produit_nom] ?? 0) + l.quantite;
      });
    });
    const topProduits = Object.entries(produitsCount)
      .map(([nom, quantite]) => ({ nom, quantite }))
      .sort((a, b) => b.quantite - a.quantite)
      .slice(0, 5);

    const heures: Record<string, number> = {};
    clickCollect.forEach(c => {
      if (c.heure_retrait) {
        const heure = c.heure_retrait.slice(0, 5);
        heures[heure] = (heures[heure] ?? 0) + 1;
      }
    });
    const heuresPointe = Object.entries(heures)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => h);

    const recuperees    = clickCollect.filter(c => c.statut === 'recuperee').length;
    const caTotalCC     = clickCollect.reduce((s, c) => s + Number(c.montant_total), 0);
    const caTotalGaspi  = antiGaspi.reduce((s, c) => s + Number(c.montant_total), 0);
    const invendusEcartes = antiGaspi.reduce(
      (s, c) => s + (c.lignes?.reduce((ls, l) => ls + l.quantite, 0) ?? 0),
      0
    );

    commandesData = {
      click_collect: {
        nb_commandes:  clickCollect.length,
        ca_total:      Math.round(caTotalCC),
        panier_moyen:  clickCollect.length > 0 ? Math.round((caTotalCC / clickCollect.length) * 100) / 100 : 0,
        taux_recupere: clickCollect.length > 0 ? Math.round((recuperees / clickCollect.length) * 100) : 0,
        top_produits:  topProduits,
        heures_pointe: heuresPointe,
      },
      anti_gaspi: {
        nb_paniers:       antiGaspi.length,
        ca_genere:        Math.round(caTotalGaspi),
        invendus_ecartes: invendusEcartes,
        taux_vente:       paniersFlash
          ? (paniersFlash.filter(p => p.vendu).length / Math.max(paniersFlash.length, 1)) * 100
          : 0,
      },
    };
  }

  // ── Analyse des clients ────────────────────────────────────
  let clientsData: DonneesClients | undefined;
  if (clients && clients.length > 0) {
    const todayStart = new Date(today + 'T00:00:00');
    const weekAgo    = new Date(todayStart); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo   = new Date(todayStart); monthAgo.setDate(monthAgo.getDate() - 30);

    const nouveauxJour    = clients.filter(c => new Date(c.created_at) >= todayStart).length;
    const nouveauxSemaine = clients.filter(c => new Date(c.created_at) >= weekAgo).length;
    const nouveauxMois    = clients.filter(c => new Date(c.created_at) >= monthAgo).length;
    const actifs          = clients.filter(c => c.nb_commandes > 0).length;

    clientsData = {
      nouveaux_clients_jour:     nouveauxJour,
      nouveaux_clients_semaine:  nouveauxSemaine,
      nouveaux_clients_mois:     nouveauxMois,
      total_clients:             clients.length,
      clients_actifs:            actifs,
      retention_30j:             clients.length > 0 ? Math.round((actifs / clients.length) * 100) : 0,
    };
  }

  // ── Événements pour demain ─────────────────────────────────
  const evenements = detecterEvenements(demainDate);

  // ── Performance globale ────────────────────────────────────
  const produitsTries = [...produitsEnrichis].sort((a, b) => a.taux_invendu - b.taux_invendu);
  const topSucces = produitsTries.slice(0, 3).map(p => ({
    nom:        p.nom,
    emoji:      p.emoji,
    taux_vente: Math.round((100 - p.taux_invendu) * 10) / 10,
  }));
  const flops = [...produitsEnrichis]
    .sort((a, b) => b.taux_invendu - a.taux_invendu)
    .slice(0, 3)
    .map(p => ({ nom: p.nom, emoji: p.emoji, taux_invendu: p.taux_invendu }));

  let scoreJour = 50;
  if (journee.taux_invendu < 3)       scoreJour += 30;
  else if (journee.taux_invendu < 5)  scoreJour += 20;
  else if (journee.taux_invendu < 8)  scoreJour += 10;
  else if (journee.taux_invendu > 15) scoreJour -= 15;
  else if (journee.taux_invendu > 10) scoreJour -= 8;
  if (journee.commandes_online > 10)  scoreJour += 10;
  else if (journee.commandes_online > 5) scoreJour += 5;
  scoreJour = Math.max(0, Math.min(100, scoreJour));

  let tendanceVsHier      = 0;
  let tendanceVsMemeJour  = 0;
  if (historique.length >= 1 && historique[0].ca_estime > 0) {
    tendanceVsHier = Math.round(((journee.ca_estime - historique[0].ca_estime) / historique[0].ca_estime) * 100);
  }
  if (histoMemeJour.length >= 1 && histoMemeJour[0].ca > 0) {
    tendanceVsMemeJour = Math.round(((journee.ca_estime - histoMemeJour[0].ca) / histoMemeJour[0].ca) * 100);
  }

  return {
    journee: {
      jour_semaine:     jourFr,
      jour_semaine_en:  jourEn,
      semaine_annee:    semaine,
      est_weekend:      estWeekend,
      ca_estime:        Math.round(journee.ca_estime),
      taux_invendu:     Math.round(journee.taux_invendu * 10) / 10,
      total_produit:    journee.total_produit,
      total_invendu:    journee.total_invendu,
      commandes_online: journee.commandes_online,
      produits:         produitsEnrichis,
      total_mp: {
        farine_kg:   Math.round(tF / 100) / 10,
        beurre_kg:   Math.round(tB / 100) / 10,
        oeufs:       Math.round(tO * 10) / 10,
        sucre_kg:    Math.round(tS / 100) / 10,
        sel_kg:      Math.round(tSel / 100) / 10,
        eau_l:       Math.round(tEau / 100) / 10,
        lait_l:      Math.round(tLait / 100) / 10,
        chocolat_kg: Math.round(tChoc / 100) / 10,
      },
    },
    demain_info:     { jour_semaine: demainFr, est_weekend: demainWE, jour_semaine_en: demainEn, date: demainDate },
    historique_14j:  histoEnrichi,
    histo_meme_jour: histoMemeJour,
    nb_jours_histo:  historique.length,
    catalogue:       catalogueEnrichi,
    meteo:           meteoAnon,
    commandes:       commandesData,
    clients:         clientsData,
    evenements,
    performance_globale: {
      score_jour:              scoreJour,
      tendance_vs_hier:        tendanceVsHier,
      tendance_vs_meme_jour:   tendanceVsMemeJour,
      top_succes:              topSucces,
      flops,
    },
  };
}

// ── Post-traitement (données déjà en clair) ───────────────────

export function deanonymiserRapport(rapport: Record<string, unknown>): Record<string, unknown> {
  return rapport;
}

// ── Prompts ───────────────────────────────────────────────────

export function buildSystemPrompt(): string {
  return `Tu es Levain, l'assistant IA d'un boulanger artisanal. Comme le levain naturel, tu t'améliores chaque jour grâce aux données.

## Tes 3 audiences
- **Boulanger** : production, fournées, matières premières
- **Vendeuse** : accueil client, mise en avant produits, fin de journée
- **Gérant** : CA, tendances, stratégie, rentabilité

## Règles absolues
1. Dans \`previsions_production\`, utilise TOUJOURS le \`produit_id\` UUID exact fourni dans les suggestions.
2. \`quantite_suggeree\` est un ENTIER ABSOLU (pièces), jamais un pourcentage.
3. Fournis \`quantite_min\` et \`quantite_max\` pour chaque produit.
4. Les suggestions sont pré-calculées par algorithme serveur. Valide-les ou ajuste-les avec une justification contextuelle courte.
5. Utilise toujours les vrais noms de produits (jamais "Produit A").
6. Arrondis : pains → multiples de 5 | viennoiseries/pâtisseries → multiples de 2.

## Format de réponse
JSON strict avec les sections :
\`score\`, \`verdict\`, \`synthese_journee\`, \`analyse_produits\`, \`analyse_contextuelle\`,
\`analyse_commandes\`, \`analyse_clients\`, \`previsions_production\`, \`matieres_premieres\`,
\`briefing_matin\`, \`briefing_vendeuse\`, \`briefing_gerant\`, \`consignes_transmises\`, \`message_levain\`

Structure \`previsions_production\` :
\`\`\`json
[{
  "produit_id": "<UUID exact>",
  "produit_nom": "<nom exact>",
  "quantite_suggeree": <entier>,
  "quantite_min": <entier>,
  "quantite_max": <entier>,
  "variation_pct": <entier signé>,
  "raison": "<justification courte>"
}]
\`\`\``;
}

export function buildUserPrompt(payload: PayloadEnrichi): string {
  const {
    journee, demain_info, historique_14j, histo_meme_jour,
    nb_jours_histo, catalogue, meteo, commandes, clients,
    evenements, performance_globale, suggestions_algo,
  } = payload;

  // Cycle salarial
  const jourDuMois = new Date(demain_info.date + 'T12:00:00').getDate();
  const cycle = jourDuMois <= 5 ? 'debut_mois' : jourDuMois >= 25 ? 'fin_mois' : 'milieu_mois';

  // Météo compacte
  const meteoStr = meteo
    ? `${meteo.demain.icone}${meteo.demain.temp_max}°C/${meteo.demain.temp_min}°C précip:${meteo.demain.precipitations}mm`
    : 'inconnue';
  const impactTrafic = meteo ? meteo.impact.facteur_trafic : 'neutre';

  // Événement
  let eventStr = 'null';
  if (evenements) {
    const parts: string[] = [];
    if (evenements.jour_ferie) parts.push(`FERIÉ:${evenements.fete_nom}`);
    if (evenements.vacances_scolaires) parts.push('VACANCES');
    if (evenements.evenements_locaux.length > 0) parts.push(evenements.evenements_locaux.join(','));
    if (parts.length > 0) eventStr = parts.join('|');
  }

  // Produits aujourd'hui — format pipe
  const produitsLignes = journee.produits.map(p => {
    const flag = p.performance === 'excellent' ? '*' : p.performance === 'faible' ? '!' : '';
    return `${p.produit_id ?? ''}|${p.nom}${flag}|${p.production}|${p.taux_vente}%|${p.invendu}`;
  }).join('\n');

  // Suggestions algo — compact JSON
  const suggestionsStr = suggestions_algo && suggestions_algo.length > 0
    ? JSON.stringify(suggestions_algo.map(s => ({
        id: s.produit_id,
        nom: s.produit_nom,
        qty: s.qty_suggere,
        min: s.qty_min,
        max: s.qty_max,
        var: s.variation_pct,
        raison: s.raison_calcul,
      })))
    : catalogue.map(p => {
        const qty = p.moy_meme_jour ?? p.quantite_produite_hier;
        return `{"id":"${p.produit_id}","nom":"${p.nom}","qty":${qty},"min":${Math.round(qty * 0.9)},"max":${Math.round(qty * 1.1)},"var":0,"raison":"base catalogue"}`;
      }).join(',\n');

  // Historique 14j compact
  const histoStr = historique_14j.length > 0
    ? historique_14j.map(h =>
        `${h.est_weekend ? '[WE]' : '[SEM]'}${h.jour_semaine}:${h.ca}€/${h.taux_invendu}%inv`
      ).join(' | ')
    : '(aucune donnée)';

  const histoLabel = nb_jours_histo === 0
    ? '0j-premiere'
    : nb_jours_histo < 7
      ? `${nb_jours_histo}j-apprentissage`
      : nb_jours_histo < 14
        ? `${nb_jours_histo}j-tendances`
        : `${nb_jours_histo}j-fiable`;

  // Historique même jour de semaine
  let histoMemeJourStr = '';
  if (histo_meme_jour.length > 0) {
    const moyCA = Math.round(histo_meme_jour.reduce((s, h) => s + h.ca, 0) / histo_meme_jour.length);
    const moyInv = (histo_meme_jour.reduce((s, h) => s + h.taux_invendu, 0) / histo_meme_jour.length).toFixed(1);
    histoMemeJourStr = `\n${demain_info.jour_semaine}s récents (${histo_meme_jour.length} sem): ca_moy=${moyCA}€ inv_moy=${moyInv}%`;
  }

  // Pré-commandes demain — gérées dans buildUserPromptEnrichi (non disponible dans CatalogueEntree)
  const precommandesLignes = '';

  // Commandes en ligne
  let commandesStr = '';
  if (commandes) {
    const cc = commandes.click_collect;
    const ag = commandes.anti_gaspi;
    commandesStr = `\n# COMMANDES_EN_LIGNE\nclick_collect: ${cc.nb_commandes}cmd/${cc.ca_total}€/pm${cc.panier_moyen}€ récup:${cc.taux_recupere}%\nanti_gaspi: ${ag.nb_paniers}paniers/${ag.ca_genere}€ sauvés:${ag.invendus_ecartes}`;
  }

  // Clients
  let clientsStr = '';
  if (clients) {
    clientsStr = `\n# CLIENTS\ntotal=${clients.total_clients} actifs=${clients.clients_actifs} rétention=${clients.retention_30j}%\nnouveaux: jour=${clients.nouveaux_clients_jour} sem=${clients.nouveaux_clients_semaine} mois=${clients.nouveaux_clients_mois}`;
  }

  // Matières premières
  const mpParts = [
    `farine:${journee.total_mp.farine_kg}kg`,
    `beurre:${journee.total_mp.beurre_kg}kg`,
    `oeufs:${journee.total_mp.oeufs}`,
    `sucre:${journee.total_mp.sucre_kg}kg`,
    journee.total_mp.sel_kg > 0      ? `sel:${journee.total_mp.sel_kg}kg`           : '',
    journee.total_mp.eau_l > 0       ? `eau:${journee.total_mp.eau_l}L`             : '',
    journee.total_mp.lait_l > 0      ? `lait:${journee.total_mp.lait_l}L`           : '',
    journee.total_mp.chocolat_kg > 0 ? `chocolat:${journee.total_mp.chocolat_kg}kg` : '',
  ].filter(Boolean).join(' | ');

  return `# CONTEXTE
date=${demain_info.date} | jour=${demain_info.jour_semaine}${demain_info.est_weekend ? '(WE)' : ''} | meteo_demain=${meteoStr}
impact_trafic=${impactTrafic} | event=${eventStr} | cycle=${cycle}

# AUJOURD'HUI (résumé)
${journee.jour_semaine} S${journee.semaine_annee} | ca=${journee.ca_estime}€ | invendu=${journee.taux_invendu}%(${journee.total_invendu}/${journee.total_produit}pcs) | score=${performance_globale.score_jour}/100
vs_hier=${performance_globale.tendance_vs_hier >= 0 ? '+' : ''}${performance_globale.tendance_vs_hier}% | vs_meme_jour=${performance_globale.tendance_vs_meme_jour >= 0 ? '+' : ''}${performance_globale.tendance_vs_meme_jour}%
top: ${performance_globale.top_succes.map(p => `${p.nom}(${p.taux_vente}%v)`).join(',')} | flop: ${performance_globale.flops.map(p => `${p.nom}(${p.taux_invendu}%inv)`).join(',')}

# PRODUITS_AUJOURD'HUI (produit_id|nom*=excellent!=faible|prod|vendu%|invendu_pcs)
${produitsLignes}

# MP_AUJOURD'HUI
${mpParts}

# SUGGESTIONS_ALGORITHME (à valider/ajuster)
[${suggestionsStr}]

# RÉSUMÉ_HISTORIQUE (${histoLabel})${histoMemeJourStr}
histo_14j: ${histoStr}${commandesStr}${clientsStr}

# PRÉ-COMMANDES_DEMAIN
${precommandesLignes || 'aucune'}

→ Génère le JSON complet avec TOUTES les sections.
→ Dans previsions_production, utilise le produit_id UUID exact et des entiers absolus.
→ Chaque produit du catalogue DOIT avoir une entrée dans previsions_production.`;
}