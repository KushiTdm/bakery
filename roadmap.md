# 🥖 BakeryOS — Roadmap & Plan de Mise en Production
*Version 4.0 — Mise à jour 22 mars 2026*

---

## Score de Maturité Produit — 91 / 100

| Dimension | Score | État | Commentaire |
|---|---|---|---|
| Core Produit & IA Levain | 97/100 | ✅ Complet | Workflow, briefings, prévisions, multi-user |
| Architecture & Sécurité | 85/100 | 🟠 Partiel | Headers HTTP, soft delete, magic bytes |
| Monétisation & Stripe | 20/100 | 🔴 Bloquant | Checkout absent, plans non facturés |
| Infrastructure Prod | 55/100 | 🟠 À compléter | DNS wildcard, monitoring, SMTP |
| Onboarding & UX | 88/100 | ✅ Solide | Tour guidé, wizard catalogue, CatalogueStarter |
| Feature Gate (plans) | 70/100 | 🟢 Corrigé | Quota Levain implémenté, filtrage Starter actif |
| Tests & Qualité | 0/100 | 🔴 Absent | 0% de coverage, aucun test automatisé |

---

## ✅ Corrections sécurité effectuées

- **P0-1** `confirm-email/route.ts` — fichier réécrit avec Zod, `timingSafeEqual`, montant recalculé serveur, RESEND_FROM_DOMAIN via env
- **P0-2** Rate limiting auth — `lib/rate-limit.ts` étendu avec `isAuthRateLimited()` / `resetAuthRateLimit()`, singleton Upstash, fallback mémoire, stores séparés par namespace. `auth/route.ts` migré, Map locale supprimée, body validé par Zod `discriminatedUnion`
- **P0-3** `INTERNAL_API_SECRET` — vérification longueur ≥ 32 + `timingSafeEqual()` dans `confirm-email/route.ts` ✅
- **P0-4** Feature Gate Levain — `check_and_increment_levain_quota()` atomique implémenté dans `/api/boulanger/ai/rapport`. Plan Starter : 1 rapport/semaine, score + verdict visibles, analyse complète masquée. Modal upgrade déclenchée sur quota atteint (HTTP 402). ✅
- **P1-6** Timezone `journee/route.ts` — `getTodayInTimezone(auth.timezone)` utilisé pour calculer la date correcte selon le timezone de la boulangerie. ✅

---

## 1. Corrections Sécurité Restantes

### 🟠 P1 — Importants (dans les 48h post-déploiement)

**P1-1 : Headers de sécurité HTTP absents**

`next.config.js` ne définit aucun header de sécurité. Risque : clickjacking, MIME sniffing, XSS.
- Ajouter : `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `CSP`, `Permissions-Policy`, `Strict-Transport-Security`

**P1-2 : Tokens de refresh non révoqués lors du logout**

`context/boulanger-context.tsx` → `logout()` sans scope. Un employé révoqué peut continuer à utiliser son refresh_token.
- Utiliser `supabase.auth.signOut({ scope: 'global' })`

**P1-3 : Soft delete non utilisé dans route DELETE produits**

`app/api/boulanger/produits/route.ts` fait un DELETE physique. Casse les `stocks_journaliers` historiques.
- Remplacer `DELETE` par `UPDATE { deleted_at: now(), actif_catalogue: false, actif_flash: false }`

**P1-4 : Validation payload taille manquante sur `/api/orders`**

Aucune vérification de `Content-Length`. Attaque DoS possible.
- Ajouter vérification `Content-Length < 50 000 bytes` en début de route

**P1-5 : Validation magic bytes upload absente**

`upload/route.ts` valide le MIME via `file.type` (client) sans vérifier les bytes réels.
- Valider les premiers octets du buffer contre signatures JPEG/PNG/WebP

### 🔵 P2 — Améliorations (sprint suivant)

- Export données RGPD (Art. 20) — route `GET /api/boulanger/export` manquante
- Table `audit_logs` générique (login, export, clôture, delete)
- Cron Supabase nettoyage invitations expirées (`pg_cron`)
- Timeout connexion Supabase admin (`AbortSignal.timeout(10_000)`)
- Origin validation sur `/api/orders` (protection CSRF basique)

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
| IA Levain (rapports) | 1/semaine ✅ implémenté | Illimité ✅ | Illimité ✅ |
| Membres équipe | 1 ✅ | 3 ✅ | Illimités ✅ |
| Historique stats | 30j ✅ | 90j 🟠 à implémenter | Illimité |
| Export CSV données | Non 🔴 à créer | Oui 🔴 à créer | Oui + API |

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

- **Export RGPD** (Art. 20 — obligation légale) : ZIP `journees.csv`, `stocks.csv`, `commandes.csv` depuis Paramètres
- **Rapport hebdomadaire Levain** : analyse des 7 derniers jours, score semaine, meilleur/pire jour
- **Dashboard gérant** : dernière connexion par employé, snapshot fait/non fait
- **Commandes récurrentes** : table `commandes_recurrentes` pour abonnements clients (baguettes chaque samedi)

### 3.3 Long Terme (> 6 semaines)

- API publique documentée (webhooks, intégration caisse)
- Dashboard multi-boulangeries consolidé (plan Multi)
- Intégration caisse SumUp/iZettle (import ventes auto)
- Application mobile native (iOS push natif)
- Programme ambassadeurs (code referral tracké)
- Rapport CO₂ mensuel + certificat (argument RSE)

---

## 4. Dette Technique

### 4.1 Auth Multi-User incomplète

Routes encore sur un auth helper local au lieu de `getBoulangerSession()`. Risque : employés accédant à des routes owner.

À migrer vers `getBoulangerSession()` + `canAccess()` :
- `app/api/boulanger/ai/appliquer/route.ts` — owner uniquement
- `app/api/boulanger/ai/historique/route.ts` — lecture seule employés
- `app/api/boulanger/flash/route.ts` — vérifier permission `flash`
- `app/api/boulanger/historique/route.ts` — vérifier permission `dashboard`
- `app/api/boulanger/commandes/route.ts` — vérifier permission `commandes`

### 4.2 Pagination manquante sur l'historique

`historique/route.ts` charge 90 jours × 30 produits = 2 700 rows en une requête.
- Paginer par tranches de 14 jours
- Lazy loading graphiques

### 4.3 0% de coverage tests

- Priorité 1 : E2E Playwright — register → clôture → rapport IA
- Priorité 2 : tests unitaires `lib/sanitize`, `lib/auth-boulanger`, `lib/rate-limit`
- Priorité 3 : tests permissions (employé ne peut pas accéder route owner)

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
| ~~Feature gate Levain (`/api/boulanger/ai/rapport`)~~ | ~~2h~~ | ✅ **Corrigé** |
| Headers sécurité HTTP (`next.config.js`) | 1h | 🟠 P1 |
| Logout scope global (`boulanger-context.tsx`) | 30 min | 🟠 P1 |
| Soft delete produits (route DELETE) | 30 min | 🟠 P1 |
| Content-Length check `/api/orders` | 30 min | 🟠 P1 |
| Magic bytes upload | 1h | 🟠 P1 |
| ~~Timezone `journee/route.ts`~~ | ~~1h~~ | ✅ **Corrigé** |
| Stripe Checkout + webhook + portal | 2 jours | 🔴 P0 Revenue |
| Modal upgrade in-app | 3h | 🟠 P1 |

**Durée estimée S1 : 2-3 jours** (réduit grâce aux corrections P0-4 et P1-6)

---

### 🌐 SEMAINE 2 — Infrastructure Prod

| Tâche | Durée | Priorité |
|---|---|---|
| Migrations SQL prod (v4 → v5 → ia → meteo) | 2h | 🔴 P0 |
| DNS wildcard `*.bakeryos.fr` → Netlify | 2h | 🔴 P0 |
| SMTP Resend dans Supabase Dashboard | 1h | 🔴 P0 |
| Notifications push commandes temps réel | 2h | 🟠 P1 |
| Email bienvenue post-inscription | 2h | 🟠 P1 |
| Page `/pricing` publique | 4h | 🟠 P1 |
| Sentry + alertes Supabase | 2h | 🟠 P1 |
| Migrer 5 routes vers `getBoulangerSession()` | 3h | 🟠 P1 |

**Durée estimée S2 : 4 jours**

---

### 🧪 SEMAINE 3 — Tests & Recrutement Beta

| Tâche | Durée | Priorité |
|---|---|---|
| Tests Playwright : register → clôture → rapport IA | 1 jour | 🟠 P1 |
| Tests unitaires `lib/sanitize`, `lib/auth-boulanger`, `lib/rate-limit` | 1 jour | 🔵 P2 |
| Export données RGPD (Art. 20) | 4h | 🟠 P1 (légal) |
| Revue permissions owner/gérant/employé | 1 jour | 🔴 P0 |
| Onboarding 5-10 boulangers beta | 1 jour | Business |
| Feedback (formulaire + appel 15min) | Continu | Business |

**Durée estimée S3 : 5 jours**

---

### 🚀 SEMAINES 4-6 — Itérations Beta

- Rapport hebdomadaire Levain
- Notifications push améliorées (résumé 7h, rappel retrait)
- Dashboard gérant
- Programme referral
- P2 : audit_logs, CSRF, cron invitations, timeout Supabase admin

---

### Résumé Timeline

| Phase | Durée | Milestone |
|---|---|---|
| S1 — Sécurité restante + Stripe | 4 jours | Paiements fonctionnels, Levain verrouillé |
| S2 — Infra Prod | 4 jours | Multi-tenant opérationnel, emails, monitoring |
| S3 — Tests + Beta 0 | 5 jours | 5-10 boulangers onboardés |
| S4-6 — Itérations | 3 semaines | Corrections retours, nouvelles features |
| 🏁 **Beta Publique** | **~5 semaines** | **Acquisition active, 20-30 payants ciblés** |

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

*Mis à jour le 22 mars 2026 — corrections P0-1, P0-2, P0-3, P0-4, P1-6 effectuées.*
