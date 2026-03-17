-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Patch get_paniers_flash : lecture depuis paniers_flash
-- À exécuter dans Supabase Dashboard → SQL Editor
-- Remplace la version précédente qui lisait stocks_journaliers
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Crée la table si elle n'existe pas encore (idempotent) ────────────

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

-- ── Remplace get_paniers_flash() — lit paniers_flash, plus stocks_journaliers ──

DROP FUNCTION IF EXISTS get_paniers_flash(TEXT);

CREATE OR REPLACE FUNCTION get_paniers_flash(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  v_today          DATE    := CURRENT_DATE;
  v_heure          INT     := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Paris')::INT;
  v_heure_debut    INT;
  v_heure_fin      INT;
  v_remise         INT;
  v_invendus       JSON;
  v_nb_paniers     INT     := 0;
  v_flash_actif    BOOLEAN := FALSE;
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

  -- ── Source de vérité : paniers_flash (persisté par le boulanger) ──
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

-- ── Vérification ──────────────────────────────────────────────────────

DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'paniers_flash';
  RAISE NOTICE '✅ paniers_flash : % | get_paniers_flash() mise à jour', CASE WHEN n>0 THEN 'OK' ELSE 'MANQUANT' END;
END $$;

COMMIT;