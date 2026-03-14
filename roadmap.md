# Roadmap BakeryOS 🥖
*Mise à jour — session courante*

---

## Notes sur 100

| Critère | Note | Commentaire |
|---|---|---|
| **Présentation** | 72/100 | Landing BakeryOS très propre, app boulanger soignée |
| **Service / Produit** | 67/100 | TypeScript propre, SW livré, push opérationnel, commandes fonctionnelles |
| **Fonctionnalités** | 64/100 | Commandes dashboard fixé, SSR landing, catalogue éditable absent |
| **SEO** | 58/100 | Landing en SSR, Server Components, faux avis supprimés |
| **Attractivité** | 70/100 | Design premium, concept différenciant |

**Moyenne : 66/100** *(+4 pts vs session précédente)*

---

## Estimation de réussite

**38-42% de chances de succès commercial à 18 mois**, sous réserve de trouver les premiers 20 clients payants dans les 3 mois et de livrer le catalogue éditable natif.

---

## ✅ Corrigé — toutes sessions confondues

- Double `app/globals.css` / `app/layout.tsx`
- Firebase → migré sur Supabase OTP
- Rate limiting sur `/api/boulanger/auth`
- Validation Zod sur les routes API
- `SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` uniformisé
- Route de test `app/api/test-supabase/` supprimée
- TypeScript TS7006/TS7031/TS2322 dans `auth-modal`, `boulanger-context`, `use-push-notifications`, `notifications/send/route`
- `useMemo` sur les stats boulanger (perf)
- `alert()` JavaScript → confirmation inline animée
- Email confirmation via Resend
- Bouton CTA hero
- Flash Invendus avec données Airtable réelles
- Gestion des commandes click & collect côté boulanger
- `cart-sidebar.tsx` branché sur `POST /api/orders`
- Push notifications — toggle + hook + Service Worker ✅
- Web App Manifest + SwRegister ✅
- Fix `/api/orders` — import lazy + vars manquantes ✅
- Fix slug boulangerie ✅
- **`commandes/page.tsx`** — boulangerie_id passé via `/api/boulanger/profil` ✅
- **Faux avis schema.org supprimés** — risque légal DGCCRF éliminé ✅
- **SSR/SSG landing** — `hero`, `savoir-faire`, `ingredients`, `footer` en Server Components ✅
- **`ActiveTabContext`** — état partagé proprement entre client islands ✅
- **`LandingClient`** — shell client qui reçoit les SC comme slots ReactNode ✅

---

## 🔴 BLOQUANT — À corriger avant toute acquisition client

### 1. Icônes PWA manquantes *(30 min)*
Le manifest référence `/public/icons/icon-*.png` — erreurs 404 en console, installation PWA impossible sur iOS/Android.

Générer sur https://realfavicongenerator.net
Tailles requises : `72, 96, 128, 144, 152, 192, 384, 512px` + `badge-72x72.png`
Déposer dans `/public/icons/`

### 2. Générer les clés VAPID *(5 min)*
Sans ces clés, les push notifications échouent silencieusement.

```bash
npx web-push generate-vapid-keys
# Ajouter dans .env.local :
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
```

### 3. `npm i --save-dev @types/web-push` + `npm uninstall firebase` *(5 min)*

```bash
npm i --save-dev @types/web-push  # élimine TS7016 dans notifications/send/route.ts
npm uninstall firebase             # +400kb inutiles depuis la migration Supabase OTP
```

---

## 🟡 Court terme — Dans les 30 jours

### 4. ErrorBoundary global *(2h)*
Un crash React donne un écran blanc sans message. Créer `app/error.tsx` :

```tsx
'use client';
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-white/50">Une erreur est survenue</p>
        <button onClick={reset} className="text-[#C19A6B] border border-[#C19A6B]/30 px-4 py-2 rounded-xl">
          Réessayer
        </button>
      </div>
    </div>
  );
}
```

### 5. Supprimer `product-menu.tsx` *(5 min)*
Dead code — importé nulle part.
```bash
rm components/product-menu.tsx
```

### 6. FlashBanner connectée aux vrais stocks *(1 jour)*
`BASKETS_TAKEN = 5` hardcodé dans `FlashBanner.tsx`.
Connecter via polling sur `/api/products` → champ `panierMystereCount` de `flashConfig`.

---

## 🟢 Moyen terme — 30-90 jours

### 7. Catalogue éditable natif *(5-8 jours)* — Blocker commercial
- Table `produits` dans Supabase avec RLS
- CRUD dans l'espace boulanger (ajouter / modifier / désactiver)
- Airtable devient optionnel
- **Sans ça, l'onboarding nécessite une formation**

### 8. Suggestions de production par régression simple *(3-5 jours)*
Remplacer le "+15% mercredi codé en dur" :
- Régression linéaire par produit × jour de semaine sur 30 jours
- Affichage dans `vue-matin.tsx` : *"Semaine dernière : 80 baguettes, 68 vendues. Suggestion : 72."*

### 9. Multi-utilisateurs par boulangerie *(5 jours)*
Table `boulangerie_users` avec rôles `owner` / `staff`.

### 10. Export PDF hebdomadaire *(2 jours)*
Rapport CA / invendus envoyé le lundi matin via Resend.

---

## 🔵 Long terme — 90+ jours

- **Multi-boulangerie** : architecture tenant avec sous-domaines
- **Intégration caisse** : Lightspeed API, Zelty, SumUp
- **Export comptable** : FEC simplifié, compatible Sage / EBP
- **Go-to-market** : Confédération Nationale de la Boulangerie, SEO longue traîne, referral