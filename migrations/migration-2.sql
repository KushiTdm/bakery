-- migration-2-fix.sql
-- Correction de l'erreur "cannot change return type of existing function"
-- À exécuter à la place de migration-2.sql si vous avez déjà une version
-- des fonctions encrypt_text/decrypt_text en base.

-- ─── 1. Colonnes Stripe ──────────────────────────────────────────────────────

ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_status          TEXT NOT NULL DEFAULT 'inactive';

ALTER TABLE boulangeries
  DROP CONSTRAINT IF EXISTS chk_stripe_status;
ALTER TABLE boulangeries
  ADD CONSTRAINT chk_stripe_status CHECK (
    stripe_status IN ('inactive','trialing','active','past_due','canceled','unpaid')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_boulangeries_stripe_customer
  ON boulangeries(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─── 2. Colonnes chiffrées Airtable ──────────────────────────────────────────

ALTER TABLE boulangeries
  ADD COLUMN IF NOT EXISTS airtable_api_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS airtable_base_id_enc TEXT;

-- ─── 3. Extension + fonctions chiffrement ────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- DROP obligatoire si la fonction existait avec un type de retour différent
DROP FUNCTION IF EXISTS encrypt_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS decrypt_text(TEXT, TEXT);

CREATE FUNCTION encrypt_text(plaintext TEXT, secret TEXT)
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

CREATE FUNCTION decrypt_text(ciphertext TEXT, secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), secret);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION encrypt_text(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION decrypt_text(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION encrypt_text(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_text(TEXT, TEXT) TO service_role;

-- ─── 4. Vérification ─────────────────────────────────────────────────────────

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'boulangeries' AND table_schema = 'public'
ORDER BY ordinal_position;