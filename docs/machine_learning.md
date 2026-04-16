# Machine Learning — Plan Phase B

## Vision

Remplacer le LLM pour les prédictions de quantités par un modèle XGBoost léger par produit.
Le LLM reste pour les narratifs et l'analyse qualitative (rapports hebdo/mensuel).

**Phase A (actuelle)** : LLM reçoit les quantités pré-calculées côté serveur → valide et rédige  
**Phase B (cible)** : XGBoost prédit les quantités → LLM rédige uniquement les narratifs

## Données à collecter DÈS MAINTENANT

### Features (variables d'entrée)

| Feature | Source | Status |
|---------|--------|--------|
| `jour_semaine` (1-7) | `journees.jour_semaine` | ✅ Collecté |
| `temp_max_c` | météo demain | ✅ Collecté |
| `precip_mm` | météo demain | ✅ Collecté |
| `code_meteo` | météo demain | ✅ Collecté |
| `est_vacances` | calculé | À ajouter à `journees` |
| `est_ferie` | calculé | À ajouter à `journees` |
| `cycle_salarial` | calculé (1=début, 2=milieu, 3=fin) | À ajouter |
| `snapshot_10h_pct` | `stocks_journaliers.snapshot_10h / production` | À calculer |
| `snapshot_14h_pct` | `stocks_journaliers.snapshot_14h / production` | À calculer |
| `ca_j7` | `journees.ca_estime` J-7 | Accessible |
| `invendu_moy_4sem` | calculé | À matérialiser |

### Target (variable cible)

| Target | Calcul |
|--------|--------|
| `stock_final_reel` | `stocks_journaliers.stock_final` (ground truth = invendus réels) |

## Architecture du modèle

```
Phase B :
  XGBoost par produit (ou par cluster de produits similaires)
  + LLM pour narratif/conseil uniquement

Entrées XGBoost : features ci-dessus
Sortie XGBoost  : quantite_suggeree, quantite_min, quantite_max

LLM reçoit : chiffres XGBoost + contexte → génère texte uniquement
```

## Clustering des boulangeries

Pour éviter un modèle par boulangerie (trop peu de données individuelles), regrouper par profil :

| Cluster | Profil | Critères |
|---------|--------|----------|
| A | Urbaine dynamique | CA > 800€/j, clientèle dense |
| B | Boulangerie de quartier | CA 400-800€/j, fidèles |
| C | Péri-urbain/rural | CA < 400€/j, saisonnalité forte |
| D | Centre commercial | Forte variance week-end |

Algorithme : K-means sur `(ca_moyen, invendu_moy, variance_semaine)`

## Métriques de déclenchement Phase B

Switcher du LLM au ML quand :
- ≥ 90 jours de données par boulangerie
- MAE (Mean Absolute Error) du modèle < 15% sur validation croisée
- Performance cluster ≥ performance LLM sur 30 jours glissants

## Plan d'implémentation

1. **Collecte (maintenant → mois 3)** — S'assurer que tous les snapshots (10h, 14h) sont saisis. Ajouter `est_vacances`, `est_ferie`, `cycle_salarial` à la table `journees`.
2. **Feature engineering (mois 3-4)** — Script Python/Node de calcul des features agrégées, export CSV par cluster.
3. **Modèle pilote (mois 4-6)** — XGBoost sur cluster A (20+ boulangeries), évaluation vs LLM actuel.
4. **Déploiement progressif (mois 6+)** — A/B test sur 10% des boulangeries, monitoring MAE en continu.
5. **Transition complète** — LLM uniquement pour rapports hebdo/mensuel stratégiques.
