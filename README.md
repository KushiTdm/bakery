# 🥖 BakeryOS — SaaS Boulangerie Artisanale

> Vitrine, click & collect, gestion anti-gaspillage en temps réel et espace boulanger.
> Architecture multi-tenant : chaque boulangerie sur son propre sous-domaine.

---

## Sommaire

- [Aperçu](#aperçu)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Fonctionnalités](#fonctionnalités)
- [Structure du projet](#structure-du-projet)
- [Variables d'environnement](#variables-denvironnement)
- [Installation](#installation)
- [Multi-tenant & déploiement](#multi-tenant--déploiement)
- [Sécurité](#sécurité)
- [Roadmap](#roadmap)

---

## Aperçu

BakeryOS est une solution SaaS pour boulangeries artisanales. Elle regroupe deux interfaces :

- **Le site client** (`/`) — vitrine, catalogue click & collect, flash invendus du soir en temps réel
- **L'espace boulanger** (`/boulanger`) — gestion production, stocks, invendus, commandes et statistiques

En production, chaque boulangerie dispose de son propre sous-domaine :
```
monpain.bakeryos.fr       → boulangerie "monpain"
boulangerie-dupont.bakeryos.fr → boulangerie "boulangerie-dupont"
```

---

## Stack technique

### Frontend

| Technologie | Version | Rôle |
|---|---|---|
| Next.js | 13.5 | App Router, SSR/SSG |
| React | 18.2 | UI, hooks, context |
| TypeScript | 5.2 | Typage statique |
| Tailwind CSS | 3.3 | Styling utility-first |
| Framer Motion | 12 | Animations |
| Lucide React | 0.446 | Icônes |

### Backend & services

| Service | Rôle |
|---|---|
| Supabase | Base de données, Auth, RLS, fonctions SQL |
| Supabase RPC | `get_catalogue_public()`, `get_paniers_flash()` — fonctions SECURITY DEFINER |
| Resend | Emails de confirmation commande |
| Upstash Redis | Rate limiting cross-instances serverless |
| Netlify | Hébergement, CI/CD, wildcard subdomains |

### Architecture de données

Airtable était utilisé pour le catalogue. Il est désormais **optionnel** — le catalogue natif est géré dans Supabase via la table `produits`. Les clés Airtable peuvent toujours être configurées pour les boulangeries qui préfèrent gérer leur catalogue depuis Airtable.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  monpain.bakeryos.fr (Browser)                       │
│                                                      │
│  ┌─────────────────┐    ┌──────────────────────┐    │
│  │  Site Client    │    │  Espace Boulanger    │    │
│  │  /              │    │  /boulanger          │    │
│  │                 │    │                      │    │
│  │  useSlug()      │    │  BoulangerContext    │    │
│  │  → "monpain"    │    │  Supabase Auth OTP  │    │
│  └────────┬────────┘    └──────────┬───────────┘    │
│           │                        │                 │
└───────────┼────────────────────────┼─────────────────┘
            │                        │ (JWT Bearer)
            ▼                        ▼
┌──────────────────────────────────────────────────────┐
│  Next.js API Routes (Netlify Functions)              │
│                                                      │
│  GET /api/catalogue/:slug   → anon key               │
│  GET /api/paniers/:slug     → anon key               │
│  POST /api/orders           → public + rate limit    │
│  /api/boulanger/*           → JWT auth requis        │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  Supabase                                            │
│                                                      │
│  get_catalogue_public(slug)  ← SECURITY DEFINER     │
│  get_paniers_flash(slug)     ← SECURITY DEFINER     │
│                                                      │
│  Tables (RLS activée sur toutes) :                  │
│  ├── boulangeries                                    │
│  ├── produits          ← catalogue natif             │
│  ├── journees                                        │
│  ├── stocks_journaliers ← jamais exposé public      │
│  ├── commandes                                       │
│  └── push_subscriptions                             │
└──────────────────────────────────────────────────────┘
```

### Flux paniers anti-gaspi (nouveau)

```
Boulanger saisit stock_final > 0 (espace boulanger)
        ↓
stocks_journaliers mis à jour dans Supabase
        ↓
get_paniers_flash(slug) — SQL SECURITY DEFINER
  → lit stock_final, retourne nom/emoji/prixFlash UNIQUEMENT
  → ne retourne jamais les quantités réelles ni le CA
        ↓
/api/paniers/:slug — route Next.js
        ↓
useFlashPaniers() — hook React, rafraîchissement 2min
        ↓
FlashSection + FlashBanner — affichage client
```

### Isolation des données (sécurité multi-tenant)

```
Client A (anon key) → get_catalogue_public("monpain")
  ✓ Voit uniquement les produits actifs de "monpain"
  ✗ Ne peut pas voir les produits de "boulangerie-dupont"
  ✗ Ne peut pas voir stocks_journaliers, journees, CA

SELECT * FROM stocks_journaliers (anon key)
  → 0 lignes (RLS bloque tout)
```

---

## Fonctionnalités

### Site client

#### Vitrine (`/`)
- Loading screen animé (SVG tracé + transitions de phase)
- Navbar intelligente (transparente → fond crème au scroll)
- **Flash Banner** — 3 états : Hidden / Teaser (compte à rebours) / Live (nb produits réels depuis Supabase)
- Hero, Savoir-faire, Ingrédients, Galerie masonry

#### Click & Collect
- Catalogue depuis Supabase (`/api/catalogue/:slug`) avec fallback local
- Filtres par catégorie (Boulangerie / Viennoiserie / Pâtisserie)
- **Flash Invendus** — données temps réel depuis `stocks_journaliers` Supabase
  - Hors horaire : teaser avec heure de lancement
  - En cours : modale avec contenu détaillé, prix barré, prix flash, économie réalisée
- **Panier** — sidebar animée, TVA 5.5%, checkout via Supabase Auth OTP
- Auth Magic Link (OTP email) — produit en attente ajouté automatiquement après connexion

### Espace boulanger (`/boulanger`)

Protégé par Supabase Auth OTP. Organisé en 4 onglets :

#### 🌅 Matin — Production
- Saisie par produit avec contrôles +/−
- **Suggestions ML** basées sur l'historique réel (par jour de semaine, confidence high/medium/low)
- Estimé CA en temps réel
- Bouton "Tout appliquer" les suggestions

#### 📸 Stock — Snapshot étagère
- Deux slots : 10h (après rush matinal) et 14h (après déjeuner)
- La vendeuse saisit ce qui **reste** — les ventes sont calculées automatiquement par différence
- Alerte amber si risque d'invendu (> 30% de stock restant)

#### 🌙 Soir — Bilan & Invendus
- KPIs (CA estimé, taux invendu, pièces produites/invendues)
- Stock final → déclenche l'affichage des paniers sur la vitrine client
- **Paniers suggérés** générés algorithmiquement (Petit-Déjeuner, Gourmand, Grand Panier)
- Flash invendus avec compte à rebours et prix −40%
- Suggestion production demain basée sur le taux d'invendu du jour
- Clôture de journée → sauvegarde en Supabase pour les stats

#### 📊 Stats — Dashboard
- Données réelles uniquement (s'alimente après chaque clôture)
- CA moyen/jour, taux invendu moyen, évolution sur la période
- Graphique barres CA / Invendus avec week-ends en surbrillance
- Tableau par produit avec barre colorée (vert < 5% / amber 5–8% / rouge > 8%)
- Recommandation automatique selon le taux observé

---

## Structure du projet

```
bakeryos/
├── app/
│   ├── api/
│   │   ├── catalogue/[slug]/route.ts   # Catalogue public (Supabase RPC)
│   │   ├── paniers/[slug]/route.ts     # Paniers flash temps réel (Supabase RPC)
│   │   ├── boulanger/
│   │   │   ├── airtable/route.ts       # Proxy Airtable (optionnel)
│   │   │   ├── auth/route.ts           # Login / register
│   │   │   ├── historique/route.ts     # Stats historiques
│   │   │   ├── journee/route.ts        # Journée courante (GET/POST/PUT)
│   │   │   └── profil/route.ts         # Profil boulangerie
│   │   ├── notifications/
│   │   │   ├── send/route.ts           # Envoi push
│   │   │   └── subscribe/route.ts      # Gestion abonnements
│   │   ├── orders/
│   │   │   ├── [id]/route.ts           # Statut commande
│   │   │   ├── confirm-email/route.ts  # Email Resend
│   │   │   └── route.ts               # Création / liste commandes
│   │   └── products/route.ts           # Legacy Airtable (déprécié)
│   ├── boulanger/
│   │   ├── commandes/page.tsx          # Page commandes + section flash
│   │   └── page.tsx                    # Shell espace boulanger
│   ├── auth/callback/route.ts
│   ├── reset-password/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── boulanger/
│   │   ├── dashboard.tsx
│   │   ├── login-form.tsx
│   │   ├── parametres.tsx
│   │   ├── push-notification-toggle.tsx
│   │   ├── vue-matin.tsx
│   │   ├── vue-snapshot.tsx
│   │   └── vue-soir.tsx
│   ├── seo/json-ld.tsx
│   ├── auth-modal.tsx
│   ├── cart-sidebar.tsx
│   ├── click-collect.tsx               # Catalogue Supabase + FlashSection
│   ├── flash-section.tsx               # Paniers anti-gaspi autonome + modale
│   ├── FlashBanner.tsx                 # Bannière (données Supabase)
│   ├── footer.tsx
│   ├── galerie.tsx
│   ├── hero.tsx / hero-cta.tsx
│   ├── ingredients.tsx
│   ├── landing-client.tsx
│   ├── Loadingscreen.tsx
│   ├── navbar.tsx
│   ├── product-card.tsx
│   ├── savoir-faire.tsx
│   └── sw-register.tsx
│
├── context/
│   ├── active-tab-context.tsx
│   ├── boulanger-context.tsx
│   └── cart-context.tsx
│
├── hooks/
│   ├── use-flash-paniers.ts            # Données flash depuis Supabase
│   ├── use-products.ts                 # Legacy Airtable (fallback)
│   ├── use-push-notifications.ts
│   ├── use-slug.ts                     # Hook résolution tenant
│   └── use-toast.ts
│
├── lib/
│   ├── products.ts                     # Catalogue local (fallback)
│   ├── rate-limit.ts                   # Upstash Redis + Map mémoire
│   ├── resolve-slug.ts                 # Logique multi-tenant centralisée
│   ├── supabase.ts
│   └── utils.ts
│
├── migrations/
│   ├── migration-1.sql                 # Schéma de base (boulangeries, journees, stocks)
│   ├── migration-2.sql                 # Stripe + chiffrement Airtable
│   ├── migration-3.sql                 # Table commandes
│   ├── migration-4-push-notifications.sql
│   ├── migration-5-fix-statut-recuperee.sql
│   └── migration-6-produits-securite.sql  # Table produits + RLS hermétique + SECURITY DEFINER
│
├── .env.local                          # Variables d'environnement (non versionné)
├── next.config.js
├── netlify.toml
├── tailwind.config.ts
└── tsconfig.json
```

---

## Variables d'environnement

Créer `.env.local` à la racine :

```env
# ── Supabase (requis) ──────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# ── Multi-tenant (requis en production) ───────────────────────
NEXT_PUBLIC_ROOT_DOMAIN=bakeryos.fr
# En dev, utiliser ?slug=artisan-dore dans l'URL
# Ou forcer un tenant : NEXT_PUBLIC_BAKERY_SLUG=artisan-dore

# ── Sécurité ──────────────────────────────────────────────────
INTERNAL_API_SECRET=                # openssl rand -hex 32
AIRTABLE_ENCRYPTION_KEY=            # openssl rand -hex 32
AIRTABLE_ENCRYPTION_SECRET=         # même valeur

# ── Email (requis pour confirmation commande) ─────────────────
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=commandes@votredomaine.fr

# ── Push notifications (optionnel) ────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CONTACT_EMAIL=mailto:contact@bakeryos.fr

# ── Rate limiting (recommandé en production) ──────────────────
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...

# ── Airtable (optionnel — si catalogue Airtable préféré) ──────
# AIRTABLE_API_KEY=patXXX
# AIRTABLE_BASE_ID=appXXX
```

---

## Installation

```bash
# Cloner
git clone https://github.com/votre-org/bakeryos.git
cd bakeryos

# Dépendances
npm install

# Variables d'environnement
cp .env.example .env.local
# Remplir les valeurs Supabase

# Migrations Supabase (dans l'ordre)
# → Supabase Dashboard → SQL Editor
# 1. migration-1.sql
# 2. migration-2.sql
# 3. migration-3.sql
# 4. migration-4-push-notifications.sql
# 5. migration-5-fix-statut-recuperee.sql
# 6. migration-6-produits-securite.sql  ← nouvelle, requis pour les paniers flash

# Développement
npm run dev
# Site client : localhost:3000?slug=artisan-dore
# Espace boulanger : localhost:3000/boulanger

# Vérification TypeScript
npm run typecheck

# Build production
npm run build
```

---

## Multi-tenant & déploiement

### Comment ça marche

Chaque boulangerie possède un slug unique (ex: `monpain`). En production, le slug est résolu automatiquement depuis le sous-domaine :

```
monpain.bakeryos.fr → slug = "monpain"
```

Le fichier `lib/resolve-slug.ts` centralise cette logique avec validation et sous-domaines réservés (`www`, `app`, `api`, `admin`…).

### Configuration Netlify

```toml
# netlify.toml
[build]
command = "npx next build"
publish = ".next"

[[plugins]]
package = "@netlify/plugin-nextjs"
```

Activer les wildcard subdomains dans Netlify :
- Site settings → Domain management → ajouter `*.bakeryos.fr`
- DNS : enregistrement `CNAME *.bakeryos.fr → [votre-site].netlify.app`

### Ajouter une nouvelle boulangerie

```bash
# Via l'API (register)
POST /api/boulanger/auth
{
  "action": "register",
  "email": "contact@monpain.fr",
  "password": "...",
  "nom": "Mon Pain",
  "slug": "monpain"
}
```

Le slug doit être unique. Il devient le sous-domaine. Un DNS `monpain.bakeryos.fr` doit pointer vers Netlify.

### Test local multi-tenant

```bash
# Tester différents tenants sans changer .env
localhost:3000?slug=artisan-dore
localhost:3000?slug=boulangerie-dupont
```

---

## Sécurité

### Niveaux d'accès

| Niveau | Données accessibles | Mécanisme |
|---|---|---|
| Public (anon key) | Catalogue produits actifs, config flash (horaire + remise uniquement) | Fonctions SQL SECURITY DEFINER |
| Client authentifié | Ses propres commandes | Supabase Auth + RLS |
| Boulanger owner | Toutes ses données (stocks, CA, historique) | JWT + RLS (user_id) |
| Service role | Toutes les données (serveur uniquement) | SUPABASE_SERVICE_ROLE_KEY côté serveur |

### Ce qu'un attaquant NE peut pas faire

- `SELECT * FROM stocks_journaliers` avec la clé anon → **0 lignes** (RLS)
- Appeler `get_catalogue_public("autre-boulangerie")` pour voler les données d'un concurrent → **résultat vide** si boulangerie inactive ou inexistante
- Voir les `stock_final` réels via `/api/paniers/:slug` → **intentionnellement absent** du résultat
- Deviner un slug non configuré en production → **null retourné**, pas de fallback silencieux

### Migrations à exécuter dans l'ordre

Les migrations sont cumulatives. Si vous partez de zéro, exécutez-les toutes dans l'ordre numérique dans Supabase SQL Editor.

---

## Palette de couleurs

| Nom | Valeur | Usage |
|---|---|---|
| Crème | `#FDFBF7` | Fond site client |
| Brun foncé | `#2C1810` | Texte principal, header |
| Doré artisanal | `#C19A6B` | Accent, CTA, prix |
| Terre d'ombre | `#8B4513` | Secondaire, hover |
| Nuit boulanger | `#1A0F0A` | Fond espace boulanger |

---

*Fait avec passion · BakeryOS © 2026*