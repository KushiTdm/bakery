-- migration-3-push-notifications.sql
-- ─────────────────────────────────────────────────────────────
-- Crée la table push_subscriptions pour les notifications PWA.
-- À exécuter dans Supabase > SQL Editor.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id UUID NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT,
  auth_key       TEXT,
  subscription   JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes par boulangerie
CREATE INDEX IF NOT EXISTS push_subscriptions_boulangerie_id_idx
  ON push_subscriptions(boulangerie_id);

-- Index pour requêtes par user
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions(user_id);

-- RLS : seulement le service role peut lire/écrire toutes les souscriptions.
-- Le user peut lire/supprimer les siennes.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON push_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "User can upsert own subscription"
  ON push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User can delete own subscription"
  ON push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-mise à jour du updated_at
CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_push_subscription_timestamp();