# 🧪 BakeryOS — Documentation des Tests

> Générée le 27 mars 2026  
> Framework : Playwright  
> Commande globale : `npx playwright test`

---

## 📋 Commandes

```bash
# Tous les tests
npx playwright test

# Par fichier
npx playwright test tests/auth/tenant-isolation.spec.ts
npx playwright test tests/auth/register.spec.ts
npx playwright test tests/unit/auth-boulanger.spec.ts
npx playwright test tests/unit/sanitize.spec.ts
npx playwright test tests/unit/products.spec.ts
npx playwright test tests/unit/rate-limit.spec.ts
npx playwright test tests/unit/permissions.spec.ts
npx playwright test tests/journee/cloture.spec.ts
npx playwright test tests/ia/rapport-ia.spec.ts
npx playwright test tests/e2e/complete-flow.spec.ts

# Avec reporter lisible
npx playwright test --reporter=list

# Un seul test par nom
npx playwright test -g "Employé de A ne voit pas les produits de B"

# Mode debug
npx playwright test --debug

# Uniquement les tests qui ont échoué
npx playwright test --last-failed
```

---

## 🗂️ Résumé par fichier

| Fichier | Nb tests | État | Priorité correction |
|---------|----------|------|---------------------|
| `tests/auth/tenant-isolation.spec.ts` | 17 | ❌ 3 échecs / ✅ 14 OK | 🔴 P0 |
| `tests/unit/auth-boulanger.spec.ts` | ~20 | ✅ OK | — |
| `tests/unit/sanitize.spec.ts` | ~35 | ✅ OK | — |
| `tests/unit/products.spec.ts` | ~10 | ✅ OK | — |
| `tests/unit/rate-limit.spec.ts` | ~6 | ✅ OK | — |
| `tests/unit/permissions.spec.ts` | ~20 | ✅ OK | — |
| `tests/auth/register.spec.ts` | ~10 | ✅ OK | — |
| `tests/journee/cloture.spec.ts` | ~8 | ✅ OK | — |
| `tests/ia/rapport-ia.spec.ts` | ~8 | ✅ OK | — |
| `tests/e2e/complete-flow.spec.ts` | 2 | ✅ OK | — |

---

## ✅ Ce qui fonctionne bien

### `tests/auth/tenant-isolation.spec.ts` — Isolation multi-tenant (14/17)

**Ce que ça vérifie :** Le boulanger A ne peut jamais accéder aux données du boulanger B.  
Deux boulangeries distinctes sont créées, et chaque route est testée avec le token du mauvais tenant.

```
✅ A ne voit que sa propre journée (pas celle de B)         GET /api/boulanger/journee
✅ Historique de A ne contient pas les journées de B        GET /api/boulanger/historique
✅ A ne peut pas clôturer la journée de B                   PUT /api/boulanger/journee
✅ A ne peut pas soumettre un feedback sur la journée de B  POST /api/boulanger/journee/feedback
✅ A ne peut pas récupérer le rapport IA de B               GET /api/boulanger/ai/rapport
✅ A ne peut pas déclencher la génération du rapport IA de B POST /api/boulanger/ai/rapport
✅ A ne peut pas lire l'historique IA de B                  GET /api/boulanger/ai/historique
✅ A ne peut pas récupérer les prévisions IA de B           GET /api/boulanger/ai/appliquer
✅ A ne peut pas modifier un produit de B (PATCH)           PATCH /api/boulanger/produits
✅ A ne peut pas supprimer un produit de B (DELETE)         DELETE /api/boulanger/produits
✅ A ne voit que ses propres produits (GET)                  GET /api/boulanger/produits
✅ A ne voit pas les commandes de B                         GET /api/boulanger/commandes
✅ A ne peut pas changer le statut d'une commande de B      PATCH /api/orders/:id
✅ Employé de A ne peut pas lire le rapport IA de B         GET /api/boulanger/ai/rapport
```

---

### `tests/unit/auth-boulanger.spec.ts` — Permissions RBAC

**Ce que ça vérifie :** Les fonctions pures `canAccess()`, `isOwner()`, `isManager()` retournent les bonnes valeurs pour chaque rôle.

```
✅ isOwner()    → true pour owner, false pour gérant/employé/null
✅ isManager()  → true pour owner+gérant, false pour employé/null
✅ canAccess()  → owner peut tout écrire partout
✅ canAccess()  → gérant peut écrire les features métier, lire l'équipe, pas accès plan
✅ canAccess()  → employé peut snapshot+commandes en write, catalogue+flash en read
✅ canAccess()  → employé ne peut pas accéder à matin, dashboard, parametres, equipe, plan
✅ Hiérarchie  → write satisfait read, read ne satisfait pas write, none ≠ read
✅ null session → toujours false
```

---

### `tests/unit/sanitize.spec.ts` — Fonctions de sanitisation

**Ce que ça vérifie :** Toutes les fonctions de `lib/sanitize.ts` rejettent les entrées dangereuses et normalisent correctement.

```
✅ isValidUUID      → valide UUID v4, rejette null/undefined/formats invalides
✅ assertUUID       → retourne le UUID ou lève une erreur avec nom du champ
✅ isValidSlug      → valide slugs, rejette slugs réservés (api, admin, www, boulanger...)
✅ sanitizeText     → trim, normalise espaces, supprime chars de contrôle, respecte maxLength
✅ sanitizeEmoji    → tronque à 4 chars, fallback '🥖' si vide
✅ sanitizeUrl      → accepte http/https, rejette data:, javascript:, ftp:, file:
✅ sanitizeDate     → valide YYYY-MM-DD, rejette dates invalides (30 février)
✅ normalizeEmail   → lowercase + trim
✅ sanitizeStringArray → déduplique, filtre vides, filtre valeurs non autorisées
```

---

### `tests/unit/products.spec.ts` — Catalogue produits

**Ce que ça vérifie :** L'intégrité du catalogue statique `lib/products.ts`.

```
✅ Catalogue non vide
✅ Chaque produit a : id, name, category valide, description, price > 0, image URL
✅ IDs uniques, noms uniques
✅ Prix entre 0.50€ et 50€
✅ Catégories 'all', 'boulangerie', 'viennoiserie', 'patisserie' présentes
✅ Au moins 1 produit par catégorie
✅ Baguette et croissant existent dans les bonnes catégories
✅ Images = URLs Unsplash avec paramètre ?w=800
```

---

### `tests/unit/rate-limit.spec.ts` — Rate limiting

**Ce que ça vérifie :** Le bypass `BYPASS_RATE_LIMIT=true` (activé en test via `playwright.config.ts`) empêche les 429 pendant les tests.

```
✅ 6 requêtes GET publiques → jamais 429 (bypass actif)
✅ 6 tentatives login échouées → 401, jamais 429 (bypass actif)
✅ POST /api/orders → jamais 429 (bypass actif)
✅ Structure réponse 429 correcte si jamais atteint (Retry-After header présent)
```

> ⚠️ Ces tests ne valident pas le rate limiting en production — ils vérifient seulement que les tests ne s'auto-bloquent pas.

---

### `tests/unit/permissions.spec.ts` — Contrôle d'accès API

**Ce que ça vérifie :** Les routes API retournent 401 sans token, et les routes owner fonctionnent avec un token valide.

```
✅ 15 routes protégées → 401 sans Authorization header
✅ Token malformé → 401
✅ Token JWT valide mais mauvaise clé → 401
✅ Owner peut lire ses produits → 200 + array
✅ Owner peut lire son équipe → 200 + {members, owner}
✅ Owner peut exporter ses données RGPD → 200 + JSON téléchargeable
✅ Owner peut inviter un membre → 201 ou 403 plan limit (jamais 401/500)
✅ Email invalide sur invite → 400 ou 403 plan limit
✅ Rôle invalide sur invite → 400 ou 403 plan limit
✅ Routes commandes, flash, profil → accessibles avec token owner
```

---

### `tests/auth/register.spec.ts` — Inscription / Login

**Ce que ça vérifie :** Les règles de validation à l'inscription et la connexion.

```
✅ Inscription valide → access_token + refresh_token + boulangerie (plan: starter)
✅ Email invalide → 400 + message "invalide"
✅ Mot de passe < 8 chars → 400 + message "8 caractères"
✅ Mot de passe sans majuscule → 400 + message "majuscule"
✅ Mot de passe sans chiffre → 400 + message "chiffre"
✅ Slug déjà utilisé → 409 + message "slug"
✅ Slug réservé → 400 + message "slug"
✅ Slug format invalide (majuscules) → 400 + message "slug"
✅ Login après inscription → access_token valide
✅ Mauvais mot de passe → 401
✅ Utilisateur inexistant → 401
```

---

### `tests/journee/cloture.spec.ts` — Workflow journée

**Ce que ça vérifie :** La création, le feedback et la clôture de journée.

```
✅ POST journée avec stocks valides → { success: true, journee_id }
✅ Feedback avec journee_id réel → { success: true, feedback }
✅ Feedback avec événement spécial → has_evenement: true sauvegardé
✅ Feedback sans auth → 401
✅ Feedback avec journee_id invalide → 4xx
✅ PUT journée (clôture) → { success: true } + journee.cloturee = true
✅ Double clôture → idempotent (pas de 500)
✅ Parcours complet : création → feedback → clôture → état final vérifié
```

---

### `tests/ia/rapport-ia.spec.ts` — Rapport IA Levain

**Ce que ça vérifie :** La génération et la lecture du rapport IA (avec mocks pour éviter les appels z.ai).

```
✅ POST rapport (mock) → 200/503 (mock retourne 200, vrai retourne 503 sans clé)
✅ GET rapport (mock) → 200 + quota_info présent
✅ POST rapport quota atteint (mock 402) → quota_reached: true, upgrade_required: true
✅ GET rapport plan starter (mock) → starter_preview: true, previsions: []
✅ POST rapport sans production (sans mock) → 400 ou 503 (attendu)
✅ POST rapport sans auth → 401
✅ GET rapport pour demain (sans données) → 200 avec rapport: null
✅ Structure prévisions → produit_id et quantite_suggeree définis
✅ POST appliquer prévisions (mock) → 200/404
```

> ℹ️ Les mocks s'appliquent via `page.route()` uniquement aux requêtes initiées depuis le navigateur (`page.evaluate()`). Les requêtes directes (`request.*`) contournent les mocks.

---

### `tests/e2e/complete-flow.spec.ts` — Flux E2E complet

**Ce que ça vérifie :** Le parcours complet d'un boulanger de l'inscription à la clôture.

```
✅ Inscription → token + boulangerie créée
✅ Création 2 produits (baguette + croissant) → UUIDs réels
✅ Saisie production matin → journee_id créé
✅ Feedback fin de journée → sauvegardé
✅ Clôture → journee.cloturee = true
✅ Génération rapport IA (mock) → 200/400/503 selon env
✅ Application prévisions (mock) → 200/404
✅ Reconnexion après tout → token valide

✅ Flux minimal : inscription + login → access_token valide
```

---

## ❌ Ce qui échoue (3 tests)

### `tests/auth/tenant-isolation.spec.ts` — Groupe "Employé de A vs données de B"

#### Test 14 — `❌ Employé de A ne voit pas les produits de B`
```
GET /api/boulanger/produits avec token employé
→ Attendu : res.ok() = true (200) + produits sans ceux de B
→ Reçu    : res.ok() = false (probablement 401)
```
**Cause :** `getOwnerBoulangerieId()` dans `produits/route.ts` cherche uniquement dans `boulangeries WHERE user_id = uid`. Un token employé n'est pas owner → 401.

---

#### Test 15 — `❌ Employé de A ne voit pas les commandes de B`
```
GET /api/boulanger/commandes avec token employé
→ Attendu : res.ok() = true (200) + commandes sans celles de B
→ Reçu    : res.ok() = false (probablement 401)
```
**Cause :** `getBoulangerieId()` dans `commandes/route.ts` cherche uniquement dans `boulangeries WHERE user_id = uid`. Un token employé → 401.

---

#### Test 16 — `❌ Employé de A ne peut pas modifier un produit de B`
```
PATCH /api/boulanger/produits avec token employé sur produit de B
→ Attendu : status ∈ [403, 404]
→ Reçu    : status = 401
```
**Cause :** Même problème. L'employé reçoit 401 au lieu de 403 (pas les droits catalogue write) ou 404 (produit hors tenant). Le 401 signifie que l'employé n'est même pas reconnu comme authentifié.

---

### Correction à apporter

Les helpers d'auth locaux dans `produits/route.ts` et `commandes/route.ts` doivent être remplacés par `getBoulangerSession()` de `lib/auth-boulanger.ts`, qui gère déjà les employés actifs via la table `employes`.

**Fichiers à modifier :**
- `app/api/boulanger/produits/route.ts` — remplacer `getOwnerBoulangerieId()` par `getBoulangerSession()`
- `app/api/boulanger/commandes/route.ts` — remplacer `getBoulangerieId()` par `getBoulangerSession()`

**Attention pour `produits/route.ts` :**  
Les mutations (POST, PATCH, DELETE) doivent rester réservées aux owners (et éventuellement gérants avec permission `catalogue: write`). Seul le GET doit être accessible aux employés avec permission `catalogue: read`.

**Fichiers à partager pour la correction complète :**
- `lib/auth-boulanger.ts` — pour voir `getBoulangerSession()` et `canAccess()`
- `tests/auth/tenant-isolation.spec.ts` — pour voir comment `employeeResult` est construit

---

## 🔧 Variables d'environnement requises pour les tests

```env
# Supabase (base de test — peut être la même qu'en dev)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Désactive le rate limiting pendant les tests
BYPASS_RATE_LIMIT=true

# IA (non requise — les tests mockent les appels z.ai)
# ZHIPU_API_KEY=  ← sans clé → tests IA retournent 503 (attendu)

# Notifications (non requises pour les tests)
# INTERNAL_API_SECRET=
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
```

---

## 📊 Couverture par domaine

| Domaine | Couvert | Manquant |
|---------|---------|----------|
| Auth (inscription/login) | ✅ Complet | Reset password |
| Multi-tenant isolation | ✅ Complet | — |
| Permissions RBAC | ✅ Logique pure | Tests E2E employé réel |
| Workflow journée | ✅ Complet | Snapshots 10h/14h séparés |
| Rapport IA | ✅ Avec mocks | Tests sans mock (nécessite clé z.ai) |
| Paniers flash | ⚠️ Partiel | POST/PATCH/DELETE flash |
| Commandes client | ⚠️ Partiel | Création + annulation côté client |
| Upload photos | ❌ Non couvert | POST upload + magic bytes |
| Notifications push | ❌ Non couvert | Subscribe/unsubscribe |
| Export RGPD | ✅ Accès vérifié | Contenu du ZIP |
| Stripe/billing | ❌ Non couvert | Non implémenté |