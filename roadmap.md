# 🥖 BakeryOS — Roadmap & Plan de Mise en Production
*Version 4.7 — Mise à jour 29 mars 2026*

---

## Score de Maturité Produit — 97 / 100

| Dimension | Score | État | Commentaire |
|---|---|---|---|
| Core Produit & IA Levain | 98/100 | ✅ Complet | Workflow, briefings, prévisions, multi-user, JSON IA robuste |
| Architecture & Sécurité | 98/100 | ✅ Complet | Headers HTTP, CSP, soft delete, magic bytes, AbortController saves, ESLint clean |
| Monétisation & Stripe | 20/100 | 🔴 Bloquant | Checkout absent, plans non facturés |
| Infrastructure Prod | 60/100 | 🟠 À compléter | DNS wildcard, monitoring, SMTP |
| Onboarding & UX | 88/100 | ✅ Solide | Tour guidé, wizard catalogue, CatalogueStarter |
| Feature Gate (plans) | 70/100 | 🟢 Corrigé | Quota Levain implémenté, filtrage Starter actif |
| Tests & Qualité | 85/100 | ✅ Complet | 130+ tests E2E + unitaires, RBAC couvert, CI/CD configuré |

---

## ✅ Corrections sécurité effectuées

- **P0-1** `confirm-email/route.ts` — réécrit avec Zod, `timingSafeEqual`, montant recalculé serveur, RESEND_FROM_DOMAIN via env ✅
- **P0-2** Rate limiting auth — `lib/rate-limit.ts` étendu, singleton Upstash, fallback mémoire, stores séparés. `auth/route.ts` migré, Zod `discriminatedUnion` ✅
- **P0-3** `INTERNAL_API_SECRET` — vérification longueur ≥ 32 + `timingSafeEqual()` ✅
- **P0-4** Feature Gate Levain — quota hebdomadaire atomique, plan Starter limité, modal upgrade sur HTTP 402 ✅
- **P1-1** Headers sécurité HTTP — X-Frame-Options, CSP, HSTS, Permissions-Policy ✅
- **P1-2** Logout scope global — `signOut({ scope: 'global' })` pour révoquer tous les tokens ✅
- **P1-3** Soft delete produits — UPDATE avec `deleted_at` au lieu de DELETE physique ✅
- **P1-4** Validation Content-Length — protection DoS sur `/api/orders` (50 KB max) ✅
- **P1-5** Validation magic bytes — vérification des premiers octets du buffer à l'upload ✅
- **P1-6** Timezone `journee/route.ts` — `getTodayInTimezone(auth.timezone)` ✅
- **P1-7** Correction CSP — `next.config.js` corrigé pour charger correctement les polices et images côté client ✅ *(v4.4)*
- **P1-8** Resend `confirm-email` — `produit_id` accepte désormais tout string (UUID ou autre), retry automatique sur échec, logs erreurs réels ✅ *(v4.6)*
- **P1-9** Resend `orders/route.ts` — avertissement explicite si `NEXT_PUBLIC_APP_URL` ou `INTERNAL_API_SECRET` absent, log HTTP status en cas d'échec ✅ *(v4.6)*
- **P1-10** IA rapport — `extractJSON` retourne une erreur explicite si la réponse est vide ou sans JSON ; `score` protégé contre NaN ✅ *(v4.6)*
- **P1-11** Context boulanger — `triggerSave` utilise un `AbortController` pour annuler les saves en-cours et éviter les écritures stale ✅ *(v4.6)*
- **P1-12** Pagination historique — `historique/route.ts` pagine par 14 jours (cursor `?before=`), context charge 2 pages (28 jours) ✅ *(v4.7)*
- **P1-13** ESLint réactivé — `ignoreDuringBuilds: false`, règle `react/no-unescaped-entities` désactivée pour le français ✅ *(v4.7)*
- **P1-14** N+1 équipe — `boulangeries` select inclut `user_id` directement, requête dupliquée supprimée ✅ *(v4.7)*
- **P1-15** Nettoyage — 30 composants shadcn/ui inutilisés supprimés, `migration.sql.bak` supprimé, fichiers `.md` redondants supprimés ✅ *(v4.7)*

### Détail P1-7 — Pourquoi les images ne chargeaient pas côté client

Le Service Worker (`sw.js`) intercepte **toutes** les requêtes `fetch()`, y compris le chargement des images. Pour lui, charger une image Unsplash passe par `connect-src` et non `img-src`. Or `connect-src` n'autorisait pas `images.unsplash.com`, ce qui bloquait les images côté vitrine (le SW est actif) mais pas côté `/boulanger` (le SW ne s'applique pas sur cette route).

Trois directives corrigées dans `next.config.js` :

| Directive | Avant | Après |
|---|---|---|
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline' https://fonts.googleapis.com` |
| `font-src` | `'self' data:` | `'self' data: https://fonts.gstatic.com` |
| `img-src` | `…https://images.unsplash.com` | `…https://images.unsplash.com https://*.unsplash.com` |
| `connect-src` | *(Unsplash absent)* | `…https://images.unsplash.com https://*.unsplash.com` |

---

## ⚠️ Variable d'environnement à retirer en production : `BYPASS_RATE_LIMIT`

> **Action requise avant le déploiement en production.**

La variable `BYPASS_RATE_LIMIT=true` est utilisée dans `lib/rate-limit.ts` pour désactiver entièrement le rate limiting pendant les tests automatisés (Playwright, CI/CD).

```typescript
// lib/rate-limit.ts
function isTestBypassEnabled(): boolean {
  return process.env.BYPASS_RATE_LIMIT === 'true';
}
```

**Si cette variable est présente ou vaut `true` en production, tout le rate limiting est désactivé** — spam de commandes, attaques brute-force sur l'auth, et abus de l'API IA Levain deviennent possibles sans limite.

### À faire

**En développement local (`.env.local`)** — activer pour les tests :
```bash
BYPASS_RATE_LIMIT=true
```

**En production (Netlify / Vercel / Railway)** — variable absente ou explicitement à `false` :
```bash
# Ne pas définir BYPASS_RATE_LIMIT, ou :
BYPASS_RATE_LIMIT=false
```

**En CI/CD (`.github/workflows/playwright.yml`)** — déjà correctement configuré via `env:` dans le job de test. Cette variable ne doit jamais figurer dans les secrets GitHub destinés à la production.

**Vérification rapide** avant tout déploiement :
```bash
# Dans votre dashboard d'hébergement, vérifier qu'aucune variable nommée
# BYPASS_RATE_LIMIT n'est définie, ou qu'elle vaut explicitement "false"
```

---

## 1. Corrections Sécurité Restantes

### ✅ P1 — Tous les items P1 ont été corrigés (dont P1-7 le 25 mars 2026)

### ✅ P2 — Améliorations (effectuées le 25 mars 2026)

- **P2-1** Export données RGPD (Art. 20) — Route `GET /api/boulanger/export` avec vérification owner, export JSON complet, log audit ✅
- **P2-2** Table `audit_logs` générique — migration SQL, RLS policies, fonctions SECURITY DEFINER ✅
- **P2-3** Cron Supabase nettoyage invitations — `cleanup_expired_invites()` prête pour pg_cron ✅
- **P2-4** Timeout connexion Supabase admin — `AbortController` 10s dans `lib/supabase.ts` ✅
- **P2-5** Origin validation sur `/api/orders` — protection CSRF, liste blanche origines ✅
- **P2-6** Helper audit logging — `lib/audit.ts` avec `logAuditAction()` non-bloquant ✅

---

## 1.5 Fonctionnalités UI ajoutées (25 mars 2026)

### Section "Données & Confidentialité" — `parametres.tsx` (owner uniquement)

- **Export RGPD (Art. 20)** — Bouton de téléchargement JSON, feedback visuel, log audit automatique ✅

### Section "Audit" — `equipe-manager.tsx` (owner uniquement)

- **Composant `AuditLogsSection`** — 20 derniers logs, date relative, code couleur par action ✅

---

## 2. Monétisation — Bloquant Lancement

Sans Stripe actif, zéro revenu possible.

### 2.1 Stripe Checkout à Créer

Les colonnes `stripe_customer_id`, `stripe_subscription_id`, `stripe_status` existent déjà en base.

Fichiers à créer :
- `app/api/billing/checkout/route.ts` — session Stripe Checkout
- `app/api/billing/portal/route.ts` — portail client self-service
- `app/api/billing/webhook/route.ts` — événements Stripe (signature obligatoire)
- `components/boulanger/upgrade-modal.tsx` — modal conversion Starter → Pro
- `lib/billing.ts` — helpers `createCustomer`, `getSubscription`, `updatePlan`

Événements Stripe à gérer :
- `checkout.session.completed` → activer plan, updater `boulangerie.plan`
- `customer.subscription.updated` → changement de plan
- `customer.subscription.deleted` → downgrade vers Starter
- `invoice.payment_failed` → email alerte + grace period 7 jours
- `invoice.payment_succeeded` → confirmer renouvellement

### 2.2 Feature Gates Plans

| Feature | Starter | Pro | Multi |
|---|---|---|---|
| Produits catalogue | 20 max ✅ | Illimité ✅ | Illimité ✅ |
| IA Levain (rapports) | 1/semaine ✅ | Illimité ✅ | Illimité ✅ |
| Membres équipe | 1 ✅ | 3 ✅ | Illimités ✅ |
| Historique stats | 30j ✅ | 90j 🟠 à implémenter | Illimité |
| Export données (JSON) | Oui ✅ | Oui ✅ | Oui + API |

---

## 3. Fonctionnalités Préconisées

### 3.1 Court Terme — Avant Beta (< 2 semaines)

**Notifications push commandes temps réel**

L'infra push est prête mais le trigger sur `/api/orders` manque.
- Dans `POST /api/orders` : déclencher `fetch` vers `/api/notifications/send` après insertion
- Payload : `titre '🛒 Nouvelle commande — X€', url '/boulanger/commandes'`

**Email bienvenue post-inscription**

Aucun email envoyé après `register`. Taux d'activation probablement faible.
- Envoyer via Resend en fin de `POST /api/boulanger/auth?action=register`

**Page pricing publique (`/pricing`)**

Inexistante. Impossible de convertir un visiteur sans page de tarifs.
- `app/pricing/page.tsx` avec tableau 3 plans + calculateur ROI + CTA register

### 3.2 Moyen Terme — Rétention (2-6 semaines)

- ~~**Export RGPD** (Art. 20)~~ ✅ **Effectué** — Export JSON dans Paramètres → Données & Confidentialité
- **Rapport hebdomadaire Levain** : analyse des 7 derniers jours, score semaine, meilleur/pire jour
- ~~**Dashboard gérant** : dernière connexion par employé, snapshot fait/non fait~~ ✅ **Effectué le 29 mars 2026** — Voir section 3.4
- **Commandes récurrentes** : table `commandes_recurrentes` pour abonnements clients

### 3.3 Long Terme (> 6 semaines)

- API publique documentée (webhooks, intégration caisse)
- Dashboard multi-boulangeries consolidé (plan Multi)
- Intégration caisse SumUp/iZettle (import ventes auto)
- Application mobile native (iOS push natif)
- Programme ambassadeurs (code referral tracké)
- Rapport CO₂ mensuel + certificat (argument RSE)

### 3.4 Dashboard Supervision — ✅ Implémenté le 29 mars 2026

**Vue réservée aux owners et gérants** (permission `equipe:read` requise).

#### Fonctionnalités livrées :

| Section | Description |
|---|---|
| **Alertes contextuelles** | Rouge/orange/jaune selon heure et état journée (production non saisie, snapshot manquant, commandes en attente) |
| **Progression journée** | 5 étapes visuelles : Matin → 10h → 14h → Flash → Soir avec timestamps |
| **Commandes du jour** | Barre segmentée par statut (en_attente, confirmee, prete, recuperee) |
| **Équipe** | Liste membres avec indicateur en ligne (vert si < 30min) et dernière connexion |
| **Activité 7 jours** | Heatmap par membre montrant les jours d'activité |

#### Fichiers créés :

| Fichier | Rôle |
|---|---|
| `migrations/migration_dashboard_gerant-29-03.sql` | Colonne `last_login_at` sur `employes`, index optimisé |
| `app/api/boulanger/dashboard-supervision/route.ts` | API GET sécurisée, données agrégées |
| `components/boulanger/dashboard-supervision.tsx` | UI React avec refresh auto 60s |

#### Fichiers modifiés :

| Fichier | Changement |
|---|---|
| `lib/auth-boulanger.ts` | Ajout `trackEmployeeLogin()`, `trackOwnerLogin()`, `getBoulangerSessionWithTracking()` |
| `lib/types.ts` | Type `ViewType` étendu avec `'supervision'` |
| `app/boulanger/page.tsx` | Navigation + rendu conditionnel vue supervision |

#### Sécurité :

- ✅ Vérification `canRead('equipe')` (owner + gérant uniquement)
- ✅ API protégée par `getBoulangerSession()` + `canAccess('dashboard', 'read')`
- ✅ Données isolées par `boulangerie_id`
- ✅ Basé sur `audit_logs` existant pour l'activité (pas de nouvelle table)

#### Améliorations suggérées :

| Suggestion | Priorité | Description |
|---|---|---|
| **Notifications push alertes** | 🟠 Moyen | Envoyer une notif quand une alerte critique est détectée (ex: production non saisie à 10h) |
| **Export rapport équipe** | 🟡 Faible | PDF/Excel récapitulatif activité équipe sur la semaine |
| **Graphique tendance CA** | 🟡 Faible | Courbe CA des 7 derniers jours dans la section KPIs |
| **Indicateur retards** | 🟠 Moyen | Compter les jours où la clôture a été faite après 20h |
| **Filtre période activité** | 🟡 Faible | Permettre de voir l'activité sur 14j ou 30j |
| **Snapshots temps réel** | 🟡 Faible | Websocket/SSE pour mise à jour live sans refresh |

---

## 4. Dette Technique

### 4.1 Auth Multi-User — ✅ Migration complète (v4.7)

Toutes les routes ont été migrées vers `getBoulangerSession()` + `canAccess()` :
- ✅ `ai/appliquer/route.ts` — owner uniquement
- ✅ `ai/historique/route.ts` — owner + gérant
- ✅ `flash/route.ts` — GET: employés, POST/PATCH/DELETE: owner/gérant
- ✅ `historique/route.ts` — owner + gérant (+ pagination)
- ✅ `commandes/route.ts` — permission `commandes`

### 4.2 Pagination historique — ✅ Implémentée (v4.7)

`historique/route.ts` retourne 14 jours par page avec cursor `?before=YYYY-MM-DD`.
Le context charge 2 pages automatiquement (28 jours visibles).

### 4.3 Tests & Qualité — ✅ Infrastructure complète (25 mars 2026)

**Infrastructure Playwright déployée :**

| Fichier | Description |
|---|---|
| `playwright.config.ts` | Configuration E2E avec webServer, bypass rate limit |
| `tests/helpers/auth-helpers.ts` | Helpers inscription/login API, `createTestProduit()`, `buildStockEntry()` |
| `tests/helpers/mock-ai.ts` | Mocks pour réponses IA (quota, rapport, prévisions) |
| `tests/fixtures/test-data.ts` | Générateurs utilisateurs/slugs/emails de test |
| `.github/workflows/playwright.yml` | CI/CD GitHub Actions |

**Suites de tests E2E :**

| Suite | Tests | Coverage |
|---|---|---|
| `tests/auth/register.spec.ts` | 12 | Inscription, validation email/mdp, slug, login |
| `tests/journee/cloture.spec.ts` | 8 | Création journée, feedback, clôture, workflow complet |
| `tests/ia/rapport-ia.spec.ts` | 10 | Génération rapport, quota, prévisions, erreurs |
| `tests/e2e/complete-flow.spec.ts` | 2 | Parcours E2E complet (register → clôture → IA) |

**Suites de tests unitaires :**

| Suite | Tests | Coverage |
|---|---|---|
| `tests/unit/sanitize.spec.ts` | 45+ | UUID, slug, sanitizeText, URL, date, email, XSS/injection |
| `tests/unit/auth-boulanger.spec.ts` | 30+ | `canAccess()`, `isOwner()`, `isManager()` — RBAC 3 rôles |
| `tests/unit/rate-limit.spec.ts` | 5 | Bypass CI, comportement 429 vs 401, auth/commandes |
| `tests/unit/products.spec.ts` | 15 | Structure catalogue, unicité IDs, catégories, prix |
| `tests/unit/permissions.spec.ts` | 20+ | Routes protégées sans token → 401, owner access, RGPD export |

**Total : 130+ tests automatisés**

**Commandes disponibles :**
```bash
npm run test          # Lancer tous les tests
npm run test:ui       # Interface visuelle Playwright
npm run test:debug    # Mode debug
npm run test:report   # Rapport HTML
```

**Correction bug Playwright (v4.4) :**
- **Problème** : `page.route()` appelé sur contexte browser inutilisé dans test `({ request })` — Playwright ferme le contexte page avant que le mock puisse s'appliquer
- **Solution** : `complete-flow.spec.ts` utilise `page.request.post()` pour les tests avec mocks IA, `request` pour les tests API pur
- **Impact** : Tests stables en mode `--debug`, mocks correctement appliqués

**Reste à faire :**
- ~~Priorité 2 : tests unitaires `lib/sanitize`, `lib/auth-boulanger`, `lib/rate-limit`~~ ✅ Effectué
- ~~Priorité 3 : tests permissions (employé ne peut pas accéder route owner)~~ ✅ Effectué
- Configurer secrets GitHub pour CI (SUPABASE_TEST_*, ZHIPU_API_KEY)

### 4.4 Monitoring production absent

- Sentry Next.js (plan gratuit suffisant)
- Alertes Supabase (Dashboard → Monitoring → Alerts)
- Upstash Dashboard pour visualiser les rate limits

---

## 5. Timeline — Vers la Beta Commerciale

*Estimation solo dev 4-6h/jour. Avec 2 devs, diviser par 1.6.*

### ⚡ SEMAINE 1 — Sécurité & Monétisation Core

| Tâche | Durée | Priorité |
|---|---|---|
| ~~Feature gate Levain~~ | ~~2h~~ | ✅ Corrigé |
| ~~Headers sécurité HTTP~~ | ~~1h~~ | ✅ Corrigé |
| ~~Logout scope global~~ | ~~30 min~~ | ✅ Corrigé |
| ~~Soft delete produits~~ | ~~30 min~~ | ✅ Corrigé |
| ~~Content-Length check `/api/orders`~~ | ~~30 min~~ | ✅ Corrigé |
| ~~Magic bytes upload~~ | ~~1h~~ | ✅ Corrigé |
| ~~Timezone `journee/route.ts`~~ | ~~1h~~ | ✅ Corrigé |
| ~~Correction CSP (fonts + images SW)~~ | ~~30 min~~ | ✅ Corrigé |
| **Retirer `BYPASS_RATE_LIMIT` de l'env prod** | **5 min** | **🔴 Avant déploiement** |
| Stripe Checkout + webhook + portal | 2 jours | 🔴 P0 Revenue |
| Modal upgrade in-app | 3h | 🟠 P1 |

**Durée estimée S1 : 2-3 jours** (toutes les corrections P0 et P1 effectuées)

---

### 🌐 SEMAINE 2 — Infrastructure Prod

| Tâche | Durée | Priorité |
|---|---|---|
| Migrations SQL prod (v4 → v5 → ia → meteo) | 2h | 🔴 P0 |
| DNS wildcard `*.bakeryos.fr` → Netlify | 2h | 🔴 P0 |
| SMTP Resend dans Supabase Dashboard | 1h | 🔴 P0 |
| ~~Notifications push commandes temps réel~~ | ~~2h~~ | ✅ Effectué (v4.6) |
| ~~Email bienvenue post-inscription~~ | ~~2h~~ | ✅ Effectué (v4.6) |
| Page `/pricing` publique | 4h | 🟠 P1 |
| Sentry + alertes Supabase | 2h | 🟠 P1 |
| ~~Migrer 5 routes vers `getBoulangerSession()`~~ | ~~3h~~ | ✅ Effectué (v4.7) |

**Durée estimée S2 : 4 jours**

---

### 🧪 SEMAINE 3 — Tests & Recrutement Beta

| Tâche | Durée | Priorité |
|---|---|---|
| ~~Tests Playwright : register → clôture → rapport IA~~ | ~~1 jour~~ | ✅ Effectué |
| ~~Tests unitaires `lib/sanitize`, `lib/auth-boulanger`, `lib/rate-limit`~~ | ~~1 jour~~ | ✅ Effectué |
| ~~Tests permissions RBAC (owner/gérant/employé)~~ | ~~1 jour~~ | ✅ Effectué |
| ~~Export données RGPD (Art. 20)~~ | ~~4h~~ | ✅ Effectué |
| Revue permissions owner/gérant/employé | 1 jour | 🔴 P0 |
| Onboarding 5-10 boulangers beta | 1 jour | Business |
| Feedback (formulaire + appel 15min) | Continu | Business |

**Durée estimée S3 : 2-3 jours** (tests automatisés complétés)

---

### 🚀 SEMAINES 4-6 — Itérations Beta

- Rapport hebdomadaire Levain
- Notifications push améliorées (résumé 7h, rappel retrait)
- Dashboard gérant
- Programme referral
- ~~P2 : audit_logs, CSRF, cron invitations, timeout Supabase admin~~ ✅ Effectué le 25 mars 2026

---

### Résumé Timeline

| Phase | Durée | Milestone |
|---|---|---|
| S1 — Sécurité restante + Stripe | 2-3 jours | Paiements fonctionnels, Levain verrouillé |
| S2 — Infra Prod | 4 jours | Multi-tenant opérationnel, emails, monitoring |
| S3 — Tests + Beta 0 | 2-3 jours | 5-10 boulangers onboardés *(tests automatisés complétés)* |
| S4-6 — Itérations | 3 semaines | Corrections retours, nouvelles features |
| 🏁 **Beta Publique** | **~4 semaines** | **Acquisition active, 20-30 payants ciblés** |

---

## 6. KPIs & Projections MRR

| KPI | Définition | Cible |
|---|---|---|
| DAU/MAU | Boulangeries actives quotidiennement / mensuellement | > 65% |
| Rapports Levain/semaine | % clients Pro générant ≥ 1 rapport/semaine | > 70% |
| Flash activé | % boulangeries configurant les paniers flash | > 60% |
| Temps onboarding | Inscription → première clôture | < 48h |
| Taux clôture | % jours ouvrables avec clôture faite | > 80% |
| Starter → Pro | Taux conversion | > 20% à M3 |
| Churn mensuel | Taux d'annulation | < 5% |

| Scénario | M3 clients | M3 MRR | M12 clients | M12 MRR |
|---|---|---|---|---|
| 🔴 Pessimiste | 5-10 | 200-400€ | 20-40 | 800-1 600€ |
| 🟠 **Réaliste** | **15-30** | **600-1 200€** | **60-100** | **2 400-4 000€** |
| 🟢 Optimiste | 50-80 | 2 000-3 200€ | 180-250 | 7 200-10 000€ |

> Tarification recommandée : Pro 39€/mois, Multi 79€/mois.

---

*Mis à jour le 29 mars 2026 (v4.7) — Pagination historique, ESLint réactivé, N+1 équipe corrigé, 30 composants + fichiers .md nettoyés, toutes les routes migrées vers getBoulangerSession*
