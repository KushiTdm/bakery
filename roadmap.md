# Roadmap BakeryOS 🥖
*Mis à jour — 14 mars 2026*

---

## ANALYSE DE RÉUSSITE À 12 MOIS — Score objectif

### Méthodologie
7 dimensions évaluées indépendamment, pondérées selon leur impact sur la survie à 12 mois.

| Dimension | Score | Poids | Contribution | Commentaire |
|---|---|---|---|---|
| **Développement** | 68/100 | 20% | 13.6 | Stack solide, bugs critiques corrigés, mais flux de données encore fragile |
| **Fonctionnel** | 72/100 | 20% | 14.4 | Core loop complet, flash anti-gaspi end-to-end, mais catalogue/vues encore partiels |
| **Marché** | 55/100 | 15% | 8.25 | Marché réel mais fragmenté, adoption tech lente dans la boulangerie artisanale |
| **Use case** | 78/100 | 15% | 11.7 | Problème réel (gaspillage = perte sèche), solution claire, ROI démontrable |
| **Offre & Demande** | 60/100 | 15% | 9.0 | Demande latente forte, mais l'offre doit être prouvée avant de scaler |
| **Économique** | 45/100 | 10% | 4.5 | MRR cible atteignable mais sous-estimé en effort d'acquisition |
| **Concurrence** | 62/100 | 5% | 3.1 | Peu de concurrents directs sur le segment artisanal FR, mais inertie forte |
| **TOTAL** | | 100% | **64.5 / 100** | |

### 🎯 Score de réussite estimé à 12 mois : **64 %**

> "Réussite" définie comme : atteindre 50+ boulangers payants, MRR > 2 500€, produit stable en production.

### Explication par dimension

**Développement (68/100)**
Le projet a une architecture réelle et propre (Next.js 13, Supabase, multi-tenant, RLS hermétique). Les bugs critiques B1/B2/B3 ont été corrigés — le data flow vues/context est maintenant connecté aux vraies données. L'auth est passée en email+password pour éviter les limites Supabase Free. Ce qui reste à faire : drag & drop catalogue, quelques routes API encore avec données hardcodées dans les vues, TypeScript strict à finir. Pas insurmontable pour un dev solo en 2-3 semaines.

**Fonctionnel (72/100)**
Le core loop boulanger (Matin → Snapshot → Soir → Clôture) est connecté aux données réelles Supabase. Le flash anti-gaspi fonctionne end-to-end avec la vraie fenêtre horaire dynamique. Le click & collect avec OTP client est opérationnel. Ce qui manque : l'onboarding wizard complet, la configuration flash depuis l'interface (heures et remise editables), les créneaux de retrait configurables.

**Marché (55/100)**
La France compte ~35 000 boulangeries artisanales. Seulement ~20% sont digitalisées. La cible réelle (boulangeries artisanales indépendantes, CA 150-500k€/an, patron tech-friendly) représente environ 5 000-8 000 établissements. C'est un marché de niche narrow — suffisant pour un SaaS rentable, insuffisant pour une licorne. Le frein majeur : la boulangerie artisanale est un milieu conservateur où l'adoption tech est lente et souvent portée par la seconde génération.

**Use case (78/100)**
C'est le point fort. Le taux d'invendu moyen en boulangerie artisanale est de 8-15% du chiffre d'affaires. Sur 300k€ de CA, ça représente 24-45k€ de pertes annuelles. BakeryOS propose un ROI démontrable en moins de 30 jours, ce qui est rare dans le SaaS B2B artisanal. Le flash anti-gaspi est une différenciation forte (réduction déchets + revenus supplémentaires). Le click & collect réduit les pertes de ventes. Le dashboard ML réduit la surproduction.

**Offre & Demande (60/100)**
La demande est latente : les boulangers savent qu'ils gaspillent, mais peu ont formalisé le problème en coût. BakeryOS doit créer la demande autant que la satisfaire. Le ticket mensuel (19-49€) est psychologiquement acceptable — moins d'une heure de travail — mais l'argument ROI doit être montré concrètement, pas promis. Le mode freemium ou essai gratuit 30 jours est indispensable.

**Économique (45/100)**
Le modèle est viable à partir de ~180 clients (seuil rentabilité estimé). Le CAC en milieu artisanal est élevé (salon professionnel, démarchage direct, partenariat meunier) et le cycle de vente est long (2-4 mois). Le MRR à 12 mois sera probablement 1 500-4 000€ pour un fondateur seul sans budget marketing, pas les 8 000€+ du scénario optimiste. Ce n'est pas une raison d'abandonner — c'est une raison de ne pas lever trop tôt.

**Concurrence (62/100)**
Pas de concurrent direct fort sur le segment artisanal français. Melba (gestion boulangerie) existe mais est positionné sur la comptabilité/caisse, pas sur l'anti-gaspillage ni le click & collect. Yokitup, Dishop sont sur la restauration. Too Good To Go est complémentaire (pas concurrent — pas de gestion de production). Le risque vient des grandes caisses (Lightspeed, Zelty) qui pourraient ajouter des modules similaires, mais leur cycle produit est lent et leur prix est 10x plus élevé.

---

## ÉTAT ACTUEL DU PROJET — Mars 2026

### Architecture

| Composant | Statut |
|---|---|
| Stack Next.js 13 / Supabase / Netlify | ✅ Opérationnel |
| Auth boulanger (email + password) | ✅ Migré depuis OTP |
| Auth client (OTP Magic Link) | ✅ Inchangé — correct |
| Multi-tenant sous-domaines | ✅ `resolve-slug.ts` centralisé |
| RLS Supabase hermétique | ✅ `stocks_journaliers` jamais exposé |
| Fonctions SQL SECURITY DEFINER | ✅ `get_catalogue_public`, `get_paniers_flash` |
| Rate limiting commandes (Upstash) | ✅ Séparé de l'auth |
| Migration DB consolidée (v1.0) | ✅ Idempotente, triggers DROP IF EXISTS |
| SMTP custom (prod) | ⚠️ À configurer avec Resend dans Supabase |

### Fonctionnalités boulanger

| Fonctionnalité | Statut |
|---|---|
| Vue Matin — connectée au context réel | ✅ Corrigé (B1) |
| Vue Snapshot — connectée au context réel | ✅ Corrigé (B3) |
| Vue Soir — connectée au context réel | ✅ Corrigé (B2) |
| Suggestions ML production | ✅ Context OK, vue connectée |
| Clôture journée → historique | ✅ `closeDayAndSave` |
| Dashboard stats (données réelles) | ✅ Depuis historique clôturé |
| Catalogue CRUD produits | ✅ API complète |
| Drag & drop réordonnancement | 🔴 Code mort, non fonctionnel |
| Upload photos produits (Storage) | ✅ Route `/api/boulanger/produits/upload` |
| Notifications push commandes | ⚠️ Clés VAPID à configurer |
| Page commandes Realtime | ✅ Supabase Realtime |
| Configuration flash (heures/remise) | 🔴 Hardcodé dans l'UI — à exposer dans /parametres |
| Créneaux de retrait configurables | 🔴 Hardcodé à 08:00 dans cart-sidebar |
| Tour guidé onboarding | ✅ TourWizard complet |

### Fonctionnalités client

| Fonctionnalité | Statut |
|---|---|
| Landing SEO + JSON-LD | ✅ |
| Click & Collect catalogue Supabase | ✅ |
| Auth OTP Magic Link | ✅ (limite 2/h en dev — OK en prod avec SMTP custom) |
| Flash invendus temps réel | ✅ Heures dynamiques depuis DB |
| FlashBanner countdown | ✅ |
| Panier + checkout | ✅ |
| Email confirmation commande (Resend) | ✅ |
| PWA installable | ✅ |

### Base de données

| Élément | Statut |
|---|---|
| Migration v1.0 consolidée | ✅ Remplace migrations 1-9 |
| Triggers idempotents (DROP IF EXISTS) | ✅ Corrigé |
| Colonnes ADD COLUMN IF NOT EXISTS | ✅ Corrigé |
| Contraintes EXCEPTION WHEN duplicate | ✅ Corrigé |
| Statut `retiree` → `recuperee` | ✅ Corrigé (B-migration-5) |
| Jointure `get_paniers_flash` par produit_id | ✅ Corrigé (B7) |
| Heures flash depuis `boulangeries` table | ✅ Corrigé (B8) |
| Seed séparé | ✅ `seed.sql` indépendant |
| Script set-boulanger-password.sql | ✅ Pour comptes OTP existants |

---

## BUGS CORRIGÉS (session actuelle)

| ID | Sévérité | Description | Fichier | Statut |
|---|---|---|---|---|
| B1 | 🔴 | Déconnexion data flow vue-matin/context | `vue-matin.tsx` | ✅ CORRIGÉ |
| B2 | 🔴 | Context non utilisé dans vue-soir | `vue-soir.tsx` | ✅ CORRIGÉ |
| B3 | 🔴 | Context non utilisé dans vue-snapshot | `vue-snapshot.tsx` | ✅ CORRIGÉ |
| B4 | 🟡 | debouncedSync vide | `vue-matin.tsx` | ✅ CORRIGÉ (supprimé) |
| B5 | 🟡 | Heure début flash hardcodée 18h | `flash-section.tsx` | ✅ CORRIGÉ |
| B7 | 🟡 | Jointure fragile par nom SQL | `migration` | ✅ CORRIGÉ |
| B8 | 🟡 | Heures flash hardcodées SQL | `migration` | ✅ CORRIGÉ |
| B10 | 🟡 | DEFAULT_STOCKS duplique produits | `boulanger-context.tsx` | ✅ CORRIGÉ |
| AUTH | 🔴 | Rate limit OTP bloquant (2 emails/h Supabase Free) | `login-form.tsx` | ✅ CORRIGÉ → email+password |

## BUGS OUVERTS

| ID | Sévérité | Description | Fichier |
|---|---|---|---|
| B6 | 🟡 | Drag & drop catalogue non fonctionnel | `catalogue.tsx` |
| B9 | 🟢 | Typo potentiel `est_invende` | `api/products/route.ts` |
| I2 | 🔴 | Adresse hardcodée dans cart-sidebar | `cart-sidebar.tsx` |
| I3 | 🔴 | Heure retrait fixe `08:00` | `cart-sidebar.tsx` |
| I6 | 🟡 | `/api/products` (Airtable legacy) toujours accessible | `app/api/products/route.ts` |
| CFG1 | 🟡 | Heures/remise flash non configurables depuis l'UI | `parametres.tsx` |
| CFG2 | 🟡 | SMTP custom Resend non branché dans Supabase | Dashboard config |
| CFG3 | 🟢 | Clés VAPID push notifications à configurer | `.env.local` |

---

## COURT TERME — Priorités immédiates (< 2 semaines)

### 🔴 Bloquant production
- [ ] **I2/I3** : Adresse et créneaux de retrait dynamiques depuis `boulangeries`
- [ ] **CFG2** : Brancher Resend comme SMTP custom dans Supabase Dashboard (Auth → SMTP Settings) — débloque l'OTP client sans limite
- [ ] Tester le flux complet sur une vraie journée : Matin → Snapshot → Soir → Clôture → Stats

### 🟡 Qualité
- [ ] **CFG1** : Ajouter champs `flash_heure_debut`, `flash_heure_fin`, `flash_remise_pct` dans `/boulanger/parametres`
- [ ] **B6** : Implémenter drag & drop réel ou supprimer le `GripVertical` trompeur
- [ ] **I6** : Supprimer ou rediriger `/api/products` vers `/api/catalogue/:slug`

---

## MOYEN TERME — 30 à 90 jours

### Produit
- Configuration flash dynamique depuis l'interface (heures, remise, jours actifs)
- Créneaux de retrait configurables (ex: 7h-13h par tranche de 30min)
- Onboarding wizard amélioré avec CatalogueStarter (déjà codé, à brancher)
- Export PDF rapport hebdomadaire (@react-pdf/renderer)
- Rapport CO₂ mensuel (invendus évités × 0.6 kg/kg)

### Acquisition
- Landing page dédiée BakeryOS.fr (séparée de la vitrine démo)
- Témoignages vidéo boulangers beta
- Programme referral : 2 mois offerts par boulangerie parrainée
- Contacter Confédération Nationale de la Boulangerie

### Technique
- Passer sur Supabase Pro ($25/mois) dès 20+ boulangers : rate limits disparaissent, backups quotidiens, custom domain
- Ajouter monitoring Sentry (erreurs front + API)
- Tests E2E Playwright sur le flux de commande

---

## LONG TERME — 90+ jours

- Multi-utilisateurs par boulangerie (owner, manager, vendeuse)
- Intégration caisse Lightspeed/Zelty (webhook → supprime saisie manuelle)
- API publique + webhooks (plan Multi)
- Dashboard multi-sites consolidé (plan Multi)
- Mode fermeture exceptionnelle
- QR code retrait scanné en boutique
- Application mobile native (React Native) pour le boulanger

---

## TARIFICATION

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
| Export comptable FEC | — | — | ✓ |
| API publique + webhooks | — | — | ✓ |
| Support | Email 48h | Email 24h | Slack dédié |

---

## PROJECTION MRR RÉALISTE À 12 MOIS

| Scénario | Clients | MRR | Probabilité |
|---|---|---|---|
| Pessimiste (fondateur seul, 0 budget) | 15-30 | 400-800€ | 25% |
| **Réaliste (referral + 1 salon)** | **40-80** | **1 000-2 500€** | **50%** |
| Optimiste (partenariat meunier ou distributeur) | 150-250 | 4 000-8 000€ | 25% |

Seuil de rentabilité (infra + Supabase Pro + domaines) : ~15 clients Starter ou ~6 clients Pro.
Seuil d'intérêt investisseur seed : ~100 clients, MRR > 3 000€, churn < 5%/mois.

---

## NOTES TECHNIQUES IMPORTANTES

### Auth strategy
- **Boulangers** → email + password (`signInWithPassword`). Pas de quota email consommé à la connexion. Reset password uniquement sur demande (1 email).
- **Clients** → OTP Magic Link (`signInWithOtp`). Quota 2/h en dev (Supabase Free). En prod : brancher SMTP custom Resend dans Supabase Dashboard pour lever la limite.
- **Comptes OTP existants** → exécuter `set-boulanger-password.sql` pour leur définir un mot de passe.

### Migration DB
- Un seul fichier : `migration-complete-v1.sql` — remplace toutes les migrations 1-9
- Idempotent : `DROP TRIGGER IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object`
- Seed séparé : `seed.sql` — adapter le slug avant d'exécuter

### Limites Supabase Free à anticiper
| Limite | Impact | Solution |
|---|---|---|
| 2 emails/h | Auth client bloquée en dev | SMTP Resend en prod |
| 500 MB DB | ~50 000 commandes | Passer Pro dès 20 boulangers |
| 5 GB bandwidth | ~200 boulangers actifs | Pro à partir de 50 |
| 50 000 MAU auth | Pas de problème avant 2 ans | — |

---

*Mis à jour le 14/03/2026 — Score objectif 12 mois : 64%*
*Prochaine révision recommandée : après premier boulanger en production réelle*