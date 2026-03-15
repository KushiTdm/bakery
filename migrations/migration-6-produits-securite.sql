-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 6 — Catalogue natif + Sécurité renforcée
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. Crée la table `produits` (catalogue natif par boulangerie)
--   2. Renforce le RLS sur stocks_journaliers (aucune fuite possible)
--   3. Crée une fonction SQL SECURITY DEFINER get_catalogue_public()
--      → seule façon sécurisée d'exposer des données publiques
--      → elle ne retourne JAMAIS les stocks, invendus, ou données internes
--   4. Crée une fonction get_paniers_flash() pour le compte de paniers
--      → retourne UNIQUEMENT le nombre + prix, jamais le détail des stocks
--   5. Supprime les anciens accès dangereux
--
-- PRINCIPE DE SECURITE APPLIQUÉ :
--   - RLS = tout refusé par défaut, on ouvre uniquement ce qui est nécessaire
--   - Les données sensibles (stocks, invendus, CA) ne sont JAMAIS exposées
--     via une policy RLS publique — uniquement via service_role côté serveur
--   - Les fonctions SECURITY DEFINER s'exécutent avec les droits du créateur
--     (service_role), pas de l'appelant — ce qui permet de contrôler
--     exactement ce qui est retourné sans exposer les tables sous-jacentes
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. TABLE PRODUITS ─────────────────────────────────────────
-- Remplace Airtable. Chaque produit appartient à une boulangerie.
-- Un client ne peut lire que les produits actifs, via la fonction
-- get_catalogue_public() — jamais directement.

CREATE TABLE IF NOT EXISTS produits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  UUID NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,

  -- Infos produit
  nom             TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 100),
  description     TEXT CHECK (length(description) <= 500),
  categorie       TEXT NOT NULL DEFAULT 'boulangerie'
                  CHECK (categorie IN ('boulangerie', 'viennoiserie', 'patisserie')),
  emoji           TEXT DEFAULT '🥖',
  prix_vente      DECIMAL(8,2) NOT NULL CHECK (prix_vente > 0),
  cout_production DECIMAL(8,2) DEFAULT 0,

  -- Image
  image_url       TEXT,
  image_storage_path TEXT, -- chemin Supabase Storage (optionnel)

  -- Disponibilité
  actif           BOOLEAN DEFAULT TRUE,
  ordre           INT DEFAULT 0, -- pour le tri dans la vitrine

  -- Metadata
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_produits_boulangerie
  ON produits(boulangerie_id, actif, categorie);

-- Trigger updated_at
CREATE TRIGGER trg_produits_updated_at
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS sur produits ──────────────────────────────────────────
-- IMPORTANT : aucune policy de lecture publique directe.
-- L'accès public se fait UNIQUEMENT via get_catalogue_public().
-- Cela empêche un client (ou un hacker) de faire :
--   SELECT * FROM produits WHERE boulangerie_id = 'uuid-boulangerie-A'
-- et de récupérer les données d'une autre boulangerie.

ALTER TABLE produits ENABLE ROW LEVEL SECURITY;

-- Le boulanger owner peut tout faire sur SES produits
CREATE POLICY "produits_select_own"
  ON produits FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "produits_insert_own"
  ON produits FOR INSERT
  WITH CHECK (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "produits_update_own"
  ON produits FOR UPDATE
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "produits_delete_own"
  ON produits FOR DELETE
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- ── 2. RENFORCEMENT RLS stocks_journaliers ────────────────────
-- Les stocks ne doivent JAMAIS être accessibles publiquement.
-- On supprime d'éventuelles policies trop permissives et on
-- s'assure que seul le service_role ou le owner peut lire.

-- Supprime les policies existantes pour repartir proprement
DROP POLICY IF EXISTS "stocks_select_own"   ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_insert_own"   ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_update_own"   ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_delete_own"   ON stocks_journaliers;
DROP POLICY IF EXISTS "Service role full access" ON stocks_journaliers;

-- Recréation stricte
CREATE POLICY "stocks_owner_select"
  ON stocks_journaliers FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "stocks_owner_insert"
  ON stocks_journaliers FOR INSERT
  WITH CHECK (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "stocks_owner_update"
  ON stocks_journaliers FOR UPDATE
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- Idem pour journees
DROP POLICY IF EXISTS "journee_select_own"  ON journees;
DROP POLICY IF EXISTS "journee_insert_own"  ON journees;
DROP POLICY IF EXISTS "journee_update_own"  ON journees;

CREATE POLICY "journee_owner_select"
  ON journees FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "journee_owner_insert"
  ON journees FOR INSERT
  WITH CHECK (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "journee_owner_update"
  ON journees FOR UPDATE
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
    )
  );

-- ── 3. FONCTION PUBLIQUE CATALOGUE ───────────────────────────
-- SECURITY DEFINER = s'exécute avec les droits du créateur (service_role)
-- Le client appelle cette fonction avec anon key — il ne peut PAS
-- contourner le filtre pour voir d'autres boulangeries.
-- Elle retourne UNIQUEMENT les champs sûrs pour une vitrine publique.

DROP FUNCTION IF EXISTS get_catalogue_public(TEXT);

CREATE OR REPLACE FUNCTION get_catalogue_public(p_slug TEXT)
RETURNS TABLE (
  id          UUID,
  nom         TEXT,
  description TEXT,
  categorie   TEXT,
  emoji       TEXT,
  prix_vente  DECIMAL,
  image_url   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
-- Fixe le search_path pour éviter les attaques par injection de schéma
SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
BEGIN
  -- Vérifie que la boulangerie existe ET est active
  SELECT b.id, b.actif
    INTO v_boulangerie_id, v_actif
    FROM boulangeries b
   WHERE b.slug = p_slug
   LIMIT 1;

  -- Boulangerie inconnue ou désactivée → résultat vide (pas d'erreur)
  -- On ne révèle pas si la boulangerie existe ou non
  IF v_boulangerie_id IS NULL OR NOT v_actif THEN
    RETURN;
  END IF;

  -- Retourne uniquement les produits actifs, champs publics seulement
  -- Jamais : cout_production, stock_final, données internes
  RETURN QUERY
    SELECT
      p.id,
      p.nom,
      p.description,
      p.categorie,
      p.emoji,
      p.prix_vente,
      p.image_url
    FROM produits p
   WHERE p.boulangerie_id = v_boulangerie_id
     AND p.actif = TRUE
   ORDER BY p.categorie, p.ordre, p.nom;
END;
$$;

-- Révoque l'accès public par défaut, le réaccorde explicitement à anon
REVOKE ALL ON FUNCTION get_catalogue_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_catalogue_public(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_catalogue_public(TEXT) TO authenticated;

-- ── 4. FONCTION PUBLIQUE PANIERS FLASH ───────────────────────
-- Retourne UNIQUEMENT ce que le client a besoin de voir :
--   - Le flash est-il actif ?
--   - Combien de paniers restent-il ?
--   - Quel est le prix du panier ?
--   - Le contenu GÉNÉRIQUE (pas les quantités réelles en stock)
--
-- Ce que cette fonction NE retourne PAS :
--   - Les quantités réelles en stock (stock_final)
--   - Le CA de la journée
--   - Les données de production
--   - Tout ce qui pourrait renseigner un concurrent

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

  -- Config flash (valeurs par défaut si non configurée)
  v_heure_debut    INT  := 18;
  v_heure_fin      INT  := 20;
  v_remise         INT  := 40;

  -- Résultat
  v_invendus       JSON;
  v_nb_paniers     INT  := 0;
  v_flash_actif    BOOLEAN := FALSE;
BEGIN
  -- Vérifie boulangerie
  SELECT b.id, b.actif
    INTO v_boulangerie_id, v_actif
    FROM boulangeries b
   WHERE b.slug = p_slug
   LIMIT 1;

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

  -- Flash actif si dans la fenêtre horaire
  v_flash_actif := (v_heure >= v_heure_debut AND v_heure < v_heure_fin);

  -- Si flash pas actif → retourne juste la config, pas les données
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

  -- Récupère les invendus du jour (stock_final > 0)
  -- Retourne NOM + EMOJI + PRIX FLASH uniquement
  -- PAS les quantités réelles (évite de renseigner sur les niveaux de stock)
  SELECT
    COUNT(DISTINCT sj.produit_id),
    json_agg(json_build_object(
      'nom',         sj.produit_nom,
      'emoji',       sj.produit_emoji,
      'categorie',   sj.categorie,
      'prixOriginal', sj.prix_vente,
      'prixFlash',   ROUND(sj.prix_vente * (1 - v_remise::DECIMAL / 100), 2)
      -- NB : stock_final intentionnellement absent
    ) ORDER BY sj.categorie, sj.produit_nom)
  INTO v_nb_paniers, v_invendus
  FROM stocks_journaliers sj
  JOIN journees j ON j.id = sj.journee_id
  WHERE j.boulangerie_id = v_boulangerie_id
    AND j.date            = v_today
    AND sj.stock_final   > 0;

  -- nb paniers = nb de types de produits invendus (simplifié)
  -- La vraie logique de comptage de paniers peut être affinée
  v_nb_paniers := COALESCE(v_nb_paniers, 0);

  RETURN json_build_object(
    'flashActif', v_flash_actif,
    'heureDebut', v_heure_debut,
    'heureFin',   v_heure_fin,
    'remise',     v_remise,
    'nbPaniers',  v_nb_paniers,
    'invendus',   COALESCE(v_invendus, '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION get_paniers_flash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_paniers_flash(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_paniers_flash(TEXT) TO authenticated;

-- ── 5. DONNÉES DE SEED — Migration produits depuis DEFAULT_STOCKS ──
-- Insère les produits par défaut pour la boulangerie de démo.
-- En production, chaque boulangerie gère son catalogue via l'interface.
-- À adapter avec le vrai boulangerie_id.

-- Exemple (décommenter et adapter le boulangerie_id) :
/*
INSERT INTO produits (boulangerie_id, nom, categorie, emoji, prix_vente, cout_production, actif, ordre)
SELECT
  b.id,
  p.nom,
  p.categorie,
  p.emoji,
  p.prix_vente,
  p.cout_production,
  true,
  p.ordre
FROM boulangeries b
CROSS JOIN (VALUES
  ('Baguette Tradition', 'boulangerie',  '🥖', 1.30, 0.35, 1),
  ('Pain au Levain',     'boulangerie',  '🍞', 4.50, 1.20, 2),
  ('Pain aux Céréales',  'boulangerie',  '🌾', 3.80, 1.00, 3),
  ('Croissant',          'viennoiserie', '🥐', 1.50, 0.45, 4),
  ('Pain au Chocolat',   'viennoiserie', '🍫', 1.60, 0.50, 5),
  ('Brioche',            'viennoiserie', '🧁', 3.20, 0.90, 6),
  ('Tarte au Citron',    'patisserie',   '🍋', 4.80, 1.50, 7),
  ('Éclair au Café',     'patisserie',   '☕', 3.90, 1.20, 8),
  ('Millefeuille',       'patisserie',   '🎂', 4.50, 1.40, 9)
) AS p(nom, categorie, emoji, prix_vente, cout_production, ordre)
WHERE b.slug = 'artisan-dore'
ON CONFLICT DO NOTHING;
*/

-- ── 6. VÉRIFICATION FINALE ────────────────────────────────────

DO $$
DECLARE
  n_produits INT;
  n_fonctions INT;
BEGIN
  SELECT COUNT(*) INTO n_produits FROM information_schema.tables
   WHERE table_name = 'produits' AND table_schema = 'public';

  SELECT COUNT(*) INTO n_fonctions FROM information_schema.routines
   WHERE routine_name IN ('get_catalogue_public', 'get_paniers_flash')
     AND routine_schema = 'public';

  IF n_produits = 0 THEN
    RAISE EXCEPTION 'Table produits non créée';
  END IF;

  IF n_fonctions < 2 THEN
    RAISE EXCEPTION 'Fonctions SQL manquantes (% / 2 créées)', n_fonctions;
  END IF;

  RAISE NOTICE '✅ Migration 6 OK — table produits + % fonctions sécurisées', n_fonctions;
END $$;

COMMIT;