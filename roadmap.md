# Roadmap BakeryOS 🥖
*Mis à jour — 15 mars 2026*

---

## SCORE DE RÉUSSITE À 12 MOIS — 72 / 100

| Dimension | Score | Poids | Commentaire |
|---|---|---|---|
| Développement | 84/100 | 20% | Stack solide, 30+ fichiers patchés, 7 vulnérabilités corrigées, logique stock cohérente end-to-end |
| Fonctionnel | 80/100 | 20% | Core loop complet + flash dynamique + adresse/créneaux + catalogue starter. Reste : SMTP, PDF rapport |
| Marché | 55/100 | 15% | ~5 000–8 000 boulangeries cibles. Marché conservateur mais ROI démontrable |
| Use case | 80/100 | 15% | ROI < 30 jours. Logique snapshot → soir plafonnée correctement, aucune fausse alerte |
| Offre & Demande | 62/100 | 15% | Vitrine + Stripe opérationnels = conversion self-service possible |
| Économique | 48/100 | 10% | Tarification à aligner entre landing et app |
| Concurrence | 62/100 | 5% | Pas de concurrent direct sur le segment artisanal FR |

**Score global : 72 / 100 (+4 pts depuis la dernière révision)**

> "Réussite" = 50+ boulangers payants, MRR > 2 500€, produit stable en production.

---

## CE QUI A ÉTÉ LIVRÉ DEPUIS LA DERNIÈRE RÉVISION

### ✅ Audit sécurité complet (7 vulnérabilités corrigées)

| Sévérité | Route | Fix |
|---|---|---|
| 🔴 | `/api/orders` POST | `sanitizeText()` + bornes prix/quantité sur lignes JSONB |
| 🔴 | `/api/boulanger/profil` PATCH | `sanitizeText()` + Zod strict |
| 🔴 | `/api/orders/[id]` | `isValidUUID()` sur `params.id` |
| 🟡 | `/api/boulanger/journee` POST | `commandesOnline` borné [0, 9999] |
| 🟡 | `/api/boulanger/historique` GET | `parseInt + isNaN + Math.min(n, 90)` |
| 🟡 | `/api/catalogue/[slug]` | SLUG_REGEX server-side |
| 🟡 | `/api/paniers/[slug]` | SLUG_REGEX server-side |

### ✅ Migration Next.js 14 + dépendances
`package.json` : `next@14.2.29`, `react@18.3.1`, `typescript@5.4.5`, `tailwindcss@3.4.17`, suppression flags `experimental` dans `next.config.js`.

### ✅ 4 features roadmap livrées

**Config Flash UI** — Sliders heure début/fin + remise dans Paramètres. Preview temps réel. Sauvegardé en DB, lu dynamiquement par `FlashBanner`, `FlashSection`, `useFlashPaniers`, `get_paniers_flash()`.

**Créneaux de retrait configurables** — Interface ajout/suppression créneaux HH:MM dans Paramètres. `CartSidebar` affiche les boutons sélectionnables dynamiquement. `heure_retrait` envoyée dans la commande.

**Adresse boulangerie dynamique** — Champs Adresse/Ville/Code postal/Téléphone dans Paramètres. Footer SSR via `app/page.tsx`. `CartSidebar` et `click-collect.tsx` consomment `/api/catalogue/:slug` enrichi.

**CatalogueStarter branché** — Catalogue vide → `CatalogueStarter` s'affiche automatiquement. Création batch en série. Bouton "Démarrage rapide" ré-accessible depuis l'état vide.

### ✅ Nouvelle route API publique
`GET /api/boulangerie/:slug` — infos vitrine (adresse, créneaux, config flash). Cache CDN 5 min. Aucune donnée sensible.

### ✅ Migration DB
`migration-10-adresse-creneaux-flash.sql` — Ajoute `adresse`, `ville`, `code_postal`, `telephone`, `creneaux_retrait TEXT[]` à `boulangeries`. Idempotent.

### ✅ Refonte UX Espace Boulanger
Navigation repensée : 3 onglets principaux (Matin | Stock | Soir) + bouton "Plus" → drawer avec Produits, Statistiques, Paramètres. Gros boutons tactiles (`w-14 h-14`, `touch-manipulation`, `onPointerDown`). Bouton "Valider production" avec feedback vert 4s.

### ✅ Corrections bugs snapshot/stock (3 bugs racines)

**Problème** : snapshots et stockFinal initialisés avec les valeurs DB (= production) au lieu de 0.

**Corrections dans `context/boulanger-context.tsx`** :
- `mapDbStockToEntry` : snapshot non validé → 0
- `loadTodayData` : `entry.stockFinal = 0` si journée non clôturée
- `updateProduction` : ne copie plus la production dans les snapshots
- `updateSnapshot` slot 14h : max = `snapshot10h` si validé, sinon `production`
- `updateStockFinal` : plafond = `snapshot14h` > `snapshot10h` > `production`

**Corrections dans `components/boulanger/vue-snapshot.tsx`** :
- `alertes` : `reste > 0 &&` ajouté (fausses alertes au chargement éliminées)
- `base` slot 14h : fallback sur `production` si `snapshot10h = 0`

**Corrections dans `components/boulanger/vue-soir.tsx`** :
- `maxInvendus` = dernier snapshot validé (14h > 10h > production)
- Sous-texte affiche la référence utilisée : `Snapshot 14h : X restants`
- `max={maxInvendus}` passé à `StockFinalCell`

### ✅ Logique de plafonnement cohérente et complète

```
Matin     → production           (saisie libre)
Stock 10h → min(val, production)
Stock 14h → min(val, snapshot10h si validé, sinon production)
Soir      → min(val, snapshot14h si validé > snapshot10h si validé > production)
```

Cette logique est appliquée en **double couche** : composant (UI) + contexte (état). Même si le composant est contourné, le contexte plafonne.

---

## ÉTAT DU PROJET — MISE À JOUR COMPLÈTE

### App (`project-boulangerie`)

| Composant | Statut |
|---|---|
| Auth boulanger (email + password) | ✅ |
| Auth client (OTP Magic Link) | ✅ |
| Core loop Matin/Snapshot/Soir | ✅ |
| Logique snapshot plafonnée (bug corrigé) | ✅ **NOUVEAU** |
| Aucune fausse alerte au chargement | ✅ **NOUVEAU** |
| Invendus Soir ≤ dernier snapshot validé | ✅ **NOUVEAU** |
| Suggestions ML production | ✅ |
| Dashboard stats historique | ✅ |
| Catalogue CRUD + drag & drop | ✅ |
| CatalogueStarter branché | ✅ **NOUVEAU** |
| Upload photos + compression WebP | ✅ |
| Flash invendus temps réel | ✅ |
| Config flash depuis l'UI | ✅ **NOUVEAU** |
| Créneaux de retrait configurables | ✅ **NOUVEAU** |
| Adresse boulangerie dynamique | ✅ **NOUVEAU** |
| Route publique `/api/boulangerie/:slug` | ✅ **NOUVEAU** |
| Click & Collect + checkout | ✅ |
| Page commandes Realtime | ✅ |
| Notifications push (VAPID configuré) | ✅ |
| Multi-tenant sous-domaines | ✅ |
| RLS + SECURITY DEFINER | ✅ |
| Sanitization inputs (7 routes) | ✅ **RENFORCÉ** |
| Migration DB consolidée v1.0 + migration-10 | ✅ **NOUVEAU** |
| UX boulanger — gros boutons tactiles | ✅ **NOUVEAU** |
| Nav 3 onglets + drawer Plus | ✅ **NOUVEAU** |
| Next.js 14 + dépendances à jour | ✅ **NOUVEAU** |
| SMTP custom Resend | ⚠️ À configurer Supabase Dashboard |
| Email bienvenue post-checkout | 🔴 Non implémenté |
| Export PDF rapport hebdomadaire | 🔴 Non implémenté |
| Rapport CO₂ mensuel | 🔴 Non implémenté |

---

## BUGS OUVERTS — MISE À JOUR

| ID | Sévérité | Description | Statut |
|---|---|---|---|
| ~~I1~~ | ~~🔴~~ | ~~Fausses alertes snapshot au chargement~~ | ✅ **CORRIGÉ** |
| ~~I2~~ | ~~🔴~~ | ~~Adresse hardcodée dans cart-sidebar~~ | ✅ **CORRIGÉ** |
| ~~I3~~ | ~~🔴~~ | ~~Créneaux de retrait hardcodés~~ | ✅ **CORRIGÉ** |
| ~~I4~~ | ~~🔴~~ | ~~Snapshots initialisés avec valeurs DB~~ | ✅ **CORRIGÉ** |
| ~~I5~~ | ~~🟡~~ | ~~Vue Soir : max invendus = production (trop permissif)~~ | ✅ **CORRIGÉ** |
| ~~CFG1~~ | ~~🟡~~ | ~~Heures/remise flash non éditables depuis l'UI~~ | ✅ **CORRIGÉ** |
| CFG2 | 🟡 | SMTP custom Resend non branché dans Supabase | ⚠️ Ouvert |
| LAND1 | 🔴 | Tarifs incohérents (landing 39/69/119€ vs app 19/49/99€) | ⚠️ Ouvert |
| LAND2 | 🔴 | Email bienvenue post-checkout non implémenté | ⚠️ Ouvert |
| LAND3 | 🟡 | Slug auto-généré peut créer des conflits | ⚠️ Ouvert |
| LAND4 | 🟡 | Price IDs Stripe sont des placeholders | ⚠️ Ouvert |
| I6 | 🟡 | `/api/products` (Airtable legacy) toujours accessible | ⚠️ Ouvert |

---

## COURT TERME — < 2 semaines

### 🔴 Bloquant lancement

- [ ] **LAND1** — Aligner les tarifs (recommandation : adopter 39/69/119€ de la landing, mettre à jour la limite `20 produits` et `50 cmd/mois` dans `app/api/boulanger/produits/route.ts`)
- [ ] **LAND4** — Créer les produits/prix dans Stripe Dashboard, remplacer les placeholders `.env`
- [ ] **LAND2** — Email de bienvenue post-checkout via Resend (lien setup password depuis webhook `checkout.session.completed`)
- [ ] **CFG2** — Brancher Resend SMTP custom dans Supabase Dashboard → Auth → SMTP Settings

### 🟡 Qualité

- [ ] **LAND3** — Gestion des conflits de slug (suffixe numérique ou vérification préalable avant insert)
- [ ] **I6** — Supprimer `/api/products` (legacy Airtable) ou le rediriger vers `/api/catalogue/:slug`
- [ ] Tester le flux end-to-end : landing → Stripe → webhook → app → première journée → clôture → stats
- [ ] Vérifier `migration-10-adresse-creneaux-flash.sql` sur une DB de prod avant déploiement

---

## MOYEN TERME — 30 à 90 jours

### Produit
- Email confirmation commande avec nom d'affichage dynamique par boulangerie (`Boulangerie Dupont via BakeryOS`)
- Export PDF rapport hebdomadaire (CA, taux invendu, meilleurs produits)
- Rapport CO₂ mensuel + certificat téléchargeable
- Alerte push stock bas (`stock_alerte` en DB, logique de comparaison avec `snapshot10h` à câbler dans `/api/boulanger/journee`)
- Onboarding guidé post-inscription : `CatalogueStarter` déclenché automatiquement à la première connexion (col `catalogue_initialized` sur `boulangeries`)

### Infrastructure
- Wildcard DNS `*.bakeryos.fr` → Netlify (une seule config, toutes les boulangeries automatiques)
- Supabase Pro ($25/mois) dès 20 boulangers (limite 500 MB DB Free)
- Monitoring Sentry sur les deux projets
- Tests E2E Playwright : flux commande + flux inscription + logique snapshot

### Acquisition
- Témoignages vidéo boulangers beta (données chiffrées : invendus réduits, CA flash généré)
- Programme referral : 2 mois offerts par boulangerie parrainée
- Contact Confédération Nationale de la Boulangerie et Pâtisserie Française

---

## LONG TERME — 90+ jours

- Multi-utilisateurs par boulangerie (owner / manager / vendeuse) avec rôles
- Intégration caisse Lightspeed/Zelty via webhook
- API publique + webhooks (plan Multi)
- Dashboard multi-sites consolidé (plan Multi)
- Export comptable FEC
- QR code retrait scanné en boutique
- Application mobile native (React Native)

---

## ARCHITECTURE GLOBALE — RAPPEL

```
bakery-saas-landing/          project-boulangerie/ (app)
─────────────────────         ────────────────────────────────
Next.js 16 / React 19         Next.js 14 / React 18.3
Tailwind 4                    Tailwind 3.4 + Framer Motion 12
Stripe (abonnements)          Supabase (auth, DB, storage)
Supabase (pré-création user)  Netlify (hébergement)
Vercel (recommandé)           *.bakeryos.fr (multi-tenant)

bakeryos.fr                   app.bakeryos.fr
  ↓ S'inscrire                  ↓ Accès espace boulanger
  ↓ Choisir plan                ↓ monpain.bakeryos.fr
  ↓ Stripe checkout             ↓ vitrine client
  ↓ Webhook → Supabase
  ↓ Email de bienvenue          ← MANQUANT (LAND2)
  ↓ → app.bakeryos.fr
```

---

## TARIFICATION — À ALIGNER (LAND1)

| Plan | Landing actuelle | App actuelle | **Recommandation** |
|---|---|---|---|
| Starter | 39€/mois | 19€/mois | **39€** |
| Pro | 69€/mois | 49€/mois | **69€** |
| Multi | 119€/mois | 99€/mois | **119€** |

Annuel −20% : 31 / 55 / 95€/mois.

Fichier à mettre à jour pour les limites plan : `app/api/boulanger/produits/route.ts` (ligne limite `20 produits` Starter) et `app/api/orders/route.ts` (limite `50 commandes/mois` si elle est ajoutée).

---

## LIMITES SUPABASE FREE À SURVEILLER

| Limite | Seuil | Action |
|---|---|---|
| 2 emails/h OTP | Bloquant en prod | SMTP Resend custom → **CFG2** |
| 500 MB DB | ~50 000 commandes | Passer Pro dès 20 boulangers |
| 5 GB bandwidth | ~200 boulangers actifs | Pro à partir de 50 |

---

## PROJECTION MRR À 12 MOIS

| Scénario | Clients | MRR | Probabilité |
|---|---|---|---|
| Pessimiste (solo, 0 budget) | 15–30 | 600–1 200€ | 25% |
| **Réaliste (referral + 1 salon)** | **40–80** | **1 600–3 100€** | **50%** |
| Optimiste (partenariat meunier) | 150–250 | 5 800–9 700€ | 25% |

Seuil rentabilité infra : ~10 clients Starter ou ~5 Pro.
Seuil intérêt investisseur seed : ~100 clients, MRR > 4 000€, churn < 5%/mois.

---

## NOTES TECHNIQUES

### Deux projets — règles de cohérence
- La DB Supabase est **partagée** entre les deux projets (même `SUPABASE_URL`)
- La landing utilise `SUPABASE_SERVICE_KEY`, l'app utilise `SUPABASE_SERVICE_ROLE_KEY` — même clé, noms différents
- Le webhook Stripe doit pointer vers la landing (`bakeryos.fr/api/stripe/webhook`), pas vers l'app
- L'app ne gère pas Stripe — elle lit uniquement `stripe_status` et `plan` depuis `boulangeries`

### Logique données temps réel (core loop)
- **Auto-save** : debounce 2s sur chaque modification, `syncStatus` visible en header
- **Double protection plafond** : contexte + composant — cohérents depuis la correction I4/I5
- **Clôture journée** : `PUT /api/boulanger/journee` → `cloturee = true` → rechargement historique → suggestions ML actualisées
- **Flash** : `get_paniers_flash()` SQL SECURITY DEFINER lit `flash_heure_debut/fin/remise_pct` depuis `boulangeries` — plus hardcodé

### DNS à configurer (une seule fois)
```
bakeryos.fr        → Vercel (landing)
app.bakeryos.fr    → Netlify (app)
*.bakeryos.fr      → Netlify (wildcard multi-tenant)
```

### Fichiers DB
- Migration principale : `migration-complete-v1.sql` (remplace migrations 1–9)
- Migration adresse/créneaux/flash : `migration-10-adresse-creneaux-flash.sql` ← **à exécuter**
- Seed : `seed.sql` (adapter le slug)

---

*Mis à jour le 15/03/2026 — v2.1*