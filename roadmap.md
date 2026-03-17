# Roadmap BakeryOS 🥖
*Mis à jour — 17 mars 2026*

---

## SCORE DE RÉUSSITE À 12 MOIS — 68 / 100

| Dimension | Score | Poids | Commentaire |
|---|---|---|---|
| Développement | 75/100 | 20% | Architecture propre, mais **vulnérabilité critique S0 ouverte** |
| Fonctionnel | 78/100 | 20% | Core loop complet, config flash/créneaux/adresse opérationnelle |
| Marché | 55/100 | 15% | ~5 000–8 000 boulangeries cibles. Milieu conservateur |
| Use case | 78/100 | 15% | ROI démontrable < 30 jours. 8–15% du CA perdu en invendu |
| Offre & Demande | 62/100 | 15% | Landing + Stripe opérationnels = conversion self-service possible |
| Économique | 48/100 | 10% | Tarification landing (39/69/119€) à réconcilier avec app (19/49/99€) |
| Concurrence | 62/100 | 5% | Pas de concurrent direct sur le segment artisanal FR |

**Score global : 68 / 100 → probabilité de réussite à 12 mois estimée à 68%**

⚠️ **Le score a baissé de 3 points suite à la découverte de la vulnérabilité critique S0.**

---

## 🚨 BLOQUANT CRITIQUE — À CORRIGER AVANT TOUTE MISE EN PRODUCTION

### S0. Accès non autorisé à `/boulanger` pour les clients

**Problème** : Un client authentifié (via OTP Magic Link) peut accéder à l'interface boulanger.

**Impact** : 
- Interface d'administration visible par les clients
- Risque de confusion et perte de confiance
- Potentiellement des données exposées

**Correction** : Voir `audit-security.md` pour le code de correction

**Priorité** : 🔴 **CRITIQUE** — Bloque toute mise en production

---

## ARCHITECTURE GLOBALE — DEUX PROJETS

```
bakery-saas-landing/          bakery-app/ (project-boulangerie)
─────────────────────         ────────────────────────────────
Next.js 16 / React 19         Next.js 13 / React 18
Tailwind 4                    Tailwind 3 + Framer Motion
Stripe (abonnements)          Supabase (auth, DB, storage)
Supabase (pré-création user)  Netlify (hébergement)
Vercel (recommandé)           *.bakeryos.fr (multi-tenant)

bakeryos.fr                   app.bakeryos.fr
  ↓ S'inscrire                  ↓ Accès espace boulanger
  ↓ Choisir plan                ↓ monpain.bakeryos.fr
  ↓ Stripe checkout             ↓ vitrine client
  ↓ Webhook → Supabase
  ↓ Email de bienvenue
  ↓ → app.bakeryos.fr
```

---

## POINTS D'ATTENTION CRITIQUES

### ⚠️ Vulnérabilité sécurité S0 (nouveau)
Un client authentifié peut accéder à `/boulanger`. La vérification se fait uniquement sur l'existence d'une session, pas sur le rôle. **À corriger en priorité absolue.**

### ⚠️ Tarification incohérente entre les deux projets
La landing affiche **39 / 69 / 119€/mois** mais l'app est configurée pour **19 / 49 / 99€/mois**. Les deux doivent être alignés avant tout lancement.

### ⚠️ Le pont landing → app n'est pas fermé
Après le checkout Stripe, le boulanger doit recevoir un email "définir votre mot de passe". Ce flux dépend de Resend pour l'email de setup.

### ⚠️ Slug auto-généré peut créer des conflits
Dans `create-trial`, le slug est généré depuis le nom. Si deux boulangeries ont le même nom, conflit.

---

## ÉTAT DES DEUX PROJETS

### Landing (`bakery-saas-landing`)

| Composant | Statut |
|---|---|
| Page marketing complète (FR + EN) | ✅ |
| Formulaire inscription + Stripe checkout | ✅ |
| Essai 14 jours sans CB | ✅ |
| Pré-création compte Supabase | ✅ |
| Webhooks Stripe (5 événements) | ✅ |
| Page `/bienvenue` post-inscription | ✅ |
| SEO + JSON-LD Schema.org | ✅ |
| Toggle mensuel/annuel tarifs | ✅ |
| Internationalisation FR/EN | ✅ |
| Price IDs Stripe à configurer | ⚠️ Placeholders dans `.env` |
| Email bienvenue post-checkout | 🔴 Non implémenté |
| Alignement tarifs avec l'app | 🔴 Incohérent (39/69/119 vs 19/49/99) |

### App (`project-boulangerie`)

| Composant | Statut | Notes |
|---|---|---|
| Auth boulanger (email + password) | ✅ | |
| Auth client (OTP Magic Link) | ✅ | |
| **Protection route /boulanger** | 🔴 **CRITIQUE** | **S0 — Client peut accéder** |
| Core loop Matin/Snapshot/Soir | ✅ | |
| Suggestions ML production | ✅ | |
| Dashboard stats historique | ✅ | |
| Catalogue CRUD + drag & drop | ✅ | |
| Upload photos + compression WebP | ✅ | |
| Flash invendus temps réel | ✅ | |
| Click & Collect + checkout | ✅ | |
| Page commandes Realtime | ✅ | |
| Notifications push (VAPID configuré) | ✅ | |
| Multi-tenant sous-domaines | ✅ | |
| RLS + SECURITY DEFINER | ✅ | |
| Sanitization inputs | ✅ | |
| Migration DB consolidée v2.0 | ✅ | |
| Suppression complète Airtable | ✅ | |
| Adresse boulangerie dynamique | ✅ | |
| Configuration flash depuis l'UI | ✅ | |
| Créneaux de retrait configurables | ✅ | |
| Activation/désactivation produits | ✅ | |
| Cache no-store sur routes publiques | ✅ | |
| SMTP custom Resend | ⚠️ À configurer | Supabase Dashboard |
| Onboarding CatalogueStarter | ⚠️ Code présent | Non branché au flux post-inscription |

---

## BUGS & VULNÉRABILITÉS

### 🔴 Critique

| ID | Projet | Description | Statut |
|---|---|---|---|
| **S0** | App | Accès non autorisé à /boulanger pour clients | 🔴 **OUVERT** |

### 🟠 Élevé

| ID | Projet | Description | Statut |
|---|---|---|---|
| LAND1 | Landing | Tarifs incohérents avec l'app | 🔴 Ouvert |
| B1 | App | Cast UUID unsafe dans `get_paniers_flash()` | 🔴 Ouvert |

### 🟡 Moyen

| ID | Projet | Description | Statut |
|---|---|---|---|
| LAND2 | Landing | Email bienvenue post-checkout non implémenté | 🔴 Ouvert |
| LAND3 | Landing | Slug auto-généré peut créer des conflits | 🟡 Ouvert |
| E1 | App | Pas de pagination sur l'historique | 🟡 Accepté |
| E2 | App | Pas de soft delete pour les produits | 🟡 Ouvert |
| CFG2 | App | SMTP custom Resend non branché | 🟡 À configurer |

### 🔵 Faible

| ID | Projet | Description | Statut |
|---|---|---|---|
| LAND4 | Landing | Price IDs Stripe sont des placeholders | 🔵 À remplacer |
| I4 | App | Colonnes adresse absentes du CREATE TABLE | 🔵 Faible |
| I5 | App | ESLint ignoré pendant le build | 🔵 Accepté |
| E3 | App | Images Unsplash comme fallback | 🔵 Ouvert |

---

## COURT TERME — < 2 semaines

### 🔴 Bloquant lancement — CRITIQUE
- [ ] **S0** — Corriger l'accès non autorisé à `/boulanger`
  - Ajouter vérification `boulangerie === null` dans `AppShell`
  - Implémenter middleware SSR avec vérification de rôle
  - Tester avec un compte client (OTP)

### 🔴 Bloquant lancement
- [ ] **LAND1** — Décider et aligner les tarifs entre la landing et l'app
- [ ] **LAND4** — Créer les produits/prix dans Stripe Dashboard
- [ ] **LAND2** — Implémenter l'email de bienvenue post-checkout via Resend
- [ ] **CFG2** — Brancher Resend SMTP custom dans Supabase Dashboard

### 🟠 Qualité
- [ ] **B1** — Corriger le cast UUID dans `get_paniers_flash()`
- [ ] **LAND3** — Gestion des conflits de slug
- [ ] Tester le flux complet end-to-end : landing → Stripe → webhook → app

---

## MOYEN TERME — 30 à 90 jours

### Produit
- Onboarding `CatalogueStarter` branché au flux post-inscription
- Email nom d'affichage dynamique par boulangerie
- Export PDF rapport hebdomadaire
- Rapport CO₂ mensuel + certificat téléchargeable
- Alerte push stock bas

### Infrastructure
- Wildcard DNS `*.bakeryos.fr` → Netlify
- Supabase Pro ($25/mois) dès 20 boulangers
- Monitoring Sentry sur les deux projets
- Tests E2E Playwright

### Acquisition
- Témoignages vidéo boulangers beta
- Programme referral : 2 mois offerts par boulangerie parrainée
- Contact Confédération Nationale de la Boulangerie

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

## TARIFICATION — À ALIGNER

| Plan | Landing actuelle | App actuelle | Recommandation |
|---|---|---|---|
| Starter | 39€/mois | 19€/mois | **39€** |
| Pro | 69€/mois | 49€/mois | **69€** |
| Multi | 119€/mois | 99€/mois | **119€** |

---

## PROJECTION MRR À 12 MOIS

| Scénario | Clients | MRR | Probabilité |
|---|---|---|---|
| Pessimiste (solo, 0 budget) | 15–30 | 600–1 200€ | 25% |
| **Réaliste (referral + 1 salon)** | **40–80** | **1 600–3 100€** | **50%** |
| Optimiste (partenariat meunier) | 150–250 | 5 800–9 700€ | 25% |

---

## CHECKLIST AVANT MISE EN PRODUCTION

### 🔴 Obligatoire
- [ ] **S0** — Protection route `/boulanger` par vérification de rôle
- [ ] **LAND1** — Alignement tarifs landing ↔ app
- [ ] **LAND4** — Price IDs Stripe configurés
- [ ] **CFG2** — SMTP Resend configuré dans Supabase
- [ ] Tests du flux complet landing → app
- [ ] Tests de sécurité (accès client à /boulanger bloqué)

### 🟠 Recommandé
- [ ] **B1** — Correction SQL cast UUID
- [ ] **LAND2** — Email bienvenue post-checkout
- [ ] Monitoring Sentry activé
- [ ] Sauvegardes DB automatisées

### 🔵 Nice to have
- [ ] Tests E2E Playwright
- [ ] Documentation API publique

---

*Mis à jour le 17/03/2026 — Vulnérabilité critique S0 identifiée*