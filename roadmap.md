# Roadmap BakeryOS 🥖
*Mis à jour — 22 mars 2026 — Analyse complète du codebase*

---

## SCORE DE RÉUSSITE À 12 MOIS — 85 / 100 *(+7 pts vs session précédente)*

| Dimension | Score | Poids | Commentaire |
|---|---|---|---|
| Développement | **94**/100 | 20% | ✅ IA Levain complète, météo, workflow 7 étapes, multi-user, GPS |
| Fonctionnel | 88/100 | 20% | Core loop complet, briefing matin IA, prévisions production J+1 |
| Marché | 55/100 | 15% | ~5 000–8 000 boulangeries cibles |
| Use case | 82/100 | 15% | ROI démontrable < 30 jours, assistant IA opérationnel |
| Offre & Demande | 62/100 | 15% | Landing + Stripe opérationnels |
| Économique | 48/100 | 10% | Tarification à aligner landing ↔ app |
| Concurrence | 62/100 | 5% | Pas de concurrent direct sur le segment artisanal FR |

---

## ✅ FONCTIONNALITÉS IMPLÉMENTÉES

### 🤖 IA Levain — Assistant Boulanger (NOUVEAU)
- **Rapport quotidien** avec score de performance (0-100)
- **Briefing matin** pour J+1 avec :
  - Contexte du jour et impact météo
  - Top 3 des produits à produire
  - Points de vigilance
  - Conseil d'ouverture
- **Prévisions de production** par produit avec variation %
- **Analyse contextuelle** (succès, flops, opportunités)
- **Alertes ingrédients** et matières premières
- **Application en 1 clic** du plan de production
- Modèle : GLM-4-Flash (z.ai) — RGPD conforme (données anonymisées)

### 🌤️ Météo Journalière (NOUVEAU)
- Table `meteo_journees` avec données du jour + prévisions J+1
- Coordonnées GPS par boulangerie (`latitude`, `longitude`)
- Intégration Open-Meteo (gratuit, sans API key)
- Impact météo sur les ventes analysé par l'IA

### 📋 Workflow Journée — 7 Étapes Chronologiques
| Étape | Rôle | Déblocage | Description |
|---|---|---|---|
| Production matin | Boulanger | Ouverture | Quantités par fournée et catégorie |
| Snapshot 10h | Vendeur | 9h | Stock en rayon |
| Sandwichs midi | Both | 11h | Déduit du stock pain |
| Snapshot 14h | Vendeur | 13h | Stock en rayon |
| Paniers flash | Both | 17h | Anti-gaspi |
| Invendus soir | Vendeur | 17h | Comptage fermeture |
| Clôture | Both | Après inventaire | Rapport Levain |

### 👥 Multi-utilisateurs (implémenté)
- **Rôles** : Owner / Gérant / Employé
- **Permissions granulaires** (10 permissions par rôle)
- **Système d'invitation** par email avec token
- **Audit trail** dans `audit_equipe`
- Fonctions SQL : `check_boulanger_access()`, `get_current_user_access()`, `get_team_members()`

### 🔒 Sécurité
- **Middleware SSR** avec vérification `check_boulanger_access()`
- **RLS** activé sur toutes les tables
- **Soft delete** produits (colonne `deleted_at`)
- **Cast UUID sécurisé** dans les jointures
- **Timezone configurable** par boulangerie

### 📱 Notifications Push
- API `/api/notifications/subscribe/` et `/api/notifications/send/`
- Composant `push-notification-toggle.tsx`
- Compatible VAPID (Web Push)

---

## ARCHITECTURE GLOBALE

```
bakery-saas-landing/          bakery-app/ (project-boulangerie)
─────────────────────         ────────────────────────────────
Next.js 16 / React 19         Next.js 13 / React 18
Tailwind 4                    Tailwind 3 + Framer Motion
Stripe (abonnements)          Supabase (auth, DB, storage)
                              Netlify (hébergement)
                              *.bakeryos.fr (multi-tenant)
```

---

## FICHIERS MIGRATION (à jour)

| Fichier | Description | Ordre |
|---|---|---|
| `migrations/migration-v4.sql` | Consolidée : 10 tables, multi-user, soft delete, flash, timezone | 1 |
| `migrations/migration-v5.sql` | Catégorie sandwich + workflow + feedback vendeuse | 2 |
| `migrations/migration-ia-glm_zai.sql` | Tables `ai_rapports` + `production_forecasts` | 3 |
| `migrations/migration-meteo-timezone.sql` | Table `meteo_journees` + GPS | 4 |
| `migrations/seed.sql` | Données de test | Optionnel |

---

## ROUTES API IMPLÉMENTÉES

### Boulanger (authentifié)
| Route | Méthode | Description |
|---|---|---|
| `/api/boulanger/auth` | POST | Authentification |
| `/api/boulanger/profil` | GET/PUT | Profil boulangerie |
| `/api/boulanger/produits` | CRUD | Gestion catalogue |
| `/api/boulanger/produits/upload` | POST | Upload photo produit |
| `/api/boulanger/commandes` | GET | Liste commandes |
| `/api/boulanger/flash` | GET/POST | Paniers flash |
| `/api/boulanger/journee` | GET/POST | État journée |
| `/api/boulanger/journee/feedback` | POST | Feedback vendeuse |
| `/api/boulanger/historique` | GET | Historique journées |
| `/api/boulanger/equipe` | GET/POST | Gestion équipe |
| `/api/boulanger/equipe/[id]` | PUT/DELETE | Membre équipe |
| `/api/boulanger/rejoindre` | POST | Acceptation invitation |
| `/api/boulanger/ai/rapport` | GET/POST | Rapport IA Levain |
| `/api/boulanger/ai/historique` | GET | Historique rapports |
| `/api/boulanger/ai/appliquer` | POST | Appliquer prévisions |
| `/api/boulanger/ai/today` | GET | Rapport du jour |

### Public
| Route | Méthode | Description |
|---|---|---|
| `/api/boulangerie/[slug]` | GET | Infos boulangerie |
| `/api/catalogue/[slug]` | GET | Catalogue public |
| `/api/paniers/[slug]` | GET | Paniers flash publics |
| `/api/orders` | POST | Créer commande |
| `/api/orders/[id]` | GET | Détail commande |
| `/api/orders/confirm-email` | POST | Confirmation email |

### Client (authentifié OTP)
| Route | Méthode | Description |
|---|---|---|
| `/api/client/profil` | GET/PUT | Profil client |
| `/api/client/commandes` | GET | Commandes client |
| `/api/client/commandes/[id]` | GET | Détail commande |

### Notifications
| Route | Méthode | Description |
|---|---|---|
| `/api/notifications/subscribe` | POST | Subscribe push |
| `/api/notifications/send` | POST | Envoyer notification |

---

## COMPOSANTS BOULANGER

| Composant | Description |
|---|---|
| `dashboard.tsx` | Tableau de bord principal |
| `vue-matin.tsx` | Saisie production matin |
| `vue-snapshot.tsx` | Snapshots 10h/14h |
| `vue-sandwichs.tsx` | Sandwichs & snacking |
| `vue-flash.tsx` | Paniers anti-gaspi |
| `vue-soir.tsx` | Clôture journée |
| `vue-rapport-ia.tsx` | Rapport Levain + briefing |
| `catalogue.tsx` | Gestion catalogue |
| `catalogue-starter.tsx` | Onboarding catalogue |
| `equipe-manager.tsx` | Gestion équipe |
| `parametres.tsx` | Paramètres boulangerie |
| `feedback-vendeuse.tsx` | Retour vendeuse |
| `fin-journee-modal.tsx` | Modal clôture |
| `tour-wizard.tsx` | Tour guidé |
| `workflow-guard.tsx` | Guard étapes workflow |
| `day-countdown.tsx` | Compte à rebours |

---

## BUGS & VULNÉRABILITÉS — ÉTAT ACTUEL

### ✅ Tout résolu en critique/élevé

| ID | Projet | Description | Statut |
|---|---|---|---|
| **S0** | App | Accès non autorisé à /boulanger | ✅ **CORRIGÉ** |
| **B1** | App | Cast UUID unsafe | ✅ **CORRIGÉ** |
| **E2** | App | Soft delete produits | ✅ **CORRIGÉ** |
| **I4** | App | Colonnes adresse absentes | ✅ **CORRIGÉ** |

### 🟡 À traiter

| ID | Projet | Description | Priorité |
|---|---|---|---|
| LAND1 | Landing | Tarifs incohérents landing ↔ app | 🔴 Bloquant |
| LAND2 | Landing | Email bienvenue post-checkout | 🟡 Moyen |
| LAND3 | Landing | Conflits de slug possibles | 🟡 Moyen |
| LAND4 | Landing | Price IDs Stripe à configurer | 🔴 Bloquant |
| CFG2 | App | SMTP Resend à configurer | 🟡 Moyen |
| E1 | App | Pas de pagination historique | 🔵 Faible |

---

## COURT TERME — Prochaines étapes

### 🔴 Bloquant lancement
- [ ] **LAND1** — Aligner tarifs landing ↔ app (39/69/119€ vs 19/49/99€)
- [ ] **LAND4** — Créer produits/prix dans Stripe Dashboard
- [ ] **LAND2** — Implémenter email bienvenue post-checkout via Resend
- [ ] **CFG2** — Configurer SMTP Resend dans Supabase Dashboard
- [ ] Exécuter les migrations en production (v4 → v5 → ia → meteo)
- [ ] Tester flux complet : landing → Stripe → webhook → app

### 🟠 Qualité
- [ ] **LAND3** — Gestion des conflits de slug
- [ ] Tests E2E Playwright sur flux critiques
- [ ] Tests permissions multi-user
- [ ] Monitoring Sentry

---

## MOYEN TERME — 30 à 90 jours

### Produit
- [ ] Export PDF rapport hebdomadaire (plan Pro)
- [ ] Rapport CO₂ mensuel + certificat téléchargeable
- [ ] Gestion stock matières premières (base présente dans IA)

### Infrastructure
- [ ] Wildcard DNS `*.bakeryos.fr` → Netlify
- [ ] Supabase Pro ($25/mois) dès 20 boulangers
- [ ] Monitoring Sentry

### Acquisition
- [ ] Témoignages vidéo boulangers beta
- [ ] Programme referral : 2 mois offerts par parrainage

---

## LONG TERME — 90+ jours

- [x] ~~Multi-utilisateurs par boulangerie~~ ✅ **FAIT**
- [x] ~~IA pour rapports et prévisions~~ ✅ **FAIT** (Levain)
- [x] ~~Workflow journée chronologique~~ ✅ **FAIT**
- [x] ~~Météo et impact ventes~~ ✅ **FAIT**
- [ ] Intégration caisse Lightspeed/Zelty
- [ ] API publique + webhooks (plan Multi)
- [ ] Dashboard multi-sites consolidé
- [ ] Application mobile native (React Native)

---

## PROJECTION MRR À 12 MOIS

| Scénario | Clients | MRR | Probabilité |
|---|---|---|---|
| Pessimiste (solo, 0 budget) | 15–30 | 600–1 200€ | 25% |
| **Réaliste (referral + 1 salon)** | **40–80** | **1 600–3 100€** | **50%** |
| Optimiste (partenariat meunier) | 150–250 | 5 800–9 700€ | 25% |

---

## CHECKLIST AVANT MISE EN PRODUCTION

### ✅ Implémenté
- [x] Protection route `/boulanger` (middleware + client)
- [x] Multi-utilisateurs complet (owner/gerant/employe)
- [x] Soft delete produits
- [x] Colonnes adresse + GPS
- [x] Timezone configurable
- [x] Workflow journée 7 étapes
- [x] IA Levain (rapports + briefing + prévisions)
- [x] Météo journalière + prévisions J+1
- [x] Notifications push
- [x] Tour guidé
- [x] Paniers flash persistés
- [x] Catalogue public
- [x] Espace client OTP

### 🔴 Encore bloquant
- [ ] Alignement tarifs landing ↔ app
- [ ] Price IDs Stripe configurés
- [ ] SMTP Resend configuré

### 🟠 Recommandé
- [ ] Email bienvenue post-checkout
- [ ] Monitoring Sentry
- [ ] Tests E2E

---

## BASE DE DONNÉES — SCHÉMA COMPLET

### Tables principales (10)
| Table | Description |
|---|---|
| `boulangeries` | Boulangeries avec timezone, GPS, Stripe |
| `journees` | Journées avec workflow state |
| `stocks_journaliers` | Stocks par produit et journée |
| `produits` | Catalogue (soft delete, saisonnalité) |
| `commandes` | Commandes clients |
| `paniers_flash` | Paniers anti-gaspi du jour |
| `employes` | Équipe (rôles, permissions) |
| `audit_equipe` | Historique actions équipe |
| `profils_clients` | Profils clients OTP |
| `push_subscriptions` | Abonnements push |

### Tables IA & Météo (3)
| Table | Description |
|---|---|
| `ai_rapports` | Rapports Levain (JSON structuré) |
| `production_forecasts` | Prévisions par produit |
| `meteo_journees` | Météo du jour + prévisions J+1 |

---

*Mis à jour le 22/03/2026 — Analyse complète du codebase*