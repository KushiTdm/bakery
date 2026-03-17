# Audit Sécurité Routes BakeryOS

*Dernière mise à jour : 17/03/2026 — Toutes les vulnérabilités critiques corrigées*

---

## Vulnérabilités — état final

### ✅ TOUTES CORRIGÉES

| Route / Fichier | Problème initial | Correctif appliqué | Statut |
|---|---|---|---|
| `middleware.ts` | Ne protégeait pas les routes `/boulanger/*` | Vérification session + boulangerie en SSR | ✅ **CORRIGÉ** |
| `app/boulanger/page.tsx` (AppShell) | Accès client si `boulangerie === null` | Écran "Accès non autorisé" + redirect | ✅ **CORRIGÉ** |
| `/api/boulanger/auth` POST | Slug non validé à l'inscription | `isValidSlug()` avant vérification DB | ✅ |
| `/api/boulanger/auth` POST | Pas de rate limiting sur login/register | Map mémoire 5 tentatives / 15 min | ✅ |
| `/api/boulanger/auth` POST | Mot de passe sans contrainte de complexité | `validatePasswordStrength()` | ✅ |
| `lib/supabase.ts` | Fallback silencieux en production | `throw` immédiat si variables absentes | ✅ |
| `/api/notifications/send` | Secret interne optionnel | Validation stricte : absent = 401 | ✅ |
| `/api/orders/confirm-email` | Comportement incohérent avec `send` | Aligné : absent en prod = 401 | ✅ |
| `/api/orders` | `lignes` JSONB non sanitisé | Validation Zod + `sanitizeText` | ✅ |
| `/api/boulanger/profil` PATCH | `nom`, `email_contact` non sanitisés | `sanitizeText()` appliqué | ✅ |
| `/api/orders/[id]` | `params.id` non validé UUID | `isValidUUID()` avant requête | ✅ |
| `/api/boulanger/journee` POST | `commandesOnline` non borné | `Math.max(0, Math.min(..., 9999))` | ✅ |
| `/api/boulanger/historique` GET | `limit` param peut être NaN | `parseInt` + `isNaN` check + borne [1, 90] | ✅ |
| `/api/boulanger/produits` POST | Limite Starter comptait seulement `actif_catalogue=true` | Comptage sur tous les produits | ✅ |
| `/api/orders` POST | `heure_retrait` non validée contre les créneaux | Vérification après fetch boulangerie | ✅ |
| `migrations/*.sql` | Cast `sj.produit_id::UUID` unsafe (B1) | Jointure via `::TEXT` dans migration-final-v3 | ✅ |
| `migrations/*.sql` | Colonne `deleted_at` absente sur produits (E2) | Ajout soft delete dans migration-final-v3 | ✅ |

---

## ~~S0. VULNÉRABILITÉ CRITIQUE~~ — ✅ CORRIGÉE le 17/03/2026

### Accès non autorisé à `/boulanger` pour les clients authentifiés

**Statut** : ✅ **CORRIGÉ**

**Cause racine identifiée** :
- Le middleware `middleware.ts` laissait passer toutes les requêtes vers `/boulanger/*`
- La vérification dans `AppShell` se faisait uniquement sur `isAuthenticated` (session existe)
- Aucune vérification que l'utilisateur a un enregistrement dans la table `boulangeries`

**Corrections appliquées** :

**1. `middleware.ts` (protection SSR)** — Le middleware intercepte désormais tous les sous-chemins `/boulanger/:path+` et vérifie :
- Existence d'une session Supabase
- Existence d'une ligne dans `boulangeries` avec `user_id = session.user.id`
- Redirection vers `/` avec paramètre `error=unauthorized` si l'une des deux conditions échoue

**2. `app/boulanger/page.tsx` (protection côté client)** — La fonction `AppShell` affiche désormais un écran "Accès non autorisé" si `boulangerie === null` après authentification, avec un bouton de retour à la vitrine et un bouton de déconnexion.

**Impact sécurité post-correction** : Un client authentifié via OTP Magic Link (pour passer une commande) ne peut plus voir l'interface boulanger sous quelque condition que ce soit.

---

## Points ouverts (hors périmètre routes API)

| ID | Fichier | Problème | Priorité | Statut |
|---|---|---|---|---|
| I4 | `migrations/` | Colonnes adresse/ville/code_postal/telephone absentes du CREATE TABLE v1 | 🔵 Faible | ✅ Inclus dans migration-final-v3 |
| I5 | `next.config.js` | `eslint: { ignoreDuringBuilds: true }` masque des erreurs | 🔵 Faible | 🟡 Ouvert |
| CFG1 | `.env` / Supabase | SMTP custom Resend non configuré | 🟡 Moyen | 🟡 À configurer |

---

## Fixes structurels appliqués

| Fichier | Problème | Correction |
|---|---|---|
| `context/boulanger-context.tsx` | Types partagés dans un fichier `'use client'` | Déplacés dans `lib/types.ts` |
| `app/api/boulanger/journee/route.ts` | Import de `StockEntry` depuis le contexte client | Importe depuis `lib/types.ts` |
| `components/cart-sidebar.tsx` | Race condition double soumission | `useRef<boolean>` synchrone |
| `middleware.ts` | Ne protégeait pas les routes boulanger | ✅ Middleware SSR complet implémenté |
| `app/boulanger/page.tsx` | Accès client sans boulangerie | ✅ Écran d'accès refusé implémenté |
| `migrations/*.sql` | 7 fichiers dispersés | ✅ Consolidés en `migration-final-v3.sql` |

---

## Matrice de vérification RLS

### Tables exposées publiquement (anon key)

| Table | RLS Policy | Exposition | Risque |
|---|---|---|---|
| `produits` | ✅ `actif_catalogue = true AND deleted_at IS NULL` | Via `get_catalogue_public()` | ✅ OK |
| `boulangeries` | ✅ Public read limité | Via API publique | ✅ OK |
| `stocks_journaliers` | ❌ Aucune politique SELECT anon | Via `get_paniers_flash()` uniquement | ✅ OK |
| `paniers_flash` | ❌ Aucune politique SELECT anon | Via `get_paniers_flash()` uniquement | ✅ OK |
| `journees` | ❌ Bloqué par RLS | Non exposé | ✅ OK |
| `commandes` | ✅ `client_id = auth.uid()` | Propres commandes uniquement | ✅ OK |

---

## Checklist de sécurité

- [x] RLS activé sur toutes les tables
- [x] Fonctions SECURITY DEFINER pour données publiques
- [x] Isolation multi-tenant par `boulangerie_id`
- [x] Validation JWT sur routes API protégées
- [x] Rate limiting sur authentification
- [x] Rate limiting sur création commandes
- [x] Sanitization des inputs utilisateur
- [x] Validation Zod sur toutes les routes API
- [x] **✅ S0 CORRIGÉ : Vérification rôle côté client dans AppShell**
- [x] **✅ S0 CORRIGÉ : Middleware SSR protège /boulanger/*
- [x] **✅ B1 CORRIGÉ : Cast UUID sécurisé dans migration-final-v3**
- [x] **✅ E2 CORRIGÉ : Soft delete (deleted_at) dans migration-final-v3**
- [x] Vérification des limites plan
- [ ] Audit logging des actions sensibles (table schema prête)
- [ ] SMTP custom Resend (configuration manuelle)
- [ ] 2FA pour admin (futur)

---

## Actions restantes (par priorité)

### 🟡 Moyen terme
1. **I5** — Réactiver ESLint pendant le build (`next.config.js`)
2. **CFG1** — Brancher Resend SMTP custom dans Supabase Dashboard → Settings → SMTP
3. Mettre en place l'audit logging (table `audit_logs` à créer)

### 🔵 Faible / Futur
4. 2FA pour les comptes admin
5. Chiffrement des données sensibles (optionnel)

---

*Audit réalisé par : Cline — 16/03/2026*
*Mises à jour : Claude — 17/03/2026 — Toutes vulnérabilités critiques corrigées*