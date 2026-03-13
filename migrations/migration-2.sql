-- migration-2.sql
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS migration-1.sql
-- Ajoute les colonnes Stripe manquantes référencées dans le webhook,
-- les colonnes chiffrées Airtable, et la fonction encrypt_text/decrypt_text.

-- ─── 1. Colonnes Stripe sur la table boulangeries ────────────────────────────
-- Ces colonnes sont lues/écrites dans app/api/stripe/webhook/route.tsx
-- et absentes de la migration initiale → le webhook crashait silencieusement.

ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_status          TEXT NOT NULL DEFAULT 'inactive';

-- Contrainte sur les valeurs autorisées (miroir des événements Stripe)
ALTER TABLE boulangeries
  DROP CONSTRAINT IF EXISTS chk_stripe_status;
ALTER TABLE boulangeries
  ADD CONSTRAINT chk_stripe_status CHECK (
    stripe_status IN ('inactive','trialing','active','past_due','canceled','unpaid')
  );

-- Index pour les lookups fréquents du webhook (customer.id → boulangerie)
CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_stripe_customer
  ON boulangeries(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─── 2. Colonnes chiffrées pour les clés Airtable ────────────────────────────
-- Référencées dans app/api/boulanger/profil/route.ts
-- Les clés en clair (airtable_api_key) peuvent rester le temps de la migration,
-- on les chiffre et on vide les colonnes en clair ensuite.

ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS airtable_api_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS airtable_base_id_enc TEXT;

-- ─── 3. Extension pgcrypto + fonctions chiffrement ───────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Chiffre un texte avec AES-256 via pgcrypto, retourne du base64
CREATE OR REPLACE FUNCTION encrypt_text(plaintext TEXT, secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN encode(
    pgp_sym_encrypt(plaintext, secret, 'cipher-algo=aes256'),
    'base64'
  );
END;
$$;

-- Déchiffre (usage serveur uniquement via service_role)
CREATE OR REPLACE FUNCTION decrypt_text(ciphertext TEXT, secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), secret);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- clé incorrecte ou données corrompues
END;
$$;

-- Seul le service_role peut appeler ces fonctions (pas le client anon/auth)
REVOKE ALL ON FUNCTION encrypt_text(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION decrypt_text(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION encrypt_text(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_text(TEXT, TEXT) TO service_role;

-- ─── 4. Vérification ─────────────────────────────────────────────────────────

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'boulangeries' AND table_schema = 'public'
ORDER BY ordinal_position;