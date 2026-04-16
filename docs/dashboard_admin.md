# Dashboard Admin SaaS — Plan d'implémentation

## Objectif

Tableau de bord accessible uniquement au propriétaire du SaaS (rôle `super_admin`).
Visualiser inscriptions, abonnements actifs, utilisation IA et coûts à travers toutes les boulangeries.

## Protection

Route protégée par `session.role === 'super_admin'` côté API.  
Page Next.js `/app/admin/page.tsx` avec middleware de vérification de rôle.

## Pages et sections

### 1. Vue Globale

- Boulangeries actives / total
- Nouvelles inscriptions (7j, 30j)
- Distribution des plans (Starter / Pro / Multi)
- Churns du mois

### 2. Coûts IA

- Coût total aujourd'hui / ce mois / projection fin mois
- Nombre de rapports générés
- Tokens moyens input/output
- Coût moyen par rapport
- Graphique évolution quotidienne (30 jours)

**Source de données :** vue `admin_ia_metrics` (créée dans migration `add-ia-cost-tracking.sql`)

### 3. Abonnements

- Liste des abonnements actifs avec plan, date, CA mensuel
- Intégration Stripe (future) : MRR, factures, churns

### 4. Détail Boulangeries

- Liste triable : nom, ville, plan, dernière activité, nombre de rapports ce mois
- Alertes : boulangeries sans activité depuis > 7 jours

## Routes API à créer

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/admin/metrics` | GET | Métriques agrégées depuis `admin_ia_metrics` |
| `/api/admin/boulangeries` | GET | Liste boulangeries avec stats |
| `/api/admin/subscriptions` | GET | Abonnements actifs |

Toutes les routes vérifient `session.role === 'super_admin'`.

## Composants UI

- `components/admin/MetricsCard.tsx` — carte stat avec icône + valeur + tendance
- `components/admin/CostChart.tsx` — graphique Recharts évolution coûts IA
- `components/admin/BoulangeriTable.tsx` — tableau triable

## Stack technique

Next.js App Router, Recharts (déjà dans le projet), Supabase admin client (`supabaseAdmin`).

## Ordre d'implémentation recommandé

1. Routes API `/api/admin/*` avec protection `super_admin`
2. Page `/app/admin/page.tsx` minimaliste (stats textuelles)
3. Ajout des graphiques Recharts
4. Intégration Stripe (future — après validation MVP)
