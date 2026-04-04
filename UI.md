# UI.md — Plan de Redesign UX/UI Sauve Mie (Espace Boulanger)

> Ce fichier est le plan directeur du redesign. Il est consulté et mis à jour à chaque étape.
> Objectif : simplifier l'expérience pour un boulanger très occupé, sans retirer de fonctionnalités.

---

## Principes directeurs

1. **"Un écran, une action"** — Le boulanger doit savoir quoi faire en < 2 secondes
2. **Workflow séquentiel, pas spatial** — Les étapes forment un parcours temporel, pas des "lieux"
3. **Tactile avant tout** — Mains enfarinées, écran petit, lumière variable
4. **Moins d'éléments = plus de clarté** — Chaque pixel doit mériter sa place
5. **Conserver toutes les fonctionnalités** — On simplifie la surface, pas le moteur

---

## Architecture actuelle (avant)

```
Bottom nav : [Accueil] [Matin] [Stock] [Soir] [Flash] [Plus...]
                                                         ├─ Rapport IA
                                                         ├─ Supervision
                                                         ├─ Commandes
                                                         ├─ Produits
                                                         ├─ Statistiques
                                                         ├─ Équipe
                                                         └─ Paramètres
= 12 destinations, 6 onglets visibles
```

### Problèmes identifiés
- Accueil surchargé (12+ éléments : timer, progress bar, 4 étapes, CTA, 3 KPIs, alertes, 4 accès rapides)
- Navigation redondante (workflow dans l'accueil ET dans la bottom nav)
- Étapes traitées comme des espaces indépendants (vs parcours séquentiel)
- Écrans de saisie trop similaires sans différenciation visuelle
- Noms de produits tronqués sur Stock/Soir

---

## Architecture cible (après)

```
Bottom nav : [Accueil] [Ma Journée] [Menu ☰]
                           │              ├─ QUOTIDIEN
                           │              │   ├─ Rapport IA
                           │              │   └─ Commandes
                           │              ├─ GESTION
                           │              │   ├─ Catalogue
                           │              │   └─ Statistiques
                           │              └─ ADMINISTRATION
                           │                  ├─ Équipe
                           │                  ├─ Supervision
                           │                  └─ Paramètres
                           │
                           └─ Stepper horizontal swipeable
                              [✓ Matin] [● Stock] [ Flash] [ Soir]
                              Contenu de l'étape active en dessous
```

= 3 onglets visibles, 0 redondance, workflow intégré

---

## Phases d'implémentation

### Phase 1 — Refonte Navigation (Bottom Bar)
**Fichier principal** : `app/boulanger/page.tsx`

**Avant** : 5 onglets + bouton Plus (6 éléments)
**Après** : 3 onglets — Accueil, Ma Journée, Menu

#### Modifications :
1. **`ALL_NAV_ITEMS`** (ligne ~527) : Réduire à 3 items :
   - `accueil` (Home) — inchangé
   - `journee` (CalendarDays) — NOUVEAU, remplace matin/stock/soir/flash
   - Plus/Menu (MoreHorizontal) — garde le drawer

2. **`LocalView`** : Ajouter `'journee'` au type union

3. **`SECONDARY_VIEWS`** : Déplacer `matin`, `snapshot`, `soir`, `flash` hors de la nav directe

4. **Bottom nav render** : Simplifier le grid de `navItems.length + 1` à 3 colonnes fixes

5. **Permissions** : `journee` visible pour tous les rôles (le contenu interne gère les permissions)

#### Contraintes :
- Le drawer Plus continue de fonctionner pour les vues secondaires
- Le WorkflowGuard reste actif à l'intérieur de la vue Journée
- L'employe ne voit que Stock dans le stepper (matin/soir masqués par permissions)

---

### Phase 2 — Refonte Accueil
**Fichier principal** : `app/boulanger/page.tsx` (composant `VueAccueil`)

**Avant** : Timer + barre progression + 4 étapes + CTA + 3 KPI cards + alertes + 4 accès rapides
**Après** : Carte hero unique + workflow dots + KPI inline + alertes

#### Modifications :
1. **Supprimer** le composant `DayCountdown` de l'accueil (il migre dans Ma Journée)
2. **Carte hero "À faire maintenant"** : 
   - Grande carte prominente avec icône, label de l'étape, bouton CTA
   - Navigue vers `journee` (pas directement vers l'étape)
3. **Workflow dots** : Ligne horizontale de 4-5 points :
   - Vert = complété, Doré/pulsant = actif, Gris = à venir, Gris + cadenas = verrouillé
   - Compact : une seule ligne, ~40px de haut
4. **KPI inline** : Une seule ligne `447€ · 189 pcs · 0% invendu` au lieu de 3 cartes
5. **Conserver** : Alerte commandes en attente (actionnable), alerte stock
6. **Supprimer** : Les 4 boutons "Accès rapides" (redondants avec le Menu)
7. **Supprimer** : Le countdown timer (faible valeur — le boulanger sait quelle heure il est)

---

### Phase 3 — Vue "Ma Journée" (Stepper)
**Nouveau composant** : `components/boulanger/vue-journee.tsx`

C'est le coeur du redesign. Un seul écran qui contient les 4 étapes du workflow.

#### Structure :
```
┌─────────────────────────────────────────────┐
│  Stepper horizontal                         │
│  [✓ Matin] ─── [● Stock] ─── [ Flash] ─── [ Soir]  │
├─────────────────────────────────────────────┤
│                                             │
│  Contenu de l'étape sélectionnée            │
│  (VueMatin / VueSnapshot / VueFlash / VueSoir)      │
│                                             │
└─────────────────────────────────────────────┘
```

#### Comportement :
- **Stepper fixe en haut** (sticky sous le header)
- **Tap sur une étape** = naviguer vers cette étape (si déverrouillée)
- **Swipe gauche/droite** = naviguer entre étapes adjacentes (si déverrouillées)
- **Étapes verrouillées** = grisées + icône cadenas, tap montre le message de blocage
- **Étape active** = bordure dorée, icône animée (pulse)
- **Étape complétée** = check vert, tap permet quand même d'y revenir

#### Logique interne :
- State local `activeStep` initialisé à `currentSuggestedStep` du workflow
- Le WorkflowGuard est intégré directement (pas d'overlay, juste le stepper qui bloque)
- Permissions du rôle employé : ne montre que les étapes auxquelles il a accès

#### Fichiers impactés :
- `app/boulanger/page.tsx` — import VueJournee, render quand `localView === 'journee'`
- Nouveau `components/boulanger/vue-journee.tsx`
- `lib/types.ts` — ajouter `'journee'` si nécessaire au ViewType

---

### Phase 4 — Restructuration Menu Plus
**Fichier** : `app/boulanger/page.tsx` (composant `PlusDrawer`)

**Avant** : Liste plate de 7 items
**Après** : Groupé par fréquence d'usage

#### Groupes :
```
QUOTIDIEN
  ✨ Rapport IA Levain
  📦 Commandes (badge si en attente)

GESTION
  📋 Catalogue produits
  📊 Statistiques

ADMINISTRATION
  👥 Équipe
  🛡 Supervision (owner/gérant only)
  ⚙ Paramètres
```

#### Modifications :
- Ajouter des séparateurs avec labels de section
- Réduire la taille des items (moins de padding, icônes plus petites)
- Badge commandes en attente sur l'item Commandes

---

### Phase 5 — Améliorations visuelles globales
**Fichiers** : Multiples composants

1. **Tailles minimum** :
   - Texte KPI : minimum 12px (actuellement 10px par endroits)
   - Boutons +/- : minimum 48x48px pour les doigts enfarinés
   - Icônes : minimum 18px dans les cards

2. **Code couleur par étape** :
   - Matin : doré chaud `#C19A6B`
   - Stock : vert sauge `#5CC994`
   - Flash : orange énergie `#EAC43A`
   - Soir : bleu nuit `#6FA8EA`

3. **Noms produits** : Ne jamais tronquer — 2 lignes si nécessaire

4. **Bordures** : Solides pour éléments actifs, dashed uniquement pour "à venir"

---

## Ordre d'exécution

| # | Phase | Impact | Risque | Fichiers |
|---|-------|--------|--------|----------|
| 1 | Navigation 3 onglets | -50% bruit nav | Faible | page.tsx |
| 2 | Accueil simplifié | -70% éléments | Faible | page.tsx |
| 3 | Vue Ma Journée + stepper | Coeur du redesign | Moyen | page.tsx + nouveau composant |
| 4 | Menu restructuré | Clarté secondaire | Faible | page.tsx |
| 5 | Polish visuel | Finition | Faible | Multiples |

---

## Contraintes techniques

- **SPA** : Tout est dans `app/boulanger/page.tsx` avec un state `localView`
- **Pas de routing Next.js** pour les sous-vues (sauf `/boulanger/commandes`)
- **Framer Motion** pour toutes les animations
- **Permissions RBAC** : chaque vue vérifie `canRead()` avant de rendre
- **WorkflowGuard** : doit rester fonctionnel même avec la nouvelle architecture
- **PWA** : ne pas casser le service worker ou le manifest

## Notes d'implémentation

- Chaque phase est un commit séparé pour faciliter le rollback
- Tester sur viewport 375px (iPhone SE) comme taille minimum
- Les composants existants (VueMatin, VueSnapshot, VueFlash, VueSoir) ne changent PAS en interne
- Seule leur "enveloppe" de navigation change

---

## Journal des modifications

| Date | Phase | Changement | Status |
|------|-------|-----------|--------|
| — | — | Plan initial rédigé | ✅ |
| 04/04 | Phase 1 | Bottom nav réduite à 3 onglets (Accueil, Ma Journée, Menu). VueJournee inline avec stepper horizontal + code couleur par étape. StepLockedMessage remplace WorkflowGuard overlay. | ✅ |
| 04/04 | Phase 1 | Note : VueJournee est inline dans page.tsx pour l'instant, sera extraite en composant séparé en Phase 3 | ℹ️ |
| 04/04 | Phase 2 | Accueil simplifié : DayCountdown supprimé, accès rapides supprimés, 3 KPI cards remplacées par 1 ligne inline, carte hero pointe vers journee, workflow dots compacts avec code couleur par étape | ✅ |
