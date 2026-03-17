# 📖 User Stories — BakeryOS

> Documentation des User Stories pour la plateforme SaaS Boulangerie Artisanale
> Format : En tant que [rôle], je veux [action], afin de [bénéfice]

---

## 🎭 Acteurs du Système

| Rôle | Description |
|---|---|
| **Visiteur** | Utilisateur non authentifié consultant la vitrine |
| **Client** | Utilisateur authentifié passant des commandes |
| **Boulanger** | Propriétaire/gestionnaire d'une boulangerie |
| **Employé** | Employé de boulangerie avec accès limité |
| **Admin** | Administrateur de la plateforme BakeryOS |

---

## 🏪 ÉPIC 1 : Vitrine & Navigation

### US-1.1 — Découverte de la boulangerie
**En tant que** Visiteur  
**Je veux** accéder à une page d'accueil attractive  
**Afin de** découvrir les produits et le savoir-faire de la boulangerie

**Critères d'acceptation :**
- [ ] Loading screen animé avec logo SVG
- [ ] Navigation fluide entre les sections (Hero, Savoir-faire, Ingrédients, Galerie)
- [ ] Footer avec informations de contact et horaires
- [ ] Design responsive mobile-first

---

### US-1.2 — Navigation intelligente
**En tant que** Visiteur  
**Je veux** une navbar qui s'adapte au scroll  
**Afin de** avoir une navigation toujours accessible sans obstruer le contenu

**Critères d'acceptation :**
- [ ] Navbar transparente au chargement
- [ ] Fond crème au scroll
- [ ] Logo et liens de navigation visibles
- [ ] Icône panier avec compteur

---

### US-1.3 — Multi-tenant par sous-domaine
**En tant que** Visiteur  
**Je veux** accéder à ma boulangerie via son sous-domaine personnalisé  
**Afin de** voir le catalogue et les informations spécifiques à cette boulangerie

**Critères d'acceptation :**
- [ ] Résolution du slug via sous-domaine (ex: monpain.bakeryos.fr)
- [ ] Fallback via query param en développement (?slug=monpain)
- [ ] Isolation des données entre boulangeries
- [ ] Erreur 404 si boulangerie inexistante

---

## 🛒 ÉPIC 2 : Click & Collect

### US-2.1 — Consultation du catalogue
**En tant que** Visiteur  
**Je veux** parcourir le catalogue de produits  
**Afin de** voir les produits disponibles avec leurs prix

**Critères d'acceptation :**
- [ ] Affichage en grille avec photos, nom, prix
- [ ] Filtres par catégorie (Boulangerie, Viennoiserie, Pâtisserie)
- [ ] Badge "Indisponible" pour produits en rupture
- [ ] Prix affiché avec TVA 5.5%

---

### US-2.2 — Ajout au panier
**En tant que** Visiteur  
**Je veux** ajouter des produits à mon panier  
**Afin de** préparer ma commande click & collect

**Critères d'acceptation :**
- [ ] Bouton +/− sur chaque produit
- [ ] Animation d'ajout au panier
- [ ] Mise à jour du compteur panier
- [ ] Persistance du panier (localStorage)

---

### US-2.3 — Gestion du panier
**En tant que** Visiteur  
**Je veux** modifier le contenu de mon panier  
**Afin de** ajuster ma commande avant validation

**Critères d'acceptation :**
- [ ] Sidebar panier animée
- [ ] Modification des quantités
- [ ] Suppression de produits
- [ ] Affichage du total TTC
- [ ] Bouton "Vider le panier"

---

### US-2.4 — Authentification client
**En tant que** Visiteur avec panier  
**Je veux** m'authentifier via magic link OTP  
**Afin de** finaliser ma commande de manière sécurisée

**Critères d'acceptation :**
- [ ] Saisie email uniquement
- [ ] Envoi d'un code OTP 6 chiffres
- [ ] Validation du code
- [ ] Création automatique de compte
- [ ] Conservation du panier après authentification
- [ ] Rate limiting : 2 tentatives/heure

---

### US-2.5 — Validation de commande
**En tant que** Client authentifié  
**Je veux** choisir un créneau de retrait  
**Afin de** récupérer ma commande au moment qui m'arrange

**Critères d'acceptation :**
- [ ] Sélection de date
- [ ] Créneaux horaires configurés par le boulanger
- [ ] Indication du délai minimum avant retrait
- [ ] Récapitulatif avant confirmation

---

### US-2.6 — Confirmation de commande
**En tant que** Client ayant commandé  
**Je veux** recevoir un email de confirmation  
**Afin de** avoir une preuve de ma commande

**Critères d'acceptation :**
- [ ] Email envoyé via Resend
- [ ] Contenu : récapitulatif, créneau, adresse
- [ ] Numéro de commande unique
- [ ] Lien vers le détail de la commande

---

## 🌙 ÉPIC 3 : Flash Anti-Gaspi

### US-3.1 — Annonce du flash (Teaser)
**En tant que** Visiteur  
**Je veux** voir une bannière annonçant le prochain flash  
**Afin de** planifier mon retour pour profiter des réductions

**Critères d'acceptation :**
- [ ] Bannière visible hors horaires flash
- [ ] Compte à rebours jusqu'au lancement
- [ ] Heure de lancement dynamique (config boulanger)
- [ ] Design accrocheur

---

### US-3.2 — Consultation des paniers flash
**En tant que** Visiteur  
**Je veux** voir les paniers anti-gaspi disponibles  
**Afin de** acheter des invendus à prix réduit

**Critères d'acceptation :**
- [ ] Affichage temps réel (refresh 2 min)
- [ ] Prix barré + prix flash (-40%)
- [ ] Économie réalisée affichée
- [ ] Contenu du panier (nom + emoji uniquement)
- [ ] Quantité disponible

---

### US-3.3 — Achat panier flash
**En tant que** Client authentifié  
**Je veux** réserver un panier flash  
**Afin de** récupérer des invendus à prix réduit

**Critères d'acceptation :**
- [ ] Ajout direct au panier
- [ ] Limitation à 1 panier flash par commande
- [ ] Compte à rebours avant fin du flash
- [ ] Notification si stock épuisé

---

## 🌅 ÉPIC 4 : Espace Boulanger — Production Matin

### US-4.1 — Saisie de la production
**En tant que** Boulanger  
**Je veux** saisir les quantités produites pour chaque produit  
**Afin de** suivre ma production journalière

**Critères d'acceptation :**
- [ ] Liste des produits actifs
- [ ] Contrôles +/− pour chaque produit
- [ ] Saisie rapide par produit
- [ ] Auto-save avec debounce 2s
- [ ] Indicateur de synchronisation

---

### US-4.2 — Suggestions ML de production
**En tant que** Boulanger  
**Je veux** recevoir des suggestions de production  
**Afin de** optimiser mes quantités et réduire les invendus

**Critères d'acceptation :**
- [ ] Suggestions basées sur l'historique
- [ ] Indicateur de confiance (high/medium/low)
- [ ] Bouton "Appliquer tout"
- [ ] Possibilité de modifier les suggestions
- [ ] Calcul du CA estimé en temps réel

---

### US-4.3 — Estimation du CA
**En tant que** Boulanger  
**Je veux** voir le CA estimé en temps réel  
**Afin de** anticiper ma journée commerciale

**Critères d'acceptation :**
- [ ] Calcul automatique (quantité × prix)
- [ ] Affichage en temps réel
- [ ] Comparaison avec moyenne historique

---

## 📸 ÉPIC 5 : Espace Boulanger — Snapshot

### US-5.1 — Saisie du stock étagère 10h
**En tant que** Boulanger ou Employé  
**Je veux** saisir ce qu'il reste en rayon à 10h  
**Afin de** suivre l'évolution des ventes après le rush matinal

**Critères d'acceptation :**
- [ ] Interface simplifiée
- [ ] Saisie rapide par produit
- [ ] Calcul automatique des ventes
- [ ] Auto-save

---

### US-5.2 — Saisie du stock étagère 14h
**En tant que** Boulanger ou Employé  
**Je veux** saisir ce qu'il reste en rayon à 14h  
**Afin de** identifier les risques d'invendus

**Critères d'acceptation :**
- [ ] Alerte amber si >30% stock restant
- [ ] Indication visuelle des produits à risque
- [ ] Historique de la journée visible

---

### US-5.3 — Alerte risque invendu
**En tant que** Boulanger  
**Je veux** être alerté en cas de risque d'invendu  
**Afin de** anticiper et activer le flash anti-gaspi

**Critères d'acceptation :**
- [ ] Badge visuel sur les produits à risque
- [ ] Seuil configurable (défaut 30%)
- [ ] Notification push optionnelle

---

## 🌙 ÉPIC 6 : Espace Boulanger — Bilan Soir

### US-6.1 — Visualisation des KPIs
**En tant que** Boulanger  
**Je veux** voir les KPIs de ma journée  
**Afin de** évaluer ma performance

**Critères d'acceptation :**
- [ ] CA estimé
- [ ] Taux d'invendu
- [ ] Pièces produites vs invendues
- [ ] Comparaison avec historique

---

### US-6.2 — Saisie du stock final
**En tant que** Boulanger  
**Je veux** saisir mon stock final  
**Afin de** calculer les invendus réels

**Critères d'acceptation :**
- [ ] Saisie par produit
- [ ] Calcul automatique taux invendu
- [ ] Déclenchement du flash anti-gaspi si stock > 0

---

### US-6.3 — Génération des paniers flash
**En tant que** Boulanger  
**Je veux** voir les paniers flash suggérés automatiquement  
**Afin de** vendre mes invendus de manière optimisée

**Critères d'acceptation :**
- [ ] 3 types de paniers : Petit-Déj, Gourmand, Grand
- [ ] Prix calculé automatiquement (-40%)
- [ ] Contenu optimisé selon les invendus
- [ ] Possibilité de modifier

---

### US-6.4 — Clôture de journée
**En tant que** Boulanger  
**Je veux** clôturer ma journée  
**Afin de** sauvegarder les données pour les statistiques

**Critères d'acceptation :**
- [ ] Bouton "Clôturer la journée"
- [ ] Confirmation avant clôture
- [ ] Sauvegarde en historique
- [ ] Suggestions pour le lendemain

---

## 📊 ÉPIC 7 : Espace Boulanger — Dashboard

### US-7.1 — Consultation des statistiques
**En tant que** Boulanger  
**Je veux** voir mes statistiques historiques  
**Afin de** analyser ma performance dans le temps

**Critères d'acceptation :**
- [ ] CA moyen par jour
- [ ] Taux d'invendu moyen
- [ ] Graphique d'évolution sur période
- [ ] Week-ends en surbrillance

---

### US-7.2 — Analyse par produit
**En tant que** Boulanger  
**Je veux** voir les statistiques par produit  
**Afin de** identifier les produits à optimiser

**Critères d'acceptation :**
- [ ] Tableau par produit
- [ ] Indicateur coloré (vert <5%, amber 5-8%, rouge >8%)
- [ ] Recommandations automatiques
- [ ] Historique de production

---

### US-7.3 — Sélection de période
**En tant que** Boulanger  
**Je veux** filtrer les statistiques par période  
**Afin de** analyser des périodes spécifiques

**Critères d'acceptation :**
- [ ] Sélection de dates début/fin
- [ ] Raccourcis (7j, 30j, 90j)
- [ ] Export des données (option Pro)

---

## 📦 ÉPIC 8 : Espace Boulanger — Catalogue

### US-8.1 — Consultation du catalogue
**En tant que** Boulanger  
**Je veux** voir tous mes produits  
**Afin de** gérer mon catalogue

**Critères d'acceptation :**
- [ ] Liste avec photo, nom, prix, catégorie
- [ ] Indicateur actif/inactif
- [ ] Limite 20 produits (plan Starter)
- [ ] Recherche et filtres

---

### US-8.2 — Ajout d'un produit
**En tant que** Boulanger  
**Je veux** ajouter un nouveau produit  
**Afin de** enrichir mon catalogue

**Critères d'acceptation :**
- [ ] Formulaire complet (nom, prix, coût, catégorie, emoji, allergènes)
- [ ] Upload de photo
- [ ] Validation des champs
- [ ] Activation/désactivation catalogue et flash

---

### US-8.3 — Modification d'un produit
**En tant que** Boulanger  
**Je veux** modifier un produit existant  
**Afin de** mettre à jour mes informations

**Critères d'acceptation :**
- [ ] Modal d'édition
- [ ] Prévisualisation de la photo
- [ ] Historique des modifications

---

### US-8.4 — Suppression d'un produit
**En tant que** Boulanger  
**Je veux** supprimer un produit  
**Afin de** nettoyer mon catalogue

**Critères d'acceptation :**
- [ ] Confirmation avant suppression
- [ ] Archive soft (données conservées pour stats)
- [ ] Message de confirmation

---

### US-8.5 — Upload de photo
**En tant que** Boulanger  
**Je veux** uploader une photo pour chaque produit  
**Afin de** illustrer mon catalogue

**Critères d'acceptation :**
- [ ] Glisser-déposer ou sélection
- [ ] Formats acceptés : JPG, PNG, WebP
- [ ] Optimisation automatique (Sharp)
- [ ] Stockage Supabase Storage

---

## ⚙️ ÉPIC 9 : Espace Boulanger — Paramètres

### US-9.1 — Gestion du profil
**En tant que** Boulanger  
**Je veux** modifier les informations de ma boulangerie  
**Afin de** personnaliser ma vitrine

**Critères d'acceptation :**
- [ ] Nom de la boulangerie
- [ ] Adresse
- [ ] Horaires d'ouverture
- [ ] Configuration des créneaux de retrait

---

### US-9.2 — Configuration du flash
**En tant que** Boulanger  
**Je veux** configurer les paramètres du flash  
**Afin de** personnaliser la vente des invendus

**Critères d'acceptation :**
- [ ] Heure de début du flash
- [ ] Heure de fin
- [ ] Pourcentage de remise (défaut 40%)
- [ ] Activation/désactivation

---

### US-9.3 — Tour guidé onboarding
**En tant que** Nouveau Boulanger  
**Je veux** bénéficier d'un tour guidé  
**Afin de** découvrir toutes les fonctionnalités

**Critères d'acceptation :**
- [ ] Wizard interactif style Spotlight
- [ ] 8 étapes couvrant toutes les vues
- [ ] Progression visuelle
- [ ] Possibilité de passer/skiper

---

## 📱 ÉPIC 10 : Notifications

### US-10.1 — Activation notifications push
**En tant que** Boulanger  
**Je veux** activer les notifications push  
**Afin de** être informé des nouveaux événements

**Critères d'acceptation :**
- [ ] Toggle d'activation
- [ ] Demande de permission navigateur
- [ ] Enregistrement VAPID
- [ ] Indicateur d'état

---

### US-10.2 — Notification nouvelle commande
**En tant que** Boulanger  
**Je veux** être notifié lors d'une nouvelle commande  
**Afin de** la préparer rapidement

**Critères d'acceptation :**
- [ ] Notification push instantanée
- [ ] Contenu : nom client, total, créneau
- [ ] Lien vers le détail

---

### US-10.3 — Rappel cloture journée
**En tant que** Boulanger  
**Je veux** recevoir un rappel pour clôturer ma journée  
**Afin de** ne pas oublier de sauvegarder mes données

**Critères d'acceptation :**
- [ ] Notification à heure configurable
- [ ] Rappel si journée non clôturée
- [ ] Option de désactivation

---

## 🔐 ÉPIC 11 : Authentification & Sécurité

### US-11.1 — Inscription boulanger
**En tant que** Nouvel utilisateur  
**Je veux** créer un compte boulangerie  
**Afin de** commencer à utiliser BakeryOS

**Critères d'acceptation :**
- [ ] Formulaire : email, password, nom boulangerie, slug
- [ ] Vérification unicité du slug
- [ ] Email de bienvenue
- [ ] Tour guidé au premier login

---

### US-11.2 — Connexion boulanger
**En tant que** Boulanger  
**Je veux** me connecter à mon espace  
**Afin de** gérer ma boulangerie

**Critères d'acceptation :**
- [ ] Authentification email + password
- [ ] Session persistante (JWT)
- [ ] Redirection vers le dashboard

---

### US-11.3 — Réinitialisation mot de passe
**En tant que** Boulanger  
**Je veux** réinitialiser mon mot de passe  
**Afin de** récupérer l'accès à mon compte

**Critères d'acceptation :**
- [ ] Lien "Mot de passe oublié"
- [ ] Email avec lien de réinitialisation
- [ ] Formulaire de nouveau mot de passe
- [ ] Expiration du lien (24h)

---

### US-11.4 — Déconnexion
**En tant que** Boulanger connecté  
**Je veux** me déconnecter  
**Afin de** sécuriser mon compte

**Critères d'acceptation :**
- [ ] Bouton de déconnexion
- [ ] Invalidation de session
- [ ] Redirection vers login

---

## 📈 ÉPIC 12 : Admin Platform

### US-12.1 — Dashboard admin
**En tant que** Admin  
**Je veux** voir un tableau de bord global  
**Afin de** superviser la plateforme

**Critères d'acceptation :**
- [ ] Nombre de boulangeries actives
- [ ] Statistiques globales (CA, commandes)
- [ ] Alertes et erreurs système
- [ ] Métriques de performance

---

### US-12.2 — Gestion des boulangeries
**En tant que** Admin  
**Je veux** gérer les boulangeries  
**Afin de** administrer les comptes

**Critères d'acceptation :**
- [ ] Liste de toutes les boulangeries
- [ ] Activation/suspension de compte
- [ ] Modification du plan
- [ ] Vue détaillée par boulangerie

---

### US-12.3 — Gestion des plans
**En tant que** Admin  
**Je veux** gérer les plans tarifaires  
**Afin de** administrer la facturation

**Critères d'acceptation :**
- [ ] Attribution de plan
- [ ] Historique des changements
- [ ] Limites par plan

---

## 📋 Priorisation MoSCoW

### Must Have (M) — MVP
- US-1.1, US-1.2, US-1.3 — Vitrine de base
- US-2.1, US-2.2, US-2.3, US-2.4, US-2.5, US-2.6 — Click & Collect complet
- US-3.1, US-3.2, US-3.3 — Flash Anti-Gaspi
- US-4.1, US-6.2 — Production et stock final
- US-8.1, US-8.2, US-8.3 — CRUD Catalogue
- US-11.1, US-11.2, US-11.4 — Authentification

### Should Have (S) — V1
- US-4.2, US-4.3 — Suggestions ML et estimation CA
- US-5.1, US-5.2, US-5.3 — Snapshot et alertes
- US-6.1, US-6.3, US-6.4 — Bilan soir complet
- US-7.1, US-7.2 — Dashboard stats
- US-9.1 — Paramètres profil
- US-10.1 — Notifications push

### Could Have (C) — V2
- US-7.3 — Export données
- US-8.5 — Upload photos avancé
- US-9.2 — Configuration flash avancée
- US-9.3 — Tour guidé
- US-10.2, US-10.3 — Notifications avancées
- US-11.3 — Reset password

### Won't Have (W) — Futur
- US-12.1, US-12.2, US-12.3 — Admin platform
- Multi-utilisateurs par boulangerie
- Application mobile native
- API publique + webhooks

---

## 📊 Estimation Story Points

| Épic | US | Points | Priorité |
|---|---|---|---|
| ÉPIC 1 | US-1.1 | 3 | M |
| | US-1.2 | 2 | M |
| | US-1.3 | 5 | M |
| ÉPIC 2 | US-2.1 | 3 | M |
| | US-2.2 | 2 | M |
| | US-2.3 | 3 | M |
| | US-2.4 | 5 | M |
| | US-2.5 | 3 | M |
| | US-2.6 | 2 | M |
| ÉPIC 3 | US-3.1 | 3 | M |
| | US-3.2 | 5 | M |
| | US-3.3 | 3 | M |
| ÉPIC 4 | US-4.1 | 3 | M |
| | US-4.2 | 8 | S |
| | US-4.3 | 2 | S |
| ÉPIC 5 | US-5.1 | 2 | S |
| | US-5.2 | 2 | S |
| | US-5.3 | 3 | S |
| ÉPIC 6 | US-6.1 | 3 | S |
| | US-6.2 | 2 | M |
| | US-6.3 | 5 | S |
| | US-6.4 | 3 | S |
| ÉPIC 7 | US-7.1 | 5 | S |
| | US-7.2 | 3 | S |
| | US-7.3 | 2 | C |
| ÉPIC 8 | US-8.1 | 2 | M |
| | US-8.2 | 3 | M |
| | US-8.3 | 2 | M |
| | US-8.4 | 2 | S |
| | US-8.5 | 5 | C |
| ÉPIC 9 | US-9.1 | 3 | S |
| | US-9.2 | 3 | C |
| | US-9.3 | 5 | C |
| ÉPIC 10 | US-10.1 | 3 | S |
| | US-10.2 | 3 | C |
| | US-10.3 | 2 | C |
| ÉPIC 11 | US-11.1 | 5 | M |
| | US-11.2 | 3 | M |
| | US-11.3 | 3 | C |
| | US-11.4 | 1 | M |
| ÉPIC 12 | US-12.1 | 8 | W |
| | US-12.2 | 5 | W |
| | US-12.3 | 5 | W |

**Total MVP (Must Have) :** 57 points  
**Total V1 (Must + Should) :** 120 points  

---

*BakeryOS — Documentation User Stories © 2026*