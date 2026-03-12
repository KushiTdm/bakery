# L'Artisan Doré - Boulangerie Artisanale

Une application web moderne et élégante pour une boulangerie française haut de gamme, créée avec Next.js 13 App Router, Tailwind CSS et Framer Motion.

## Caractéristiques

- **Design Élégant** : Inspiré des meilleures boulangeries artisanales françaises avec une palette de couleurs raffinée (crème, brun, doré)
- **Typographie Premium** : Playfair Display pour les titres et Montserrat pour le corps
- **Animations Fluides** : Animations au scroll avec Framer Motion
- **Responsive Design** : Optimisé pour tous les écrans (mobile-first)
- **SEO Optimisé** : Métadonnées complètes pour les réseaux sociaux
- **Performance** : Build optimisé avec Next.js 13

## Sections Principales

1. **Hero Section** : Image plein écran avec titre élégant et call-to-action
2. **Menu Filtrable** : Catalogue de produits par catégorie (Boulangerie, Viennoiserie, Pâtisserie)
3. **Savoir-Faire** : Présentation de l'artisanat et des valeurs
4. **Footer** : Horaires, coordonnées et réseaux sociaux

## Technologies Utilisées

- Next.js 13 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide React (icônes)

## Structure du Projet

```
├── app/
│   ├── layout.tsx          # Layout principal
│   ├── page.tsx            # Page d'accueil
│   └── globals.css         # Styles globaux
├── components/
│   ├── navbar.tsx          # Barre de navigation
│   ├── hero.tsx            # Section hero
│   ├── product-menu.tsx    # Menu des produits
│   ├── product-card.tsx    # Carte produit
│   ├── savoir-faire.tsx    # Section savoir-faire
│   └── footer.tsx          # Pied de page
└── lib/
    └── products.ts         # Données des produits
```

## Installation et Démarrage

```bash
# Installer les dépendances
npm install

# Lancer en développement
npm run dev

# Build de production
npm run build

# Lancer la production
npm start
```

## Palette de Couleurs

- **Fond** : `#FDFBF7` (Blanc cassé/crème)
- **Texte Principal** : `#2C1810` (Brun foncé)
- **Accent** : `#C19A6B` (Doré artisanal)
- **Secondaire** : `#8B4513` (Terre d'ombre)

## Fonctionnalités Interactives

- Navigation fluide avec scroll smooth
- Menu mobile responsive
- Filtrage de produits par catégorie
- Panier d'achat simulé (UI uniquement)
- Animations au scroll
- Effets hover sur les cartes produits

## Optimisations

- Images optimisées via Unsplash
- Lazy loading des images
- Code splitting automatique
- Métadonnées SEO complètes
- Performance lighthouse optimale

## Auteur

Créé avec passion pour démontrer les capacités de Next.js et les meilleures pratiques de développement web moderne.
# 🥖 L'Artisan Doré — SaaS Boulangerie

> Application web complète pour boulangeries artisanales : vitrine, click & collect, gestion des invendus en temps réel et espace boulanger.

---

## Sommaire

- [Aperçu](#aperçu)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Fonctionnalités](#fonctionnalités)
  - [Site client](#site-client)
  - [Espace boulanger](#espace-boulanger)
- [Structure du projet](#structure-du-projet)
- [Variables d'environnement](#variables-denvironnement)
- [Installation](#installation)
- [Déploiement](#déploiement)
- [Roadmap](#roadmap)

---

## Aperçu

L'Artisan Doré est une solution SaaS pensée pour les boulangeries artisanales. Elle regroupe deux interfaces distinctes :

- **Le site client** (`/`) — vitrine de la boulangerie, catalogue click & collect, flash invendus du soir
- **L'espace boulanger** (`/boulanger`) — outil de gestion interne protégé par PIN pour suivre la production, les stocks et les invendus au fil de la journée

---

## Stack technique

### Frontend

| Technologie | Version | Rôle |
|---|---|---|
| [Next.js](https://nextjs.org/) | 13.5 | Framework React, App Router, SSR/SSG |
| [React](https://react.dev/) | 18.2 | UI, hooks, context |
| [TypeScript](https://www.typescriptlang.org/) | 5.2 | Typage statique |
| [Tailwind CSS](https://tailwindcss.com/) | 3.3 | Styling utility-first |
| [Framer Motion](https://www.framer.com/motion/) | 12 | Animations et transitions |
| [Lucide React](https://lucide.dev/) | 0.446 | Icônes |

### Backend & services

| Service | Rôle |
|---|---|
| [Airtable](https://airtable.com/) | Base de données produits et configuration flash |
| [Firebase Auth](https://firebase.google.com/docs/auth) | Authentification client par Magic Link email |
| Next.js API Routes | Proxy sécurisé vers Airtable (clé API côté serveur) |

### Déploiement

| Outil | Rôle |
|---|---|
| [Netlify](https://netlify.com/) | Hébergement et CI/CD |
| `@netlify/plugin-nextjs` | Adaptation Next.js pour Netlify |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│   ┌──────────────────┐        ┌────────────────────────┐   │
│   │   Site Client    │        │   Espace Boulanger     │   │
│   │   /              │        │   /boulanger           │   │
│   │                  │        │                        │   │
│   │  CartContext      │        │  BoulangerContext      │   │
│   │  Firebase Auth   │        │  PIN Auth (1952)       │   │
│   └────────┬─────────┘        └──────────┬─────────────┘   │
│            │                             │                  │
└────────────┼─────────────────────────────┼──────────────────┘
             │                             │ (état mémoire)
             ▼                             ▼
   ┌──────────────────┐        ┌────────────────────────┐
   │  /api/products   │        │   Pas d'API boulanger  │
   │  Next.js Route   │        │   (à connecter:        │
   └────────┬─────────┘        │   Airtable / Firestore)│
            │                  └────────────────────────┘
            ▼
   ┌──────────────────┐
   │    Airtable      │
   │  - Produits      │
   │  - Flash_Config  │
   └──────────────────┘
```

**Flux de données produits :**
1. Le hook `useProducts` appelle `/api/products` côté client
2. La route API lit la clé `AIRTABLE_API_KEY` (jamais exposée au navigateur) et fetche Airtable
3. En cas d'échec Airtable, un fallback local prend le relais sans interruption de service

---

## Fonctionnalités

### Site client

#### Vitrine (`/`)

- **Loading screen animé** — logo en SVG tracé au dessin, transitions de phase (enter → visible → exit)
- **Navbar intelligente** — transparente sur le hero, fond crème après scroll. Tab switcher central pill-style entre *La Boulangerie* et *Click & Collect*
- **Flash Banner** — bannière contextuelle en 3 états :
  - *Hidden* avant 15h
  - *Teaser* (15h–18h) avec compte à rebours jusqu'au lancement
  - *Live* (18h–20h) bandeau animé avec nombre de paniers restants et CTA direct vers la commande
- **Hero** — image plein écran avec CTA vers le savoir-faire et la commande
- **Savoir-faire** — présentation des valeurs artisanales
- **Processus** (`Ingredients`) — 4 étapes illustrées (farine, levain, fermentation, cuisson) avec layout alterné
- **Galerie** — grille masonry 6 photos avec reveal du nom au hover

#### Click & Collect

- Catalogue filtrable par catégorie (Boulangerie / Viennoiserie / Pâtisserie), alimenté par Airtable en temps réel
- Skeleton loader pendant le fetch
- Indicateur de source des données (Airtable live / fallback local)
- **Section Flash Invendus** :
  - Hors horaires : teaser discret
  - En cours : grille des invendus avec prix barrés (−40%), compteur de paniers restants, avertissement "pas de réservation"
- **Panier** (CartSidebar) — sidebar animée, gestion quantités, TVA 5.5%, récapitulatif HT/TTC
- **Authentification Magic Link** (Firebase) — connexion sans mot de passe par email. Produit en attente ajouté automatiquement après connexion

---

### Espace boulanger

Accessible sur `/boulanger`, protégé par un clavier numérique PIN.

**PIN demo : `1952`**

L'interface est organisée en 4 onglets navigables via une bottom nav fixe :

#### 🌅 Matin — Saisie de production

- Liste des 12 produits groupés par catégorie (Boulangerie / Viennoiserie / Pâtisserie)
- Contrôles +/− et saisie directe par tap sur le chiffre
- Conseil automatique si mercredi (+15% viennoiseries) ou week-end (+30%)
- Estimé CA en temps réel (taux de vente moyen 93%)
- Bouton sticky au-dessus de la bottom nav → valide et bascule vers l'onglet Stock

#### 📸 Stock — Snapshot étagère

Deux slots de comptage : **10h** (après rush matinal) et **14h** (après rush déjeuner)

- **Logique clé** : la vendeuse saisit ce qui *reste* sur l'étagère — les ventes sont *calculées automatiquement* par différence
- Affichage "+X vendus" en vert (résultat, non saisie)
- Barre bicolore vert/rouge par produit (vendus vs restants)
- Alerte amber si un produit dépasse 30% de stock restant (risque d'invendu)
- Résumé des ventes calculées après validation de chaque slot

#### 🌙 Soir — Bilan & gestion des invendus

Toutes les sections sont visibles et collapsibles :

1. **Bilan du jour** — 4 KPIs (CA estimé, taux invendu, pièces produites/invendues) + tableau détaillé par catégorie (produit / vendu / invendu / %)
2. **Stock restant ce soir** — saisie finale du stock à 18h, déclencheur des statistiques réelles
3. **Paniers suggérés** — combinaisons générées algorithmiquement depuis le stock réel pour minimiser les pertes :
   - ☀️ Panier Petit-Déjeuner (viennoiseries + pain)
   - 🎂 Panier Gourmand (pâtisseries)
   - 🛍️ Grand Panier du Soir (fort volume)
   - Chaque panier affiche sa valeur réelle, le prix suggéré et l'économie réalisée vs perte totale
4. **Flash Invendus** (18h–20h) — statut en temps réel, compte à rebours, liste des produits avec prix flashés (−40%) et quantités
5. **Commandes Click & Collect** — saisie du nombre de commandes à préparer
6. **Suggestion production demain** — réduction automatique calculée par produit selon le taux d'invendu du jour
7. **Clôture de journée** — sauvegarde les données dans l'historique pour alimenter le dashboard

#### 📊 Stats — Dashboard historique

*Aucune donnée fictive — s'alimente uniquement après chaque clôture de journée.*

- Message d'état vide informatif si pas encore de données
- KPIs sur la période : CA moyen/jour, taux d'invendu moyen, évolution CA (tendance si ≥3 jours)
- Graphique barres togglable CA / Taux invendu, week-ends en surbrillance
- Spotlight meilleur / pire produit par taux d'invendu
- Tableau complet tous produits avec barre colorée (vert < 5% / amber 5–8% / rouge > 8%)
- Recommandation stratégique automatique selon le taux moyen observé

---

## Structure du projet

```
artisan-dore/
├── app/
│   ├── api/
│   │   └── products/
│   │       └── route.ts          # Proxy Airtable sécurisé
│   ├── boulanger/
│   │   └── page.tsx              # Espace boulanger (PIN auth + shell)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # Site client principal
│
├── components/
│   ├── boulanger/
│   │   ├── pin-auth.tsx          # Clavier numérique PIN
│   │   ├── vue-matin.tsx         # Saisie production
│   │   ├── vue-snapshot.tsx      # Comptage étagère
│   │   ├── vue-soir.tsx          # Bilan + invendus + paniers
│   │   └── dashboard.tsx         # Statistiques historiques
│   ├── auth-modal.tsx            # Magic Link Firebase
│   ├── cart-sidebar.tsx          # Panier client
│   ├── click-collect.tsx         # Page catalogue + flash
│   ├── FlashBanner.tsx           # Bandeau invendus
│   ├── footer.tsx
│   ├── galerie.tsx
│   ├── hero.tsx
│   ├── ingredients.tsx
│   ├── Loadingscreen.tsx
│   ├── navbar.tsx
│   ├── product-card.tsx
│   ├── product-menu.tsx
│   └── savoir-faire.tsx
│
├── context/
│   ├── boulanger-context.tsx     # État global espace boulanger
│   └── cart-context.tsx          # Panier + auth client
│
├── hooks/
│   └── use-products.ts           # Fetch Airtable avec fallback
│
├── lib/
│   ├── firebase.ts               # Init Firebase Auth
│   ├── products.ts               # Catalogue local (fallback)
│   └── utils.ts
│
├── .env.local                    # Variables d'environnement (non versionné)
├── next.config.js
├── tailwind.config.ts
└── netlify.toml
```

---

## Variables d'environnement

Créer un fichier `.env.local` à la racine :

```env
# Firebase (Auth Magic Link)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=artisan-dore.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=artisan-dore
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=artisan-dore.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Airtable (clés SERVEUR UNIQUEMENT — jamais préfixées NEXT_PUBLIC_)
AIRTABLE_API_KEY=patXXXXXXXXXXXXXX
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
```

> ⚠️ Les clés Airtable ne doivent **jamais** être préfixées `NEXT_PUBLIC_` — elles ne sont accessibles que côté serveur via la route `/api/products`.

### Structure Airtable attendue

**Table `Produits`**

| Colonne | Type |
|---|---|
| `nom` | Texte (champ principal) |
| `categorie` | Sélection unique (`boulangerie`, `viennoiserie`, `patisserie`) |
| `description` | Texte long |
| `prix` | Nombre (devise €) |
| `image` | Pièce jointe |
| `image_url` | Texte (URL fallback si pas d'attachement) |
| `disponible` | Case à cocher |
| `est_invende` | Case à cocher |
| `stock_restant` | Nombre entier |

**Table `Flash_Config`**

| Colonne | Type |
|---|---|
| `heure_debut` | Nombre entier |
| `heure_fin` | Nombre entier |
| `remise_percent` | Nombre entier |
| `panier_mystere_prix` | Nombre (devise €) |
| `panier_mystere_count` | Nombre entier |
| `flash_actif` | Case à cocher |
| `titre_flash` | Texte |
| `statut_flash` | Sélection unique |

---

## Installation

```bash
# Cloner le projet
git clone https://github.com/votre-org/artisan-dore.git
cd artisan-dore

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env.local
# → Remplir les valeurs Firebase et Airtable

# Lancer en développement
npm run dev
# → http://localhost:3000        Site client
# → http://localhost:3000/boulanger  Espace boulanger (PIN: 1952)
```

```bash
# Build de production
npm run build
npm start

# Vérification TypeScript
npm run typecheck
```

---

## Déploiement

Le projet est configuré pour Netlify via `netlify.toml` :

```toml
[build]
command = "npx next build"
publish = ".next"

[[plugins]]
package = "@netlify/plugin-nextjs"
```

**Étapes post-déploiement :**

1. Ajouter le domaine de production dans Firebase → *Authentication → Domaines autorisés*
2. Renseigner toutes les variables d'environnement dans Netlify → *Site settings → Environment variables*
3. Vérifier que les Magic Links redirigent vers le bon domaine (variable `url` dans `ACTION_CODE_SETTINGS` dans `auth-modal.tsx`)

---

## Roadmap

### Priorité haute
- [ ] Décommenter les blocs Firebase dans `auth-modal.tsx` pour la production
- [ ] Page checkout + confirmation de commande
- [ ] Email de confirmation commande (Resend ou EmailJS — 3 000/mois gratuits)
- [ ] Persistance des données boulanger (Airtable ou Firestore — actuellement en mémoire session)

### Priorité moyenne
- [ ] Connecter `vue-soir.tsx` aux vraies données Airtable pour le flash (UNSOLD_IDS, FLASH_CONFIG)
- [ ] Connecter `FlashBanner.tsx` au vrai compteur de paniers restants (polling ou WebSocket)
- [ ] PWA pour `/boulanger` — installable sur téléphone vendeuse (manifest + service worker)

### Évolutions futures
- [ ] Multi-boulangerie — architecture tenant avec sous-domaines
- [ ] Notifications push clients (Web Push API) lors du déclenchement du flash
- [ ] Historique persistant boulanger sur plusieurs semaines
- [ ] Export rapport hebdomadaire PDF (invendus, CA, suggestions)
- [ ] Intégration TPE pour paiement en ligne (Stripe ou SumUp)

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

*Fait avec passion · L'Artisan Doré © 2024*