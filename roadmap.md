# Roadmap BakeryOS 🥖
*Mis à jour après session corrections — 14 mars 2026*

---

## RAPPORT D'AUDIT — Notes actuelles

| Critère | Note | Δ session | Justification |
|---|---|---|---|
| Présentation | 76/100 | = | Landing premium, dark theme soigné, animations Framer Motion. Manque : micro-interactions compteurs, onboarding guidé. |
| Service / Produit | 68/100 | = | Core loop solide. Catalogue encore dépendant d'Airtable (bloquant adoption). |
| Fonctionnalités | 66/100 | +4 | Suggestions ML basées sur l'historique réel livré. Realtime commandes OK. Flash dynamique OK. Manque : catalogue natif, onboarding wizard. |
| SEO | 74/100 | = | sitemap, robots, JSON-LD, H1/H2 sémantiques, Open Graph complet. Manque : Search Console soumission, backlinks locaux. |
| Sécurité | 74/100 | +9 | BC1 fix (retiree/recuperee), S3 fix (INTERNAL_API_SECRET obligatoire prod), BC3 fix (Upstash Redis). |
| Qualité code | 68/100 | +6 | isMemoryRateLimited async, computeProductionSuggestions() extrait, any supprimés, type DbCommande nettoyé. |
| Attractivité investisseur | 60/100 | +2 | ML réel documenté. Manque traction prouvée. |

**Moyenne : 69/100** *(+7 vs session précédente 62/100, +3 vs session SEO 66/100)*

---

## CORRECTIONS LIVRÉES — Session 14/03/2026 (v2)

### BC1 — Incohérence retiree vs recuperee CORRIGÉ
**Fichiers touchés :**
- `migrations/migration-5-fix-statut-recuperee.sql` — nouveau fichier, à exécuter en base
- `lib/supabase.ts` — DbCommande.statut : 'retiree' retiré du type union
- `app/boulanger/commandes/page.tsx` — mapping dbToStatus nettoyé

**Action requise en base :**
```sql
-- Exécuter dans Supabase → SQL Editor
-- Fichier : migrations/migration-5-fix-statut-recuperee.sql
```

### BC3 — Rate limiting cross-instances CORRIGÉ
**Fichiers touchés :**
- `lib/rate-limit.ts` — isMemoryRateLimited devient async, utilise Upstash Redis si configuré, Map en mémoire sinon
- `app/api/orders/route.ts` — await ajouté sur isMemoryRateLimited

**Action requise :**
```bash
npm install @upstash/ratelimit @upstash/redis
```
Puis dans Netlify → Environment variables :
```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```
Compte gratuit Upstash : 10 000 req/jour. Créer sur upstash.com.

### S3 — INTERNAL_API_SECRET obligatoire en prod CORRIGÉ
**Fichier :** `app/api/orders/confirm-email/route.ts`
- En production sans secret → HTTP 500 bloquant avec message clair
- En développement → warning console, non bloquant
- Bonus : email expéditeur lu depuis `RESEND_FROM_EMAIL` (plus hardcodé)

**Action requise :**
```bash
# Générer un secret fort
openssl rand -hex 32
# Ajouter dans .env.local ET Netlify env vars :
INTERNAL_API_SECRET=<valeur générée>
RESEND_FROM_EMAIL=commandes@votredomaine.fr
```

### ML Production — Suggestions basées sur l'historique réel CORRIGÉ
**Fichiers touchés :**
- `context/boulanger-context.tsx` — ajout de computeProductionSuggestions() et productionSuggestions dans le context
- `components/boulanger/vue-matin.tsx` — refonte complète du composant

**Comportement :**
- Si historique disponible : régression par jour de semaine sur history[], arrondi au multiple de 5, confidence high/medium/low selon le nombre de jours similaires
- Si pas d'historique (< 1 jour) : fallback sur les constantes +30%/+15% avec label "estimé"
- Bouton "Tout appliquer" pour adopter toutes les suggestions en un clic
- Bouton "✓" par produit pour appliquer suggestion individuelle
- Quantité en amber si elle diverge de la suggestion

---

## BUGS RESTANTS

### BC1b — migration-5 non exécutée en base OUVERT
La migration est livrée mais doit être exécutée manuellement dans Supabase SQL Editor. Tant que ce n'est pas fait, `DbCommande` côté code est correct mais la base accepte encore `retiree`.

### I2 — Adresse hardcodée dans cart-sidebar.tsx OUVERT
```typescript
'42 Rue de la Boulangerie, Paris' // → boulangerie.adresse depuis Supabase
```

### I3 — Heure de retrait fixe 08:00 OUVERT
```typescript
heure_retrait: '08:00' // → configurable dans /boulanger/parametres
```

### I5 — Email expéditeur PARTIELLEMENT CORRIGÉ
Désormais lu depuis `RESEND_FROM_EMAIL` mais sans fallback multi-tenant. Chaque boulangerie devrait avoir son propre domaine Resend vérifié.

---

## SECURITE — État actuel

| Problème | Statut |
|---|---|
| S1. Variables Supabase null as any | CORRIGÉ — erreur explicite avec liste variables manquantes |
| S2. Clés VAPID manquantes | A CONFIGURER — npx web-push generate-vapid-keys |
| S3. INTERNAL_API_SECRET optionnel prod | CORRIGÉ — bloquant en production |
| S4. Clés Airtable chiffrées pgcrypto | OK |
| S5. Rate limiting IP | CORRIGÉ — Upstash Redis cross-instances |
| S6. RLS Supabase | OK |

---

## QUALITE CODE — Checklist

| Point | Statut |
|---|---|
| any dans boulanger-context.tsx | CORRIGÉ |
| any dans commandes/page.tsx | CORRIGÉ |
| Rate limit async (Upstash) | CORRIGÉ |
| Viewport Next.js 13 compat | CORRIGÉ |
| tsconfig target ES2017 | CORRIGÉ |
| DbCommande.statut type | CORRIGÉ |
| Suggestions ML hardcodées | CORRIGÉ |
| Realtime commandes (setInterval) | CORRIGÉ |
| FlashBanner dynamique | CORRIGÉ |
| Slug boulangerie dynamique | CORRIGÉ |
| any dans api/products/route.ts | OUVERT |
| @next/swc-wasm-nodejs dans package.json | OUVERT — npm uninstall @next/swc-wasm-nodejs |

---

## COURT TERME — Prochains 30 jours

### Priorité 1 — Actions immédiates (< 1h chacune)
- [ ] Exécuter migration-5-fix-statut-recuperee.sql en base Supabase
- [ ] npm install @upstash/ratelimit @upstash/redis
- [ ] Ajouter UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN dans Netlify
- [ ] Ajouter INTERNAL_API_SECRET dans Netlify
- [ ] Ajouter RESEND_FROM_EMAIL dans Netlify
- [ ] npx web-push generate-vapid-keys → ajouter dans Netlify
- [ ] npm uninstall @next/swc-wasm-nodejs @supabase/auth-helpers-nextjs embla-carousel-react react-day-picker next-themes cmdk vaul input-otp date-fns
- [ ] Soumettre sitemap.xml dans Google Search Console

### Priorité 2 — Qualité (2-5j)
- [ ] I2 : Adresse dynamique depuis boulangerie.adresse dans cart-sidebar
- [ ] I3 : Créneaux de retrait configurables dans /boulanger/parametres
- [ ] any restants dans api/products/route.ts (parseProduct, getAirtableImageUrl)
- [ ] Ajouter HowTo Schema.org sur la section Ingrédients (4 étapes → rich result)
- [ ] Créer /mentions-legales (maillage SEO + conformité RGPD)

### Priorité 3 — Nouvelles features (1-2 semaines)
- [ ] Page /boulanger/catalogue (CRUD produits natif Supabase)
- [ ] Wizard d'onboarding 4 étapes (bloquant adoption, taux conversion < 5% sans)
- [ ] Alerte stock bas : notification push si un produit atteint 0 avant midi

---

## MOYEN TERME — 30 à 90 jours

### Catalogue natif (priorité commerciale n°1)
Sans catalogue natif, l'onboarding nécessite Airtable → taux de conversion < 5%.
- Table `produits` Supabase avec RLS
- Page `/boulanger/catalogue` : CRUD, upload photo (Supabase Storage)
- Airtable devient optionnel
- Effort estimé : 5-8 jours

### Créneaux de retrait configurables
- Champ `heure_ouverture` / `heure_fermeture` dans `boulangeries`
- Selector dans cart-sidebar.tsx (7h, 8h, 9h…)
- Email Resend adapté

### Multi-utilisateurs par boulangerie
- Table `boulangerie_membres(boulangerie_id, user_id, role)`
- Rôles : owner, manager, vendeuse
- RLS ajustée

### Améliorations ML production
Avec plus d'historique les suggestions gagneront en précision. Évolutions :
- Pondération exponentielle (jours récents > jours anciens)
- Prise en compte météo OpenMeteo (pluie → moins de fréquentation)
- Prise en compte des événements (jours fériés, vacances scolaires)
- Correction selon les commandes click & collect du soir précédent

---

## LONG TERME — 90+ jours

- Export PDF rapport hebdomadaire (@react-pdf/renderer)
- QR code retrait (npm qrcode) — scanné en boutique
- Rapport CO₂ mensuel — invendus évités × 0.6 kg CO₂/kg + certificat PDF
- Intégration caisse Lightspeed/Zelty (webhook → supprime saisie manuelle)
- Mode fermeture exceptionnelle (toggle dans /parametres)
- Messagerie push clients ("Croissant sorti du four")
- Export FEC comptable
- API publique + webhooks (plan Multi)

---

## TARIFICATION — Stratégie et justification

### Benchmark marché

Les concurrents directs sur le segment boulangerie/TPE se positionnent entre 15€ et 120€/mois, avec une forte fragmentation : les logiciels de caisse (Lightspeed, Zelty, Hiboutik) coûtent 40–100€ mais n'incluent pas la gestion anti-gaspillage ni le click & collect. Les SaaS pure-play anti-gaspillage (Too Good To Go for Business) prélèvent une commission de 30-40% sur les ventes flash — ce qui représente 80–150€/mois pour une boulangerie actif avec 5 paniers/soir. BakeryOS ne prend aucune commission.

**Positionnement retenu :** prix d'entrée bas (friction minimale), upgrade naturel vers Pro quand la boulangerie commence à générer des commandes click & collect en volume.

### Packs et prix recommandés

**Starter — 19€/mois (190€/an)**

Cible : boulangerie solo, 1 vendeur, qui veut tester l'outil sans risque. Prix psychologique sous le seuil des 20€ qui déclenche la réflexion. Couvre le coût infra (~3€/mois/client) avec une marge de 84%.

**Pro — 49€/mois (490€/an)**

Cible : boulangerie établie avec 2-3 employés, click & collect actif, qui souhaite les rapports PDF et le module CO₂ pour sa communication. Le passage de 19 à 49€ est justifié par la valeur perçue du rapport CO₂ (différenciant marketing fort) et les utilisateurs supplémentaires. C'est le plan à maximiser car il représente l'essentiel de la marge.

**Multi — 99€/mois (990€/an)**

Cible : groupes de 2-5 boulangeries (artisans avec plusieurs points de vente, franchises légères). Prix calqué sur les outils de gestion multi-sites comme Pennylane ou Indy. L'accès API et l'export FEC justifient le prix aux yeux d'un gérant qui a déjà un comptable.

### Services inclus par pack

| Fonctionnalité | Starter | Pro | Multi |
|---|---|---|---|
| Gestion journée (Matin / Snapshot / Soir) | Inclus | Inclus | Inclus |
| Dashboard stats 30 jours | Inclus | Inclus | Inclus |
| Flash invendus automatique | Inclus | Inclus | Inclus |
| Suggestions ML production | Inclus | Inclus | Inclus |
| Notifications push commandes | Inclus | Inclus | Inclus |
| Click & Collect | 50 cmd/mois | Illimité | Illimité |
| Catalogue produits natifs | 20 produits | Illimité | Illimité |
| Utilisateurs | 1 | 3 | Illimité |
| Email confirmation Resend | Inclus | Inclus | Inclus |
| Rapport PDF hebdomadaire | — | Inclus | Inclus |
| Certificat CO₂ mensuel | — | Inclus | Inclus |
| QR code retrait | — | Inclus | Inclus |
| Alerte stock bas (push) | — | Inclus | Inclus |
| Prévisions météo × production | — | Inclus | Inclus |
| Multi-boulangeries | — | — | Inclus |
| Dashboard consolidé multi-sites | — | — | Inclus |
| Export comptable FEC | — | — | Inclus |
| API publique + webhooks | — | — | Inclus |
| SLA 99.5% avec astreinte | — | — | Inclus |
| Support | Email 48h | Email 24h | Slack dédié |

### Règles de passage entre plans

Un Starter doit naturellement passer en Pro quand il atteint 50 commandes/mois (plafond) — le système bloque les nouvelles commandes et propose l'upgrade automatiquement. Un Pro peut rester Pro même avec plusieurs utilisateurs jusqu'à 3 ; au-delà, l'interface propose Multi. Ces seuils de friction douce génèrent des upgrades sans démarche commerciale active.

### Tarif annuel

La remise annuelle de 17% (2 mois offerts) est délibérément modeste. L'objectif est de générer du cash upfront pour financer le développement sans sacrifier la MRR mensuelle. À revoir vers 25% si le churn mensuel dépasse 5%.

---

## PROJECTION MRR À 12 MOIS

| Pack | Clients (conserv.) | MRR | Clients (optim.) | MRR |
|---|---|---|---|---|
| Starter | 200 | 3 800€ | 400 | 7 600€ |
| Pro | 60 | 2 940€ | 120 | 5 880€ |
| Multi | 15 | 1 485€ | 30 | 2 970€ |
| Total | 275 | 8 225€/mois | 550 | 16 450€/mois |

ARR conservateur : ~99 000€
Seuil de rentabilité : ~180 clients (infra < 200€/mois Netlify + Supabase Pro + Upstash)

---

## TAUX DE RÉUSSITE ESTIMÉ À 12 MOIS

### Définition du succès

"Succès" pour ce SaaS à 12 mois signifie : atteindre le seuil de rentabilité (180 clients payants), un churn mensuel stable sous 4%, et une traction démontrable (avis, témoignages, 1 article presse) permettant une levée de fonds d'amorçage ou une accélération en autofinancement.

### Probabilité par scénario

**Scénario pessimiste — 20% de probabilité**

L'onboarding reste bloqué sur Airtable. Faute de catalogue natif livré dans les 60 jours, le taux de conversion onboarding plafonne à 3-5% des démos. À 12 mois : 40-60 clients, MRR ~900€, sous le seuil de rentabilité. Cause principale : sous-estimation du temps de développement du catalogue natif ou manque de temps du fondateur.

**Scénario médian — 50% de probabilité**

Le catalogue natif est livré en J+45. L'onboarding wizard est opérationnel en J+60. Les premiers boulangers beta génèrent 3-4 témoignages vidéo exploitables sur Instagram. À 12 mois : 150-200 clients, MRR ~3 500-4 500€, proche du seuil de rentabilité. Le Pro représente 30% de la base client.

**Scénario optimiste — 30% de probabilité**

Un partenariat meuniers ou un article presse anti-gaspillage génère une vague d'inscriptions (50-100 en quelques semaines). Le programme referral fonctionne. À 12 mois : 300-400 clients, MRR ~6 000-8 000€, rentable. La fonctionnalité CO₂ devient un argument commercial fort dans un contexte réglementaire favorable (loi AGEC).

### Facteurs de risque principaux

Le marché des boulangeries artisanales est fragmenté et peu digitalisé. C'est une force (peu de concurrence SaaS spécialisé) mais aussi une faiblesse : le cycle de vente est long, les décideurs ne sont pas des early adopters, et le ticket moyen bas (19€) exige un volume important pour atteindre la rentabilité. Le principal risque d'exécution est la dépendance Airtable actuelle : si un boulanger ne configure pas Airtable, il n'a pas de catalogue — c'est une friction éliminatoire à l'onboarding.

Le deuxième risque est la concentration des efforts. BakeryOS est un produit complet (vitrine + click & collect + outil interne) développé en solo ou petite équipe. La roadmap est ambitieuse ; prioriser catalogue natif + onboarding est la seule décision critique des 60 prochains jours.

### Leviers d'amélioration du taux de réussite

Livrer le catalogue natif avant la première campagne d'acquisition est le levier n°1 — il fait passer le taux de conversion onboarding estimé de 5% à 25-35%. Le deuxième levier est de sécuriser 3-5 boulangeries beta qui utilisent l'outil quotidiennement avant tout effort marketing : elles génèrent des données ML réelles, des bugs à corriger, et les témoignages nécessaires pour convaincre les suivants. Le troisième est le timing : Europain 2026 (mars) et SIRHA 2027 (janvier) sont des opportunités structurantes ; se positionner 6 mois avant en construisant une liste d'attente via SEO et Instagram multiplie le ROI de la présence stand.

### Résumé

| Scénario | Probabilité | Clients M12 | MRR M12 | Rentable |
|---|---|---|---|---|
| Pessimiste | 20% | 40-60 | ~900€ | Non |
| Médian | 50% | 150-200 | ~4 000€ | Proche |
| Optimiste | 30% | 300-400 | ~7 000€ | Oui |

Espérance mathématique : **~4 100€ MRR à 12 mois**, soit un ARR projeté de ~49 000€. Rentable à partir du scénario médian haut (180+ clients). La décision la plus impactante pour améliorer ces probabilités reste la livraison du catalogue natif dans les 45 prochains jours.

---

## GTM

### M1–M3 : Beta fermée (0 → 10 boulangers)
Recrutement Instagram #boulangerie + #artisanboulanger. Beta gratuite 3 mois contre feedback + témoignage. Onboarding manuel call 45 min. Objectif : valider le catalogue natif et les suggestions ML avec de vraies données.

### M3–M6 : Croissance organique (10 → 50 boulangers)
Confédération Nationale Boulangerie (~15k abonnés). SEO longue traîne. Programme referral 2 mois offerts. Presse anti-gaspillage (Kaizen, Mr Mondialisation).

### M6–M12 : Accélération (50 → 275 boulangers)
Europain/SIRHA stand. Partenariat meuniers (Viron, Épi de France). Webinaires "Réduire ses invendus de 30% en 30 jours".

---

## ÉTAT DES FONCTIONNALITÉS

| Fonctionnalité | Statut |
|---|---|
| Auth boulanger OTP | OK |
| Gestion journée Matin/Snapshot/Soir | OK |
| Suggestions production ML (historique réel) | OK — livré 14/03 |
| Dashboard statistiques | OK |
| Click & Collect + checkout | OK |
| Gestion commandes Realtime | OK |
| Email confirmation Resend | OK |
| INTERNAL_API_SECRET prod | OK — livré 14/03 |
| Rate limiting Upstash Redis | OK — livré 14/03 (à configurer) |
| BC1 type DbCommande | OK — migration-5 à exécuter en base |
| Landing SEO complète | OK |
| Structured data JSON-LD | OK |
| Flash invendus dynamique | OK |
| Suggestions paniers | OK |
| Notifications push | Partiel — clés VAPID à configurer |
| PWA installable | OK |
| Catalogue natif | Non — dépend d'Airtable |
| Onboarding wizard | Non |
| Multi-boulangerie | Non |
| Export PDF | Non |
| Rapport CO₂ | Non |

---

*Mis à jour le 14/03/2026 — Session corrections BC1/BC3/S3/ML*
*Prochain audit recommandé : après livraison catalogue natif (J+30)*