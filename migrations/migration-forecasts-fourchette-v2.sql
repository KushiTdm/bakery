-- migration-forecasts-fourchette.sql
ALTER TABLE production_forecasts ADD COLUMN IF NOT EXISTS quantite_min INT DEFAULT NULL;
ALTER TABLE production_forecasts ADD COLUMN IF NOT EXISTS quantite_max INT DEFAULT NULL;