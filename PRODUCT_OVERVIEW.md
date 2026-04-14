# Sauve Mie — Vue produit

## 🚀 Fonctionnalités implémentées

### Prévision de production et suggestions IA

- **Suggestions ML historiques** — recommandations basées sur l'historique par jour de semaine avec confiance (high/medium/low)
- **Saisie production matin** — interface par produit avec contrôles +/− et débounce auto-save
- **Estimé CA temps réel** — calcul dynamique lors de la saisie
- **Alertes invendu** — risque visualisé en barre amber si stock étagère > 30%
- **Report inter-journées** — invendus J-1 affichés pour produits avec durée conservation > 1 jour
- **Rapport IA clôture** — génération via z.ai (GLM 4.5) avec briefing matin/vendeuse et prévisions
- **Suggestions de production demain** — basées sur taux d'invendu du jour
- **Impact météo sur ventes** — analyse historique via Open-Meteo

### Gestion des ventes et clic & collect

- **Catalogue produits complet** — CRUD (nom, prix, coût, catégorie, emoji, allergènes, photos, durée conservation)
- **Vitrine produits** — affichage responsive avec filtres par catégorie
- **Snapshots étagères** — saisie à 10h et 14h avec calcul automatique des ventes
- **Commandes clients** — liste avec statuts (en attente, confirmée, retirée, annulée)
- **Gestion clients** — profil avec historique commandes, déblocage post-achat
- **KPIs quotidiens** — CA, taux invendu, pièces produites/invendues, économie pertes

### Paniers anti-gaspi et invendus (flash)

- **Paniers flash automatiques** — compositions temps réel des invendus de fin de journée
- **Générateur algorithmique** — création de 3 paniers optimisés (Petit-Déjeuner, Gourmand, Grand Panier)
- **Vitrine flash live** — affichage avec compte à rebours et prix réduits
- **Bannière flash** — 3 états (masqué, teaser, live) sur la page d'accueil
- **Remises configurables** — tarification flash personnalisable par boulangerie
- **Historique paniers** — suivi des ventes flash et composition
- **Estimation valeur sauvée** — calcul de pertes évitées en euros

### Site web vitrine et catalogue

- **Landing page complète** — Hero, Savoir-faire, Ingrédients, Galerie masonry, Footer
- **Design responsive** — mobile, tablette, desktop avec animations fluides (Framer Motion)
- **Loading screen animé** — SVG tracé + transitions de phase
- **Navbar dynamique** — transparente → fond crème au scroll
- **SEO complet** — JSON-LD Schema.org, meta tags, sitemap.xml
- **Panier client** — sidebar animée avec TVA 5.5%, ajout/suppression, checkout
- **Galerie photos** — masonry layout avec optimisation Sharp
- **Édition vitrine** — interface boulanger pour personnaliser sections et photos

### Authentification et gestion utilisateurs

- **Auth boulanger** — email + password avec JWT Bearer tokens
- **Magic Link OTP clients** — authentification sans mot de passe (quota 2/h)
- **Gestion équipe** — ajout/suppression collaborateurs, rôles (owner/member)
- **Permissions granulaires** — contrôles d'accès par action (read/write/delete)
- **Historique audit complet** — suivi des modifications par utilisateur
- **Multi-utilisateurs** — plan Starter (1), Pro (3), Multi (illimité)
- **Déblocage clients spécialisés** — après premier achat ou manuellement

### Notifications et engagement

- **Push notifications navigateur** — via Web Push API et VAPID
- **Abonnement push** — opt-in/opt-out avec gestion des subscriptions
- **Notifications commandes** — alertes nouvelles commandes/changements statut
- **Notifications flash** — annonce lancement paniers invendus
- **Email de confirmation** — via Resend après chaque commande
- **PWA installable** — manifest.json complet avec icônes multi-tailles
- **Service Worker** — offline mode et caching statique
- **Shortcuts PWA** — "Production du matin", "Commandes"

### Tableaux de bord et rapports

- **Dashboard principal** — KPIs synthétiques (CA jour, invendus %, tendances)
- **Vue semaine par jour** — 7 cards avec statistiques agrégées (CA, invendus, pertes)
- **Détail jour cliquable** — meilleur/pire CA, top 5 ventes/invendus, répartition commandes
- **Graphiques Recharts** — barres CA/Invendus, semaines en surbrillance
- **Tableau par produit** — indicateurs colorés (vert <5%, amber 5-8%, rouge >8%)
- **Dashboard supervision** — vue multi-boulangeries avec agrégats
- **Historique complet** — données uniquement après clôture
- **Récapitulatif semaine** — performance par jour de semaine

### Recettes et coût matière première

- **Gestion recettes** — définition des ingrédients par unité produite
- **Mapping ingrédients** — farine, beurre, œufs, sucre, sel, levure, levain, eau, lait, chocolat, huile, crème
- **Sources recette** — manual (saisie), auto (assistant), default (template)
- **Historique recettes** — suivi des modifications
- **Calcul coût MP** — à implémenter pour optimiser production

### Gamification et défis

- **Système de défis** — défis actifs et récents (derniers 7 jours)
- **Profil gamification** — points, badges, niveaux par boulanger
- **Historique défis** — suivi complet avec dates et résultats
- **Tableau défis** — visualisation des performances
- **Onglet défis dashboard** — intégration complète dashboard-v2

### Collaboration et support

- **Tour guidé interactif** — onboarding Spotlight avec 8 étapes couvrant toutes les vues
- **Wizard création catalogue** — assistant pour premiers produits
- **Feedback fin de journée** — modale pour recueillir retours
- **Modalités help** — descriptions contextuelles des vues
- **Équipe manager** — interface CRUD équipe avec permissions

---

## 🔧 Outils tiers utilisés

### IA et intelligence

| Outil | Rôle | Type |
|---|---|---|
| **z.ai (GLM 4.5 Air)** | Génération rapports IA, briefings matin/vendeuse, prévisions production | LLM / Rapport |
| **Open-Meteo** | Données météo actuelles et prévisions (gratuit, sans clé API) | Météo / Analytics |

### Bases de données et authentification

| Outil | Rôle | Type |
|---|---|---|
| **Supabase PostgreSQL** | Base de données relationnelle, authentification, stockage photos, RLS, Realtime | Base de données / Auth |

### Emails et notifications

| Outil | Rôle | Type |
|---|---|---|
| **Resend** | Envoi emails de confirmation commande (intégration SDK) | Email |
| **Web Push API** | Notifications push navigateur avec VAPID protocol | Notifications |

### Infrastructure et performance

| Outil | Rôle | Type |
|---|---|---|
| **Upstash Redis** | Rate limiting serverless cross-instances (création commandes) | Cache / Rate limiting |
| **Netlify** | Hébergement, serverless functions, CI/CD, wildcard subdomains (*.sauve-mie.fr) | Hébergement |

### Intégrations optionnelles

| Outil | Rôle | Type |
|---|---|---|
| **Airtable** | Synchronisation optionnelle catalogue/commandes (proxy chiffré) | Intégration |

---

## 🛠 Stack technique utilisée

### Frontend

| Composant | Technologie | Version | Rôle |
|---|---|---|---|
| Framework | **Next.js** | 16.2 | App Router, SSR/SSG, API routes |
| Langage | **TypeScript** | 5.4 | Typage statique renforcé |
| Bibliothèque UI | **React** | 18.3 | UI declarative et hooks |
| CSS | **Tailwind CSS** | 3.4 | Styling utility-first |
| Composants UI | **shadcn/ui + Radix UI** | Latest | Composants accessibles (Dialog, Tabs, Select, Accordion, etc.) |
| Formulaires | **React Hook Form** | 7.53 | Gestion formulaires performante |
| Validation | **Zod** | 3.23 | Schémas validation TypeScript-first |
| Animations | **Framer Motion** | 12.35 | Animations fluides et transitions |
| Graphiques | **Recharts** | 2.12 | Visualisation données (barres, lignes) |
| Icônes | **Lucide React** | 0.446 | Set d'icônes cohérentes |
| Carrousel | **Embla Carousel** | 8.6 | Slider images responsive |
| Toast/Alerts | **Sonner** | 1.5 | Notifications utilisateur |
| OTP Input | **Input OTP** | 1.4 | Saisie code OTP |
| Panneaux résizables | **React Resizable Panels** | 2.1 | Layouts flexibles |
| Modal Drawer | **Vaul** | 1.1 | Drawers et modales |
| Thème | **Next Themes** | 0.4 | Gestion dark/light mode |

### Backend

| Composant | Technologie | Rôle |
|---|---|---|
| Runtime | **Node.js (Netlify Functions)** | Exécution serveur |
| API Strategy | **REST API** | GET/POST/PUT routes Next.js |
| Database ORM | **Supabase SDK** | Accès Supabase depuis serveur |
| Service role | **SUPABASE_SERVICE_ROLE_KEY** | Opérations serveur privilegiées |
| RPC Functions | **Supabase SQL SECURITY DEFINER** | Fonctions `get_catalogue_public()`, `get_paniers_flash()` |

### Base de données

| Composant | Technologie | Rôle |
|---|---|---|
| Système | **PostgreSQL 15** | Moteur relationnel |
| Hébergement | **Supabase** | Cloud PostgreSQL managé |
| Authentification | **Supabase Auth** | JWT, Magic Link, OTP, email+password |
| Stockage fichiers | **Supabase Storage** | Images catalogue, photos produits |
| Realtime | **Supabase Realtime** | WebSocket subscriptions temps réel |
| Row Level Security | **PostgreSQL RLS** | Sécurité multi-tenant par ligne |
| Migrations | **SQL custom** | Schéma complet (migration-complete.sql + seed.sql) |

### Infrastructure et déploiement

| Composant | Technologie | Rôle |
|---|---|---|
| Hébergement | **Netlify** | CDN global, serverless functions |
| CI/CD | **GitHub Actions** | Tests Playwright automatisés |
| Domaines | **Wildcard subdomains** | *.sauve-mie.fr multi-tenant |
| Plugin | **@netlify/plugin-nextjs** | Optimisation Next.js sur Netlify |

### Tests et qualité

| Composant | Technologie | Version | Rôle |
|---|---|---|---|
| Tests E2E | **Playwright** | 1.58 | Tests navigateur complets |
| Tests unitaires | **Playwright** | 1.58 | Tests unitaires au besoin |
| Linting | **ESLint** | 8.57 | Vérification code quality |
| Type checking | **TypeScript** | 5.4 | tsc --noEmit |
| Image optimization | **Sharp** | 0.34 | Compression images serveur |

### Outils IA / ML et analytics

| Composant | Technologie | Rôle |
|---|---|---|
| Rapport IA | **z.ai GLM 4.5 Air** | Génération rapport clôture avec reasoning |
| Météo | **Open-Meteo API** | Données météo gratuite, impact analyse |
| ML production | **Algorithmes custom** | Historique par jour/produit avec confidence |
| Statistiques | **PostgreSQL agrégations** | Calculs en base avec RLS |
| Analytics | **Supabase Realtime** | Mise à jour live des KPIs |

### Autres outils et utilitaires

| Outil | Version | Rôle |
|---|---|---|
| CSS Processing | PostCSS 8.5 | Compilation CSS |
| CSS Vendor prefixes | AutoPrefixer 10.4 | Compatibilité navigateurs |
| CSS Variants | CVA 0.7 | Composition variants scalable |
| CSS Classes | clsx 2.1 | Composition dynamique |
| Form Validation | Zod 3.23 | Schemas end-to-end typed |
| Date Picker | React Day Picker 9.14 | Sélecteur dates accessibles |
| Command Palette | cmdk 1.1 | Search/command UI |
| OTP Input | Input OTP 1.4 | Saisie code OTP |
| Carousel | Embla 8.6 | Images slider responsive |
| Alertes | Sonner 1.5 | Toast notifications |
| Drawers | Vaul 1.1 | Modales et drawers |
| Image compression | Sharp 0.34 | Optimisation images serveur |
| Type checking | TypeScript strict | tsc --noEmit |

### Sécurité et conformité

| Pratique | Implémentation | Notes |
|---|---|---|
| HTTPS | Netlify (Let's Encrypt prod) | Self-signed dev |
| Rate limiting | Upstash Redis | Cross-instance, sur routes public |
| CORS | Same-site enforcement | Contrôle origins |
| Input validation | Zod + sanitization custom | End-to-end validation |
| RLS (Row Level Security) | PostgreSQL policies | Toutes tables protégées |
| Auth tokens | Supabase JWT + Bearer | Expiration et refresh |
| Audit trail | audit_logs table | Traçabilité complète |
| Multi-tenant isolation | RLS + slug validation | Aucune fuite cross-tenant |
| RGPD | Data anonymization | Rapports IA sans PII |
| Encryption | TweetNaCl (Airtable keys) | Clés API chiffrées |

---

## 📐 Architecture générale

- **Modèle multi-tenant** : chaque boulangerie sur sous-domaine (ex: `monpain.sauve-mie.fr`) ou query param `?slug=...`
- **Isolation données** : RLS PostgreSQL + slug validation — aucun cross-tenant possible
- **Édition temps réel** : auto-save debounce (2s) + Realtime Supabase subscriptions
- **Performance** : RPC SECURITY DEFINER pour catalogue/flash (anon key), indexes sur jour_semaine
- **Scalabilité** : serverless Netlify + Supabase PostgreSQL managé + Upstash Redis
- **Tables principales** : boulangeries, produits, journees, stocks_journaliers, commandes, paniers_flash, defis, gamification_profil, recettes_produits, ai_rapports, employes, audit_logs (19 tables)
- **Webhooks** : production_forecasts automatiques après clôture
- **Réplication données** : snapshots jour_semaine agrégés pour stats performantes

---

## 🎯 État de maturité du produit (2026-04-14)

### ✅ **Fonctionnalités core : 85% implémentées et testées**

**Complètement opérationnel :**
- Espace boulanger (matin, snapshot, soir, stats) — interface complète avec auto-save
- Vitrine client et click & collect — catalogue, paniers, paiement (routes API)
- Paniers flash anti-gaspi — génération automatique, affichage temps réel
- Authentification — boulanger (email+password), client (Magic Link OTP)
- Gestion équipe — CRUD, permissions, audit trail
- Notifications push — Web API + abonnements
- Rapports IA — via z.ai avec briefings matin/vendeuse
- Gamification — défis, profil, points (tables complètes)
- Recettes — structure MP complète (19 ingrédients)

**Couvert par tests :**
- 27 fichiers de test Playwright (E2E, security, smoke, unit)
- CI/CD GitHub Actions
- Linting + type checking strict

### ⚠️ **Fonctionnalités à considérer comme draft**

**Partiellement implémenté :**
- Export PDF/Excel rapports — structure API (`/api/boulanger/export`), rendu frontend incomplet
- Intégration Airtable — proxy chiffré présent, synchronisation bidirectionnelle non finalisée
- Dashboard supervision — créé (`dashboard-supervision.tsx`), nécessite données multi-tenant
- Saisie vocale Whisper — documenté dans `ia.md`, pas de code
- Assistant IA contextuel (chat RAG) — prêt architecturalement, implémentation minimale

**Non implémenté en production :**
- Calcul coût matière première exact (recettes présentes, logique agrégation manquante)
- Certificat CO₂ mensuel (mentionné road-trip, structure manquante)
- API publique + webhooks (architecture prête, endpoints non exposés)
- Application mobile native (PWA opérationnelle)

### 📊 **Indicateurs de maturité**

| Dimension | Score | Observations |
|---|---|---|
| **Code quality** | 85/100 | TypeScript strict, composants bien découpés (~12.5k LOC composants), débts mineurs |
| **Test coverage** | 75/100 | 27 fichiers test, focus E2E/smoke, couverture unitaire faible |
| **Security** | 90/100 | RLS solide, rate limiting, JWT, audit trail, quelques edge cases à couvrir |
| **Performance** | 80/100 | Indexes jour_semaine, RPC optimisées, debounce/lazy load implémentés, optimisation images |
| **Scalabilité** | 70/100 | Serverless Netlify OK, RLS peut impacter avec 1000+ boulangeries, Redis rate limiting solide |
| **Documentation** | 65/100 | Architecture.md complet, prompts IA documentés, code insuffisamment commenté |
| **UX/Design** | 80/100 | Animations fluides (Framer), navigation cohérente, onboarding présent, ergonomie vendeuse à valider |
| **Product-market fit** | 60/100 | Core value (anti-gaspi) démontrable, adoption lente (tech boulangerie), cycle vente long |

### 🚧 **Blocages et limitations présentes**

1. **Quota IA** — rate limit z.ai sur rapports, fallback manuel en cas dépassement
2. **Temps réel limité** — Realtime Supabase fonctionne, mais pas sur toutes tables (stocks_journaliers)
3. **Export PDF** — structure API présente, formatage backend non finalisé
4. **Intégration caisse** — caisse (Lightspeed, Zelty) documentée comme roadmap, 0 code
5. **Performance multi-tenant** — RLS + agrégations peuvent ralentir à >500 boulangeries

### 💡 **Prêt pour**

- ✅ MVP avec 10–20 boulangeries
- ✅ Démo/validation produit auprès d'early adopters
- ✅ Collection de feedback sur UX vendeuse
- ⚠️ Déploiement production (avec 1–2 cycles bugs fixes)
- ❌ Scaling 100+ boulangeries sans refactor RLS

### ⏱ **Effort estimé pour « production-ready »**

- Export PDF + email : **1–2 semaines**
- Intégration caisse basique : **2–3 semaines**
- Optimisation RLS perf (scaling) : **2–4 semaines**
- Assistant IA chatbot (RAG Supabase) : **2–3 semaines**
- Mobile native (React Native) : **6–8 semaines**

---

**Verdict :** Produit **fonctionnellement mature** pour PMV avec équipe réduite. Core loop (matin→snapshot→soir→stats) fiable, IA opérationnelle, sécurité solide. Prêt pour adoption early adopters sous 2–4 semaines de polissage et performance testing.

