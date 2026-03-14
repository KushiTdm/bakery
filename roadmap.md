# Roadmap BakeryOS 🥖
*Mis à jour après audit complet — 14 mars 2026*

---

## 📊 Rapport d'audit complet

### Notes sur 100 — Évaluation révisée

| Critère | Note | Justification |
|---|---|---|
| **Présentation** | 76/100 | Landing premium, dark theme app boulanger soigné, animations framer-motion fluides. Manque : micro-interactions sur les compteurs, pas d'onboarding guidé. |
| **Service / Produit** | 68/100 | Core loop solide (Matin → Snapshot → Soir → Dashboard). Catalogue 100% dépendant d'Airtable (bloquant pour l'adoption). |
| **Fonctionnalités** | 62/100 | Click & collect fonctionnel, gestion journée fiable, PWA installable, push notifications. Manque : catalogue natif, suggestions ML réelles, realtime commandes. |
| **SEO** | 45/100 | SSR en place sur la landing, Open Graph configuré. **Manque critique** : sitemap.xml, robots.txt, icônes PWA manquantes. |
| **Sécurité** | 65/100 | RLS Supabase, clés Airtable chiffrées pgcrypto, rate limit double couche, proxy serveur. **Problème** : `retiree` vs `recuperee` dans contrainte CHECK. |
| **Qualité code** | 60/100 | Architecture claire (contexts, hooks, API routes). **Points faibles** : `any` trop fréquent, rate limiting en mémoire non adapté au serverless. |
| **Attractivité investisseur** | 58/100 | Concept anti-gaspillage différenciant, pricing défini. Manque : traction prouvée, métriques d'usage. |

**Moyenne : 62/100**

---

## 🐛 BUGS CRITIQUES — À corriger immédiatement

### BC1. Incohérence contrainte CHECK statut `retiree` vs `recuperee` ❌
**Fichier :** `migrations/migration-3.sql` vs `app/api/orders/[id]/route.ts`

**Problème :** La migration 3 déclare le statut `'retiree'` dans la contrainte CHECK :
```sql
check (statut in ('en_attente', 'confirmee', 'prete', 'recuperee', 'retiree', 'annulee'))
```

Mais le code `orders/[id]/route.ts` utilise `'recuperee'` :
```typescript
const VALID_STATUSES = ['en_attente', 'confirmee', 'prete', 'recuperee', 'annulee']
```

**Impact :** Incohérence entre DB et code. Le front-end (`commandes/page.tsx`) fait un mapping des deux mais c'est source de confusion.

**Fix :** Choisir un seul terme (recommandé : `recuperee`) et uniformiser la migration + le code.

---

### BC2. Icônes PWA manquantes ❌
**Fichier :** `public/manifest.json` référence des icônes inexistantes

**Problème :** Le `manifest.json` référence :
- `/icons/icon-72x72.png`
- `/icons/icon-96x96.png`
- `/icons/icon-128x128.png`
- `/icons/icon-144x144.png`
- `/icons/icon-152x152.png`
- `/icons/icon-192x192.png`
- `/icons/icon-384x384.png`
- `/icons/icon-512x512.png`

**Mais seul `/icons/icon.svg` existe dans le dossier !**

**Impact :** 
- PWA non installable sur iOS/Android
- Erreurs 404 en console
- Notification push sans icône

**Fix :** Générer les icônes depuis `icon.svg` via [realfavicongenerator.net](https://realfavicongenerator.net)

---

### BC3. Rate limiting en mémoire non adapté au serverless ⚠️
**Fichier :** `lib/rate-limit.ts`

**Problème :** 
```typescript
const ipStore = new Map<string, RateLimitEntry>();
```

Le rate limiting utilise une `Map` en mémoire. Sur Netlify/Vercel (serverless), chaque fonction a sa propre mémoire → le rate limiting ne fonctionne pas entre les instances.

**Impact :** Protection inefficace contre les attaques par force brute.

**Fix :** Utiliser Upstash Redis ou le rate limiting de Supabase Edge Functions.

---

## 🔴 PROBLÈMES DE SÉCURITÉ

### S1. `supabase` exporté comme `null as any`
**Fichier :** `lib/supabase.ts`

```typescript
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(...)
  : null as any;  // ← Problème
```

**Risque :** Si les variables d'env sont manquantes, l'app crash silencieusement ou avec des erreurs cryptiques.

**Fix :** Lever une erreur explicite en mode développement.

---

### S2. Clés VAPID potentiellement manquantes
**Fichier :** Variables d'environnement (`.env.local`)

**Problème :** Les push notifications nécessitent :
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_CONTACT_EMAIL`

**Note :** Impossible de vérifier car le fichier `.env.local` n'est pas versionné (normal pour les secrets).

**Impact :** Push notifications silencieusement désactivées si les clés ne sont pas configurées.

**Fix :**
```bash
npx web-push generate-vapid-keys
# Ajouter dans .env.local
```

---

### S3. `INTERNAL_API_SECRET` optionnel
**Fichier :** `app/api/orders/confirm-email/route.ts`

```typescript
if (internalSecret !== process.env.INTERNAL_API_SECRET) {
  // Si pas de secret configuré, on accepte quand même
}
```

**Risque :** En production sans secret, n'importe qui peut appeler l'endpoint.

**Fix :** Exiger le secret en production.

---

## 🟡 INCOHÉRENCES ET PROBLÈMES DE CODE

### I1. Données hardcodées dans `FlashBanner.tsx`
```typescript
const BASKETS_TAKEN = 5;  // Hardcodé
```

**Problème :** Non connecté aux stocks réels.

**Fix :** Utiliser `flashConfig.panierMystereCount` et calculer depuis les invendus.

---

### I2. Adresse hardcodée dans `cart-sidebar.tsx`
```typescript
<p className="text-[#2C1810] text-sm font-medium">42 Rue de la Boulangerie, Paris</p>
```

**Fix :** Récupérer depuis les paramètres de la boulangerie.

---

### I3. Heure de retrait fixe
**Fichier :** `components/cart-sidebar.tsx`

```typescript
heure_retrait: '08:00',  // Hardcodé
```

**Fix :** Permettre au boulanger de configurer ses créneaux.

---

### I4. Slug boulangerie en fallback
**Fichier :** `components/cart-sidebar.tsx`

```typescript
const BAKERY_SLUG = process.env.NEXT_PUBLIC_BAKERY_SLUG ?? 'artisan-dore';
```

**Problème :** En multi-tenant, le slug doit être dynamique.

---

### I5. Email expéditeur hardcodé
**Fichier :** `app/api/orders/confirm-email/route.ts`

```typescript
from: 'BakeryOS <commandes@votreboulangerie.fr>'
```

**Fix :** Configurer par boulangerie ou utiliser un domaine vérifié.

---

### I6. `any` trop fréquent
Plusieurs fichiers utilisent `any` dans les mappings Supabase :
- `context/boulanger-context.tsx` : `journee.stocks_journaliers.map((s: any) => ...)`
- `app/boulanger/commandes/page.tsx` : `(c: any) => ...`

**Fix :** Définir des types précis.

---

### I7. Polling au lieu de Realtime
**Fichier :** `app/boulanger/commandes/page.tsx`

```typescript
const interval = setInterval(loadOrders, 60_000);
```

**Problème :** Polling toutes les 60s au lieu de Supabase Realtime.

**Fix :** Utiliser `supabase.channel().on('postgres_changes', ...)`.

---

## 🗑️ FICHIERS NON UTILISÉS / REDONDANTS

### F1. Composants UI shadcn non utilisés
Dans `/components/ui/` :
- `carousel.tsx` - non utilisé
- `drawer.tsx` - non utilisé
- `menubar.tsx` - non utilisé
- `navigation-menu.tsx` - non utilisé
- `slider.tsx` - non utilisé
- `toggle-group.tsx` - non utilisé
- `input-otp.tsx` - non utilisé
- `resizable.tsx` - non utilisé
- `hover-card.tsx` - non utilisé

**Recommandation :** Supprimer ou conserver pour usage futur.

---

### F2. `lib/products.ts` en doublon
Ce fichier contient des produits statiques hardcodés qui servent de fallback, mais qui sont en conflit potentiel avec les données Airtable.

---

## ✅ FONCTIONNALITÉS FONCTIONNELLES

| Fonctionnalité | Status | Fichier(s) |
|---|---|---|
| Authentification boulanger | ✅ Fonctionnel | `app/api/boulanger/auth/route.ts`, `components/boulanger/login-form.tsx` |
| Gestion journée (Matin/Snapshot/Soir) | ✅ Fonctionnel | `components/boulanger/vue-*.tsx` |
| Dashboard statistiques | ✅ Fonctionnel | `components/boulanger/dashboard.tsx` |
| Click & Collect | ✅ Fonctionnel | `components/click-collect.tsx`, `components/cart-sidebar.tsx` |
| Gestion commandes | ✅ Fonctionnel | `app/boulanger/commandes/page.tsx` |
| Notifications push | ⚠️ Partiel | Nécessite clés VAPID |
| PWA | ⚠️ Partiel | Icônes manquantes |
| Proxy Airtable sécurisé | ✅ Fonctionnel | `app/api/boulanger/airtable/route.ts` |
| Chiffrement clés Airtable | ✅ Fonctionnel | `migrations/migration-2.sql`, `app/api/boulanger/profil/route.ts` |
| Rate limiting | ⚠️ Partiel | Non adapté serverless |
| Email confirmation Resend | ✅ Fonctionnel | `app/api/orders/confirm-email/route.ts` |
| Landing page | ✅ Fonctionnel | `app/page.tsx`, `components/landing-client.tsx` |
| Dark theme app boulanger | ✅ Fonctionnel | `app/boulanger/page.tsx` |
| Suggestions paniers | ✅ Fonctionnel | `components/boulanger/vue-soir.tsx` |

---

## ❌ FONCTIONNALITÉS NON FONCTIONNELLES / PARTIELLES

| Fonctionnalité | Status | Problème |
|---|---|---|
| Catalogue natif | ❌ Non implémenté | 100% dépendant d'Airtable |
| Suggestions ML production | ❌ Codé en dur | `+30% week-end` hardcodé |
| Realtime commandes | ❌ Non implémenté | Polling au lieu de websockets |
| Flash invendus dynamique | ⚠️ Partiel | `BASKETS_TAKEN = 5` hardcodé |
| Multi-boulangerie | ❌ Non implémenté | Architecture mono-tenant |
| Onboarding guidé | ❌ Non implémenté | Pas de wizard première connexion |
| Historique client | ❌ Non implémenté | Pas de page `/commandes` client |
| Export PDF | ❌ Non implémenté | Pas de rapport hebdomadaire |
| Sitemap.xml | ❌ Manquant | SEO impacté |
| Robots.txt | ❌ Manquant | SEO impacté |

---

## 🔵 COURT TERME — 30 jours

### 1. Corriger les bugs critiques
- [ ] BC1 : Uniformiser `retiree` vs `recuperee`
- [ ] BC2 : Générer les icônes PWA
- [ ] BC3 : Migrer rate limiting vers Upstash Redis

### 2. Sécurité
- [ ] S1 : Validation explicite des variables d'env
- [ ] S2 : Générer clés VAPID (si non configurées)
- [ ] S3 : Exiger `INTERNAL_API_SECRET` en production

### 3. SEO
- [ ] Créer `app/sitemap.ts`
- [ ] Créer `public/robots.txt`

---

## 🟢 MOYEN TERME — 30 à 90 jours

### 4. Catalogue natif
- Table `produits` Supabase
- Page `/boulanger/catalogue`
- Upload photo vers Supabase Storage
- Airtable devient optionnel

### 5. Realtime commandes
- Remplacer `setInterval` par Supabase Realtime

### 6. Suggestions de production réelles
- Régression sur l'historique réel
- Afficher les données du jour précédent

### 7. Flash invendus dynamique
- Connecter `FlashBanner` aux stocks réels

### 8. Page d'onboarding
- Wizard 4 étapes pour nouveaux boulangers

---

## 🟣 LONG TERME — 90+ jours

### 9. Multi-utilisateurs par boulangerie
### 10. Export PDF rapport hebdomadaire
### 11. Intégration caisse (Lightspeed/Zelty)
### 12. Application mobile native
### 13. API publique + webhooks

---

## 💰 Packs tarifaires — Révision

### 🥖 STARTER — 19€/mois
- Gestion journée complète
- Dashboard stats — 30 jours
- Catalogue natif — 20 produits
- Click & Collect — 50 commandes/mois
- Flash Invendus automatique
- Notifications push
- 1 utilisateur

### 🥐 PRO — 49€/mois
- Tout Starter +
- Catalogue illimité
- 3 utilisateurs
- Click & Collect illimité
- Suggestions ML
- Export PDF hebdomadaire
- Realtime commandes

### 🏆 MULTI — 99€/mois
- Tout Pro +
- Boulangeries illimitées
- Utilisateurs illimités
- Dashboard consolidé
- Export comptable FEC
- API access + webhooks

---

## 📈 Projection MRR à 12 mois

| Pack | Clients (conserv.) | MRR | Clients (optim.) | MRR |
|---|---|---|---|---|
| Starter | 200 | 3 800€ | 400 | 7 600€ |
| Pro | 60 | 2 940€ | 120 | 5 880€ |
| Multi | 15 | 1 485€ | 30 | 2 970€ |
| **Total** | **275** | **8 225€/mois** | **550** | **16 450€/mois** |

**ARR conservateur : ~99 000€**