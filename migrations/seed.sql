-- ═══════════════════════════════════════════════════════════════════════
-- Sauve Mie — Seed (données de démonstration)
-- À exécuter APRÈS migration-complete-v1.sql
-- Exécuter dans : Supabase Dashboard → SQL Editor
--
-- Ce fichier insère des produits types pour une boulangerie existante.
-- Adapter le slug ci-dessous avant d'exécuter.
--
-- PRÉREQUIS : avoir créé un compte boulanger via /boulanger
--             (register crée automatiquement la ligne dans boulangeries)
-- ═══════════════════════════════════════════════════════════════════════

-- ⚠️  ADAPTER CE SLUG AVANT D'EXÉCUTER
DO $seed$
DECLARE
  -- Remplacer par le slug de votre boulangerie
  v_slug TEXT := 'artisan-dore';

  v_bid  UUID;
BEGIN
  SELECT id INTO v_bid FROM boulangeries WHERE slug = v_slug;

  IF v_bid IS NULL THEN
    RAISE EXCEPTION
      'Boulangerie "%" introuvable. Créez d''abord un compte sur /boulanger puis adaptez le slug.',
      v_slug;
  END IF;

  RAISE NOTICE 'Insertion des produits pour la boulangerie : % (%)', v_slug, v_bid;

  -- ── Boulangerie ──────────────────────────────────────────────────────
  INSERT INTO produits (
    boulangerie_id, nom, categorie, emoji,
    prix_vente, cout_production,
    actif_catalogue, actif_flash, ordre, allergenes
  ) VALUES
    (v_bid, 'Baguette Tradition',  'boulangerie', '🥖', 1.30, 0.35, true, true,  1, ARRAY['gluten'])
  ,(v_bid, 'Pain de campagne',     'boulangerie', '🏡', 3.40, 0.90, true, true,  2, ARRAY['gluten'])
  ,(v_bid, 'Pain aux céréales',    'boulangerie', '🌾', 3.80, 1.00, true, true,  3, ARRAY['gluten', 'sesame'])
  ,(v_bid, 'Pain complet',         'boulangerie', '🍞', 3.20, 0.85, true, true,  4, ARRAY['gluten'])
  ,(v_bid, 'Pain de mie',          'boulangerie', '🍞', 4.00, 1.10, true, true,  5, ARRAY['gluten', 'lait'])
  ,(v_bid, 'Fougasse provençale',  'boulangerie', '🫓', 3.50, 0.90, true, true,  6, ARRAY['gluten'])

  -- ── Viennoiserie ─────────────────────────────────────────────────────
  ,(v_bid, 'Croissant',            'viennoiserie', '🥐', 1.50, 0.45, true, true,  7, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Croissant aux amandes','viennoiserie', '🥐', 2.20, 0.75, true, true,  8, ARRAY['gluten', 'lait', 'oeufs', 'fruits_a_coque'])
  ,(v_bid, 'Pain au chocolat',     'viennoiserie', '🍫', 1.60, 0.50, true, true,  9, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Pain au raisin',       'viennoiserie', '🍇', 1.90, 0.60, true, true, 10, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Brioche dorée',        'viennoiserie', '🥯', 4.50, 1.30, true, true, 11, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Chausson aux pommes',  'viennoiserie', '🥧', 1.80, 0.55, true, true, 12, ARRAY['gluten', 'lait', 'oeufs'])

  -- ── Pâtisserie ───────────────────────────────────────────────────────
  ,(v_bid, 'Tarte au citron',      'patisserie', '🍋',  4.80, 1.50, true, true, 13, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Tarte aux fraises',    'patisserie', '🍓',  5.20, 1.80, true, true, 14, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Tarte normande',       'patisserie', '🍏',  4.20, 1.35, true, true, 15, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Éclair au chocolat',   'patisserie', '🍫',  3.90, 1.20, true, true, 16, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Flan pâtissier',       'patisserie', '🍮',  3.50, 1.00, true, true, 17, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Millefeuille',         'patisserie', '🎂',  4.50, 1.40, true, true, 18, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Paris-Brest',          'patisserie', '🎡',  4.20, 1.30, true, true, 19, ARRAY['gluten', 'lait', 'oeufs', 'fruits_a_coque'])
  ,(v_bid, 'Fraisier',             'patisserie', '🍰',  5.50, 2.10, true, true, 20, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Galette des rois',     'patisserie', '👑', 18.00, 6.00, true, true, 21, ARRAY['gluten', 'lait', 'oeufs', 'fruits_a_coque'])
  ,(v_bid, 'Religieuse',           'patisserie', '⛪',  4.00, 1.40, true, true, 22, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Saint-Honoré',         'patisserie', '👑',  5.80, 2.30, true, true, 23, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Opéra',                'patisserie', '🎹',  5.00, 1.90, true, true, 24, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Cake',                 'patisserie', '🥮', 12.00, 4.00, true, true, 25, ARRAY['gluten', 'lait', 'oeufs'])

  -- ── Snacking ─────────────────────────────────────────────────────────
  ,(v_bid, 'Sandwich',             'sandwich', '🥪', 5.50, 1.80, true, true, 26, ARRAY['gluten', 'lait'])
  ,(v_bid, 'Panini',               'sandwich', '🥪', 6.00, 2.00, true, true, 27, ARRAY['gluten', 'lait'])
  ,(v_bid, 'Pizza',                'sandwich', '🍕', 4.50, 1.40, true, true, 28, ARRAY['gluten', 'lait'])

  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ % produits insérés (ou déjà présents)', 28;

END $seed$;


-- ── Seed recettes_produits ────────────────────────────────────────────────
-- Niveau 3 : fallbacks par catégorie (remplacent COEFFS_MP)
-- Valeurs en g/ml par unité
INSERT INTO recettes_produits
  (categorie, nom_recette, farine_g, beurre_g, oeufs_n, sucre_g, sel_g, levure_boulangere_g, eau_ml, source)
VALUES
  ('boulangerie',  NULL, 180, 0,  0,   3,  3.5, 2,   110, 'default'),
  ('viennoiserie', NULL, 50,  28, 0.3, 8,  1,   1,   15,  'default'),
  ('patisserie',   NULL, 40,  25, 1,   20, 0.5, 0,   10,  'default'),
  ('sandwich',     NULL, 60,  5,  0,   0,  2,   1,   35,  'default')
ON CONFLICT DO NOTHING;

-- Niveau 2 : templates globaux nommés (20 produits courants)
-- Valeurs moyennes par unité produite, pertes ~15% incluses
INSERT INTO recettes_produits
  (nom_recette, categorie,
   farine_g, beurre_g, oeufs_n, sucre_g, sel_g,
   levure_boulangere_g, levain_g, eau_ml, lait_ml, chocolat_g, huile_ml, creme_g,
   source)
VALUES
  ('Baguette Tradition',    'boulangerie',  450, 5,   0,   5,  10,  15, 0,   300, 0,   0,  0,  0,  'default'),
  ('Baguette Classique',    'boulangerie',  400, 5,   0,   5,  9,   12, 0,   270, 0,   0,  0,  0,  'default'),
  ('Pain au Levain',        'boulangerie',  600, 10,  0,   10, 12,  5,  80,  400, 0,   0,  0,  0,  'default'),
  ('Pain de Campagne',      'boulangerie',  550, 10,  0,   8,  11,  10, 40,  380, 0,   0,  0,  0,  'default'),
  ('Pain aux Céréales',     'boulangerie',  500, 15,  0,   15, 10,  12, 0,   350, 0,   0,  0,  0,  'default'),
  ('Pain Complet',          'boulangerie',  550, 10,  0,   10, 11,  10, 0,   400, 0,   0,  0,  0,  'default'),
  ('Pain de Mie',           'boulangerie',  350, 50,  0.2, 30, 7,   10, 0,   220, 150, 0,  0,  0,  'default'),
  ('Fougasse Provençale',   'boulangerie',  400, 0,   0,   20, 8,   10, 0,   250, 0,   0,  50, 0,  'default'),
  ('Croissant',             'viennoiserie', 250, 150, 0.1, 40, 5,   8,  0,   120, 50,  0,  0,  0,  'default'),
  ('Pain au Chocolat',      'viennoiserie', 280, 160, 0.1, 50, 5,   9,  0,   130, 50,  40, 0,  0,  'default'),
  ('Brioche',               'viennoiserie', 300, 200, 0.3, 80, 5,   12, 0,   100, 100, 0,  0,  0,  'default'),
  ('Chausson aux Pommes',   'viennoiserie', 220, 120, 0.2, 60, 3,   6,  0,   100, 50,  0,  0,  0,  'default'),
  ('Viennoiserie Diverse',  'viennoiserie', 260, 140, 0.2, 50, 4,   8,  0,   120, 50,  0,  0,  0,  'default'),
  ('Flan Pâtissier',        'patisserie',   200, 80,  1.5, 100, 3,  0,  0,   0,   300, 0,  0,  0,  'default'),
  ('Éclair au Café',        'patisserie',   180, 100, 1,   70,  2,  0,  0,   150, 60,  0,  0,  200,'default'),
  ('Millefeuille',          'patisserie',   200, 150, 1,   80,  2,  0,  0,   120, 30,  0,  0,  250,'default'),
  ('Paris-Brest',           'patisserie',   250, 180, 2,   100, 3,  0,  0,   150, 10,  0,  0,  150,'default'),
  ('Tarte aux Fraises',     'patisserie',   220, 120, 1,   60,  2,  0,  0,   100, 30,  0,  0,  80, 'default'),
  ('Pâtisserie Fine',       'patisserie',   200, 120, 1,   70,  2,  0,  0,   120, 20,  0,  0,  100,'default'),
  ('Sandwich Jambon-Beurre','sandwich',     150, 30,  0,   5,   4,  5,  0,   100, 0,   0,  0,  0,  'default'),
  ('Brioche dorée',         'viennoiserie', 300, 180, 2,   60,  3,  8,  0,   50,  50,  0,  0,  0,  'default'),
  ('Croissant aux amandes', 'viennoiserie', 250, 150, 0.1, 60,  4,  8,  0,   120, 50,  0,  0,  0,  'default'),
  ('Pain au raisin',        'viennoiserie', 250, 80,  0.1, 40,  3,  6,  0,   100, 50,  0,  0,  100,'default'),
  ('Cake',                  'patisserie',   250, 200, 4,   200, 2,  0,  0,   0,   0,   0,  0,  0,  'default'),
  ('Fraisier',              'patisserie',   150, 80,  2,   100, 1,  0,  0,   0,   20,  0,  0,  200,'default'),
  ('Galette des rois',      'patisserie',   400, 300, 2,   150, 2,  0,  0,   0,   0,   0,  0,  0,  'default'),
  ('Opéra',                 'patisserie',   80,  150, 3,   120, 1,  0,  0,   0,   20,  100,0,  0,  'default'),
  ('Religieuse',            'patisserie',   150, 100, 3,   80,  2,  0,  0,   150, 60,  0,  0,  200,'default'),
  ('Saint-Honoré',          'patisserie',   200, 120, 2,   100, 2,  0,  0,   150, 20,  0,  0,  150,'default'),
  ('Panini',                'sandwich',     180, 20,  0,   5,   4,  6,  0,   100, 0,   0,  0,  0,  'default'),
  ('Pizza',                 'sandwich',     200, 10,  0,   5,   4,  6,  0,   120, 0,   0,  0,  0,  'default'),
  ('Tarte normande',        'patisserie',   200, 120, 2,   80,  2,  0,  0,   0,   20,  0,  0,  100,'default'),
  ('Flan pâtissier',        'patisserie',   100, 40,  4,   150, 2,  0,  0,   0,   500, 0,  0,  0,  'default')
ON CONFLICT DO NOTHING;