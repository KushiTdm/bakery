-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration paniers_flash (persistance onglet Flash)
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- Idempotent — peut être ré-exécuté sans risque
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. TABLE : paniers_flash
--    Persistance des paniers anti-gaspi configurés par le boulanger.
--    Une ligne par produit flash par journée.
--    Le boulanger active/désactive chaque produit individuellement
--    et peut ajuster la quantité restante au fil de la journée.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paniers_flash (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id    UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  date              DATE         NOT NULL DEFAULT CURRENT_DATE,

  -- Produit concerné
  produit_id        TEXT         NOT NULL,
  produit_nom       TEXT         NOT NULL CHECK (length(produit_nom) BETWEEN 1 AND 150),
  produit_emoji     TEXT         NOT NULL DEFAULT '🥖',
  categorie         TEXT         NOT NULL DEFAULT 'boulangerie'
                    CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie')),

  -- Prix
  prix_original     DECIMAL(8,2) NOT NULL CHECK (prix_original > 0),
  remise_pct        INT          NOT NULL DEFAULT 40
                    CHECK (remise_pct BETWEEN 1 AND 100),
  prix_flash        DECIMAL(8,2) NOT NULL CHECK (prix_flash > 0),

  -- Quantité restante (mise à jour en temps réel par la vendeuse)
  quantite_initiale INT          NOT NULL DEFAULT 1 CHECK (quantite_initiale >= 0),
  quantite_restante INT          NOT NULL DEFAULT 1 CHECK (quantite_restante >= 0),

  -- Allergènes (copie depuis produits pour affichage client sans join)
  allergenes        TEXT[]       NOT NULL DEFAULT '{}',

  -- État
  actif             BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Un produit par journée par boulangerie (upsert-able)
  UNIQUE (boulangerie_id, date, produit_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_paniers_flash_boulangerie_date
  ON paniers_flash (boulangerie_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_paniers_flash_actif
  ON paniers_flash (boulangerie_id, date, actif)
  WHERE actif = TRUE;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_paniers_flash_updated_at ON paniers_flash;
CREATE TRIGGER trg_paniers_flash_updated_at
  BEFORE UPDATE ON paniers_flash
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
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
-- 2. FONCTION get_paniers_flash() — réécriture complète
--    Lit maintenant depuis paniers_flash (source de vérité boulanger)
--    au lieu de stocks_journaliers.stock_final qui n'était pas persisté.
--    Rétrocompatible : même signature JSON de retour.
-- ────────────────────────────────────────────────────────────────────────

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
  -- Config boulangerie
  SELECT b.id, b.actif, b.flash_heure_debut, b.flash_heure_fin, b.flash_remise_pct
    INTO v_boulangerie_id, v_actif, v_heure_debut, v_heure_fin, v_remise
    FROM boulangeries b
   WHERE b.slug = p_slug
   LIMIT 1;

  -- Valeurs par défaut
  v_heure_debut := COALESCE(v_heure_debut, 18);
  v_heure_fin   := COALESCE(v_heure_fin,   20);
  v_remise      := COALESCE(v_remise,       40);

  IF v_boulangerie_id IS NULL OR NOT v_actif THEN
    RETURN json_build_object(
      'flashActif', FALSE,
      'heureDebut', v_heure_debut,
      'heureFin',   v_heure_fin,
      'remise',     v_remise,
      'nbPaniers',  0,
      'invendus',   '[]'::json
    );
  END IF;

  -- Fenêtre horaire active ?
  v_flash_actif := (v_heure >= v_heure_debut AND v_heure < v_heure_fin);

  IF NOT v_flash_actif THEN
    RETURN json_build_object(
      'flashActif', FALSE,
      'heureDebut', v_heure_debut,
      'heureFin',   v_heure_fin,
      'remise',     v_remise,
      'nbPaniers',  0,
      'invendus',   '[]'::json
    );
  END IF;

  -- Lecture depuis paniers_flash (source de vérité persistée par le boulanger)
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
  WHERE pf.boulangerie_id  = v_boulangerie_id
    AND pf.date            = v_today
    AND pf.actif           = TRUE
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
-- 3. VÉRIFICATION
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_table INT;
  n_fn    INT;
BEGIN
  SELECT COUNT(*) INTO n_table
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'paniers_flash';

  SELECT COUNT(*) INTO n_fn
    FROM information_schema.routines
   WHERE routine_schema = 'public' AND routine_name = 'get_paniers_flash';

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ Migration paniers_flash OK';
  RAISE NOTICE '   Table paniers_flash  : %', CASE WHEN n_table > 0 THEN '✓' ELSE '✗ MANQUANT' END;
  RAISE NOTICE '   get_paniers_flash()  : %', CASE WHEN n_fn > 0 THEN '✓ (mise à jour)' ELSE '✗ MANQUANT' END;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF n_table = 0 THEN RAISE EXCEPTION 'Table paniers_flash non créée'; END IF;
  IF n_fn    = 0 THEN RAISE EXCEPTION 'Fonction get_paniers_flash manquante'; END IF;
END $$;

COMMIT;