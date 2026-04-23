-- ─────────────────────────────────────────────────────────────
-- migration-rapport-mensuel.sql
-- Ajoute le support du rapport mensuel + cache quartier Google Places
-- Idempotent : peut être ré-exécuté sans effet de bord.
-- ─────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- 1) Extension ai_rapports : type (quotidien | mensuel) + mois_reference
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.ai_rapports
  ADD COLUMN IF NOT EXISTS type            text NOT NULL DEFAULT 'quotidien',
  ADD COLUMN IF NOT EXISTS mois_reference  date;

-- Contrainte de type (les anciens rapports restent 'quotidien')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_rapports_type'
  ) THEN
    ALTER TABLE public.ai_rapports
      ADD CONSTRAINT chk_ai_rapports_type
      CHECK (type = ANY (ARRAY['quotidien','mensuel']));
  END IF;
END$$;

-- Pour un rapport mensuel, mois_reference est obligatoire et doit être le 1er du mois
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_rapports_mois_reference'
  ) THEN
    ALTER TABLE public.ai_rapports
      ADD CONSTRAINT chk_ai_rapports_mois_reference
      CHECK (
        (type = 'quotidien' AND mois_reference IS NULL) OR
        (type = 'mensuel'   AND mois_reference IS NOT NULL AND EXTRACT(day FROM mois_reference) = 1)
      );
  END IF;
END$$;

-- Migrer l'UNIQUE (boulangerie_id, date) pour inclure type
-- (on garde la clé date pour quotidien, et mensuel utilise mois_reference)
DO $$
DECLARE
  cons_name text;
BEGIN
  -- Cherche toute contrainte UNIQUE qui porte exactement sur (boulangerie_id, date)
  SELECT tc.constraint_name INTO cons_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema    = kcu.table_schema
  WHERE tc.table_schema   = 'public'
    AND tc.table_name     = 'ai_rapports'
    AND tc.constraint_type = 'UNIQUE'
  GROUP BY tc.constraint_name
  HAVING array_agg(kcu.column_name::text ORDER BY kcu.column_name::text)
       = ARRAY['boulangerie_id','date']::text[]
  LIMIT 1;

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_rapports DROP CONSTRAINT %I', cons_name);
  END IF;
END$$;

-- Nouvelle unicité : un seul rapport par (boulangerie, date, type)
-- Pour le mensuel, on ajoute aussi une unicité sur mois_reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_rapports_unique_daily
  ON public.ai_rapports (boulangerie_id, date)
  WHERE type = 'quotidien';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_rapports_unique_monthly
  ON public.ai_rapports (boulangerie_id, mois_reference)
  WHERE type = 'mensuel';

-- Index de lecture pour l'historique mensuel
CREATE INDEX IF NOT EXISTS idx_ai_rapports_type_mois
  ON public.ai_rapports (boulangerie_id, type, mois_reference DESC)
  WHERE type = 'mensuel';


-- ═══════════════════════════════════════════════════════════
-- 2) neighborhood_cache : cache Google Places (TTL 30 jours)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.neighborhood_cache (
  boulangerie_id  uuid PRIMARY KEY REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  data            jsonb,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL
);

-- Relaxe data à nullable pour permettre le tracking des tentatives échouées
ALTER TABLE public.neighborhood_cache ALTER COLUMN data DROP NOT NULL;

-- Colonnes anti-boucle + anti-explosion de facture Google Places
ALTER TABLE public.neighborhood_cache
  ADD COLUMN IF NOT EXISTS fetch_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error      text;

CREATE INDEX IF NOT EXISTS idx_neighborhood_cache_expires
  ON public.neighborhood_cache (expires_at);

ALTER TABLE public.neighborhood_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'neighborhood_cache'
      AND policyname = 'neighborhood_cache_owner_select'
  ) THEN
    CREATE POLICY neighborhood_cache_owner_select ON public.neighborhood_cache FOR SELECT
      USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'neighborhood_cache'
      AND policyname = 'neighborhood_cache_owner_insert'
  ) THEN
    CREATE POLICY neighborhood_cache_owner_insert ON public.neighborhood_cache FOR INSERT
      WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'neighborhood_cache'
      AND policyname = 'neighborhood_cache_owner_update'
  ) THEN
    CREATE POLICY neighborhood_cache_owner_update ON public.neighborhood_cache FOR UPDATE
      USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
  END IF;
END$$;


-- ═══════════════════════════════════════════════════════════
-- 3) Quota mensuel Levain (séparé du quota hebdo pour éviter la collision)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.boulangeries
  ADD COLUMN IF NOT EXISTS levain_quota_month_start  date,
  ADD COLUMN IF NOT EXISTS levain_quota_monthly_used integer NOT NULL DEFAULT 0;


-- ═══════════════════════════════════════════════════════════
-- 4) pg_cron : auto-déclenchement le 1er de chaque mois à 06:00 UTC
--    Dépend de pg_cron + pg_net (extensions Supabase).
-- ═══════════════════════════════════════════════════════════

-- Active les extensions si disponibles (sans casser si déjà présentes ou absentes)
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — cron job skipped';
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net not available — http trigger will be no-op';
  END;
END$$;

-- Déclare le job (idempotent via cron.schedule qui remplace le job existant)
-- Le job appelle l'endpoint /api/boulanger/ai/rapport-mensuel/cron authentifié
-- par l'en-tête x-internal-secret = app.settings.internal_api_secret.
DO $$
DECLARE
  app_url text;
  secret text;
BEGIN
  -- Vérifie que pg_cron est bien installé
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron absent — skip job scheduling';
    RETURN;
  END IF;

  BEGIN
    app_url := current_setting('app.settings.app_url', true);
    secret  := current_setting('app.settings.internal_api_secret', true);
  EXCEPTION WHEN OTHERS THEN
    app_url := NULL;
    secret  := NULL;
  END;

  IF app_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'app.settings.app_url ou app.settings.internal_api_secret non défini — job créé en placeholder';
    app_url := COALESCE(app_url, 'https://REPLACE_ME');
    secret  := COALESCE(secret,  'REPLACE_ME');
  END IF;

  -- Remplace le job s'il existe déjà
  PERFORM cron.unschedule(jobid)
  FROM cron.job WHERE jobname = 'rapport-mensuel-monthly';

  PERFORM cron.schedule(
    'rapport-mensuel-monthly',
    '0 6 1 * *',
    format($f$
      SELECT net.http_post(
        url := %L || '/api/boulanger/ai/rapport-mensuel/cron',
        headers := jsonb_build_object(
          'Content-Type',       'application/json',
          'x-internal-secret',  %L
        ),
        body := '{}'::jsonb
      );
    $f$, app_url, secret)
  );
END$$;
