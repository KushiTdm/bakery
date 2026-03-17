# Roadmap BakeryOS 🥖
*Mis à jour — 17 mars 2026 — Session multi-utilisateurs*

---

## SCORE DE RÉUSSITE À 12 MOIS — 78 / 100 *(+6 pts vs session précédente)*

| Dimension | Score | Poids | Commentaire |
|---|---|---|---|
| Développement | **88**/100 | 20% | ✅ S0 corrigé, B1 corrigé, E2 implémenté, multi-user complet |
| Fonctionnel | 82/100 | 20% | Core loop complet, paniers flash persistés, multi-user opérationnel |
| Marché | 55/100 | 15% | ~5 000–8 000 boulangeries cibles |
| Use case | 78/100 | 15% | ROI démontrable < 30 jours |
| Offre & Demande | 62/100 | 15% | Landing + Stripe opérationnels |
| Économique | 48/100 | 10% | Tarification à aligner landing ↔ app |
| Concurrence | 62/100 | 5% | Pas de concurrent direct sur le segment artisanal FR |

---

## ✅ CORRECTIONS APPLIQUÉES (17/03/2026)

### S0 — Accès non autorisé à `/boulanger` (🔴 CRITIQUE → ✅ CORRIGÉ)
- **`middleware.ts`** : Réécrit avec vérification SSR complète via `check_boulanger_access()`
- **`app/boulanger/page.tsx`** : Écran "Accès non autorisé" si `boulangerie === null` ou `userRole === null`
- **`context/boulanger-context.tsx`** : Utilise `get_current_user_access()` pour le multi-user
- **Testé** : Un client OTP est correctement redirigé vers `/` avec `error=unauthorized`

### B1 — Cast UUID unsafe dans `get_paniers_flash()` (🟠 ÉLEVÉ → ✅ CORRIGÉ)
- La fonction lit désormais depuis `paniers_flash` (source de vérité persistée)
- Plus de jointure avec cast UUID unsafe

### E2 — Pas de soft delete pour les produits (🟡 MOYEN → ✅ CORRIGÉ)
- Colonne `deleted_at TIMESTAMPTZ DEFAULT NULL` ajoutée dans `migration.sql`
- Index mis à jour pour exclure `WHERE deleted_at IS NULL`
- `get_catalogue_public()` filtre les produits softdeleted

### I4 — Colonnes adresse absentes (🔵 FAIBLE → ✅ CORRIGÉ)
- Colonnes `adresse`, `ville`, `code_postal`, `telephone`, `creneaux_retrait` dans CREATE TABLE

### 🆕 Multi-utilisateurs — Nouvelle fonctionnalité majeure
- Table `employes` (gérant + vendeur) avec système d'invitation
- Table `audit_equipe` pour l'historique des actions équipe
- Permissions granulaires par feature (10 permissions par rôle)
- Fonctions SQL : `check_boulanger_access()`, `get_current_user_access()`, `get_team_members()`, `count_active_members()`
- Routes API : `/api/boulanger/equipe`, `/api/boulanger/rejoindre`
- Interface adaptée avec filtrage par `canRead()` / `canWrite()`

---

## ARCHITECTURE GLOBALE — DEUX PROJETS

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

## ÉTAT DES FICHIERS MODIFIÉS

| Fichier | Changement | Priorité |
|---|---|---|
| `middleware.ts` | ✅ Protection SSR complète + multi-user | Critique |
| `app/boulanger/page.tsx` | ✅ Vérification boulangerie + écran d'accès refusé + permissions | Critique |
| `context/boulanger-context.tsx` | ✅ Multi-user (rôle, permissions, canRead/canWrite) | Critique |
| `lib/types.ts` | ✅ Types permissions + helpers | Élevé |
| `migrations/migration.sql` | ✅ Migration consolidée v3 (8 tables, soft delete, flash) | Infra |
| `migrations/Migration-Multi-Utilisateurs.sql` | ✅ Nouveau : tables employes + audit_equipe | Infra |
| `app/api/boulanger/equipe/route.ts` | ✅ Nouveau : gestion équipe | Feature |
| `app/api/boulanger/rejoindre/route.ts` | ✅ Nouveau : acceptation invitation | Feature |
| `audit-security.md` | ✅ Mis à jour — toutes vulnérabilités corrigées | Doc |
| `RBAC.md` | ✅ Mis à jour — implémentation complète | Doc |
| `roadmap.md` | ✅ Score mis à jour + multi-user | Doc |
| `user_metier.md` | ✅ État implémentation mis à jour | Doc |
| `erreurs.md` | ✅ Toutes corrections documentées | Doc |

---

## BUGS & VULNÉRABILITÉS — ÉTAT FINAL

### ✅ Tout résolu en critique/élevé

| ID | Projet | Description | Statut |
|---|---|---|---|
| **S0** | App | Accès non autorisé à /boulanger pour clients | ✅ **CORRIGÉ** |
| **B1** | App | Cast UUID unsafe dans `get_paniers_flash()` | ✅ **CORRIGÉ** |
| **E2** | App | Soft delete produits | ✅ **CORRIGÉ** |
| **I4** | App | Colonnes adresse absentes | ✅ **CORRIGÉ** |
| **LAND1** | Landing | Tarifs incohérents avec l'app | 🔴 Ouvert |

### 🟡 Moyen terme

| ID | Projet | Description | Statut |
|---|---|---|---|
| LAND2 | Landing | Email bienvenue post-checkout non implémenté | 🔴 Ouvert |
| LAND3 | Landing | Slug auto-généré peut créer des conflits | 🟡 Ouvert |
| CFG2 | App | SMTP custom Resend non configuré | 🟡 À configurer |
| E1 | App | Pas de pagination sur l'historique | 🟡 Ouvert (90 entrées OK) |
| I5 | App | ESLint ignoré pendant le build | 🔵 Accepté |

---

## COURT TERME — Prochaines étapes

### 🔴 Bloquant lancement
- [ ] **LAND1** — Décider et aligner les tarifs entre la landing et l'app (39/69/119€ vs 19/49/99€)
- [ ] **LAND4** — Créer les produits/prix dans Stripe Dashboard
- [ ] **LAND2** — Implémenter l'email de bienvenue post-checkout via Resend
- [ ] **CFG2** — Brancher Resend SMTP custom dans Supabase Dashboard
- [ ] Exécuter `migrations/migration.sql` en production (si pas déjà fait)
- [ ] Exécuter `migrations/Migration-Multi-Utilisateurs.sql` en production
- [ ] Tester flux complet end-to-end : landing → Stripe → webhook → app

### 🟠 Qualité
- [ ] **LAND3** — Gestion des conflits de slug à l'inscription
- [ ] Tests E2E (compte client OTP ne peut plus accéder à /boulanger)
- [ ] Tests multi-user : employé avec permissions limitées

---

## MOYEN TERME — 30 à 90 jours

### Produit
- Onboarding `CatalogueStarter` branché au flux post-inscription
- Export PDF rapport hebdomadaire (plan Pro)
- Rapport CO₂ mensuel + certificat téléchargeable
- Audit logging des actions sensibles (table `audit_equipe` prête)

### Infrastructure
- Wildcard DNS `*.bakeryos.fr` → Netlify
- Supabase Pro ($25/mois) dès 20 boulangers
- Monitoring Sentry sur les deux projets

### Acquisition
- Témoignages vidéo boulangers beta
- Programme referral : 2 mois offerts par boulangerie parrainée

---

## LONG TERME — 90+ jours

- ~~Multi-utilisateurs par boulangerie~~ ✅ **FAIT** (owner / manager / vendeuse)
- Intégration caisse Lightspeed/Zelty
- API publique + webhooks (plan Multi)
- Dashboard multi-sites consolidé
- Application mobile native (React Native)

---

## PROJECTION MRR À 12 MOIS

| Scénario | Clients | MRR | Probabilité |
|---|---|---|---|
| Pessimiste (solo, 0 budget) | 15–30 | 600–1 200€ | 25% |
| **Réaliste (referral + 1 salon)** | **40–80** | **1 600–3 100€** | **50%** |
| Optimiste (partenariat meunier) | 150–250 | 5 800–9 700€ | 25% |

---

## CHECKLIST AVANT MISE EN PRODUCTION

### ✅ Débloqué (corrections de cette session)
- [x] **S0** — Protection route `/boulanger` par vérification de rôle (middleware + client)
- [x] **B1** — Correction cast UUID dans `get_paniers_flash()`
- [x] **E2** — Soft delete produits (colonne `deleted_at`)
- [x] **I4** — Colonnes adresse dans CREATE TABLE
- [x] Migrations consolidées en fichiers distincts
- [x] Multi-utilisateurs complet (owner/gerant/employe)

### 🔴 Encore bloquant
- [ ] **LAND1** — Alignement tarifs landing ↔ app
- [ ] **LAND4** — Price IDs Stripe configurés (pas des placeholders)
- [ ] **CFG2** — SMTP Resend configuré dans Supabase

### 🟠 Recommandé avant lancement
- [ ] **LAND2** — Email bienvenue post-checkout
- [ ] Monitoring Sentry activé
- [ ] Tests E2E Playwright sur les flux critiques
- [ ] Tests permissions multi-user

---

## FICHIERS MIGRATION

| Fichier | Description | Ordre d'exécution |
|---|---|---|
| `migrations/migration.sql` | Migration principale v3 consolidée | 1 |
| `migrations/Migration-Multi-Utilisateurs.sql` | Tables employes + audit_equipe | 2 (après migration.sql) |
| `migrations/seed.sql` | Données de test | Optionnel |

---

*Mis à jour le 17/03/2026 — Session multi-utilisateurs complète*