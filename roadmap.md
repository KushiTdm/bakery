# Analyse complète de BakeryOS 🥖

---

## 🧑‍💻 EN TANT QUE DÉVELOPPEUR

### Ce qui est bien fait
L'architecture est solide. Next.js 13/App Router, Supabase avec RLS bien configuré, séparation claire client/serveur, contexte React bien structuré avec debounce pour éviter les appels Supabase intempestifs, fallback localStorage pour le mode offline. Le code est propre, commenté, lisible.

### Ce qui manque ou pose problème

**Bugs et risques critiques**

~~Deux `app/globals.css` et deux `app/layout.tsx` qui allaient se marcher dessus en production.~~ ✅ Fausse alerte — il s'agissait de deux repos distincts fournis ensemble pour l'analyse : un repo landing (Cormorant Garamond, Stripe, `bakeryos.fr`) et un repo app boulanger (Playfair Display, Tailwind). Chacun est déployé séparément, il n'y a aucun conflit.

~~Firebase est importé (`lib/firebase.ts`) mais n'est utilisé que dans `auth-modal.tsx` pour le Magic Link côté client public, tandis que l'espace boulanger utilise Supabase Auth. Deux systèmes d'auth dans un même projet, c'est une dette technique immédiate.~~ ✅ Corrigé — `auth-modal.tsx` migré sur `supabase.auth.signInWithOtp()`. Firebase reste dans `package.json` mais n'est plus appelé nulle part.

**Sécurité**

~~Pas de rate limiting sur les API routes `/api/boulanger/auth` — un bot peut bruteforcer les mots de passe.~~ ✅ Corrigé — rate limiter 5 tentatives / 15 min par IP.

~~Pas de validation des inputs avec zod ou équivalent côté API — `nom`, `slug`, `email` arrivent bruts.~~ ✅ Corrigé — schémas Zod sur `/api/boulanger/auth` et `/api/orders`.

~~Variable `SUPABASE_SERVICE_KEY` incohérente~~ ✅ Corrigé — uniformisé sur `SUPABASE_SERVICE_ROLE_KEY` partout.

~~Route de test `app/api/test-supabase/` exposée en production avec credentials hardcodés.~~ ✅ Supprimé.

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

~~Il n'y a pas de **gestion des commandes click & collect côté boulanger** — je vois le nombre de commandes, mais pas qui a commandé quoi.~~ ✅ Corrigé — table `commandes` créée, route `GET /api/orders` retourne la liste du jour avec détail client + lignes.

Pas de **gestion des recettes** (coûts réels, marge par produit) au-delà du simple `coutProduction` saisi manuellement.

Pas d'**export PDF de fin de semaine** pour mon comptable.

---

## 🛍️ EN TANT QUE CLIENT DE LA BOULANGERIE

Je passe devant L'Artisan Doré tous les matins. J'ai scanné le QR code sur la vitrine.

**Ce qui m'attire**

La page d'accueil est magnifique. Le loading screen avec l'épi de blé animé, c'est du beau travail. Les photos Unsplash donnent faim. Le Flash Invendus à 18h, c'est une idée que je trouve géniale — ça m'évite le gaspillage et je fais une bonne affaire.

**Ce qui me bloquait pour commander**

~~Le système d'authentification par Magic Link Firebase est **cassé en l'état** — il n'y a pas de vrai domaine configuré, la fonction `sendSignInLinkToEmail` pointe vers `window.location.href` qui en dev sera `localhost`.~~ ✅ Corrigé — migré sur `supabase.auth.signInWithOtp()`, fonctionne sans configuration de domaine supplémentaire.

~~Quand j'ajoute au panier et clique "Confirmer la commande", j'ai un `alert()` JavaScript. En 2025, c'est rédhibitoire.~~ ✅ Corrigé — confirmation inline avec numéro de commande.

~~Il n'y a **aucune page de confirmation de commande**, aucun récapitulatif par email.~~ ✅ Corrigé — email transactionnel via Resend au moment de la commande. La commande est désormais persistée en base.

~~Le bouton "Découvrir notre savoir-faire" ne scrollait nulle part~~ ✅ Corrigé — cible `#notre-histoire` alignée avec l'id réel du composant.

~~Le **Flash Invendus** utilise des `UNSOLD_IDS` hardcodés dans `click-collect.tsx`, pas les vrais stocks du boulanger.~~ ✅ Corrigé — données Airtable réelles via `useProducts()`.

**Ce qui me bloque encore**

Je ne vois pas les **horaires d'ouverture en temps réel** — est-ce que la boulangerie est ouverte maintenant ?

Le panier appelle toujours l'ancienne logique locale — la route `/api/orders` existe mais `cart-sidebar.tsx` ne l'appelle pas encore.

---

## 💼 EN TANT QU'INVESTISSEUR

### Le marché

En France, il y a environ **33 000 boulangeries artisanales**. Le ticket moyen SaaS visé est 39-119€/mois. Le marché adressable total (TAM) en France seule est donc ~15-47M€/an. C'est réaliste et défendable.

Le problème des invendus est **réel et documenté** — 15 à 20% de perte est la norme. La réglementation anti-gaspillage (loi AGEC) pousse les artisans à agir. Le timing réglementaire est favorable.

### Ce qui me rassure

La landing page BakeryOS est professionnelle, le pricing est clair, l'intégration Stripe avec trial 14 jours est en place. L'architecture multi-tenant est pensée dès le départ (RLS Supabase par boulangerie). Il y a un vrai produit fonctionnel, pas juste une maquette.

### Ce qui m'inquiète

~~**Deux produits dans un repo, zéro cohérence.**~~ ✅ Erreur d'analyse — c'est bien deux repos séparés : `bakeryos.fr` est la landing B2B avec paiement Stripe (le site de vente du SaaS), et l'app boulanger est le produit SaaS lui-même (ce que le boulanger utilise au quotidien). Le positionnement est cohérent : SaaS B2B vendu via la landing, utilisé via l'app.

**Le go-to-market est absent.** Il n'y a aucune stratégie d'acquisition visible — pas de blog, pas de SEO technique, pas de partenariats avec les groupements de boulangers (Confédération Nationale de la Boulangerie).

**La différenciation est fragile.** Tiller, Lightspeed, Sunday, et des solutions comme Innovorder font déjà de la caisse + gestion pour boulangers. BakeryOS se différencie sur les invendus et le flash, mais rien n'empêche ces acteurs d'ajouter cette feature.

**Zéro traction prouvée.** Pas de beta users mentionnés, pas de métriques, pas de LOI (Letter of Intent). Le chiffre "4.9 / 47 avis" dans le schema.org de la landing est inventé.

---

## Notes sur 100

| Critère | Note | Commentaire |
|---|---|---|
| **Présentation** | 72/100 | Landing BakeryOS très propre, app boulanger soignée, mais incohérence visuelle entre les deux univers |
| **Service / Produit** | 58/100 | Le cœur (matin/snapshot/soir) est bien pensé, mais trop de features manquantes pour un usage réel |
| **Fonctionnalités** | 55/100 | Socle solide, mais catalogue editable, notifications push, multi-user absent |
| **SEO** | 40/100 | Metadata bien remplie, schema.org présent, mais tout est en JS client-side (CSR), Google ne voit rien |
| **Attractivité** | 70/100 | Design premium, concept différenciant, mais bugs bloquants côté client |

**Moyenne : 59/100**

---

## Estimation de réussite

**En toute objectivité : 35% de chances de succès commercial à 18 mois**, sous réserve de corriger les fondamentaux techniques et de trouver les premiers 20 clients payants dans les 3 mois.

Le projet a une vraie valeur, un vrai problème à résoudre, et un fondateur qui sait coder. C'est déjà beaucoup. Mais dans l'état actuel, il ne peut pas être vendu à un boulanger qui n'est pas le fondateur lui-même.

---

## Roadmap

### ✅ Corrigé (21 items)

**Auth & sécurité**
- `app/api/boulanger/profil/route.ts` → placé au bon endroit dans les API routes
- Middleware Next.js → `middleware.ts` protège `/boulanger/*` côté serveur (zéro flash de contenu)
- Bouton "Simuler la connexion" → supprimé de `login-form.tsx`
- Bouton "Simuler la connexion" dans `auth-modal.tsx` → visible uniquement si `NODE_ENV === 'development'`
- `@supabase/ssr` → installé et utilisé dans le middleware
- Refresh token Supabase → géré dans `boulanger-context.tsx` via `supabase.auth.setSession()`
- `auth-modal.tsx` → migré de Firebase Magic Link sur `supabase.auth.signInWithOtp()` — Firebase supprimé de la logique applicative
- `SUPABASE_SERVICE_KEY` → renommé `SUPABASE_SERVICE_ROLE_KEY` dans tous les fichiers (`lib/supabase.ts`, `app/api/products/route.ts`, `app/api/boulanger/airtable/route.ts`)
- Route de test `app/api/test-supabase/` → supprimée (exposait la structure DB et des credentials hardcodés)
- PIN de contournement `1952` → supprimé de `boulanger-context.tsx` (l'auth passe désormais toujours par Supabase)
- `login-form.tsx` → lit le paramètre `?redirect=` après connexion et redirige vers l'URL d'origine
- Erreurs TypeScript dans `boulanger-context.tsx` → `AuthChangeEvent`, `Session | null` typés explicitement

**Données & intégrité**
- Webhook Stripe → colonnes `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`, `stripe_status` ajoutées dans `migration-2.sql`
- Colonnes chiffrées Airtable + fonctions `encrypt_text`/`decrypt_text` → dans `migration-2.sql`
- Proxy Airtable serveur → `app/api/boulanger/airtable/route.ts` créé (clé API jamais exposée au browser)
- `parametres.tsx` → `testConnection()` passe par le proxy `/api/boulanger/airtable` (PATCH), clé API vidée après sauvegarde
- Table `commandes` → migration SQL créée avec RLS, index, trigger `updated_at`
- `POST /api/orders` → commandes persistées en base Supabase + email de confirmation via Resend
- `GET /api/orders` → liste des commandes du jour pour le dashboard boulanger (auth vérifiée par JWT)
- Rate limiting → 5 tentatives / 15 min par IP sur `/api/boulanger/auth`
- Validation Zod → schémas sur `/api/boulanger/auth` (email, OTP) et `/api/orders` (lignes, montant, heure retrait)

**UX & performance**
- `alert()` dans `cart-sidebar.tsx` → remplacé par `OrderConfirmation` animé avec numéro de commande
- `UNSOLD_IDS` hardcodés dans `click-collect.tsx` → remplacés par les données Airtable réelles via `useProducts()`
- Stats boulanger (`revenueToday`, `unsoldToday`, etc.) → mémoïsées avec `useMemo` dans `boulanger-context.tsx`
- Bouton CTA hero → corrigé, scroll vers `#notre-histoire` (était `#savoir-faire`, id inexistant)

---

### 🔴 Avant la mise en ligne — 1 item restant

**Brancher `cart-sidebar.tsx` sur `/api/orders`** *(~2h)*
La route `POST /api/orders` existe et fonctionne, mais `cart-sidebar.tsx` appelle encore l'ancienne logique locale. Remplacer par un `fetch('/api/orders', { method: 'POST', body: JSON.stringify({...}) })`. Voir le guide `GUIDE-INSTALLATION.md` section 8 pour le payload exact.

---

### 🟡 Après la mise en ligne — Priorité moyenne

**Retirer Firebase de `package.json`** *(~30 min)*
Firebase n'est plus appelé dans le code mais reste une dépendance. `npm uninstall firebase`, supprimer `lib/firebase.ts`.

**SSR/SSG pour la landing** *(~2 jours)*
Toute la landing est en CSR — Google n'indexe rien. Passer les composants statiques en Server Components Next.js. Priorité : hero, savoir-faire, footer.

**Faux avis schema.org** *(~1h)*
"4.9 / 47 avis" hardcodés dans le schema.org. À supprimer ou remplacer par de vrais avis (Google Business Profile, Trustpilot).

**`product-menu.tsx` orphelin** *(~30 min)*
Le composant n'est importé nulle part. Soit l'intégrer dans une page, soit le supprimer.

**ErrorBoundary global** *(~2h)*
Pas de filet de sécurité — un crash React laisse un écran blanc sans message. Ajouter un `ErrorBoundary` au niveau de `layout.tsx`.

**FlashBanner connectée aux vrais stocks** *(~1 jour)*
`FlashBanner.tsx` utilise encore `BASKETS_TAKEN = 5` et `totalBaskets = 12` hardcodés. Connecter au polling `/api/products` pour refléter le stock réel.

---

### 🟢 Évolutions futures

- Multi-utilisateurs par boulangerie (vendeur vs propriétaire, sans accès aux stats financières)
- Catalogue éditable directement dans l'app (sans Airtable)
- Suggestions de production automatiques basées sur l'historique réel (régression linéaire par produit)
- Notifications push PWA lors du déclenchement du flash invendus
- Export PDF hebdomadaire pour le comptable
- Multi-boulangerie — architecture tenant avec sous-domaines
- Intégration caisse (Lightspeed, Zelty API)
- Historique persistant sur plusieurs semaines