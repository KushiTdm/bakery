-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration Levain Quota par Plan
-- P0-4 : Feature Gate Levain - Limitation par plan
--
-- Plan Starter : 1 rapport IA / semaine
-- Plan Pro     : Illimité
-- Plan Multi   : Illimité
--
-- Corrections v2 :
--   - SELECT FOR UPDATE dans check_and_increment_levain_quota() pour
--     éviter la race condition entre check et increment
--   - Fusion check + increment en une seule fonction atomique
--   - Grants cohérents : toutes les fonctions en service_role uniquement
--     (appelées via admin.rpc() côté serveur, jamais depuis le client)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Colonnes de tracking quota sur boulangeries
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS levain_quota_week_start DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS levain_quota_used        INT    DEFAULT 0;

-- Initialiser les boulangeries existantes
UPDATE boulangeries
SET levain_quota_week_start = DATE_TRUNC('week', CURRENT_DATE)::DATE,
    levain_quota_used        = 0
WHERE levain_quota_week_start IS NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Fonction atomique : vérifie ET incrémente en une seule transaction
--    Utilise SELECT FOR UPDATE pour éliminer la race condition
--    entre un check et un increment séparés.
--
--    Retourne :
--      can_generate  BOOLEAN  — false si quota atteint
--      plan          TEXT
--      quota_limit   INT      — -1 = illimité
--      quota_used    INT      — après incrément si autorisé
--      quota_remaining INT    — -1 = illimité
--      week_start    DATE
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_and_increment_levain_quota(p_boulangerie_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan             TEXT;
  v_quota_week_start DATE;
  v_quota_used       INT;
  v_week_start       DATE;
  v_quota_limit      INT;
BEGIN
  -- Verrou exclusif sur la ligne pour éviter la race condition
  SELECT plan, levain_quota_week_start, levain_quota_used
  INTO   v_plan, v_quota_week_start, v_quota_used
  FROM   boulangeries
  WHERE  id = p_boulangerie_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Boulangerie introuvable', 'can_generate', false);
  END IF;

  -- Début de la semaine courante (lundi ISO)
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;

  -- Quota selon le plan
  CASE v_plan
    WHEN 'starter' THEN v_quota_limit := 1;
    WHEN 'pro'     THEN v_quota_limit := 999;
    WHEN 'multi'   THEN v_quota_limit := 999;
    ELSE                v_quota_limit := 1;
  END CASE;

  -- Réinitialiser si nouvelle semaine
  IF v_quota_week_start IS NULL OR v_quota_week_start <> v_week_start THEN
    v_quota_used       := 0;
    v_quota_week_start := v_week_start;
  END IF;

  -- Quota atteint → retourner sans incrémenter
  IF v_quota_used >= v_quota_limit THEN
    -- Mettre à jour la semaine même si on refuse (pour reset propre)
    UPDATE boulangeries
    SET    levain_quota_week_start = v_quota_week_start,
           levain_quota_used       = v_quota_used
    WHERE  id = p_boulangerie_id;

    RETURN json_build_object(
      'can_generate',    false,
      'plan',            v_plan,
      'quota_limit',     CASE WHEN v_quota_limit >= 999 THEN -1 ELSE v_quota_limit END,
      'quota_used',      v_quota_used,
      'quota_remaining', 0,
      'week_start',      v_quota_week_start
    );
  END IF;

  -- Quota disponible → incrémenter atomiquement
  v_quota_used := v_quota_used + 1;

  UPDATE boulangeries
  SET    levain_quota_week_start = v_quota_week_start,
         levain_quota_used       = v_quota_used
  WHERE  id = p_boulangerie_id;

  RETURN json_build_object(
    'can_generate',    true,
    'plan',            v_plan,
    'quota_limit',     CASE WHEN v_quota_limit >= 999 THEN -1 ELSE v_quota_limit END,
    'quota_used',      v_quota_used,
    'quota_remaining', CASE WHEN v_quota_limit >= 999 THEN -1 ELSE GREATEST(0, v_quota_limit - v_quota_used) END,
    'week_start',      v_quota_week_start
  );
END;
$$;

-- Grants : service_role uniquement — la route appelle via admin.rpc()
REVOKE ALL ON FUNCTION check_and_increment_levain_quota(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_and_increment_levain_quota(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION check_and_increment_levain_quota(UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Fonction de lecture seule du quota (pour le GET — pas d'incrément)
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_levain_quota(p_boulangerie_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan             TEXT;
  v_quota_week_start DATE;
  v_quota_used       INT;
  v_week_start       DATE;
  v_quota_limit      INT;
BEGIN
  SELECT plan, levain_quota_week_start, levain_quota_used
  INTO   v_plan, v_quota_week_start, v_quota_used
  FROM   boulangeries
  WHERE  id = p_boulangerie_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Boulangerie introuvable');
  END IF;

  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;

  CASE v_plan
    WHEN 'starter' THEN v_quota_limit := 1;
    WHEN 'pro'     THEN v_quota_limit := 999;
    WHEN 'multi'   THEN v_quota_limit := 999;
    ELSE                v_quota_limit := 1;
  END CASE;

  -- Si nouvelle semaine, le quota est reparti à 0 (lecture seule, pas d'UPDATE)
  IF v_quota_week_start IS NULL OR v_quota_week_start <> v_week_start THEN
    v_quota_used := 0;
  END IF;

  RETURN json_build_object(
    'can_generate',    v_quota_used < v_quota_limit,
    'plan',            v_plan,
    'quota_limit',     CASE WHEN v_quota_limit >= 999 THEN -1 ELSE v_quota_limit END,
    'quota_used',      v_quota_used,
    'quota_remaining', CASE WHEN v_quota_limit >= 999 THEN -1 ELSE GREATEST(0, v_quota_limit - v_quota_used) END,
    'week_start',      COALESCE(v_quota_week_start, v_week_start)
  );
END;
$$;

REVOKE ALL ON FUNCTION get_levain_quota(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_levain_quota(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_levain_quota(UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 4. Suppression des anciennes fonctions si elles existaient
-- ────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS check_levain_quota(UUID);
DROP FUNCTION IF EXISTS increment_levain_quota(UUID);

-- ────────────────────────────────────────────────────────────────────────
-- 5. Vérification
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_columns  INT;
  n_functions INT;
BEGIN
  SELECT COUNT(*) INTO n_columns
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'boulangeries'
    AND  column_name  IN ('levain_quota_week_start', 'levain_quota_used');

  SELECT COUNT(*) INTO n_functions
  FROM   information_schema.routines
  WHERE  routine_schema = 'public'
    AND  routine_name   IN ('check_and_increment_levain_quota', 'get_levain_quota');

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS — Migration Levain Quota v2';
  RAISE NOTICE '   Colonnes quota       : % / 2', n_columns;
  RAISE NOTICE '   Fonctions atomiques  : % / 2', n_functions;
  RAISE NOTICE '   Race condition       : ✅ éliminée (SELECT FOR UPDATE)';
  RAISE NOTICE '   Grants               : ✅ service_role uniquement';
  RAISE NOTICE '   Plan Starter         : 1 rapport/semaine';
  RAISE NOTICE '   Plan Pro/Multi       : Illimité';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF n_columns < 2 THEN
    RAISE EXCEPTION 'Colonnes quota manquantes (% / 2)', n_columns;
  END IF;
  IF n_functions < 2 THEN
    RAISE EXCEPTION 'Fonctions atomiques manquantes (% / 2)', n_functions;
  END IF;
END $$;

COMMIT;