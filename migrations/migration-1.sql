-- ═══════════════════════════════════════════════════════════════
-- L'Artisan Doré — Schéma Supabase
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════
-- TABLE : boulangeries
-- Une ligne par boulangerie inscrite au SaaS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS boulangeries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- lié au compte Supabase Auth
  nom                 TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,           -- ex: "pain-du-village-lyon"
  email_contact       TEXT,
  -- Clés Airtable (CMS catalogue de cette boulangerie)
  airtable_api_key    TEXT,                           -- stocké chiffré côté app (jamais exposé client)
  airtable_base_id    TEXT,
  -- Plan SaaS
  plan                TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'multi')),
  actif               BOOLEAN DEFAULT TRUE,
  -- Metadata
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- TABLE : journees
-- Une ligne par jour travaillé par boulangerie
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS journees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      UUID NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  -- Données agrégées de la journée
  commandes_online    INT DEFAULT 0,
  ca_estime           DECIMAL(10,2) DEFAULT 0,
  taux_invendu        DECIMAL(5,2) DEFAULT 0,
  total_produit       INT DEFAULT 0,
  total_invendu       INT DEFAULT 0,
  -- Statut
  cloturee            BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  -- Contrainte : 1 seule journée par boulangerie par date
  UNIQUE(boulangerie_id, date)
);

-- ═══════════════════════════════════════════════════════════════
-- TABLE : stocks_journaliers
-- Une ligne par produit par journée
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stocks_journaliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journee_id          UUID NOT NULL REFERENCES journees(id) ON DELETE CASCADE,
  boulangerie_id      UUID NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  -- Référence produit Airtable
  produit_id          TEXT NOT NULL,                  -- ID Airtable du produit
  produit_nom         TEXT NOT NULL,
  produit_emoji       TEXT DEFAULT '🥖',
  categorie           TEXT DEFAULT 'boulangerie',
  prix_vente          DECIMAL(8,2) DEFAULT 0,
  cout_production     DECIMAL(8,2) DEFAULT 0,
  -- Données de production
  production          INT DEFAULT 0,
  -- Snapshots étagère (vendeuse compte ce qui RESTE)
  snapshot_10h        INT DEFAULT 0,
  snapshot_10h_done   BOOLEAN DEFAULT FALSE,
  snapshot_14h        INT DEFAULT 0,
  snapshot_14h_done   BOOLEAN DEFAULT FALSE,
  -- Stock final du soir (= invendus)
  stock_final         INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  -- Contrainte : 1 ligne par produit par journée
  UNIQUE(journee_id, produit_id)
);

-- ═══════════════════════════════════════════════════════════════
-- INDEX — Performances des requêtes fréquentes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_boulangeries_user_id
  ON boulangeries(user_id);

CREATE INDEX IF NOT EXISTS idx_boulangeries_slug
  ON boulangeries(slug);

CREATE INDEX IF NOT EXISTS idx_journees_boulangerie_date
  ON journees(boulangerie_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_journees_cloturee
  ON journees(boulangerie_id, cloturee);

CREATE INDEX IF NOT EXISTS idx_stocks_journee
  ON stocks_journaliers(journee_id);

CREATE INDEX IF NOT EXISTS idx_stocks_boulangerie
  ON stocks_journaliers(boulangerie_id);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Chaque boulangerie ne voit que ses propres données
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE boulangeries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE journees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocks_journaliers  ENABLE ROW LEVEL SECURITY;

-- ── Policies boulangeries ──────────────────────────────────────
CREATE POLICY "boulangerie_select_own"
  ON boulangeries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "boulangerie_insert_own"
  ON boulangeries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "boulangerie_update_own"
  ON boulangeries FOR UPDATE
  USING (auth.uid() = user_id);

-- ── Policies journees ──────────────────────────────────────────
CREATE POLICY "journee_select_own"
  ON journees FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "journee_insert_own"
  ON journees FOR INSERT
  WITH CHECK (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "journee_update_own"
  ON journees FOR UPDATE
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- ── Policies stocks_journaliers ────────────────────────────────
CREATE POLICY "stocks_select_own"
  ON stocks_journaliers FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "stocks_insert_own"
  ON stocks_journaliers FOR INSERT
  WITH CHECK (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "stocks_update_own"
  ON stocks_journaliers FOR UPDATE
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS — updated_at automatique
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_boulangeries_updated_at
  BEFORE UPDATE ON boulangeries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_journees_updated_at
  BEFORE UPDATE ON journees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_stocks_updated_at
  BEFORE UPDATE ON stocks_journaliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();