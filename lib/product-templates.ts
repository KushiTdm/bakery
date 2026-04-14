// lib/product-templates.ts
// Source unique des 28 templates de produits pré-configurés.
// Utilisé par CatalogueStarter (onboarding) et TemplatePickerModal (ajout depuis modèle).

import type { ProduitDraft } from '@/hooks/use-produits-boulanger';

export interface ProduitTemplate {
  id:              string;
  nom:             string;
  categorie:       ProduitDraft['categorie'];
  emoji:           string;
  prix_vente:      number;
  cout_production: number;
  allergenes:      string[];
  /** Sélectionné par défaut dans CatalogueStarter */
  cochéParDéfaut:  boolean;
  image:           string;
}

export const PRODUCT_TEMPLATES: ProduitTemplate[] = [
  // ── Boulangerie ────────────────────────────────────────────────────────
  {
    id: 't-b1', nom: 'Baguette Tradition',  categorie: 'boulangerie',  emoji: '🥖',
    prix_vente: 1.30,  cout_production: 0.35,
    allergenes: ['gluten'],
    cochéParDéfaut: true,
    image: '/products/BaguetteTradition.jpg',
  },
  {
    id: 't-b2', nom: 'Pain de campagne',    categorie: 'boulangerie',  emoji: '🏡',
    prix_vente: 3.40,  cout_production: 0.90,
    allergenes: ['gluten'],
    cochéParDéfaut: false,
    image: '/products/Pain_de_campagne.png',
  },
  {
    id: 't-b3', nom: 'Pain aux céréales',   categorie: 'boulangerie',  emoji: '🌾',
    prix_vente: 3.80,  cout_production: 1.00,
    allergenes: ['gluten', 'sesame'],
    cochéParDéfaut: false,
    image: '/products/Pain_au_cereales.png',
  },
  {
    id: 't-b4', nom: 'Pain complet',        categorie: 'boulangerie',  emoji: '🍞',
    prix_vente: 3.20,  cout_production: 0.85,
    allergenes: ['gluten'],
    cochéParDéfaut: false,
    image: '/products/pain_complet.png',
  },
  {
    id: 't-b5', nom: 'Pain de mie',         categorie: 'boulangerie',  emoji: '🍞',
    prix_vente: 4.00,  cout_production: 1.10,
    allergenes: ['gluten', 'lait'],
    cochéParDéfaut: false,
    image: '/products/Pain_de_mie.png',
  },
  {
    id: 't-b6', nom: 'Fougasse provençale', categorie: 'boulangerie',  emoji: '🫓',
    prix_vente: 3.50,  cout_production: 0.90,
    allergenes: ['gluten'],
    cochéParDéfaut: false,
    image: '/products/fougasse_provencale.png',
  },
  // ── Viennoiserie ───────────────────────────────────────────────────────
  {
    id: 't-v1', nom: 'Croissant',            categorie: 'viennoiserie', emoji: '🥐',
    prix_vente: 1.50,  cout_production: 0.45,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: true,
    image: '/products/Croissant.png',
  },
  {
    id: 't-v2', nom: 'Croissant aux amandes',categorie: 'viennoiserie', emoji: '🥐',
    prix_vente: 2.20,  cout_production: 0.75,
    allergenes: ['gluten', 'lait', 'oeufs', 'fruits_a_coque'],
    cochéParDéfaut: false,
    image: '/products/Croissant_aux_amandes.png',
  },
  {
    id: 't-v3', nom: 'Pain au chocolat',     categorie: 'viennoiserie', emoji: '🍫',
    prix_vente: 1.60,  cout_production: 0.50,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: true,
    image: '/products/Pain_au_chocolat.png',
  },
  {
    id: 't-v4', nom: 'Pain au raisin',       categorie: 'viennoiserie', emoji: '🍇',
    prix_vente: 1.90,  cout_production: 0.60,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Pain_au_raisin.png',
  },
  {
    id: 't-v5', nom: 'Brioche dorée',        categorie: 'viennoiserie', emoji: '🥯',
    prix_vente: 4.50,  cout_production: 1.30,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Brioche_doree.png',
  },
  {
    id: 't-v6', nom: 'Chausson aux pommes',  categorie: 'viennoiserie', emoji: '🥧',
    prix_vente: 1.80,  cout_production: 0.55,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Chausson_pommes.png',
  },
  // ── Pâtisserie ─────────────────────────────────────────────────────────
  {
    id: 't-p1',  nom: 'Tarte au citron',     categorie: 'patisserie',   emoji: '🍋',
    prix_vente: 4.80,  cout_production: 1.50,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: true,
    image: '/products/Tarte_au_citron.png',
  },
  {
    id: 't-p2',  nom: 'Tarte aux fraises',   categorie: 'patisserie',   emoji: '🍓',
    prix_vente: 5.20,  cout_production: 1.80,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Tarte_au_fraises.png',
  },
  {
    id: 't-p3',  nom: 'Tarte normande',      categorie: 'patisserie',   emoji: '🍏',
    prix_vente: 4.20,  cout_production: 1.35,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/tarte_normande.png',
  },
  {
    id: 't-p4',  nom: 'Éclair au chocolat',  categorie: 'patisserie',   emoji: '🍫',
    prix_vente: 3.90,  cout_production: 1.20,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Eclair.png',
  },
  {
    id: 't-p5',  nom: 'Flan pâtissier',      categorie: 'patisserie',   emoji: '🍮',
    prix_vente: 3.50,  cout_production: 1.00,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Flan_patissier.png',
  },
  {
    id: 't-p6',  nom: 'Millefeuille',        categorie: 'patisserie',   emoji: '🎂',
    prix_vente: 4.50,  cout_production: 1.40,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Millefeuille.png',
  },
  {
    id: 't-p7',  nom: 'Paris-Brest',         categorie: 'patisserie',   emoji: '🎡',
    prix_vente: 4.20,  cout_production: 1.30,
    allergenes: ['gluten', 'lait', 'oeufs', 'fruits_a_coque'],
    cochéParDéfaut: false,
    image: '/products/Paris_Brest.png',
  },
  {
    id: 't-p8',  nom: 'Fraisier',            categorie: 'patisserie',   emoji: '🍰',
    prix_vente: 5.50,  cout_production: 2.10,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/fraisier.png',
  },
  {
    id: 't-p9',  nom: 'Galette des rois',    categorie: 'patisserie',   emoji: '👑',
    prix_vente: 18.00, cout_production: 6.00,
    allergenes: ['gluten', 'lait', 'oeufs', 'fruits_a_coque'],
    cochéParDéfaut: false,
    image: '/products/Galette_des_rois.png',
  },
  {
    id: 't-p10', nom: 'Religieuse',          categorie: 'patisserie',   emoji: '⛪',
    prix_vente: 4.00,  cout_production: 1.40,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Religieuse.png',
  },
  {
    id: 't-p11', nom: 'Saint-Honoré',        categorie: 'patisserie',   emoji: '👑',
    prix_vente: 5.80,  cout_production: 2.30,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Saint-Honore.png',
  },
  {
    id: 't-p12', nom: 'Opéra',               categorie: 'patisserie',   emoji: '🎹',
    prix_vente: 5.00,  cout_production: 1.90,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Opera.png',
  },
  {
    id: 't-p13', nom: 'Cake',                categorie: 'patisserie',   emoji: '🥮',
    prix_vente: 12.00, cout_production: 4.00,
    allergenes: ['gluten', 'lait', 'oeufs'],
    cochéParDéfaut: false,
    image: '/products/Cake.png',
  },
  // ── Snacking ───────────────────────────────────────────────────────────
  {
    id: 't-s1', nom: 'Sandwich',             categorie: 'sandwich',     emoji: '🥪',
    prix_vente: 5.50,  cout_production: 1.80,
    allergenes: ['gluten', 'lait'],
    cochéParDéfaut: false,
    image: '/products/Sandwich.png',
  },
  {
    id: 't-s2', nom: 'Panini',               categorie: 'sandwich',     emoji: '🥪',
    prix_vente: 6.00,  cout_production: 2.00,
    allergenes: ['gluten', 'lait'],
    cochéParDéfaut: false,
    image: '/products/Panini.png',
  },
  {
    id: 't-s3', nom: 'Pizza',                categorie: 'sandwich',     emoji: '🍕',
    prix_vente: 4.50,  cout_production: 1.40,
    allergenes: ['gluten', 'lait'],
    cochéParDéfaut: false,
    image: '/products/Pizza.png',
  },
];
