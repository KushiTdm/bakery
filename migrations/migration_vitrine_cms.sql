-- migration_vitrine_cms.sql
-- ─────────────────────────────────────────────────────────────
-- CMS Vitrine : colonnes personnalisation page d'accueil
-- ─────────────────────────────────────────────────────────────

-- ── 1. Colonnes vitrine sur boulangeries ─────────────────────

ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_accroche          TEXT CHECK (length(vitrine_accroche) <= 120);
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_sous_titre        TEXT CHECK (length(vitrine_sous_titre) <= 200);
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_hero_image_url    TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_hero_storage_path TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_about_image_url   TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_about_storage_path TEXT;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_histoire          TEXT CHECK (length(vitrine_histoire) <= 800);
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_badge_label       TEXT CHECK (length(vitrine_badge_label) <= 60);
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS vitrine_horaires          JSONB DEFAULT '[
  {"day": "Lundi — Vendredi", "hours": "6h30 – 20h00"},
  {"day": "Samedi", "hours": "7h00 – 20h00"},
  {"day": "Dimanche", "hours": "7h00 – 13h00"}
]'::jsonb;

-- ── 2. Bucket Storage vitrine-images ─────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vitrine-images',
  'vitrine-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Politique RLS pour vitrine-images ─────────────────────

-- Lecture publique (les images vitrine sont affichées sur la page publique)
DROP POLICY IF EXISTS "vitrine_images_public_read" ON storage.objects;
CREATE POLICY "vitrine_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vitrine-images');

-- Upload/update réservé au propriétaire de la boulangerie (via service role côté API)
-- Les uploads passent par la route API qui vérifie l'ownership,
-- donc pas besoin de policy INSERT/UPDATE côté RLS pour les utilisateurs finaux.
-- Le service_role bypass RLS par défaut.
