-- ═══════════════════════════════════════════════════════════════════════
-- FIX TEMPORAIRE — fenêtre flash 24h pour tester depuis Bogotá
-- À annuler une fois rentré en France avec le UPDATE en bas
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Ouvre le flash toute la journée (0h–24h) pour tester
UPDATE boulangeries
SET
  flash_heure_debut = 0,
  flash_heure_fin   = 24
WHERE actif = TRUE;

-- Vérification
SELECT slug, flash_heure_debut, flash_heure_fin
FROM boulangeries WHERE actif = TRUE;

-- Test immédiat
SELECT get_paniers_flash('artisan-dore');

-- ═══════════════════════════════════════════════════════════════════════
-- QUAND VOUS RENTREZ EN FRANCE — remettre les horaires normaux
-- ═══════════════════════════════════════════════════════════════════════
/*
UPDATE boulangeries
SET
  flash_heure_debut = 18,
  flash_heure_fin   = 23
WHERE actif = TRUE;
*/