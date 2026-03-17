-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Fix fuseau horaire get_paniers_flash
-- 
-- PROBLÈME IDENTIFIÉ :
--   - v_today := CURRENT_DATE utilise le fuseau du serveur (UTC)
--   - v_heure utilise NOW() AT TIME ZONE 'Europe/Paris'
--   - Incohérence : les paniers du 17 mars Paris sont ignorés quand
--     le serveur UTC est encore au 16 mars
--
-- SOLUTION :
--   Aligner v_today sur le fuseau Paris pour cohérence avec l'heure
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Remplace get_paniers_flash() avec fuseau cohérent ──────────────────

CREATE OR REPLACE FUNCTION get_paniers_flash(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
  v_actif          BOOLEAN;
  v_today          DATE    := (NOW() AT TIME ZONE 'Europe/Paris')::DATE;  -- ← FIX: fuseau Paris
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

-- ── Vérification ──────────────────────────────────────────────────────

DO $$
DECLARE 
  v_today_paris DATE;
  v_today_utc DATE;
BEGIN
  v_today_paris := (NOW() AT TIME ZONE 'Europe/Paris')::DATE;
  v_today_utc := CURRENT_DATE;
  
  RAISE NOTICE '✅ get_paniers_flash() mise à jour';
  RAISE NOTICE '   Date Paris: % | Date UTC: %', v_today_paris, v_today_utc;
  
  IF v_today_paris != v_today_utc THEN
    RAISE NOTICE '   ⚠️  Décalage détecté — fix nécessaire';
  ELSE
    RAISE NOTICE '   ✓ Dates alignées';
  END IF;
END $$;

COMMIT;