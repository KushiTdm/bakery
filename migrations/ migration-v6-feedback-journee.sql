-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration feedback vendeuse + wizard pré-rapport
-- Idempotent — safe à relancer
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. TABLE : feedback_journee
--    Retour vendeuse de fin de journée (humeur, points forts, problèmes)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback_journee (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  journee_id        UUID        NOT NULL REFERENCES journees(id) ON DELETE CASCADE,
  boulangerie_id    UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,

  -- Humeur de la journée (1=difficile, 2=moyen, 3=bien, 4=super)
  rating_journee    INT         NOT NULL CHECK (rating_journee BETWEEN 1 AND 4),

  -- Points forts et axes d'amélioration (tableau libre)
  points_forts      TEXT[]      DEFAULT '{}',
  points_ameliorer  TEXT[]      DEFAULT '{}',

  -- Commentaire libre de la vendeuse
  commentaire_libre TEXT        CHECK (length(commentaire_libre) <= 1000),

  -- Événement spécial demain (saisi par la vendeuse)
  has_evenement     BOOLEAN     DEFAULT FALSE,
  evenement_desc    TEXT        CHECK (length(evenement_desc) <= 500),
  evenement_impact  TEXT        CHECK (evenement_impact IN ('hausse', 'baisse', NULL)),
  evenement_pct     INT         DEFAULT 0 CHECK (evenement_pct BETWEEN 0 AND 100),

  -- Qui a saisi ce retour
  saisi_par_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  saisi_par_prenom  TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(journee_id)  -- Un seul feedback par journée (upsert)
);

CREATE INDEX IF NOT EXISTS idx_feedback_journee_boulangerie
  ON feedback_journee(boulangerie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_journee_journee
  ON feedback_journee(journee_id);

DROP TRIGGER IF EXISTS trg_feedback_journee_updated_at ON feedback_journee;
CREATE TRIGGER trg_feedback_journee_updated_at
  BEFORE UPDATE ON feedback_journee
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE feedback_journee ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_owner_select"   ON feedback_journee;
DROP POLICY IF EXISTS "feedback_owner_insert"   ON feedback_journee;
DROP POLICY IF EXISTS "feedback_owner_update"   ON feedback_journee;
DROP POLICY IF EXISTS "feedback_employe_select" ON feedback_journee;
DROP POLICY IF EXISTS "feedback_employe_insert" ON feedback_journee;
DROP POLICY IF EXISTS "feedback_employe_update" ON feedback_journee;

-- Owner : accès complet
CREATE POLICY "feedback_owner_select"
  ON feedback_journee FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY "feedback_owner_insert"
  ON feedback_journee FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));
CREATE POLICY "feedback_owner_update"
  ON feedback_journee FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid()));

-- Employé : peut voir et créer le feedback de sa boulangerie
CREATE POLICY "feedback_employe_select"
  ON feedback_journee FOR SELECT
  USING (boulangerie_id = get_employee_boulangerie_id());
CREATE POLICY "feedback_employe_insert"
  ON feedback_journee FOR INSERT
  WITH CHECK (boulangerie_id = get_employee_boulangerie_id());
CREATE POLICY "feedback_employe_update"
  ON feedback_journee FOR UPDATE
  USING (boulangerie_id = get_employee_boulangerie_id());


-- ────────────────────────────────────────────────────────────────────────
-- 2. COLONNES wizard pré-rapport dans ai_rapports
--    Consignes owner avant génération du rapport
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE ai_rapports
  ADD COLUMN IF NOT EXISTS consignes_boulanger  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS consignes_vendeuse   TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wizard_evenement     TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wizard_impact        TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wizard_impact_pct    INT     DEFAULT 0;

-- ────────────────────────────────────────────────────────────────────────
-- 3. VÉRIFICATION
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_feedback  INT;
  n_colonnes  INT;
BEGIN
  SELECT COUNT(*) INTO n_feedback
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'feedback_journee';

  SELECT COUNT(*) INTO n_colonnes
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'ai_rapports'
     AND column_name IN ('consignes_boulanger', 'consignes_vendeuse', 'wizard_evenement');

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS Migration feedback_journee';
  RAISE NOTICE '   Table feedback_journee : %', CASE WHEN n_feedback > 0 THEN '✓' ELSE '✗' END;
  RAISE NOTICE '   Colonnes wizard ai_rapports : % / 3', n_colonnes;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

COMMIT;