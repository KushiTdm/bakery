-- 002_commandes_penalites_flash.sql 30 mars 2026
-- ─────────────────────────────────────────────────────────────
-- Phase 1 : Pénalités clients (no-show)
-- Phase 2 : Achat flash atomique (RPC)
-- Phase 3 : Colonne type sur commandes
-- ─────────────────────────────────────────────────────────────

-- ── 1. Table pénalités clients ──────────────────────────────

CREATE TABLE IF NOT EXISTS client_penalites (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id   UUID         NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  client_email     TEXT         NOT NULL CHECK (client_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  nb_non_recupere  INT          NOT NULL DEFAULT 0,
  bloque           BOOLEAN      NOT NULL DEFAULT FALSE,
  blocage_date     TIMESTAMPTZ,
  debloque_par_id  UUID         REFERENCES auth.users(id),
  debloque_le      TIMESTAMPTZ,
  note_deblocage   TEXT         CHECK (length(note_deblocage) <= 500),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(boulangerie_id, client_email)
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS client_penalites_updated_at ON client_penalites;
CREATE TRIGGER client_penalites_updated_at
  BEFORE UPDATE ON client_penalites FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS : accès via service_role uniquement (API routes)
ALTER TABLE client_penalites ENABLE ROW LEVEL SECURITY;

-- ── 2. Seuil pénalité configurable par boulangerie ─────────

ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS seuil_penalite INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS penalite_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 3. Colonne type sur commandes ───────────────────────────

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'clickcollect'
    CHECK (type IN ('clickcollect', 'anti_gaspi'));

-- ── 4. RPC : achat flash atomique ──────────────────────────
-- Décrémente quantite_restante pour chaque produit demandé.
-- Si un produit est épuisé → RAISE EXCEPTION → rollback complet.
-- Retourne les détails des produits achetés.

CREATE OR REPLACE FUNCTION acheter_paniers_flash(
  p_boulangerie_id UUID,
  p_date           DATE,
  p_produit_ids    TEXT[]
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_id     TEXT;
  v_row    RECORD;
  v_result JSONB := '[]'::JSONB;
BEGIN
  FOREACH v_id IN ARRAY p_produit_ids LOOP
    UPDATE paniers_flash
    SET quantite_restante = quantite_restante - 1,
        updated_at = NOW()
    WHERE boulangerie_id = p_boulangerie_id
      AND date = p_date
      AND produit_id = v_id
      AND actif = TRUE
      AND quantite_restante > 0
    RETURNING produit_id, produit_nom, produit_emoji, categorie,
              prix_original, prix_flash, quantite_restante
    INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produit épuisé ou indisponible: %', v_id
        USING ERRCODE = 'P0002';
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'produit_id',    v_row.produit_id,
      'produit_nom',   v_row.produit_nom,
      'emoji',         v_row.produit_emoji,
      'categorie',     v_row.categorie,
      'prix_original', v_row.prix_original,
      'prix_flash',    v_row.prix_flash
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

-- ── 5. Ajouter statut 'non_recuperee' aux commandes ─────────
-- Remplacer le CHECK constraint sur statut pour inclure non_recuperee

ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_statut_check;
ALTER TABLE commandes ADD CONSTRAINT commandes_statut_check
  CHECK (statut IN ('en_attente', 'confirmee', 'prete', 'recuperee', 'annulee', 'non_recuperee'));

-- ── 6. Index pour performances ──────────────────────────────

CREATE INDEX IF NOT EXISTS idx_client_penalites_lookup
  ON client_penalites(boulangerie_id, client_email);

CREATE INDEX IF NOT EXISTS idx_commandes_type
  ON commandes(boulangerie_id, type, created_at DESC);
