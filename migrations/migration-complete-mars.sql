-- =============================================================================
-- SAUVE MIE — MIGRATION COMPLÈTE (schéma uniquement, sans seed)
-- Généré le 2026-04-14 depuis le projet rtmxpaluwoufgfkpbvwk
-- =============================================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- FONCTIONS UTILITAIRES (triggers)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_meteo_updated_at()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_push_subscription_timestamp()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.set_jour_semaine()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.jour_semaine := EXTRACT(DOW FROM NEW.date)::SMALLINT;
  RETURN NEW;
END; $$;


-- =============================================================================
-- FONCTIONS MÉTIER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_employee_boulangerie_id()
  RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN (SELECT boulangerie_id FROM employes
          WHERE user_id = auth.uid() AND statut = 'actif' LIMIT 1);
END; $$;

CREATE OR REPLACE FUNCTION public.check_boulanger_access(p_user_id uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = p_user_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT boulangerie_id INTO v_id FROM employes
  WHERE user_id = p_user_id AND statut = 'actif' LIMIT 1;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_current_user_access()
  RETURNS TABLE(boulangerie_id uuid, boulangerie_nom text, boulangerie_slug text,
                boulangerie_plan text, boulangerie_actif boolean, user_role text,
                custom_permissions jsonb, membre_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT b.id, b.nom, b.slug, b.plan, b.actif,
    'owner'::TEXT, '{}'::JSONB, NULL::UUID
  FROM boulangeries b WHERE b.user_id = auth.uid() LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT b.id, b.nom, b.slug, b.plan, b.actif,
    e.role::TEXT, COALESCE(e.permissions, '{}'), e.id
  FROM employes e
  JOIN boulangeries b ON b.id = e.boulangerie_id
  WHERE e.user_id = auth.uid() AND e.statut = 'actif' LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.count_active_members(p_boulangerie_id uuid)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count INT;
BEGIN
  SELECT 1 + COUNT(*)::INT INTO v_count
  FROM employes WHERE boulangerie_id = p_boulangerie_id AND statut = 'actif';
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.get_team_members(p_boulangerie_id uuid)
  RETURNS TABLE(membre_id uuid, user_id uuid, role text, statut text,
                permissions jsonb, invite_email text,
                invite_expires_at timestamp with time zone,
                prenom text, created_at timestamp with time zone)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF check_boulanger_access(auth.uid()) != p_boulangerie_id THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN QUERY
  SELECT e.id, e.user_id, e.role, e.statut,
    COALESCE(e.permissions, '{}'), e.invite_email,
    e.invite_expires_at, e.prenom, e.created_at
  FROM employes e
  WHERE e.boulangerie_id = p_boulangerie_id
  ORDER BY CASE e.statut WHEN 'actif' THEN 1 WHEN 'invite' THEN 2 ELSE 3 END, e.created_at;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_tour()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Boulangerie introuvable'; END IF;
  UPDATE boulangeries SET tour_completed_at = NOW() WHERE id = v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reset_tour()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Boulangerie introuvable'; END IF;
  UPDATE boulangeries SET tour_completed_at = NULL WHERE id = v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_onboarding()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Boulangerie introuvable'; END IF;
  UPDATE boulangeries SET onboarding_completed_at = NOW() WHERE id = v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.check_and_increment_levain_quota(p_boulangerie_id uuid)
  RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_plan             TEXT;
  v_quota_week_start DATE;
  v_quota_used       INT;
  v_week_start       DATE;
  v_quota_limit      INT;
BEGIN
  SELECT plan, levain_quota_week_start, levain_quota_used
  INTO   v_plan, v_quota_week_start, v_quota_used
  FROM   boulangeries WHERE id = p_boulangerie_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Boulangerie introuvable', 'can_generate', false);
  END IF;

  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;

  CASE v_plan
    WHEN 'starter' THEN v_quota_limit := 1;
    WHEN 'pro'     THEN v_quota_limit := 999;
    WHEN 'multi'   THEN v_quota_limit := 999;
    ELSE                v_quota_limit := 1;
  END CASE;

  IF v_quota_week_start IS NULL OR v_quota_week_start <> v_week_start THEN
    v_quota_used       := 0;
    v_quota_week_start := v_week_start;
  END IF;

  IF v_quota_used >= v_quota_limit THEN
    UPDATE boulangeries
    SET levain_quota_week_start = v_quota_week_start, levain_quota_used = v_quota_used
    WHERE id = p_boulangerie_id;
    RETURN json_build_object(
      'can_generate', false, 'plan', v_plan,
      'quota_limit', CASE WHEN v_quota_limit >= 999 THEN -1 ELSE v_quota_limit END,
      'quota_used', v_quota_used, 'quota_remaining', 0,
      'week_start', v_quota_week_start
    );
  END IF;

  v_quota_used := v_quota_used + 1;
  UPDATE boulangeries
  SET levain_quota_week_start = v_quota_week_start, levain_quota_used = v_quota_used
  WHERE id = p_boulangerie_id;

  RETURN json_build_object(
    'can_generate', true, 'plan', v_plan,
    'quota_limit', CASE WHEN v_quota_limit >= 999 THEN -1 ELSE v_quota_limit END,
    'quota_used', v_quota_used,
    'quota_remaining', CASE WHEN v_quota_limit >= 999 THEN -1
                            ELSE GREATEST(0, v_quota_limit - v_quota_used) END,
    'week_start', v_quota_week_start
  );
END; $$;

CREATE OR REPLACE FUNCTION public.get_levain_quota(p_boulangerie_id uuid)
  RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_plan             TEXT;
  v_quota_week_start DATE;
  v_quota_used       INT;
  v_week_start       DATE;
  v_quota_limit      INT;
BEGIN
  SELECT plan, levain_quota_week_start, levain_quota_used
  INTO   v_plan, v_quota_week_start, v_quota_used
  FROM   boulangeries WHERE id = p_boulangerie_id;

  IF NOT FOUND THEN RETURN json_build_object('error', 'Boulangerie introuvable'); END IF;

  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;

  CASE v_plan
    WHEN 'starter' THEN v_quota_limit := 1;
    WHEN 'pro'     THEN v_quota_limit := 999;
    WHEN 'multi'   THEN v_quota_limit := 999;
    ELSE                v_quota_limit := 1;
  END CASE;

  IF v_quota_week_start IS NULL OR v_quota_week_start <> v_week_start THEN
    v_quota_used := 0;
  END IF;

  RETURN json_build_object(
    'can_generate', v_quota_used < v_quota_limit, 'plan', v_plan,
    'quota_limit', CASE WHEN v_quota_limit >= 999 THEN -1 ELSE v_quota_limit END,
    'quota_used', v_quota_used,
    'quota_remaining', CASE WHEN v_quota_limit >= 999 THEN -1
                            ELSE GREATEST(0, v_quota_limit - v_quota_used) END,
    'week_start', COALESCE(v_quota_week_start, v_week_start)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_invites()
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM employes
    WHERE statut = 'invite'
      AND invite_expires_at < now()
      AND invite_token IS NOT NULL
    RETURNING boulangerie_id, invite_email
  ),
  logged AS (
    INSERT INTO audit_logs (boulangerie_id, action, entity_type, details)
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
END; $$;

CREATE OR REPLACE FUNCTION public.decrypt_text(ciphertext bytea, key text)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN pgp_sym_decrypt(ciphertext, key);
END; $$;

CREATE OR REPLACE FUNCTION public.get_airtable_credentials(p_boulangerie_id uuid, p_encryption_key text)
  RETURNS TABLE(api_key text, base_id text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN airtable_api_key_enc IS NOT NULL
        THEN pgp_sym_decrypt(airtable_api_key_enc, p_encryption_key)
      ELSE airtable_api_key
    END AS api_key,
    CASE
      WHEN airtable_base_id_enc IS NOT NULL
        THEN pgp_sym_decrypt(airtable_base_id_enc, p_encryption_key)
      ELSE airtable_base_id
    END AS base_id
  FROM boulangeries
  WHERE id = p_boulangerie_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_catalogue_public(p_slug text)
  RETURNS TABLE(id uuid, nom text, description text, categorie text, emoji text,
                prix_vente numeric, image_url text, allergenes text[], actif_flash boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  v_storage_url    TEXT;
BEGIN
  SELECT b.id, b.actif INTO v_boulangerie_id, v_actif
    FROM boulangeries b WHERE b.slug = p_slug LIMIT 1;
  IF v_boulangerie_id IS NULL OR NOT v_actif THEN RETURN; END IF;
  v_storage_url := current_setting('app.supabase_url', TRUE)
                   || '/storage/v1/object/public/produits-photos/';
  RETURN QUERY
    SELECT p.id, p.nom, p.description, p.categorie, p.emoji, p.prix_vente,
      CASE WHEN p.image_storage_path IS NOT NULL
        THEN v_storage_url || p.image_storage_path
        ELSE p.image_url END AS image_url,
      COALESCE(p.allergenes, '{}') AS allergenes,
      p.actif_flash
    FROM produits p
   WHERE p.boulangerie_id  = v_boulangerie_id
     AND p.actif_catalogue = TRUE
     AND p.deleted_at      IS NULL
     AND (p.disponible_du IS NULL
          OR (CURRENT_DATE >= p.disponible_du AND CURRENT_DATE <= p.disponible_au))
   ORDER BY p.categorie, p.ordre, p.nom;
END; $$;

CREATE OR REPLACE FUNCTION public.get_paniers_flash(p_slug text)
  RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  v_timezone       TEXT;
  v_now_local      TIMESTAMPTZ;
  v_today          DATE;
  v_heure          INT;
  v_heure_debut    INT;
  v_heure_fin      INT;
  v_remise         INT;
  v_invendus       JSON;
  v_nb_paniers     INT     := 0;
  v_flash_actif    BOOLEAN := FALSE;
BEGIN
  SELECT b.id, b.actif,
         COALESCE(b.timezone, 'Europe/Paris'),
         b.flash_heure_debut, b.flash_heure_fin, b.flash_remise_pct
    INTO v_boulangerie_id, v_actif, v_timezone,
         v_heure_debut, v_heure_fin, v_remise
    FROM boulangeries b WHERE b.slug = p_slug LIMIT 1;

  v_heure_debut := COALESCE(v_heure_debut, 18);
  v_heure_fin   := COALESCE(v_heure_fin,   20);
  v_remise      := COALESCE(v_remise,       40);

  IF v_boulangerie_id IS NULL OR NOT v_actif THEN
    RETURN json_build_object(
      'flashActif', FALSE, 'heureDebut', v_heure_debut,
      'heureFin', v_heure_fin, 'remise', v_remise,
      'nbPaniers', 0, 'invendus', '[]'::json
    );
  END IF;

  v_now_local   := NOW() AT TIME ZONE v_timezone;
  v_today       := v_now_local::DATE;
  v_heure       := EXTRACT(HOUR FROM v_now_local)::INT;
  v_flash_actif := (v_heure >= v_heure_debut AND v_heure < v_heure_fin);

  IF NOT v_flash_actif THEN
    RETURN json_build_object(
      'flashActif', FALSE, 'heureDebut', v_heure_debut,
      'heureFin', v_heure_fin, 'remise', v_remise,
      'nbPaniers', 0, 'invendus', '[]'::json
    );
  END IF;

  SELECT COUNT(*)::INT,
    json_agg(json_build_object(
      'nom',          pf.produit_nom,
      'emoji',        pf.produit_emoji,
      'categorie',    pf.categorie,
      'prixOriginal', pf.prix_original,
      'prixFlash',    pf.prix_flash,
      'quantite',     pf.quantite_restante,
      'allergenes',   COALESCE(pf.allergenes, '{}')
    ) ORDER BY pf.categorie, pf.produit_nom)
  INTO v_nb_paniers, v_invendus
  FROM paniers_flash pf
  WHERE pf.boulangerie_id    = v_boulangerie_id
    AND pf.date              = v_today
    AND pf.actif             = TRUE
    AND pf.quantite_restante > 0;

  RETURN json_build_object(
    'flashActif', v_flash_actif,
    'heureDebut', v_heure_debut,
    'heureFin',   v_heure_fin,
    'remise',     v_remise,
    'nbPaniers',  COALESCE(v_nb_paniers, 0),
    'invendus',   COALESCE(v_invendus, '[]'::json)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.acheter_paniers_flash(
    p_boulangerie_id uuid, p_date date, p_produit_ids text[])
  RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_id     TEXT;
  v_row    RECORD;
  v_result JSONB := '[]'::JSONB;
BEGIN
  FOREACH v_id IN ARRAY p_produit_ids LOOP
    UPDATE paniers_flash
    SET quantite_restante = quantite_restante - 1,
        updated_at = NOW()
    WHERE boulangerie_id    = p_boulangerie_id
      AND date              = p_date
      AND produit_id        = v_id
      AND actif             = TRUE
      AND quantite_restante > 0
    RETURNING produit_id, produit_nom, produit_emoji, categorie,
              prix_original, prix_flash, quantite_restante
    INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produit épuisé ou indisponible: %', v_id
        USING ERRCODE = 'P0002';
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'produit_id',    v_row.produit_id,
      'produit_nom',   v_row.produit_nom,
      'emoji',         v_row.produit_emoji,
      'categorie',     v_row.categorie,
      'prix_original', v_row.prix_original,
      'prix_flash',    v_row.prix_flash
    ));
  END LOOP;

  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_fallback_production(
    p_boulangerie_id uuid, p_jour_semaine smallint, p_date_avant date)
  RETURNS TABLE(journee_id uuid, journee_date date, produit_id text,
                produit_nom text, production integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_journee_id   UUID;
  v_journee_date DATE;
BEGIN
  SELECT j.id, j.date INTO v_journee_id, v_journee_date
  FROM journees j
  WHERE j.boulangerie_id = p_boulangerie_id
    AND j.jour_semaine   = p_jour_semaine
    AND j.date           < p_date_avant
    AND j.cloturee       = TRUE
  ORDER BY j.date DESC
  LIMIT 1;

  IF v_journee_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT v_journee_id, v_journee_date, sj.produit_id, sj.produit_nom, sj.production
    FROM stocks_journaliers sj
    WHERE sj.journee_id = v_journee_id
      AND sj.production > 0;
END; $$;

-- Fonction verifier_stock_commande (version finale avec date_retrait)
CREATE OR REPLACE FUNCTION public.verifier_stock_commande(
    p_boulangerie_id uuid,
    p_date date,
    p_lignes jsonb,
    p_timezone text DEFAULT 'Europe/Paris'::text,
    p_client_prenom text DEFAULT NULL::text,
    p_client_email text DEFAULT NULL::text,
    p_client_telephone text DEFAULT NULL::text,
    p_heure_retrait time without time zone DEFAULT NULL::time without time zone,
    p_notes text DEFAULT NULL::text,
    p_montant_total numeric DEFAULT NULL::numeric,
    p_date_retrait date DEFAULT NULL::date)
  RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_journee_id     UUID;
  v_ligne          JSONB;
  v_produit_id     TEXT;
  v_produit_nom    TEXT;
  v_quantite       INT;
  v_production     INT;
  v_report         INT;
  v_total_prod     INT;
  v_reserved_cc    INT;
  v_reserved_flash INT;
  v_disponible     INT;
  v_indisponibles  TEXT := '';
  v_day_start      TIMESTAMPTZ;
  v_day_end        TIMESTAMPTZ;
  v_commande_id    UUID;
  v_effective_date DATE;
BEGIN
  v_effective_date := COALESCE(p_date_retrait, p_date);

  IF v_effective_date > p_date THEN
    IF p_client_prenom IS NOT NULL THEN
      INSERT INTO commandes (
        boulangerie_id, client_prenom, client_email, client_telephone,
        heure_retrait, notes, montant_total, statut, lignes, date_retrait
      ) VALUES (
        p_boulangerie_id, p_client_prenom, p_client_email, p_client_telephone,
        p_heure_retrait, p_notes, p_montant_total, 'en_attente', p_lignes,
        v_effective_date
      ) RETURNING id INTO v_commande_id;
    END IF;
    RETURN v_commande_id;
  END IF;

  v_day_start := (p_date::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone;
  v_day_end   := ((p_date + 1)::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone;

  SELECT id INTO v_journee_id
  FROM journees
  WHERE boulangerie_id = p_boulangerie_id AND date = p_date;

  IF v_journee_id IS NULL THEN
    RAISE EXCEPTION 'La production du jour n''a pas encore été saisie.'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_produit_id  := v_ligne->>'produit_id';
    v_produit_nom := v_ligne->>'produit_nom';
    v_quantite    := (v_ligne->>'quantite')::INT;

    SELECT COALESCE(sj.production, 0), COALESCE(sj.report_veille, 0)
    INTO v_production, v_report
    FROM stocks_journaliers sj
    WHERE sj.journee_id = v_journee_id AND sj.produit_id = v_produit_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_indisponibles := v_indisponibles
        || v_produit_nom || ' : produit non disponible aujourd''hui|';
      CONTINUE;
    END IF;

    v_total_prod := v_production + v_report;

    SELECT COALESCE(SUM((l->>'quantite')::INT), 0) INTO v_reserved_cc
    FROM commandes c, jsonb_array_elements(c.lignes) AS l
    WHERE c.boulangerie_id = p_boulangerie_id
      AND c.created_at >= v_day_start AND c.created_at < v_day_end
      AND c.statut IN ('en_attente', 'confirmee', 'prete', 'recuperee')
      AND (c.date_retrait IS NULL OR c.date_retrait = p_date)
      AND l->>'produit_id' = v_produit_id;

    SELECT COALESCE(SUM(quantite_initiale), 0) INTO v_reserved_flash
    FROM paniers_flash
    WHERE boulangerie_id = p_boulangerie_id AND date = p_date
      AND produit_id = v_produit_id AND actif = TRUE;

    v_disponible := v_total_prod - v_reserved_cc - v_reserved_flash;

    IF v_quantite > v_disponible THEN
      v_indisponibles := v_indisponibles
        || v_produit_nom || ' : '
        || GREATEST(v_disponible, 0) || ' disponible(s), '
        || v_quantite || ' demandé(s)|';
    END IF;
  END LOOP;

  IF v_indisponibles <> '' THEN
    RAISE EXCEPTION 'Stock insuffisant|%', v_indisponibles USING ERRCODE = 'P0002';
  END IF;

  IF p_client_prenom IS NOT NULL THEN
    INSERT INTO commandes (
      boulangerie_id, client_prenom, client_email, client_telephone,
      heure_retrait, notes, montant_total, statut, lignes, date_retrait
    ) VALUES (
      p_boulangerie_id, p_client_prenom, p_client_email, p_client_telephone,
      p_heure_retrait, p_notes, p_montant_total, 'en_attente', p_lignes,
      v_effective_date
    ) RETURNING id INTO v_commande_id;
  END IF;

  RETURN v_commande_id;
END; $$;


-- =============================================================================
-- TABLES
-- =============================================================================

-- boulangeries
CREATE TABLE IF NOT EXISTS public.boulangeries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nom                       text NOT NULL,
  slug                      text NOT NULL UNIQUE,
  email_contact             text,
  plan                      text DEFAULT 'starter'
                              CHECK (plan = ANY (ARRAY['starter','pro','multi','trial'])),
  actif                     boolean DEFAULT true,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  stripe_customer_id        text,
  stripe_subscription_id    text,
  trial_ends_at             timestamptz,
  stripe_status             text NOT NULL DEFAULT 'inactive'
                              CONSTRAINT chk_stripe_status
                              CHECK (stripe_status = ANY (ARRAY['inactive','trialing','active','past_due','canceled','unpaid'])),
  tour_completed_at         timestamptz,
  flash_heure_debut         integer NOT NULL DEFAULT 18
                              CONSTRAINT chk_flash_heure_debut CHECK (flash_heure_debut >= 0 AND flash_heure_debut <= 23),
  flash_heure_fin           integer NOT NULL DEFAULT 20
                              CONSTRAINT chk_flash_heure_fin CHECK (flash_heure_fin >= 1 AND flash_heure_fin <= 24),
  flash_remise_pct          integer NOT NULL DEFAULT 40
                              CONSTRAINT chk_flash_remise_pct CHECK (flash_remise_pct >= 1 AND flash_remise_pct <= 100),
  adresse                   text,
  ville                     text,
  code_postal               text CONSTRAINT chk_code_postal CHECK (code_postal IS NULL OR code_postal ~ '^\d{5}$'),
  telephone                 text,
  creneaux_retrait          text[] DEFAULT ARRAY['08:00','09:00','10:00'],
  timezone                  text NOT NULL DEFAULT 'Europe/Paris',
  latitude                  numeric(9,6),
  longitude                 numeric(9,6),
  pays                      text NOT NULL DEFAULT 'FR',
  levain_quota_week_start   date,
  levain_quota_used         integer DEFAULT 0,
  seuil_penalite            integer NOT NULL DEFAULT 3,
  penalite_active           boolean NOT NULL DEFAULT true,
  onboarding_completed_at   timestamptz,
  vitrine_accroche          text CHECK (length(vitrine_accroche) <= 120),
  vitrine_sous_titre        text CHECK (length(vitrine_sous_titre) <= 200),
  vitrine_hero_image_url    text,
  vitrine_hero_storage_path text,
  vitrine_about_image_url   text,
  vitrine_about_storage_path text,
  vitrine_histoire          text CHECK (length(vitrine_histoire) <= 800),
  vitrine_badge_label       text CHECK (length(vitrine_badge_label) <= 60),
  vitrine_horaires          jsonb DEFAULT '[{"day":"Lundi — Vendredi","hours":"6h30 – 20h00"},{"day":"Samedi","hours":"7h00 – 20h00"},{"day":"Dimanche","hours":"7h00 – 13h00"}]'::jsonb,
  jours_fermes              text[] DEFAULT '{}',
  type_clientele            text DEFAULT 'particulier'
                              CONSTRAINT chk_type_clientele
                              CHECK (type_clientele = ANY (ARRAY['particulier','mixte','entreprise','touristique'])),
  specialites               text[] DEFAULT '{}',
  horaires_ouverture        text DEFAULT '06:00',
  horaires_fermeture        text DEFAULT '19:00',
  objectif_ca_journalier    numeric,
  objectif_taux_vente       integer
                              CONSTRAINT chk_objectif_taux_vente
                              CHECK (objectif_taux_vente IS NULL OR (objectif_taux_vente >= 0 AND objectif_taux_vente <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_user_id ON public.boulangeries (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_stripe_customer ON public.boulangeries (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boulangeries_slug ON public.boulangeries (slug);
CREATE INDEX IF NOT EXISTS idx_boulangeries_ville ON public.boulangeries (ville) WHERE ville IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boulangeries_tour ON public.boulangeries (id) WHERE tour_completed_at IS NULL;


-- employes
CREATE TABLE IF NOT EXISTS public.employes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role              text NOT NULL DEFAULT 'employe'
                      CHECK (role = ANY (ARRAY['gerant','employe'])),
  permissions       jsonb NOT NULL DEFAULT '{}',
  statut            text NOT NULL DEFAULT 'invite'
                      CHECK (statut = ANY (ARRAY['invite','actif','suspendu'])),
  invite_email      text NOT NULL CHECK (invite_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  invite_token      text UNIQUE,
  invite_expires_at timestamptz,
  created_by        uuid REFERENCES auth.users(id),
  prenom            text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  last_login_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_invite_token ON public.employes (invite_token) WHERE invite_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_unique_user ON public.employes (boulangerie_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_boulangerie ON public.employes (boulangerie_id, statut);
CREATE INDEX IF NOT EXISTS idx_employes_user ON public.employes (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_user_statut ON public.employes (user_id, statut);
CREATE INDEX IF NOT EXISTS idx_employes_created_by ON public.employes (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_invite_expires ON public.employes (invite_expires_at) WHERE statut = 'invite';
CREATE INDEX IF NOT EXISTS idx_employes_last_login ON public.employes (boulangerie_id, last_login_at DESC NULLS LAST);


-- produits
CREATE TABLE IF NOT EXISTS public.produits (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id          uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  nom                     text NOT NULL CHECK (length(nom) >= 1 AND length(nom) <= 100),
  description             text CHECK (length(description) <= 500),
  categorie               text NOT NULL DEFAULT 'boulangerie'
                            CHECK (categorie = ANY (ARRAY['boulangerie','viennoiserie','patisserie','sandwich'])),
  emoji                   text DEFAULT '🥖',
  prix_vente              numeric(8,2) NOT NULL CHECK (prix_vente > 0),
  cout_production         numeric(8,2) DEFAULT 0,
  image_url               text,
  image_storage_path      text,
  actif                   boolean DEFAULT true,
  ordre                   integer DEFAULT 0,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  actif_catalogue         boolean DEFAULT true,
  actif_flash             boolean DEFAULT true,
  prix_flash_override     numeric(8,2) DEFAULT NULL
                            CONSTRAINT chk_prix_flash_override CHECK (prix_flash_override IS NULL OR prix_flash_override > 0),
  allergenes              text[] DEFAULT '{}',
  disponible_du           date,
  disponible_au           date,
  stock_alerte            integer,
  note_interne            text,
  deleted_at              timestamptz,
  duree_conservation_jours integer NOT NULL DEFAULT 1
                            CONSTRAINT chk_duree_conservation CHECK (duree_conservation_jours >= 1 AND duree_conservation_jours <= 7),
  CONSTRAINT chk_saisonnalite CHECK (
    (disponible_du IS NULL AND disponible_au IS NULL) OR
    (disponible_du IS NOT NULL AND disponible_au IS NOT NULL AND disponible_du <= disponible_au)
  )
);

CREATE INDEX IF NOT EXISTS idx_produits_boulangerie ON public.produits (boulangerie_id, actif, categorie);
CREATE INDEX IF NOT EXISTS idx_produits_actif_catalogue ON public.produits (boulangerie_id, actif_catalogue) WHERE actif_catalogue = true;
CREATE INDEX IF NOT EXISTS idx_produits_actif_flash ON public.produits (boulangerie_id, actif_flash) WHERE actif_flash = true;


-- journees
CREATE TABLE IF NOT EXISTS public.journees (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  date                date NOT NULL,
  commandes_online    integer DEFAULT 0,
  ca_estime           numeric(10,2) DEFAULT 0,
  taux_invendu        numeric(5,2) DEFAULT 0,
  total_produit       integer DEFAULT 0,
  total_invendu       integer DEFAULT 0,
  cloturee            boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  matin_validated     boolean NOT NULL DEFAULT false,
  nb_fournees         integer NOT NULL DEFAULT 1,
  feedback_vendeuse   text,
  evenement_lendemain text,
  jour_semaine        smallint NOT NULL DEFAULT 0,
  UNIQUE (boulangerie_id, date)
);

CREATE INDEX IF NOT EXISTS idx_journees_boulangerie_date ON public.journees (boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_journees_cloturee ON public.journees (boulangerie_id, cloturee);
CREATE INDEX IF NOT EXISTS idx_journees_boulangerie_jour_semaine ON public.journees (boulangerie_id, jour_semaine);


-- stocks_journaliers
CREATE TABLE IF NOT EXISTS public.stocks_journaliers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journee_id          uuid NOT NULL REFERENCES public.journees(id) ON DELETE CASCADE,
  boulangerie_id      uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  produit_id          text NOT NULL,
  produit_nom         text NOT NULL,
  produit_emoji       text DEFAULT '🥖',
  categorie           text DEFAULT 'boulangerie',
  prix_vente          numeric(8,2) DEFAULT 0,
  cout_production     numeric(8,2) DEFAULT 0,
  production          integer DEFAULT 0,
  snapshot_10h        integer DEFAULT 0,
  snapshot_10h_done   boolean DEFAULT false,
  snapshot_14h        integer DEFAULT 0,
  snapshot_14h_done   boolean DEFAULT false,
  stock_final         integer DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  report_veille       integer NOT NULL DEFAULT 0 CHECK (report_veille >= 0),
  est_reporte         boolean NOT NULL DEFAULT false,
  UNIQUE (journee_id, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_stocks_journee ON public.stocks_journaliers (journee_id);
CREATE INDEX IF NOT EXISTS idx_stocks_boulangerie ON public.stocks_journaliers (boulangerie_id);
CREATE INDEX IF NOT EXISTS idx_stocks_report_lookup ON public.stocks_journaliers (boulangerie_id, produit_id) WHERE est_reporte = false;


-- meteo_journees
CREATE TABLE IF NOT EXISTS public.meteo_journees (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  date                date NOT NULL,
  temperature_c       numeric(4,1),
  ressenti_c          numeric(4,1),
  humidite_pct        smallint,
  precipitations_mm   numeric(5,2),
  vitesse_vent_kmh    numeric(5,1),
  code_meteo          smallint,
  description         text,
  icone               text,
  demain_temp_max_c   numeric(4,1),
  demain_temp_min_c   numeric(4,1),
  demain_precip_mm    numeric(5,2),
  demain_code_meteo   smallint,
  demain_description  text,
  demain_icone        text,
  source              text NOT NULL DEFAULT 'open-meteo',
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boulangerie_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meteo_boulangerie_date ON public.meteo_journees (boulangerie_id, date DESC);


-- commandes
CREATE TABLE IF NOT EXISTS public.commandes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  client_prenom     text NOT NULL CHECK (length(client_prenom) >= 1 AND length(client_prenom) <= 50),
  client_email      text NOT NULL CHECK (client_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  client_telephone  text,
  heure_retrait     time NOT NULL,
  notes             text CHECK (length(notes) <= 500),
  montant_total     numeric(8,2) NOT NULL CHECK (montant_total > 0),
  statut            text NOT NULL DEFAULT 'en_attente'
                      CHECK (statut = ANY (ARRAY['en_attente','confirmee','prete','recuperee','annulee','non_recuperee'])),
  lignes            jsonb NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  type              text NOT NULL DEFAULT 'clickcollect'
                      CHECK (type = ANY (ARRAY['clickcollect','anti_gaspi'])),
  date_retrait      date
);

CREATE INDEX IF NOT EXISTS commandes_boulangerie_date_idx ON public.commandes (boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_email ON public.commandes (client_email, boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_date_retrait ON public.commandes (boulangerie_id, date_retrait, statut);
CREATE INDEX IF NOT EXISTS idx_commandes_type ON public.commandes (boulangerie_id, type, created_at DESC);


-- paniers_flash
CREATE TABLE IF NOT EXISTS public.paniers_flash (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  date              date NOT NULL DEFAULT CURRENT_DATE,
  produit_id        text NOT NULL,
  produit_nom       text NOT NULL CHECK (length(produit_nom) >= 1 AND length(produit_nom) <= 150),
  produit_emoji     text NOT NULL DEFAULT '🥖',
  categorie         text NOT NULL DEFAULT 'boulangerie'
                      CHECK (categorie = ANY (ARRAY['boulangerie','viennoiserie','patisserie','sandwich'])),
  prix_original     numeric(8,2) NOT NULL CHECK (prix_original > 0),
  remise_pct        integer NOT NULL DEFAULT 40 CHECK (remise_pct >= 1 AND remise_pct <= 100),
  prix_flash        numeric(8,2) NOT NULL CHECK (prix_flash > 0),
  quantite_initiale integer NOT NULL DEFAULT 1 CHECK (quantite_initiale >= 0),
  quantite_restante integer NOT NULL DEFAULT 1 CHECK (quantite_restante >= 0),
  allergenes        text[] NOT NULL DEFAULT '{}',
  actif             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boulangerie_id, date, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_paniers_flash_boulangerie_date ON public.paniers_flash (boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_paniers_flash_actif ON public.paniers_flash (boulangerie_id, date, actif) WHERE actif = true;


-- ai_rapports
CREATE TABLE IF NOT EXISTS public.ai_rapports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id        uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  journee_id            uuid REFERENCES public.journees(id) ON DELETE SET NULL,
  date                  date NOT NULL,
  score_performance     integer CHECK (score_performance >= 0 AND score_performance <= 100),
  verdict_flash         text,
  rapport_json          jsonb NOT NULL DEFAULT '{}',
  statut                text NOT NULL DEFAULT 'en_cours'
                          CHECK (statut = ANY (ARRAY['en_cours','genere','erreur'])),
  erreur_msg            text,
  modele_ia             text DEFAULT 'glm-4-flash',
  tokens_utilises       integer,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  meteo_id              uuid REFERENCES public.meteo_journees(id),
  feedback_vendeuse     text,
  evenement_lendemain   text,
  consignes_boulanger   text,
  consignes_vendeuse    text,
  wizard_evenement      text,
  wizard_impact         text,
  wizard_impact_pct     integer DEFAULT 0,
  UNIQUE (boulangerie_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_rapports_boulangerie_date ON public.ai_rapports (boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_rapports_journee_id ON public.ai_rapports (journee_id) WHERE journee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_rapports_meteo_id ON public.ai_rapports (meteo_id) WHERE meteo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_rapports_statut ON public.ai_rapports (statut) WHERE statut = 'en_cours';


-- production_forecasts
CREATE TABLE IF NOT EXISTS public.production_forecasts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  rapport_id          uuid REFERENCES public.ai_rapports(id) ON DELETE CASCADE,
  date_production     date NOT NULL,
  produit_id          text NOT NULL,
  produit_nom         text NOT NULL,
  produit_categorie   text DEFAULT 'boulangerie',
  produit_emoji       text DEFAULT '🥖',
  quantite_suggeree   integer NOT NULL CHECK (quantite_suggeree >= 0),
  quantite_base       integer NOT NULL DEFAULT 0,
  variation_pct       integer DEFAULT 0,
  raison              text,
  appliquee           boolean DEFAULT false,
  appliquee_le        timestamptz,
  created_at          timestamptz DEFAULT now(),
  quantite_min        integer,
  quantite_max        integer,
  UNIQUE (boulangerie_id, date_production, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_production_forecasts_date ON public.production_forecasts (boulangerie_id, date_production DESC);
CREATE INDEX IF NOT EXISTS idx_production_forecasts_non_appliquees ON public.production_forecasts (boulangerie_id, date_production) WHERE appliquee = false;
CREATE INDEX IF NOT EXISTS idx_production_forecasts_rapport_id ON public.production_forecasts (rapport_id) WHERE rapport_id IS NOT NULL;


-- defis
CREATE TABLE IF NOT EXISTS public.defis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  rapport_id      uuid REFERENCES public.ai_rapports(id) ON DELETE SET NULL,
  date_defi       date NOT NULL,
  categorie       text NOT NULL
                    CHECK (categorie = ANY (ARRAY['reduce_waste','revenue_target','perfect_day','streak','anti_gaspi','click_collect','production_accuracy','improvement'])),
  difficulte      text NOT NULL DEFAULT 'easy'
                    CHECK (difficulte = ANY (ARRAY['easy','medium','hard'])),
  titre           text NOT NULL,
  description     text NOT NULL,
  emoji           text NOT NULL DEFAULT '🎯',
  metric_cible    text NOT NULL,
  produit_id      uuid,
  valeur_cible    numeric NOT NULL,
  comparaison     text NOT NULL DEFAULT 'lte'
                    CHECK (comparaison = ANY (ARRAY['lte','gte','eq','lt','gt'])),
  valeur_actuelle numeric,
  statut          text NOT NULL DEFAULT 'actif'
                    CHECK (statut = ANY (ARRAY['actif','reussi','echoue','expire'])),
  xp_reward       integer NOT NULL DEFAULT 10,
  resolved_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (boulangerie_id, date_defi, categorie, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_defis_boulangerie_date ON public.defis (boulangerie_id, date_defi DESC);
CREATE INDEX IF NOT EXISTS idx_defis_actifs ON public.defis (boulangerie_id, statut) WHERE statut = 'actif';


-- gamification_profil
CREATE TABLE IF NOT EXISTS public.gamification_profil (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  uuid NOT NULL UNIQUE REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  xp_total        integer NOT NULL DEFAULT 0,
  niveau          integer NOT NULL DEFAULT 1,
  streak_actuel   integer NOT NULL DEFAULT 0,
  streak_max      integer NOT NULL DEFAULT 0,
  derniere_cloture date,
  badges          text[] DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gamification_boulangerie ON public.gamification_profil (boulangerie_id);


-- feedback_journee
CREATE TABLE IF NOT EXISTS public.feedback_journee (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journee_id          uuid NOT NULL UNIQUE REFERENCES public.journees(id) ON DELETE CASCADE,
  boulangerie_id      uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  rating_journee      integer NOT NULL CHECK (rating_journee >= 1 AND rating_journee <= 4),
  points_forts        text[] DEFAULT '{}',
  points_ameliorer    text[] DEFAULT '{}',
  commentaire_libre   text CHECK (length(commentaire_libre) <= 1000),
  has_evenement       boolean DEFAULT false,
  evenement_desc      text CHECK (length(evenement_desc) <= 500),
  evenement_impact    text CHECK (evenement_impact = ANY (ARRAY['hausse','baisse',NULL])),
  evenement_pct       integer DEFAULT 0 CHECK (evenement_pct >= 0 AND evenement_pct <= 100),
  saisi_par_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  saisi_par_prenom    text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_journee_boulangerie ON public.feedback_journee (boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_journee_journee ON public.feedback_journee (journee_id);
CREATE INDEX IF NOT EXISTS idx_feedback_journee_saisi_par ON public.feedback_journee (saisi_par_id) WHERE saisi_par_id IS NOT NULL;


-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  entity_type     text,
  entity_id       text,
  details         jsonb DEFAULT '{}',
  ip_address      text,
  user_agent      text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_boulangerie_date ON public.audit_logs (boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);


-- audit_equipe
CREATE TABLE IF NOT EXISTS public.audit_equipe (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  acteur_id       uuid REFERENCES auth.users(id),
  cible_id        uuid,
  action          text NOT NULL,
  details         jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_equipe_boulangerie ON public.audit_equipe (boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_equipe_acteur ON public.audit_equipe (acteur_id) WHERE acteur_id IS NOT NULL;


-- profils_clients
CREATE TABLE IF NOT EXISTS public.profils_clients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom            text NOT NULL CHECK (length(prenom) >= 1 AND length(prenom) <= 50),
  telephone         text CHECK (telephone IS NULL OR (length(telephone) >= 8 AND length(telephone) <= 20)),
  optin_flash       boolean DEFAULT false,
  optin_marketing   boolean DEFAULT false,
  rgpd_accepted_at  timestamptz NOT NULL DEFAULT now(),
  rgpd_version      text NOT NULL DEFAULT '1.0',
  profil_completed  boolean DEFAULT false,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profils_clients_user_id ON public.profils_clients (user_id);


-- client_penalites
CREATE TABLE IF NOT EXISTS public.client_penalites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  client_email      text NOT NULL CHECK (client_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  nb_non_recupere   integer NOT NULL DEFAULT 0,
  bloque            boolean NOT NULL DEFAULT false,
  blocage_date      timestamptz,
  debloque_par_id   uuid REFERENCES auth.users(id),
  debloque_le       timestamptz,
  note_deblocage    text CHECK (length(note_deblocage) <= 500),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boulangerie_id, client_email)
);

CREATE INDEX IF NOT EXISTS idx_client_penalites_lookup ON public.client_penalites (boulangerie_id, client_email);


-- push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  uuid NOT NULL REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text,
  auth_key        text,
  subscription    jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_boulangerie ON public.push_subscriptions (boulangerie_id);
CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscriptions (user_id);


-- recettes_produits
CREATE TABLE IF NOT EXISTS public.recettes_produits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      uuid REFERENCES public.boulangeries(id) ON DELETE CASCADE,
  produit_id          uuid REFERENCES public.produits(id) ON DELETE CASCADE,
  categorie           text CHECK (categorie = ANY (ARRAY['boulangerie','viennoiserie','patisserie','sandwich'])),
  nom_recette         text,
  farine_g            numeric NOT NULL DEFAULT 0,
  beurre_g            numeric NOT NULL DEFAULT 0,
  oeufs_n             numeric NOT NULL DEFAULT 0,
  sucre_g             numeric NOT NULL DEFAULT 0,
  sel_g               numeric NOT NULL DEFAULT 0,
  levure_boulangere_g numeric NOT NULL DEFAULT 0,
  levain_g            numeric NOT NULL DEFAULT 0,
  eau_ml              numeric NOT NULL DEFAULT 0,
  lait_ml             numeric NOT NULL DEFAULT 0,
  chocolat_g          numeric NOT NULL DEFAULT 0,
  huile_ml            numeric NOT NULL DEFAULT 0,
  creme_g             numeric NOT NULL DEFAULT 0,
  source              text NOT NULL DEFAULT 'default'
                        CHECK (source = ANY (ARRAY['manual','auto','default'])),
  confidence          numeric NOT NULL DEFAULT 1.0
                        CHECK (confidence >= 0 AND confidence <= 1),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT chk_recette_scope CHECK (
    ((boulangerie_id IS NOT NULL) AND (produit_id IS NOT NULL)) OR
    ((boulangerie_id IS NULL) AND (nom_recette IS NOT NULL)) OR
    ((boulangerie_id IS NULL) AND (produit_id IS NULL) AND (categorie IS NOT NULL))
  )
);

-- Index uniques recettes (ordre important)
-- 1. Une seule recette par produit spécifique d'une boulangerie
CREATE UNIQUE INDEX IF NOT EXISTS uq_recette_produit_specifique
  ON public.recettes_produits (boulangerie_id, produit_id)
  WHERE boulangerie_id IS NOT NULL AND produit_id IS NOT NULL;

-- 2. Une seule recette template par nom (global, sans boulangerie)
CREATE UNIQUE INDEX IF NOT EXISTS uq_recette_template_global
  ON public.recettes_produits (nom_recette)
  WHERE boulangerie_id IS NULL AND nom_recette IS NOT NULL;

-- 3. Un seul fallback par catégorie (sans boulangerie, sans produit, sans nom)
--    IMPORTANT : exclure les lignes avec nom_recette pour autoriser plusieurs recettes nommées par catégorie
CREATE UNIQUE INDEX IF NOT EXISTS uq_recette_categorie_fallback
  ON public.recettes_produits (categorie)
  WHERE boulangerie_id IS NULL AND produit_id IS NULL AND nom_recette IS NULL AND categorie IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recettes_boulangerie ON public.recettes_produits (boulangerie_id);
CREATE INDEX IF NOT EXISTS idx_recettes_produit ON public.recettes_produits (produit_id);


-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_boulangeries_updated_at
  BEFORE UPDATE ON public.boulangeries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_employes_updated_at
  BEFORE UPDATE ON public.employes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_produits_updated_at
  BEFORE UPDATE ON public.produits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_journees_jour_semaine
  BEFORE INSERT OR UPDATE ON public.journees
  FOR EACH ROW EXECUTE FUNCTION set_jour_semaine();

CREATE TRIGGER trg_journees_updated_at
  BEFORE UPDATE ON public.journees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_stocks_updated_at
  BEFORE UPDATE ON public.stocks_journaliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_meteo_updated_at
  BEFORE UPDATE ON public.meteo_journees
  FOR EACH ROW EXECUTE FUNCTION update_meteo_updated_at();

CREATE TRIGGER commandes_updated_at
  BEFORE UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_paniers_flash_updated_at
  BEFORE UPDATE ON public.paniers_flash
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ai_rapports_updated_at
  BEFORE UPDATE ON public.ai_rapports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_gamification_updated_at
  BEFORE UPDATE ON public.gamification_profil
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_feedback_journee_updated_at
  BEFORE UPDATE ON public.feedback_journee
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_profils_clients_updated_at
  BEFORE UPDATE ON public.profils_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER client_penalites_updated_at
  BEFORE UPDATE ON public.client_penalites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_push_subscription_timestamp();

CREATE TRIGGER trg_recettes_updated_at
  BEFORE UPDATE ON public.recettes_produits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.boulangeries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocks_journaliers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meteo_journees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paniers_flash       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rapports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defis               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_profil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_journee    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_equipe        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profils_clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_penalites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recettes_produits   ENABLE ROW LEVEL SECURITY;


-- ----- boulangeries -----
CREATE POLICY boulangeries_select ON public.boulangeries FOR SELECT
  USING (user_id = auth.uid() OR id = get_employee_boulangerie_id());
CREATE POLICY boulangerie_insert_own ON public.boulangeries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY boulangerie_update_own ON public.boulangeries FOR UPDATE
  USING (auth.uid() = user_id);

-- ----- employes -----
CREATE POLICY employes_select ON public.employes FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id IN (SELECT e2.boulangerie_id FROM employes e2 WHERE e2.user_id = auth.uid() AND e2.statut = 'actif' AND e2.role = 'gerant')
    OR user_id = auth.uid()
  );
CREATE POLICY employes_insert ON public.employes FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY employes_update ON public.employes FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()))
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY employes_delete ON public.employes FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY employes_service_all ON public.employes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----- produits -----
CREATE POLICY produits_select ON public.produits FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR (boulangerie_id = get_employee_boulangerie_id() AND deleted_at IS NULL)
  );
CREATE POLICY produits_insert_own ON public.produits FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY produits_update_own ON public.produits FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY produits_delete_own ON public.produits FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- journees -----
CREATE POLICY journees_select ON public.journees FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY journee_owner_insert ON public.journees FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY journee_owner_update ON public.journees FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- stocks_journaliers -----
CREATE POLICY stocks_select ON public.stocks_journaliers FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY stocks_owner_insert ON public.stocks_journaliers FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY stocks_update ON public.stocks_journaliers FOR UPDATE
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  )
  WITH CHECK (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );

-- ----- meteo_journees -----
CREATE POLICY meteo_boulangerie_owner ON public.meteo_journees FOR ALL
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()))
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- commandes -----
CREATE POLICY commandes_select ON public.commandes FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY commandes_update ON public.commandes FOR UPDATE
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  )
  WITH CHECK (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );

-- ----- paniers_flash -----
CREATE POLICY paniers_flash_select ON public.paniers_flash FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY paniers_flash_owner_insert ON public.paniers_flash FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY paniers_flash_owner_update ON public.paniers_flash FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY paniers_flash_owner_delete ON public.paniers_flash FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- ai_rapports -----
CREATE POLICY ai_rapports_owner_select ON public.ai_rapports FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY ai_rapports_owner_insert ON public.ai_rapports FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY ai_rapports_owner_update ON public.ai_rapports FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- production_forecasts -----
CREATE POLICY forecasts_owner_select ON public.production_forecasts FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY forecasts_owner_insert ON public.production_forecasts FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY forecasts_owner_update ON public.production_forecasts FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- defis -----
CREATE POLICY defis_owner_select ON public.defis FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY defis_owner_insert ON public.defis FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY defis_owner_update ON public.defis FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- gamification_profil -----
CREATE POLICY gamification_owner_select ON public.gamification_profil FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY gamification_owner_insert ON public.gamification_profil FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY gamification_owner_update ON public.gamification_profil FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ----- feedback_journee -----
CREATE POLICY feedback_select ON public.feedback_journee FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY feedback_insert ON public.feedback_journee FOR INSERT
  WITH CHECK (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY feedback_update ON public.feedback_journee FOR UPDATE
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
    OR boulangerie_id = get_employee_boulangerie_id()
  );

-- ----- audit_logs -----
CREATE POLICY audit_logs_owner_select ON public.audit_logs FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY audit_logs_gerant_select ON public.audit_logs FOR SELECT
  USING (boulangerie_id IN (
    SELECT boulangerie_id FROM employes WHERE user_id = auth.uid() AND statut = 'actif' AND role = 'gerant'
  ));

-- ----- audit_equipe -----
CREATE POLICY audit_equipe_read ON public.audit_equipe FOR SELECT
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE user_id = auth.uid()
    UNION
    SELECT boulangerie_id FROM employes WHERE user_id = auth.uid() AND statut = 'actif' AND role = 'gerant'
  ));
CREATE POLICY audit_equipe_service_insert ON public.audit_equipe FOR INSERT TO service_role
  WITH CHECK (true);

-- ----- profils_clients -----
CREATE POLICY client_select_own_profil ON public.profils_clients FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY client_insert_own_profil ON public.profils_clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY client_update_own_profil ON public.profils_clients FOR UPDATE
  USING (auth.uid() = user_id);

-- ----- client_penalites -----
-- (pas de policy listée, accès via service_role ou fonctions SECURITY DEFINER)

-- ----- push_subscriptions -----
CREATE POLICY "Service role full access" ON public.push_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "User can upsert own subscription" ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User can delete own subscription" ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- ----- recettes_produits -----
CREATE POLICY recettes_select ON public.recettes_produits FOR SELECT
  USING (boulangerie_id IS NULL OR boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY recettes_owner_insert ON public.recettes_produits FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY recettes_owner_update ON public.recettes_produits FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY recettes_owner_delete ON public.recettes_produits FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));


-- =============================================================================
-- FIN DE MIGRATION
-- =============================================================================
-- Tables : 19
-- Fonctions : 17 (+ verifier_stock_commande signature principale)
-- Triggers : 17
-- Policies RLS : ~50
-- Fix clé : uq_recette_categorie_fallback inclut AND nom_recette IS NULL
--           pour autoriser plusieurs recettes nommées par catégorie
-- =============================================================================