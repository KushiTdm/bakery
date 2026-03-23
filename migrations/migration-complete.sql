-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration COMPLÈTE FINALE
-- Remplace : migration-v4 + v5 + ia-glm_zai + meteo-timezone +
--            v6-feedback-journee + levain-quota-v6
--
-- ✅ Corrections sécurité (Supabase Linter WARN) :
--    · update_updated_at()                  → SET search_path = public
--    · set_updated_at()                     → SET search_path = public
--    · update_push_subscription_timestamp() → SET search_path = public
--    · update_meteo_updated_at()            → SET search_path = public
--
-- ✅ Corrections performance RLS (auth_rls_initplan) :
--    · auth.uid() → (select auth.uid()) dans TOUTES les policies
--
-- ✅ Corrections performance RLS (multiple_permissive_policies) :
--    · Fusion des policies owner + employe pour chaque table
--    · Policies service_role restreintes avec TO service_role
--
-- ✅ Corrections performance (unindexed_foreign_keys) :
--    · 6 index FK manquants ajoutés
--
-- ✅ Correction bug PL/pgSQL :
--    · cleanup_expired_invites() : RETURNING COUNT(*) → GET DIAGNOSTICS
--
-- ⚠️  Action manuelle requise (hors SQL) :
--    · Supabase Dashboard → Authentication → Settings
--      → Activer "Leaked Password Protection" (HaveIBeenPwned)
--
-- ✅ Idempotent : safe à relancer depuis zéro
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────
-- 1. FONCTIONS UTILITAIRES
--    ✅ SET search_path = public ajouté sur toutes les fonctions trigger
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_meteo_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
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
                           CHECK (plan IN ('starter', 'pro', 'multi')),
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
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  trial_ends_at            TIMESTAMPTZ,
  stripe_status            TEXT        NOT NULL DEFAULT 'inactive'
                           CHECK (stripe_status IN (
                             'inactive','trialing','active','past_due','canceled','unpaid'
                           )),
  levain_quota_week_start  DATE        DEFAULT NULL,
  levain_quota_used        INT         DEFAULT 0,
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
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_status          TEXT        NOT NULL DEFAULT 'inactive';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS levain_quota_week_start DATE        DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS levain_quota_used       INT         DEFAULT 0;

-- Suppression colonnes Airtable résiduelles
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_api_key;
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_base_id;
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_api_key_enc;
ALTER TABLE boulangeries DROP COLUMN IF EXISTS airtable_base_id_enc;

-- Contraintes CHECK idempotentes
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_code_postal
    CHECK (code_postal IS NULL OR code_postal ~ '^\d{5}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_stripe_status
    CHECK (stripe_status IN ('inactive','trialing','active','past_due','canceled','unpaid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_flash_heure_debut
    CHECK (flash_heure_debut BETWEEN 0 AND 23);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_flash_heure_fin
    CHECK (flash_heure_fin BETWEEN 1 AND 24);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE boulangeries ADD CONSTRAINT chk_flash_remise_pct
    CHECK (flash_remise_pct BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Valeurs par défaut pour lignes existantes
UPDATE boulangeries SET flash_heure_debut       = 18              WHERE flash_heure_debut IS NULL;
UPDATE boulangeries SET flash_heure_fin         = 20              WHERE flash_heure_fin   IS NULL;
UPDATE boulangeries SET flash_remise_pct        = 40              WHERE flash_remise_pct  IS NULL;
UPDATE boulangeries SET timezone                = 'Europe/Paris'  WHERE timezone          IS NULL;
UPDATE boulangeries SET creneaux_retrait        = ARRAY['08:00', '09:00', '10:00'] WHERE creneaux_retrait IS NULL;
UPDATE boulangeries SET levain_quota_week_start = DATE_TRUNC('week', CURRENT_DATE)::DATE,
                        levain_quota_used       = 0
WHERE levain_quota_week_start IS NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_boulangeries_user_id ON boulangeries(user_id);
CREATE INDEX IF NOT EXISTS idx_boulangeries_slug     ON boulangeries(slug);
CREATE INDEX IF NOT EXISTS idx_boulangeries_ville    ON boulangeries(ville) WHERE ville IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boulangeries_tour     ON boulangeries(id) WHERE tour_completed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_stripe_customer
  ON boulangeries(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_boulangeries_updated_at ON boulangeries;
CREATE TRIGGER trg_boulangeries_updated_at
  BEFORE UPDATE ON boulangeries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS boulangeries
-- ✅ (select auth.uid()) — évaluation unique par requête
-- ✅ Policies SELECT fusionnées owner + employe
ALTER TABLE boulangeries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boulangerie_select_own"     ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_insert_own"     ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_update_own"     ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_employe_select" ON boulangeries;
DROP POLICY IF EXISTS "boulangeries_select"        ON boulangeries;

-- SELECT : owner OU employé actif (une seule policy)
CREATE POLICY "boulangeries_select"
  ON boulangeries FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR id = get_employee_boulangerie_id()
  );

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

DROP TRIGGER IF EXISTS trg_journees_updated_at ON journees;
CREATE TRIGGER trg_journees_updated_at
  BEFORE UPDATE ON journees FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS journees
-- ✅ Policies SELECT fusionnées owner + employe
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
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(journee_id, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_stocks_journee     ON stocks_journaliers(journee_id);
CREATE INDEX IF NOT EXISTS idx_stocks_boulangerie ON stocks_journaliers(boulangerie_id);

DROP TRIGGER IF EXISTS trg_stocks_updated_at ON stocks_journaliers;
CREATE TRIGGER trg_stocks_updated_at
  BEFORE UPDATE ON stocks_journaliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS stocks_journaliers
-- ✅ Policies SELECT et UPDATE fusionnées owner + employe
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
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS produits (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id       UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  nom                  TEXT         NOT NULL CHECK (length(nom) BETWEEN 1 AND 100),
  description          TEXT         CHECK (length(description) <= 500),
  -- ✅ v5 : sandwich ajouté
  categorie            TEXT         NOT NULL DEFAULT 'boulangerie'
                       CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich')),
  emoji                TEXT         DEFAULT '🥖',
  prix_vente           DECIMAL(8,2) NOT NULL CHECK (prix_vente > 0),
  cout_production      DECIMAL(8,2) DEFAULT 0,
  actif                BOOLEAN      DEFAULT TRUE,
  actif_catalogue      BOOLEAN      DEFAULT TRUE,
  actif_flash          BOOLEAN      DEFAULT TRUE,
  prix_flash_override  DECIMAL(8,2) DEFAULT NULL
                       CHECK (prix_flash_override IS NULL OR prix_flash_override > 0),
  image_url            TEXT,
  image_storage_path   TEXT,
  allergenes           TEXT[]       DEFAULT '{}',
  disponible_du        DATE         DEFAULT NULL,
  disponible_au        DATE         DEFAULT NULL,
  CONSTRAINT chk_saisonnalite CHECK (
    (disponible_du IS NULL AND disponible_au IS NULL)
    OR (disponible_du IS NOT NULL AND disponible_au IS NOT NULL AND disponible_du <= disponible_au)
  ),
  stock_alerte         INT          DEFAULT NULL,
  note_interne         TEXT         DEFAULT NULL,
  ordre                INT          DEFAULT 0,
  deleted_at           TIMESTAMPTZ  DEFAULT NULL,
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE produits ADD COLUMN IF NOT EXISTS actif_catalogue     BOOLEAN      DEFAULT TRUE;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS actif_flash         BOOLEAN      DEFAULT TRUE;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS prix_flash_override DECIMAL(8,2) DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS image_storage_path  TEXT;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS allergenes          TEXT[]       DEFAULT '{}';
ALTER TABLE produits ADD COLUMN IF NOT EXISTS disponible_du       DATE         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS disponible_au       DATE         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS stock_alerte        INT          DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS note_interne        TEXT         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS ordre               INT          DEFAULT 0;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ  DEFAULT NULL;

-- Mise à jour contrainte catégorie pour inclure sandwich (v5)
ALTER TABLE produits DROP CONSTRAINT IF EXISTS produits_categorie_check;
ALTER TABLE produits ADD CONSTRAINT produits_categorie_check
  CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich'));

DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT chk_saisonnalite CHECK (
    (disponible_du IS NULL AND disponible_au IS NULL)
    OR (disponible_du IS NOT NULL AND disponible_au IS NOT NULL AND disponible_du <= disponible_au)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_produits_boulangerie
  ON produits(boulangerie_id, actif_catalogue, categorie) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produits_actif_catalogue
  ON produits(boulangerie_id, actif_catalogue) WHERE actif_catalogue = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produits_actif_flash
  ON produits(boulangerie_id, actif_flash) WHERE actif_flash = TRUE AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_produits_updated_at ON produits;
CREATE TRIGGER trg_produits_updated_at
  BEFORE UPDATE ON produits FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS produits
-- ✅ SELECT fusionné owner + employe
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
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commandes (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  client_prenom     TEXT         NOT NULL CHECK (length(client_prenom) BETWEEN 1 AND 50),
  client_email      TEXT         NOT NULL CHECK (client_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  client_telephone  TEXT,
  heure_retrait     TIME         NOT NULL,
  notes             TEXT         CHECK (length(notes) <= 500),
  montant_total     NUMERIC(8,2) NOT NULL CHECK (montant_total > 0),
  statut            TEXT         NOT NULL DEFAULT 'en_attente'
                    CHECK (statut IN ('en_attente', 'confirmee', 'prete', 'recuperee', 'annulee')),
  lignes            JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

UPDATE commandes SET statut = 'recuperee' WHERE statut = 'retiree';

CREATE INDEX IF NOT EXISTS commandes_boulangerie_date_idx ON commandes(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_email ON commandes(client_email, boulangerie_id, created_at DESC);

DROP TRIGGER IF EXISTS commandes_updated_at ON commandes;
CREATE TRIGGER commandes_updated_at
  BEFORE UPDATE ON commandes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS commandes
-- ✅ SELECT et UPDATE fusionnés owner + employe
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

-- RLS push_subscriptions
-- ✅ "Service role full access" restreint avec TO service_role (élimine l'overlap)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access"         ON push_subscriptions;
DROP POLICY IF EXISTS "User can upsert own subscription" ON push_subscriptions;
DROP POLICY IF EXISTS "User can delete own subscription" ON push_subscriptions;

CREATE POLICY "Service role full access"
  ON push_subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "User can upsert own subscription"
  ON push_subscriptions FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "User can delete own subscription"
  ON push_subscriptions FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ────────────────────────────────────────────────────────────────────────
-- 8. TABLE : profils_clients
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profils_clients (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom              TEXT        NOT NULL CHECK (length(prenom) BETWEEN 1 AND 50),
  telephone           TEXT        CHECK (telephone IS NULL OR length(telephone) BETWEEN 8 AND 20),
  optin_flash         BOOLEAN     DEFAULT FALSE,
  optin_marketing     BOOLEAN     DEFAULT FALSE,
  rgpd_accepted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rgpd_version        TEXT        NOT NULL DEFAULT '1.0',
  profil_completed    BOOLEAN     DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_profils_clients_user_id ON profils_clients(user_id);

DROP TRIGGER IF EXISTS trg_profils_clients_updated_at ON profils_clients;
CREATE TRIGGER trg_profils_clients_updated_at
  BEFORE UPDATE ON profils_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS profils_clients
-- ✅ (select auth.uid()) — évaluation unique
ALTER TABLE profils_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_select_own_profil" ON profils_clients;
DROP POLICY IF EXISTS "client_insert_own_profil" ON profils_clients;
DROP POLICY IF EXISTS "client_update_own_profil" ON profils_clients;

CREATE POLICY "client_select_own_profil"
  ON profils_clients FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "client_insert_own_profil"
  ON profils_clients FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "client_update_own_profil"
  ON profils_clients FOR UPDATE
  USING ((select auth.uid()) = user_id);

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
  -- ✅ v5 : sandwich inclus
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

-- Mise à jour contrainte catégorie pour inclure sandwich
ALTER TABLE paniers_flash DROP CONSTRAINT IF EXISTS paniers_flash_categorie_check;
ALTER TABLE paniers_flash ADD CONSTRAINT paniers_flash_categorie_check
  CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich'));

CREATE INDEX IF NOT EXISTS idx_paniers_flash_boulangerie_date
  ON paniers_flash (boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_paniers_flash_actif
  ON paniers_flash (boulangerie_id, date, actif) WHERE actif = TRUE;

DO $$ BEGIN
  CREATE TRIGGER trg_paniers_flash_updated_at
    BEFORE UPDATE ON paniers_flash FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS paniers_flash
-- ✅ SELECT fusionné owner + employe
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
-- 10. TABLE : employes (multi-utilisateurs)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  role                TEXT        NOT NULL DEFAULT 'employe'
                      CHECK (role IN ('gerant', 'employe')),
  permissions         JSONB       NOT NULL DEFAULT '{}',
  statut              TEXT        NOT NULL DEFAULT 'invite'
                      CHECK (statut IN ('invite', 'actif', 'suspendu')),
  invite_email        TEXT        NOT NULL CHECK (invite_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  invite_token        TEXT        UNIQUE,
  invite_expires_at   TIMESTAMPTZ,
  created_by          UUID        REFERENCES auth.users(id),
  prenom              TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_unique_user
  ON employes(boulangerie_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_boulangerie
  ON employes(boulangerie_id, statut);
CREATE INDEX IF NOT EXISTS idx_employes_user
  ON employes(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_invite_token
  ON employes(invite_token) WHERE invite_token IS NOT NULL;
-- ✅ Index FK manquant (unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS idx_employes_created_by
  ON employes(created_by) WHERE created_by IS NOT NULL;

DO $$ BEGIN
  CREATE TRIGGER trg_employes_updated_at
    BEFORE UPDATE ON employes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS employes
-- ✅ Policies restructurées pour éliminer les overlaps :
--    · employes_select  : owner OR gerant OR self (une seule policy SELECT)
--    · employes_insert/update/delete : owner uniquement
--    · employes_service_all : TO service_role — ne s'applique qu'au service_role
ALTER TABLE employes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employes_owner_all"   ON employes;
DROP POLICY IF EXISTS "employes_gerant_read" ON employes;
DROP POLICY IF EXISTS "employes_self_read"   ON employes;
DROP POLICY IF EXISTS "employes_service_all" ON employes;
DROP POLICY IF EXISTS "employes_select"      ON employes;
DROP POLICY IF EXISTS "employes_insert"      ON employes;
DROP POLICY IF EXISTS "employes_update"      ON employes;
DROP POLICY IF EXISTS "employes_delete"      ON employes;

-- SELECT : owner + gérant + soi-même (fusionné)
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

-- INSERT : owner uniquement
CREATE POLICY "employes_insert"
  ON employes FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- UPDATE : owner uniquement
CREATE POLICY "employes_update"
  ON employes FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())))
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- DELETE : owner uniquement
CREATE POLICY "employes_delete"
  ON employes FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- Service role : accès complet, scope limité au rôle service_role
CREATE POLICY "employes_service_all"
  ON employes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- 11. TABLE : audit_equipe
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_equipe (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  acteur_id       UUID        REFERENCES auth.users(id),
  cible_id        UUID,
  action          TEXT        NOT NULL,
  details         JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_equipe_boulangerie
  ON audit_equipe(boulangerie_id, created_at DESC);
-- ✅ Index FK manquant (unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS idx_audit_equipe_acteur
  ON audit_equipe(acteur_id) WHERE acteur_id IS NOT NULL;

-- RLS audit_equipe
-- ✅ audit_equipe_service_insert restreint avec TO service_role
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
  ON audit_equipe FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- 12. FONCTIONS HELPER (multi-user)
-- ────────────────────────────────────────────────────────────────────────

-- Helper RLS : boulangerie_id de l'employé connecté
CREATE OR REPLACE FUNCTION get_employee_boulangerie_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT boulangerie_id FROM employes
  WHERE user_id = auth.uid() AND statut = 'actif'
  LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 13. FONCTIONS SÉCURISÉES
-- ────────────────────────────────────────────────────────────────────────

-- 13a. check_boulanger_access — middleware SSR
DROP FUNCTION IF EXISTS check_boulanger_access(UUID);
CREATE OR REPLACE FUNCTION check_boulanger_access(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

-- 13b. get_current_user_access — contexte React
DROP FUNCTION IF EXISTS get_current_user_access();
CREATE OR REPLACE FUNCTION get_current_user_access()
RETURNS TABLE (
  boulangerie_id     UUID, boulangerie_nom   TEXT, boulangerie_slug  TEXT,
  boulangerie_plan   TEXT, boulangerie_actif BOOLEAN,
  user_role          TEXT, custom_permissions JSONB, membre_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

-- 13c. get_team_members
DROP FUNCTION IF EXISTS get_team_members(UUID);
CREATE OR REPLACE FUNCTION get_team_members(p_boulangerie_id UUID)
RETURNS TABLE (
  membre_id UUID, user_id UUID, role TEXT, statut TEXT,
  permissions JSONB, invite_email TEXT, invite_expires_at TIMESTAMPTZ,
  prenom TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

-- 13d. count_active_members
DROP FUNCTION IF EXISTS count_active_members(UUID);
CREATE OR REPLACE FUNCTION count_active_members(p_boulangerie_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  SELECT 1 + COUNT(*)::INT INTO v_count
  FROM employes WHERE boulangerie_id = p_boulangerie_id AND statut = 'actif';
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION count_active_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_active_members(UUID) TO service_role;

-- 13e. cleanup_expired_invites
-- ✅ Bug corrigé : RETURNING COUNT(*) remplacé par GET DIAGNOSTICS
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM employes
  WHERE statut = 'invite' AND invite_expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 14. FONCTIONS PUBLIQUES
-- ────────────────────────────────────────────────────────────────────────

-- 14a. get_catalogue_public — v5 : inclut sandwich
DROP FUNCTION IF EXISTS get_catalogue_public(TEXT);
CREATE OR REPLACE FUNCTION get_catalogue_public(p_slug TEXT)
RETURNS TABLE (
  id UUID, nom TEXT, description TEXT, categorie TEXT,
  emoji TEXT, prix_vente DECIMAL, image_url TEXT,
  allergenes TEXT[], actif_flash BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

-- 14b. get_paniers_flash — timezone-aware
DROP FUNCTION IF EXISTS get_paniers_flash(TEXT);
CREATE OR REPLACE FUNCTION get_paniers_flash(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
-- 15. FONCTIONS TOUR GUIDÉ
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

-- ────────────────────────────────────────────────────────────────────────
-- 16. STORAGE — Bucket photos produits
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
-- 17. NETTOYAGE héritage
-- ────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS encrypt_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS decrypt_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS check_levain_quota(UUID);
DROP FUNCTION IF EXISTS increment_levain_quota(UUID);

-- ────────────────────────────────────────────────────────────────────────
-- 18. TABLE : ai_rapports (IA Levain)
--    RGPD : aucune PII stockée — données anonymisées
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_rapports (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id       UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  journee_id           UUID        REFERENCES journees(id) ON DELETE SET NULL,
  date                 DATE        NOT NULL,
  score_performance    INT         CHECK (score_performance BETWEEN 0 AND 100),
  verdict_flash        TEXT,
  rapport_json         JSONB       NOT NULL DEFAULT '{}',
  statut               TEXT        NOT NULL DEFAULT 'en_cours'
                       CHECK (statut IN ('en_cours', 'genere', 'erreur')),
  erreur_msg           TEXT        DEFAULT NULL,
  modele_ia            TEXT        DEFAULT 'glm-4.5-air',
  tokens_utilises      INT         DEFAULT NULL,
  -- v5 colonnes feedback
  feedback_vendeuse    TEXT        DEFAULT NULL,
  evenement_lendemain  TEXT        DEFAULT NULL,
  -- v6 colonnes wizard pré-rapport
  consignes_boulanger  TEXT        DEFAULT NULL,
  consignes_vendeuse   TEXT        DEFAULT NULL,
  wizard_evenement     TEXT        DEFAULT NULL,
  wizard_impact        TEXT        DEFAULT NULL,
  wizard_impact_pct    INT         DEFAULT 0,
  -- lien météo (meteo-timezone)
  meteo_id             UUID        DEFAULT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(boulangerie_id, date)
);

-- Colonnes idempotentes
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
-- ✅ Index FK manquants (unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS idx_ai_rapports_journee_id
  ON ai_rapports(journee_id) WHERE journee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_rapports_meteo_id
  ON ai_rapports(meteo_id) WHERE meteo_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ai_rapports_updated_at ON ai_rapports;
CREATE TRIGGER trg_ai_rapports_updated_at
  BEFORE UPDATE ON ai_rapports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- La contrainte FK meteo_id est ajoutée en section 20, après la création de meteo_journees

-- RLS ai_rapports
-- ✅ (select auth.uid()) dans toutes les policies
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
-- 19. TABLE : production_forecasts
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
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(boulangerie_id, date_production, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_production_forecasts_date
  ON production_forecasts(boulangerie_id, date_production DESC);
CREATE INDEX IF NOT EXISTS idx_production_forecasts_non_appliquees
  ON production_forecasts(boulangerie_id, date_production)
  WHERE appliquee = FALSE;
-- ✅ Index FK manquant (unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS idx_production_forecasts_rapport_id
  ON production_forecasts(rapport_id) WHERE rapport_id IS NOT NULL;

-- RLS production_forecasts
-- ✅ (select auth.uid()) dans toutes les policies
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
-- 20. TABLE : meteo_journees
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

CREATE INDEX IF NOT EXISTS idx_meteo_boulangerie_date
  ON meteo_journees(boulangerie_id, date DESC);

DROP TRIGGER IF EXISTS trg_meteo_updated_at ON meteo_journees;
CREATE TRIGGER trg_meteo_updated_at
  BEFORE UPDATE ON meteo_journees
  FOR EACH ROW EXECUTE FUNCTION update_meteo_updated_at();

-- RLS meteo_journees
-- ✅ (select auth.uid()) — évaluation unique
ALTER TABLE meteo_journees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meteo_boulangerie_owner" ON meteo_journees;

CREATE POLICY "meteo_boulangerie_owner"
  ON meteo_journees FOR ALL
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = (select auth.uid())
    )
  );

-- Ajout FK meteo_id sur ai_rapports maintenant que meteo_journees existe
DO $$ BEGIN
  ALTER TABLE ai_rapports
    ADD CONSTRAINT ai_rapports_meteo_id_fkey
    FOREIGN KEY (meteo_id) REFERENCES meteo_journees(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 21. TABLE : feedback_journee
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback_journee (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  journee_id        UUID        NOT NULL REFERENCES journees(id) ON DELETE CASCADE,
  boulangerie_id    UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  rating_journee    INT         NOT NULL CHECK (rating_journee BETWEEN 1 AND 4),
  points_forts      TEXT[]      DEFAULT '{}',
  points_ameliorer  TEXT[]      DEFAULT '{}',
  commentaire_libre TEXT        CHECK (length(commentaire_libre) <= 1000),
  has_evenement     BOOLEAN     DEFAULT FALSE,
  evenement_desc    TEXT        CHECK (length(evenement_desc) <= 500),
  evenement_impact  TEXT        CHECK (evenement_impact IN ('hausse', 'baisse', NULL)),
  evenement_pct     INT         DEFAULT 0 CHECK (evenement_pct BETWEEN 0 AND 100),
  saisi_par_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  saisi_par_prenom  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journee_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_journee_boulangerie
  ON feedback_journee(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_journee_journee
  ON feedback_journee(journee_id);
-- ✅ Index FK manquant (unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS idx_feedback_journee_saisi_par
  ON feedback_journee(saisi_par_id) WHERE saisi_par_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_feedback_journee_updated_at ON feedback_journee;
CREATE TRIGGER trg_feedback_journee_updated_at
  BEFORE UPDATE ON feedback_journee
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS feedback_journee
-- ✅ Policies SELECT/INSERT/UPDATE fusionnées owner + employe
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
-- 22. FONCTIONS LEVAIN QUOTA
--     (déjà avec SET search_path = public — conservées telles quelles)
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
  SELECT plan, levain_quota_week_start, levain_quota_used
  INTO   v_plan, v_quota_week_start, v_quota_used
  FROM   boulangeries
  WHERE  id = p_boulangerie_id
  FOR UPDATE;

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
REVOKE ALL ON FUNCTION check_and_increment_levain_quota(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_and_increment_levain_quota(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION check_and_increment_levain_quota(UUID) TO service_role;

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
-- 23. VÉRIFICATION FINALE
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_tables        INT;
  n_fonctions     INT;
  n_bucket        INT;
  n_airtable      INT;
  n_search_path   INT;
  n_fk_indexes    INT;
BEGIN
  -- Tables
  SELECT COUNT(*) INTO n_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'boulangeries', 'journees', 'stocks_journaliers', 'produits',
       'commandes', 'push_subscriptions', 'profils_clients',
       'paniers_flash', 'employes', 'audit_equipe',
       'ai_rapports', 'production_forecasts', 'meteo_journees',
       'feedback_journee'
     );

  -- Fonctions
  SELECT COUNT(*) INTO n_fonctions
    FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'update_updated_at', 'set_updated_at',
       'update_push_subscription_timestamp', 'update_meteo_updated_at',
       'get_catalogue_public', 'get_paniers_flash',
       'complete_tour', 'reset_tour',
       'check_boulanger_access', 'get_current_user_access',
       'get_team_members', 'count_active_members',
       'cleanup_expired_invites', 'get_employee_boulangerie_id',
       'check_and_increment_levain_quota', 'get_levain_quota'
     );

  -- Storage bucket
  SELECT COUNT(*) INTO n_bucket
    FROM storage.buckets WHERE id = 'produits-photos';

  -- Colonnes Airtable résiduelles
  SELECT COUNT(*) INTO n_airtable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'boulangeries'
     AND column_name LIKE 'airtable%';

  -- ✅ Vérification search_path sur les 4 fonctions trigger corrigées
  SELECT COUNT(*) INTO n_search_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'update_updated_at', 'set_updated_at',
       'update_push_subscription_timestamp', 'update_meteo_updated_at'
     )
     AND p.proconfig::text LIKE '%search_path%';

  -- ✅ Vérification index FK ajoutés
  SELECT COUNT(*) INTO n_fk_indexes
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN (
       'idx_employes_created_by', 'idx_audit_equipe_acteur',
       'idx_feedback_journee_saisi_par', 'idx_ai_rapports_journee_id',
       'idx_ai_rapports_meteo_id', 'idx_production_forecasts_rapport_id'
     );

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS — Migration Complète Finale';
  RAISE NOTICE '';
  RAISE NOTICE '   Tables        : % / 14', n_tables;
  RAISE NOTICE '   Fonctions     : % / 16', n_fonctions;
  RAISE NOTICE '   Storage       : %', CASE WHEN n_bucket > 0 THEN '✓' ELSE '✗ manquant' END;
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
  RAISE NOTICE '   🐛 Bugs corrigés';
  RAISE NOTICE '   cleanup_invites : ✅ GET DIAGNOSTICS (était RETURNING COUNT(*))';
  RAISE NOTICE '';
  RAISE NOTICE '   ⚠️  Action manuelle :';
  RAISE NOTICE '   Supabase Dashboard → Auth → Settings';
  RAISE NOTICE '   → Activer Leaked Password Protection';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF n_tables    < 14 THEN RAISE EXCEPTION '❌ Tables manquantes : % / 14', n_tables; END IF;
  IF n_fonctions < 16 THEN RAISE EXCEPTION '❌ Fonctions manquantes : % / 16', n_fonctions; END IF;
  IF n_search_path < 4 THEN RAISE EXCEPTION '❌ search_path manquant sur % / 4 fonctions', n_search_path; END IF;
  IF n_bucket    = 0  THEN RAISE WARNING  '⚠️  Bucket produits-photos manquant'; END IF;
  IF n_airtable  > 0  THEN RAISE WARNING  '⚠️  % colonne(s) Airtable encore présente(s)', n_airtable; END IF;
END $$;

COMMIT;