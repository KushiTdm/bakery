-- ─────────────────────────────────────────────────────────────────────────────
-- Migration P2 — Améliorations sécurité et RGPD
-- Version 1.2 — Mars 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- Ordre d'exécution : après la migration complète finale
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. TABLE AUDIT_LOGS GÉNÉRIQUE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id UUID        NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action         TEXT        NOT NULL,
  entity_type    TEXT,
  entity_id      TEXT,
  details        JSONB       DEFAULT '{}'::jsonb,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_boulangerie_date
  ON public.audit_logs(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Owner : lecture de tous les logs de sa boulangerie
DROP POLICY IF EXISTS "audit_logs_owner_select" ON public.audit_logs;
CREATE POLICY "audit_logs_owner_select"
  ON public.audit_logs FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT id FROM public.boulangeries WHERE user_id = (select auth.uid())
    )
  );

-- Gerant : lecture des logs de sa boulangerie
DROP POLICY IF EXISTS "audit_logs_gerant_select" ON public.audit_logs;
CREATE POLICY "audit_logs_gerant_select"
  ON public.audit_logs FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT boulangerie_id FROM public.employes
      WHERE user_id = (select auth.uid())
        AND statut = 'actif'
        AND role = 'gerant'
    )
  );

-- INSERT : service_role uniquement — le backend logge, jamais le client
-- Pas de policy INSERT pour authenticated : empeche l'injection de faux logs

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. COLONNES ADDITIONNELLES production_forecasts (migration-forecasts-fourchette)
--    Idempotent — deja applique sur votre DB mais safe a relancer
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.production_forecasts ADD COLUMN IF NOT EXISTS quantite_min INT DEFAULT NULL;
ALTER TABLE public.production_forecasts ADD COLUMN IF NOT EXISTS quantite_max INT DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. NETTOYAGE INVITATIONS EXPIREES
--    Corrige v1.2 : CTE DELETE RETURNING pour logger avant suppression
--    Correction delimiteur : $func$ au lieu de $$ pour eviter le conflit
--    avec le bloc DO externe
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_expired_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM public.employes
    WHERE statut = 'invite'
      AND invite_expires_at < now()
      AND invite_token IS NOT NULL
    RETURNING boulangerie_id, invite_email
  ),
  logged AS (
    INSERT INTO public.audit_logs (boulangerie_id, action, entity_type, details)
    SELECT
      boulangerie_id,
      'invite_expired',
      'employe',
      jsonb_build_object('invite_email', invite_email, 'deleted_by', 'cron')
    FROM deleted
    RETURNING 1
  )
  SELECT count(*)::int INTO deleted_count FROM logged;

  RETURN COALESCE(deleted_count, 0);
END;
$func$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. INDEX ADDITIONNELS — PERFORMANCE EMPLOYES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_employes_user_statut
  ON public.employes(user_id, statut);

CREATE INDEX IF NOT EXISTS idx_employes_invite_expires
  ON public.employes(invite_expires_at)
  WHERE statut = 'invite';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. VERIFICATION FINALE
--    Note : les RAISE NOTICE avec du code SQL sont ecrits sans delimiteurs $$
--    imbriques pour eviter l'erreur de parsing PostgreSQL
-- ═══════════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
  n_table    INT;
  n_indexes  INT;
  n_function INT;
BEGIN
  SELECT COUNT(*) INTO n_table
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'audit_logs';

  IF n_table = 0 THEN
    RAISE EXCEPTION '[migration-p2] Table audit_logs non creee';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION '[migration-p2] RLS non active sur audit_logs';
  END IF;

  SELECT COUNT(*) INTO n_indexes
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN (
       'idx_employes_user_statut',
       'idx_employes_invite_expires',
       'idx_audit_logs_boulangerie_date',
       'idx_audit_logs_user_id',
       'idx_audit_logs_action'
     );

  SELECT COUNT(*) INTO n_function
    FROM information_schema.routines
   WHERE routine_schema = 'public' AND routine_name = 'cleanup_expired_invites';

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'production_forecasts'
      AND column_name  = 'quantite_min'
  ) THEN
    RAISE WARNING '[migration-p2] Colonne quantite_min manquante sur production_forecasts';
  END IF;

  RAISE NOTICE '---------------------------------------------------';
  RAISE NOTICE 'BakeryOS Migration P2 terminee';
  RAISE NOTICE '  Table audit_logs  : OK';
  RAISE NOTICE '  Indexes P2        : % / 5', n_indexes;
  RAISE NOTICE '  cleanup_expired   : %', CASE WHEN n_function > 0 THEN 'OK' ELSE 'MANQUANT' END;
  RAISE NOTICE '  quantite_min/max  : OK (idempotent)';
  RAISE NOTICE '---------------------------------------------------';
  RAISE NOTICE 'Action manuelle - activer pg_cron si besoin :';
  RAISE NOTICE 'Aller dans Supabase Dashboard > SQL Editor et executer :';
  RAISE NOTICE 'SELECT cron.schedule(cleanup-expired-invites, 0 3 * * *, SELECT public.cleanup_expired_invites());';
END;
$verify$;

COMMIT;