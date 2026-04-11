-- ═══════════════════════════════════════════════════════════════════════
-- Sauve Mie — Migration : Pré-commandes (Click & Collect pour le lendemain)
-- Avril 2026
--
-- Ajout du champ date_retrait sur commandes pour supporter les
-- pré-commandes J+1. Mise à jour de la RPC verifier_stock_commande
-- pour skipper la vérification de stock quand date_retrait > aujourd'hui.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Ajouter date_retrait à commandes (NULL = aujourd'hui pour rétro-compat)
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS date_retrait DATE;

-- Les commandes existantes sans date_retrait sont implicitement "aujourd'hui"
-- (on ne backfill pas car created_at::date fait office de date_retrait pour les anciennes)

CREATE INDEX IF NOT EXISTS idx_commandes_date_retrait
  ON commandes(boulangerie_id, date_retrait, statut);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Mise à jour de verifier_stock_commande
--    - Nouveau param p_date_retrait (DATE, optionnel)
--    - Si p_date_retrait > p_date (= demain), on insère sans vérifier le stock
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verifier_stock_commande(
  p_boulangerie_id   UUID,
  p_date             DATE,
  p_lignes           JSONB,
  p_timezone         TEXT DEFAULT 'Europe/Paris',
  p_client_prenom    TEXT DEFAULT NULL,
  p_client_email     TEXT DEFAULT NULL,
  p_client_telephone TEXT DEFAULT NULL,
  p_heure_retrait    TIME DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_montant_total    NUMERIC DEFAULT NULL,
  p_date_retrait     DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_journee_id     UUID;
  v_ligne          JSONB;
  v_produit_id     TEXT;
  v_produit_nom    TEXT;
  v_quantite       INT;
  v_production     INT;
  v_report         INT;
  v_total_prod     INT;
  v_reserved_cc    INT;
  v_reserved_flash INT;
  v_disponible     INT;
  v_indisponibles  TEXT := '';
  v_day_start      TIMESTAMPTZ;
  v_day_end        TIMESTAMPTZ;
  v_commande_id    UUID;
  v_effective_date DATE;
BEGIN
  -- Date de retrait effective : si non fournie, c'est aujourd'hui
  v_effective_date := COALESCE(p_date_retrait, p_date);

  -- ═══════════════════════════════════════════════════════════════
  -- PRÉ-COMMANDE (date_retrait > aujourd'hui) → pas de vérif stock
  -- On insère directement la commande car la production n'a pas
  -- encore eu lieu pour cette date.
  -- ═══════════════════════════════════════════════════════════════
  IF v_effective_date > p_date THEN
    IF p_client_prenom IS NOT NULL THEN
      INSERT INTO commandes (
        boulangerie_id, client_prenom, client_email, client_telephone,
        heure_retrait, notes, montant_total, statut, lignes, date_retrait
      ) VALUES (
        p_boulangerie_id, p_client_prenom, p_client_email, p_client_telephone,
        p_heure_retrait, p_notes, p_montant_total, 'en_attente', p_lignes,
        v_effective_date
      ) RETURNING id INTO v_commande_id;
    END IF;
    RETURN v_commande_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- COMMANDE DU JOUR — Vérification stock standard
  -- ═══════════════════════════════════════════════════════════════

  -- Bornes de la journée en tenant compte du timezone de la boulangerie
  v_day_start := (p_date::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone;
  v_day_end   := ((p_date + 1)::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone;

  -- 1. Vérifier qu'une journée existe
  SELECT id INTO v_journee_id
  FROM journees
  WHERE boulangerie_id = p_boulangerie_id
    AND date = p_date;

  IF v_journee_id IS NULL THEN
    RAISE EXCEPTION 'La production du jour n''a pas encore été saisie.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Pour chaque ligne de la commande
  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_produit_id  := v_ligne->>'produit_id';
    v_produit_nom := v_ligne->>'produit_nom';
    v_quantite    := (v_ligne->>'quantite')::INT;

    -- 3. Lire la production avec verrou exclusif (sérialise les transactions concurrentes)
    SELECT COALESCE(sj.production, 0), COALESCE(sj.report_veille, 0)
    INTO v_production, v_report
    FROM stocks_journaliers sj
    WHERE sj.journee_id = v_journee_id
      AND sj.produit_id = v_produit_id
    FOR UPDATE;

    -- Si le produit n'est pas dans la production du jour → refus
    IF NOT FOUND THEN
      v_indisponibles := v_indisponibles
        || v_produit_nom || ' : produit non disponible aujourd''hui|';
      CONTINUE;
    END IF;

    v_total_prod := v_production + v_report;

    -- 4. Calculer les réservations C&C actives (par produit_id dans les lignes JSONB)
    SELECT COALESCE(SUM((l->>'quantite')::INT), 0) INTO v_reserved_cc
    FROM commandes c,
         jsonb_array_elements(c.lignes) AS l
    WHERE c.boulangerie_id = p_boulangerie_id
      AND c.created_at >= v_day_start
      AND c.created_at <  v_day_end
      AND c.statut IN ('en_attente', 'confirmee', 'prete', 'recuperee')
      AND (c.date_retrait IS NULL OR c.date_retrait = p_date)
      AND l->>'produit_id' = v_produit_id;

    -- 5. Calculer les réservations flash (quantite_initiale entière)
    SELECT COALESCE(SUM(quantite_initiale), 0) INTO v_reserved_flash
    FROM paniers_flash
    WHERE boulangerie_id = p_boulangerie_id
      AND date = p_date
      AND produit_id = v_produit_id
      AND actif = TRUE;

    -- 6. Vérifier la disponibilité
    v_disponible := v_total_prod - v_reserved_cc - v_reserved_flash;

    IF v_quantite > v_disponible THEN
      v_indisponibles := v_indisponibles
        || v_produit_nom || ' : '
        || GREATEST(v_disponible, 0) || ' disponible(s), '
        || v_quantite || ' demandé(s)|';
    END IF;
  END LOOP;

  -- 7. Si des produits sont indisponibles → erreur
  IF v_indisponibles <> '' THEN
    RAISE EXCEPTION 'Stock insuffisant|%', v_indisponibles
      USING ERRCODE = 'P0002';
  END IF;

  -- 8. Stock OK → insérer la commande dans la même transaction (atomique)
  IF p_client_prenom IS NOT NULL THEN
    INSERT INTO commandes (
      boulangerie_id, client_prenom, client_email, client_telephone,
      heure_retrait, notes, montant_total, statut, lignes, date_retrait
    ) VALUES (
      p_boulangerie_id, p_client_prenom, p_client_email, p_client_telephone,
      p_heure_retrait, p_notes, p_montant_total, 'en_attente', p_lignes,
      v_effective_date
    ) RETURNING id INTO v_commande_id;
  END IF;

  RETURN v_commande_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Vérification
-- ────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commandes'
      AND column_name = 'date_retrait'
  ) THEN
    RAISE EXCEPTION '❌ Colonne date_retrait manquante sur commandes';
  END IF;

  RAISE NOTICE '✅ Migration pré-commandes appliquée avec succès';
  RAISE NOTICE '   · commandes.date_retrait : DATE (nullable)';
  RAISE NOTICE '   · verifier_stock_commande : support p_date_retrait';
  RAISE NOTICE '   · Index idx_commandes_date_retrait créé';
END $$;

COMMIT;
