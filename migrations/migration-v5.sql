-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration v5
-- Ajouts : catégorie sandwich + workflow journée + feedback vendeuse
-- Idempotent — safe à relancer
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Catégorie sandwich dans produits
ALTER TABLE produits DROP CONSTRAINT IF EXISTS produits_categorie_check;
ALTER TABLE produits ADD CONSTRAINT produits_categorie_check
  CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich'));

-- 2. Catégorie sandwich dans stocks_journaliers (colonne categorie TEXT, pas de contrainte)
-- Pas de contrainte à modifier ici, c'est du TEXT libre

-- 3. Catégorie sandwich dans paniers_flash
ALTER TABLE paniers_flash DROP CONSTRAINT IF EXISTS paniers_flash_categorie_check;
ALTER TABLE paniers_flash ADD CONSTRAINT paniers_flash_categorie_check
  CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie', 'sandwich'));

-- 4. Colonnes workflow + feedback dans journees
ALTER TABLE journees ADD COLUMN IF NOT EXISTS matin_validated     BOOLEAN   NOT NULL DEFAULT FALSE;
ALTER TABLE journees ADD COLUMN IF NOT EXISTS nb_fournees         INT       NOT NULL DEFAULT 1;
ALTER TABLE journees ADD COLUMN IF NOT EXISTS feedback_vendeuse   TEXT      DEFAULT NULL;
ALTER TABLE journees ADD COLUMN IF NOT EXISTS evenement_lendemain TEXT      DEFAULT NULL;

-- 5. Colonnes feedback dans ai_rapports
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS feedback_vendeuse   TEXT DEFAULT NULL;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS evenement_lendemain TEXT DEFAULT NULL;

-- 6. Mise à jour get_catalogue_public pour sandwich
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

DO $$
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS Migration v5';
  RAISE NOTICE '   + Catégorie sandwich (produits, paniers_flash)';
  RAISE NOTICE '   + Colonnes workflow : matin_validated, nb_fournees';
  RAISE NOTICE '   + Colonnes feedback : feedback_vendeuse, evenement_lendemain';
  RAISE NOTICE '   + get_catalogue_public mis à jour';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

COMMIT;