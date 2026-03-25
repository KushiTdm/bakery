// tests/fixtures/test-data.ts
// Données de test pour BakeryOS
// ─────────────────────────────────────────────────────────────

// ── Générateurs de données ────────────────────────────────────

export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function generateTestPassword(): string {
  // Mot de passe valide : 8+ chars, minuscule, majuscule, chiffre
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const randomStr = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `Test${randomStr}${Math.floor(Math.random() * 9000) + 1000}`;
}

export function generateTestSlug(): string {
  return `boulangerie-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function generateTestBoulangerieName(): string {
  const cities = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille', 'Nantes', 'Toulouse', 'Nice'];
  const city = cities[Math.floor(Math.random() * cities.length)];
  return `Boulangerie ${city}`;
}

// ── Données de test statiques ─────────────────────────────────

export const TEST_PASSWORD_STRONG = 'TestPass1234';
export const TEST_PASSWORD_WEAK = 'test';

export const RESERVED_SLUGS = [
  'api',
  'admin',
  'www',
  'mail',
  'ftp',
  'localhost',
  'app',
  'dashboard',
  'boulanger',
  'client',
  'auth',
  'login',
  'register',
  'reset-password',
];

export const INVALID_SLUGS = [
  'With-Uppercase',
  'with spaces',
  'with_special!',
  'with@symbol',
  'a', // trop court
];

// ── Utilisateur de test complet ───────────────────────────────

export interface TestUser {
  email: string;
  password: string;
  nom: string;
  slug: string;
}

export function createTestUser(): TestUser {
  return {
    email: generateTestEmail(),
    password: generateTestPassword(),
    nom: generateTestBoulangerieName(),
    slug: generateTestSlug(),
  };
}

// ── Produits de test ──────────────────────────────────────────

export interface TestProduit {
  id: string;
  nom: string;
  emoji: string;
  categorie: string;
  prix_vente: number;
}

export const TEST_PRODUITS: TestProduit[] = [
  { id: 'prod-1', nom: 'Baguette Tradition', emoji: '🥖', categorie: 'pains', prix_vente: 1.30 },
  { id: 'prod-2', nom: 'Croissant', emoji: '🥐', categorie: 'viennoiseries', prix_vente: 1.20 },
  { id: 'prod-3', nom: 'Pain au chocolat', emoji: '🥐', categorie: 'viennoiseries', prix_vente: 1.40 },
  { id: 'prod-4', nom: 'Éclair chocolat', emoji: '🍰', categorie: 'patisseries', prix_vente: 3.50 },
  { id: 'prod-5', nom: 'Sandwich jambon', emoji: '🥪', categorie: 'sandwichs', prix_vente: 5.00 },
];

// ── Feedback de fin de journée ────────────────────────────────

export interface TestFeedback {
  humeur: 'bien' | 'moyen' | 'difficile';
  commentaire: string;
  hasEvenement: boolean;
  evenementDesc?: string;
  evenementImpact?: 'hausse' | 'baisse';
}

export const TEST_FEEDBACK_BIEN: TestFeedback = {
  humeur: 'bien',
  commentaire: 'Bonne journée, clients satisfaits',
  hasEvenement: false,
};

export const TEST_FEEDBACK_AVEC_EVENEMENT: TestFeedback = {
  humeur: 'moyen',
  commentaire: 'Journée calme',
  hasEvenement: true,
  evenementDesc: 'Marché de Noël sur la place',
  evenementImpact: 'hausse',
};

// ── Rapport IA mock ───────────────────────────────────────────

export const MOCK_AI_RAPPORT = {
  score: 78,
  verdict: 'Bonne performance globale avec quelques ajustements possibles',
  synthese_journee: {
    resume: 'Journée solide avec un taux d\'invendu maîtrisé.',
    points_forts: ['Baguette très demandée', 'Croissants épuisés'],
    points_amelioration: ['Réduire production sandwichs le mardi'],
  },
  briefing_matin: {
    titre: 'Briefing pour demain',
    contexte_jour: 'Mercredi typique, météo clémente',
    meteo_resume: 'Ensoleillé, 18°C',
    top3_a_produire: [
      'Augmenter baguettes de 10%',
      'Maintenir croissants',
      'Réduire sandwichs de 15%',
    ],
    point_vigilance: 'Pensez à la livraison de farine à 10h',
  },
  briefing_vendeuse: {
    titre: 'Briefing Vendeuse',
    accueil_client: 'Sourire et proposer les promotions du jour',
    produits_a_mettre_en_avant: ['Éclair chocolat', 'Pain spécial'],
    message_encouragement: 'Belle journée en perspective !',
  },
  previsions_production: [
    { produit_id: 'prod-1', quantite_suggeree: 120, variation_pct: 10, raison: 'Forte demande historique' },
    { produit_id: 'prod-2', quantite_suggeree: 80, variation_pct: 0, raison: 'Demande stable' },
    { produit_id: 'prod-5', quantite_suggeree: 30, variation_pct: -15, raison: 'Baisse le mardi' },
  ],
};