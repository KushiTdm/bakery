-- migration-9-tour.sql
-- Ajouter la persistance du wizard de visite guidée
-- Exécuter dans Supabase SQL Editor

-- ── 1. Colonne sur boulangeries ─────────────────────────────────────────────
ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Index pour les requêtes de check rapide
CREATE INDEX IF NOT EXISTS idx_boulangeries_tour
  ON boulangeries (id)
  WHERE tour_completed_at IS NULL;

-- ── 2. Fonction pour marquer le tour comme terminé ──────────────────────────
CREATE OR REPLACE FUNCTION complete_tour()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
BEGIN
  SELECT id INTO v_boulangerie_id
  FROM boulangeries
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_boulangerie_id IS NULL THEN
    RAISE EXCEPTION 'Boulangerie introuvable pour cet utilisateur';
  END IF;

  UPDATE boulangeries
  SET tour_completed_at = NOW()
  WHERE id = v_boulangerie_id;
END;
$$;

-- ── 3. Fonction pour reset le tour (pour "revoir la visite") ─────────────────
CREATE OR REPLACE FUNCTION reset_tour()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boulangerie_id UUID;
BEGIN
  SELECT id INTO v_boulangerie_id
  FROM boulangeries
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_boulangerie_id IS NULL THEN
    RAISE EXCEPTION 'Boulangerie introuvable pour cet utilisateur';
  END IF;

  UPDATE boulangeries
  SET tour_completed_at = NULL
  WHERE id = v_boulangerie_id;
END;
$$;

-- ── 4. RLS : le boulanger peut lire sa propre colonne ───────────────────────
-- (déjà couvert par les policies existantes sur boulangeries)
-- Vérifier que la policy SELECT est bien active :
-- SELECT * FROM pg_policies WHERE tablename = 'boulangeries';