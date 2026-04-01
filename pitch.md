# 🥖 BakeryOS — Pitch Produit

## Une solution SaaS complète pour la boulangerie artisanale

**BakeryOS** est une plateforme tout-en-un qui digitalise la gestion quotidienne des boulangeries artisanales. Elle connecte le boulanger, la vendeuse et les clients autour d'un objectif commun : **réduire les invendus, optimiser la production et faciliter les ventes**.

---

## 🎯 Le problème

Dans une boulangerie artisanale française moyenne :
- **8 à 15% du chiffre d'affaires** part en invendus
- Sur un CA de 300 000€, cela représente **24 000€ à 45 000€ de pertes annuelles**
- La gestion des stocks se fait souvent « à l'instinct » ou sur papier
- Les invendus du soir sont rarement valorisés
- Les clients n'ont pas de moyen simple de commander à l'avance

---

## ✨ La solution BakeryOS

BakeryOS propose une **boucle quotidienne optimisée** en 4 temps :

```
🌅 MATIN → 📸 MIDI → 🌙 SOIR → 📊 STATS
```

### 1. Vue Matin — Production intelligente
**Pour le boulanger**

- Saisie rapide de la production par produit et par fournée
- **Suggestions IA « Levain »** basées sur l'historique des ventes
- Calcul automatique du CA estimé en temps réel
- Gestion des reports J-1 (produits à durée de conservation > 1 jour)
- Interface organisée par catégories (pains, viennoiseries, pâtisseries, snacking)

**Bénéfice** : Le boulanger produit la bonne quantité, ni trop, ni trop peu.

---

### 2. Vue Snapshot — Comptage en rayon
**Pour la vendeuse**

- Deux créneaux de comptage : **10h** (après le rush matinal) et **14h** (après le déjeuner)
- Interface **tactile et simplifiée** pour une utilisation au comptoir
- La vendeuse saisit ce qui **reste** en vitrine → le système calcule automatiquement les ventes
- **Alertes visuelles** si plus de 30% de stock restant (risque d'invendu)

**Bénéfice** : Visibilité en temps réel sur les ventes, alertes anticipées.

---

### 3. Vue Soir — Clôture et anti-gaspi
**Pour le boulanger et la vendeuse**

- Bilan de la journée : CA réalisé, taux d'invendu, pièces produites
- Saisie des invendus finaux
- **Activation des paniers Flash anti-gaspi** (remise -40%)
- Génération du **rapport IA « Levain »** avec recommandations personnalisées
- Collecte du **feedback vendeuse** pour l'IA

**Bénéfice** : Clôture rapide, valorisation des invendus, insights pour le lendemain.

---

### 4. Dashboard Stats — Analyse et pilotage
**Pour le boulanger**

- CA moyen par jour avec tendance
- Taux d'invendu moyen sur la période
- **Graphiques interactifs** (CA et invendus sur 7/14/30 jours)
- Performance par produit avec indicateurs colorés :
  - 🟢 Vert < 5% = Excellent
  - 🟠 Orange 5-8% = À surveiller
  - 🔴 Rouge > 8% = Alerte
- **Recommandations automatiques** pour optimiser la production

**Bénéfice** : Pilotage data-driven, ROI mesurable.

---

## 🛒 Côté Client — Vitrine et Click & Collect

### Site Vitrine
- Présentation de la boulangerie (savoir-faire, ingrédients, galerie photos)
- Design élégant aux couleurs artisanales
- SEO optimisé (Schema.org, meta tags dynamiques)

### Click & Collect
- Catalogue produits avec filtres par catégorie
- Panier latéral avec calcul TVA 5.5%
- Authentification simple (Magic Link OTP)
- Email de confirmation automatique
- Créneaux de retrait configurables
- **100% gratuit** — paiement sur place

### Flash Anti-Gaspi
- Affichage en temps réel des invendus disponibles
- **Prix flash -40%** avec compte à rebours
- Bannette dynamique sur le site client
- Les clients réservent leur panier et le récupèrent en boutique

**Bénéfice** : Les clients commandent facilement, les invendus sont vendus.

---

## 👥 Les 3 profils utilisateurs

### 🧑‍🍳 Le Boulanger (Owner)
- Accès complet à toutes les fonctionnalités
- Configure le catalogue produits
- Consulte les statistiques et rapports IA
- Gère les paramètres de la boulangerie
- Active le flash anti-gaspi

### 👩‍💼 La Vendeuse
- Accès simplifié aux vues Snapshot et Soir
- Interface tactile optimisée pour le comptoir
- Saisit les stocks restants à 10h et 14h
- Transmet son feedback quotidien à l'IA « Levain »
- Reçoit des alertes visuelles sur les risques d'invendu

### 🛒 Le Client
- Parcourt le catalogue en ligne
- Commande en Click & Collect
- Profite des offres Flash anti-gaspi
- Reçoit des notifications push (si activées)
- Consulte son historique de commandes

---

## 🤖 L'IA « Levain » — Assistant intelligent

Levain est l'assistant IA intégré qui :

1. **Prédit la production optimale** en analysant l'historique des ventes par jour de semaine
2. **Génère des rapports personnalisés** avec recommandations actionnables
3. **Apprend du feedback vendeuse** pour s'améliorer continuellement
4. **Suggère des ajustements** basés sur les conditions météo
5. **Anonymise toutes les données** pour garantir la confidentialité

---

## 💰 Modèle économique

| Offre | Starter | Pro | Multi |
|-------|---------|-----|-------|
| Prix | 39€/mois | 59€/mois | 99€/mois |
| Core loop complet | ✓ | ✓ | ✓ |
| Flash anti-gaspi | ✓ | ✓ | ✓ |
| Suggestions IA | ✓ | ✓ | ✓ |
| Click & Collect | 50 cmd/mois | Illimité | Illimité |
| Catalogue | 20 produits | Illimité | Illimité |
| Utilisateurs | 1 | 3 | Illimité |
| Rapport PDF hebdo | — | ✓ | ✓ |
| Multi-boulangeries | — | — | ✓ |

---

## 🏗️ Architecture technique

- **Frontend** : Next.js 13 + React 18 + TypeScript + Tailwind CSS
- **Backend** : Supabase (PostgreSQL, Auth, RLS, Realtime)
- **Hébergement** : Netlify avec sous-domaines wildcard
- **Multi-tenant** : Chaque boulangerie sur son sous-domaine
- **PWA** : Application installable sur mobile
- **Notifications** : Web Push (VAPID)
- **Emails** : Resend
- **Rate limiting** : Upstash Redis

---

## 🎯 ROI démontrable en 30 jours

| Scénario | Avant BakeryOS | Après BakeryOS | Économie |
|----------|----------------|----------------|----------|
| Taux d'invendu moyen | 10-12% | 4-6% | **-50%** |
| Ventes anti-gaspi | 0€ | 200-400€/mois | **+3 000€/an** |
| Temps gestion stocks | 30 min/jour | 10 min/jour | **-15h/mois** |
| Commandes en ligne | 0 | 20-50/mois | **Nouveau CA** |

**Économie annuelle estimée : 5 000€ à 15 000€** pour une boulangerie de 300k€ de CA.

---

## 🚀 Pourquoi BakeryOS ?

1. **Problème réel** : L'invendu coûte cher aux boulangers
2. **Solution complète** : Une seule plateforme pour tout gérer
3. **Usage quotidien** : La boucle Matin → Snapshot → Soir crée une habitude
4. **ROI rapide** : Résultats visibles dès le premier mois
5. **Adapté au terrain** : Interface tactile, simple, pensée pour le comptoir
6. **IA intégrée** : Levain apprend et s'améliore chaque jour

---

## 📝 Résumé en une phrase

**BakeryOS aide les boulangers à produire la bonne quantité, les vendeuses à signaler les invendus à temps, et les clients à profiter des bonnes affaires — tout en réduisant le gaspillage alimentaire.**

---

*Fait avec passion · BakeryOS © 2026*