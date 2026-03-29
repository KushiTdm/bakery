-- ─────────────────────────────────────────────────────────────────────────────
-- Migration Dashboard Gérant — BakeryOS
-- Version 1.0 — Mars 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- Ajoute le tracking de dernière connexion pour les employés
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. COLONNE LAST_LOGIN_AT SUR EMPLOYES
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NULL;

-- Index pour requêtes de supervision (tri par dernière connexion)
CREATE INDEX IF NOT EXISTS idx_employes_last_login
  ON public.employes(boulangerie_id, last_login_at DESC NULLS LAST);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. VÉRIFICATION FINALE
-- ═══════════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
  n_column INT;
  n_index  INT;
BEGIN
  SELECT COUNT(*) INTO n_column
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'employes'
     AND column_name  = 'last_login_at';

  IF n_column = 0 THEN
    RAISE EXCEPTION '[migration-dashboard-gerant] Colonne last_login_at non créée';
  END IF;

  SELECT COUNT(*) INTO n_index
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname  = 'idx_employes_last_login';

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS — Migration Dashboard Gérant terminée';
  RAISE NOTICE '';
  RAISE NOTICE '   Colonne last_login_at : OK';
  RAISE NOTICE '   Index last_login      : %', CASE WHEN n_index > 0 THEN 'OK' ELSE 'MANQUANT' END;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END;
$verify$;

COMMIT;