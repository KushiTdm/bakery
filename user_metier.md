# 📖 User Stories — BakeryOS
*(Header et contenu principal inchangés — mise à jour de la section État d'implémentation)*

> Documentation des User Stories pour la plateforme SaaS Boulangerie Artisanale

---

## 📊 État d'implémentation — MIS À JOUR 17/03/2026

### ✅ MUST HAVE — MVP complet (100%)

| US | Description | Statut | Notes |
|---|---|---|---|
| US-1.1 | Découverte de la boulangerie | ✅ | Loading screen, navbar, footer |
| US-1.2 | Navigation intelligente | ✅ | Navbar transparente → crème au scroll |
| US-1.3 | Multi-tenant par sous-domaine | ✅ | Résolution slug via sous-domaine |
| US-2.1 | Consultation du catalogue | ✅ | Filtres par catégorie, grille responsive |
| US-2.2 | Ajout au panier | ✅ | Boutons +/−, animation, persistance |
| US-2.3 | Gestion du panier | ✅ | Sidebar animée, TVA 5.5% |
| US-2.4 | Authentification client | ✅ | OTP Magic Link via Supabase |
| US-2.5 | Validation de commande | ✅ | Créneaux configurables |
| US-2.6 | Confirmation de commande | ✅ | Email Resend |
| US-3.1 | Annonce du flash (Teaser) | ✅ | Bannière avec compte à rebours |
| US-3.2 | Consultation des paniers flash | ✅ | Temps réel, prix barré, allergènes |
| US-3.3 | Achat panier flash | ✅ | Ajout au panier, limite 1 |
| US-4.1 | Saisie de la production | ✅ | Auto-save 2s |
| US-6.2 | Saisie du stock final | ✅ | Déclenche le flash |
| US-8.1 | Consultation du catalogue | ✅ | Liste avec indicateurs |
| US-8.2 | Ajout d'un produit | ✅ | Formulaire complet |
| US-8.3 | Modification d'un produit | ✅ | Modal d'édition |
| US-11.1 | Inscription boulanger | ✅ | Email + password + slug |
| **US-11.2** | **Connexion boulanger** | **✅ CORRIGÉ** | **Fix S0 : client OTP bloqué à /boulanger** |
| US-11.4 | Déconnexion | ✅ | Invalidation session |

---

### 🟡 SHOULD HAVE — V1 (92%)

| US | Description | Statut | Notes |
|---|---|---|---|
| US-4.2 | Suggestions ML de production | ✅ | Basées sur historique, confidence levels |
| US-4.3 | Estimation du CA | ✅ | En temps réel |
| US-5.1 | Saisie du stock étagère 10h | ✅ | Interface simplifiée |
| US-5.2 | Saisie du stock étagère 14h | ✅ | Avec alertes |
| US-5.3 | Alerte risque invendu | ✅ | Badge visuel > 30% |
| US-6.1 | Visualisation des KPIs | ✅ | CA, taux invendu, pièces |
| US-6.3 | Génération des paniers flash | ✅ | 3 types automatiques, persistés |
| US-6.4 | Clôture de journée | ✅ | Sauvegarde historique |
| US-7.1 | Consultation des statistiques | ✅ | Graphiques, filtres |
| US-7.2 | Analyse par produit | ✅ | Indicateurs colorés |
| US-8.4 | Suppression d'un produit | ✅ **AMÉLIORÉ** | Soft delete via `deleted_at` (fix E2) |
| US-9.1 | Gestion du profil | ✅ | Adresse, horaires, créneaux |
| US-10.1 | Activation notifications push | ✅ | Toggle VAPID |

---

### 🔵 COULD HAVE — V2 (57%)

| US | Description | Statut | Notes |
|---|---|---|---|
| US-7.3 | Sélection de période | ⚪ | Pagination cursor-based à implémenter |
| US-8.5 | Upload de photo avancé | 🟡 | Upload basique + compression WebP existant |
| US-9.2 | Configuration du flash | ✅ | UI présente dans Paramètres |
| US-9.3 | Tour guidé onboarding | ✅ | 8 étapes Spotlight |
| US-10.2 | Notification nouvelle commande | ✅ | Push instantané |
| US-10.3 | Rappel clôture journée | ⚪ | Option configurable à implémenter |
| US-11.3 | Réinitialisation mot de passe | ✅ | Via Supabase reset flow |

---

### ⚪ WON'T HAVE — Futur (0%)

| US | Description | Statut |
|---|---|---|
| US-12.1 | Dashboard admin | ⚪ |
| US-12.2 | Gestion des boulangeries | ⚪ |
| US-12.3 | Gestion des plans | ⚪ |

---

## 📈 Avancement global mis à jour

| Phase | US Total | US Implémentées | % |
|---|---|---|---|
| MVP (Must) | 20 | 20 | **100%** |
| V1 (Should) | 13 | 12 | **92%** |
| V2 (Could) | 7 | 4 | **57%** |
| Futur (Won't) | 3 | 0 | **0%** |
| **TOTAL** | **43** | **36** | **84%** |

---

## 🔧 Actions prioritaires restantes

### 🔴 Bloquant lancement (non-technique)
1. Aligner les tarifs landing ↔ app (39/69/119€)
2. Créer les produits/prix dans Stripe Dashboard
3. Configurer SMTP Resend dans Supabase

### 🟡 Améliorations V2
4. **US-7.3** — Export données statistiques (plan Pro)
5. **US-10.3** — Rappels de clôture configurables
6. **US-8.5** — Améliorer upload (drag & drop, crop)
7. Brancher `CatalogueStarter` au flux post-inscription Stripe

### 🔵 Infrastructure
8. Exécuter `migrations/migration-final-v3.sql` en production
9. Wildcard DNS `*.bakeryos.fr` → Netlify
10. Monitoring Sentry

---

*BakeryOS — Documentation User Stories © 2026*
*Mis à jour le 17/03/2026 — Fix S0 (US-11.2), Fix E2 (US-8.4), avancement 80% → 84%*