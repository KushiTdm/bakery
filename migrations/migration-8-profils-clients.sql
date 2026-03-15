-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 8 — Profils clients + RGPD
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════
--
-- Crée la table profils_clients qui stocke :
--   - Prénom (affiché sur les commandes boulanger)
--   - Téléphone (optionnel)
--   - Opt-in flash anti-gaspi (push)
--   - Acceptation RGPD horodatée (obligatoire)
--   - Flag profil_completed (évite de re-afficher le wizard)
--
-- SÉCURITÉ :
--   - RLS stricte : chaque client ne voit QUE son propre profil
--   - Le boulanger ne peut pas lire les profils clients (données personnelles)
--   - Seul service_role peut lire tous les profils (pour les emails)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS profils_clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Données personnelles
  prenom              TEXT NOT NULL CHECK (length(prenom) BETWEEN 1 AND 50),
  telephone           TEXT CHECK (telephone IS NULL OR length(telephone) BETWEEN 8 AND 20),

  -- Préférences
  optin_flash         BOOLEAN DEFAULT FALSE,  -- recevoir alertes paniers anti-gaspi
  optin_marketing     BOOLEAN DEFAULT FALSE,  -- emails promotionnels

  -- RGPD — horodatage obligatoire
  rgpd_accepted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rgpd_version        TEXT NOT NULL DEFAULT '1.0', -- version de la politique

  -- Statut wizard
  profil_completed    BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Un seul profil par user
  UNIQUE(user_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_profils_clients_user_id
  ON profils_clients(user_id);

-- Trigger updated_at
CREATE TRIGGER trg_profils_clients_updated_at
  BEFORE UPDATE ON profils_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE profils_clients ENABLE ROW LEVEL SECURITY;

-- Le client peut lire et modifier SON propre profil
CREATE POLICY "client_select_own_profil"
  ON profils_clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "client_insert_own_profil"
  ON profils_clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "client_update_own_profil"
  ON profils_clients FOR UPDATE
  USING (auth.uid() = user_id);

-- Le boulanger NE peut PAS lire les profils clients
-- (les données client transitent uniquement via les commandes)
-- Seul service_role peut tout voir (pour les emails Resend, etc.)

-- ── Vérification ──────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 8 OK — table profils_clients créée';
END $$;

COMMIT;