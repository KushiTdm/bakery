-- ────────────────────────────────────────────────────────────────────────
-- MIGRATION : Gamification — Défis quotidiens + Profil XP/Streak
-- ────────────────────────────────────────────────────────────────────────

-- ── Table : defis ────────────────────────────────────────────────────────
-- Défis quotidiens générés après chaque rapport IA, résolus à la clôture soir.

CREATE TABLE IF NOT EXISTS defis (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  rapport_id        UUID        REFERENCES ai_rapports(id) ON DELETE SET NULL,
  date_defi         DATE        NOT NULL,
  categorie         TEXT        NOT NULL
                    CHECK (categorie IN (
                      'reduce_waste','revenue_target','perfect_day','streak',
                      'anti_gaspi','click_collect','production_accuracy','improvement'
                    )),
  difficulte        TEXT        NOT NULL DEFAULT 'easy'
                    CHECK (difficulte IN ('easy','medium','hard')),
  titre             TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  emoji             TEXT        NOT NULL DEFAULT '🎯',
  -- Cible
  metric_cible      TEXT        NOT NULL,
  produit_id        UUID        DEFAULT NULL,
  valeur_cible      DECIMAL     NOT NULL,
  comparaison       TEXT        NOT NULL DEFAULT 'lte'
                    CHECK (comparaison IN ('lte','gte','eq','lt','gt')),
  -- Progression
  valeur_actuelle   DECIMAL     DEFAULT NULL,
  statut            TEXT        NOT NULL DEFAULT 'actif'
                    CHECK (statut IN ('actif','reussi','echoue','expire')),
  xp_reward         INT         NOT NULL DEFAULT 10,
  resolved_at       TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(boulangerie_id, date_defi, categorie, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_defis_boulangerie_date
  ON defis(boulangerie_id, date_defi DESC);

CREATE INDEX IF NOT EXISTS idx_defis_actifs
  ON defis(boulangerie_id, statut) WHERE statut = 'actif';

ALTER TABLE defis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "defis_owner_select" ON defis;
DROP POLICY IF EXISTS "defis_owner_insert" ON defis;
DROP POLICY IF EXISTS "defis_owner_update" ON defis;

CREATE POLICY "defis_owner_select"
  ON defis FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "defis_owner_insert"
  ON defis FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "defis_owner_update"
  ON defis FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

-- ── Table : gamification_profil ──────────────────────────────────────────
-- Un profil par boulangerie : XP total, niveau, streak, badges.

CREATE TABLE IF NOT EXISTS gamification_profil (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID        NOT NULL UNIQUE REFERENCES boulangeries(id) ON DELETE CASCADE,
  xp_total          INT         NOT NULL DEFAULT 0,
  niveau            INT         NOT NULL DEFAULT 1,
  streak_actuel     INT         NOT NULL DEFAULT 0,
  streak_max        INT         NOT NULL DEFAULT 0,
  derniere_cloture  DATE        DEFAULT NULL,
  badges            TEXT[]      DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gamification_boulangerie
  ON gamification_profil(boulangerie_id);

ALTER TABLE gamification_profil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gamification_owner_select" ON gamification_profil;
DROP POLICY IF EXISTS "gamification_owner_insert" ON gamification_profil;
DROP POLICY IF EXISTS "gamification_owner_update" ON gamification_profil;

CREATE POLICY "gamification_owner_select"
  ON gamification_profil FOR SELECT
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "gamification_owner_insert"
  ON gamification_profil FOR INSERT
  WITH CHECK (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));
CREATE POLICY "gamification_owner_update"
  ON gamification_profil FOR UPDATE
  USING (boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = (select auth.uid())));

DROP TRIGGER IF EXISTS trg_gamification_updated_at ON gamification_profil;
CREATE TRIGGER trg_gamification_updated_at
  BEFORE UPDATE ON gamification_profil
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
