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
- [Tarification](#tarification)
- [Roadmap](#roadmap)

---

## Aperçu

BakeryOS est une solution SaaS pour boulangeries artisanales. Elle regroupe deux interfaces :

- **Le site client** (`/`) — vitrine, catalogue click & collect, flash invendus du soir en temps réel
- **L'espace boulanger** (`/boulanger`) — gestion production, stocks, invendus, commandes et statistiques

En production, chaque boulangerie dispose de son propre sous-domaine :
```
monpain.bakeryos.fr           → boulangerie "monpain"
boulangerie-dupont.bakeryos.fr → boulangerie "boulangerie-dupont"
```

### Objectif produit

Le taux d'invendu moyen en boulangerie artisanale est de **8-15% du chiffre d'affaires**. Sur 300k€ de CA, cela représente 24-45k€ de pertes annuelles. BakeryOS propose un **ROI démontrable en moins de 30 jours** via :

- 📊 **Suggestions ML de production** — basées sur l'historique réel
- 🌙 **Flash anti-gaspi** — vente des invendus à prix réduit le soir
- 🛒 **Click & Collect** — ventes réservées en ligne

---

## Stack technique

### Frontend

| Technologie | Version | Rôle |
|---|---|---|
| Next.js | 13.5 | App Router, SSR/SSG |
| React | 18.2 | UI, hooks, context |
| TypeScript | 5.2 | Typage statique |
| Tailwind CSS | 3.3 | Styling utility-first |
| Framer Motion | 12 | Animations fluides |
| Lucide React | 0.446 | Icônes |
| Radix UI | divers | Composants accessibles (Dialog, Tabs, Select…) |
| React Hook Form | 7.53 | Formulaires validés |
| Zod | 3.23 | Validation schémas |
| Recharts | 2.12 | Graphiques dashboard |

### Backend & services

| Service | Rôle |
|---|---|
| Supabase | Base de données PostgreSQL, Auth, RLS, Storage, Realtime |
| Supabase RPC | `get_catalogue_public()`, `get_paniers_flash()` — fonctions SECURITY DEFINER |
| Resend | Emails de confirmation commande |
| Upstash Redis | Rate limiting cross-instances serverless |
| Web Push | Notifications push (VAPID) |
| Netlify | Hébergement, CI/CD, wildcard subdomains |

### Outils de développement

| Outil | Rôle |
|---|---|
| ESLint | Linting |
| Sharp | Optimisation images |
| TypeScript strict | Typage renforcé |

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
│  │  → "monpain"    │    │  Auth email+password │    │
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
│  /api/notifications/*       → push web notifications │
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
│  ├── boulangeries         ← config, plan, horaires  │
│  ├── produits             ← catalogue natif         │
│  ├── journees             ← historique clôturé      │
│  ├── stocks_journaliers   ← jamais exposé public    │
│  ├── commandes            ← click & collect         │
│  ├── push_subscriptions   ← notifications push      │
│  └── tour_completed       ← onboarding wizard       │
│                                                      │
│  Storage :                                           │
│  └── produits-photos      ← images catalogue        │
└──────────────────────────────────────────────────────┘
```

### Flux paniers anti-gaspi

```
Boulanger saisit stock_final > 0 (Vue Soir)
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
FlashSection + FlashBanner — affichage client avec countdown
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
- **Loading screen** animé (SVG tracé + transitions de phase)
- **Navbar intelligente** (transparente → fond crème au scroll)
- **Flash Banner** — 3 états : Hidden / Teaser (compte à rebours) / Live (nb produits réel)
- **Sections** : Hero, Savoir-faire, Ingrédients, Galerie masonry, Footer
- **SEO** : JSON-LD Schema.org, meta tags dynamiques, sitemap.xml

#### Click & Collect
- Catalogue depuis Supabase (`/api/catalogue/:slug`) avec filtres par catégorie
- **Flash Invendus** — données temps réel depuis `stocks_journaliers`
  - Hors horaire : teaser avec heure de lancement dynamique (depuis DB)
  - En cours : modale détaillée, prix barré, prix flash, économie réalisée
- **Panier** — sidebar animée, TVA 5.5%, checkout
- **Auth Magic Link OTP** — produit en attente ajouté après connexion
- **Email confirmation** — via Resend

### Espace boulanger (`/boulanger`)

Protégé par **Supabase Auth (email + password)**. Organisé en 4 onglets :

#### 🌅 Matin — Production
- Saisie par produit avec contrôles +/−
- **Suggestions ML** basées sur l'historique (par jour de semaine, confidence high/medium/low)
- Estimé CA en temps réel
- Bouton "Tout appliquer" les suggestions
- Auto-save avec debounce 2s

#### 📸 Snapshot — Stock étagère
- Deux slots : **10h** (après rush matinal) et **14h** (après déjeuner)
- La vendeuse saisit ce qui **reste** — ventes calculées automatiquement
- Alerte amber si risque d'invendu (> 30% stock restant)
- Auto-save

#### 🌙 Soir — Bilan & Invendus
- **KPIs** : CA estimé, taux invendu, pièces produites/invendues
- Stock final → déclenche l'affichage des paniers sur la vitrine
- **Paniers suggérés** générés algorithmiquement (Petit-Déjeuner, Gourmand, Grand Panier)
- Flash invendus avec compte à rebours et prix −40%
- Suggestion production demain basée sur le taux d'invendu
- **Clôture journée** → sauvegarde en historique pour stats

#### 📊 Stats — Dashboard
- Données réelles uniquement (alimenté après clôture)
- CA moyen/jour, taux invendu moyen, évolution période
- Graphique barres CA / Invendus avec week-ends en surbrillance
- Tableau par produit avec indicateur coloré (vert < 5% / amber 5–8% / rouge > 8%)
- Recommandations automatiques

#### 📦 Catalogue
- CRUD complet produits (nom, prix, coût, catégorie, emoji, allergènes)
- Upload photos via Supabase Storage
- Gestion actif_catalogue / actif_flash
- Limite 20 produits (plan Starter)

#### ⚙️ Paramètres
- Profil boulangerie (nom, adresse)
- Gestion clés Airtable (optionnel)
- Tour guidé onboarding

### Tour guidé onboarding

Wizard interactif style **Spotlight** :
- Fond assombri avec découpe lumineuse sur l'élément cible
- Navigation automatique entre vues
- Progression visuelle
- 8 étapes couvrant toutes les fonctionnalités

### PWA

Application installable :
- manifest.json configuré
- Service Worker pour offline
- Icônes toutes tailles (72x72 → 512x512)
- Shortcuts : "Production du matin", "Commandes"

---

## Structure du projet

```
bakeryos/
├── app/
│   ├── api/
│   │   ├── catalogue/[slug]/route.ts      # Catalogue public (RPC)
│   │   ├── paniers/[slug]/route.ts        # Paniers flash temps réel
│   │   ├── boulanger/
│   │   │   ├── airtable/route.ts          # Proxy Airtable (optionnel)
│   │   │   ├── auth/route.ts              # Login / register
│   │   │   ├── historique/route.ts        # Stats historiques
│   │   │   ├── journee/route.ts           # Journée (GET/POST/PUT)
│   │   │   ├── produits/route.ts          # CRUD produits
│   │   │   ├── produits/upload/route.ts   # Upload photos Storage
│   │   │   └── profil/route.ts            # Profil boulangerie
│   │   ├── client/profil/route.ts         # Profil client
│   │   ├── notifications/
│   │   │   ├── send/route.ts              # Envoi push
│   │   │   └── subscribe/route.ts         # Abonnements push
│   │   └── orders/
│   │       ├── route.ts                   # Création / liste
│   │       ├── [id]/route.ts              # Statut commande
│   │       └── confirm-email/route.ts     # Email Resend
│   ├── boulanger/
│   │   ├── page.tsx                       # Shell espace boulanger
│   │   └── commandes/page.tsx             # Page commandes + flash
│   ├── auth/callback/route.ts
│   ├── reset-password/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── sitemap.xml
│
├── components/
│   ├── boulanger/
│   │   ├── catalogue.tsx                  # Gestion catalogue
│   │   ├── catalogue-starter.tsx          # Wizard création catalogue
│   │   ├── dashboard.tsx                  # Vue stats
│   │   ├── login-form.tsx                 # Auth email+password
│   │   ├── parametres.tsx                 # Paramètres boulangerie
│   │   ├── produit-form-modal.tsx         # Modal édition produit
│   │   ├── push-notification-toggle.tsx   # Activation push
│   │   ├── tour-wizard.tsx                # Visite guidée Spotlight
│   │   ├── vue-matin.tsx                  # Production matin
│   │   ├── vue-snapshot.tsx               # Stocks 10h/14h
│   │   └── vue-soir.tsx                   # Bilan & clôture
│   ├── seo/json-ld.tsx                    # Schema.org
│   ├── ui/                                # Composants Radix UI
│   ├── auth-modal.tsx
│   ├── cart-sidebar.tsx
│   ├── click-collect.tsx
│   ├── flash-section.tsx
│   ├── FlashBanner.tsx
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
│   ├── boulanger-context.tsx              # État global boulanger
│   └── cart-context.tsx
│
├── hooks/
│   ├── use-flash-paniers.ts
│   ├── use-products.ts
│   ├── use-produits-boulanger.ts
│   ├── use-push-notifications.ts
│   ├── use-slug.ts
│   ├── use-toast.ts
│   └── use-tour.ts
│
├── lib/
│   ├── products.ts
│   ├── rate-limit.ts                      # Upstash Redis
│   ├── resolve-slug.ts                    # Multi-tenant
│   ├── supabase.ts
│   └── utils.ts
│
├── migrations/
│   ├── migration-complete-v1.sql          # Migration consolidée
│   ├── migration-1.sql … migration-9-tour.sql
│   └── seed.sql
│
├── public/
│   ├── icons/                             # PWA icons
│   ├── manifest.json
│   ├── robots.txt
│   └── sw.js
│
├── .eslintrc.json
├── components.json                        # shadcn/ui config
├── middleware.ts
├── netlify.toml
├── next.config.js
├── package.json
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

# ── Airtable (optionnel) ──────────────────────────────────────
# AIRTABLE_API_KEY=patXXX
# AIRTABLE_BASE_ID=appXXX
```

---

## Installation

```bash
# Cloner
git clone https://github.com/KushiTdm/bakery.git
cd project-boulangerie

# Dépendances
npm install

# Variables d'environnement
cp .env.example .env.local
# Remplir les valeurs Supabase

# Migrations Supabase (dans l'ordre)
# → Supabase Dashboard → SQL Editor
# Option A : migration consolidée
1. migration-complete-v1.sql
2. seed.sql (adapter le slug)

# Option B : migrations individuelles
1. migration-1.sql → migration-9-tour.sql

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

### Résolution du slug

| Environnement | Source du slug |
|---|---|
| Production | Sous-domaine (`monpain.bakeryos.fr` → `monpain`) |
| Développement | Query param (`?slug=monpain`) |
| Fallback | `NEXT_PUBLIC_BAKERY_SLUG` dans `.env.local` |

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

Activer les **wildcard subdomains** dans Netlify :
- Site settings → Domain management → ajouter `*.bakeryos.fr`
- DNS : enregistrement `CNAME *.bakeryos.fr → [votre-site].netlify.app`

### Ajouter une boulangerie

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

---

## Sécurité

### Niveaux d'accès

| Niveau | Données accessibles | Mécanisme |
|---|---|---|
| Public (anon key) | Catalogue produits actifs, config flash | Fonctions SQL SECURITY DEFINER |
| Client authentifié | Ses propres commandes | Supabase Auth + RLS |
| Boulanger owner | Toutes ses données | JWT + RLS (user_id) |
| Service role | Toutes les données (serveur uniquement) | SUPABASE_SERVICE_ROLE_KEY |

### Protections

- ✅ `SELECT * FROM stocks_journaliers` avec anon key → **0 lignes** (RLS)
- ✅ Appel cross-tenant → **résultat vide**
- ✅ `stock_final` jamais exposé publiquement
- ✅ Rate limiting sur création commandes (Upstash Redis)
- ✅ Validation Zod sur tous les inputs API

### Auth strategy

| Utilisateur | Méthode | Notes |
|---|---|---|
| Boulanger | Email + Password | Pas de quota email à la connexion |
| Client | OTP Magic Link | Quota 2/h (Supabase Free) — SMTP custom en prod |

---

## Tarification

| Fonctionnalité | Starter 19€/mois | Pro 49€/mois | Multi 99€/mois |
|---|---|---|---|
| Core loop Matin/Snapshot/Soir | ✓ | ✓ | ✓ |
| Flash invendus automatique | ✓ | ✓ | ✓ |
| Suggestions ML production | ✓ | ✓ | ✓ |
| Notifications push commandes | ✓ | ✓ | ✓ |
| Click & Collect | 50 cmd/mois | Illimité | Illimité |
| Catalogue produits | 20 produits | Illimité | Illimité |
| Utilisateurs | 1 | 3 | Illimité |
| Email confirmation Resend | ✓ | ✓ | ✓ |
| Rapport PDF hebdomadaire | — | ✓ | ✓ |
| Certificat CO₂ mensuel | — | ✓ | ✓ |
| Multi-boulangeries | — | — | ✓ |
| API publique + webhooks | — | — | ✓ |
| Support | Email 48h | Email 24h | Slack dédié |

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

## Roadmap

### Court terme (< 2 semaines)
- [ ] Adresse et créneaux de retrait dynamiques depuis `boulangeries`
- [ ] SMTP custom Resend dans Supabase Dashboard
- [ ] Configuration flash UI (heures, remise)

### Moyen terme (30-90 jours)
- [ ] Export PDF rapport hebdomadaire
- [ ] Rapport CO₂ mensuel
- [ ] Landing page BakeryOS.fr
- [ ] Tests E2E Playwright

### Long terme (90+ jours)
- [ ] Multi-utilisateurs par boulangerie
- [ ] Intégration caisse (Lightspeed, Zelty)
- [ ] API publique + webhooks
- [ ] Application mobile native

---

## Score de réussite à 12 mois

| Dimension | Score | Commentaire |
|---|---|---|
| Développement | 68/100 | Stack solide, bugs corrigés, flux data connecté |
| Fonctionnel | 72/100 | Core loop complet, flash anti-gaspi end-to-end |
| Marché | 55/100 | Marché de niche, adoption tech lente |
| Use case | 78/100 | ROI démontrable, problème réel |
| Offre & Demande | 60/100 | Demande latente, offre à prouver |
| Économique | 45/100 | CAC élevé, cycle vente long |
| Concurrence | 62/100 | Peu de concurrents directs |
| **TOTAL** | **64.5/100** | |

---

*Fait avec passion · BakeryOS © 2026*

*Repository : https://github.com/KushiTdm/bakery*