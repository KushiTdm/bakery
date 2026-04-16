-- migrations/add-ia-cost-tracking.sql
-- Tracking granulaire des tokens et coûts IA par rapport

ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS tokens_input  integer;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS tokens_output integer;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS cout_usd      numeric(10,6);

COMMENT ON COLUMN ai_rapports.tokens_input  IS 'Tokens du prompt envoyé au LLM';
COMMENT ON COLUMN ai_rapports.tokens_output IS 'Tokens générés par le LLM';
COMMENT ON COLUMN ai_rapports.cout_usd      IS 'Coût estimé en USD selon le modèle utilisé';

-- Vue agrégée pour dashboard SaaS owner
CREATE OR REPLACE VIEW admin_ia_metrics AS
SELECT
  DATE(created_at AT TIME ZONE 'Europe/Paris') AS jour,
  COUNT(*)                                      AS nb_rapports,
  SUM(tokens_input)                             AS total_tokens_input,
  SUM(tokens_output)                            AS total_tokens_output,
  COALESCE(SUM(tokens_utilises), 0)             AS total_tokens,
  SUM(cout_usd)                                 AS cout_total_usd,
  AVG(cout_usd)                                 AS cout_moyen_usd,
  modele_ia
FROM ai_rapports
WHERE statut = 'genere'
GROUP BY DATE(created_at AT TIME ZONE 'Europe/Paris'), modele_ia
ORDER BY jour DESC;
