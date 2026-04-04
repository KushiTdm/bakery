# Audit Sécurité Routes Sauve Mie

*Dernière mise à jour : 25/03/2026 — Toutes les vulnérabilités corrigées + multi-user + P2 améliorations*

---

## Vulnérabilités — état final

### ✅ TOUTES CORRIGÉES

| Route / Fichier | Problème initial | Correctif appliqué | Statut |
|---|---|---|---|
| `middleware.ts` | Ne protégeait pas les routes `/boulanger/*` | Vérification session + owner/employé via `check_boulanger_access()` | ✅ **CORRIGÉ** |
| `app/boulanger/page.tsx` (AppShell) | Accès client si `boulangerie === null` | Écran "Accès non autorisé" + vérification `userRole` | ✅ **CORRIGÉ** |
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
| `migrations/migration.sql` | Cast `sj.produit_id::UUID` unsafe (B1) | Lecture depuis `paniers_flash` (plus de cast) | ✅ |
| `migrations/migration.sql` | Colonne `deleted_at` absente sur produits (E2) | Ajout soft delete | ✅ |
| `migrations/migration.sql` | Colonnes adresse absentes (I4) | Ajout dans CREATE TABLE + ALTER TABLE | ✅ |

---

## ✅ S0. VULNÉRABILITÉ CRITIQUE — CORRIGÉE le 17/03/2026

### Accès non autorisé à `/boulanger` pour les clients authentifiés

**Statut** : ✅ **CORRIGÉ**

**Cause racine identifiée** :
- Le middleware `middleware.ts` laissait passer toutes les requêtes vers `/boulanger/*`
- La vérification dans `AppShell` se faisait uniquement sur `isAuthenticated` (session existe)
- Aucune vérification que l'utilisateur a un enregistrement dans la table `boulangeries`

**Corrections appliquées** :

**1. `middleware.ts` (protection SSR)** — Le middleware intercepte désormais tous les sous-chemins `/boulanger/:path+` et vérifie :
- Existence d'une session Supabase valide
- Appel RPC `check_boulanger_access()` qui vérifie :
  - Owner : existence d'une ligne dans `boulangeries` avec `user_id = session.user.id`
  - Employé : existence d'une ligne active dans `employes` avec `user_id = session.user.id`
- Redirection vers `/` avec paramètre `error=unauthorized` si l'une des deux conditions échoue

**2. `app/boulanger/page.tsx` (protection côté client)** — La fonction `AppShell` affiche désormais un écran "Accès non autorisé" si `boulangerie === null` OU `userRole === null` après authentification, avec un bouton de retour à la vitrine et un bouton de déconnexion.

**3. `context/boulanger-context.tsx` (chargement du rôle)** — Utilise `get_current_user_access()` pour charger :
- Les infos boulangerie
- Le rôle utilisateur (`owner`, `gerant`, `employe`)
- Les permissions granulaires
- L'ID membre (pour les employés)

**Impact sécurité post-correction** : Un client authentifié via OTP Magic Link (pour passer une commande) ne peut plus voir l'interface boulanger sous quelque condition que ce soit. Seuls les owners et employés actifs peuvent accéder à `/boulanger/*`.

---

## 🆕 MULTI-UTILISATEURS — Nouvelles mesures de sécurité

### Tables et RLS

| Table | RLS Policy | Exposition | Risque |
|---|---|---|---|
| `employes` | ✅ Owner: all, Gérant: read, Employé: self | Gestion équipe | ✅ OK |
| `audit_equipe` | ✅ Owner/Gérant: read, Service: insert | Audit trail | ✅ OK |

### Fonctions SQL sécurisées (SECURITY DEFINER)

| Fonction | Rôle | Usage |
|---|---|---|
| `check_boulanger_access(user_id)` | `authenticated` | Middleware SSR |
| `get_current_user_access()` | `authenticated` | Contexte client React |
| `get_team_members(boulangerie_id)` | `authenticated` | API équipe |
| `count_active_members(boulangerie_id)` | `service_role` | Vérification limites plan |
| `get_employee_boulangerie_id()` | `authenticated` | Helper RLS employés |

### Permissions granulaires

```typescript
// lib/types.ts
type PermissionLevel = 'write' | 'read' | 'none';
type PermissionKey = 'matin' | 'snapshot' | 'soir' | 'flash' | 
                     'catalogue' | 'dashboard' | 'commandes' | 
                     'parametres' | 'equipe' | 'plan';

// Rôles par défaut
owner:   all write
gerant:  all write sauf equipe:read, plan:none
employe: snapshot:write, commandes:write, flash:read, catalogue:read
```

### Routes API protégées

| Route | Protection | Validation |
|---|---|---|
| `/api/boulanger/equipe` GET | `canAccess('equipe', 'read')` | Owner + Gérant |
| `/api/boulanger/equipe` POST | `isOwner()` | Owner uniquement |
| `/api/boulanger/rejoindre` GET | Token UUID valide + non expiré | Public (invitation) |

---

## Points ouverts (hors périmètre routes API)

| ID | Fichier | Problème | Priorité | Statut |
|---|---|---|---|---|
| I5 | `next.config.js` | `eslint: { ignoreDuringBuilds: true }` masque des erreurs | 🔵 Faible | 🟡 Ouvert |
| CFG1 | `.env` / Supabase | SMTP custom Resend non configuré | 🟡 Moyen | 🟡 À configurer |

---

## Fixes structurels appliqués

| Fichier | Problème | Correction |
|---|---|---|
| `context/boulanger-context.tsx` | Types partagés dans un fichier `'use client'` | Déplacés dans `lib/types.ts` |
| `app/api/boulanger/journee/route.ts` | Import de `StockEntry` depuis le contexte client | Importe depuis `lib/types.ts` |
| `components/cart-sidebar.tsx` | Race condition double soumission | `useRef<boolean>` synchrone |
| `middleware.ts` | Ne protégeait pas les routes boulanger | ✅ Middleware SSR complet + multi-user |
| `app/boulanger/page.tsx` | Accès client sans boulangerie | ✅ Écran d'accès refusé + vérification rôle |
| `migrations/migration.sql` | Migration consolidée v3 | ✅ 8 tables, soft delete, flash |
| `migrations/Migration-Multi-Utilisateurs.sql` | Nouveau | ✅ Tables employes + audit_equipe |

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
| `employes` | ✅ Owner: all, Gérant: read, Self: read | Gestion équipe | ✅ OK |
| `audit_equipe` | ✅ Owner/Gérant: read | Audit trail | ✅ OK |

### Tables owner/employé uniquement

| Table | RLS Policy Owner | RLS Policy Employé |
|---|---|---|
| `journees` | ✅ SELECT/INSERT/UPDATE | ✅ SELECT (via `get_employee_boulangerie_id()`) |
| `stocks_journaliers` | ✅ SELECT/INSERT/UPDATE | ✅ SELECT/UPDATE |
| `produits` | ✅ SELECT/INSERT/UPDATE/DELETE | ✅ SELECT (softdeleted exclus) |
| `commandes` | ✅ SELECT/UPDATE | ✅ SELECT/UPDATE |
| `paniers_flash` | ✅ ALL | ✅ SELECT |

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
- [x] **✅ B1 CORRIGÉ : Plus de cast UUID unsafe**
- [x] **✅ E2 CORRIGÉ : Soft delete (deleted_at)**
- [x] **✅ I4 CORRIGÉ : Colonnes adresse dans CREATE TABLE**
- [x] **✅ Multi-user : Permissions granulaires implémentées**
- [x] **✅ Multi-user : RLS étendu pour employés**
- [x] Vérification des limites plan
- [x] Audit logging des actions équipe (table `audit_equipe`)
- [x] **✅ P2 : Table audit_logs générique + helper `lib/audit.ts`**
- [x] **✅ P2 : Export RGPD (Art. 20) — GET /api/boulanger/export**
- [x] **✅ P2 : Cron nettoyage invitations expirées (`cleanup_expired_invites()`)**
- [x] **✅ P2 : Timeout 10s connexion Supabase admin**
- [x] **✅ P2 : Origin validation CSRF sur `/api/orders`**
- [ ] SMTP custom Resend (configuration manuelle)
- [ ] 2FA pour admin (futur)

---

## Actions restantes (par priorité)

### 🟡 Moyen terme
1. **I5** — Réactiver ESLint pendant le build (`next.config.js`)
2. **CFG1** — Brancher Resend SMTP custom dans Supabase Dashboard → Settings → SMTP

### 🔵 Faible / Futur
3. 2FA pour les comptes admin
4. Chiffrement des données sensibles (optionnel)

---

## Ordre d'exécution des migrations

1. **`migrations/migration.sql`** — Migration principale v3 (8 tables, fonctions, storage)
2. **`migrations/Migration-Multi-Utilisateurs.sql`** — Tables employes + audit_equipe, fonctions multi-user
3. **`migrations/migration-p2-improvements.sql`** — Table audit_logs, export RGPD, cron cleanup

Les trois migrations sont **idempotentes** et peuvent être ré-exécutées sans risque.

---

*Audit réalisé par : Cline — 16/03/2026*
*Mises à jour : Cline — 17/03/2026 — Toutes vulnérabilités corrigées, multi-user implémenté*
*P2 améliorations : Cline — 25/03/2026 — audit_logs, export RGPD, timeout, CSRF, cron cleanup*
