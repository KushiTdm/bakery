# Levain IA — Documentation Technique

## Pipeline

```
Données brutes (Supabase)
  → computeProductionSuggestions() [lib/ai-production-compute.ts]
  → buildUserPrompt() [lib/ai-anonymize.ts]  ~2 500 tokens input
  → LLM z.ai (GLM-4.7-FlashX quotidien / GLM-4.5-Air hebdo)
  → parseJSON + validation [route.ts]
  → upsert ai_rapports + production_forecasts [Supabase]
```

## Modèles utilisés

| Usage | Modèle | Coût/appel* |
|-------|--------|-------------|
| Rapport quotidien | GLM-4.7-FlashX | ~$0.001 |
| Rapport hebdo/mensuel | GLM-4.5-Air | ~$0.003 |

*Basé sur ~2 500 tokens input + ~2 000 tokens output après optimisation v2.

Variables d'env : `ZHIPU_MODEL_DAILY`, `ZHIPU_MODEL_WEEKLY`

## Format prompt (v2 — compact)

System prompt : ~400 tokens (rôle, règles absolues, format JSON attendu)  
User prompt : ~2 500 tokens (contexte, produits, suggestions algorithme, historique résumé)

## Format réponse JSON attendu

Voir `buildSystemPrompt()` dans `lib/ai-anonymize.ts` pour le format complet.

Sections clés :
- `previsions_production[]` : `quantite_suggeree` (entier absolu), `produit_id` (UUID), `raison`
- `briefing_matin` : résumé pour le boulanger à l'ouverture
- `score` : 0-100, `verdict` : ≤15 mots

## Tracking des coûts

Colonnes sur `ai_rapports` (ajoutées en migration 2026-04-16) :
- `tokens_input` — tokens du prompt envoyé
- `tokens_output` — tokens générés
- `cout_usd` — coût estimé en USD selon le modèle

Vue agrégée pour dashboard SaaS owner : `admin_ia_metrics`

## Historique des versions

| Version | Date | Tokens avant | Tokens après | Changement |
|---------|------|-------------|-------------|-----------|
| v1 | avant 2026-04 | ~9 750 | — | Prompt verbeux, calculs côté LLM |
| v2 | 2026-04-16 | ~9 750 | ~4 500 | Prompt compact + pré-calcul serveur (`computeProductionSuggestions`) |
