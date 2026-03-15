-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 7 — Table produits complète + Supabase Storage
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. Complète la table `produits` créée en migration-6
--      avec les colonnes allergènes, flash, saisonnalité
--   2. Crée le bucket Supabase Storage "produits-photos"
--   3. Policies Storage (boulanger upload/delete ses photos,
--      public lecture)
--   4. Index supplémentaires pour les requêtes fréquentes
--   5. Met à jour get_catalogue_public() pour exposer
--      les allergènes sur la vitrine
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. COLONNES SUPPLÉMENTAIRES sur produits ──────────────────
-- La table produits existe depuis migration-6.
-- On ajoute les colonnes manquantes.

-- Contrôle de visibilité
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS actif_catalogue   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS actif_flash       BOOLEAN DEFAULT TRUE;

-- Déprécier l'ancienne colonne "actif" (remplacée par actif_catalogue)
-- On la garde pour compatibilité mais actif_catalogue fait foi.
-- Les deux sont synchronisés via trigger ci-dessous.

-- Prix flash : null = calcul auto (prix_vente × (1 - remise/100))
-- valeur = prix fixe qui override le calcul
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS prix_flash_override DECIMAL(8,2) DEFAULT NULL;

-- Allergènes — liste légale EU (14 allergènes majeurs)
-- Stocké en TEXT[] pour faciliter les filtres et l'affichage
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS allergenes TEXT[] DEFAULT '{}';

-- Disponibilité saisonnière
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS disponible_du  DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disponible_au  DATE DEFAULT NULL;

-- Stock alerte : seuil push notification
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS stock_alerte INT DEFAULT NULL;

-- Image Supabase Storage (path relatif dans le bucket)
-- Format : "{boulangerie_id}/{produit_id}.webp"
-- image_url reste pour les URLs externes / Airtable legacy
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS image_storage_path TEXT DEFAULT NULL;

-- Commentaire / note interne (visible boulanger uniquement)
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS note_interne TEXT DEFAULT NULL;

-- Contrainte : prix_flash_override doit être > 0 si défini
ALTER TABLE produits
  DROP CONSTRAINT IF EXISTS chk_prix_flash_override;
ALTER TABLE produits
  ADD CONSTRAINT chk_prix_flash_override
    CHECK (prix_flash_override IS NULL OR prix_flash_override > 0);

-- Contrainte : saisonnalité cohérente
ALTER TABLE produits
  DROP CONSTRAINT IF EXISTS chk_saisonnalite;
ALTER TABLE produits
  ADD CONSTRAINT chk_saisonnalite
    CHECK (
      (disponible_du IS NULL AND disponible_au IS NULL)
      OR
      (disponible_du IS NOT NULL AND disponible_au IS NOT NULL AND disponible_du <= disponible_au)
    );

-- ── 2. INDEX SUPPLÉMENTAIRES ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_produits_actif_catalogue
  ON produits(boulangerie_id, actif_catalogue)
  WHERE actif_catalogue = TRUE;

CREATE INDEX IF NOT EXISTS idx_produits_actif_flash
  ON produits(boulangerie_id, actif_flash)
  WHERE actif_flash = TRUE;

-- ── 3. SUPABASE STORAGE BUCKET ────────────────────────────────
-- Bucket public pour les photos produits
-- Les URLs sont publiques (vitrine client) mais l'upload
-- est restreint au boulanger owner

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produits-photos',
  'produits-photos',
  TRUE,                     -- lecture publique pour la vitrine
  5242880,                  -- 5 MB max par photo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public            = TRUE,
  file_size_limit   = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

-- ── 4. POLICIES STORAGE ──────────────────────────────────────

-- Lecture publique (vitrine client, pas d'auth requise)
DROP POLICY IF EXISTS "produits_photos_public_read" ON storage.objects;
CREATE POLICY "produits_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'produits-photos');

-- Upload : uniquement le boulanger owner
-- Le chemin doit commencer par son boulangerie_id
DROP POLICY IF EXISTS "produits_photos_owner_insert" ON storage.objects;
CREATE POLICY "produits_photos_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'produits-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- Update : idem
DROP POLICY IF EXISTS "produits_photos_owner_update" ON storage.objects;
CREATE POLICY "produits_photos_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'produits-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- Suppression : idem
DROP POLICY IF EXISTS "produits_photos_owner_delete" ON storage.objects;
CREATE POLICY "produits_photos_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'produits-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- ── 5. MISE À JOUR get_catalogue_public() ─────────────────────
-- Expose allergènes + URL image Storage sur la vitrine.
-- Construit l'URL publique depuis image_storage_path si disponible,
-- sinon fallback sur image_url.

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  v_storage_url    TEXT;
BEGIN
  SELECT b.id, b.actif
    INTO v_boulangerie_id, v_actif
    FROM boulangeries b
   WHERE b.slug = p_slug
   LIMIT 1;

  IF v_boulangerie_id IS NULL OR NOT v_actif THEN
    RETURN;
  END IF;

  -- URL publique du bucket Storage
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
      -- Priorité : Storage > image_url externe > null
      CASE
        WHEN p.image_storage_path IS NOT NULL
          THEN v_storage_url || p.image_storage_path
        ELSE p.image_url
      END AS image_url,
      COALESCE(p.allergenes, '{}') AS allergenes,
      p.actif_flash
    FROM produits p
   WHERE p.boulangerie_id = v_boulangerie_id
     AND p.actif_catalogue = TRUE
     -- Filtre saisonnalité : null = toujours dispo
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

-- ── 6. MISE À JOUR get_paniers_flash() ───────────────────────
-- Respecte prix_flash_override si défini.

DROP FUNCTION IF EXISTS get_paniers_flash(TEXT);

CREATE OR REPLACE FUNCTION get_paniers_flash(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  v_today          DATE := CURRENT_DATE;
  v_heure          INT  := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Paris')::INT;
  v_heure_debut    INT  := 18;
  v_heure_fin      INT  := 20;
  v_remise         INT  := 40;
  v_invendus       JSON;
  v_nb_paniers     INT  := 0;
  v_flash_actif    BOOLEAN := FALSE;
  v_storage_url    TEXT;
BEGIN
  SELECT b.id, b.actif
    INTO v_boulangerie_id, v_actif
    FROM boulangeries b
   WHERE b.slug = p_slug
   LIMIT 1;

  IF v_boulangerie_id IS NULL OR NOT v_actif THEN
    RETURN json_build_object('flashActif', FALSE, 'heureDebut', v_heure_debut,
      'heureFin', v_heure_fin, 'remise', v_remise, 'nbPaniers', 0, 'invendus', '[]'::json);
  END IF;

  v_flash_actif := (v_heure >= v_heure_debut AND v_heure < v_heure_fin);

  IF NOT v_flash_actif THEN
    RETURN json_build_object('flashActif', FALSE, 'heureDebut', v_heure_debut,
      'heureFin', v_heure_fin, 'remise', v_remise, 'nbPaniers', 0, 'invendus', '[]'::json);
  END IF;

  v_storage_url := current_setting('app.supabase_url', TRUE)
                   || '/storage/v1/object/public/produits-photos/';

  SELECT
    COUNT(DISTINCT sj.produit_id),
    json_agg(json_build_object(
      'nom',          sj.produit_nom,
      'emoji',        sj.produit_emoji,
      'categorie',    sj.categorie,
      'prixOriginal', sj.prix_vente,
      -- Respecte le prix override si défini sur le produit
      'prixFlash', COALESCE(
        p.prix_flash_override,
        ROUND(sj.prix_vente * (1 - v_remise::DECIMAL / 100), 2)
      )
    ) ORDER BY sj.categorie, sj.produit_nom)
  INTO v_nb_paniers, v_invendus
  FROM stocks_journaliers sj
  JOIN journees j   ON j.id = sj.journee_id
  LEFT JOIN produits p ON p.boulangerie_id = v_boulangerie_id
                       AND p.nom = sj.produit_nom -- join approximatif par nom
  WHERE j.boulangerie_id = v_boulangerie_id
    AND j.date            = v_today
    AND sj.stock_final   > 0;

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

-- ── 7. SEED — Produits par défaut (template starter) ─────────
-- Décommenter et adapter le slug pour la boulangerie de démo.
-- Ces produits apparaissent lors du premier wizard d'onboarding.

/*
DO $$
DECLARE v_bid UUID;
BEGIN
  SELECT id INTO v_bid FROM boulangeries WHERE slug = 'artisan-dore';
  IF v_bid IS NULL THEN RETURN; END IF;

  INSERT INTO produits (
    boulangerie_id, nom, categorie, emoji,
    prix_vente, cout_production, actif_catalogue, actif_flash, ordre,
    allergenes
  ) VALUES
    (v_bid, 'Baguette Tradition',  'boulangerie',  '🥖', 1.30, 0.35, true, true,  1, ARRAY['gluten']),
    (v_bid, 'Pain au Levain',      'boulangerie',  '🍞', 4.50, 1.20, true, true,  2, ARRAY['gluten']),
    (v_bid, 'Pain aux Céréales',   'boulangerie',  '🌾', 3.80, 1.00, true, true,  3, ARRAY['gluten', 'sesame']),
    (v_bid, 'Fougasse Provençale', 'boulangerie',  '🫓', 3.50, 0.90, true, true,  4, ARRAY['gluten']),
    (v_bid, 'Croissant',           'viennoiserie', '🥐', 1.50, 0.45, true, true,  5, ARRAY['gluten', 'lait', 'oeufs']),
    (v_bid, 'Pain au Chocolat',    'viennoiserie', '🍫', 1.60, 0.50, true, true,  6, ARRAY['gluten', 'lait', 'oeufs']),
    (v_bid, 'Brioche',             'viennoiserie', '🧁', 3.20, 0.90, true, true,  7, ARRAY['gluten', 'lait', 'oeufs']),
    (v_bid, 'Tarte au Citron',     'patisserie',   '🍋', 4.80, 1.50, true, true,  8, ARRAY['gluten', 'lait', 'oeufs']),
    (v_bid, 'Éclair au Café',      'patisserie',   '☕', 3.90, 1.20, true, true,  9, ARRAY['gluten', 'lait', 'oeufs']),
    (v_bid, 'Millefeuille',        'patisserie',   '🎂', 4.50, 1.40, true, true, 10, ARRAY['gluten', 'lait', 'oeufs']),
    (v_bid, 'Paris-Brest',         'patisserie',   '🎪', 4.20, 1.30, true, true, 11, ARRAY['gluten', 'lait', 'oeufs', 'fruits_a_coque']),
    (v_bid, 'Tarte aux Fraises',   'patisserie',   '🍓', 5.20, 1.80, true, true, 12, ARRAY['gluten', 'lait', 'oeufs'])
  ON CONFLICT DO NOTHING;
END $$;
*/

-- ── 8. VÉRIFICATION ──────────────────────────────────────────

DO $$
DECLARE
  n_cols    INT;
  n_bucket  INT;
  n_funcs   INT;
BEGIN
  SELECT COUNT(*) INTO n_cols
    FROM information_schema.columns
   WHERE table_name = 'produits' AND table_schema = 'public'
     AND column_name IN ('actif_catalogue', 'actif_flash', 'allergenes',
                         'prix_flash_override', 'image_storage_path');

  SELECT COUNT(*) INTO n_bucket
    FROM storage.buckets WHERE id = 'produits-photos';

  SELECT COUNT(*) INTO n_funcs
    FROM information_schema.routines
   WHERE routine_name IN ('get_catalogue_public', 'get_paniers_flash')
     AND routine_schema = 'public';

  IF n_cols < 5 THEN
    RAISE EXCEPTION 'Colonnes produits manquantes (% / 5)', n_cols;
  END IF;
  IF n_bucket = 0 THEN
    RAISE EXCEPTION 'Bucket produits-photos non créé';
  END IF;

  RAISE NOTICE '✅ Migration 7 OK — % colonnes produits, bucket Storage, % fonctions', n_cols, n_funcs;
END $$;

COMMIT;