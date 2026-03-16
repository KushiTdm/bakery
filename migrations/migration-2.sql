-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION 10 — Adresse dynamique + Créneaux de retrait + Config flash UI
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- Idempotent (ADD COLUMN IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Adresse boulangerie ──────────────────────────────────────────────
ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS adresse     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ville       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS code_postal TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS telephone   TEXT DEFAULT NULL;

-- Contrainte : code postal français si fourni
DO $$ BEGIN
  ALTER TABLE boulangeries
    ADD CONSTRAINT chk_code_postal
      CHECK (code_postal IS NULL OR code_postal ~ '^\d{5}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Créneaux de retrait (Click & Collect) ──────────────────────────
-- Tableau de strings "HH:MM" — géré par l'UI Paramètres
-- Valeurs par défaut : 08h, 09h, 10h
ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS creneaux_retrait TEXT[] DEFAULT ARRAY['08:00', '09:00', '10:00'];

-- ── 3. Config flash déjà présente depuis migration-complete-v1 ─────────
-- flash_heure_debut, flash_heure_fin, flash_remise_pct
-- Ces colonnes existent déjà — on ajoute juste les valeurs par défaut
-- pour les boulangeries créées avant cette migration
UPDATE boulangeries
   SET flash_heure_debut = 18
 WHERE flash_heure_debut IS NULL;

UPDATE boulangeries
   SET flash_heure_fin = 20
 WHERE flash_heure_fin IS NULL;

UPDATE boulangeries
   SET flash_remise_pct = 40
 WHERE flash_remise_pct IS NULL;

-- ── 4. Mise à jour get_paniers_flash() pour utiliser flash_heure_debut ─
-- (déjà fait dans migration-complete-v1, ici pour les setups qui ont
--  appliqué les migrations individuellement)

-- ── 5. Index pour la recherche par ville ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_boulangeries_ville
  ON boulangeries(ville)
  WHERE ville IS NOT NULL;

-- ── 6. Vérification ────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols INT;
BEGIN
  SELECT COUNT(*) INTO n_cols
    FROM information_schema.columns
   WHERE table_name = 'boulangeries'
     AND table_schema = 'public'
     AND column_name IN ('adresse', 'ville', 'code_postal', 'telephone', 'creneaux_retrait');

  RAISE NOTICE '✅ Migration 10 OK — % colonnes ajoutées à boulangeries', n_cols;
END $$;

COMMIT;