-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration finale consolidée v3.0
-- Remplace TOUTES les migrations précédentes :
--   migration-complete-v1.sql
--   migration-2.sql
--   migration-3-paniers_flash.sql
--   migration-4-panier-flash-fix.sql
--   migration-5-flash-timezone-fix.sql
--   migration-v2.sql
--
-- ✅ Sans Airtable
-- ✅ Adresse & créneaux de retrait (migration-2)
-- ✅ Table paniers_flash (migration-3/4)
-- ✅ get_paniers_flash() lit depuis paniers_flash (migration-4)
-- ✅ Fuseau horaire Paris cohérent (migration-5)
-- ✅ Soft delete produits (colonne deleted_at) — fix E2
-- ✅ Cast UUID sécurisé dans les jointures — fix B1
-- ✅ Tour guidé boulanger
-- ✅ Idempotent : peut être ré-exécuté sans risque
--
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────
-- 1. FONCTIONS UTILITAIRES
-- ────────────────────────────────────────────────────────────────────────

-- Trigger générique updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger set_updated_at (alias compatible avec les anciennes définitions)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

  -- Plan SaaS
  plan                     TEXT        NOT NULL DEFAULT 'starter'
                           CHECK (plan IN ('starter', 'pro', 'multi')),
  actif                    BOOLEAN     DEFAULT TRUE,

  -- Adresse & contact (ajoutés migration-2)
  adresse                  TEXT        DEFAULT NULL,
  ville                    TEXT        DEFAULT NULL,
  code_postal              TEXT        DEFAULT NULL,
  telephone                TEXT        DEFAULT NULL,

  -- Créneaux de retrait Click & Collect
  creneaux_retrait         TEXT[]      DEFAULT ARRAY['08:00', '09:00', '10:00'],

  -- Configuration flash
  flash_heure_debut        INT         NOT NULL DEFAULT 18
                           CHECK (flash_heure_debut BETWEEN 0 AND 23),
  flash_heure_fin          INT         NOT NULL DEFAULT 20
                           CHECK (flash_heure_fin BETWEEN 1 AND 24),
  flash_remise_pct         INT         NOT NULL DEFAULT 40
                           CHECK (flash_remise_pct BETWEEN 1 AND 100),

  -- Tour guidé onboarding
  tour_completed_at        TIMESTAMPTZ DEFAULT NULL,

  -- Stripe (optionnel)
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  trial_ends_at            TIMESTAMPTZ,
  stripe_status            TEXT        NOT NULL DEFAULT 'inactive'
                           CHECK (stripe_status IN (
                             'inactive','trialing','active','past_due','canceled','unpaid'
                           )),

  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Ajout des colonnes si la table existe déjà
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS adresse          TEXT DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS ville            TEXT DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS code_postal      TEXT DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS telephone        TEXT DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS creneaux_retrait TEXT[] DEFAULT ARRAY['08:00', '09:00', '10:00'];
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS flash_heure_debut INT NOT NULL DEFAULT 18;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS flash_heure_fin   INT NOT NULL DEFAULT 20;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS flash_remise_pct  INT NOT NULL DEFAULT 40;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS stripe_status          TEXT NOT NULL DEFAULT 'inactive';

-- Suppression des anciennes colonnes Airtable si présentes
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

-- Valeurs par défaut pour les lignes existantes
UPDATE boulangeries SET flash_heure_debut = 18 WHERE flash_heure_debut IS NULL;
UPDATE boulangeries SET flash_heure_fin   = 20 WHERE flash_heure_fin   IS NULL;
UPDATE boulangeries SET flash_remise_pct  = 40 WHERE flash_remise_pct  IS NULL;
UPDATE boulangeries
   SET creneaux_retrait = ARRAY['08:00', '09:00', '10:00']
 WHERE creneaux_retrait IS NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_boulangeries_user_id ON boulangeries(user_id);
CREATE INDEX IF NOT EXISTS idx_boulangeries_slug     ON boulangeries(slug);
CREATE INDEX IF NOT EXISTS idx_boulangeries_ville
  ON boulangeries(ville) WHERE ville IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boulangeries_tour
  ON boulangeries(id) WHERE tour_completed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_stripe_customer
  ON boulangeries(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_boulangeries_updated_at ON boulangeries;
CREATE TRIGGER trg_boulangeries_updated_at
  BEFORE UPDATE ON boulangeries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE boulangeries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boulangerie_select_own" ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_insert_own" ON boulangeries;
DROP POLICY IF EXISTS "boulangerie_update_own" ON boulangeries;

CREATE POLICY "boulangerie_select_own"
  ON boulangeries FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "boulangerie_insert_own"
  ON boulangeries FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "boulangerie_update_own"
  ON boulangeries FOR UPDATE USING (auth.uid() = user_id);

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
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(boulangerie_id, date)
);

CREATE INDEX IF NOT EXISTS idx_journees_boulangerie_date
  ON journees(boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_journees_cloturee
  ON journees(boulangerie_id, cloturee);

DROP TRIGGER IF EXISTS trg_journees_updated_at ON journees;
CREATE TRIGGER trg_journees_updated_at
  BEFORE UPDATE ON journees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE journees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journee_owner_select" ON journees;
DROP POLICY IF EXISTS "journee_owner_insert" ON journees;
DROP POLICY IF EXISTS "journee_owner_update" ON journees;
-- Nettoyage des anciennes politiques (nommages différents)
DROP POLICY IF EXISTS "journee_select_own"   ON journees;
DROP POLICY IF EXISTS "journee_insert_own"   ON journees;
DROP POLICY IF EXISTS "journee_update_own"   ON journees;

CREATE POLICY "journee_owner_select"
  ON journees FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "journee_owner_insert"
  ON journees FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "journee_owner_update"
  ON journees FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

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
  BEFORE UPDATE ON stocks_journaliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE stocks_journaliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stocks_owner_select"         ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_owner_insert"         ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_owner_update"         ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_select_own"           ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_insert_own"           ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_update_own"           ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_delete_own"           ON stocks_journaliers;
DROP POLICY IF EXISTS "Service role full access"    ON stocks_journaliers;

CREATE POLICY "stocks_owner_select"
  ON stocks_journaliers FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "stocks_owner_insert"
  ON stocks_journaliers FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "stocks_owner_update"
  ON stocks_journaliers FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────
-- 5. TABLE : produits
--    ✅ FIX E2 : Ajout colonne deleted_at pour soft delete
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS produits (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id       UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  nom                  TEXT         NOT NULL CHECK (length(nom) BETWEEN 1 AND 100),
  description          TEXT         CHECK (length(description) <= 500),
  categorie            TEXT         NOT NULL DEFAULT 'boulangerie'
                       CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie')),
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
  -- Soft delete (FIX E2) : null = actif, non-null = supprimé logiquement
  deleted_at           TIMESTAMPTZ  DEFAULT NULL,
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  DEFAULT NOW()
);

-- Ajout des colonnes si la table existe déjà
ALTER TABLE produits ADD COLUMN IF NOT EXISTS actif_catalogue      BOOLEAN      DEFAULT TRUE;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS actif_flash          BOOLEAN      DEFAULT TRUE;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS prix_flash_override  DECIMAL(8,2) DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS image_storage_path   TEXT;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS allergenes           TEXT[]       DEFAULT '{}';
ALTER TABLE produits ADD COLUMN IF NOT EXISTS disponible_du        DATE         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS disponible_au        DATE         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS stock_alerte         INT          DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS note_interne         TEXT         DEFAULT NULL;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS ordre                INT          DEFAULT 0;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS deleted_at           TIMESTAMPTZ  DEFAULT NULL;

DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT chk_saisonnalite CHECK (
    (disponible_du IS NULL AND disponible_au IS NULL)
    OR (disponible_du IS NOT NULL AND disponible_au IS NOT NULL AND disponible_du <= disponible_au)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index — exclut les produits softdeleted des index actifs
CREATE INDEX IF NOT EXISTS idx_produits_boulangerie
  ON produits(boulangerie_id, actif_catalogue, categorie)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produits_actif_catalogue
  ON produits(boulangerie_id, actif_catalogue)
  WHERE actif_catalogue = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produits_actif_flash
  ON produits(boulangerie_id, actif_flash)
  WHERE actif_flash = TRUE AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_produits_updated_at ON produits;
CREATE TRIGGER trg_produits_updated_at
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE produits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produits_select_own" ON produits;
DROP POLICY IF EXISTS "produits_insert_own" ON produits;
DROP POLICY IF EXISTS "produits_update_own" ON produits;
DROP POLICY IF EXISTS "produits_delete_own" ON produits;

CREATE POLICY "produits_select_own"
  ON produits FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "produits_insert_own"
  ON produits FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "produits_update_own"
  ON produits FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "produits_delete_own"
  ON produits FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

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

-- Migration : statut 'retiree' → 'recuperee' (correctif v1)
UPDATE commandes SET statut = 'recuperee' WHERE statut = 'retiree';

CREATE INDEX IF NOT EXISTS commandes_boulangerie_date_idx
  ON commandes(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_email
  ON commandes(client_email, boulangerie_id, created_at DESC);

DROP TRIGGER IF EXISTS commandes_updated_at ON commandes;
CREATE TRIGGER commandes_updated_at
  BEFORE UPDATE ON commandes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Baker voit ses commandes"   ON commandes;
DROP POLICY IF EXISTS "Baker met à jour le statut" ON commandes;

CREATE POLICY "Baker voit ses commandes"
  ON commandes FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "Baker met à jour le statut"
  ON commandes FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

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

CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_push_subscription_timestamp();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access"         ON push_subscriptions;
DROP POLICY IF EXISTS "User can upsert own subscription" ON push_subscriptions;
DROP POLICY IF EXISTS "User can delete own subscription" ON push_subscriptions;

CREATE POLICY "Service role full access"
  ON push_subscriptions FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "User can upsert own subscription"
  ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User can delete own subscription"
  ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

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
  BEFORE UPDATE ON profils_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE profils_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_select_own_profil" ON profils_clients;
DROP POLICY IF EXISTS "client_insert_own_profil" ON profils_clients;
DROP POLICY IF EXISTS "client_update_own_profil" ON profils_clients;

CREATE POLICY "client_select_own_profil"
  ON profils_clients FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "client_insert_own_profil"
  ON profils_clients FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "client_update_own_profil"
  ON profils_clients FOR UPDATE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────
-- 9. TABLE : paniers_flash
--    Source de vérité pour les paniers anti-gaspi (migration-3/4)
--    Le boulanger sélectionne ses produits via l'onglet Flash.
--    get_paniers_flash() lit ici, plus dans stocks_journaliers.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paniers_flash (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  date              DATE         NOT NULL DEFAULT CURRENT_DATE,
  produit_id        TEXT         NOT NULL,
  produit_nom       TEXT         NOT NULL CHECK (length(produit_nom) BETWEEN 1 AND 150),
  produit_emoji     TEXT         NOT NULL DEFAULT '🥖',
  categorie         TEXT         NOT NULL DEFAULT 'boulangerie'
                    CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie')),
  prix_original     DECIMAL(8,2) NOT NULL CHECK (prix_original > 0),
  remise_pct        INT          NOT NULL DEFAULT 40 CHECK (remise_pct BETWEEN 1 AND 100),
  prix_flash        DECIMAL(8,2) NOT NULL CHECK (prix_flash > 0),
  quantite_initiale INT          NOT NULL DEFAULT 1 CHECK (quantite_initiale >= 0),
  quantite_restante INT          NOT NULL DEFAULT 1 CHECK (quantite_restante >= 0),
  allergenes        TEXT[]       NOT NULL DEFAULT '{}',
  actif             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Un produit par journée par boulangerie
  UNIQUE (boulangerie_id, date, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_paniers_flash_boulangerie_date
  ON paniers_flash (boulangerie_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_paniers_flash_actif
  ON paniers_flash (boulangerie_id, date, actif)
  WHERE actif = TRUE;

DO $$ BEGIN
  CREATE TRIGGER trg_paniers_flash_updated_at
    BEFORE UPDATE ON paniers_flash
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE paniers_flash ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paniers_flash_owner_select" ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_owner_insert" ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_owner_update" ON paniers_flash;
DROP POLICY IF EXISTS "paniers_flash_owner_delete" ON paniers_flash;

CREATE POLICY "paniers_flash_owner_select"
  ON paniers_flash FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "paniers_flash_owner_insert"
  ON paniers_flash FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "paniers_flash_owner_update"
  ON paniers_flash FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "paniers_flash_owner_delete"
  ON paniers_flash FOR DELETE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────
-- 10. FONCTIONS PUBLIQUES — SECURITY DEFINER
-- ────────────────────────────────────────────────────────────────────────

-- ── 10a. Catalogue public ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_catalogue_public(TEXT);

CREATE OR REPLACE FUNCTION get_catalogue_public(p_slug TEXT)
RETURNS TABLE (
  id           UUID,
  nom          TEXT,
  description  TEXT,
  categorie    TEXT,
  emoji        TEXT,
  prix_vente   DECIMAL,
  image_url    TEXT,
  allergenes   TEXT[],
  actif_flash  BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  v_storage_url    TEXT;
BEGIN
  SELECT b.id, b.actif
    INTO v_boulangerie_id, v_actif
    FROM boulangeries b WHERE b.slug = p_slug LIMIT 1;

  IF v_boulangerie_id IS NULL OR NOT v_actif THEN RETURN; END IF;

  v_storage_url := current_setting('app.supabase_url', TRUE)
                   || '/storage/v1/object/public/produits-photos/';

  RETURN QUERY
    SELECT
      p.id,
      p.nom,
      p.description,
      p.categorie,
      p.emoji,
      p.prix_vente,
      CASE
        WHEN p.image_storage_path IS NOT NULL THEN v_storage_url || p.image_storage_path
        ELSE p.image_url
      END AS image_url,
      COALESCE(p.allergenes, '{}') AS allergenes,
      p.actif_flash
    FROM produits p
   WHERE p.boulangerie_id = v_boulangerie_id
     AND p.actif_catalogue = TRUE
     AND p.deleted_at IS NULL  -- Exclure les produits softdeleted
     AND (
       p.disponible_du IS NULL
       OR (CURRENT_DATE >= p.disponible_du AND CURRENT_DATE <= p.disponible_au)
     )
   ORDER BY p.categorie, p.ordre, p.nom;
END;
$$;

REVOKE ALL ON FUNCTION get_catalogue_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_catalogue_public(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_catalogue_public(TEXT) TO authenticated;

-- ── 10b. Paniers flash ────────────────────────────────────────────────
-- ✅ FIX B1 : Cast UUID sécurisé (jointure via ::TEXT au lieu de ::UUID)
-- ✅ FIX migration-5 : Fuseau Paris cohérent (v_today ET v_heure)
-- ✅ FIX migration-3/4 : Lit depuis paniers_flash (source de vérité)

DROP FUNCTION IF EXISTS get_paniers_flash(TEXT);

CREATE OR REPLACE FUNCTION get_paniers_flash(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  -- ✅ FIX migration-5 : date ET heure alignées sur le fuseau Paris
  v_now_paris      TIMESTAMPTZ := NOW() AT TIME ZONE 'Europe/Paris';
  v_today          DATE        := v_now_paris::DATE;
  v_heure          INT         := EXTRACT(HOUR FROM v_now_paris)::INT;
  v_heure_debut    INT;
  v_heure_fin      INT;
  v_remise         INT;
  v_invendus       JSON;
  v_nb_paniers     INT         := 0;
  v_flash_actif    BOOLEAN     := FALSE;
BEGIN
  SELECT b.id, b.actif, b.flash_heure_debut, b.flash_heure_fin, b.flash_remise_pct
    INTO v_boulangerie_id, v_actif, v_heure_debut, v_heure_fin, v_remise
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

  v_flash_actif := (v_heure >= v_heure_debut AND v_heure < v_heure_fin);

  IF NOT v_flash_actif THEN
    RETURN json_build_object(
      'flashActif', FALSE, 'heureDebut', v_heure_debut,
      'heureFin', v_heure_fin, 'remise', v_remise,
      'nbPaniers', 0, 'invendus', '[]'::json
    );
  END IF;

  -- ✅ Lit depuis paniers_flash (source de vérité persistée par le boulanger)
  -- Seuls les paniers actifs avec quantité restante > 0 sont exposés côté client
  SELECT
    COUNT(*)::INT,
    json_agg(
      json_build_object(
        'nom',          pf.produit_nom,
        'emoji',        pf.produit_emoji,
        'categorie',    pf.categorie,
        'prixOriginal', pf.prix_original,
        'prixFlash',    pf.prix_flash,
        'quantite',     pf.quantite_restante,
        'allergenes',   COALESCE(pf.allergenes, '{}')
      )
      ORDER BY pf.categorie, pf.produit_nom
    )
  INTO v_nb_paniers, v_invendus
  FROM paniers_flash pf
  WHERE pf.boulangerie_id   = v_boulangerie_id
    AND pf.date             = v_today
    AND pf.actif            = TRUE
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
-- 11. FONCTIONS TOUR GUIDÉ (onboarding boulanger)
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
-- 12. SUPABASE STORAGE — Bucket photos produits
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produits-photos',
  'produits-photos',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public             = TRUE,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

DROP POLICY IF EXISTS "produits_photos_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "produits_photos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "produits_photos_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "produits_photos_owner_delete" ON storage.objects;

CREATE POLICY "produits_photos_public_read"
  ON storage.objects FOR SELECT USING (bucket_id = 'produits-photos');

CREATE POLICY "produits_photos_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'produits-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "produits_photos_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'produits-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "produits_photos_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'produits-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 13. NETTOYAGE des anciennes fonctions
-- ────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS encrypt_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS decrypt_text(TEXT, TEXT);

-- ────────────────────────────────────────────────────────────────────────
-- 14. VÉRIFICATION FINALE
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_tables    INT;
  n_fonctions INT;
  n_bucket    INT;
  n_airtable  INT;
  n_softdelete INT;
BEGIN
  SELECT COUNT(*) INTO n_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'boulangeries', 'journees', 'stocks_journaliers', 'produits',
       'commandes', 'push_subscriptions', 'profils_clients', 'paniers_flash'
     );

  SELECT COUNT(*) INTO n_fonctions
    FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'get_catalogue_public', 'get_paniers_flash',
       'complete_tour', 'reset_tour'
     );

  SELECT COUNT(*) INTO n_bucket
    FROM storage.buckets WHERE id = 'produits-photos';

  SELECT COUNT(*) INTO n_airtable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'boulangeries'
     AND column_name LIKE 'airtable%';

  SELECT COUNT(*) INTO n_softdelete
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'produits'
     AND column_name = 'deleted_at';

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS Migration finale v3.0';
  RAISE NOTICE '   Tables     : % / 8 (paniers_flash inclus)', n_tables;
  RAISE NOTICE '   Fonctions  : % / 4', n_fonctions;
  RAISE NOTICE '   Storage    : %', CASE WHEN n_bucket > 0 THEN '✓' ELSE '✗ manquant' END;
  RAISE NOTICE '   Airtable   : % colonne(s) résiduelle(s)', n_airtable;
  RAISE NOTICE '   Soft delete: %', CASE WHEN n_softdelete > 0 THEN '✓ deleted_at présent' ELSE '✗ manquant' END;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF n_tables < 8 THEN
    RAISE EXCEPTION 'Tables manquantes : % / 8 créées', n_tables;
  END IF;
  IF n_fonctions < 4 THEN
    RAISE EXCEPTION 'Fonctions manquantes : % / 4 créées', n_fonctions;
  END IF;
  IF n_airtable > 0 THEN
    RAISE WARNING '% colonne(s) Airtable encore présente(s) !', n_airtable;
  END IF;
END $$;

COMMIT;