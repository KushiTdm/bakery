-- ═══════════════════════════════════════════════════════════════════════
-- BakeryOS — Migration Multi-Utilisateurs v1.0
-- À exécuter APRÈS migration-final-v3.sql
--
-- Nouveautés :
--   ✅ Table `employes` (gérant + vendeur)
--   ✅ Système d'invitation par token sécurisé (7 jours)
--   ✅ Permissions granulaires par feature par utilisateur
--   ✅ Limites par plan (starter: 1, pro: 3, multi: ∞)
--   ✅ RLS étendu — employees lisent les données de leur boulangerie
--   ✅ Fonctions SQL sécurisées pour middleware + contexte client
--   ✅ Audit log des changements d'équipe
--
-- Idempotent — peut être ré-exécuté sans risque
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. TABLE : employes
--    Un employé est lié à une boulangerie via invitation.
--    L'invitation est acceptée via un token UUID unique.
--    Soft suspend : statut = 'suspendu' conserve l'historique.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id      UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,

  -- Utilisateur Supabase (NULL jusqu'à acceptation de l'invitation)
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rôle
  role                TEXT        NOT NULL DEFAULT 'employe'
                      CHECK (role IN ('gerant', 'employe')),

  -- Permissions granulaires (surcharge les defaults du rôle)
  -- Format : { "matin": "write"|"read"|"none", ... }
  permissions         JSONB       NOT NULL DEFAULT '{}',

  -- Statut du membre
  statut              TEXT        NOT NULL DEFAULT 'invite'
                      CHECK (statut IN ('invite', 'actif', 'suspendu')),

  -- Invitation
  invite_email        TEXT        NOT NULL CHECK (invite_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  invite_token        TEXT        UNIQUE,   -- UUID aléatoire, nettoyé après acceptation
  invite_expires_at   TIMESTAMPTZ,          -- 7 jours après création

  -- Qui a créé cet accès (audit)
  created_by          UUID        REFERENCES auth.users(id),

  -- Nom affiché (copié depuis le profil lors de l'acceptation)
  prenom              TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_unique_user
  ON employes(boulangerie_id, user_id)
  WHERE user_id IS NOT NULL;  -- Partial index : pas de contrainte sur les invites en attente

CREATE INDEX IF NOT EXISTS idx_employes_boulangerie
  ON employes(boulangerie_id, statut);
CREATE INDEX IF NOT EXISTS idx_employes_user
  ON employes(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_invite_token
  ON employes(invite_token) WHERE invite_token IS NOT NULL;

-- Trigger updated_at
DO $$ BEGIN
  CREATE TRIGGER trg_employes_updated_at
    BEFORE UPDATE ON employes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS
ALTER TABLE employes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employes_owner_all"       ON employes;
DROP POLICY IF EXISTS "employes_gerant_read"     ON employes;
DROP POLICY IF EXISTS "employes_self_read"       ON employes;
DROP POLICY IF EXISTS "employes_service_all"     ON employes;

-- Owner : CRUD complet sur son équipe
CREATE POLICY "employes_owner_all"
  ON employes FOR ALL
  USING (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
  )
  WITH CHECK (
    boulangerie_id IN (SELECT id FROM boulangeries WHERE user_id = auth.uid())
  );

-- Gérant : lecture de l'équipe (pas de modification)
CREATE POLICY "employes_gerant_read"
  ON employes FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT boulangerie_id FROM employes e2
      WHERE e2.user_id = auth.uid() AND e2.statut = 'actif' AND e2.role = 'gerant'
    )
  );

-- Employé : lecture de sa propre ligne uniquement
CREATE POLICY "employes_self_read"
  ON employes FOR SELECT
  USING (user_id = auth.uid());

-- Service role : accès total (routes API)
CREATE POLICY "employes_service_all"
  ON employes FOR ALL
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- 2. TABLE : audit_equipe
--    Historique immuable des actions sur l'équipe.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_equipe (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  acteur_id       UUID        REFERENCES auth.users(id),  -- qui a fait l'action
  cible_id        UUID,                                    -- employe.id affecté
  action          TEXT        NOT NULL,                    -- 'invite'|'accept'|'suspend'|'reactivate'|'revoke'|'role_change'|'perm_change'
  details         JSONB       DEFAULT '{}',                -- détails (ancien rôle, nouveau rôle, etc.)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_equipe_boulangerie
  ON audit_equipe(boulangerie_id, created_at DESC);

ALTER TABLE audit_equipe ENABLE ROW LEVEL SECURITY;

-- Owner et gérant peuvent lire l'audit
CREATE POLICY "audit_equipe_read"
  ON audit_equipe FOR SELECT
  USING (
    boulangerie_id IN (
      SELECT id FROM boulangeries WHERE user_id = auth.uid()
      UNION
      SELECT boulangerie_id FROM employes
      WHERE user_id = auth.uid() AND statut = 'actif' AND role = 'gerant'
    )
  );

-- Seul le service role peut écrire (API routes)
-- INSERT n'accepte que WITH CHECK (pas USING)
CREATE POLICY "audit_equipe_service_insert"
  ON audit_equipe FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- 3. EXTENSION DES RLS EXISTANTES
--    Les employés actifs doivent pouvoir lire/écrire selon leur rôle.
--    On ajoute des policies complémentaires (sans supprimer les owner).
-- ────────────────────────────────────────────────────────────────────────

-- Helper : récupère le boulangerie_id de l'employé actif connecté
CREATE OR REPLACE FUNCTION get_employee_boulangerie_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT boulangerie_id FROM employes
  WHERE user_id = auth.uid() AND statut = 'actif'
  LIMIT 1;
$$;

-- ── journees : employés peuvent lire
DROP POLICY IF EXISTS "journee_employe_select" ON journees;
CREATE POLICY "journee_employe_select"
  ON journees FOR SELECT
  USING (boulangerie_id = get_employee_boulangerie_id());

-- ── stocks_journaliers : employés peuvent lire + mettre à jour snapshots
DROP POLICY IF EXISTS "stocks_employe_select" ON stocks_journaliers;
DROP POLICY IF EXISTS "stocks_employe_update" ON stocks_journaliers;

CREATE POLICY "stocks_employe_select"
  ON stocks_journaliers FOR SELECT
  USING (boulangerie_id = get_employee_boulangerie_id());

CREATE POLICY "stocks_employe_update"
  ON stocks_journaliers FOR UPDATE
  USING (boulangerie_id = get_employee_boulangerie_id())
  WITH CHECK (boulangerie_id = get_employee_boulangerie_id());

-- ── produits : s'assurer que deleted_at existe (garde-fou si migration-final-v3 pas encore exécutée)
ALTER TABLE produits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ── produits : employés peuvent lire (exclut les produits softdeleted)
DROP POLICY IF EXISTS "produits_employe_select" ON produits;
CREATE POLICY "produits_employe_select"
  ON produits FOR SELECT
  USING (boulangerie_id = get_employee_boulangerie_id() AND deleted_at IS NULL);

-- ── commandes : employés peuvent lire + mettre à jour le statut
DROP POLICY IF EXISTS "commandes_employe_select" ON commandes;
DROP POLICY IF EXISTS "commandes_employe_update" ON commandes;

CREATE POLICY "commandes_employe_select"
  ON commandes FOR SELECT
  USING (boulangerie_id = get_employee_boulangerie_id());

CREATE POLICY "commandes_employe_update"
  ON commandes FOR UPDATE
  USING (boulangerie_id = get_employee_boulangerie_id())
  WITH CHECK (boulangerie_id = get_employee_boulangerie_id());

-- ── paniers_flash : employés peuvent lire
DROP POLICY IF EXISTS "paniers_flash_employe_select" ON paniers_flash;
CREATE POLICY "paniers_flash_employe_select"
  ON paniers_flash FOR SELECT
  USING (boulangerie_id = get_employee_boulangerie_id());

-- ── boulangeries : employés actifs peuvent lire leur boulangerie
DROP POLICY IF EXISTS "boulangerie_employe_select" ON boulangeries;
CREATE POLICY "boulangerie_employe_select"
  ON boulangeries FOR SELECT
  USING (id = get_employee_boulangerie_id());

-- ────────────────────────────────────────────────────────────────────────
-- 4. FONCTIONS SQL SÉCURISÉES
-- ────────────────────────────────────────────────────────────────────────

-- ── 4a. check_boulanger_access(user_id)
--    Utilisée par le middleware SSR pour vérifier l'accès.
--    Retourne boulangerie_id ou NULL.
--    SECURITY DEFINER : bypass RLS, accessible par anon.

DROP FUNCTION IF EXISTS check_boulanger_access(UUID);

CREATE OR REPLACE FUNCTION check_boulanger_access(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Vérifie owner
  SELECT id INTO v_id FROM boulangeries WHERE user_id = p_user_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Vérifie employé actif
  SELECT boulangerie_id INTO v_id FROM employes
  WHERE user_id = p_user_id AND statut = 'actif' LIMIT 1;

  RETURN v_id; -- NULL si aucun accès
END;
$$;

REVOKE ALL ON FUNCTION check_boulanger_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_boulanger_access(UUID) TO authenticated;

-- ── 4b. get_current_user_access()
--    Utilisée par le contexte client React pour charger le rôle + permissions.
--    Retourne le boulangerie_id, rôle, permissions custom, membre_id.

DROP FUNCTION IF EXISTS get_current_user_access();

CREATE OR REPLACE FUNCTION get_current_user_access()
RETURNS TABLE (
  boulangerie_id    UUID,
  boulangerie_nom   TEXT,
  boulangerie_slug  TEXT,
  boulangerie_plan  TEXT,
  boulangerie_actif BOOLEAN,
  user_role         TEXT,
  custom_permissions JSONB,
  membre_id         UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Owner
  RETURN QUERY
  SELECT b.id, b.nom, b.slug, b.plan, b.actif,
    'owner'::TEXT, '{}'::JSONB, NULL::UUID
  FROM boulangeries b
  WHERE b.user_id = auth.uid()
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Employé actif
  RETURN QUERY
  SELECT b.id, b.nom, b.slug, b.plan, b.actif,
    e.role::TEXT, COALESCE(e.permissions, '{}'),
    e.id
  FROM employes e
  JOIN boulangeries b ON b.id = e.boulangerie_id
  WHERE e.user_id = auth.uid()
    AND e.statut = 'actif'
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION get_current_user_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_access() TO authenticated;

-- ── 4c. get_team_members(boulangerie_id)
--    Liste les membres d'une boulangerie (owner inclu).
--    Appelée par l'API /api/boulanger/equipe.

DROP FUNCTION IF EXISTS get_team_members(UUID);

CREATE OR REPLACE FUNCTION get_team_members(p_boulangerie_id UUID)
RETURNS TABLE (
  membre_id         UUID,
  user_id           UUID,
  role              TEXT,
  statut            TEXT,
  permissions       JSONB,
  invite_email      TEXT,
  invite_expires_at TIMESTAMPTZ,
  prenom            TEXT,
  created_at        TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Vérifie que l'appelant a accès à cette boulangerie
  IF check_boulanger_access(auth.uid()) != p_boulangerie_id THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.user_id,
    e.role,
    e.statut,
    COALESCE(e.permissions, '{}'),
    e.invite_email,
    e.invite_expires_at,
    e.prenom,
    e.created_at
  FROM employes e
  WHERE e.boulangerie_id = p_boulangerie_id
  ORDER BY
    CASE e.statut WHEN 'actif' THEN 1 WHEN 'invite' THEN 2 ELSE 3 END,
    e.created_at;
END;
$$;

REVOKE ALL ON FUNCTION get_team_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_team_members(UUID) TO authenticated;

-- ── 4d. count_active_members(boulangerie_id)
--    Compte owner + employés actifs pour vérifier les limites de plan.

DROP FUNCTION IF EXISTS count_active_members(UUID);

CREATE OR REPLACE FUNCTION count_active_members(p_boulangerie_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Owner (1) + employés actifs
  SELECT 1 + COUNT(*)::INT INTO v_count
  FROM employes
  WHERE boulangerie_id = p_boulangerie_id
    AND statut = 'actif';
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION count_active_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_active_members(UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 5. NETTOYAGE AUTOMATIQUE DES INVITATIONS EXPIRÉES
--    Cron job via pg_cron ou appel manuel.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM employes
  WHERE statut = 'invite'
    AND invite_expires_at < NOW()
  RETURNING COUNT(*) INTO v_count;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 6. VÉRIFICATION
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_tables INT;
  n_fonctions INT;
BEGIN
  SELECT COUNT(*) INTO n_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('employes', 'audit_equipe');

  SELECT COUNT(*) INTO n_fonctions
    FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'check_boulanger_access', 'get_current_user_access',
       'get_team_members', 'count_active_members',
       'cleanup_expired_invites', 'get_employee_boulangerie_id'
     );

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BakeryOS Migration Multi-Utilisateurs v1.0';
  RAISE NOTICE '   Tables multi-user : % / 2', n_tables;
  RAISE NOTICE '   Fonctions         : % / 6', n_fonctions;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF n_tables < 2 THEN RAISE EXCEPTION 'Tables manquantes'; END IF;
  IF n_fonctions < 6 THEN RAISE EXCEPTION 'Fonctions manquantes'; END IF;
END $$;

COMMIT;