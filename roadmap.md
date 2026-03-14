# Roadmap BakeryOS 🥖
*Analyse complète — après audit sécurité et fonctionnel*

---

## Notes sur 100 — Évaluation objective

| Critère | Note | Justification honnête |
|---|---|---|
| **Présentation** | 72/100 | Landing premium, app boulanger soignée. Manque animations d'entrée sur mobile et micro-interactions. |
| **Service / Produit** | 60/100 | Concept fort, core loop fonctionnel. Mais 5 bugs critiques découverts en audit (table mal nommée, statuts incohérents, var env manquante) qui bloquent en production. |
| **Fonctionnalités** | 55/100 | Click & collect fonctionne. Gestion journée fonctionne. Mais catalogue 100% dépendant d'Airtable (bloquant pour adoption), pas de multi-user, pas de rate limiting. |
| **SEO** | 55/100 | SSR en place, faux avis supprimés. Mais zéro contenu textuel indexable hors landing, pas de sitemap, pas de robots.txt. |
| **Sécurité** | 45/100 | RLS Supabase bien configuré, clés chiffrées. Mais POST /api/orders sans rate limiting (spam/flood), middleware redirige vers une route inexistante, SUPABASE_SERVICE_KEY encore présent dans un fichier. |
| **Attractivité investisseur** | 58/100 | Concept différenciant (anti-gaspillage), TAM réel. Mais zéro traction prouvée, pricing absent, go-to-market vague. |

**Moyenne : 57/100** *(note honnête — le produit est prometteur mais pas encore prêt pour acquisition client)*

---

## Estimation de réussite

**32-38% de chances de succès commercial à 18 mois.**
Les 5 bugs critiques découverts en audit auraient coulé les premières démos boulanger.
Avec les corrections de cette session : **42-48%** si les 30 jours prioritaires sont exécutés.

---

## ✅ Corrigé — historique complet

**Architecture & Sécurité**
- Double `app/globals.css` / `app/layout.tsx` supprimés
- Firebase → Supabase OTP (suppression des 400kb inutiles)
- `SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` uniformisé (partout sauf products/route.ts — corrigé dans cette session)
- Clés Airtable chiffrées via pgcrypto en base (pas en clair)
- Route de test `app/api/test-supabase/` supprimée
- Import lazy `getSupabaseAdmin` pour éviter crash au démarrage

**TypeScript**
- TS7006/TS7031/TS2322 dans auth-modal, boulanger-context, use-push-notifications, notifications/send/route

**Fonctionnel**
- `cart-sidebar.tsx` branché sur `POST /api/orders` (vraie persistance Supabase)
- Email confirmation via Resend
- Push notifications : toggle + hook + Service Worker + manifest PWA
- `commandes/page.tsx` : boulangerie_id récupéré via /api/boulanger/profil
- Faux avis schema.org supprimés (risque DGCCRF)
- SSR landing : hero, savoir-faire, ingredients, footer en Server Components
- `ActiveTabContext` + `LandingClient` : architecture client islands propre

**Bugs critiques corrigés dans cette session (audit)**
- ✅ `app/api/products/route.ts` : `SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `app/api/orders/[id]/route.ts` : table `orders` → `commandes` (nom réel en base)
- ✅ `app/api/orders/[id]/route.ts` : statuts `pending/confirmed/ready/done` → `en_attente/confirmee/prete/recuperee`
- ✅ `components/FlashBanner.tsx` : import `ActiveTab` depuis `context/active-tab-context` (plus `app/page`)
- ✅ `components/navbar.tsx` : même correction import
- ✅ `middleware.ts` : redirect vers `/boulanger/login` (route inexistante) → laisse passer, auth gérée dans le contexte React
- ✅ `commandes/page.tsx` : mapping statuts DB↔front cohérent dans les deux sens, `heure_retrait` formaté proprement

---

## 🔴 BLOQUANT — Avant toute démo ou acquisition client

### 1. Rate limiting POST /api/orders *(2h)*
Route publique sans auth — n'importe qui peut flooder la base de commandes.
Ajouter un rate limit simple par IP :

```typescript
// Utiliser Upstash Redis (gratuit jusqu'à 10k req/jour) ou un Map en mémoire
// Option simple avec les headers Netlify/Vercel :
const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
// Max 5 commandes par IP par heure
```

Ou bloquer avec un honeypot field + vérification email format strict (déjà présent avec Zod).

### 2. Icônes PWA *(30 min)*
`/public/icons/icon-*.png` manquants → erreurs 404, PWA non installable iOS/Android.
Générer sur https://realfavicongenerator.net à partir de `public/icons/icon.svg` existant.

### 3. Clés VAPID *(5 min)*
```bash
npx web-push generate-vapid-keys
# → .env.local : NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
```

### 4. `npm uninstall firebase` *(2 min)*
Firebase toujours dans `package.json` malgré la migration. +400kb bundle inutiles.

---

## 🟡 Court terme — 30 jours

### 5. Sitemap + robots.txt *(2h)*
Zero pages indexées par Google sans ça. Créer `app/sitemap.ts` et `public/robots.txt`.

### 6. ErrorBoundary global `app/error.tsx` *(1h)*
Crash React = écran blanc. Le fichier existe dans le code mais pas dans le projet réel.

### 7. Supprimer `components/product-menu.tsx` *(5 min)*
Dead code non importé nulle part.

### 8. FlashBanner connectée aux vrais stocks *(1 jour)*
`BASKETS_TAKEN = 5` hardcodé. Connecter au polling `/api/products` → `panierMystereCount`.

### 9. Timezone commandes *(1h)*
`GET /api/orders` filtre par `created_at` (UTC) sur date locale → commandes manquantes si boulanger en FR.
Passer le filtre en `Europe/Paris` ou utiliser une colonne `date_locale DATE`.

---

## 🟢 Moyen terme — 30 à 90 jours
*(Ce sont les features qui définissent le passage de MVP à produit commercialisable)*

### 10. Catalogue éditable natif *(5-8 jours)* — **Blocker commercial n°1**
Sans ça, chaque nouveau boulanger doit créer un compte Airtable, apprendre l'outil, configurer les tables.
Taux de conversion à l'onboarding estimé : **< 5%** avec Airtable, **~40%** avec un CRUD natif.
- Table `produits` Supabase + RLS
- CRUD dans l'espace boulanger (ajouter / modifier / photo / désactiver)
- Airtable devient optionnel (import/sync pour les early adopters avancés)

### 11. Suggestions de production ML simple *(3-5 jours)*
Le "+15% mercredi codé en dur" est une blague pour un vrai boulanger.
- Régression linéaire par produit × jour de semaine sur les 30 derniers jours
- Affiche : *"Semaine dernière : 80 baguettes, 68 vendues. Suggestion : 72 (-10%)"*
- C'est **la feature qui génère la fidélité** : le boulanger revient chaque matin

### 12. Multi-utilisateurs par boulangerie *(5 jours)*
La femme du boulanger fait les snapshots 10h pendant que lui est en production.
- Table `boulangerie_users(boulangerie_id, user_id, role)`
- Rôles : `owner` (tout), `staff` (snapshots + commandes uniquement)

### 13. Réaltime commandes (Supabase Realtime) *(1 jour)*
Remplace le polling toutes les 60s par `supabase.channel().on('postgres_changes')`.
Notification instantanée dès qu'une commande entre — sans rechargement.

### 14. Export PDF hebdomadaire *(2 jours)*
Rapport CA / invendus / tendances envoyé le lundi matin via Resend.
Argument de vente fort pour le plan Pro.

---

## 🔵 Long terme — 90+ jours
*(Différenciation concurrentielle et expansion)*

### 15. Intégration caisse *(2-3 semaines)*
Lightspeed K-Series ou Zelty (leader FR boulangerie) via webhook.
Import automatique des ventes réelles → supprime la saisie manuelle des snapshots.

### 16. Module Anti-gaspi public *(1 semaine)*
Page publique `/[slug]/invendus` listant les disponibilités flash en temps réel.
Référencement local "invendus boulangerie [ville]" — SEO longue traîne gratuit.

### 17. Multi-boulangerie *(2-3 semaines)*
Architecture tenant avec switch de boulangerie dans le header.
Cible : chaînes 2-5 boutiques (franchises artisanales, PAUL indépendants).

### 18. Export comptable FEC *(1 semaine)*
Format FEC simplifié compatible Sage / EBP / Ciel.
Argument décisif pour les boulangers avec comptable.

---

## 💰 Packs tarifaires — Lancement SaaS

*Basé sur : ~33 000 boulangeries artisanales FR, panier moyen logiciel boulangerie 39-120€/mois, benchmark Tiller/Lightspeed/Innovorder.*

---

### 🥖 STARTER — 29€/mois *(ou 290€/an = 2 mois offerts)*

**Pour qui :** Boulangerie indépendante, 1 personne, veut réduire les invendus sans se compliquer la vie.

**Inclus :**
- Gestion journée complète (Matin / Snapshot / Soir)
- Dashboard stats (30 jours d'historique)
- 1 utilisateur
- Catalogue via Airtable (import manuel)
- Click & Collect (jusqu'à 30 commandes/mois)
- Flash Invendus automatique
- Notifications push
- Support email 48h

**Non inclus :** Multi-users, catalogue natif, export PDF, suggestions ML

**Objectif conversion :** 150 boulangers en 12 mois = **4 350€ MRR**

---

### 🥐 PRO — 59€/mois *(ou 590€/an = 2 mois offerts)*

**Pour qui :** Boulangerie établie, 2-3 personnes, veut optimiser sérieusement et gagner du temps.

**Inclus (tout Starter +) :**
- Catalogue éditable natif (sans Airtable)
- 3 utilisateurs (rôles owner/staff)
- Click & Collect illimité
- Suggestions de production par ML (historique 90 jours)
- Export PDF hebdomadaire (rapport comptable simplifié)
- Supabase Realtime (commandes instantanées)
- Support prioritaire 24h

**Argument clé :** *"Le catalogue natif + les suggestions de production → payé en 2 jours d'économies sur les invendus"*

**Objectif conversion :** 80 boulangers en 12 mois = **4 720€ MRR**

---

### 🏆 MULTI — 119€/mois *(ou 1 190€/an)*

**Pour qui :** Chaîne 2-5 boutiques, franchisés artisanaux, groupements de boulangers.

**Inclus (tout Pro +) :**
- Boulangeries illimitées (gestion centralisée)
- Utilisateurs illimités
- Dashboard consolidé multi-sites
- Export comptable FEC (Sage / EBP compatible)
- Intégration caisse (Lightspeed / Zelty) — *en phase bêta*
- API access (webhooks entrants/sortants)
- Onboarding dédié (1h visio)
- SLA 99.5% uptime garanti
- Support téléphonique

**Objectif conversion :** 20 groupements en 12 mois = **2 380€ MRR**

---

### 📊 Projection MRR à 12 mois (objectif conservateur)

| Pack | Clients | MRR |
|---|---|---|
| Starter | 150 | 4 350€ |
| Pro | 80 | 4 720€ |
| Multi | 20 | 2 380€ |
| **Total** | **250** | **11 450€/mois** |

**ARR cible : ~137 000€** — seuil de rentabilité pour 1 fondateur + 1 dev temps partiel.

---

### 🎯 Go-to-Market recommandé

**Mois 1-3 : Validation terrain**
- 10 boulangers en beta gratuite 3 mois (contrepartie : feedback hebdo + témoignage)
- Cibler les boulangers actifs sur Instagram (chercher #boulangerie + Stories avec invendus)
- 1 article Medium : "Comment j'ai réduit mes invendus de 30% avec un outil simple"

**Mois 3-6 : Première traction**
- Partenariat Confédération Nationale de la Boulangerie (newsletter ~15k abonnés)
- Contenu SEO longue traîne : "logiciel gestion boulangerie gratuit", "réduire invendus boulangerie", "click and collect boulangerie"
- Programme referral : 1 mois offert par boulangerie recommandée

**Mois 6-12 : Scale**
- Salons professionnels (Europain, SIRHA Lyon)
- Partenariat Moulins Viron / Épi de France (distributeurs farine → base clients qualifiée)
- Affiliation comptables spécialisés boulangerie