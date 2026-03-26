ATTENTION : CONSIGNE A RESPECTER SCRUPULEUSEMENT : Verifie tous les fichiers avant de coder. Assure toi de ne pas reecrire "from scratch" des fichiers deja existants au risque d'oubler des fonctionnalités. Assure toi de me donner pour chaque fichier, le path où l'inserer. Si tu n'as pas le fichier, demande le moi. Si tu n'es pas sur qu'il existe, demande le moi.


Instructions importantes :

Demande moi les fichiers à controler, modifier ou juste ceux dont tu as besoin en contexte.

Ne code pas from scratch.

Quand tu apportes des corrections sur un fichier, pour plus de clarté et eviter les erreurs, transmets moi le fichier complet.

---

# 🧪 Tests Playwright — Corrections et Améliorations

*Analyse du 25 mars 2026 — 27/31 tests passent*

---

## 🔴 Corrections à apporter (tests en échec)

### 1. Timeout test E2E complet — `tests/e2e/complete-flow.spec.ts`

**Problème :** Le test E2E complet timeout après 30s sur l'appel API IA.

**Cause :** L'appel réel à l'API Zhipu AI peut prendre plus de 30 secondes.

**Solution :** Augmenter le timeout spécifique à ce test ou utiliser un mock pour l'IA.

```typescript
// Dans tests/e2e/complete-flow.spec.ts, ligne 22
test('🔄 Parcours complet : Inscription → Production → Clôture → Rapport IA', async ({ page, request }) => {
  test.setTimeout(60000); // ✅ Ajouter un timeout de 60s
  // ... reste du test
});
```

**Alternative :** Mock l'API IA dans le test E2E comme dans `rapport-ia.spec.ts`.

---

### 2. Mocks IA non interceptés — `tests/ia/rapport-ia.spec.ts`

**Problème :** Les tests avec mocks échouent car `page.route()` n'intercepte pas correctement les requêtes.

**Cause probable :** Le mock attend un certain statut mais l'API retourne un autre statut.

**Test concerné :** `✅ Générer un rapport IA (mock)` — attend `400` dans `[200, 201, 503]`

**Solution :** Corriger les attentes de statut HTTP dans les tests mockés.

```typescript
// tests/ia/rapport-ia.spec.ts, ligne 59
// ❌ Avant
expect([200, 201, 503]).toContain(res.status());

// ✅ Après — le mock devrait retourner 200 ou 201
expect([200, 201]).toContain(res.status());
```

---

### 3. Test UI skippé — `tests/auth/register.spec.ts`

**Problème :** Le test `📋 Formulaire visible sur /boulanger` est skippé.

**Cause :** Nécessite un navigateur visuel, pas juste API.

**Solution :** Ce test nécessite d'être exécuté avec un navigateur headful ou d'utiliser `page.goto()` correctement.

---

## 🟡 Améliorations à implémenter

### 1. Configurer les secrets GitHub pour CI

Les tests en CI nécessitent ces secrets dans GitHub Actions :

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role (pour tests admin) |
| `ZHIPU_API_KEY` | Clé API Zhipu (optionnel pour tests IA réels) |

**Fichier :** `.github/workflows/playwright.yml`

```yaml
env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  BYPASS_RATE_LIMIT: 'true'
```

---

### 2. Ajouter un teardown pour nettoyer les données de test

**Problème :** Les tests créent des utilisateurs/boulangeries qui restent en base.

**Solution :** Créer `tests/helpers/teardown.ts` avec une fonction de nettoyage.

```typescript
// tests/helpers/teardown.ts
export async function cleanupTestData(
  supabase: SupabaseClient,
  boulangerieId: string
) {
  await supabase.from('stocks_journaliers').delete().eq('boulangerie_id', boulangerieId);
  await supabase.from('journees').delete().eq('boulangerie_id', boulangerieId);
  await supabase.from('produits').delete().eq('boulangerie_id', boulangerieId);
  await supabase.from('boulangeries').delete().eq('id', boulangerieId);
}
```

---

### 3. Tests unitaires à ajouter

Les modules critiques sans tests unitaires :

| Module | Priorité | Fichier à créer |
|--------|----------|-----------------|
| `lib/sanitize.ts` | Haute | `tests/unit/sanitize.spec.ts` |
| `lib/auth-boulanger.ts` | Haute | `tests/unit/auth-boulanger.spec.ts` |
| `lib/rate-limit.ts` | Moyenne | `tests/unit/rate-limit.spec.ts` |
| `lib/products.ts` | Basse | `tests/unit/products.spec.ts` |

---

### 4. Ajouter des tests de permissions RBAC

**Problème :** Aucun test vérifie qu'un employé ne peut pas accéder aux routes owner.

**Test à créer :** `tests/auth/permissions.spec.ts`

```typescript
test.describe('Permissions RBAC', () => {
  test('❌ Employé ne peut pas accéder à /api/boulanger/equipe', async ({ request }) => {
    // Créer un employé, vérifier qu'il ne peut pas accéder aux routes owner
  });
  
  test('❌ Employé ne peut pas modifier le plan', async ({ request }) => {
    // ...
  });
});
```

---

## ✅ Corrections déjà appliquées

| Correction | Fichier | Date |
|------------|---------|------|
| Rate limiting bypass | `playwright.config.ts` | 25/03/2026 |
| `response.ok()` méthode | `tests/helpers/auth-helpers.ts` | 25/03/2026 |
| `buildStockEntry()` helper | `tests/helpers/auth-helpers.ts` | 25/03/2026 |
| `createTestProduit()` helper | `tests/helpers/auth-helpers.ts` | 25/03/2026 |
| Tests alignés sur vraies routes API | `tests/journee/cloture.spec.ts` | 25/03/2026 |
| Distinction mock/réel (`page.request` vs `request`) | `tests/ia/rapport-ia.spec.ts` | 25/03/2026 |

---

## 📊 État actuel des tests

| Suite | Tests | Passés | Échoués | Skipped |
|-------|-------|--------|---------|---------|
| `auth/register.spec.ts` | 12 | 11 | 0 | 1 |
| `journee/cloture.spec.ts` | 8 | 8 | 0 | 0 |
| `ia/rapport-ia.spec.ts` | 10 | 7 | 3 | 0 |
| `e2e/complete-flow.spec.ts` | 2 | 1 | 1 | 0 |
| **Total** | **32** | **27** | **4** | **1** |





A corriger :
Lors de la creation d'un panier, proposer en fonction des stocks, des paniers.
Le boulanger ou la vendeuse choisi le/les paniers à proposer ( ils choisissent deja les articles)
Mettre en place, un algorithme cohérent pour se debarasser du stock de manière logique ( pas proposer 5 croissants ou 5 baguettes)
L'objectif est de se debarasser de ce qui est en trop pour eviter les invendus
Une fois un panier commandé par un utilisateur, doit on le decompter du stock ?
Ou doit on attendre qu'il vienne le recuperer.
Par contre une fois recuperé, il faut le decompter du stock, ce qui n'est pas fait encore


PB GET /api/catalogue/artisan-dore 200 in 854ms
 ✓ Compiled /api/orders in 96ms (854 modules)
 ○ Compiling /api/orders/confirm-email ...
 ✓ Compiled /api/orders/confirm-email in 587ms (1147 modules)
[orders/confirm-email] Erreur Resend
 POST /api/orders/confirm-email 500 in 2151ms

 + 
 PB de nouveau client.
 Pas de chargement des images encore
 + Pas d'envoie de commandes ni de nouveau client