# Rapport d'analyse — BakeryOS

*Généré automatiquement le 16/03/2026 — mis à jour le 16/03/2026*

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

Correction initiale : erreur bloquante si variables absentes en production.
Correction v2 : suppression des variables intermédiaires `effectiveUrl`/`effectiveKey`
qui créaient une logique de double-vérification fragile. Désormais :
- `throw` immédiat en production si variables absentes
- `resolvedUrl`/`resolvedKey` simples avec fallback dev uniquement
- Chemin d'erreur linéaire et sans ambiguïté

---

### S4. ✅ CORRIGÉ — Validation de la complexité du mot de passe
**Fichier** : `app/api/boulanger/auth/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026
`validatePasswordStrength()` vérifie 8 chars min, minuscule, majuscule, chiffre.

---

### S5. ✅ CORRIGÉ — Secret interne aligné entre les deux routes
**Fichiers** : `app/api/notifications/send/route.ts`, `app/api/orders/confirm-email/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026 (v2 — alignement)

Correction initiale : secret validé dans `notifications/send`.
Correction v2 : `confirm-email/route.ts` aligné sur le même contrat :
- secret absent en **production** → **401** (et non 500)
- secret absent en **développement** → warning + pass-through
- secret présent partout → vérification stricte → 401 si mismatch

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

Ajout d'un `useRef<boolean>` (`submittingRef`) en complément du state `isSubmitting`.
Le ref est synchrone : il est positionné à `true` avant l'appel async et remis à `false`
dans le `finally`, bloquant tout second clic dans le même cycle d'événements.
Le state `isSubmitting` reste pour l'UI (désactivation du bouton).

---

### B4. ✅ CORRIGÉ — Gestion d'erreur silencieuse dans cart-sidebar
**Fichier** : `components/cart-sidebar.tsx`
**Statut** : ✅ Corrigé le 16/03/2026

Le `.catch()` silencieux a été remplacé par un `console.warn` conditionné à
`process.env.NODE_ENV !== 'production'`. L'erreur reste non-bloquante en prod
(les valeurs par défaut sont utilisées), mais est visible en développement.

---

### B5. 🔵 FAIBLE — TVA calculée mais pas stockée en base
**Fichier** : `components/cart-sidebar.tsx`
**Statut** : ⚪ Accepté — évolution future

La TVA est calculée côté client pour l'affichage uniquement.
À traiter si besoin de conformité comptable (ajout de `montant_ht` et `tva` dans `commandes`).

---

## ⚠️ INCOHÉRENCES — PRIORITÉ 3

### I1. ✅ CORRIGÉ — Middleware quasi-vide
**Fichier** : `middleware.ts`
**Statut** : ✅ Corrigé le 16/03/2026

Le middleware a été simplifié et documenté. Le choix architectural (auth côté client
via `BoulangerContext`) est maintenant explicitement commenté avec le chemin pour
une future protection SSR. Le paramètre `_req` est préfixé pour signaler qu'il
est intentionnellement inutilisé.

---

### I2. ✅ CORRIGÉ — Types partagés importés depuis un fichier 'use client'
**Fichiers** : `lib/types.ts` (nouveau), `context/boulanger-context.tsx`, `app/api/boulanger/journee/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

Création de `lib/types.ts` (sans directive) contenant `StockEntry`, `HistoryEntry`,
`ProductionSuggestion`, `ViewType`, `SyncStatus`.
- `context/boulanger-context.tsx` importe depuis `lib/types.ts` et ré-exporte pour
  la compatibilité des imports existants.
- `app/api/boulanger/journee/route.ts` importe `StockEntry` depuis `lib/types.ts`
  au lieu du contexte client.

---

### I3. ✅ CORRIGÉ — Limite Starter comptait seulement les produits actifs
**Fichier** : `app/api/boulanger/produits/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

Le comptage pour la limite plan Starter porte maintenant sur **tous les produits**
(actifs ET inactifs), sans filtre `actif_catalogue`. Cela ferme le contournement
qui consistait à désactiver des produits avant d'en créer de nouveaux.

---

### I4. 🔵 FAIBLE — Colonnes d'adresse absentes du CREATE TABLE initial
**Fichier** : `migrations/migration-complete-v1.sql`
**Statut** : 🔴 Ouvert — correction en SQL

`adresse`, `ville`, `code_postal`, `telephone` doivent être déclarées dans
le `CREATE TABLE boulangeries` et non seulement via `ALTER TABLE` implicites.

---

### I5. 🔵 FAIBLE — ESLint ignoré pendant le build
**Fichier** : `next.config.js`
**Statut** : ⚪ Accepté pour l'instant — à activer avant la mise en production finale
`eslint: { ignoreDuringBuilds: true }` masque des problèmes potentiels.

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
Implémenter une pagination cursor-based si le volume augmente.

---

### E2. 🟡 MOYEN — Pas de soft delete pour les produits
**Fichier** : `app/api/boulanger/produits/route.ts`
**Statut** : 🟡 Ouvert
Les produits référencés dans des commandes historiques sont supprimés définitivement.
Implémenter `deleted_at` ou archivage lors d'une prochaine itération DB.

---

### E3. 🔵 FAIBLE — Images externes Unsplash comme fallback
**Fichier** : `app/api/catalogue/[slug]/route.ts`
**Statut** : 🔵 Ouvert
Héberger les images par défaut dans `/public/images/` pour éliminer la dépendance externe.

---

### E4. ✅ CORRIGÉ — heure_retrait non validée contre les créneaux configurés
**Fichier** : `app/api/orders/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

Après récupération de la boulangerie, `creneaux_retrait` est extrait du profil.
Si la liste est non-vide et que `heure_retrait` n'en fait pas partie, la commande
est rejetée avec une erreur 400 explicite listant les créneaux valides.

---

## 📊 RÉSUMÉ

| Catégorie | 🔴 Critique | 🟠 Élevé | 🟡 Moyen | 🔵 Faible | ⚪ Info | ✅ Corrigé |
|-----------|-------------|----------|----------|-----------|---------|-----------|
| Sécurité  | 0 | 0 | 0 | 0 | 0 | **5** |
| Bugs      | 0 | 1 | 0 | 1 | 2 | **2** |
| Incohérences | 0 | 0 | 0 | 2 | 1 | **4** |
| Grammaire | 0 | 0 | 0 | 1 | 1 | 0 |
| Stratégique | 0 | 0 | 2 | 1 | 0 | **1** |
| **TOTAL** | **0** | **1** | **2** | **5** | **4** | **12** |

---

## 🔧 ACTIONS RESTANTES (par priorité)

1. **[URGENT - SQL]** B1 — Cast UUID unsafe dans `get_paniers_flash()` (migration SQL)
2. **[URGENT - SQL]** I4 — Colonnes `adresse/ville/code_postal/telephone` absentes du `CREATE TABLE`
3. **[MOYEN]** E1 — Pagination cursor-based sur l'historique
4. **[MOYEN]** E2 — Soft delete produits (`deleted_at`)
5. **[FAIBLE]** E3 — Images fallback hébergées localement
6. **[FAIBLE]** I5 — Réactiver ESLint au build

---

*Analyse initiale : Cline — 16/03/2026*
*Mises à jour : Claude — 16/03/2026*