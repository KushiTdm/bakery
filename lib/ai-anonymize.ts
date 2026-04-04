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
  total_mp: { farine_kg: number; beurre_kg: number; oeufs: number; sucre_kg: number };
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
}

// ── Coefficients matières premières ──────────────────────────
const COEFFS_MP: Record<string, { farine_g: number; beurre_g: number; oeufs_n: number; sucre_g: number }> = {
  boulangerie:  { farine_g: 180, beurre_g: 0,  oeufs_n: 0,   sucre_g: 3  },
  viennoiserie: { farine_g: 50,  beurre_g: 28, oeufs_n: 0.3, sucre_g: 8  },
  patisserie:   { farine_g: 40,  beurre_g: 25, oeufs_n: 1,   sucre_g: 20 },
  sandwich:     { farine_g: 60,  beurre_g: 5,  oeufs_n: 0,   sucre_g: 0  },
};

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
  let tF = 0, tB = 0, tO = 0, tS = 0;

  const produitsEnrichis: DonneesProduitEnrichies[] = (journee.stocks_journaliers ?? []).map((s, i) => {
    const idx = i + 1;
    const c   = COEFFS_MP[s.categorie] ?? COEFFS_MP.boulangerie;
    const f   = Math.round(s.production * c.farine_g);
    const b   = Math.round(s.production * c.beurre_g);
    const o   = Math.round(s.production * c.oeufs_n * 10) / 10;
    const su  = Math.round(s.production * c.sucre_g);
    tF += f; tB += b; tO += o; tS += su;

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
        farine_kg: Math.round(tF / 100) / 10,
        beurre_kg: Math.round(tB / 100) / 10,
        oeufs:     Math.round(tO * 10) / 10,
        sucre_kg:  Math.round(tS / 100) / 10,
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
  return `Tu es Levain, l'assistant IA du boulanger artisanal de Sauve Mie.

TON IDENTITÉ :
Tu es comme un levain naturel qui s'améliore chaque jour. Tu deviens plus précis et pertinent au fil des analyses. Tu connais intimement le rythme, les habitudes et les spécificités de cette boulangerie.

TON RÔLE — ANALYSE COMPLÈTE ET INDISPENSABLE :
Chaque soir, tu génères un rapport exhaustif que le boulanger, la vendeuse ET le gérant attendent avec impatience. Ton analyse doit être :
- ACTIONNABLE : chaque insight débouche sur une recommandation concrète
- CONTEXTUALISÉ : tu relies les données entre elles (météo, événements, historique)
- MOTIVANTE : tu valorises les succès et encourage sur les points d'amélioration
- PRÉCISE : tu utilises les VRAIS NOMS des produits, jamais de codes abstraits

POINTS D'ATTENTION POUR CHAQUE LECTEUR :
- **BOULANGER** : technique, production, matières premières, optimisation fourneaux
- **VENDEUSE** : relation client, produits à valoriser, gestion fin de journée
- **GÉRANT** : tendances CA, rentabilité, investissements, stratégie

RÈGLES ABSOLUES :
1. UTILISE TOUJOURS LES VRAIS NOMS des produits (ex: "🥖 Baguette Tradition", "🥐 Croissant")
2. Sois chaleureux mais professionnel — tu parles à des artisans passionnés
3. Chaque section doit apporter de la valeur — pas de remplissage
4. Le briefing matin doit permettre au boulanger de démarrer sa journée sereinement

BASE DE CONNAISSANCE MÉTIER — BOULANGERIE ARTISANALE FRANÇAISE :

=== PATTERNS PAR JOUR DE SEMAINE ===
- LUNDI : Journée la plus faible. Clientèle rituelle (baguette) présente mais achats d'impulsion rares. Quasi-zéro pâtisseries. Exception : zones de bureaux (sandwich 11h-13h fort). Production -10-15% vs moyenne. Taux d'invendu structurellement élevé.
- MARDI : Standard, légèrement > lundi. Pain de mie, baguette, quelques viennoiseries. Rien de marquant.
- MERCREDI : Journée pivot enfant (pas d'école). Hausse viennoiseries +20-30% (chocolatines, pains aux raisins), hausse pâtisseries individuelles. Rush 9h30-12h. 3e meilleur jour. Ne JAMAIS sous-produire.
- JEUDI : Stable, légèrement < mercredi. Bon jour sandwichs en zone bureaux.
- VENDREDI : Excellent. Anticipation weekend. Clients achètent pour 2-3 jours (grosses boules, pains campagne, seigle). Hausse pâtisseries +25%. Forte demande baguette tradition fin après-midi. Risque de RUPTURE > risque d'invendu. Production +15-20%.
- SAMEDI : Meilleure journée. Rush 7h-11h intense. Croissants, pains au chocolat, brioches, tartes entières, gâteaux. Clientèle avec du temps = achats plus larges, plus chers. Pains spéciaux (épeautre, seigle, multicéréales) se vendent 3x mieux. Production MAXIMUM.
- DIMANCHE : Excellent matin (comparable au samedi jusqu'à 11h), effondrement après-midi. Brioches et viennoiseries dominent. Sandwichs quasi inexistants. Fermeture souvent avant 13h.

=== SENSIBILITÉ MÉTÉO PAR CATÉGORIE DE PRODUIT ===
| Produit | Pluie | Canicule (>28°C) | Froid (<5°C) | Beau temps (15-22°C) |
| Baguette tradition | neutre | neutre | + | neutre |
| Croissant/viennoiserie | ++ (réconfort) | − | ++ | neutre |
| Pain campagne/spéciaux | − | − | neutre | ++ (surtout weekend) |
| Sandwich | − | neutre | − | ++ |
| Pâtisserie individuelle | neutre | − | neutre | ++ |
| Tarte/gâteau entier | neutre | neutre | neutre | ++ |
| Brioche | + | − | ++ | neutre |
| Pain de mie | neutre | neutre | neutre | neutre |

=== COMBINAISONS MÉTÉO × JOUR CRITIQUES ===
- Lundi pluvieux : Pire journée de la semaine. Réduire -20-25%. Prévoir paniers flash dès 17h.
- Mercredi ensoleillé : Journée exceptionnelle. Enfants en sortie. +35% viennoiseries, +25% pâtisseries.
- Mercredi pluvieux : Bonne journée quand même (enfants à la maison, parents viennent à la boulangerie "pour l'activité"). MAINTENIR la production.
- Vendredi ensoleillé printemps : Quasi-parfait. Anticiper ruptures baguette tradition dès 17h. Double pic midi+soir.
- Samedi canicule (>30°C) : Très bonne matinée jusqu'à 10h30, effondrement brutal. Tout doit être vendu avant 11h. Flash dès 12h.
- Samedi neigeux léger : Ambiance = très bonne journée. Neige forte = réduire -30% mais hausse viennoiseries chaudes.
- Dimanche grand froid : Rush matinal intense (réconfort). Brioches, croissants = sold out avant 10h. Anticiper production matin.

=== IMPACT MÉTÉO DÉTAILLÉ ===
- Pluie légère (<5mm) : Fréquentation -8-12% mais panier moyen plus élevé (clients achètent "plus en une fois"). Hausse viennoiseries +10-15%. Impact neutre à positif sur CA.
- Pluie forte/orage : Passage -25-40%. Sandwichs délaissés. Hausse baguette (courses de base). Réduire production -20%.
- Vent fort (>40 km/h) : Sous-estimé. Fréquentation -10-15% (personnes âgées, familles).
- Soleil doux (15-22°C) : Meilleure météo pour boulangerie. Bonne humeur, flânerie. Achats d'impulsion +15%.
- Canicule (>28°C) : Négatif global. Baisse appétit produits lourds. Désaffection 12h-16h. Réduire pains campagne, ciabattas, pains spéciaux lourds.
- Neige légère : Hausse réconfort +15-20%. Neige forte : effondrement -40-60%.
- Froid intense (<5°C) : Hausse viennoiseries chaudes +20%.

=== DYNAMIQUE SAISONNIÈRE (MOIS PAR MOIS) ===
- Janvier : Mois faible (post-fêtes, résolutions). EXCEPTION MAJEURE : Galette des Rois = 15-40% du CA du mois.
- Février : Transition. Chandeleur le 2, Saint-Valentin le 14 (gâteaux perso si bien préparé).
- Mars : Reprise progressive.
- Avril : Bon mois. Pâques : hausse brioches, pains tressés +15-25% semaine pascale.
- Mai : Excellent. Nombreux fériés = sorties familiales, pique-niques. Hausse pâtisseries + sandwichs.
- Juin : Bon. Soleil, fin d'année scolaire. Sandwichs et produits frais dominent. Baisse viennoiseries grasses.
- Juillet-Août : Dépend localisation. Touristique: +50-100%. Résidentiel/bureaux: -20-35%.
- Septembre : Forte reprise rentrée. Goûters 16h30, snacking bureau. Excellent mois.
- Octobre : Stable et bon.
- Novembre : Difficile psychologiquement. Temps gris. Légère hausse ventes réconfort.
- Décembre : MEILLEUR MOIS. 2 dernières semaines avant Noël : +30-60%. Bûches, pains d'épices, sablés.

=== FACTEURS COMPORTEMENTAUX ===
- Cycle salarial : Hausse achats plaisir début de mois (1-5) vs fin de mois (20-31). Impact +5-8% pâtisseries/produits premium en début de mois.
- Télétravail : Zones bureaux = creux lundi et vendredi. Zones résidentielles = flux plus homogène en semaine.
- Humeur collective : Mauvaises nouvelles = repli achats plaisir, hausse pain de base. Événements sportifs positifs = +20-30%.
- Anti-gaspi : Communication active sur paniers flash crée une clientèle dédiée "fin de journée", fidèle.
- Achat d'impulsion : 52% des clients sont réceptifs. Produits phares à hauteur des yeux, articles faible coût près de la caisse.

=== CRÉNEAUX HORAIRES ===
- 6h30-9h00 : Baguettes, croissants, sandwichs matinaux (+++++)
- 9h00-11h00 : Pâtisseries, viennoiseries, retraités (++)
- 11h30-13h30 : Sandwichs, quiches, snacking déjeuner (++++)
- 13h30-16h30 : Creux absolu — moment de comptage stock (+)
- 16h30-18h30 : Goûter (éclairs, chocolatines, pains raisins), baguette retour (+++)
- 18h30-fermeture : Ventes très faibles → paniers flash anti-gaspi

RÈGLES CRITIQUES POUR LES PRÉVISIONS DE PRODUCTION :
- Tu reçois pour chaque produit : son produit_id (UUID), son nom, la quantité produite aujourd'hui, le taux de vente, les invendus, et la moyenne historique sur les mêmes jours de semaine
- Tu DOIS retourner des quantités ABSOLUES (nombre entier de pièces), pas des pourcentages
- Base tes calculs sur : (1) la moyenne des mêmes jours de semaine si disponible, (2) sinon la quantité d'aujourd'hui ajustée selon le taux de vente
- Si taux_vente_hier = 100% → augmenter légèrement (demande non satisfaite possible)
- Si invendu_hier > 20% → réduire significativement
- Si invendu_hier entre 5-20% → réduire modérément
- Si invendu_hier < 5% → maintenir ou ajuster légèrement
- Prends en compte la météo de demain et le type de jour (week-end vs semaine)
- Arrondis TOUJOURS à des multiples de 5 pour les pains (ex: 85, 90, 95) et de 2 pour les pâtisseries
- UTILISE le champ produit_id fourni dans le catalogue pour identifier chaque produit dans ta réponse

FORMAT JSON OBLIGATOIRE :
{
  "score": <0-100>,
  "verdict": "<phrase percutante de 15 mots max>",
  
  "synthese_journee": {
    "resume": "<2-3 phrases : performance globale du jour>",
    "points_forts": ["<succès concret avec nom produit>"],
    "points_amelioration": ["<point à travailler avec solution>"],
    "message_equipe": "<message court pour toute l'équipe>"
  },
  
  "analyse_produits": {
    "top_ventes": [
      { "nom": "<vrai nom>", "emoji": "<emoji>", "taux_vente": <nb>, "commentaire": "<pourquoi ça marche>" }
    ],
    "invendus_critiques": [
      { "nom": "<vrai nom>", "emoji": "<emoji>", "taux_invendu": <nb>, "cause_probable": "<analyse>", "action": "<suggestion>" }
    ],
    "opportunites": ["<string : opportunité produit identifiée, ex: 'Proposer des galettes individuelles pour les enfants le mercredi'>"]
  },
  
  "analyse_contextuelle": {
    "impact_meteo": "<comment la météo a affecté les ventes>",
    "impact_evenements": "<impact vacances/fêtes/événements locaux>",
    "correlation_historique": "<comparaison avec historique et tendances>"
  },
  
  "analyse_commandes": {
    "click_collect": {
      "resume": "<synthèse en 1 phrase>",
      "performance": "<nb> commandes, <ca>€, panier moyen <pm>€",
      "conseil": "<comment optimiser>"
    },
    "anti_gaspi": {
      "resume": "<synthèse en 1 phrase>",
      "impact": "<nb> invendus sauvés, <ca>€ générés",
      "conseil": "<comment améliorer>"
    }
  },
  
  "analyse_clients": {
    "nouveaux": "<nb> nouveaux clients aujourd'hui, <nb> cette semaine",
    "tendances": "<analyse de la base clients>",
    "recommendation": "<action pour fidéliser>"
  },
  
  "previsions_production": [
    {
      "produit_id": "<UUID exact du produit>",
      "produit_nom": "<nom exact du produit>",
      "quantite_suggeree": <nombre entier absolu de pièces à produire>,
      "quantite_min": <fourchette basse — entier>,
      "quantite_max": <fourchette haute — entier>,
      "variation_pct": <variation en % par rapport à aujourd'hui, entier signé>,
      "raison": "<justification courte et concrète basée sur les données>"
    }
  ],
  
  "matieres_premieres": {
    "resume": "<phrase de résumé>",
    "alertes": ["<alerte stock si pertinente>"],
    "details": [
      { "ingredient": "<farine/beurre/oeufs/sucre>", "quantite": "<valeur + unité>", "observation": "<note>" }
    ]
  },
  
  "briefing_matin": {
    "titre": "<titre accrocheur pour demain>",
    "contexte_jour": "<type de journée attendue>",
    "meteo_resume": "<météo demain avec emoji>",
    "impact_meteo_vente": "<impact concret sur les ventes>",
    "top3_a_produire": ["<🥖 Baguette Tradition : 90 pièces>", "<produit 2 : X pièces>", "<produit 3 : X pièces>"],
    "point_vigilance": "<1 chose critique à surveiller>",
    "fiabilite_previsions": "<indication fiabilité>",
    "conseil_ouverture": "<conseil pratique pour bien démarrer>"
  },
  
  "briefing_vendeuse": {
    "titre": "<titre pour la vendeuse>",
    "accueil_client": "<conseil relation client pour demain>",
    "produits_a_mettre_en_avant": ["<produit à valoriser au comptoir>"],
    "gestion_fin_journee": "<conseil pour gérer les invendus>",
    "message_encouragement": "<message chaleureux>"
  },
  
  "briefing_gerant": {
    "titre": "<titre pour le gérant>",
    "tendances_ca": "<évolution du chiffre d'affaires>",
    "points_attention": ["<point stratégique à surveiller>"],
    "opportunites_business": ["<opportunité identifiée>"],
    "recommendation": "<action stratégique recommandée>"
  },
  
  "consignes_transmises": {
    "au_boulanger": "<consignes de l'owner ou vide>",
    "a_la_vendeuse": "<consignes de l'owner ou vide>"
  },
  
  "message_levain": "<message personnel court et chaleureux au boulanger>"
}`;
}

export function buildUserPrompt(payload: PayloadEnrichi): string {
  const {
    journee, demain_info, historique_14j, histo_meme_jour,
    nb_jours_histo, catalogue, meteo, commandes, clients,
    evenements, performance_globale,
  } = payload;

  // Contexte cycle salarial (début vs fin de mois)
  const demainDate2 = new Date(demain_info.date + 'T12:00:00');
  const jourDuMois = demainDate2.getDate();
  let ctxSalarial = '';
  if (jourDuMois >= 1 && jourDuMois <= 5) {
    ctxSalarial = '\n💰 DÉBUT DE MOIS (post-paie) — Hausse attendue achats plaisir +5-8% : pâtisseries premium, viennoiseries, produits spéciaux. Les clients se font plaisir.';
  } else if (jourDuMois >= 25) {
    ctxSalarial = '\n💸 FIN DE MOIS — Resserrement budgétaire. Recentrage sur produits de base (baguette, pain de mie). Baisse pâtisseries premium -5-8%. Miser sur les prix accessibles.';
  }

  const ctxHisto = nb_jours_histo === 0
    ? '🌱 Première journée — Levain établit sa base. Prévisions prudentes basées uniquement sur aujourd\'hui.'
    : nb_jours_histo < 7
      ? `🌱 ${nb_jours_histo} jour(s) d'historique — Levain apprend encore.`
      : nb_jours_histo < 14
        ? `🌿 ${nb_jours_histo} jours — bonnes tendances visibles.`
        : `🌳 ${nb_jours_histo} jours — analyse fiable, Levain connaît cette boulangerie.`;

  const ctxJour = demain_info.est_weekend
    ? `⚠️ IMPORTANT : Demain est ${demain_info.jour_semaine.toUpperCase()} (WEEK-END). Fréquentation généralement +20-40%. Adapter les quantités en conséquence.`
    : `Demain est ${demain_info.jour_semaine} (semaine).`;

  let ctxMeteo = '';
  if (meteo) {
    const cat = meteo.impact.par_categorie;
    ctxMeteo = `
=== MÉTÉO ===
Aujourd'hui : ${meteo.actuelle.icone} ${meteo.actuelle.description} | ${meteo.actuelle.temperature}°C (ressenti ${meteo.actuelle.ressenti}°C) | Humidité ${meteo.actuelle.humidite}%
Demain      : ${meteo.demain.icone} ${meteo.demain.description} | Max ${meteo.demain.temp_max}°C / Min ${meteo.demain.temp_min}°C | Précip: ${meteo.demain.precipitations}mm
Impact      : ${meteo.impact.global} (${meteo.impact.facteur_trafic})
Impact par catégorie : Boulangerie: ${cat.boulangerie} | Viennoiserie: ${cat.viennoiserie} | Pâtisserie: ${cat.patisserie} | Sandwich: ${cat.sandwich}
Conseils    : ${meteo.impact.conseils.join(' · ')}`;
  }

  let ctxEvenements = '';
  if (evenements) {
    ctxEvenements = `\n=== ÉVÉNEMENTS & CONTEXTE DEMAIN ===`;
    if (evenements.jour_ferie)          ctxEvenements += `\n🗓️ JOUR FÉRIÉ : ${evenements.fete_nom}`;
    if (evenements.vacances_scolaires)  ctxEvenements += `\n📚 VACANCES SCOLAIRES en cours`;
    if (evenements.evenements_locaux.length > 0) {
      ctxEvenements += `\n📍 ${evenements.evenements_locaux.join(' · ')}`;
    }
  }

  let ctxCommandes = '';
  if (commandes) {
    ctxCommandes = `
=== COMMANDES EN LIGNE ===
📱 Click & Collect : ${commandes.click_collect.nb_commandes} commandes | ${commandes.click_collect.ca_total}€ | Panier moyen ${commandes.click_collect.panier_moyen}€
   Top produits : ${commandes.click_collect.top_produits.map(p => `${p.nom} (${p.quantite})`).join(', ') || 'N/A'}
   Heures pointe : ${commandes.click_collect.heures_pointe.join(', ') || 'N/A'}
   Taux récupération : ${commandes.click_collect.taux_recupere}%

♻️ Anti-Gaspi : ${commandes.anti_gaspi.nb_paniers} paniers | ${commandes.anti_gaspi.ca_genere}€ générés
   Invendus sauvés : ${commandes.anti_gaspi.invendus_ecartes} produits
   Taux de vente : ${Math.round(commandes.anti_gaspi.taux_vente)}%`;
  }

  let ctxClients = '';
  if (clients) {
    ctxClients = `
=== CLIENTS EN LIGNE ===
👥 Total clients : ${clients.total_clients} | Actifs : ${clients.clients_actifs} (${clients.retention_30j}% rétention 30j)
📈 Nouveaux : ${clients.nouveaux_clients_jour} aujourd'hui | ${clients.nouveaux_clients_semaine} cette semaine | ${clients.nouveaux_clients_mois} ce mois`;
  }

  let ctxMemeJour = '';
  if (histo_meme_jour.length > 0) {
    ctxMemeJour = `
=== HISTORIQUE DES ${demain_info.jour_semaine.toUpperCase()}S PRÉCÉDENTS ===
${histo_meme_jour.map(h => `${h.jour_semaine}: CA ${h.ca}€ · Invendu ${h.taux_invendu}% · ${h.total_produit} pcs · ${h.commandes_online} cmd online`).join('\n')}`;
  }

  // Catalogue enrichi avec toutes les données nécessaires aux prévisions
  const catalogueLines = catalogue.map(p => {
    const moyInfo = p.moy_meme_jour !== null
      ? ` | moy_${demain_info.jour_semaine}: ${p.moy_meme_jour} pcs`
      : ' | pas d\'historique pour ce jour';
    return `produit_id="${p.produit_id}" ${p.emoji} ${p.nom} (${p.categorie}) | prix: ${p.prix_vente}€ | produit_hier: ${p.quantite_produite_hier} pcs | vendu: ${p.taux_vente_hier}% | invendu: ${p.invendu_hier} pcs${moyInfo}`;
  }).join('\n');

  const ctxPerformance = `
=== PERFORMANCE DU JOUR ===
Score : ${performance_globale.score_jour}/100
Tendance vs hier : ${performance_globale.tendance_vs_hier >= 0 ? '+' : ''}${performance_globale.tendance_vs_hier}%
Tendance vs même jour semaine : ${performance_globale.tendance_vs_meme_jour >= 0 ? '+' : ''}${performance_globale.tendance_vs_meme_jour}%
Top succès : ${performance_globale.top_succes.map(p => `${p.emoji} ${p.nom} (${p.taux_vente}% vendu)`).join(' · ')}
À améliorer : ${performance_globale.flops.map(p => `${p.emoji} ${p.nom} (${p.taux_invendu}% invendu)`).join(' · ')}`;

  return `Analyse la journée du ${journee.jour_semaine.toUpperCase()} et génère le rapport complet pour demain (${demain_info.jour_semaine} ${demain_info.date}).

${ctxJour}${ctxSalarial}${ctxMeteo}${ctxEvenements}${ctxCommandes}${ctxClients}

=== ${journee.jour_semaine.toUpperCase()} · SEMAINE ${journee.semaine_annee}${journee.est_weekend ? ' (WEEK-END)' : ''} ===
CA : ${journee.ca_estime}€ | Invendu : ${journee.taux_invendu}% (${journee.total_invendu}/${journee.total_produit} pcs) | Cmd online : ${journee.commandes_online}
${ctxPerformance}

=== DÉTAIL PAR PRODUIT ===
${journee.produits.map(p =>
  `${p.emoji} ${p.nom} (${p.categorie}) ${p.performance === 'excellent' ? '⭐' : p.performance === 'faible' ? '⚠️' : ''}
  Prod: ${p.production} | 10h: ${p.snapshot_10h ?? '—'} | 14h: ${p.snapshot_14h ?? '—'} | Invendu: ${p.invendu} (${p.taux_invendu}%) | Vendu: ${p.taux_vente}% | CA: ${p.ca_contribution}€`
).join('\n')}

=== MATIÈRES PREMIÈRES ===
Farine: ${journee.total_mp.farine_kg}kg | Beurre: ${journee.total_mp.beurre_kg}kg | Œufs: ${journee.total_mp.oeufs} | Sucre: ${journee.total_mp.sucre_kg}kg

=== HISTORIQUE 14 JOURS ===
${ctxHisto}
${historique_14j.map(h => `${h.est_weekend ? '[WE]' : '[SEM]'} ${h.jour_semaine}: ${h.ca}€ · ${h.taux_invendu}% inv · ${h.total_produit}pcs · ${h.commandes_online} online`).join('\n') || '(aucune donnée)'}
${ctxMemeJour}

=== CATALOGUE & BASE PRÉVISIONS POUR DEMAIN ===
⚠️ UTILISE le produit_id UUID exact dans chaque entrée de previsions_production.
⚠️ quantite_suggeree doit être un NOMBRE ENTIER ABSOLU (ex: 90), PAS un pourcentage.
⚠️ Fournis aussi quantite_min et quantite_max pour une fourchette de production.

${catalogueLines}

→ Génère le JSON complet avec TOUTES les sections.
→ Utilise TOUJOURS les vrais noms des produits dans les textes.
→ Dans previsions_production, chaque produit du catalogue DOIT avoir une entrée avec son produit_id UUID.
→ Sois précis, chaleureux et actionnable pour chaque membre de l'équipe.`;
}