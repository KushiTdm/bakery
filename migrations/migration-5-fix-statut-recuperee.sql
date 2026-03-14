-- migrations/migration-5-fix-statut-recuperee.sql
-- ─────────────────────────────────────────────────────────────
-- BC1 FIX : Incohérence entre la contrainte CHECK (retiree)
--           et le code TypeScript (recuperee).
--
-- Stratégie :
--   1. Migrer les données existantes retiree → recuperee
--   2. Recréer la contrainte CHECK sans retiree
--
-- Exécuter dans Supabase → SQL Editor
-- Une seule fois — idempotent grâce aux IF EXISTS
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1. Migrer les lignes existantes
UPDATE commandes
   SET statut = 'recuperee'
 WHERE statut = 'retiree';

-- 2. Supprimer l'ancienne contrainte (nom issu de migration-3.sql)
ALTER TABLE commandes
  DROP CONSTRAINT IF EXISTS commandes_statut_check;

-- 3. Recréer sans 'retiree'
ALTER TABLE commandes
  ADD CONSTRAINT commandes_statut_check
    CHECK (statut IN (
      'en_attente',
      'confirmee',
      'prete',
      'recuperee',
      'annulee'
    ));

-- 4. Vérification — doit retourner 0 lignes
DO $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM commandes WHERE statut = 'retiree';
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration echouee : % lignes avec statut retiree encore presentes', n;
  END IF;
  RAISE NOTICE 'BC1 fix OK — contrainte CHECK mise a jour, aucune ligne retiree restante';
END $$;

COMMIT;