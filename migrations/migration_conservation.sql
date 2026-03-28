-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration : Durée de conservation produits
-- Feature : Report inter-journées des invendus non périssables
--
-- Logique métier :
--   duree_conservation_jours = 1 → produit non reportable (baguette, croissant)
--   duree_conservation_jours = 2 → reportable J+1 (pâtisseries standards)
--   duree_conservation_jours = 3 → reportable J+1 et J+2 (gâteaux secs, entremets)
--
-- Valeurs par défaut par catégorie :
--   boulangerie  → 1 jour
--   viennoiserie → 1 jour
--   sandwich     → 1 jour
--   patisserie   → 2 jours
--
-- ✅ Idempotent : safe à relancer
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Ajout colonne sur produits ─────────────────────────────────────

ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS duree_conservation_jours INT NOT NULL DEFAULT 1
  CHECK (duree_conservation_jours BETWEEN 1 AND 7);

-- ── 2. Contrainte CHECK idempotente ───────────────────────────────────

DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT chk_duree_conservation
    CHECK (duree_conservation_jours BETWEEN 1 AND 7);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Valeurs par défaut selon catégorie (pour les produits existants) ──
-- boulangerie / viennoiserie / sandwich → 1 jour (non reportable)
-- patisserie → 2 jours (reportable J+1 par défaut)

UPDATE produits
SET duree_conservation_jours = 1
WHERE categorie IN ('boulangerie', 'viennoiserie', 'sandwich')
  AND duree_conservation_jours IS NULL;

UPDATE produits
SET duree_conservation_jours = 2
WHERE categorie = 'patisserie'
  AND duree_conservation_jours IS NULL;

-- Mise à jour des patisseries existantes qui sont encore à 1
-- (valeur DEFAULT appliquée avant cet UPDATE)
-- On ne touche pas aux valeurs déjà > 1 (personnalisées manuellement)
UPDATE produits
SET duree_conservation_jours = 2
WHERE categorie = 'patisserie'
  AND duree_conservation_jours = 1;

-- ── 4. Ajout colonne report_veille sur stocks_journaliers ─────────────
-- Tracke combien d'unités ont été reportées depuis J-1
-- Permet à Levain d'ajuster ses prévisions (ne pas re-produire ce qui est en stock)

ALTER TABLE stocks_journaliers
  ADD COLUMN IF NOT EXISTS report_veille INT NOT NULL DEFAULT 0
  CHECK (report_veille >= 0);

ALTER TABLE stocks_journaliers
  ADD COLUMN IF NOT EXISTS est_reporte BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 5. Index pour les requêtes de report ──────────────────────────────
-- Optimise la requête "chercher le stock_final de J-1 pour les produits reportables"

CREATE INDEX IF NOT EXISTS idx_stocks_report_lookup
  ON stocks_journaliers(boulangerie_id, produit_id)
  WHERE est_reporte = FALSE;

-- ── 6. Vérification finale ─────────────────────────────────────────────

DO $$
DECLARE
  n_col_produits   INT;
  n_col_stocks_rv  INT;
  n_col_stocks_er  INT;
  n_patisseries    INT;
BEGIN
  SELECT COUNT(*) INTO n_col_produits
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'produits'
     AND column_name  = 'duree_conservation_jours';

  SELECT COUNT(*) INTO n_col_stocks_rv
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'stocks_journaliers'
     AND column_name  = 'report_veille';

  SELECT COUNT(*) INTO n_col_stocks_er
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'stocks_journaliers'
     AND column_name  = 'est_reporte';

  SELECT COUNT(*) INTO n_patisseries
    FROM produits
   WHERE categorie = 'patisserie'
     AND duree_conservation_jours >= 2
     AND deleted_at IS NULL;

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ Migration conservation — Résultats';
  RAISE NOTICE '   produits.duree_conservation_jours : %', CASE WHEN n_col_produits > 0 THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   stocks_journaliers.report_veille  : %', CASE WHEN n_col_stocks_rv > 0 THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   stocks_journaliers.est_reporte    : %', CASE WHEN n_col_stocks_er > 0 THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   Pâtisseries avec durée ≥ 2j       : %', n_patisseries;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF n_col_produits  = 0 THEN RAISE EXCEPTION '❌ Colonne duree_conservation_jours manquante'; END IF;
  IF n_col_stocks_rv = 0 THEN RAISE EXCEPTION '❌ Colonne report_veille manquante'; END IF;
  IF n_col_stocks_er = 0 THEN RAISE EXCEPTION '❌ Colonne est_reporte manquante'; END IF;
END $$;

COMMIT;