# Roadmap BakeryOS 🥖
*Mis à jour après audit complet du code — 14 mars 2026*

---

## RAPPORT D'AUDIT — Notes actuelles

| Critère | Note | Δ session | Justification |
|---|---|---|---|
| Présentation | 76/100 | = | Landing premium, dark theme soigné, animations Framer Motion. Manque : micro-interactions compteurs, onboarding guidé. |
| Service / Produit | 76/100 | +8 | Catalogue natif Supabase livré. Flash anti-gaspi end-to-end fonctionnel. Airtable devient optionnel. |
| Fonctionnalités | 78/100 | +12 | Paniers anti-gaspi avec modale détail. FlashBanner lue depuis Supabase (vrais invendus). Page commandes avec section flash. Multi-tenant sous-domaines. |
| SEO | 74/100 | = | sitemap, robots, JSON-LD, H1/H2 sémantiques, Open Graph complet. Manque : Search Console soumission. |
| Sécurité | 88/100 | +14 | RLS hermétique sur stocks_journaliers. Fonctions SQL SECURITY DEFINER. Route /api/products remplacée. Slug resolver multi-tenant. |
| Qualité code | 72/100 | -4 | resolve-slug.ts centralisé. useSlug hook propre. **MAIS : déconnexion data flow vues/context, données hardcodées, TODO non résolus.** |
| Attractivité investisseur | 64/100 | +4 | Architecture multi-tenant documentée. Sécurité niveau production. Manque traction prouvée. |

**Moyenne : 75/100** *(−1 vs session précédente 76/100 après audit approfondi)*

---

## 🚨 NOUVEAUX BUGS IDENTIFIÉS — Audit 14/03/2026

### B1 — Déconnexion data flow vues boulanger/context 🔴 CRITIQUE
**Fichiers concernés :** `components/boulanger/vue-matin.tsx`, `vue-soir.tsx`, `vue-snapshot.tsx`

**Problème :** Les 3 vues boulanger utilisent des états locaux avec données hardcodées au lieu d'utiliser le `BoulangerContext`.

```typescript
// vue-matin.tsx — lignes 63-70
useEffect(() => {
  // TODO: fetch depuis /api/boulanger/journee pour pré-remplir les quantités
  setProduits([
    { id: '1', nom: 'Baguette tradition', ... },  // ❌ Hardcodé
  ]);
}, []);

// Pourtant le context fournit :
const { todayStocks, productionSuggestions, updateProduction } = useBoulanger();
```

**Conséquence :**
- `productionSuggestions` du context n'est jamais utilisé
- Les modifications dans vue-matin ne sync pas avec `todayStocks`
- Double source de vérité → incohérences

**Correction :** Utiliser `todayStocks` et `productionSuggestions` du context.

---

### B2 — vue-soir.tsx : context non utilisé 🔴 CRITIQUE
**Fichier :** `components/boulanger/vue-soir.tsx`

```typescript
// Ligne 82
const { } = useBoulanger(); // contexte disponible si besoin futur
```

**Problème :** Le context est importé mais déstructuré vide. La vue utilise son propre état local `produits` hardcodé au lieu de `todayStocks`.

**Conséquence :**
- Paniers flash calculés sur des données fictives
- Clôture de journée non connectée à `closeDayAndSave`

---

### B3 — vue-snapshot.tsx : même problème 🔴 CRITIQUE
**Fichier :** `components/boulanger/vue-snapshot.tsx`

```typescript
// Ligne 75
const { } = useBoulanger(); // contexte disponible si besoin futur
```

**Problème :** Identique à vue-soir. Le snapshot utilise des données locales au lieu de `todayStocks`.

**Conséquence :**
- Snapshots non persistés via le context
- `updateSnapshot` et `validateSnapshot` du context non appelés

---

### B4 — debouncedSync vide dans vue-matin.tsx 🟡 MOYEN
**Fichier :** `components/boulanger/vue-matin.tsx`

```typescript
// Lignes 95-98
const debouncedSync = (id: string, delta: number) => {
  // updateProduction est appelé via useEffect sur `produits`
  // pour regrouper les appels
};
```

**Problème :** Fonction vide avec commentaire indiquant que la sync devrait se faire... mais il n'y a pas de useEffect qui appelle `updateProduction`.

---

### B5 — flash-section.tsx : heure de début hardcodée 🟡 MOYEN
**Fichier :** `components/flash-section.tsx`

```typescript
// Ligne 180 dans useCountdown
setIsLive(hour >= 18 && hour < heureFin);  // ❌ 18h hardcodé
```

**Problème :** L'heure de début du flash est hardcodée à 18h au lieu d'utiliser `heureDebut` de l'API.

**Correction :**
```typescript
setIsLive(hour >= heureDebut && hour < heureFin);
```

---

### B6 — catalogue.tsx : drag & drop non fonctionnel 🟡 MOYEN
**Fichier :** `components/boulanger/catalogue.tsx`

```typescript
// Ligne 122
<ProduitCard
  isDragging={false}           // ❌ Toujours false
  dragHandleProps={{}}         // ❌ Objet vide
/>
```

**Problème :** Les props de drag & drop sont passés vides. Le drag n'est pas réellement implémenté malgré la présence de `reordonner` dans le hook.

**Conséquence :** La fonction `reordonner` existe mais n'est jamais appelée.

---

### B7 — migration-7 : jointure fragile par nom 🟡 MOYEN
**Fichier :** `migrations/migration-7-produits-complet.sql`

```sql
-- Ligne 229
LEFT JOIN produits p ON p.boulangerie_id = v_boulangerie_id
                     AND p.nom = sj.produit_nom -- join approximatif par nom
```

**Problème :** Jointure par nom de produit au lieu de `produit_id`. Si deux produits ont le même nom ou si un produit est renommé, la jointure échoue.

**Correction :** Utiliser `produit_id` stocké dans `stocks_journaliers`.

---

### B8 — migration-7 : heures flash hardcodées 🟡 MOYEN
**Fichier :** `migrations/migration-7-produits-complet.sql`

```sql
-- Lignes 195-197
v_heure_debut    INT  := 18;
v_heure_fin      INT  := 20;
v_remise         INT  := 40;
```

**Problème :** Les heures et la remise flash sont hardcodées dans la fonction SQL au lieu d'être lues depuis la table `boulangeries`.

---

### B9 — api/products/route.ts : typo potentiel 🟢 MINEUR
**Fichier :** `app/api/products/route.ts`

```typescript
// Ligne 91
estInvendu:   record.fields?.est_invende ?? false,  // ⚠️ "est_invende" au lieu de "est_invendu" ?
```

**Problème :** Possible typo dans le nom du champ Airtable. À vérifier selon le schéma Airtable.

---

### B10 — DEFAULT_STOCKS duplique la table produits 🟡 MOYEN
**Fichier :** `context/boulanger-context.tsx`

```typescript
// Lignes 38-48
const DEFAULT_STOCKS: StockEntry[] = [
  { id: 'b1', name: 'Baguette Tradition', ... },
  // ... 9 produits hardcodés
];
```

**Problème :** Double source de vérité :
1. `DEFAULT_STOCKS` dans le context (hardcodé)
2. Table `produits` dans Supabase

**Conséquence :** Les produits créés via le catalogue ne sont pas synchronisés avec `DEFAULT_STOCKS`.

**Correction :** Charger les produits depuis l'API au lieu d'avoir des données par défaut.

---

### B11 — any dans api/products/route.ts 🔴 OUVERT
**Fichier :** `app/api/products/route.ts`

```typescript
// Lignes 76-77, 85
function getAirtableImageUrl(record: any): string { ... }
function parseProduct(record: any): AirtableProduct { ... }
```

**Problème :** Utilisation de `any` au lieu de types Airtable explicites.

---

## BUGS DÉJÀ DOCUMENTÉS (confirmés)

| ID | Description | Statut | Fichier |
|---|---|---|---|
| I2 | Adresse hardcodée `42 Rue de la Boulangerie, Paris` | 🔴 OUVERT | `cart-sidebar.tsx` |
| I3 | Heure de retrait fixe `08:00` | 🔴 OUVERT | `cart-sidebar.tsx` |
| I5 | Email expéditeur multi-tenant sans fallback | 🟡 PARTIEL | - |
| I6 | `/api/products` toujours accessible | 🔴 OUVERT | `app/api/products/route.ts` |

---

## INCOHÉRENCES ARCHITECTURALES

### IA1 — Flux de données non connecté
```
┌─────────────────┐     ┌──────────────────┐
│ BoulangerContext│     │ VueMatin/VueSoir │
│ ─────────────── │     │ ──────────────── │
│ todayStocks     │ ❌  │ produits (local) │
│ productionSugg. │ ❌  │ suggestions (loc)│
│ updateProduction│ ❌  │ setProduits      │
└─────────────────┘     └──────────────────┘
```

**Solution :** Les vues doivent consommer et modifier l'état du context, pas gérer leur propre état local.

### IA2 — Double source produits
```
DEFAULT_STOCKS (context) ←→ Table produits (Supabase)
        ↑                          ↑
   Non synchronisés         Catalogue CRUD
```

---

## QUALITÉ CODE — Checklist mise à jour

| Point | Statut |
|---|---|
| any dans boulanger-context.tsx | ✅ CORRIGÉ |
| any dans commandes/page.tsx | ✅ CORRIGÉ |
| Rate limit async (Upstash) | ✅ CORRIGÉ |
| DbCommande.statut type | ✅ CORRIGÉ |
| Suggestions ML hardcodées | 🔴 PARTIEL (context OK, vue-matin non connecté) |
| Realtime commandes (setInterval) | ✅ CORRIGÉ |
| FlashBanner dynamique (Supabase) | ✅ CORRIGÉ |
| Slug boulangerie multi-tenant | ✅ CORRIGÉ |
| TypeScript null safety use-flash-paniers | ✅ CORRIGÉ |
| resolve-slug centralisé | ✅ OK |
| useSlug hook propre | ✅ OK |
| any dans api/products/route.ts | 🔴 OUVERT |
| **Data flow vues/context** | 🔴 **NOUVEAU** |
| **Données hardcodées vues** | 🔴 **NOUVEAU** |
| **Drag & drop catalogue** | 🔴 **NOUVEAU** |

---

## VARIABLES D'ENVIRONNEMENT — État complet

### Requises (bloquantes en prod)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Multi-tenant
NEXT_PUBLIC_ROOT_DOMAIN=bakeryos.fr
# NEXT_PUBLIC_BAKERY_SLUG=artisan-dore  # optionnel, override du sous-domaine

# Sécurité
INTERNAL_API_SECRET=<openssl rand -hex 32>
AIRTABLE_ENCRYPTION_KEY=<openssl rand -hex 32>
AIRTABLE_ENCRYPTION_SECRET=<même valeur>
```

### Optionnelles (fonctionnalités additionnelles)
```env
# Email
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=commandes@votredomaine.fr

# Push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT_EMAIL=mailto:contact@bakeryos.fr

# Rate limiting (recommandé en prod)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

---

## SÉCURITÉ — État actuel

| Problème | Statut |
|---|---|
| S1. Variables Supabase null as any | ✅ CORRIGÉ |
| S2. Clés VAPID manquantes | ⚠️ À CONFIGURER |
| S3. INTERNAL_API_SECRET optionnel prod | ✅ CORRIGÉ |
| S4. Clés Airtable chiffrées pgcrypto | ✅ OK |
| S5. Rate limiting IP cross-instances | ✅ CORRIGÉ |
| S6. RLS Supabase de base | ✅ OK |
| S7. RLS stocks_journaliers hermétique | ✅ CORRIGÉ |
| S8. Route /api/products publique | ⚠️ TOUJOURS ACCESSIBLE |
| S9. Données flash depuis Airtable | ✅ CORRIGÉ |
| S10. Résolution slug non validée | ✅ CORRIGÉ |

---

## COURT TERME — Actions prioritaires

### 🔴 BLOQUANT — Corriger le data flow (2-3j)
- [ ] **B1** : Connecter vue-matin.tsx à `todayStocks` et `productionSuggestions` du context
- [ ] **B2** : Connecter vue-soir.tsx à `todayStocks` et `closeDayAndSave` du context
- [ ] **B3** : Connecter vue-snapshot.tsx à `todayStocks` et `updateSnapshot` du context
- [ ] **B10** : Remplacer DEFAULT_STOCKS par un chargement depuis l'API

### 🟡 IMPORTANT — Qualité (1-2j)
- [ ] **B5** : Utiliser `heureDebut` au lieu de 18h hardcodé dans flash-section
- [ ] **B6** : Implémenter le drag & drop dans catalogue.tsx ou supprimer le code mort
- [ ] **B7** : Corriger la jointure par nom dans get_paniers_flash()
- [ ] **B4** : Implémenter ou supprimer `debouncedSync` vide

### Priorité 1 — Actions immédiates (< 1h chacune)
- [ ] Exécuter `migration-6-produits-securite.sql` et `migration-7-produits-complet.sql`
- [ ] Décommenter et adapter le bloc seed avec votre slug
- [ ] Ajouter `NEXT_PUBLIC_ROOT_DOMAIN=bakeryos.fr` dans Netlify
- [ ] `npx web-push generate-vapid-keys` → ajouter VAPID keys
- [ ] Soumettre sitemap.xml dans Google Search Console

### Priorité 2 — Bugs client
- [ ] **I2** : Adresse dynamique depuis `boulangerie.adresse` dans cart-sidebar
- [ ] **I3** : Créneaux de retrait configurables dans /boulanger/parametres
- [ ] **I6** : Déprécier `/api/products` → rediriger vers `/api/catalogue/:slug`

---

## MOYEN TERME — 30 à 90 jours

### Catalogue natif (priorité commerciale n°1)
La `migration-6` et `migration-7` créent la table `produits` complète. Interface CRUD à finaliser :
- ✅ Page `/boulanger/catalogue` : liste, ajout, modification, suppression
- ⚠️ Upload photo (Storage) — code présent mais à tester
- 🔴 Drag & drop réordonnancement — non fonctionnel
- Limites par plan (20 produits Starter / illimité Pro+)

### Configuration flash dynamique
Actuellement hardcodé à 18h–20h / −40%. Rendre configurable :
- Champs `flash_heure_debut`, `flash_heure_fin`, `flash_remise` dans `boulangeries`
- Interface dans `/boulanger/parametres`
- Mettre à jour `get_paniers_flash()` pour lire ces valeurs

### Multi-utilisateurs par boulangerie
- Table `boulangerie_membres(boulangerie_id, user_id, role)`
- Rôles : owner, manager, vendeuse
- RLS ajustée pour permettre l'accès en lecture aux membres

### Améliorations ML production
- Pondération exponentielle (jours récents > jours anciens)
- Prise en compte météo OpenMeteo (pluie → moins de fréquentation)
- Prise en compte des événements (jours fériés, vacances scolaires)

---

## LONG TERME — 90+ jours

- Export PDF rapport hebdomadaire (@react-pdf/renderer)
- QR code retrait (npm qrcode) — scanné en boutique
- Rapport CO₂ mensuel — invendus évités × 0.6 kg CO₂/kg + certificat PDF
- Intégration caisse Lightspeed/Zelty (webhook → supprime saisie manuelle)
- Mode fermeture exceptionnelle (toggle dans /parametres)
- Messagerie push clients ("Croissant sorti du four")
- Export FEC comptable
- API publique + webhooks (plan Multi)
- Dashboard multi-sites consolidé (plan Multi)

---

## TARIFICATION — Stratégie et justification

### Packs

| Fonctionnalité | Starter 19€/mois | Pro 49€/mois | Multi 99€/mois |
|---|---|---|---|
| Gestion journée + Dashboard | ✓ | ✓ | ✓ |
| Flash invendus automatique | ✓ | ✓ | ✓ |
| Suggestions ML production | ✓ | ✓ | ✓ |
| Notifications push commandes | ✓ | ✓ | ✓ |
| Click & Collect | 50 cmd/mois | Illimité | Illimité |
| Catalogue produits natifs | 20 produits | Illimité | Illimité |
| Utilisateurs | 1 | 3 | Illimité |
| Email confirmation Resend | ✓ | ✓ | ✓ |
| Rapport PDF hebdomadaire | — | ✓ | ✓ |
| Certificat CO₂ mensuel | — | ✓ | ✓ |
| Multi-boulangeries | — | — | ✓ |
| Export comptable FEC | — | — | ✓ |
| API publique + webhooks | — | — | ✓ |
| Support | Email 48h | Email 24h | Slack dédié |

---

## PROJECTION MRR À 12 MOIS

| Pack | Clients conserv. | MRR | Clients optim. | MRR |
|---|---|---|---|---|
| Starter | 200 | 3 800€ | 400 | 7 600€ |
| Pro | 60 | 2 940€ | 120 | 5 880€ |
| Multi | 15 | 1 485€ | 30 | 2 970€ |
| **Total** | **275** | **8 225€/mois** | **550** | **16 450€/mois** |

ARR conservateur : ~99 000€ · Seuil de rentabilité : ~180 clients

---

## GTM

**M1–M3 : Beta fermée (0 → 10 boulangers)**
Recrutement Instagram #boulangerie. Beta gratuite 3 mois contre feedback + témoignage. Objectif : valider le catalogue natif et les suggestions ML avec de vraies données.

**M3–M6 : Croissance organique (10 → 50)**
Confédération Nationale Boulangerie. SEO longue traîne. Programme referral 2 mois offerts.

**M6–M12 : Accélération (50 → 275)**
Europain/SIRHA. Partenariat meuniers (Viron, Épi de France). Webinaires "Réduire ses invendus de 30% en 30 jours".

---

## ÉTAT DES FONCTIONNALITÉS

| Fonctionnalité | Statut |
|---|---|
| Auth boulanger OTP | ✅ OK |
| Gestion journée Matin/Snapshot/Soir | ⚠️ **Data flow cassé** |
| Suggestions production ML | ⚠️ **Context OK, vues non connectées** |
| Dashboard statistiques | ✅ OK |
| Click & Collect + checkout | ✅ OK |
| Gestion commandes Realtime | ✅ OK |
| Email confirmation Resend | ✅ OK |
| Rate limiting Upstash Redis | ✅ OK (à configurer) |
| Landing SEO complète | ✅ OK |
| Structured data JSON-LD | ✅ OK |
| Flash invendus depuis Supabase | ✅ OK |
| Paniers anti-gaspi avec modale | ✅ OK |
| RLS hermétique stocks | ✅ OK |
| Fonctions SQL SECURITY DEFINER | ✅ OK |
| Multi-tenant sous-domaines | ✅ OK |
| Table produits native | ✅ OK (migration à exécuter) |
| Notifications push | ⚠️ Partiel — clés VAPID à configurer |
| PWA installable | ✅ OK |
| Page /boulanger/catalogue CRUD | ⚠️ **Drag & drop HS** |
| Onboarding wizard | 🔴 Non |
| Export PDF | 🔴 Non |
| Rapport CO₂ | 🔴 Non |

---

## RÉSUMÉ DES NOUVEAUX BUGS

| ID | Sévérité | Description | Fichier |
|---|---|---|---|
| B1 | 🔴 CRITIQUE | Déconnexion data flow vue-matin/context | `vue-matin.tsx` |
| B2 | 🔴 CRITIQUE | Context non utilisé dans vue-soir | `vue-soir.tsx` |
| B3 | 🔴 CRITIQUE | Context non utilisé dans vue-snapshot | `vue-snapshot.tsx` |
| B4 | 🟡 MOYEN | debouncedSync vide | `vue-matin.tsx` |
| B5 | 🟡 MOYEN | Heure début flash hardcodée 18h | `flash-section.tsx` |
| B6 | 🟡 MOYEN | Drag & drop catalogue non fonctionnel | `catalogue.tsx` |
| B7 | 🟡 MOYEN | Jointure fragile par nom | `migration-7` |
| B8 | 🟡 MOYEN | Heures flash hardcodées SQL | `migration-7` |
| B9 | 🟢 MINEUR | Typo potentiel est_invende | `api/products/route.ts` |
| B10 | 🟡 MOYEN | DEFAULT_STOCKS duplique produits | `boulanger-context.tsx` |
| B11 | 🔴 OUVERT | any dans parseProduct | `api/products/route.ts` |

---

*Mis à jour le 14/03/2026 — Audit complet du code*
*Prochain audit recommandé : après correction des bugs critiques B1, B2, B3*