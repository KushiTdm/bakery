# RBAC — Multi-Utilisateurs Sauve Mie
> Dernière mise à jour : Migration Multi-User v1.0

---

## Vue d'ensemble

Sauve Mie supporte 3 rôles. Les accès sont contrôlés à **3 niveaux** :
1. **Middleware SSR** (`middleware.ts`) — vérifie l'accès avant tout rendu
2. **Fonctions SQL SECURITY DEFINER** — bypass RLS, source de vérité
3. **RLS Supabase** — filet de sécurité sur chaque table
4. **Contexte client** (`canRead` / `canWrite`) — masquage UI
5. **Routes API** (`getBoulangerSession` + `canAccess`) — re-vérification serveur

---

## Matrice des rôles

| Feature            | Owner | Gérant | Vendeur |
|--------------------|:-----:|:------:|:-------:|
| Production matin   | ✏️    | ✏️     | —       |
| Stock étagère      | ✏️    | ✏️     | ✏️      |
| Clôture soir       | ✏️    | ✏️     | —       |
| Paniers flash      | ✏️    | ✏️     | 👁️      |
| Catalogue produits | ✏️    | ✏️     | 👁️      |
| Statistiques       | ✏️    | ✏️     | —       |
| Commandes          | ✏️    | ✏️     | ✏️      |
| Paramètres         | ✏️    | ✏️     | —       |
| Gestion équipe     | ✏️    | 👁️     | —       |
| Plan & facturation | ✏️    | —      | —       |

✏️ = écriture · 👁️ = lecture · — = aucun accès

---

## Limites par plan

| Plan    | Membres max | Multi-user |
|---------|:-----------:|:----------:|
| Starter | 1           | ❌         |
| Pro     | 3           | ✅ +2      |
| Multi   | ∞           | ✅         |

> **Membres max = owner + employés actifs.**  
> Un membre en statut `invite` ne compte pas tant qu'il n'a pas accepté.

---

## Architecture de sécurité

### 1. Middleware SSR (`middleware.ts`)

Intercepte **tous** les sous-chemins `/boulanger/:path+`.

```
requête /boulanger/commandes
   │
   ├── session Supabase valide ?  → non → redirect /?auth=required
   │
   └── check_boulanger_access(user_id) → null ?  → redirect /?error=unauthorized
          ├── owner de boulangeries ? → boulangerie_id
          └── employe actif ?        → boulangerie_id
```

`check_boulanger_access()` est **SECURITY DEFINER** : elle bypasse les RLS et est la **source de vérité unique** pour l'accès SSR.

### 2. Fonctions SQL

| Fonction | Usage | Caller |
|----------|-------|--------|
| `check_boulanger_access(user_id)` | Middleware SSR | anon/authenticated |
| `get_current_user_access()` | Contexte client React | authenticated |
| `get_team_members(boulangerie_id)` | API equipe GET | authenticated |
| `count_active_members(boulangerie_id)` | Vérif. limite plan | service_role |
| `cleanup_expired_invites()` | CRON nettoyage | service_role |

### 3. RLS par table

| Table | Owner | Gérant | Vendeur |
|-------|-------|--------|---------|
| `boulangeries` | ALL | SELECT | SELECT |
| `employes` | ALL | SELECT | SELECT (self) |
| `audit_equipe` | SELECT | SELECT | — |
| `journees` | ALL | SELECT | SELECT |
| `stocks_journaliers` | ALL | SELECT | SELECT+UPDATE |
| `produits` | ALL | SELECT | SELECT |
| `commandes` | ALL | SELECT+UPDATE | SELECT+UPDATE |
| `paniers_flash` | ALL | SELECT | SELECT |

### 4. Routes API (`lib/auth-boulanger.ts`)

Chaque route API utilise `getBoulangerSession(req)` qui :
- Lit le header `Authorization: Bearer <token>`
- Vérifie la session Supabase (admin client)
- Retourne `{ userId, boulangerieId, role, permissions, memberId? }` ou `null`

Puis `canAccess(session, feature, level)` vérifie la permission.

```typescript
// Exemple route protégée
const session = await getBoulangerSession(req);
if (!session) return unauthorized();
if (!canAccess(session, 'catalogue', 'write')) return forbidden();
```

---

## Flow invitation

```
Owner invite email@x.fr (rôle: vendeur)
   │
   ├─ Vérif. limite plan (count_active_members)
   ├─ Vérif. doublon email
   ├─ INSERT employes (statut='invite', token=UUID, expires=+7j)
   ├─ Email Resend (optionnel) ou lien à copier
   │
employé clique le lien /boulanger/rejoindre?token=xxx
   │
   ├─ GET /api/boulanger/rejoindre?token=xxx → validation token
   ├─ Utilisateur s'authentifie (login ou register)
   ├─ POST /api/boulanger/rejoindre {token}
   │     ├─ Vérif. token valide + non expiré
   │     ├─ Vérif. utilisateur pas owner d'une autre boulangerie
   │     ├─ UPDATE employes SET user_id=uid, statut='actif', invite_token=null
   │     └─ INSERT audit_equipe (action='accept')
   │
redirect → /boulanger (AppShell avec rôle vendeur)
```

---

## Permissions custom (override)

L'owner peut ajuster les permissions d'un membre au-delà des defaults du rôle, mais **jamais au-dessus** du niveau du rôle max.

Exemple : un gérant (`plan: none` pour facturation) ne peut pas recevoir `write` sur `plan`, même avec un override.

La validation est faite côté serveur dans `PATCH /api/boulanger/equipe/[id]`.

---

## Audit

Toutes les actions d'équipe sont tracées dans `audit_equipe` :

| Action | Déclencheur |
|--------|-------------|
| `invite` | POST /equipe |
| `accept` | POST /rejoindre |
| `suspend` | PATCH /equipe/[id] {statut:'suspendu'} |
| `reactivate` | PATCH /equipe/[id] {statut:'actif'} |
| `revoke` | DELETE /equipe/[id] |
| `role_change` | PATCH /equipe/[id] {role:...} |
| `perm_change` | PATCH /equipe/[id] {permissions:...} |

---

## Fichiers implémentés

```
migrations/migration-multiuser.sql        ← Tables, RLS, fonctions SQL
lib/types.ts                              ← Types, defaults, helpers
lib/sanitize.ts                           ← Validation UUID, email
lib/auth-boulanger.ts                     ← Session + permissions API
middleware.ts                             ← Protection SSR owner+employé
context/boulanger-context.tsx             ← Context client multi-user
app/boulanger/page.tsx                    ← UI filtrée par canRead()
components/boulanger/equipe-manager.tsx   ← UI gestion équipe
app/api/boulanger/equipe/route.ts         ← GET liste + POST invite
app/api/boulanger/equipe/[id]/route.ts    ← PATCH modifier + DELETE révoquer
app/api/boulanger/rejoindre/route.ts      ← GET info + POST accepter
app/boulanger/rejoindre/page.tsx          ← Page acceptation invitation
```