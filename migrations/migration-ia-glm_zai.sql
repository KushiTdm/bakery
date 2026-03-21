-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration IA : Rapports & Prévisions de Production
-- RGPD : aucune donnée personnelle stockée dans ai_rapports
--        les données envoyées à l'IA sont agrégées et anonymisées
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. TABLE : ai_rapports
--    Stocke le rapport quotidien généré par l'IA après clôture
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_rapports (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id   UUID          NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  journee_id       UUID          REFERENCES journees(id) ON DELETE SET NULL,
  date             DATE          NOT NULL,

  -- Score et synthèse
  score_performance INT          CHECK (score_performance BETWEEN 0 AND 100),
  verdict_flash     TEXT,

  -- Rapport structuré (JSON natif)
  -- Contient : succes[], flops[], analyse, anti_gaspillage[], opportunites[], alerte_ingredients[]
  rapport_json      JSONB         NOT NULL DEFAULT '{}',

  -- Statut de génération
  statut            TEXT          NOT NULL DEFAULT 'en_cours'
                    CHECK (statut IN ('en_cours', 'genere', 'erreur')),
  erreur_msg        TEXT          DEFAULT NULL,

  -- Metadata
  modele_ia         TEXT          DEFAULT 'glm-4-flash',
  tokens_utilises   INT           DEFAULT NULL,

  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW(),

  UNIQUE(boulangerie_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_rapports_boulangerie_date
  ON ai_rapports(boulangerie_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_rapports_statut
  ON ai_rapports(statut) WHERE statut = 'en_cours';

DROP TRIGGER IF EXISTS trg_ai_rapports_updated_at ON ai_rapports;
CREATE TRIGGER trg_ai_rapports_updated_at
  BEFORE UPDATE ON ai_rapports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE ai_rapports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_rapports_owner_select" ON ai_rapports;
DROP POLICY IF EXISTS "ai_rapports_owner_insert" ON ai_rapports;
DROP POLICY IF EXISTS "ai_rapports_owner_update" ON ai_rapports;

CREATE POLICY "ai_rapports_owner_select"
  ON ai_rapports FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "ai_rapports_owner_insert"
  ON ai_rapports FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "ai_rapports_owner_update"
  ON ai_rapports FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));


-- ────────────────────────────────────────────────────────────────────────
-- 2. TABLE : production_forecasts
--    Prévisions par produit pour le lendemain
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_forecasts (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  rapport_id        UUID         REFERENCES ai_rapports(id) ON DELETE CASCADE,
  date_production   DATE         NOT NULL,  -- Le jour J+1 pour lequel la prévision s'applique

  -- Identifiant du produit (non-UUID : peut être un ID texte du catalogue)
  produit_id        TEXT         NOT NULL,
  produit_nom       TEXT         NOT NULL,
  produit_categorie TEXT         DEFAULT 'boulangerie',
  produit_emoji     TEXT         DEFAULT '🥖',

  -- Quantité suggérée par l'IA
  quantite_suggeree INT          NOT NULL CHECK (quantite_suggeree >= 0),
  quantite_base     INT          NOT NULL DEFAULT 0,  -- Production actuelle de référence
  variation_pct     INT          DEFAULT 0,            -- % de changement suggéré

  -- Explication de la suggestion
  raison            TEXT,

  -- Application par le boulanger
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

-- RLS
ALTER TABLE production_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecasts_owner_select" ON production_forecasts;
DROP POLICY IF EXISTS "forecasts_owner_insert" ON production_forecasts;
DROP POLICY IF EXISTS "forecasts_owner_update" ON production_forecasts;

CREATE POLICY "forecasts_owner_select"
  ON production_forecasts FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "forecasts_owner_insert"
  ON production_forecasts FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

CREATE POLICY "forecasts_owner_update"
  ON production_forecasts FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));


-- ────────────────────────────────────────────────────────────────────────
-- 3. VÉRIFICATION
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_tables INT;
BEGIN
  SELECT COUNT(*) INTO n_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('ai_rapports', 'production_forecasts');

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS Migration IA';
  RAISE NOTICE '   Tables IA créées : % / 2', n_tables;
  RAISE NOTICE '   RGPD : aucune PII stockée dans ai_rapports';
  RAISE NOTICE '   Modèle : z.ai GLM-4-Flash';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

COMMIT;