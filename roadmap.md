# Analyse complète de BakeryOS 🥖

---

## 🧑‍💻 EN TANT QUE DÉVELOPPEUR

### Ce qui est bien fait
L'architecture est solide. Next.js 13/App Router, Supabase avec RLS bien configuré, séparation claire client/serveur, contexte React bien structuré avec debounce pour éviter les appels Supabase intempestifs, fallback localStorage pour le mode offline. Le code est propre, commenté, lisible.

### Ce qui manque ou pose problème

**Bugs et risques critiques**

Il y a deux `app/globals.css` et deux `app/layout.tsx` — l'un pour la landing BakeryOS (Cormorant Garamond, variables CSS `--ink`, `--gold`) et l'autre pour l'app boulanger (Playfair Display, Tailwind). Ces deux mondes coexistent dans le même repo sans séparation claire de routes. C'est une bombe à retardement : les styles vont se marcher dessus en production.

`app/boulanger/profil/route.ts` est dans le mauvais dossier — il devrait être dans `app/api/boulanger/profil/route.ts`. Tel quel, Next.js va l'ignorer ou planter.

Le client Supabase retourne `null as any` si les variables d'env sont absentes — les erreurs downstream seront silencieuses et très difficiles à debugger.

Firebase est importé (`lib/firebase.ts`) mais n'est utilisé que dans `auth-modal.tsx` pour le Magic Link côté client public, tandis que l'espace boulanger utilise Supabase Auth. Deux systèmes d'auth dans un même projet, c'est une dette technique immédiate.

**Sécurité**

Les clés Airtable sont testées directement depuis le navigateur dans `parametres.tsx` — une requête Airtable en fetch côté client expose la clé dans les DevTools. Il faut proxifier ça côté serveur.

Pas de rate limiting sur les API routes `/api/boulanger/auth` — un bot peut bruteforcer les mots de passe.

Pas de validation des inputs avec zod ou équivalent côté API — `nom`, `slug`, `email` arrivent bruts.

**Manques fonctionnels**

- Pas de refresh token Supabase géré — session expire après 1h sans rechargement
- Pas de middleware Next.js pour protéger `/boulanger/*` côté serveur
- Pas de tests (unit, e2e) — zéro
- Pas de gestion d'erreur globale (ErrorBoundary)
- Le webhook Stripe référence des colonnes (`stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`) qui n'existent pas dans la migration SQL fournie
- Pas de migration pour les colonnes chiffrées Airtable (`airtable_api_key_enc`, `airtable_base_id_enc`) ni pour la fonction `encrypt_text`
- `pin-auth.tsx` existe mais n'est jamais utilisé dans l'app shell
- `product-menu.tsx` existe mais n'est jamais importé dans les pages

**Performance**

Le contexte boulanger recalcule tout à chaque render. `revenueToday`, `unsoldToday` etc. devraient être mémoïsés avec `useMemo`.

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

Le bouton "Simuler la connexion (dev uniquement)" est **visible en production** — c'est une faille.

Quand j'ajoute au panier et clique "Confirmer la commande", j'ai un `alert()` JavaScript. En 2025, c'est rédhibitoire.

Il n'y a **aucune page de confirmation de commande**, aucun récapitulatif par email, aucun SMS. Je ne sais pas si ma commande est bien enregistrée.

Je ne vois pas les **horaires d'ouverture en temps réel** — est-ce que la boulangerie est ouverte maintenant ?

Le **Flash Invendus** ne fonctionne qu'entre 18h et 20h — mais le composant `FlashBanner` utilise `UNSOLD_IDS` hardcodés dans `click-collect.tsx`, pas les vrais stocks du boulanger. Donc même si le boulanger a tout vendu, les "invendus" affichés sont faux.

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

### Avant la mise en ligne (4-6 semaines)

**Semaine 1-2 — Stabilisation critique**
- Séparer proprement les deux apps (dossiers `/apps/landing` et `/apps/boulanger`) ou au minimum résoudre les conflits CSS/layout
- Déplacer `profil/route.ts` au bon endroit
- Supprimer Firebase ou l'isoler — choisir un seul système d'auth
- Ajouter le middleware Next.js pour protéger `/boulanger`
- Corriger le webhook Stripe (ajouter les colonnes manquantes en migration)
- Supprimer le bouton "Simuler la connexion" en production
- Proxifier les appels Airtable depuis `parametres.tsx`

**Semaine 3 — Fonctionnel minimal viable**
- Remplacer le `alert()` de commande par une vraie page de confirmation
- Connecter les vrais stocks du boulanger au Flash côté client (supprimer les `UNSOLD_IDS` hardcodés)
- Ajouter la gestion basique du catalogue produits sans Airtable (CRUD simple en Supabase)
- Ajouter le refresh token Supabase

**Semaine 4 — Qualité et SEO**
- Passer la landing en SSR/SSG (Next.js `generateStaticParams` ou simple `page.tsx` server component)
- Ajouter zod sur toutes les API routes
- Rate limiting sur `/api/boulanger/auth`
- Vraies métadonnées dynamiques par boulangerie (`/[slug]`)
- Supprimer les faux avis du schema.org

### Après la mise en ligne (3-6 mois)

**Mois 1 — Acquisition**
- Trouver 5 boulangers beta gratuitement (LinkedIn, groupes Facebook boulangers, marché local)
- Mettre en place un onboarding guidé (checklist 5 étapes)
- Blog SEO : "comment réduire les invendus en boulangerie", "gestion des stocks boulangerie artisanale"

**Mois 2-3 — Rétention**
- Notifications push PWA pour le flash invendus
- Suggestion de production automatique basée sur l'historique (régression linéaire simple)
- Catalogue éditable directement dans l'app (sans Airtable)
- Gestion des commandes click & collect (liste des commandes du jour pour le boulanger)
- Export PDF hebdomadaire

**Mois 4-6 — Croissance**
- Multi-utilisateurs par boulangerie (vendeur vs propriétaire)
- Intégration caisse (Lightspeed, Zelty API)
- Application mobile native (React Native ou PWA installable)
- Tableau de bord revendeur pour les grossistes ou groupements
- Premier partenariat avec une école de boulangerie (CAP Boulanger) pour la distribution