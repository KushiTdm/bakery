# Roadmap BakeryOS 🥖
*Mis à jour — 16 mars 2026*

---

## SCORE DE RÉUSSITE À 12 MOIS — 71 / 100

| Dimension | Score | Poids | Commentaire |
|---|---|---|---|
| Développement | 82/100 | 20% | Architecture propre, bugs critiques corrigés, cache résolu |
| Fonctionnel | 78/100 | 20% | Core loop complet, config flash/créneaux/adresse opérationnelle |
| Marché | 55/100 | 15% | ~5 000–8 000 boulangeries cibles. Milieu conservateur |
| Use case | 78/100 | 15% | ROI démontrable < 30 jours. 8–15% du CA perdu en invendu |
| Offre & Demande | 62/100 | 15% | Landing + Stripe opérationnels = conversion self-service possible dès le lancement |
| Économique | 48/100 | 10% | Tarification landing (39/69/119€) à réconcilier avec tarification app (19/49/99€) |
| Concurrence | 62/100 | 5% | Pas de concurrent direct sur le segment artisanal FR |

**Score global : 71 / 100 → probabilité de réussite à 12 mois estimée à 71%**

> "Réussite" = 50+ boulangers payants, MRR > 2 500€, produit stable en production.

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

### ⚠️ Tarification incohérente entre les deux projets

La landing affiche **39 / 69 / 119€/mois** mais l'app est configurée pour **19 / 49 / 99€/mois**. Les deux doivent être alignés avant tout lancement. Recommandation : aligner l'app sur la landing (39/69/119€) et mettre à jour les limites de plan dans `app/api/boulanger/produits/route.ts`.

### ⚠️ Le pont landing → app n'est pas fermé

Après le checkout Stripe, le boulanger doit recevoir un email "définir votre mot de passe". Ce flux dépend de Resend pour l'email de setup. À implémenter dans le webhook `checkout.session.completed` via `supabase.auth.admin.generateLink({ type: 'invite', email })`.

### ⚠️ Slug auto-généré peut créer des conflits

Dans `create-trial`, le slug est généré depuis le nom. Si deux boulangeries ont le même nom, conflit. À corriger : vérifier l'unicité et ajouter un suffixe numérique si nécessaire.

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

| Composant | Statut |
|---|---|
| Auth boulanger (email + password) | ✅ |
| Auth client (OTP Magic Link) | ✅ |
| Core loop Matin/Snapshot/Soir | ✅ |
| Suggestions ML production | ✅ |
| Dashboard stats historique | ✅ |
| Catalogue CRUD + drag & drop | ✅ |
| Upload photos + compression WebP | ✅ |
| Flash invendus temps réel | ✅ |
| Click & Collect + checkout | ✅ |
| Page commandes Realtime | ✅ |
| Notifications push (VAPID configuré) | ✅ |
| Multi-tenant sous-domaines | ✅ |
| RLS + SECURITY DEFINER | ✅ |
| Sanitization inputs | ✅ |
| Migration DB consolidée v2.0 | ✅ |
| Suppression complète Airtable | ✅ |
| Adresse boulangerie dynamique sur vitrine | ✅ |
| Configuration flash depuis l'UI | ✅ |
| Créneaux de retrait configurables | ✅ |
| Activation/désactivation produits sans suppression | ✅ |
| Cache no-store sur toutes les routes publiques | ✅ |
| Mises à jour visibles instantanément sur la vitrine | ✅ |
| SMTP custom Resend | ⚠️ À configurer Supabase Dashboard |
| Onboarding CatalogueStarter | ⚠️ Code présent, non branché au flux post-inscription |

---

## BUGS RÉSOLUS ✅

| ID | Description | Date |
|---|---|---|
| I2/I3 | Adresse et créneaux de retrait hardcodés → dynamiques depuis DB | Mars 2026 |
| RLS1 | Routes publiques bloquées par RLS → service role pour lectures publiques | Mars 2026 |
| CACHE1 | Modifications boulanger non visibles → no-store sur 4 niveaux (Next.js Data Cache, fetch Supabase, Netlify CDN, navigateur) | Mars 2026 |
| PROD1 | Désactivation produit = suppression visuelle → fetch sans filtre actif dans l'espace boulanger | Mars 2026 |
| AIR1 | Références Airtable supprimées (routes, hooks, contexte, types, migrations) | Mars 2026 |
| MIG1 | Deux fichiers migration → un seul fichier v2.0 consolidé | Mars 2026 |

---

## BUGS OUVERTS

| ID | Projet | Sévérité | Description |
|---|---|---|---|
| LAND1 | Landing | 🔴 | Tarifs incohérents avec l'app (39/69/119 vs 19/49/99€) |
| LAND2 | Landing | 🔴 | Email bienvenue post-checkout non implémenté |
| LAND3 | Landing | 🟡 | Slug auto-généré peut créer des conflits à la création |
| LAND4 | Landing | 🟡 | Price IDs Stripe sont des placeholders — à remplacer |
| CFG2 | App | 🟡 | SMTP custom Resend non branché dans Supabase |

---

## COURT TERME — < 2 semaines

### 🔴 Bloquant lancement
- [ ] **LAND1** — Décider et aligner les tarifs entre la landing et l'app
- [ ] **LAND4** — Créer les produits/prix dans Stripe Dashboard, remplacer les placeholders `.env`
- [ ] **LAND2** — Implémenter l'email de bienvenue post-checkout via Resend (lien setup password)
- [ ] **CFG2** — Brancher Resend SMTP custom dans Supabase Dashboard → Auth → SMTP Settings

### 🟡 Qualité
- [ ] **LAND3** — Gestion des conflits de slug (suffixe numérique ou vérification préalable)
- [ ] Tester le flux complet end-to-end : landing → Stripe → webhook → app → première journée

---

## MOYEN TERME — 30 à 90 jours

### Produit
- Onboarding `CatalogueStarter` branché au flux post-inscription (boulangerie vide → catalogue pré-rempli en 2 min)
- Email nom d'affichage dynamique par boulangerie (`Boulangerie Dupont via BakeryOS`)
- Export PDF rapport hebdomadaire
- Rapport CO₂ mensuel + certificat téléchargeable
- Alerte push stock bas (`stock_alerte` en DB, logique à câbler)

### Infrastructure
- Wildcard DNS `*.bakeryos.fr` → Netlify
- Supabase Pro ($25/mois) dès 20 boulangers
- Monitoring Sentry sur les deux projets
- Tests E2E Playwright sur le flux commande et le flux inscription

### Acquisition
- Témoignages vidéo boulangers beta
- Programme referral : 2 mois offerts par boulangerie parrainée
- Contact Confédération Nationale de la Boulangerie et Pâtisserie

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

Annuel −20% : 31 / 55 / 95€/mois (déjà dans la landing).

| Plan | Click & Collect | Catalogue | Utilisateurs |
|---|---|---|---|
| Starter 39€ | 50 cmd/mois | 20 produits | 1 |
| Pro 69€ | Illimité | Illimité | 3 |
| Multi 119€ | Illimité | Illimité | Illimité + multi-sites |

---

## PROJECTION MRR À 12 MOIS

| Scénario | Clients | MRR | Probabilité |
|---|---|---|---|
| Pessimiste (solo, 0 budget) | 15–30 | 600–1 200€ | 25% |
| **Réaliste (referral + 1 salon)** | **40–80** | **1 600–3 100€** | **50%** |
| Optimiste (partenariat meunier) | 150–250 | 5 800–9 700€ | 25% |

Seuil de rentabilité infra : ~10 clients Starter ou ~5 Pro.
Seuil intérêt investisseur seed : ~100 clients, MRR > 4 000€, churn < 5%/mois.

---

## NOTES TECHNIQUES

### Deux projets — règles de cohérence
- La DB Supabase est **partagée** entre les deux projets (même `SUPABASE_URL`)
- La landing utilise `SUPABASE_SERVICE_KEY`, l'app utilise `SUPABASE_SERVICE_ROLE_KEY` — même clé, noms différents dans les `.env`
- Le webhook Stripe doit pointer vers la landing (`bakeryos.fr/api/stripe/webhook`), pas vers l'app
- L'app ne gère pas Stripe — elle lit uniquement `stripe_status` et `plan` depuis la table `boulangeries`

### Cache — stratégie actuelle
Toutes les routes publiques sont en `no-store` à 4 niveaux :
- `unstable_noStore()` + `fetchCache = 'force-no-store'` sur les modules API
- `cache: 'no-store'` injecté dans le `fetch` custom du client Supabase
- Header `Netlify-CDN-Cache-Control: no-store` sur les réponses
- `cache: 'no-store'` sur les `fetch()` côté navigateur dans les hooks React

### Email — stratégie
- **Boulangers** → email + password. Reset password = 1 email Supabase sur demande.
- **Clients** → OTP Magic Link. SMTP Resend custom en prod lève la limite 2/h.
- **Post-inscription** → email de bienvenue + lien setup password via Resend (landing webhook). À implémenter.
- **Confirmation commande** → Resend depuis l'app.

### DNS à configurer (une seule fois)
```
bakeryos.fr        → Vercel (landing)
app.bakeryos.fr    → Netlify (app)
*.bakeryos.fr      → Netlify (wildcard multi-tenant)
```

### Limites Supabase Free

| Limite | Seuil | Solution |
|---|---|---|
| 2 emails/h | Bloquant en dev client | SMTP Resend custom en prod |
| 500 MB DB | ~50 000 commandes | Passer Pro dès 20 boulangers |
| 5 GB bandwidth | ~200 boulangers actifs | Pro à partir de 50 |

### Fichiers DB (projet app)
- Migration : `migration-v2.sql` — fichier unique, remplace tous les anciens
- Seed : `seed.sql` — adapter le slug avant d'exécuter


### OPTIONS BOULANGER
- Choisir ou non d'afficher le contenu du panier

---

*Mis à jour le 16/03/2026*