# Audit Sécurité Routes BakeryOS

*Dernière mise à jour : 16/03/2026*

---

## Vulnérabilités — état final

### ✅ TOUTES CORRIGÉES

| Route | Problème initial | Correctif appliqué | Statut |
|---|---|---|---|
| `/api/boulanger/auth` POST | Slug non validé à l'inscription | `isValidSlug()` avant vérification DB | ✅ |
| `/api/boulanger/auth` POST | Pas de rate limiting sur login/register | Map mémoire 5 tentatives / 15 min, `Retry-After` | ✅ |
| `/api/boulanger/auth` POST | Mot de passe sans contrainte de complexité | `validatePasswordStrength()` : 8 chars, min/maj, chiffre | ✅ |
| `lib/supabase.ts` | Fallback silencieux en production | `throw` immédiat si variables absentes, logique simplifiée (v2) | ✅ |
| `/api/notifications/send` | Secret interne optionnel | Validation stricte : absent = 401, mismatch = 401 | ✅ |
| `/api/orders/confirm-email` | Comportement incohérent avec `send` (500 vs 401) | Aligné sur `send` : absent en prod = 401, absent en dev = warning | ✅ |
| `/api/orders` | `lignes` JSONB non sanitisé | Validation Zod renforcée + `sanitizeText` sur `produit_nom` | ✅ |
| `/api/boulanger/profil` PATCH | `nom`, `email_contact` non sanitisés | `sanitizeText()` appliqué | ✅ |
| `/api/orders/[id]` | `params.id` non validé UUID | `isValidUUID()` avant requête | ✅ |
| `/api/boulanger/journee` POST | `commandesOnline` non borné | `Math.max(0, Math.min(..., 9999))` | ✅ |
| `/api/boulanger/historique` GET | `limit` param peut être NaN | `parseInt` + `isNaN` check + borne [1, 90] | ✅ |
| `/api/boulanger/produits` POST | Limite Starter comptait seulement `actif_catalogue=true` | Comptage sur tous les produits (actifs + inactifs) | ✅ |
| `/api/orders` POST | `heure_retrait` non validée contre les créneaux configurés | Vérification après fetch boulangerie, erreur 400 explicite | ✅ |

---

## Fixes structurels (non sécurité pure mais impact sécurité/qualité)

| Fichier | Problème | Correction |
|---|---|---|
| `context/boulanger-context.tsx` | Types partagés dans un fichier `'use client'` importé côté serveur | Déplacés dans `lib/types.ts` (neutre) |
| `app/api/boulanger/journee/route.ts` | Import de `StockEntry` depuis le contexte client | Importe depuis `lib/types.ts` |
| `components/cart-sidebar.tsx` | Race condition double soumission | `useRef<boolean>` synchrone en complément du state |
| `middleware.ts` | Fichier trompeur (code sans effet non documenté) | Simplifié + commentaire architectural explicite |

---

## Déjà OK (inchangés depuis l'audit initial)

| Route | Statut |
|---|---|
| `/api/boulanger/produits` (GET/PATCH/DELETE) | ✅ Zod + `lib/sanitize.ts` |
| `/api/boulanger/produits/upload` | ✅ UUID validation + MIME check + taille |
| `/api/client/profil` | ✅ Zod `ProfilSchema` |
| `/api/notifications/subscribe` | ✅ endpoint TEXT, pas injectable |
| `/api/catalogue/[slug]` | ✅ `SLUG_REGEX` validation |
| `/api/paniers/[slug]` | ✅ `SLUG_REGEX` validation |

---

## Points ouverts (hors périmètre routes API)

| ID | Fichier | Problème | Priorité |
|---|---|---|---|
| B1 | `migrations/migration-complete-v1.sql` | Cast `sj.produit_id::UUID` unsafe dans `get_paniers_flash()` | 🟠 Élevé |
| I4 | `migrations/migration-complete-v1.sql` | Colonnes adresse/ville/code_postal/telephone absentes du `CREATE TABLE` initial | 🔵 Faible |
| E2 | `app/api/boulanger/produits/route.ts` | Pas de soft delete — suppression définitive de produits référencés | 🟡 Moyen |
| I5 | `next.config.js` | `eslint: { ignoreDuringBuilds: true }` masque des erreurs | 🔵 Faible |