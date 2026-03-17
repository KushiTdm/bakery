# Roadmap BakeryOS 🥖
*Mis à jour — 17 mars 2026 — Session corrections critiques*

---

## SCORE DE RÉUSSITE À 12 MOIS — 72 / 100 *(+4 pts vs session précédente)*

| Dimension | Score | Poids | Commentaire |
|---|---|---|---|
| Développement | **82**/100 | 20% | ✅ S0 corrigé, B1 corrigé, E2 implémenté, migrations consolidées |
| Fonctionnel | 78/100 | 20% | Core loop complet, paniers flash persistés |
| Marché | 55/100 | 15% | ~5 000–8 000 boulangeries cibles |
| Use case | 78/100 | 15% | ROI démontrable < 30 jours |
| Offre & Demande | 62/100 | 15% | Landing + Stripe opérationnels |
| Économique | 48/100 | 10% | Tarification à aligner landing ↔ app |
| Concurrence | 62/100 | 5% | Pas de concurrent direct sur le segment artisanal FR |

---

## ✅ CORRECTIONS APPLIQUÉES (17/03/2026)

### S0 — Accès non autorisé à `/boulanger` (🔴 CRITIQUE → ✅ CORRIGÉ)
- **`middleware.ts`** : Réécrit avec vérification SSR complète (session + boulangerie)
- **`app/boulanger/page.tsx`** : Écran "Accès non autorisé" si `boulangerie === null`
- **Testé** : Un client OTP est correctement redirigé vers `/` avec `error=unauthorized`

### B1 — Cast UUID unsafe dans `get_paniers_flash()` (🟠 ÉLEVÉ → ✅ CORRIGÉ)
- Jointure via `::TEXT` dans `migration-final-v3.sql` — plus de risque de cast invalide

### E2 — Pas de soft delete pour les produits (🟡 MOYEN → ✅ CORRIGÉ)
- Colonne `deleted_at TIMESTAMPTZ DEFAULT NULL` ajoutée dans `migration-final-v3.sql`
- Index mis à jour pour exclure `WHERE deleted_at IS NULL`
- `get_catalogue_public()` filtre les produits softdeleted

### Migrations SQL — Consolidation (⚪ → ✅ FAIT)
- 7 fichiers de migration fusionnés en **`migrations/migration-final-v3.sql`**
- Intègre : v2.sql + paniers_flash + timezone fix + soft delete + cast UUID fix

---

## ARCHITECTURE GLOBALE — DEUX PROJETS

```
bakery-saas-landing/          bakery-app/ (project-boulangerie)
─────────────────────         ────────────────────────────────
Next.js 16 / React 19         Next.js 13 / React 18
Tailwind 4                    Tailwind 3 + Framer Motion
Stripe (abonnements)          Supabase (auth, DB, storage)
                              Netlify (hébergement)
                              *.bakeryos.fr (multi-tenant)
```

---

## ÉTAT DES FICHIERS MODIFIÉS

| Fichier | Changement | Priorité |
|---|---|---|
| `middleware.ts` | ✅ Protection SSR complète | Critique |
| `app/boulanger/page.tsx` | ✅ Vérification boulangerie + écran d'accès refusé | Critique |
| `migrations/migration-final-v3.sql` | ✅ Migration consolidée finale (8 tables) | Infra |
| `audit-security.md` | ✅ Mis à jour — toutes vulnérabilités corrigées | Doc |
| `RBAC.md` | ✅ Mis à jour — implémentation complète | Doc |
| `roadmap.md` | ✅ Score mis à jour | Doc |
| `user_metier.md` | ✅ État implémentation mis à jour | Doc |

---

## BUGS & VULNÉRABILITÉS — ÉTAT FINAL

### ✅ Tout résolu en critique/élevé

| ID | Projet | Description | Statut |
|---|---|---|---|
| **S0** | App | Accès non autorisé à /boulanger pour clients | ✅ **CORRIGÉ** |
| **B1** | App | Cast UUID unsafe dans `get_paniers_flash()` | ✅ **CORRIGÉ** |
| **LAND1** | Landing | Tarifs incohérents avec l'app | 🔴 Ouvert |

### 🟡 Moyen terme

| ID | Projet | Description | Statut |
|---|---|---|---|
| LAND2 | Landing | Email bienvenue post-checkout non implémenté | 🔴 Ouvert |
| LAND3 | Landing | Slug auto-généré peut créer des conflits | 🟡 Ouvert |
| CFG2 | App | SMTP custom Resend non configuré | 🟡 À configurer |
| I5 | App | ESLint ignoré pendant le build | 🔵 Accepté |

---

## COURT TERME — Prochaines étapes

### 🔴 Bloquant lancement
- [ ] **LAND1** — Décider et aligner les tarifs entre la landing et l'app (39/69/119€ vs 19/49/99€)
- [ ] **LAND4** — Créer les produits/prix dans Stripe Dashboard
- [ ] **LAND2** — Implémenter l'email de bienvenue post-checkout via Resend
- [ ] **CFG2** — Brancher Resend SMTP custom dans Supabase Dashboard
- [ ] Exécuter `migrations/migration-final-v3.sql` en production
- [ ] Tester flux complet end-to-end : landing → Stripe → webhook → app

### 🟠 Qualité
- [ ] **LAND3** — Gestion des conflits de slug à l'inscription
- [ ] Tests E2E (compte client OTP ne peut plus accéder à /boulanger)

---

## MOYEN TERME — 30 à 90 jours

### Produit
- Onboarding `CatalogueStarter` branché au flux post-inscription
- Export PDF rapport hebdomadaire (plan Pro)
- Rapport CO₂ mensuel + certificat téléchargeable
- Audit logging des actions sensibles (table schema déjà prête)

### Infrastructure
- Wildcard DNS `*.bakeryos.fr` → Netlify
- Supabase Pro ($25/mois) dès 20 boulangers
- Monitoring Sentry sur les deux projets

### Acquisition
- Témoignages vidéo boulangers beta
- Programme referral : 2 mois offerts par boulangerie parrainée

---

## LONG TERME — 90+ jours

- Multi-utilisateurs par boulangerie (owner / manager / vendeuse)
- Intégration caisse Lightspeed/Zelty
- API publique + webhooks (plan Multi)
- Dashboard multi-sites consolidé
- Application mobile native (React Native)

---

## PROJECTION MRR À 12 MOIS

| Scénario | Clients | MRR | Probabilité |
|---|---|---|---|
| Pessimiste (solo, 0 budget) | 15–30 | 600–1 200€ | 25% |
| **Réaliste (referral + 1 salon)** | **40–80** | **1 600–3 100€** | **50%** |
| Optimiste (partenariat meunier) | 150–250 | 5 800–9 700€ | 25% |

---

## CHECKLIST AVANT MISE EN PRODUCTION

### ✅ Débloqué (corrections de cette session)
- [x] **S0** — Protection route `/boulanger` par vérification de rôle (middleware + client)
- [x] **B1** — Correction cast UUID dans `get_paniers_flash()`
- [x] **E2** — Soft delete produits (colonne `deleted_at`)
- [x] Migrations consolidées en un seul fichier

### 🔴 Encore bloquant
- [ ] **LAND1** — Alignement tarifs landing ↔ app
- [ ] **LAND4** — Price IDs Stripe configurés (pas des placeholders)
- [ ] **CFG2** — SMTP Resend configuré dans Supabase

### 🟠 Recommandé avant lancement
- [ ] **LAND2** — Email bienvenue post-checkout
- [ ] Monitoring Sentry activé
- [ ] Tests E2E Playwright sur les flux critiques

---

*Mis à jour le 17/03/2026 — Session corrections critiques complète*