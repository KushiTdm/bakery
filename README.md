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
