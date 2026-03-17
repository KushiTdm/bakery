# 🔐 RBAC — Gestion des Rôles et Permissions

> Role-Based Access Control pour BakeryOS
> Système de contrôle d'accès basé sur les rôles

---

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Définition des rôles](#définition-des-rôles)
3. [Matrice des permissions](#matrice-des-permissions)
4. [Politiques RLS Supabase](#politiques-rls-supabase)
5. [Implémentation technique](#implémentation-technique)
6. [Limites par plan](#limites-par-plan)
7. [Audit et logging](#audit-et-logging)

---

## Vue d'ensemble

### Principe du moindre privilège

BakeryOS applique le principe du moindre privilège : chaque utilisateur n'a accès qu'aux ressources strictement nécessaires à son rôle.

### Niveaux d'accès

```
┌─────────────────────────────────────────────────────────────┐
│                     NIVEAUX D'ACCÈS                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔴 PUBLIC (anon key)                                       │
│  ├── Catalogue produits actifs                              │
│  ├── Paniers flash (données limitées)                       │
│  └── Informations boulangerie publiques                     │
│                                                             │
│  🟡 CLIENT AUTHENTIFIÉ                                      │
│  ├── Ses propres commandes                                  │
│  ├── Son profil                                             │
│  └── Ses abonnements notifications                          │
│                                                             │
│  🟠 BOULANGER OWNER                                         │
│  ├── Toutes les données de SA boulangerie                   │
│  ├── Gestion produits, stocks, commandes                    │
│  └── Configuration et paramètres                            │
│                                                             │
│  🔵 EMPLOYÉ BOULANGERIE                                     │
│  ├── Lecture catalogue                                      │
│  ├── Écriture stocks (snapshot)                             │
│  └── Lecture commandes                                      │
│                                                             │
│  🟣 ADMIN PLATFORM                                          │
│  ├── Toutes les boulangeries                               │
│  ├── Gestion utilisateurs                                   │
│  └── Configuration système                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Définition des rôles

### 1. Visiteur (Public)
**Description :** Utilisateur non authentifié consultant la vitrine publique.
**Accès :** Vitrine, catalogue produits actifs, paniers flash, informations de contact
**Restrictions :** Pas d'accès aux données internes

### 2. Client
**Description :** Utilisateur authentifié via Magic Link OTP.
**Accès :** Création et gestion de ses commandes, profil personnel, historique
**Restrictions :** Accès limité à ses propres données. **Ne peut PAS accéder à /boulanger** (fix S0)

### 3. Boulanger Owner
**Description :** Propriétaire/gestionnaire principal d'une boulangerie.
**Accès :** Administration complète de SA boulangerie (catalogue, stocks, commandes, paramètres)
**Restrictions :** Accès limité à SA boulangerie (tenant isolation), limites selon le plan

### 4. Employé Boulangerie
**Description :** Employé avec accès limité (futur).
**Accès :** Lecture catalogue, saisie stocks snapshot, consultation commandes
**Restrictions :** Pas de modification catalogue, paramètres, statistiques financières

### 5. Admin Platform
**Description :** Administrateur de la plateforme BakeryOS (futur).
**Accès :** Toutes les boulangeries, utilisateurs, configuration globale
**Restrictions :** Accès serveur uniquement (service role key), actions logged

---

## Matrice des permissions

*(Inchangée — voir version précédente)*

---

## Politiques RLS Supabase

Voir `migrations/migration-final-v3.sql` pour les politiques complètes et à jour.

Les tables suivantes ont RLS activé :
- `boulangeries`, `journees`, `stocks_journaliers`, `produits`
- `commandes`, `push_subscriptions`, `profils_clients`, `paniers_flash`

---

## Implémentation technique

### Middleware SSR (✅ Corrigé — Fix S0)

```typescript
// middleware.ts — Protection des routes /boulanger/:path+
// Vérifie session + existence boulangerie avant de laisser passer

export async function middleware(req: NextRequest) {
  const supabase = createServerClient(...);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL('/?auth=required', req.url));
  }

  const { data: boulangerie } = await supabase
    .from('boulangeries')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  if (!boulangerie) {
    return NextResponse.redirect(new URL('/?error=unauthorized', req.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ['/boulanger/:path+'] };
```

### Protection côté client (✅ Corrigé — Fix S0)

```typescript
// app/boulanger/page.tsx — AppShell
function AppShell() {
  const { isAuthenticated, authLoading, boulangerie } = useBoulanger();
  const router = useRouter();

  if (authLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LoginForm />;

  // 🔐 Bloquer les clients sans boulangerie
  if (!boulangerie) {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center px-4">
        <div className="text-center">
          <span className="text-4xl block mb-4">🔒</span>
          <p className="text-white/70 text-lg font-semibold">Accès non autorisé</p>
          <p className="text-white/40 text-sm mt-2">
            Cet espace est réservé aux boulangers inscrits sur BakeryOS.
          </p>
          <button onClick={() => router.push('/')} ...>
            Retour à la vitrine
          </button>
        </div>
      </div>
    );
  }

  // Interface boulanger...
}
```

### Vérification côté serveur (API Routes)

```typescript
// Pattern commun dans toutes les routes /api/boulanger/*
async function getOwnerBoulangerieId(req: NextRequest) {
  const admin = getSupabaseAdmin();
  const token = req.headers.get('authorization')?.slice(7);
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id')
    .eq('user_id', user.id)
    .single();

  return boulangerie?.id ?? null;
}
```

---

## Limites par plan

| Ressource | Starter (19€) | Pro (49€) | Multi (99€) |
|---|---|---|---|
| Produits catalogue | 20 | Illimité | Illimité |
| Commandes/mois | 50 | Illimité | Illimité |
| Utilisateurs | 1 (owner) | 3 | Illimité |
| Historique stats | 30 jours | 90 jours | Illimité |
| Export PDF | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Multi-boulangeries | ❌ | ❌ | ✅ |

---

## Audit et logging

La table `audit_logs` est définie dans le RBAC mais pas encore branchée en production. Les triggers SQL sont prêts à être activés.

---

## 📊 État d'implémentation

### ✅ Implémenté

| Fonctionnalité | Statut | Fichier | Notes |
|---|---|---|---|
| **Middleware SSR protection** | ✅ **CORRIGÉ** | `middleware.ts` | Vérifie session + boulangerie |
| **Vérification rôle AppShell** | ✅ **CORRIGÉ** | `app/boulanger/page.tsx` | Écran accès refusé si boulangerie null |
| RLS tables principales | ✅ | Migration SQL | Toutes les 8 tables |
| Isolation multi-tenant | ✅ | API Routes | Vérification `boulangerie_id` |
| Auth boulanger | ✅ | `app/api/boulanger/auth/route.ts` | Email + password |
| Auth client | ✅ | Supabase OTP | Magic Link |
| Rate limiting auth | ✅ | `app/api/boulanger/auth/route.ts` | 5 tentatives / 15 min |
| Sanitization inputs | ✅ | `lib/sanitize.ts` | Tous les endpoints |
| Validation Zod | ✅ | API Routes | Tous les endpoints |
| Fonctions SECURITY DEFINER | ✅ | Migration SQL | `get_catalogue_public()`, `get_paniers_flash()` |
| Limites par plan | ✅ | `app/api/boulanger/produits/route.ts` | Limite 20 produits Starter |
| Soft delete produits | ✅ | `migration-final-v3.sql` | Colonne `deleted_at` |
| Cast UUID sécurisé | ✅ | `migration-final-v3.sql` | Jointure via `::TEXT` |

### 🟡 Partiellement implémenté

| Fonctionnalité | Statut | Fichier | Reste à faire |
|---|---|---|---|
| Rôle Employé | 🟡 | DB schema ready | Table à brancher au code |
| Audit logging | 🟡 | DB schema ready | Triggers à activer |

### ⚪ Non implémenté (futur)

| Fonctionnalité | Statut | Priorité |
|---|---|---|
| Multi-utilisateurs par boulangerie | ⚪ | Long terme |
| Rôle Admin Platform | ⚪ | Long terme |
| 2FA | ⚪ | Long terme |

---

## Checklist de sécurité

- [x] RLS activé sur toutes les tables (8/8)
- [x] Fonctions SECURITY DEFINER pour données publiques
- [x] Isolation multi-tenant par `boulangerie_id`
- [x] Validation JWT sur routes API protégées
- [x] Rate limiting sur authentification
- [x] Rate limiting sur création commandes
- [x] Sanitization des inputs utilisateur
- [x] **✅ Vérification rôle côté client dans AppShell (fix S0)**
- [x] **✅ Middleware SSR pour protéger /boulanger/* (fix S0)**
- [x] Vérification des limites plan
- [x] Soft delete produits (fix E2)
- [ ] Audit logging des actions sensibles
- [ ] 2FA pour admin (futur)

---

*BakeryOS — Documentation RBAC © 2026*
*Mis à jour le 17/03/2026 — Vulnérabilités critiques S0, B1, E2 corrigées*