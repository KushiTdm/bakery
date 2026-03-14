# Roadmap BakeryOS 🥖
*Mis à jour après audit complet — mars 2026*

---

## Notes sur 100 — Évaluation révisée

| Critère | Note | Justification |
|---|---|---|
| **Présentation** | 76/100 | Landing premium, dark theme app boulanger soigné, animations framer-motion fluides. Manque : micro-interactions sur les compteurs, pas d'onboarding guidé pour le premier boulanger. |
| **Service / Produit** | 68/100 | Core loop solide (Matin → Snapshot → Soir → Dashboard). Les bugs critiques de la v1 sont corrigés. Reste : catalogue 100% dépendant d'Airtable (bloquant pour l'adoption de masse). |
| **Fonctionnalités** | 62/100 | Click & collect fonctionnel, gestion journée fiable, PWA installable, push notifications. Manque : catalogue natif, suggestions ML réelles, realtime commandes. |
| **SEO** | 52/100 | SSR en place sur la landing, faux avis supprimés, Open Graph configuré. Manque : sitemap.xml, robots.txt, zéro contenu textuel indexable sur les sous-pages. |
| **Sécurité** | 64/100 | RLS Supabase, clés Airtable chiffrées pgcrypto, rate limit double couche (IP + email), proxy serveur pour clés API. Reste : `statut 'retiree'` manquant dans la migration 3 vs le code orders/[id] (CHECK constraint incohérent). |
| **Qualité code** | 61/100 | Architecture claire (contexts, hooks, API routes séparées). Points faibles : `any` trop fréquent dans les maps Supabase, `tsconfig.json` cible `es5` avec modules `esnext` (incohérence expliquant le TS2802), Firebase encore dans `package.json`. |
| **Attractivité investisseur** | 60/100 | Concept anti-gaspillage différenciant, TAM réel (~33k boulangeries FR), pricing défini. Manque : zéro traction prouvée, pas de métriques d'usage. |

**Moyenne : 63/100** *(+6 pts vs audit précédent — les corrections de bugs critiques ont un vrai impact)*

---

## Estimation de réussite

**42-48% de chances de succès commercial à 18 mois** si les items 🔴 ci-dessous sont traités dans les 30 prochains jours.
Le **bloquant commercial n°1 reste le catalogue natif** : sans lui, l'onboarding demande ~2h à un boulanger non-technique → taux d'abandon estimé > 70%.

---

## 🐛 Bugs actifs — À corriger maintenant

### B1. TS2802 — `lib/rate-limit.ts` *(CORRIGÉ — fichier généré)*
`for...of` sur `MapIterator` incompatible avec `target: "es5"`.
**Fix appliqué :** `Array.from(ipStore.entries()).forEach(...)`.

### B2. `tsconfig.json` — cible incohérente *(30 min)*
`"target": "es5"` + `"module": "esnext"` est contradictoire et source de bugs subtils.
Next.js 13 fonctionne avec `"target": "ES2017"` minimum.

```json
// tsconfig.json
"target": "ES2017",  // était "es5"
```

### B3. Contrainte CHECK `statut` incohérente *(15 min SQL)*
Migration 3 déclare : `'en_attente', 'confirmee', 'prete', 'retiree', 'annulee'`
Code `orders/[id]/route.ts` envoie : `'recuperee'` → rejeté par la base silencieusement.

```sql
-- À exécuter dans Supabase SQL Editor
ALTER TABLE commandes DROP CONSTRAINT commandes_statut_check;
ALTER TABLE commandes ADD CONSTRAINT commandes_statut_check
  CHECK (statut IN ('en_attente', 'confirmee', 'prete', 'recuperee', 'retiree', 'annulee'));
```

### B4. Firebase dans `package.json` *(2 min)*
Firebase n'est utilisé nulle part dans le code (migration Supabase complète).
```bash
npm uninstall firebase
```
Impact : **~400kb** de bundle en moins.

### B5. `@next/swc-wasm-nodejs` version figée *(5 min)*
`"@next/swc-wasm-nodejs": "13.5.1"` hardcodé alors que Next.js est en `^13.5.11`.
Peut provoquer des incompatibilités de build sur Netlify/Vercel.
```bash
npm uninstall @next/swc-wasm-nodejs
# Next.js gère automatiquement le bon binaire SWC
```

### B6. Icônes PWA manquantes *(30 min)*
`/public/icons/icon-*.png` référencés dans `manifest.json` mais absents → PWA non installable iOS/Android, erreurs 404 en console.
Générer sur [realfavicongenerator.net](https://realfavicongenerator.net) depuis `public/icons/icon.svg`.

---

## 🔴 BLOQUANT — Avant toute démo ou acquisition client

### 1. Catalogue éditable natif — **Bloquant commercial n°1** *(5-8 jours)*
Sans ça, chaque boulanger doit créer un compte Airtable, apprendre l'interface, configurer 3 tables avec les bons champs. Taux de conversion onboarding estimé : **< 5%** avec Airtable obligatoire, **~40%** avec CRUD natif.

**Ce qu'il faut :**
- Table `produits` Supabase (id, boulangerie_id, nom, emoji, categorie, prix_vente, cout_production, image_url, disponible, ordre)
- Page `/boulanger/catalogue` : ajout / édition / photo / toggle actif
- Upload photo vers Supabase Storage (bucket `produits`, policy publique en lecture)
- Airtable devient optionnel (sync one-way pour les early adopters qui l'utilisent déjà)

### 2. Clés VAPID *(5 min)*
Sans elles, les push notifications sont silencieusement désactivées.
```bash
npx web-push generate-vapid-keys
# → .env.local
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT_EMAIL=contact@artisandore.fr
```

### 3. Sitemap + robots.txt *(2h)*
Zéro pages indexées sans ça. Google n'explore pas un site sans sitemap.

```typescript
// app/sitemap.ts
import { MetadataRoute } from 'next'
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://artisandore.fr', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://artisandore.fr/#notre-histoire', changeFrequency: 'monthly', priority: 0.7 },
  ]
}
```

```
# public/robots.txt
User-agent: *
Allow: /
Disallow: /boulanger/
Sitemap: https://artisandore.fr/sitemap.xml
```

---

## 🟡 Court terme — 30 jours

### 4. Realtime commandes via Supabase Realtime *(1 jour)*
Remplace le `setInterval(loadOrders, 60_000)` par un channel Postgres.
```typescript
supabase
  .channel('commandes-realtime')
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'commandes',
    filter: `boulangerie_id=eq.${boulangerieId}`,
  }, (payload) => {
    setOrders(prev => [mapCommande(payload.new), ...prev]);
    // Vibration + son sur mobile
    navigator.vibrate?.([200, 100, 200]);
  })
  .subscribe();
```

### 5. Timezone commandes *(1h)*
`GET /api/orders` filtre sur `created_at` UTC mais un boulanger en France à 23h30 ne voit pas ses commandes du soir si le filtre est basé sur la date UTC (déjà passé à minuit UTC+2 en été).
```typescript
// Remplacer dans app/api/orders/route.ts
const dateStart = new Date(`${date}T00:00:00+01:00`).toISOString();
const dateEnd   = new Date(`${date}T23:59:59+02:00`).toISOString();
// → Ajouter une colonne date_locale DATE dans journees pour éviter ce calcul
```

### 6. Suggestions de production réelles *(3 jours)*
Les suggestions actuelles (`+30% week-end codé en dur`) sont une démo, pas un outil.
Remplacer par une régression sur l'historique Supabase réel :

```typescript
// Pour chaque produit, calculer la moyenne par jour de semaine sur les 30 derniers jours
const suggestion = history
  .filter(d => new Date(d.date).getDay() === today.getDay())
  .reduce((avg, d, _, arr) => avg + d.stocks.find(s => s.id === productId)?.production / arr.length, 0);

// Afficher : "Mardi dernier : 72 vendues / 80 produites → Suggestion : 74 (-8%)"
```

### 7. Page d'onboarding guidée *(2 jours)*
Un boulanger qui arrive sur `/boulanger` pour la première fois ne sait pas quoi faire.
Ajouter un wizard 4 étapes :
1. Bienvenue + explication du concept
2. Configurer le catalogue (natif ou Airtable)
3. Saisir sa première production
4. Tester le click & collect

Conditionné sur `boulangerie.onboarding_completed = false`.

### 8. FlashBanner connectée aux vrais stocks *(4h)*
`BASKETS_TAKEN = 5` est hardcodé. Connecter au polling `/api/products` → utiliser `flashConfig.panierMystereCount` et calculer dynamiquement les paniers restants depuis les invendus déclarés par le boulanger.

### 9. `ErrorBoundary` global *(1h)*
`app/error.tsx` existe mais ne couvre pas les erreurs dans les Providers.
Ajouter un boundary autour de `BoulangerProvider` dans `app/boulanger/layout.tsx`.

---

## 🟢 Moyen terme — 30 à 90 jours

### 10. Multi-utilisateurs par boulangerie *(5 jours)*
La vendeuse fait les snapshots 10h, le boulanger gère le matin.
- Table `boulangerie_users(boulangerie_id, user_id, role, invited_email, status)`
- Rôles : `owner` (tout), `staff` (snapshots + commandes uniquement, pas les paramètres)
- Invitation par email → lien magique Supabase

### 11. Export PDF rapport hebdomadaire *(2 jours)*
Email automatique le lundi matin (Resend + cron Vercel/Netlify) :
- CA de la semaine vs semaine précédente
- Top 3 produits vendus / Top 3 invendus
- Recommandation de production pour la semaine

Argument de vente fort pour le plan Pro : *"Votre rapport atterrit dans votre boîte mail chaque lundi"*.

### 12. Heure de retrait configurable *(1 jour)*
Actuellement `heure_retrait` est fixé à `'08:00'` dans `cart-sidebar.tsx`. Chaque boulangerie a ses horaires. Permettre au client de choisir un créneau parmi ceux configurés par le boulanger.

### 13. Historique commandes client *(1 jour)*
Un client connecté (OTP) devrait pouvoir voir ses commandes passées sur `/commandes`. Simple query `commandes.client_email = user.email`.

### 14. Catalogue avec variantes *(3 jours)*
Certains produits ont des variantes : baguette normale / complète, tarte citron / framboise.
Ajouter un champ `variantes JSONB` dans la table `produits` et adapter le click & collect.

---

## 🔵 Long terme — 90+ jours

### 15. Intégration caisse Lightspeed / Zelty *(3 semaines)*
Import automatique des ventes réelles → supprime la saisie manuelle des snapshots. Webhook entrant ou polling API.
**Impact :** réduit la friction quotidienne de ~15 min → argument de rétention fort.

### 16. Module Anti-gaspi public `/[slug]/invendus` *(1 semaine)*
Page publique listant les disponibilités flash en temps réel pour chaque boulangerie.
SEO longue traîne gratuit : *"invendus boulangerie [ville]"*, *"pain pas cher ce soir [quartier]"*.
Potentiel : référencement Google Maps + partenariat Too Good To Go (API).

### 17. Application mobile native *(2 mois)*
La PWA couvre 80% des cas mais iOS Safari a des limitations sur les push et l'écran de veille.
React Native (Expo) partageant les mêmes hooks → 70% du code réutilisable.

### 18. Export comptable FEC *(1 semaine)*
Format FEC simplifié compatible Sage / EBP / Ciel.
Argument décisif pour les boulangers avec comptable : *"Donnez ce fichier à votre expert-comptable"*.

### 19. Tableau de bord multi-boulangeries *(2-3 semaines)*
Architecture tenant avec switch dans le header.
Cible : chaînes 2-5 boutiques (franchises artisanales, groupements).

### 20. API publique + webhooks *(2 semaines)*
Permettre aux intégrateurs (comptables, caisses, agrégateurs) de se connecter.
Plan Multi uniquement. Authentification via API key générée dans les paramètres.

---

## 💡 Nouvelles features proposées

### NF1. Badging intelligent des invendus *(2 jours)*
Au lieu d'un simple prix barré, afficher une vraie logique de valeur :
- `🔥 Dernier !` si stockFinal = 1
- `⏰ Expire dans 45 min` (countdown basé sur `heureFin` du flash)
- `🎁 Économisez X€` calculé dynamiquement
Augmente les conversions click & collect de 15-25% (dark pattern éthique).

### NF2. Prévisions météo × production *(3 jours)*
Appel API Météo-France (gratuit, open data) → corriger automatiquement les suggestions :
*"Il pleut demain → réduisez les viennoiseries de 12% (les clients restent chez eux)"*
*"Canicule → augmentez les boissons fraîches (si catalogue)"*
Feature PR forte, contenu parfait pour un article de presse.

### NF3. Mode "Fermeture exceptionnelle" *(4h)*
Un bouton dans les paramètres pour désactiver temporairement le click & collect (maladie, vacances, pont). Affiche un message personnalisable sur la page publique. Simple toggle `actif` sur la boulangerie + message `message_fermeture TEXT`.

### NF4. QR code retrait *(1 jour)*
À la validation de commande, générer un QR code unique (= `commande_id` encodé).
Le boulanger scanne → marque automatiquement comme `recuperee`.
Bibliothèque : `qrcode` (< 5kb gzip, pas de dépendance lourde).

### NF5. Alerte stock bas temps réel *(1 jour)*
Push notification au boulanger quand un produit clé tombe en dessous d'un seuil (configurable par produit) :
*"🥖 Baguette Tradition : seulement 8 restantes — vos 3 commandes en attente en consomment 6"*
Croise `stockFinal` avec les lignes de `commandes` en statut `en_attente`.

### NF6. Rapport anti-gaspillage mensuel *(2 jours)*
Email le 1er de chaque mois avec :
- kg de pain économisés (invendus × poids estimé par catégorie)
- Équivalent CO₂ (1kg pain = ~0.9kg CO₂ selon ADEME)
- Certificat *"Artisan responsable"* téléchargeable PDF

**Valeur marketing énorme** : le boulanger partage sur Instagram, c'est de la pub gratuite.

### NF7. Intégration Google Business Profile *(3 jours)*
Synchroniser les horaires d'ouverture et les disponibilités flash directement sur la fiche Google Maps. API Google My Business (OAuth). Argument SEO local fort.

### NF8. Messagerie client *(3 jours)*
Permettre aux clients de laisser un message sur leur commande ET au boulanger de répondre (ex: *"Nous avons remplacé les fraises par des framboises"*). Canal SMS via Twilio ou simple email Resend.

---

## 💰 Packs tarifaires — Révision

*Benchmark actualisé : Tiller ~69€/mois, Lightspeed ~119€/mois, Innovorder ~99€/mois, Sunday ~0€ (commission). Notre positionnement : outil spécialisé boulangerie, pas une caisse généraliste.*

---

### 🥖 STARTER — 19€/mois *(ou 190€/an = 2 mois offerts)*

**Révision à la baisse** : 29€ était trop élevé pour un premier contact sans traction prouvée. 19€ = impulsion d'achat pour un artisan. Objectif : acquérir vite, upgrader ensuite.

**Pour qui :** Boulangerie indépendante, 1 personne.

**Inclus :**
- Gestion journée complète (Matin / Snapshot / Soir)
- Dashboard stats — 30 jours d'historique
- Catalogue natif — jusqu'à 20 produits
- Click & Collect — jusqu'à 50 commandes/mois
- Flash Invendus automatique
- Notifications push
- 1 utilisateur
- Support email 72h

**Non inclus :** Multi-users, suggestions ML, export PDF, API

---

### 🥐 PRO — 49€/mois *(ou 490€/an = 2 mois offerts)*

**Révision à la baisse** : 59€ trop proche du seuil psychologique. 49€ = différence perçue plus nette vs Starter.

**Pour qui :** Boulangerie 2-5 personnes, veut optimiser et gagner du temps.

**Inclus (tout Starter +) :**
- Catalogue natif illimité
- 3 utilisateurs (rôles owner/staff)
- Click & Collect illimité
- Suggestions de production par l'historique réel
- Export PDF hebdomadaire (rapport CA + invendus)
- Alerte stock bas temps réel (NF5)
- Rapport anti-gaspillage mensuel (NF6) — certificat inclus
- Realtime commandes (pas de polling)
- Heure de retrait configurable par créneau
- Support prioritaire 24h

**Argument clé :** *"Le rapport anti-gaspillage + les suggestions de production → amorti en 3 jours d'économies"*

---

### 🏆 MULTI — 99€/mois *(ou 990€/an)*

**Révision à la baisse** : 119€ visait trop haut sans traction. 99€ reste crédible pour une chaîne.

**Pour qui :** Chaînes 2-5 boutiques, franchisés artisanaux.

**Inclus (tout Pro +) :**
- Boulangeries illimitées
- Utilisateurs illimités
- Dashboard consolidé multi-sites
- Export comptable FEC
- QR code retrait (NF4)
- API access + webhooks
- Onboarding dédié (1h visio)
- SLA 99.5% uptime garanti
- Support téléphonique

---

### 📊 Projection MRR à 12 mois (conservateur vs optimiste)

| Pack | Clients (conserv.) | MRR conserv. | Clients (optim.) | MRR optim. |
|---|---|---|---|---|
| Starter | 200 | 3 800€ | 400 | 7 600€ |
| Pro | 60 | 2 940€ | 120 | 5 880€ |
| Multi | 15 | 1 485€ | 30 | 2 970€ |
| **Total** | **275** | **8 225€/mois** | **550** | **16 450€/mois** |

**ARR conservateur : ~99 000€** — rentable pour 1 fondateur dès M10.
**ARR optimiste : ~197 000€** — permet d'embaucher 1 dev temps plein.

**Seuil de rentabilité estimé : 180 clients** (mix Starter/Pro) avec coûts infra Supabase + Resend + Netlify < 200€/mois.

---

### 🎯 Go-to-Market recommandé

**Mois 1-3 : Validation terrain (gratuit)**
- 10 boulangers beta gratuite 3 mois → feedback hebdo + témoignage vidéo
- Cibler Instagram : `#boulangerie` + Stories avec invendus jetés
- 1 article de fond : *"Comment réduire ses invendus de 30% avec un outil à 19€/mois"*
- Démo live sur YouTube/TikTok : *"1 journée avec BakeryOS"* — format vlog artisan

**Mois 3-6 : Première traction payante**
- Partenariat Confédération Nationale de la Boulangerie (newsletter ~15k abonnés)
- SEO longue traîne : *"logiciel gestion invendus boulangerie"*, *"click and collect boulangerie gratuit"*
- Programme referral : 2 mois offerts par boulangerie recommandée (valeur perçue forte)
- Listing sur Capterra / GetApp catégorie "Bakery Software"

**Mois 6-12 : Scale**
- Salons professionnels : Europain (Paris, bisannuel), SIRHA Lyon
- Partenariat meuniers / distributeurs farine (Viron, Épi de France) → accès direct à leur base clients qualifiée
- Affiliation experts-comptables spécialisés boulangerie
- Presse : LSA, Le Journal de la Boulangerie, France Bleu Locales (angle anti-gaspillage)