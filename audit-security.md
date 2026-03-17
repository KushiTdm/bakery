# Audit Sécurité Routes BakeryOS

*Dernière mise à jour : 17/03/2026*

---

## 🔴 VULNÉRABILITÉ CRITIQUE — OUVERTE

### S0. Accès non autorisé à `/boulanger` pour les clients authentifiés
**Sévérité** : 🔴 CRITIQUE  
**Statut** : 🔴 **OUVERT — CORRECTION URGENTE REQUISE**

**Description** : Un utilisateur client (authentifié via OTP Magic Link pour passer une commande) peut accéder à l'espace boulanger `/boulanger` et voir l'interface d'administration.

**Cause racine** :
- Le middleware `middleware.ts` laisse passer toutes les requêtes vers `/boulanger/*`
- La vérification côté client dans `AppShell` se fait uniquement sur `isAuthenticated` (session existe)
- Aucune vérification que l'utilisateur a un enregistrement dans la table `boulangeries`

**Code problématique** :
```typescript
// app/boulanger/page.tsx
if (!isAuthenticated) return <LoginForm />;
// ❌ Ne vérifie PAS boulangerie === null
```

**Impact** :
- Interface boulanger visible par les clients
- Données potentiellement exposées via les API si RLS mal configuré
- Confusion utilisateur (wizard qui se lance pour créer un catalogue)

**Correction recommandée** :
```typescript
// app/boulanger/page.tsx - AppShell
if (!isAuthenticated) return <LoginForm />;
if (isAuthenticated && !boulangerie && !authLoading) {
  return (
    <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
      <div className="text-center">
        <span className="text-4xl block mb-4">🔒</span>
        <p className="text-white/70">Accès non autorisé</p>
        <p className="text-white/40 text-sm mt-2">Cet espace est réservé aux boulangers.</p>
        <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-[#C19A6B] rounded-lg">
          Retour à la vitrine
        </button>
      </div>
    </div>
  );
}
```

**Et implémenter un middleware SSR** :
```typescript
// middleware.ts
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  
  if (req.nextUrl.pathname.startsWith('/boulanger')) {
    if (!session) {
      return NextResponse.redirect(new URL('/?auth=required', req.url));
    }
    
    // Vérifier que l'utilisateur a une boulangerie
    const { data: boulangerie } = await supabase
      .from('boulangeries')
      .select('id')
      .eq('user_id', session.user.id)
      .single();
    
    if (!boulangerie) {
      return NextResponse.redirect(new URL('/?error=unauthorized', req.url));
    }
  }
  
  return res;
}
```

---

## Vulnérabilités — état final

### ✅ TOUTES CORRIGÉES (sauf S0)

| Route | Problème initial | Correctif appliqué | Statut |
|---|---|---|---|
| `/api/boulanger/auth` POST | Slug non validé à l'inscription | `isValidSlug()` avant vérification DB | ✅ |
| `/api/boulanger/auth` POST | Pas de rate limiting sur login/register | Map mémoire 5 tentatives / 15 min, `Retry-After` | ✅ |
| `/api/boulanger/auth` POST | Mot de passe sans contrainte de complexité | `validatePasswordStrength()` : 8 chars, min/maj, chiffre | ✅ |
| `lib/supabase.ts` | Fallback silencieux en production | `throw` immédiat si variables absentes | ✅ |
| `/api/notifications/send` | Secret interne optionnel | Validation stricte : absent = 401, mismatch = 401 | ✅ |
| `/api/orders/confirm-email` | Comportement incohérent avec `send` | Aligné sur `send` : absent en prod = 401 | ✅ |
| `/api/orders` | `lignes` JSONB non sanitisé | Validation Zod + `sanitizeText` sur `produit_nom` | ✅ |
| `/api/boulanger/profil` PATCH | `nom`, `email_contact` non sanitisés | `sanitizeText()` appliqué | ✅ |
| `/api/orders/[id]` | `params.id` non validé UUID | `isValidUUID()` avant requête | ✅ |
| `/api/boulanger/journee` POST | `commandesOnline` non borné | `Math.max(0, Math.min(..., 9999))` | ✅ |
| `/api/boulanger/historique` GET | `limit` param peut être NaN | `parseInt` + `isNaN` check + borne [1, 90] | ✅ |
| `/api/boulanger/produits` POST | Limite Starter comptait seulement `actif_catalogue=true` | Comptage sur tous les produits | ✅ |
| `/api/orders` POST | `heure_retrait` non validée contre les créneaux | Vérification après fetch boulangerie | ✅ |

---

## Fixes structurels (non sécurité pure mais impact sécurité/qualité)

| Fichier | Problème | Correction |
|---|---|---|
| `context/boulanger-context.tsx` | Types partagés dans un fichier `'use client'` | Déplacés dans `lib/types.ts` |
| `app/api/boulanger/journee/route.ts` | Import de `StockEntry` depuis le contexte client | Importe depuis `lib/types.ts` |
| `components/cart-sidebar.tsx` | Race condition double soumission | `useRef<boolean>` synchrone |
| `middleware.ts` | Ne protège pas vraiment les routes boulanger | ⚠️ À corriger avec S0 |

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
| **S0** | `middleware.ts`, `app/boulanger/page.tsx` | Accès non autorisé à /boulanger pour clients | 🔴 **CRITIQUE** |
| B1 | `migrations/migration-complete-v1.sql` | Cast `sj.produit_id::UUID` unsafe | 🟠 Élevé |
| I4 | `migrations/migration-complete-v1.sql` | Colonnes adresse/ville/code_postal/telephone absentes | 🔵 Faible |
| E2 | `app/api/boulanger/produits/route.ts` | Pas de soft delete — suppression définitive | 🟡 Moyen |
| I5 | `next.config.js` | `eslint: { ignoreDuringBuilds: true }` masque des erreurs | 🔵 Faible |

---

## Matrice de vérification RLS

### Tables exposées publiquement (anon key)

| Table | RLS Policy | Exposition | Risque |
|---|---|---|---|
| `produits` | ✅ `actif_catalogue = true` | Via `get_catalogue_public()` | ✅ OK |
| `boulangeries` | ✅ Public read limité | Via RPC | ✅ OK |
| `stocks_journaliers` | ❌ Aucune politique SELECT anon | Via `get_paniers_flash()` uniquement | ✅ OK |
| `journees` | ❌ Bloqué par RLS | Non exposé | ✅ OK |
| `commandes` | ✅ `client_id = auth.uid()` | Propres commandes uniquement | ✅ OK |

### Tables protégées (authentifié)

| Table | Vérification propriétaire | Risque |
|---|---|---|
| `produits` | ✅ `boulangerie_id IN (SELECT id FROM boulangeries WHERE owner_id = auth.uid())` | ✅ OK |
| `stocks_journaliers` | ✅ Vérification owner | ✅ OK |
| `journees` | ✅ Vérification owner | ✅ OK |
| `commandes` (boulanger view) | ✅ Vérification owner sur boulangerie | ✅ OK |
| `boulangeries` | ✅ `owner_id = auth.uid()` | ✅ OK |

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
- [ ] **🔴 URGENT : Vérification rôle côté client dans AppShell**
- [ ] **🔴 URGENT : Middleware SSR pour protéger /boulanger**
- [ ] Audit logging des actions sensibles
- [ ] 2FA pour admin (futur)

---

## Actions prioritaires

### 🔴 Immédiat (avant toute mise en production)
1. **S0** — Implémenter la vérification de rôle pour `/boulanger`
   - Modifier `AppShell` pour rediriger si `boulangerie === null`
   - Implémenter middleware SSR avec vérification `boulangeries.user_id`
   - Tester avec un compte client (OTP) pour confirmer le blocage

### 🟠 Court terme
2. **B1** — Corriger le cast UUID dans `get_paniers_flash()`
3. **I4** — Ajouter les colonnes d'adresse dans le `CREATE TABLE`

### 🟡 Moyen terme
4. **E2** — Implémenter soft delete pour les produits
5. Mettre en place l'audit logging

---

*Audit réalisé par : Cline — 17/03/2026*