-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Seed (données de démonstration)
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
    (v_bid, 'Baguette Tradition',  'boulangerie', '🥖', 1.30, 0.35, true, true,  1, ARRAY['gluten']),
    (v_bid, 'Pain au Levain',      'boulangerie', '🍞', 4.50, 1.20, true, true,  2, ARRAY['gluten']),
    (v_bid, 'Pain aux Céréales',   'boulangerie', '🌾', 3.80, 1.00, true, true,  3, ARRAY['gluten', 'sesame']),
    (v_bid, 'Fougasse Provençale', 'boulangerie', '🫓', 3.50, 0.90, true, true,  4, ARRAY['gluten'])

  -- ── Viennoiserie ─────────────────────────────────────────────────────
  ,(v_bid, 'Croissant',            'viennoiserie', '🥐', 1.50, 0.45, true, true,  5, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Pain au Chocolat',     'viennoiserie', '🍫', 1.60, 0.50, true, true,  6, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Brioche',              'viennoiserie', '🧁', 3.20, 0.90, true, true,  7, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Chausson aux Pommes',  'viennoiserie', '🥧', 1.80, 0.55, true, true,  8, ARRAY['gluten', 'lait', 'oeufs'])

  -- ── Pâtisserie ───────────────────────────────────────────────────────
  ,(v_bid, 'Tarte au Citron',      'patisserie', '🍋', 4.80, 1.50, true, true,  9, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Éclair au Café',       'patisserie', '☕', 3.90, 1.20, true, true, 10, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Millefeuille',         'patisserie', '🎂', 4.50, 1.40, true, true, 11, ARRAY['gluten', 'lait', 'oeufs'])
  ,(v_bid, 'Paris-Brest',          'patisserie', '🎪', 4.20, 1.30, true, true, 12, ARRAY['gluten', 'lait', 'oeufs', 'fruits_a_coque'])
  ,(v_bid, 'Tarte aux Fraises',    'patisserie', '🍓', 5.20, 1.80, true, true, 13, ARRAY['gluten', 'lait', 'oeufs'])

  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ % produits insérés (ou déjà présents)', 13;

END $seed$;