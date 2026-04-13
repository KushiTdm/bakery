-- ═══════════════════════════════════════════════════════════════════════
-- Sauve Mie — Migration COMPLÈTE CONSOLIDÉE v6.0
-- 12 avril 2026
--
-- Synthèse de TOUTES les migrations en un seul fichier :
--   · migration-master.sql (v5.0)         (schema complet 16 tables)
--   · migration_onboarding_add_on.sql     (plan 'trial', onboarding)
--   · migration_profil_boulangerie.sql    (jours_fermes, clientèle, spécialités, horaires, objectifs)
--   · migration_vitrine_cms.sql           (CMS vitrine, bucket vitrine-images)
--   · migration_precommandes.sql          (date_retrait, pré-commande J+1)
--   · seed.sql                            (données de démonstration)
--
-- ✅ Idempotent : safe à relancer depuis zéro
-- ✅ Transaction unique : BEGIN … COMMIT
-- ✅ 16 tables, 18 fonctions, RLS complet, 2 buckets storage
--
-- ⚠️  Action manuelle requise (hors SQL) :
--    · Supabase Dashboard → Authentication → Settings
--      → Activer "Leaked Password Protection" (HaveIBeenPwned)
--    · pg_cron (optionnel) :
--      SELECT cron.schedule('cleanup-expired-invites', '0 3 * * *',
--        'SELECT public.cleanup_expired_invites()');
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────
-- 1. FONCTIONS UTILITAIRES (triggers updated_at)
--    SET search_path = public sur toutes les fonctions trigger
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION update_meteo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- 1b. Helper RLS : boulangerie de l'employé connecté
--     Déclaré tôt car référencé dans les policies RLS dès la section 2.
--     LANGUAGE plpgsql obligatoire ici : contrairement à sql, plpgsql ne
--     valide pas le corps à la création — la table employes n'existe pas encore.
CREATE OR REPLACE FUNCTION get_employee_boulangerie_id()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  RETURN (SELECT boulangerie_id FROM employes
          WHERE user_id = auth.uid() AND statut = 'actif' LIMIT 1);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 2. TABLE : boulangeries
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boulangeries (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  nom                      TEXT        NOT NULL,
  slug                     TEXT        UNIQUE NOT NULL,
  email_contact            TEXT,
  plan                     TEXT        NOT NULL DEFAULT 'starter'
                           CHECK (plan IN ('starter', 'pro', 'multi', 'trial')),
  actif                    BOOLEAN     DEFAULT TRUE,
  adresse                  TEXT        DEFAULT NULL,
  ville                    TEXT        DEFAULT NULL,
  code_postal              TEXT        DEFAULT NULL,
  telephone                TEXT        DEFAULT NULL,
  creneaux_retrait         TEXT[]      DEFAULT ARRAY['08:00', '09:00', '10:00'],
  flash_heure_debut        INT         NOT NULL DEFAULT 18
                           CHECK (flash_heure_debut BETWEEN 0 AND 23),
  flash_heure_fin          INT         NOT NULL DEFAULT 20
                           CHECK (flash_heure_fin BETWEEN 1 AND 24),
  flash_remise_pct         INT         NOT NULL DEFAULT 40
                           CHECK (flash_remise_pct BETWEEN 1 AND 100),
  timezone                 TEXT        NOT NULL DEFAULT 'Europe/Paris',
  latitude                 NUMERIC(9,6),
  longitude                NUMERIC(9,6),
  pays                     TEXT        NOT NULL DEFAULT 'FR',
  tour_completed_at        TIMESTAMPTZ DEFAULT NULL,
  onboarding_completed_at  TIMESTAMPTZ DEFAULT NULL,
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  trial_ends_at            TIMESTAMPTZ,
  stripe_status            TEXT        NOT NULL DEFAULT 'inactive'
                           CHECK (stripe_status IN (
                             'inactive','trialing','active','past_due','canceled','unpaid'
                           )),
  levain_quota_week_start  DATE        DEFAULT NULL,
  levain_quota_used        INT         DEFAULT 0,
  -- [migration_conservation] seuil pénalité configurable
  seuil_penalite           INT         NOT NULL DEFAULT 3,
  penalite_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  -- [migration_profil_boulangerie] profil IA / onboarding
  jours_fermes             TEXT[]      DEFAULT '{}',
  type_clientele           TEXT        DEFAULT 'particulier'
                           CHECK (type_clientele IN ('particulier', 'mixte', 'entreprise', 'touristique')),
  specialites              TEXT[]      DEFAULT '{}',
  horaires_ouverture       TEXT        DEFAULT '06:00',
  horaires_fermeture       TEXT        DEFAULT '19:00',
  objectif_ca_journalier   DECIMAL     DEFAULT NULL,
  objectif_taux_vente      INT         DEFAULT NULL
                           CHECK (objectif_taux_vente IS NULL OR (objectif_taux_vente >= 0 AND objectif_taux_vente <= 100)),
  -- [migration_vitrine_cms] CMS vitrine page d'accueil
  vitrine_accroche         TEXT        CHECK (length(vitrine_accroche) <= 120),
  vitrine_sous_titre       TEXT        CHECK (length(vitrine_sous_titre) <= 200),
  vitrine_hero_image_url   TEXT,
  vitrine_hero_storage_path TEXT,
  vitrine_about_image_url  TEXT,
  vitrine_about_storage_path TEXT,
  vitrine_histoire         TEXT        CHECK (length(vitrine_histoire) <= 800),
  vitrine_badge_label      TEXT        CHECK (length(vitrine_badge_label) <= 60),
  vitrine_horaires         JSONB       DEFAULT '[
    {"day": "Lundi — Vendredi", "hours": "6h30 – 20h00"},
    {"day": "Samedi", "hours": "7h00 – 20h00"},
    {"day": "Dimanche", "hours": "7h00 – 13h00"}
  ]'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Ajouts idempotents pour bases existantes
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS adresse                TEXT        DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS ville                  TEXT        DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS code_postal            TEXT        DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS telephone              TEXT        DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS creneaux_retrait       TEXT[]      DEFAULT ARRAY['08:00', '09:00', '10:00'];
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS flash_heure_debut      INT         NOT NULL DEFAULT 18;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS flash_heure_fin        INT         NOT NULL DEFAULT 20;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS flash_remise_pct       INT         NOT NULL DEFAULT 40;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS timezone               TEXT        NOT NULL DEFAULT 'Europe/Paris';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS latitude               NUMERIC(9,6);
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS longitude              NUMERIC(9,6);
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS pays                   TEXT        NOT NULL DEFAULT 'FR';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS tour_completed_at      TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_status          TEXT        NOT NULL DEFAULT 'inactive';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS levain_quota_week_start DATE        DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS levain_quota_used       INT         DEFAULT 0;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS seuil_penalite          INT         NOT NULL DEFAULT 3;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS penalite_active         BOOLEAN     NOT NULL DEFAULT TRUE;
-- [migration_profil_boulangerie]
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS jours_fermes            TEXT[]      DEFAULT '{}';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS type_clientele          TEXT        DEFAULT 'particulier';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS specialites             TEXT[]      DEFAULT '{}';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS horaires_ouverture      TEXT        DEFAULT '06:00';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS horaires_fermeture      TEXT        DEFAULT '19:00';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS objectif_ca_journalier  DECIMAL     DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS objectif_taux_vente     INT         DEFAULT NULL;
-- [migration_vitrine_cms]
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_accroche          TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_sous_titre        TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_hero_image_url    TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_hero_storage_path TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_about_image_url   TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_about_storage_path TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_histoire          TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_badge_label       TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_horaires          JSONB DEFAULT '[
  {"day": "Lundi — Vendredi", "hours": "6h30 – 20h00"},
  {"day": "Samedi", "hours": "7h00 – 20h00"},
  {"day": "Dimanche", "hours": "7h00 – 13h00"}
]'::jsonb;

DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_type_clientele
    CHECK (type_clientele IN ('particulier', 'mixte', 'entreprise', 'touristique'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_objectif_taux_vente
    CHECK (objectif_taux_vente IS NULL OR (objectif_taux_vente >= 0 AND objectif_taux_vente <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Suppression colonnes Airtable résiduelles
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_api_key;
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_base_id;
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_api_key_enc;
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_base_id_enc;

-- Contraintes CHECK idempotentes
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_code_postal
    CHECK (code_postal IS NULL OR code_postal ~ '^\d{5}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_stripe_status
    CHECK (stripe_status IN ('inactive','trialing','active','past_due','canceled','unpaid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_flash_heure_debut
    CHECK (flash_heure_debut BETWEEN 0 AND 23);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_flash_heure_fin
    CHECK (flash_heure_fin BETWEEN 1 AND 24);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_flash_remise_pct
    CHECK (flash_remise_pct BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Valeurs par défaut pour lignes existantes
UPDATE boulangeries SET flash_heure_debut       = 18             WHERE flash_heure_debut IS NULL;
UPDATE boulangeries SET flash_heure_fin         = 20             WHERE flash_heure_fin   IS NULL;
UPDATE boulangeries SET flash_remise_pct        = 40             WHERE flash_remise_pct  IS NULL;
UPDATE boulangeries SET timezone                = 'Europe/Paris' WHERE timezone          IS NULL;
UPDATE boulangeries SET creneaux_retrait = ARRAY['08:00','09:00','10:00'] WHERE creneaux_retrait IS NULL;
UPDATE boulangeries
  SET levain_quota_week_start = DATE_TRUNC('week', CURRENT_DATE)::DATE,
      levain_quota_used       = 0
WHERE levain_quota_week_start IS NULL;

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_user_id       ON boulangeries(user_id);
CREATE INDEX        IF NOT EXISTS idx_boulangeries_slug           ON boulangeries(slug);
CREATE INDEX        IF NOT EXISTS idx_boulangeries_ville          ON boulangeries(ville) WHERE ville IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_boulangeries_tour           ON boulangeries(id) WHERE tour_completed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_stripe_customer
  ON boulangeries(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_boulangeries_updated_at ON boulangeries;
CREATE TRIGGER trg_boulangeries_updated_at
  BEFORE UPDATE ON boulangeries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS boulangeries
ALTER TABLE boulangeries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boulangerie_select_own"     ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_insert_own"     ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_update_own"     ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_employe_select" ON boulangeries;
DROP POLICY IF EXISTS "boulangeries_select"        ON boulangeries;

CREATE POLICY "boulangeries_select"
  ON boulangeries FOR SELECT
  USING (user_id = (select auth.uid()) OR id = get_employee_boulangerie_id());

CREATE POLICY "boulangerie_insert_own"
  ON boulangeries FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "boulangerie_update_own"
  ON boulangeries FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- ────────────────────────────────────────────────────────────────────────
-- 3. TABLE : journees
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journees (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id   UUID          NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  date             DATE          NOT NULL,
  commandes_online INT           DEFAULT 0,
  ca_estime        DECIMAL(10,2) DEFAULT 0,
  taux_invendu     DECIMAL(5,2)  DEFAULT 0,
  total_produit    INT           DEFAULT 0,
  total_invendu    INT           DEFAULT 0,
  cloturee         BOOLEAN       DEFAULT FALSE,
  matin_validated  BOOLEAN       NOT NULL DEFAULT FALSE,
  nb_fournees      INT           NOT NULL DEFAULT 1,
  feedback_vendeuse   TEXT       DEFAULT NULL,
  evenement_lendemain TEXT       DEFAULT NULL,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(boulangerie_id, date)
);

ALTER TABLE journees ADD COLUMN IF NOT EXISTS matin_validated     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE journees ADD COLUMN IF NOT EXISTS nb_fournees         INT     NOT NULL DEFAULT 1;
ALTER TABLE journees ADD COLUMN IF NOT EXISTS feedback_vendeuse   TEXT    DEFAULT NULL;
ALTER TABLE journees ADD COLUMN IF NOT EXISTS evenement_lendemain TEXT    DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_journees_boulangerie_date ON journees(boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_journees_cloturee         ON journees(boulangerie_id, cloturee);

-- [migration-jour-semaine] Jour de semaine pré-calculé (0=dimanche..6=samedi, match EXTRACT(DOW) et JS getDay())
ALTER TABLE journees ADD COLUMN IF NOT EXISTS jour_semaine SMALLINT DEFAULT NULL;

CREATE OR REPLACE FUNCTION set_jour_semaine()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.jour_semaine := EXTRACT(DOW FROM NEW.date)::SMALLINT;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_journees_jour_semaine ON journees;
CREATE TRIGGER trg_journees_jour_semaine
  BEFORE INSERT OR UPDATE OF date ON journees
  FOR EACH ROW EXECUTE FUNCTION set_jour_semaine();

-- Backfill des lignes existantes
UPDATE journees SET jour_semaine = EXTRACT(DOW FROM date)::SMALLINT WHERE jour_semaine IS NULL;

-- Contrainte NOT NULL après backfill
ALTER TABLE journees ALTER COLUMN jour_semaine SET NOT NULL;
ALTER TABLE journees ALTER COLUMN jour_semaine SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_journees_boulangerie_jour_semaine
  ON journees(boulangerie_id, jour_semaine);

DROP TRIGGER IF EXISTS trg_journees_updated_at ON journees;
CREATE TRIGGER trg_journees_updated_at
  BEFORE UPDATE ON journees FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE journees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journee_owner_select"   ON journees;
DROP POLICY IF EXISTS "journee_owner_insert"   ON journees;
DROP POLICY IF EXISTS "journee_owner_update"   ON journees;
DROP POLICY IF EXISTS "journee_select_own"     ON journees;
DROP POLICY IF EXISTS "journee_insert_own"     ON journees;
DROP POLICY IF EXISTS "journee_update_own"     ON journees;
DROP POLICY IF EXISTS "journee_employe_select" ON journees;
DROP POLICY IF EXISTS "journees_select"        ON journees;

CREATE POLICY "journees_select"
  ON journees FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY "journee_owner_insert"
  ON journees FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "journee_owner_update"
  ON journees FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- ────────────────────────────────────────────────────────────────────────
-- 4. TABLE : stocks_journaliers
--    + [migration_conservation] report_veille, est_reporte
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stocks_journaliers (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  journee_id        UUID          NOT NULL REFERENCES journees(id) ON DELETE CASCADE,
  boulangerie_id    UUID          NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  produit_id        TEXT          NOT NULL,
  produit_nom       TEXT          NOT NULL,
  produit_emoji     TEXT          DEFAULT '🥖',
  categorie         TEXT          DEFAULT 'boulangerie',
  prix_vente        DECIMAL(8,2)  DEFAULT 0,
  cout_production   DECIMAL(8,2)  DEFAULT 0,
  production        INT           DEFAULT 0,
  snapshot_10h      INT           DEFAULT 0,
  snapshot_10h_done BOOLEAN       DEFAULT FALSE,
  snapshot_14h      INT           DEFAULT 0,
  snapshot_14h_done BOOLEAN       DEFAULT FALSE,
  stock_final       INT           DEFAULT 0,
  -- [migration_conservation] report inter-journées
  report_veille     INT           NOT NULL DEFAULT 0 CHECK (report_veille >= 0),
  est_reporte       BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(journee_id, produit_id)
);

ALTER TABLE stocks_journaliers ADD COLUMN IF NOT EXISTS report_veille INT     NOT NULL DEFAULT 0;
ALTER TABLE stocks_journaliers ADD COLUMN IF NOT EXISTS est_reporte   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_stocks_journee       ON stocks_journaliers(journee_id);
CREATE INDEX IF NOT EXISTS idx_stocks_boulangerie   ON stocks_journaliers(boulangerie_id);
-- Index pour les requêtes de report inter-journées
CREATE INDEX IF NOT EXISTS idx_stocks_report_lookup
  ON stocks_journaliers(boulangerie_id, produit_id) WHERE est_reporte = FALSE;

DROP TRIGGER IF EXISTS trg_stocks_updated_at ON stocks_journaliers;
CREATE TRIGGER trg_stocks_updated_at
  BEFORE UPDATE ON stocks_journaliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE stocks_journaliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stocks_owner_select"      ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_owner_insert"      ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_owner_update"      ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_select_own"        ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_insert_own"        ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_update_own"        ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_delete_own"        ON stocks_journaliers;
DROP POLICY IF EXISTS "Service role full access" ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_employe_select"    ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_employe_update"    ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_select"            ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_update"            ON stocks_journaliers;

CREATE POLICY "stocks_select"
  ON stocks_journaliers FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY "stocks_owner_insert"
  ON stocks_journaliers FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "stocks_update"
  ON stocks_journaliers FOR UPDATE
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  )
  WITH CHECK (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );

-- ────────────────────────────────────────────────────────────────────────
-- 5. TABLE : produits
--    + [migration_conservation] duree_conservation_jours
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS produits (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id        UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  nom                   TEXT         NOT NULL CHECK (length(nom) BETWEEN 1 AND 100),
  description           TEXT         CHECK (length(description) <= 500),
  categorie             TEXT         NOT NULL DEFAULT 'boulangerie'
                        CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich')),
  emoji                 TEXT         DEFAULT '🥖',
  prix_vente            DECIMAL(8,2) NOT NULL CHECK (prix_vente > 0),
  cout_production       DECIMAL(8,2) DEFAULT 0,
  actif                 BOOLEAN      DEFAULT TRUE,
  actif_catalogue       BOOLEAN      DEFAULT TRUE,
  actif_flash           BOOLEAN      DEFAULT TRUE,
  prix_flash_override   DECIMAL(8,2) DEFAULT NULL
                        CHECK (prix_flash_override IS NULL OR prix_flash_override > 0),
  image_url             TEXT,
  image_storage_path    TEXT,
  allergenes            TEXT[]       DEFAULT '{}',
  disponible_du         DATE         DEFAULT NULL,
  disponible_au         DATE         DEFAULT NULL,
  CONSTRAINT chk_saisonnalite CHECK (
    (disponible_du IS NULL AND disponible_au IS NULL)
    OR (disponible_du IS NOT NULL AND disponible_au IS NOT NULL AND disponible_du <= disponible_au)
  ),
  stock_alerte          INT          DEFAULT NULL,
  note_interne          TEXT         DEFAULT NULL,
  ordre                 INT          DEFAULT 0,
  deleted_at            TIMESTAMPTZ  DEFAULT NULL,
  -- [migration_conservation] durée de vie du produit (1=non reportable, 2-7=reportable)
  duree_conservation_jours INT       NOT NULL DEFAULT 1
                        CHECK (duree_conservation_jours BETWEEN 1 AND 7),
  created_at            TIMESTAMPTZ  DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE produits ADD COLUMN IF NOT EXISTS actif_catalogue           BOOLEAN      DEFAULT TRUE;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS actif_flash               BOOLEAN      DEFAULT TRUE;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS prix_flash_override       DECIMAL(8,2) DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS image_storage_path        TEXT;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS allergenes                TEXT[]       DEFAULT '{}';
ALTER TABLE produits ADD COLUMN IF NOT EXISTS disponible_du             DATE         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS disponible_au             DATE         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS stock_alerte              INT          DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS note_interne              TEXT         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS ordre                     INT          DEFAULT 0;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS deleted_at                TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS duree_conservation_jours  INT          NOT NULL DEFAULT 1;

-- Contrainte catégorie (v5 : sandwich inclus)
ALTER TABLE produits DROP CONSTRAINT IF EXISTS produits_categorie_check;
ALTER TABLE produits ADD CONSTRAINT produits_categorie_check
  CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich'));

DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT chk_saisonnalite CHECK (
    (disponible_du IS NULL AND disponible_au IS NULL)
    OR (disponible_du IS NOT NULL AND disponible_au IS NOT NULL AND disponible_du <= disponible_au)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT chk_duree_conservation
    CHECK (duree_conservation_jours BETWEEN 1 AND 7);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Initialisation duree_conservation selon catégorie (produits existants)
UPDATE produits SET duree_conservation_jours = 1
  WHERE categorie IN ('boulangerie', 'viennoiserie', 'sandwich') AND duree_conservation_jours = 1;
UPDATE produits SET duree_conservation_jours = 2
  WHERE categorie = 'patisserie' AND duree_conservation_jours = 1;

CREATE INDEX IF NOT EXISTS idx_produits_boulangerie
  ON produits(boulangerie_id, actif_catalogue, categorie) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produits_actif_catalogue
  ON produits(boulangerie_id, actif_catalogue) WHERE actif_catalogue = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produits_actif_flash
  ON produits(boulangerie_id, actif_flash) WHERE actif_flash = TRUE AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_produits_updated_at ON produits;
CREATE TRIGGER trg_produits_updated_at
  BEFORE UPDATE ON produits FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE produits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produits_select_own"     ON produits;
DROP POLICY IF EXISTS "produits_insert_own"     ON produits;
DROP POLICY IF EXISTS "produits_update_own"     ON produits;
DROP POLICY IF EXISTS "produits_delete_own"     ON produits;
DROP POLICY IF EXISTS "produits_employe_select" ON produits;
DROP POLICY IF EXISTS "produits_select"         ON produits;

CREATE POLICY "produits_select"
  ON produits FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR (boulangerie_id = get_employee_boulangerie_id() AND deleted_at IS NULL)
  );
CREATE POLICY "produits_insert_own"
  ON produits FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "produits_update_own"
  ON produits FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "produits_delete_own"
  ON produits FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- ────────────────────────────────────────────────────────────────────────
-- 6. TABLE : commandes
--    + [002] colonne type (clickcollect / anti_gaspi)
--    + [002] statut non_recuperee natif
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commandes (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id   UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  client_prenom    TEXT         NOT NULL CHECK (length(client_prenom) BETWEEN 1 AND 50),
  client_email     TEXT         NOT NULL CHECK (client_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  client_telephone TEXT,
  heure_retrait    TIME         NOT NULL,
  notes            TEXT         CHECK (length(notes) <= 500),
  montant_total    NUMERIC(8,2) NOT NULL CHECK (montant_total > 0),
  statut           TEXT         NOT NULL DEFAULT 'en_attente'
                   CHECK (statut IN ('en_attente','confirmee','prete','recuperee','annulee','non_recuperee')),
  type             TEXT         NOT NULL DEFAULT 'clickcollect'
                   CHECK (type IN ('clickcollect', 'anti_gaspi')),
  lignes           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  -- [migration_precommandes] date de retrait (NULL = aujourd'hui)
  date_retrait     DATE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Migration statut hérité
UPDATE commandes SET statut = 'recuperee' WHERE statut = 'retiree';

-- Ajouts idempotents
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'clickcollect';
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS date_retrait DATE;

-- Mise à jour contrainte statut pour inclure non_recuperee
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_statut_check;
ALTER TABLE commandes ADD CONSTRAINT commandes_statut_check
  CHECK (statut IN ('en_attente','confirmee','prete','recuperee','annulee','non_recuperee'));

CREATE INDEX IF NOT EXISTS commandes_boulangerie_date_idx ON commandes(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_email            ON commandes(client_email, boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_type             ON commandes(boulangerie_id, type, created_at DESC);
-- [migration_precommandes] index pré-commandes par date_retrait
CREATE INDEX IF NOT EXISTS idx_commandes_date_retrait     ON commandes(boulangerie_id, date_retrait, statut);

DROP TRIGGER IF EXISTS commandes_updated_at ON commandes;
CREATE TRIGGER commandes_updated_at
  BEFORE UPDATE ON commandes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Baker voit ses commandes"   ON commandes;
DROP POLICY IF EXISTS "Baker met à jour le statut" ON commandes;
DROP POLICY IF EXISTS "commandes_employe_select"   ON commandes;
DROP POLICY IF EXISTS "commandes_employe_update"   ON commandes;
DROP POLICY IF EXISTS "commandes_select"           ON commandes;
DROP POLICY IF EXISTS "commandes_update"           ON commandes;

CREATE POLICY "commandes_select"
  ON commandes FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY "commandes_update"
  ON commandes FOR UPDATE
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  )
  WITH CHECK (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );

-- ────────────────────────────────────────────────────────────────────────
-- 7. TABLE : push_subscriptions
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id UUID NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT,
  auth_key       TEXT,
  subscription   JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_boulangerie ON push_subscriptions(boulangerie_id);
CREATE INDEX IF NOT EXISTS idx_push_user        ON push_subscriptions(user_id);

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions FOR EACH ROW
  EXECUTE FUNCTION update_push_subscription_timestamp();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access"         ON push_subscriptions;
DROP POLICY IF EXISTS "User can upsert own subscription" ON push_subscriptions;
DROP POLICY IF EXISTS "User can delete own subscription" ON push_subscriptions;

CREATE POLICY "Service role full access"
  ON push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "User can upsert own subscription"
  ON push_subscriptions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "User can delete own subscription"
  ON push_subscriptions FOR DELETE USING ((select auth.uid()) = user_id);

-- ────────────────────────────────────────────────────────────────────────
-- 8. TABLE : profils_clients
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profils_clients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom           TEXT        NOT NULL CHECK (length(prenom) BETWEEN 1 AND 50),
  telephone        TEXT        CHECK (telephone IS NULL OR length(telephone) BETWEEN 8 AND 20),
  optin_flash      BOOLEAN     DEFAULT FALSE,
  optin_marketing  BOOLEAN     DEFAULT FALSE,
  rgpd_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rgpd_version     TEXT        NOT NULL DEFAULT '1.0',
  profil_completed BOOLEAN     DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_profils_clients_user_id ON profils_clients(user_id);

DROP TRIGGER IF EXISTS trg_profils_clients_updated_at ON profils_clients;
CREATE TRIGGER trg_profils_clients_updated_at
  BEFORE UPDATE ON profils_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE profils_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_select_own_profil" ON profils_clients;
DROP POLICY IF EXISTS "client_insert_own_profil" ON profils_clients;
DROP POLICY IF EXISTS "client_update_own_profil" ON profils_clients;

CREATE POLICY "client_select_own_profil"
  ON profils_clients FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "client_insert_own_profil"
  ON profils_clients FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "client_update_own_profil"
  ON profils_clients FOR UPDATE USING ((select auth.uid()) = user_id);

-- ────────────────────────────────────────────────────────────────────────
-- 9. TABLE : paniers_flash
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paniers_flash (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  date              DATE         NOT NULL DEFAULT CURRENT_DATE,
  produit_id        TEXT         NOT NULL,
  produit_nom       TEXT         NOT NULL CHECK (length(produit_nom) BETWEEN 1 AND 150),
  produit_emoji     TEXT         NOT NULL DEFAULT '🥖',
  categorie         TEXT         NOT NULL DEFAULT 'boulangerie'
                    CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich')),
  prix_original     DECIMAL(8,2) NOT NULL CHECK (prix_original > 0),
  remise_pct        INT          NOT NULL DEFAULT 40 CHECK (remise_pct BETWEEN 1 AND 100),
  prix_flash        DECIMAL(8,2) NOT NULL CHECK (prix_flash > 0),
  quantite_initiale INT          NOT NULL DEFAULT 1 CHECK (quantite_initiale >= 0),
  quantite_restante INT          NOT NULL DEFAULT 1 CHECK (quantite_restante >= 0),
  allergenes        TEXT[]       NOT NULL DEFAULT '{}',
  actif             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (boulangerie_id, date, produit_id)
);

ALTER TABLE paniers_flash DROP CONSTRAINT IF EXISTS paniers_flash_categorie_check;
ALTER TABLE paniers_flash ADD CONSTRAINT paniers_flash_categorie_check
  CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich'));

CREATE INDEX IF NOT EXISTS idx_paniers_flash_boulangerie_date ON paniers_flash(boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_paniers_flash_actif
  ON paniers_flash(boulangerie_id, date, actif) WHERE actif = TRUE;

DO $$ BEGIN
  CREATE TRIGGER trg_paniers_flash_updated_at
    BEFORE UPDATE ON paniers_flash FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE paniers_flash ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paniers_flash_owner_select"   ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_owner_insert"   ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_owner_update"   ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_owner_delete"   ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_employe_select" ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_select"         ON paniers_flash;

CREATE POLICY "paniers_flash_select"
  ON paniers_flash FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY "paniers_flash_owner_insert"
  ON paniers_flash FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "paniers_flash_owner_update"
  ON paniers_flash FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "paniers_flash_owner_delete"
  ON paniers_flash FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- ────────────────────────────────────────────────────────────────────────
-- 10. TABLE : employes
--     + [migration_dashboard_gerant] last_login_at
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  role              TEXT        NOT NULL DEFAULT 'employe'
                    CHECK (role IN ('gerant', 'employe')),
  permissions       JSONB       NOT NULL DEFAULT '{}',
  statut            TEXT        NOT NULL DEFAULT 'invite'
                    CHECK (statut IN ('invite', 'actif', 'suspendu')),
  invite_email      TEXT        NOT NULL CHECK (invite_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  invite_token      TEXT        UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  created_by        UUID        REFERENCES auth.users(id),
  prenom            TEXT,
  -- [migration_dashboard_gerant] tracking dernière connexion
  last_login_at     TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employes ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_unique_user
  ON employes(boulangerie_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_boulangerie
  ON employes(boulangerie_id, statut);
CREATE INDEX IF NOT EXISTS idx_employes_user
  ON employes(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_invite_token
  ON employes(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_created_by
  ON employes(created_by) WHERE created_by IS NOT NULL;
-- [migration-p2] index pour cron nettoyage invitations
CREATE INDEX IF NOT EXISTS idx_employes_user_statut
  ON employes(user_id, statut);
CREATE INDEX IF NOT EXISTS idx_employes_invite_expires
  ON employes(invite_expires_at) WHERE statut = 'invite';
-- [migration_dashboard_gerant] tri supervision par dernière connexion
CREATE INDEX IF NOT EXISTS idx_employes_last_login
  ON employes(boulangerie_id, last_login_at DESC NULLS LAST);

DO $$ BEGIN
  CREATE TRIGGER trg_employes_updated_at
    BEFORE UPDATE ON employes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE employes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employes_owner_all"   ON employes;
DROP POLICY IF EXISTS "employes_gerant_read" ON employes;
DROP POLICY IF EXISTS "employes_self_read"   ON employes;
DROP POLICY IF EXISTS "employes_service_all" ON employes;
DROP POLICY IF EXISTS "employes_select"      ON employes;
DROP POLICY IF EXISTS "employes_insert"      ON employes;
DROP POLICY IF EXISTS "employes_update"      ON employes;
DROP POLICY IF EXISTS "employes_delete"      ON employes;

CREATE POLICY "employes_select"
  ON employes FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id IN (
      SELECT boulangerie_id FROM employes e2
      WHERE e2.user_id = (select auth.uid()) AND e2.statut = 'actif' AND e2.role = 'gerant'
    )
    OR user_id = (select auth.uid())
  );
CREATE POLICY "employes_insert"
  ON employes FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "employes_update"
  ON employes FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())))
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "employes_delete"
  ON employes FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "employes_service_all"
  ON employes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- 11. TABLE : audit_equipe
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_equipe (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  acteur_id      UUID        REFERENCES auth.users(id),
  cible_id       UUID,
  action         TEXT        NOT NULL,
  details        JSONB       DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_equipe_boulangerie
  ON audit_equipe(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_equipe_acteur
  ON audit_equipe(acteur_id) WHERE acteur_id IS NOT NULL;

ALTER TABLE audit_equipe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_equipe_read"           ON audit_equipe;
DROP POLICY IF EXISTS "audit_equipe_service_insert" ON audit_equipe;

CREATE POLICY "audit_equipe_read"
  ON audit_equipe FOR SELECT
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE user_id = (select auth.uid())
    UNION
    SELECT boulangerie_id FROM employes
    WHERE user_id = (select auth.uid()) AND statut = 'actif' AND role = 'gerant'
  ));
CREATE POLICY "audit_equipe_service_insert"
  ON audit_equipe FOR INSERT TO service_role WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- 12. TABLE : audit_logs (P2 — générique RGPD)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
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
  ON audit_logs(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action  ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_owner_select"  ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_gerant_select" ON audit_logs;

-- Owner : lecture de tous ses logs
CREATE POLICY "audit_logs_owner_select"
  ON audit_logs FOR SELECT
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE user_id = (select auth.uid())
  ));
-- Gérant : lecture des logs de sa boulangerie
CREATE POLICY "audit_logs_gerant_select"
  ON audit_logs FOR SELECT
  USING (boulangerie_id IN (
    SELECT boulangerie_id FROM employes
    WHERE user_id = (select auth.uid()) AND statut = 'actif' AND role = 'gerant'
  ));
-- INSERT : service_role uniquement (empêche l'injection de faux logs)

-- ────────────────────────────────────────────────────────────────────────
-- 13. TABLE : client_penalites (002 — no-show)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_penalites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  client_email    TEXT        NOT NULL CHECK (client_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  nb_non_recupere INT         NOT NULL DEFAULT 0,
  bloque          BOOLEAN     NOT NULL DEFAULT FALSE,
  blocage_date    TIMESTAMPTZ,
  debloque_par_id UUID        REFERENCES auth.users(id),
  debloque_le     TIMESTAMPTZ,
  note_deblocage  TEXT        CHECK (length(note_deblocage) <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(boulangerie_id, client_email)
);

DROP TRIGGER IF EXISTS client_penalites_updated_at ON client_penalites;
CREATE TRIGGER client_penalites_updated_at
  BEFORE UPDATE ON client_penalites FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE client_penalites ENABLE ROW LEVEL SECURITY;
-- Accès via service_role uniquement (API routes)

CREATE INDEX IF NOT EXISTS idx_client_penalites_lookup
  ON client_penalites(boulangerie_id, client_email);

-- ────────────────────────────────────────────────────────────────────────
-- 14. FONCTIONS HELPER (multi-user & sécurité)
-- ────────────────────────────────────────────────────────────────────────

-- 14a. get_employee_boulangerie_id → déjà créée en section 1b

-- 14b. check_boulanger_access — middleware SSR
DROP FUNCTION IF EXISTS check_boulanger_access(UUID);
CREATE OR REPLACE FUNCTION check_boulanger_access(p_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = p_user_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT boulangerie_id INTO v_id FROM employes
  WHERE user_id = p_user_id AND statut = 'actif' LIMIT 1;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION check_boulanger_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_boulanger_access(UUID) TO authenticated;

-- 14c. get_current_user_access — contexte React
DROP FUNCTION IF EXISTS get_current_user_access();
CREATE OR REPLACE FUNCTION get_current_user_access()
RETURNS TABLE (
  boulangerie_id UUID, boulangerie_nom TEXT, boulangerie_slug TEXT,
  boulangerie_plan TEXT, boulangerie_actif BOOLEAN,
  user_role TEXT, custom_permissions JSONB, membre_id UUID
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END;
$$;
REVOKE ALL ON FUNCTION get_current_user_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_access() TO authenticated;

-- 14d. get_team_members
DROP FUNCTION IF EXISTS get_team_members(UUID);
CREATE OR REPLACE FUNCTION get_team_members(p_boulangerie_id UUID)
RETURNS TABLE (
  membre_id UUID, user_id UUID, role TEXT, statut TEXT,
  permissions JSONB, invite_email TEXT, invite_expires_at TIMESTAMPTZ,
  prenom TEXT, created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END;
$$;
REVOKE ALL ON FUNCTION get_team_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_team_members(UUID) TO authenticated;

-- 14e. count_active_members
DROP FUNCTION IF EXISTS count_active_members(UUID);
CREATE OR REPLACE FUNCTION count_active_members(p_boulangerie_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  SELECT 1 + COUNT(*)::INT INTO v_count
  FROM employes WHERE boulangerie_id = p_boulangerie_id AND statut = 'actif';
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION count_active_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_active_members(UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 15. FONCTIONS PUBLIQUES (catalogue & paniers flash)
-- ────────────────────────────────────────────────────────────────────────

-- 15a. get_catalogue_public
DROP FUNCTION IF EXISTS get_catalogue_public(TEXT);
CREATE OR REPLACE FUNCTION get_catalogue_public(p_slug TEXT)
RETURNS TABLE (
  id UUID, nom TEXT, description TEXT, categorie TEXT,
  emoji TEXT, prix_vente DECIMAL, image_url TEXT,
  allergenes TEXT[], actif_flash BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END;
$$;
REVOKE ALL ON FUNCTION get_catalogue_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_catalogue_public(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_catalogue_public(TEXT) TO authenticated;

-- 15b. get_paniers_flash (timezone-aware)
DROP FUNCTION IF EXISTS get_paniers_flash(TEXT);
CREATE OR REPLACE FUNCTION get_paniers_flash(p_slug TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END;
$$;
REVOKE ALL ON FUNCTION get_paniers_flash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_paniers_flash(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_paniers_flash(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 16. FONCTIONS TOUR GUIDÉ
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION complete_tour()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Boulangerie introuvable'; END IF;
  UPDATE boulangeries SET tour_completed_at = NOW() WHERE id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION reset_tour()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Boulangerie introuvable'; END IF;
  UPDATE boulangeries SET tour_completed_at = NULL WHERE id = v_id;
END;
$$;

-- 16b. FONCTIONS ONBOARDING
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION complete_onboarding()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM boulangeries WHERE user_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Boulangerie introuvable'; END IF;
  UPDATE boulangeries SET onboarding_completed_at = NOW() WHERE id = v_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 17. STORAGE — Bucket photos produits
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('produits-photos', 'produits-photos', TRUE, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET
  public = TRUE, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

DROP POLICY IF EXISTS "produits_photos_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "produits_photos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "produits_photos_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "produits_photos_owner_delete" ON storage.objects;

CREATE POLICY "produits_photos_public_read"
  ON storage.objects FOR SELECT USING (bucket_id = 'produits-photos');
CREATE POLICY "produits_photos_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'produits-photos' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY "produits_photos_owner_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'produits-photos' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY "produits_photos_owner_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'produits-photos' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────
-- 17b. STORAGE — Bucket vitrine-images [migration_vitrine_cms]
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vitrine-images',
  'vitrine-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (les images vitrine sont affichées sur la page publique)
DROP POLICY IF EXISTS "vitrine_images_public_read" ON storage.objects;
CREATE POLICY "vitrine_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vitrine-images');

-- ────────────────────────────────────────────────────────────────────────
-- 18. NETTOYAGE héritage
-- ────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS encrypt_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS decrypt_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS check_levain_quota(UUID);
DROP FUNCTION IF EXISTS increment_levain_quota(UUID);

-- ────────────────────────────────────────────────────────────────────────
-- 19. TABLE : ai_rapports (IA Levain)
--     RGPD : aucune PII stockée
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_rapports (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  journee_id          UUID        REFERENCES journees(id) ON DELETE SET NULL,
  date                DATE        NOT NULL,
  score_performance   INT         CHECK (score_performance BETWEEN 0 AND 100),
  verdict_flash       TEXT,
  rapport_json        JSONB       NOT NULL DEFAULT '{}',
  statut              TEXT        NOT NULL DEFAULT 'en_cours'
                      CHECK (statut IN ('en_cours', 'genere', 'erreur')),
  erreur_msg          TEXT        DEFAULT NULL,
  modele_ia           TEXT        DEFAULT 'glm-4.5-air',
  tokens_utilises     INT         DEFAULT NULL,
  feedback_vendeuse   TEXT        DEFAULT NULL,
  evenement_lendemain TEXT        DEFAULT NULL,
  consignes_boulanger TEXT        DEFAULT NULL,
  consignes_vendeuse  TEXT        DEFAULT NULL,
  wizard_evenement    TEXT        DEFAULT NULL,
  wizard_impact       TEXT        DEFAULT NULL,
  wizard_impact_pct   INT         DEFAULT 0,
  meteo_id            UUID        DEFAULT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(boulangerie_id, date)
);

ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS feedback_vendeuse   TEXT DEFAULT NULL;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS evenement_lendemain TEXT DEFAULT NULL;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS consignes_boulanger TEXT DEFAULT NULL;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS consignes_vendeuse  TEXT DEFAULT NULL;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS wizard_evenement    TEXT DEFAULT NULL;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS wizard_impact       TEXT DEFAULT NULL;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS wizard_impact_pct   INT  DEFAULT 0;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS meteo_id            UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_rapports_boulangerie_date
  ON ai_rapports(boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_rapports_statut
  ON ai_rapports(statut) WHERE statut = 'en_cours';
CREATE INDEX IF NOT EXISTS idx_ai_rapports_journee_id
  ON ai_rapports(journee_id) WHERE journee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_rapports_meteo_id
  ON ai_rapports(meteo_id) WHERE meteo_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ai_rapports_updated_at ON ai_rapports;
CREATE TRIGGER trg_ai_rapports_updated_at
  BEFORE UPDATE ON ai_rapports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ai_rapports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_rapports_owner_select" ON ai_rapports;
DROP POLICY IF EXISTS "ai_rapports_owner_insert" ON ai_rapports;
DROP POLICY IF EXISTS "ai_rapports_owner_update" ON ai_rapports;

CREATE POLICY "ai_rapports_owner_select"
  ON ai_rapports FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "ai_rapports_owner_insert"
  ON ai_rapports FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "ai_rapports_owner_update"
  ON ai_rapports FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- ────────────────────────────────────────────────────────────────────────
-- 20. TABLE : production_forecasts
--     + [migration-forecasts-fourchette-v2] quantite_min / quantite_max
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_forecasts (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  rapport_id        UUID         REFERENCES ai_rapports(id) ON DELETE CASCADE,
  date_production   DATE         NOT NULL,
  produit_id        TEXT         NOT NULL,
  produit_nom       TEXT         NOT NULL,
  produit_categorie TEXT         DEFAULT 'boulangerie',
  produit_emoji     TEXT         DEFAULT '🥖',
  quantite_suggeree INT          NOT NULL CHECK (quantite_suggeree >= 0),
  quantite_base     INT          NOT NULL DEFAULT 0,
  variation_pct     INT          DEFAULT 0,
  raison            TEXT,
  appliquee         BOOLEAN      DEFAULT FALSE,
  appliquee_le      TIMESTAMPTZ  DEFAULT NULL,
  -- [migration-forecasts-fourchette-v2] fourchette de prévision
  quantite_min      INT          DEFAULT NULL,
  quantite_max      INT          DEFAULT NULL,
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(boulangerie_id, date_production, produit_id)
);

ALTER TABLE production_forecasts ADD COLUMN IF NOT EXISTS quantite_min INT DEFAULT NULL;
ALTER TABLE production_forecasts ADD COLUMN IF NOT EXISTS quantite_max INT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_production_forecasts_date
  ON production_forecasts(boulangerie_id, date_production DESC);
CREATE INDEX IF NOT EXISTS idx_production_forecasts_non_appliquees
  ON production_forecasts(boulangerie_id, date_production) WHERE appliquee = FALSE;
CREATE INDEX IF NOT EXISTS idx_production_forecasts_rapport_id
  ON production_forecasts(rapport_id) WHERE rapport_id IS NOT NULL;

ALTER TABLE production_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecasts_owner_select" ON production_forecasts;
DROP POLICY IF EXISTS "forecasts_owner_insert" ON production_forecasts;
DROP POLICY IF EXISTS "forecasts_owner_update" ON production_forecasts;

CREATE POLICY "forecasts_owner_select"
  ON production_forecasts FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "forecasts_owner_insert"
  ON production_forecasts FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "forecasts_owner_update"
  ON production_forecasts FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- ────────────────────────────────────────────────────────────────────────
-- 21. TABLE : meteo_journees
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meteo_journees (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  date              DATE        NOT NULL,
  temperature_c     NUMERIC(4,1),
  ressenti_c        NUMERIC(4,1),
  humidite_pct      SMALLINT,
  precipitations_mm NUMERIC(5,2),
  vitesse_vent_kmh  NUMERIC(5,1),
  code_meteo        SMALLINT,
  description       TEXT,
  icone             TEXT,
  demain_temp_max_c NUMERIC(4,1),
  demain_temp_min_c NUMERIC(4,1),
  demain_precip_mm  NUMERIC(5,2),
  demain_code_meteo SMALLINT,
  demain_description TEXT,
  demain_icone      TEXT,
  source            TEXT        NOT NULL DEFAULT 'open-meteo',
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(boulangerie_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meteo_boulangerie_date ON meteo_journees(boulangerie_id, date DESC);

DROP TRIGGER IF EXISTS trg_meteo_updated_at ON meteo_journees;
CREATE TRIGGER trg_meteo_updated_at
  BEFORE UPDATE ON meteo_journees FOR EACH ROW EXECUTE FUNCTION update_meteo_updated_at();

ALTER TABLE meteo_journees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meteo_boulangerie_owner" ON meteo_journees;

CREATE POLICY "meteo_boulangerie_owner"
  ON meteo_journees FOR ALL
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())))
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- FK meteo_id sur ai_rapports (après création de meteo_journees)
DO $$ BEGIN
  ALTER TABLE ai_rapports ADD CONSTRAINT ai_rapports_meteo_id_fkey
    FOREIGN KEY (meteo_id) REFERENCES meteo_journees(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 22. TABLE : feedback_journee
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback_journee (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  journee_id       UUID        NOT NULL REFERENCES journees(id) ON DELETE CASCADE,
  boulangerie_id   UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  rating_journee   INT         NOT NULL CHECK (rating_journee BETWEEN 1 AND 4),
  points_forts     TEXT[]      DEFAULT '{}',
  points_ameliorer TEXT[]      DEFAULT '{}',
  commentaire_libre TEXT       CHECK (length(commentaire_libre) <= 1000),
  has_evenement    BOOLEAN     DEFAULT FALSE,
  evenement_desc   TEXT        CHECK (length(evenement_desc) <= 500),
  evenement_impact TEXT        CHECK (evenement_impact IN ('hausse', 'baisse', NULL)),
  evenement_pct    INT         DEFAULT 0 CHECK (evenement_pct BETWEEN 0 AND 100),
  saisi_par_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  saisi_par_prenom TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journee_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_journee_boulangerie
  ON feedback_journee(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_journee_journee
  ON feedback_journee(journee_id);
CREATE INDEX IF NOT EXISTS idx_feedback_journee_saisi_par
  ON feedback_journee(saisi_par_id) WHERE saisi_par_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_feedback_journee_updated_at ON feedback_journee;
CREATE TRIGGER trg_feedback_journee_updated_at
  BEFORE UPDATE ON feedback_journee FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE feedback_journee ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_owner_select"   ON feedback_journee;
DROP POLICY IF EXISTS "feedback_owner_insert"   ON feedback_journee;
DROP POLICY IF EXISTS "feedback_owner_update"   ON feedback_journee;
DROP POLICY IF EXISTS "feedback_employe_select" ON feedback_journee;
DROP POLICY IF EXISTS "feedback_employe_insert" ON feedback_journee;
DROP POLICY IF EXISTS "feedback_employe_update" ON feedback_journee;
DROP POLICY IF EXISTS "feedback_select"         ON feedback_journee;
DROP POLICY IF EXISTS "feedback_insert"         ON feedback_journee;
DROP POLICY IF EXISTS "feedback_update"         ON feedback_journee;

CREATE POLICY "feedback_select"
  ON feedback_journee FOR SELECT
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY "feedback_insert"
  ON feedback_journee FOR INSERT
  WITH CHECK (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );
CREATE POLICY "feedback_update"
  ON feedback_journee FOR UPDATE
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid()))
    OR boulangerie_id = get_employee_boulangerie_id()
  );

-- ────────────────────────────────────────────────────────────────────────
-- 23. FONCTIONS LEVAIN QUOTA
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_and_increment_levain_quota(p_boulangerie_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END;
$$;
REVOKE ALL ON FUNCTION check_and_increment_levain_quota(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_and_increment_levain_quota(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION check_and_increment_levain_quota(UUID) TO service_role;

CREATE OR REPLACE FUNCTION get_levain_quota(p_boulangerie_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END;
$$;
REVOKE ALL ON FUNCTION get_levain_quota(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_levain_quota(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_levain_quota(UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 23b. FONCTION : get_fallback_production (prévisions fallback même jour de semaine)
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_fallback_production(
  p_boulangerie_id UUID,
  p_jour_semaine   SMALLINT,
  p_date_avant     DATE
)
RETURNS TABLE (
  journee_id   UUID,
  journee_date DATE,
  produit_id   TEXT,
  produit_nom  TEXT,
  production   INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_journee_id   UUID;
  v_journee_date DATE;
BEGIN
  -- Trouver la dernière journée clôturée du même jour de semaine
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
END;
$$;

REVOKE ALL ON FUNCTION get_fallback_production(UUID, SMALLINT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_fallback_production(UUID, SMALLINT, DATE) FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_fallback_production(UUID, SMALLINT, DATE) TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 24. FONCTION : cleanup_expired_invites (version P2 — avec audit log)
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
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
END;
$func$;

-- ────────────────────────────────────────────────────────────────────────
-- 25. FONCTION : acheter_paniers_flash (002 — RPC atomique)
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION acheter_paniers_flash(
  p_boulangerie_id UUID,
  p_date           DATE,
  p_produit_ids    TEXT[]
) RETURNS JSONB LANGUAGE plpgsql AS $$
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
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 25b. RPC ATOMIQUE : VÉRIFICATION STOCK COMMANDE C&C
--      + [migration_precommandes] support pré-commandes J+1 via p_date_retrait
-- ────────────────────────────────────────────────────────────────────────
-- Vérifie la disponibilité du stock pour une commande Click & Collect
-- de manière atomique (SELECT FOR UPDATE sur stocks_journaliers).
--
-- Si p_date_retrait > p_date (= demain), on insère sans vérifier le stock
-- car la production n'a pas encore eu lieu pour cette date.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verifier_stock_commande(
  p_boulangerie_id   UUID,
  p_date             DATE,
  p_lignes           JSONB,
  p_timezone         TEXT DEFAULT 'Europe/Paris',
  p_client_prenom    TEXT DEFAULT NULL,
  p_client_email     TEXT DEFAULT NULL,
  p_client_telephone TEXT DEFAULT NULL,
  p_heure_retrait    TIME DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_montant_total    NUMERIC DEFAULT NULL,
  p_date_retrait     DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
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
  -- Date de retrait effective : si non fournie, c'est aujourd'hui
  v_effective_date := COALESCE(p_date_retrait, p_date);

  -- ═══════════════════════════════════════════════════════════════
  -- PRÉ-COMMANDE (date_retrait > aujourd'hui) → pas de vérif stock
  -- On insère directement la commande car la production n'a pas
  -- encore eu lieu pour cette date.
  -- ═══════════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════════
  -- COMMANDE DU JOUR — Vérification stock standard
  -- ═══════════════════════════════════════════════════════════════

  -- Bornes de la journée en tenant compte du timezone de la boulangerie
  v_day_start := (p_date::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone;
  v_day_end   := ((p_date + 1)::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone;

  -- 1. Vérifier qu'une journée existe
  SELECT id INTO v_journee_id
  FROM journees
  WHERE boulangerie_id = p_boulangerie_id
    AND date = p_date;

  IF v_journee_id IS NULL THEN
    RAISE EXCEPTION 'La production du jour n''a pas encore été saisie.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Pour chaque ligne de la commande
  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_produit_id  := v_ligne->>'produit_id';
    v_produit_nom := v_ligne->>'produit_nom';
    v_quantite    := (v_ligne->>'quantite')::INT;

    -- 3. Lire la production avec verrou exclusif (sérialise les transactions concurrentes)
    SELECT COALESCE(sj.production, 0), COALESCE(sj.report_veille, 0)
    INTO v_production, v_report
    FROM stocks_journaliers sj
    WHERE sj.journee_id = v_journee_id
      AND sj.produit_id = v_produit_id
    FOR UPDATE;

    -- Si le produit n'est pas dans la production du jour → refus
    IF NOT FOUND THEN
      v_indisponibles := v_indisponibles
        || v_produit_nom || ' : produit non disponible aujourd''hui|';
      CONTINUE;
    END IF;

    v_total_prod := v_production + v_report;

    -- 4. Calculer les réservations C&C actives (par produit_id dans les lignes JSONB)
    SELECT COALESCE(SUM((l->>'quantite')::INT), 0) INTO v_reserved_cc
    FROM commandes c,
         jsonb_array_elements(c.lignes) AS l
    WHERE c.boulangerie_id = p_boulangerie_id
      AND c.created_at >= v_day_start
      AND c.created_at <  v_day_end
      AND c.statut IN ('en_attente', 'confirmee', 'prete', 'recuperee')
      AND (c.date_retrait IS NULL OR c.date_retrait = p_date)
      AND l->>'produit_id' = v_produit_id;

    -- 5. Calculer les réservations flash (quantite_initiale entière)
    SELECT COALESCE(SUM(quantite_initiale), 0) INTO v_reserved_flash
    FROM paniers_flash
    WHERE boulangerie_id = p_boulangerie_id
      AND date = p_date
      AND produit_id = v_produit_id
      AND actif = TRUE;

    -- 6. Vérifier la disponibilité
    v_disponible := v_total_prod - v_reserved_cc - v_reserved_flash;

    IF v_quantite > v_disponible THEN
      v_indisponibles := v_indisponibles
        || v_produit_nom || ' : '
        || GREATEST(v_disponible, 0) || ' disponible(s), '
        || v_quantite || ' demandé(s)|';
    END IF;
  END LOOP;

  -- 7. Si des produits sont indisponibles → erreur
  IF v_indisponibles <> '' THEN
    RAISE EXCEPTION 'Stock insuffisant|%', v_indisponibles
      USING ERRCODE = 'P0002';
  END IF;

  -- 8. Stock OK → insérer la commande dans la même transaction (atomique)
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
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 26. VÉRIFICATION FINALE
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_tables      INT;
  n_fonctions   INT;
  n_buckets     INT;
  n_airtable    INT;
  n_search_path INT;
  n_fk_indexes  INT;
  n_vitrine     INT;
  n_profil      INT;
  n_precommande INT;
BEGIN
  SELECT COUNT(*) INTO n_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'boulangeries','journees','stocks_journaliers','produits',
       'commandes','push_subscriptions','profils_clients',
       'paniers_flash','employes','audit_equipe',
       'ai_rapports','production_forecasts','meteo_journees',
       'feedback_journee','audit_logs','client_penalites'
     );

  SELECT COUNT(*) INTO n_fonctions
    FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'update_updated_at','set_updated_at',
       'update_push_subscription_timestamp','update_meteo_updated_at',
       'get_catalogue_public','get_paniers_flash',
       'complete_tour','reset_tour','complete_onboarding',
       'check_boulanger_access','get_current_user_access',
       'get_team_members','count_active_members',
       'cleanup_expired_invites','get_employee_boulangerie_id',
       'check_and_increment_levain_quota','get_levain_quota',
       'acheter_paniers_flash',
       'verifier_stock_commande'
     );

  SELECT COUNT(*) INTO n_buckets
    FROM storage.buckets WHERE id IN ('produits-photos', 'vitrine-images');

  SELECT COUNT(*) INTO n_airtable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'boulangeries'
     AND column_name LIKE 'airtable%';

  SELECT COUNT(*) INTO n_search_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'update_updated_at','set_updated_at',
       'update_push_subscription_timestamp','update_meteo_updated_at'
     )
     AND p.proconfig::text LIKE '%search_path%';

  SELECT COUNT(*) INTO n_fk_indexes
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN (
       'idx_employes_created_by','idx_audit_equipe_acteur',
       'idx_feedback_journee_saisi_par','idx_ai_rapports_journee_id',
       'idx_ai_rapports_meteo_id','idx_production_forecasts_rapport_id'
     );

  -- Vérification migration_vitrine_cms
  SELECT COUNT(*) INTO n_vitrine
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'boulangeries'
     AND column_name IN ('vitrine_accroche', 'vitrine_hero_image_url', 'vitrine_horaires');

  -- Vérification migration_profil_boulangerie
  SELECT COUNT(*) INTO n_profil
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'boulangeries'
     AND column_name IN ('jours_fermes', 'type_clientele', 'specialites');

  -- Vérification migration_precommandes
  SELECT COUNT(*) INTO n_precommande
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'commandes'
     AND column_name = 'date_retrait';

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ Sauve Mie — Migration Complète v6.0 (12 avril 2026)';
  RAISE NOTICE '';
  RAISE NOTICE '   Tables        : % / 16', n_tables;
  RAISE NOTICE '   Fonctions     : % / 18', n_fonctions;
  RAISE NOTICE '   Storage       : % / 2 buckets', n_buckets;
  RAISE NOTICE '   Airtable      : % colonne(s) résiduelle(s)', n_airtable;
  RAISE NOTICE '';
  RAISE NOTICE '   🔒 Sécurité';
  RAISE NOTICE '   search_path   : % / 4 fonctions corrigées', n_search_path;
  RAISE NOTICE '';
  RAISE NOTICE '   ⚡ Performance';
  RAISE NOTICE '   RLS initplan  : ✅ (select auth.uid()) partout';
  RAISE NOTICE '   Multi-policy  : ✅ policies fusionnées / TO service_role';
  RAISE NOTICE '   FK indexes    : % / 6 ajoutés', n_fk_indexes;
  RAISE NOTICE '';
  RAISE NOTICE '   📦 Modules inclus';
  RAISE NOTICE '   Conservation invendus  : ✅ duree_conservation, report_veille';
  RAISE NOTICE '   Dashboard gérant       : ✅ last_login_at, idx_employes_last_login';
  RAISE NOTICE '   RGPD / Audit P2        : ✅ audit_logs, cleanup_expired_invites CTE';
  RAISE NOTICE '   Prévisions fourchette  : ✅ quantite_min, quantite_max';
  RAISE NOTICE '   Pénalités no-show      : ✅ client_penalites, seuil_penalite';
  RAISE NOTICE '   Achat flash atomique   : ✅ acheter_paniers_flash RPC';
  RAISE NOTICE '   Statut non_recuperee   : ✅ natif en base';
  RAISE NOTICE '   Type commande          : ✅ clickcollect / anti_gaspi';
  RAISE NOTICE '   Profil boulangerie     : ✅ % / 3 colonnes (jours, clientèle, spécialités)', n_profil;
  RAISE NOTICE '   Vitrine CMS            : ✅ % / 3 colonnes + bucket vitrine-images', n_vitrine;
  RAISE NOTICE '   Pré-commandes J+1      : ✅ % colonne date_retrait + verifier_stock_commande', n_precommande;
  RAISE NOTICE '   Jour semaine           : ✅ jour_semaine + trigger + get_fallback_production RPC';
  RAISE NOTICE '';
  RAISE NOTICE '   ⚠️  Action manuelle :';
  RAISE NOTICE '   Supabase → Auth → Settings → Leaked Password Protection';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF n_tables    < 16 THEN RAISE EXCEPTION '❌ Tables manquantes : % / 16',    n_tables; END IF;
  IF n_fonctions < 18 THEN RAISE EXCEPTION '❌ Fonctions manquantes : % / 18', n_fonctions; END IF;
  IF n_search_path < 4 THEN RAISE EXCEPTION '❌ search_path manquant : % / 4', n_search_path; END IF;
  IF n_buckets   < 2  THEN RAISE WARNING '⚠️  Buckets manquants : % / 2', n_buckets; END IF;
  IF n_airtable  > 0  THEN RAISE WARNING '⚠️  % colonne(s) Airtable encore présentes', n_airtable; END IF;
  IF n_vitrine   < 3  THEN RAISE WARNING '⚠️  Colonnes vitrine manquantes : % / 3', n_vitrine; END IF;
  IF n_profil    < 3  THEN RAISE WARNING '⚠️  Colonnes profil manquantes : % / 3', n_profil; END IF;
  IF n_precommande < 1 THEN RAISE WARNING '⚠️  Colonne date_retrait manquante sur commandes'; END IF;
END $$;

COMMIT;
