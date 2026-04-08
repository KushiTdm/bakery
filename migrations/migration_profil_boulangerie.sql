-- Migration: Ajout des champs profil boulangerie pour l'onboarding et Levain IA
-- Ces champs permettent à l'IA de mieux comprendre le contexte de la boulangerie

-- Jours de fermeture hebdomadaires (ex: ['dimanche', 'lundi'])
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS jours_fermes TEXT[] DEFAULT '{}';

-- Type de clientele principale
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS type_clientele TEXT DEFAULT 'particulier'
  CHECK (type_clientele IN ('particulier', 'mixte', 'entreprise', 'touristique'));

-- Specialites de la boulangerie (ex: ['pain-au-levain', 'viennoiseries', 'sans-gluten'])
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS specialites TEXT[] DEFAULT '{}';

-- Horaires d'ouverture et fermeture
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS horaires_ouverture TEXT DEFAULT '06:00';
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS horaires_fermeture TEXT DEFAULT '19:00';

-- Objectifs / KPIs
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS objectif_ca_journalier DECIMAL DEFAULT NULL;
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS objectif_taux_vente INT DEFAULT NULL
  CHECK (objectif_taux_vente IS NULL OR (objectif_taux_vente >= 0 AND objectif_taux_vente <= 100));
