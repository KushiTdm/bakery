-- migration-meteo-timezone.sql
-- Ajoute : fuseau horaire boulangerie + coordonnées GPS + table météo journalière
-- Idempotent (safe à relancer)

-- ── 1. Colonnes boulangeries ──────────────────────────────────────
ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS timezone       TEXT    NOT NULL DEFAULT 'Europe/Paris',
  ADD COLUMN IF NOT EXISTS latitude       NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude      NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS ville          TEXT,
  ADD COLUMN IF NOT EXISTS pays           TEXT    NOT NULL DEFAULT 'FR';

-- Valeurs pour la boulangerie démo (L'Artisan Doré — Bogotá)
UPDATE boulangeries
SET
  timezone  = 'America/Bogota',
  latitude  = 4.711,
  longitude = -74.0721,
  ville     = 'Bogotá',
  pays      = 'CO'
WHERE id = '00000000-0000-0000-0000-000000000002';

-- ── 2. Table météo journalière ────────────────────────────────────
-- Stocke la météo du jour ET les prévisions J+1 au moment de la clôture.
-- 1 ligne par boulangerie par date.

CREATE TABLE IF NOT EXISTS meteo_journees (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID    NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  date              DATE    NOT NULL,

  -- Météo actuelle (heure de clôture ~18-22h)
  temperature_c     NUMERIC(4,1),   -- °C au moment de la clôture
  ressenti_c        NUMERIC(4,1),   -- température ressentie
  humidite_pct      SMALLINT,       -- % humidité
  precipitations_mm NUMERIC(5,2),   -- mm de pluie/neige ce jour
  vitesse_vent_kmh  NUMERIC(5,1),
  code_meteo        SMALLINT,       -- code WMO
  description       TEXT,           -- "Ensoleillé", "Pluie légère", etc.
  icone             TEXT,           -- emoji météo ☀️ 🌧️ etc.

  -- Prévisions J+1 (pour aider la planification)
  demain_temp_max_c NUMERIC(4,1),
  demain_temp_min_c NUMERIC(4,1),
  demain_precip_mm  NUMERIC(5,2),
  demain_code_meteo SMALLINT,
  demain_description TEXT,
  demain_icone      TEXT,

  -- Source
  source            TEXT    NOT NULL DEFAULT 'open-meteo',
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(boulangerie_id, date)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_meteo_boulangerie_date ON meteo_journees(boulangerie_id, date DESC);

-- RLS
ALTER TABLE meteo_journees ENABLE ROW LEVEL SECURITY;

-- Policy lecture : seul le propriétaire de la boulangerie
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meteo_journees' AND policyname = 'meteo_boulangerie_owner'
  ) THEN
    CREATE POLICY meteo_boulangerie_owner ON meteo_journees
      USING (
        boulangerie_id IN (
          SELECT id FROM boulangeries WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_meteo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_meteo_updated_at ON meteo_journees;
CREATE TRIGGER trg_meteo_updated_at
  BEFORE UPDATE ON meteo_journees
  FOR EACH ROW EXECUTE FUNCTION update_meteo_updated_at();

-- ── 3. Ajoute meteo_id dans ai_rapports (optionnel, pour lier) ────
ALTER TABLE ai_rapports
  ADD COLUMN IF NOT EXISTS meteo_id UUID REFERENCES meteo_journees(id);