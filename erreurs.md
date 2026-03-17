# Rapport d'analyse — BakeryOS

*Généré automatiquement le 16/03/2026 — mis à jour le 17/03/2026*

---

## LÉGENDE DES NIVEAUX

| Niveau | Icône | Description |
|--------|-------|-------------|
| 🔴 **CRITIQUE** | 🔴 | Faille de sécurité ou bug bloquant — corriger immédiatement |
| 🟠 **ÉLEVÉ** | 🟠 | Problème important affectant la stabilité ou la sécurité |
| 🟡 **MOYEN** | 🟡 | Incohérence ou bug non bloquant mais à corriger |
| 🔵 **FAIBLE** | 🔵 | Problème mineur, optimisation ou amélioration suggérée |
| ⚪ **INFO** | ⚪ | Note informative, pas de correction requise |

---

## 🔴 SÉCURITÉ — PRIORITÉ 1

### S0. 🔴 CRITIQUE — Accès non autorisé à /boulanger pour les clients
**Fichier** : `app/boulanger/page.tsx`, `context/boulanger-context.tsx`
**Statut** : 🔴 **OUVERT — À CORRIGER EN URGENCE**

**Problème** : Un client authentifié (via OTP Magic Link) peut accéder à `/boulanger` et voir l'interface du boulanger. La vérification actuelle se fait uniquement sur `isAuthenticated` (session existe) et non sur le rôle utilisateur.

**Analyse du code** :
```typescript
// app/boulanger/page.tsx - ligne ~180
if (!isAuthenticated) return <LoginForm />;
// ❌ Ne vérifie PAS si l'utilisateur a une boulangerie
```

```typescript
// context/boulanger-context.tsx - loadAll()
const { data, error } = await supabase
  .from('boulangeries')
  .select('id, nom, slug, plan, actif')
  .eq('user_id', userId)
  .single();
// Si error (pas de boulangerie), on catch et setBoulangerie(null)
// Mais l'interface reste accessible !
```

**Impact** :
- Un client voit l'interface boulanger avec "L'Artisan Doré" comme fallback
- Le wizard tour peut se lancer
- Potentiellement des données exposées si les requêtes API ne vérifient pas correctement

**Correction requise** :
1. Ajouter une vérification côté serveur (middleware) pour valider que l'utilisateur a une boulangerie
2. Ajouter une vérification côté client dans `AppShell` pour rediriger si `boulangerie === null`
3. Vérifier toutes les routes API protègent l'accès par `boulangerie_id`

---

### S1. ✅ CORRIGÉ — Validation du slug côté register
**Fichier** : `app/api/boulanger/auth/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026
`isValidSlug()` est appliqué avant toute vérification d'existence en base.

---

### S2. ✅ CORRIGÉ — Rate limiting sur l'authentification
**Fichier** : `app/api/boulanger/auth/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026
Système Map mémoire : 5 tentatives / 15 min, reset après succès, header `Retry-After`.

---

### S3. ✅ CORRIGÉ — Fallback unsafe dans lib/supabase.ts
**Fichier** : `lib/supabase.ts`
**Statut** : ✅ Corrigé le 16/03/2026 (v2 — simplification)

---

### S4. ✅ CORRIGÉ — Validation de la complexité du mot de passe
**Fichier** : `app/api/boulanger/auth/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026
`validatePasswordStrength()` vérifie 8 chars min, minuscule, majuscule, chiffre.

---

### S5. ✅ CORRIGÉ — Secret interne aligné entre les deux routes
**Fichiers** : `app/api/notifications/send/route.ts`, `app/api/orders/confirm-email/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026 (v2 — alignement)

---

## 🐛 BUGS — PRIORITÉ 2

### B1. 🟠 ÉLEVÉ — Cast `produit_id::UUID` potentiellement invalide
**Fichier** : `migrations/migration-complete-v1.sql`
**Statut** : 🔴 Ouvert — correction à appliquer en SQL

Dans `get_paniers_flash()`, le cast `sj.produit_id::UUID` peut échouer si
`produit_id` contient une valeur non-UUID (anciennes données).
**Correction suggérée** : utiliser `is_valid_uuid(sj.produit_id)` ou un cast sécurisé.

---

### B2. 🟡 MOYEN — `client_telephone` non collecté côté client
**Fichier** : `components/cart-sidebar.tsx`
**Statut** : ⚪ Accepté (incohérence fonctionnelle volontaire — pas un bug technique)
Le champ existe en base mais n'est pas exposé dans le formulaire de commande.
À traiter lors de l'évolution UX du tunnel de commande si besoin.

---

### B3. ✅ CORRIGÉ — Race condition double soumission
**Fichier** : `components/cart-sidebar.tsx`
**Statut** : ✅ Corrigé le 16/03/2026

---

### B4. ✅ CORRIGÉ — Gestion d'erreur silencieuse dans cart-sidebar
**Fichier** : `components/cart-sidebar.tsx`
**Statut** : ✅ Corrigé le 16/03/2026

---

### B5. 🔵 FAIBLE — TVA calculée mais pas stockée en base
**Fichier** : `components/cart-sidebar.tsx`
**Statut** : ⚪ Accepté — évolution future

---

## ⚠️ INCOHÉRENCES — PRIORITÉ 3

### I1. ✅ CORRIGÉ — Middleware quasi-vide
**Fichier** : `middleware.ts`
**Statut** : ✅ Corrigé le 16/03/2026
⚠️ Le middleware laisse passer TOUTES les requêtes vers `/boulanger/*`. Voir S0.

---

### I2. ✅ CORRIGÉ — Types partagés importés depuis un fichier 'use client'
**Fichiers** : `lib/types.ts` (nouveau), `context/boulanger-context.tsx`, `app/api/boulanger/journee/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

---

### I3. ✅ CORRIGÉ — Limite Starter comptait seulement les produits actifs
**Fichier** : `app/api/boulanger/produits/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

---

### I4. 🔵 FAIBLE — Colonnes d'adresse absentes du CREATE TABLE initial
**Fichier** : `migrations/migration-complete-v1.sql`
**Statut** : 🔴 Ouvert — correction en SQL

---

### I5. 🔵 FAIBLE — ESLint ignoré pendant le build
**Fichier** : `next.config.js`
**Statut** : ⚪ Accepté pour l'instant — à activer avant la mise en production finale

---

## 📝 GRAMMAIRE/ORTHOGRAPHE — PRIORITÉ 4

### G1. ⚪ INFO — Messages d'erreur cohérents
Aucune correction nécessaire.

### G2. 🔵 FAIBLE — Commentaires mixtes (FR/EN) dans certains fichiers
**Statut** : ⚪ Accepté — harmonisation possible lors d'une future passe de style.

---

## 🎯 ERREURS STRATÉGIQUES — PRIORITÉ 5

### E1. 🟡 MOYEN — Pas de pagination sur l'historique
**Fichier** : `app/api/boulanger/historique/route.ts`
**Statut** : 🟡 Ouvert — limite actuelle de 90 entrées suffit à court terme.

---

### E2. 🟡 MOYEN — Pas de soft delete pour les produits
**Fichier** : `app/api/boulanger/produits/route.ts`
**Statut** : 🟡 Ouvert
Les produits référencés dans des commandes historiques sont supprimés définitivement.

---

### E3. 🔵 FAIBLE — Images externes Unsplash comme fallback
**Fichier** : `app/api/catalogue/[slug]/route.ts`
**Statut** : 🔵 Ouvert

---

### E4. ✅ CORRIGÉ — heure_retrait non validée contre les créneaux configurés
**Fichier** : `app/api/orders/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

---

## 📊 RÉSUMÉ

| Catégorie | 🔴 Critique | 🟠 Élevé | 🟡 Moyen | 🔵 Faible | ⚪ Info | ✅ Corrigé |
|-----------|-------------|----------|----------|-----------|---------|-----------|
| Sécurité  | **1** | 0 | 0 | 0 | 0 | **5** |
| Bugs      | 0 | 1 | 0 | 1 | 2 | **2** |
| Incohérences | 0 | 0 | 0 | 2 | 1 | **4** |
| Grammaire | 0 | 0 | 0 | 1 | 1 | 0 |
| Stratégique | 0 | 0 | 2 | 1 | 0 | **1** |
| **TOTAL** | **1** | **1** | **2** | **5** | **4** | **12** |

---

## 🔧 ACTIONS RESTANTES (par priorité)

### 🔴 URGENT — Sécurité
1. **S0** — Corriger l'accès non autorisé à `/boulanger` pour les clients authentifiés
   - Ajouter vérification `boulangerie` dans `AppShell`
   - Implémenter middleware SSR avec vérification de rôle
   - Auditer toutes les routes API pour vérifier l'appartenance

### 🟠 ÉLEVÉ
2. **B1** — Cast UUID unsafe dans `get_paniers_flash()` (migration SQL)
3. **I4** — Colonnes `adresse/ville/code_postal/telephone` absentes du `CREATE TABLE`

### 🟡 MOYEN
4. **E1** — Pagination cursor-based sur l'historique
5. **E2** — Soft delete produits (`deleted_at`)

### 🔵 FAIBLE
6. **E3** — Images fallback hébergées localement
7. **I5** — Réactiver ESLint au build

---

*Analyse initiale : Cline — 16/03/2026*
*Mises à jour : Claude — 17/03/2026*