# Rapport d'analyse — BakeryOS

*Généré automatiquement le 16/03/2026 — mis à jour le 17/03/2026 (session multi-user)*

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

### S0. ✅ CORRIGÉ — Accès non autorisé à /boulanger pour les clients
**Fichier** : `app/boulanger/page.tsx`, `middleware.ts`, `context/boulanger-context.tsx`
**Statut** : ✅ **CORRIGÉ le 17/03/2026**

**Problème initial** : Un client authentifié (via OTP Magic Link) pouvait accéder à `/boulanger` et voir l'interface du boulanger.

**Corrections appliquées** :
1. **`middleware.ts`** — Vérification SSR complète via RPC `check_boulanger_access()` :
   - Vérifie l'existence d'une session Supabase valide
   - Vérifie que l'utilisateur est owner OU employé actif
   - Redirige vers `/?error=unauthorized` si accès non autorisé
2. **`app/boulanger/page.tsx`** — Écran "Accès non autorisé" si `boulangerie === null` ou `userRole === null`
3. **`context/boulanger-context.tsx`** — Utilise `get_current_user_access()` pour charger le rôle et les permissions

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

### B1. ✅ CORRIGÉ — Cast `produit_id::UUID` potentiellement invalide
**Fichier** : `migrations/migration.sql`
**Statut** : ✅ **CORRIGÉ le 17/03/2026**

**Problème initial** : Dans `get_paniers_flash()`, le cast `sj.produit_id::UUID` pouvait échouer si `produit_id` contenait une valeur non-UUID.

**Correction appliquée** : La fonction `get_paniers_flash()` lit désormais depuis la table `paniers_flash` (source de vérité persistée) au lieu de joindre `stocks_journaliers`. Plus de cast UUID unsafe.

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
**Statut** : ✅ Corrigé le 17/03/2026
Middleware SSR complet avec vérification session + rôle via `check_boulanger_access()`.

---

### I2. ✅ CORRIGÉ — Types partagés importés depuis un fichier 'use client'
**Fichiers** : `lib/types.ts` (nouveau), `context/boulanger-context.tsx`, `app/api/boulanger/journee/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

---

### I3. ✅ CORRIGÉ — Limite Starter comptait seulement les produits actifs
**Fichier** : `app/api/boulanger/produits/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

---

### I4. ✅ CORRIGÉ — Colonnes d'adresse absentes du CREATE TABLE initial
**Fichier** : `migrations/migration.sql`
**Statut** : ✅ Corrigé le 17/03/2026
Les colonnes `adresse`, `ville`, `code_postal`, `telephone`, `creneaux_retrait` sont maintenant dans le CREATE TABLE avec `ALTER TABLE IF NOT EXISTS` pour rétrocompatibilité.

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

### E2. ✅ CORRIGÉ — Soft delete pour les produits
**Fichier** : `migrations/migration.sql`, `app/api/boulanger/produits/route.ts`
**Statut** : ✅ **CORRIGÉ le 17/03/2026**

**Correction appliquée** :
- Colonne `deleted_at TIMESTAMPTZ DEFAULT NULL` ajoutée dans `migration.sql`
- Index mis à jour pour exclure `WHERE deleted_at IS NULL`
- `get_catalogue_public()` filtre les produits softdeleted

---

### E3. 🔵 FAIBLE — Images externes Unsplash comme fallback
**Fichier** : `app/api/catalogue/[slug]/route.ts`
**Statut** : 🔵 Ouvert

---

### E4. ✅ CORRIGÉ — heure_retrait non validée contre les créneaux configurés
**Fichier** : `app/api/orders/route.ts`
**Statut** : ✅ Corrigé le 16/03/2026

---

## 🆕 NOUVELLES FONCTIONNALITÉS (session multi-user)

### Multi-utilisateurs par boulangerie
**Fichiers** : `migrations/Migration-Multi-Utilisateurs.sql`, `app/api/boulanger/equipe/route.ts`, `app/api/boulanger/rejoindre/route.ts`
**Statut** : ✅ Implémenté

**Nouveautés** :
- Table `employes` (gérant + vendeur) avec invitations
- Table `audit_equipe` pour l'historique des actions
- Permissions granulaires par feature (`lib/types.ts`)
- Fonctions SQL sécurisées : `check_boulanger_access()`, `get_current_user_access()`, `get_team_members()`, `count_active_members()`
- RLS étendu pour les employés actifs
- Routes API : GET/POST `/api/boulanger/equipe`, GET `/api/boulanger/rejoindre`
- Limites par plan : starter=1, pro=3, multi=∞

---

## 📊 RÉSUMÉ

| Catégorie | 🔴 Critique | 🟠 Élevé | 🟡 Moyen | 🔵 Faible | ⚪ Info | ✅ Corrigé |
|-----------|-------------|----------|----------|-----------|---------|-----------|
| Sécurité  | 0 | 0 | 0 | 0 | 0 | **6** |
| Bugs      | 0 | 0 | 0 | 1 | 2 | **3** |
| Incohérences | 0 | 0 | 0 | 1 | 1 | **4** |
| Grammaire | 0 | 0 | 0 | 1 | 1 | 0 |
| Stratégique | 0 | 0 | 1 | 1 | 0 | **2** |
| **TOTAL** | **0** | **0** | **1** | **4** | **3** | **15** |

---

## 🔧 ACTIONS RESTANTES (par priorité)

### 🟡 MOYEN
1. **E1** — Pagination cursor-based sur l'historique (si volume important)

### 🔵 FAIBLE
2. **E3** — Images fallback hébergées localement (pas Unsplash)
3. **I5** — Réactiver ESLint au build
4. **B2** — Collecter `client_telephone` dans le formulaire de commande (optionnel)

---

*Analyse initiale : Cline — 16/03/2026*
*Mises à jour : Cline — 17/03/2026 — Toutes les vulnérabilités critiques corrigées, système multi-user implémenté*