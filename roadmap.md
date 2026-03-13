# Analyse complète de BakeryOS 🥖

---

## 🧑‍💻 EN TANT QUE DÉVELOPPEUR

### Ce qui est bien fait
L'architecture est solide. Next.js 13/App Router, Supabase avec RLS bien configuré, séparation claire client/serveur, contexte React bien structuré avec debounce pour éviter les appels Supabase intempestifs, fallback localStorage pour le mode offline. Le code est propre, commenté, lisible.

### Ce qui manque ou pose problème

**Bugs et risques critiques**

Il y a deux `app/globals.css` et deux `app/layout.tsx` — l'un pour la landing BakeryOS (Cormorant Garamond, variables CSS `--ink`, `--gold`) et l'autre pour l'app boulanger (Playfair Display, Tailwind). Ces deux mondes coexistent dans le même repo sans séparation claire de routes. C'est une bombe à retardement : les styles vont se marcher dessus en production.

Firebase est importé (`lib/firebase.ts`) mais n'est utilisé que dans `auth-modal.tsx` pour le Magic Link côté client public, tandis que l'espace boulanger utilise Supabase Auth. Deux systèmes d'auth dans un même projet, c'est une dette technique immédiate.

**Sécurité**

Pas de rate limiting sur les API routes `/api/boulanger/auth` — un bot peut bruteforcer les mots de passe.

Pas de validation des inputs avec zod ou équivalent côté API — `nom`, `slug`, `email` arrivent bruts.

**Manques fonctionnels**

- Pas de tests (unit, e2e) — zéro
- Pas de gestion d'erreur globale (ErrorBoundary)
- `product-menu.tsx` existe mais n'est jamais importé dans les pages

**Performance**

~~Le contexte boulanger recalcule tout à chaque render. `revenueToday`, `unsoldToday` etc. devraient être mémoïsés avec `useMemo`.~~ ✅ Corrigé

---

## 🥖 EN TANT QUE BOULANGER

Je me lève à 4h du matin. Mon téléphone, c'est souvent mes doigts farinés qui tapotent un écran. Voilà ce que je ressens en utilisant BakeryOS.

**Ce qui me plaît vraiment**

L'onglet Matin est nickel — je vois mes produits, j'ajuste les quantités avec les boutons +/-, c'est rapide. Le snapshot 10h/14h, c'est une vraie bonne idée : je regarde l'étagère et je tape ce qu'il reste. Pas besoin de calculer. L'alerte "Mercredi — augmentez viennoiseries +15%" me parle. Le tableau de bord avec le taux d'invendu par produit, c'est exactement ce que je voulais savoir depuis des années.

**Ce qui me manque**

Je veux pouvoir modifier mon catalogue de produits directement dans l'app, sans passer par Airtable. Airtable, je ne sais pas ce que c'est. Pourquoi je paie un outil SaaS si je dois en apprendre un autre en parallèle ?

Je veux des **notifications push natives** sur mon téléphone quand le flash invendus se déclenche, pas juste une bannière sur le site.

Je veux que l'app me dise : "La semaine dernière tu as produit 80 baguettes le lundi, et tu en as vendu 68. Cette semaine, produis-en 72." Une **suggestion de production automatique basée sur l'historique réel**, pas juste "+15% mercredi" codé en dur.

Je veux un **mode multi-boulanger** : ma femme qui tient la caisse doit aussi pouvoir faire les snapshots depuis son téléphone, sans accéder à mes stats financières.

Il n'y a pas de **gestion des commandes click & collect côté boulanger** — je vois le nombre de commandes, mais pas qui a commandé quoi. Comment je prépare les commandes le matin ?

Pas de **gestion des recettes** (coûts réels, marge par produit) au-delà du simple `coutProduction` saisi manuellement.

Pas d'**export PDF de fin de semaine** pour mon comptable.

---

## 🛍️ EN TANT QUE CLIENT DE LA BOULANGERIE

Je passe devant L'Artisan Doré tous les matins. J'ai scanné le QR code sur la vitrine.

**Ce qui m'attire**

La page d'accueil est magnifique. Le loading screen avec l'épi de blé animé, c'est du beau travail. Les photos Unsplash donnent faim. Le Flash Invendus à 18h, c'est une idée que je trouve géniale — ça m'évite le gaspillage et je fais une bonne affaire.

**Ce qui me bloque pour commander**

Le système d'authentification par Magic Link Firebase est **cassé en l'état** — il n'y a pas de vrai domaine configuré, la fonction `sendSignInLinkToEmail` pointe vers `window.location.href` qui en dev sera `localhost`. En production sans configuration Firebase correcte, le bouton "Recevoir le lien" ne fait rien d'utile.

~~Quand j'ajoute au panier et clique "Confirmer la commande", j'ai un `alert()` JavaScript. En 2025, c'est rédhibitoire.~~ ✅ Corrigé — confirmation inline avec numéro de commande.

Il n'y a **aucune page de confirmation de commande**, aucun récapitulatif par email, aucun SMS. Je ne sais pas si ma commande est bien enregistrée.

Je ne vois pas les **horaires d'ouverture en temps réel** — est-ce que la boulangerie est ouverte maintenant ?

~~Le **Flash Invendus** utilise des `UNSOLD_IDS` hardcodés dans `click-collect.tsx`, pas les vrais stocks du boulanger.~~ ✅ Corrigé — données Airtable réelles via `useProducts()`.

---

## 💼 EN TANT QU'INVESTISSEUR

### Le marché

En France, il y a environ **33 000 boulangeries artisanales**. Le ticket moyen SaaS visé est 39-119€/mois. Le marché adressable total (TAM) en France seule est donc ~15-47M€/an. C'est réaliste et défendable.

Le problème des invendus est **réel et documenté** — 15 à 20% de perte est la norme. La réglementation anti-gaspillage (loi AGEC) pousse les artisans à agir. Le timing réglementaire est favorable.

### Ce qui me rassure

La landing page BakeryOS est professionnelle, le pricing est clair, l'intégration Stripe avec trial 14 jours est en place. L'architecture multi-tenant est pensée dès le départ (RLS Supabase par boulangerie). Il y a un vrai produit fonctionnel, pas juste une maquette.

### Ce qui m'inquiète

**Deux produits dans un repo, zéro cohérence.** Il y a une landing BakeryOS (`bakeryos.fr`) et une app boulanger (`L'Artisan Doré`) qui semblent être la même chose ou pas. Le positionnement n'est pas clair : est-ce un SaaS B2B vendu aux boulangers, ou une app B2C pour les clients d'une boulangerie spécifique ?

**Le go-to-market est absent.** Il n'y a aucune stratégie d'acquisition visible — pas de blog, pas de SEO technique, pas de partenariats avec les groupements de boulangers (Confédération Nationale de la Boulangerie).

**La différenciation est fragile.** Tiller, Lightspeed, Sunday, et des solutions comme Innovorder font déjà de la caisse + gestion pour boulangers. BakeryOS se différencie sur les invendus et le flash, mais rien n'empêche ces acteurs d'ajouter cette feature.

**Zéro traction prouvée.** Pas de beta users mentionnés, pas de métriques, pas de LOI (Letter of Intent). Le chiffre "4.9 / 47 avis" dans le schema.org de la landing est inventé.

---

## Notes sur 100

| Critère | Note | Commentaire |
|---|---|---|
| **Présentation** | 72/100 | Landing BakeryOS très propre, app boulanger soignée, mais incohérence visuelle entre les deux univers |
| **Service / Produit** | 58/100 | Le cœur (matin/snapshot/soir) est bien pensé, mais trop de features manquantes pour un usage réel |
| **Fonctionnalités** | 55/100 | Socle solide, mais catalogue editable, commandes détaillées, notifications push, multi-user absent |
| **SEO** | 40/100 | Metadata bien remplie, schema.org présent, mais tout est en JS client-side (CSR), Google ne voit rien |
| **Attractivité** | 70/100 | Design premium, concept différenciant, mais bugs bloquants côté client |

**Moyenne : 59/100**

---

## Estimation de réussite

**En toute objectivité : 35% de chances de succès commercial à 18 mois**, sous réserve de corriger les fondamentaux techniques et de trouver les premiers 20 clients payants dans les 3 mois.

Le projet a une vraie valeur, un vrai problème à résoudre, et un fondateur qui sait coder. C'est déjà beaucoup. Mais dans l'état actuel, il ne peut pas être vendu à un boulanger qui n'est pas le fondateur lui-même.

---

## Roadmap

### ✅ Corrigé (13 items)

**Auth & sécurité**
- `app/api/boulanger/profil/route.ts` → placé au bon endroit dans les API routes
- Middleware Next.js → `middleware.ts` protège `/boulanger/*` côté serveur (zéro flash de contenu)
- Bouton "Simuler la connexion" → supprimé de `login-form.tsx`
- Bouton "Simuler la connexion" dans `auth-modal.tsx` → visible uniquement si `NODE_ENV === 'development'`
- `@supabase/ssr` → installé et utilisé dans le middleware
- Refresh token Supabase → géré dans `boulanger-context.tsx` via `supabase.auth.setSession()`

**Données & intégrité**
- Webhook Stripe → colonnes `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`, `stripe_status` ajoutées dans `migration-2.sql`
- Colonnes chiffrées Airtable + fonctions `encrypt_text`/`decrypt_text` → dans `migration-2.sql`
- Proxy Airtable serveur → `app/api/boulanger/airtable/route.ts` créé (clé API jamais exposée au browser)
- `parametres.tsx` → `testConnection()` passe par le proxy `/api/boulanger/airtable` (PATCH), clé API vidée après sauvegarde

**UX & performance**
- `alert()` dans `cart-sidebar.tsx` → remplacé par `OrderConfirmation` animé avec numéro de commande
- `UNSOLD_IDS` hardcodés dans `click-collect.tsx` → remplacés par les données Airtable réelles via `useProducts()`
- Stats boulanger (`revenueToday`, `unsoldToday`, etc.) → mémoïsées avec `useMemo` dans `boulanger-context.tsx`

---

### 🔴 Avant la mise en ligne — Priorité haute

**Conflits CSS / layout** *(~2 jours)*
Deux `globals.css` et deux `layout.tsx` dans le même repo. Les styles de la landing BakeryOS (Cormorant Garamond, variables `--ink`, `--gold`) vont écraser ceux de l'app boulanger en production. Solution : déplacer la landing dans `/app/(landing)/` avec son propre `layout.tsx` isolé, ou séparer les deux en monorepo.

**Firebase ou Supabase — choisir** *(~1 jour)*
Firebase Auth (Magic Link client public) + Supabase Auth (boulanger) = deux systèmes d'auth incompatibles à maintenir. Si Firebase n'est pas configuré en production, le Magic Link est silencieusement cassé. Options : migrer le Magic Link sur Supabase Auth (`supabase.auth.signInWithOtp()`), ou documenter et configurer Firebase correctement avec les domaines autorisés.

**`/api/orders` manquant** *(~1 jour)*
La confirmation de commande dans `cart-sidebar.tsx` s'affiche correctement, mais l'ordre n'est pas sauvegardé en base. Il manque : la table `commandes` en Supabase, la route `POST /api/orders`, et l'envoi d'un email de confirmation (Resend, 3 000 emails/mois gratuits).

**Rate limiting sur `/api/boulanger/auth`** *(~2h)*
Aucune protection bruteforce. Implémenter un rate limiter simple avec `@upstash/ratelimit` ou un middleware maison basé sur l'IP (max 5 tentatives / 15 minutes).

**Validation zod sur les API routes** *(~1 jour)*
Les inputs `nom`, `slug`, `email`, `password` arrivent bruts dans les API routes. Ajouter un schéma zod sur chaque `POST`/`PATCH` avec messages d'erreur structurés.

---

### 🟡 Après la mise en ligne — Priorité moyenne

**SSR/SSG pour la landing** *(~2 jours)*
Toute la landing est en CSR — Google n'indexe rien. Passer les composants statiques en Server Components Next.js. Priorité : hero, savoir-faire, footer (pas de dépendance client).

**Faux avis schema.org** *(~1h)*
"4.9 / 47 avis" hardcodés dans le schema.org de la landing. À supprimer ou remplacer par des vrais avis (Google Business Profile, Trustpilot).

**`product-menu.tsx` orphelin** *(~30min)*
Le composant n'est importé nulle part. Soit l'intégrer dans une page, soit le supprimer.

**ErrorBoundary global** *(~2h)*
Pas de filet de sécurité — un crash React laisse un écran blanc sans message. Ajouter un `ErrorBoundary` au niveau de `layout.tsx`.

**FlashBanner connectée aux vrais stocks** *(~1 jour)*
`FlashBanner.tsx` utilise encore `BASKETS_TAKEN = 5` et `totalBaskets = 12` hardcodés. Connecter au polling `/api/products` ou à un WebSocket pour refléter le stock réel du boulanger.

---

### 🟢 Évolutions futures

- Multi-utilisateurs par boulangerie (vendeur vs propriétaire, sans accès aux stats financières)
- Catalogue éditable directement dans l'app (sans Airtable)
- Suggestions de production automatiques basées sur l'historique réel (régression linéaire par produit)
- Notifications push PWA lors du déclenchement du flash invendus
- Gestion des commandes click & collect côté boulanger (liste du jour, statuts)
- Export PDF hebdomadaire pour le comptable
- Multi-boulangerie — architecture tenant avec sous-domaines
- Intégration caisse (Lightspeed, Zelty API)
- Historique persistant sur plusieurs semaines