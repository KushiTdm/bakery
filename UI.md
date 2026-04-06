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

### Phase 1 — Refonte Navigation (Bottom Bar) ✅
**Fichier principal** : `app/boulanger/page.tsx`

**Avant** : 5 onglets + bouton Plus (6 éléments)
**Après** : 3 onglets — Accueil, Ma Journée, Menu

#### Modifications :
1. **`ALL_NAV_ITEMS`** : Réduit à 2 items nav + 1 bouton Menu
2. **`LocalView`** : `'journee'` ajouté au type union
3. **`SECONDARY_VIEWS`** : `matin`, `snapshot`, `soir`, `flash` hors de la nav directe
4. **Bottom nav render** : Grid fixe 3 colonnes
5. **Permissions** : `journee` visible pour tous les rôles

---

### Phase 2 — Refonte Accueil ✅
**Fichier principal** : `app/boulanger/page.tsx` (composant `VueAccueil`)

**Avant** : Timer + barre progression + 4 étapes + CTA + 3 KPI cards + alertes + 4 accès rapides
**Après** : Carte hero unique + workflow dots + KPI inline + alertes

#### Modifications :
1. `DayCountdown` supprimé de l'accueil
2. Carte hero "À faire maintenant" pointant vers `journee`
3. Workflow dots compacts (une ligne ~40px) avec code couleur par étape
4. KPI inline (une ligne) au lieu de 3 cartes
5. Accès rapides supprimés (redondants avec le Menu)
6. Countdown timer supprimé

---

### Phase 3 — Vue "Ma Journée" (Stepper) ✅
**Fichier** : `components/boulanger/vue-journee.tsx`

#### Modifications v2 (04/04) :
1. **Fix TypeScript** : prop `onNavigateStep?: (step: WorkflowStepId) => void` ajoutée à l'interface, appelée dans `navigateToStep` et `handleDragEnd`
2. **Touch targets** : boutons stepper portés à `minHeight: 52px` (was ~32px)
3. **Indicateur ligne active** : barre animée colorée en bas de l'onglet sélectionné (style tabs iOS)
4. **Glow icône active** : `boxShadow` coloré sur l'icône de l'étape en cours
5. **Labels uppercase** : `tracking-wide uppercase` pour meilleure lisibilité en petite taille
6. **Pulse repositionné** : indicateur "maintenant" en coin haut-droit, moins intrusif
7. **Bandeau contextuel** (nouveau) : bande colorée entre le stepper et le contenu montrant le nom complet de l'étape + badge statut (`En cours` / `Terminé` / `Disponible` / `Verrouillé`), animée à chaque changement d'étape

---

### Phase 4 — Restructuration Menu Plus ✅
**Fichier** : `app/boulanger/page.tsx` (composant `PlusDrawer`)

**Avant** : Liste plate de 7 items + séparateur ad hoc
**Après** : 3 groupes avec labels de section

#### Modifications (04/04) :
1. **Groupes** : QUOTIDIEN (Rapport IA + Commandes) / GESTION (Catalogue + Stats) / ADMINISTRATION (Équipe + Supervision + Paramètres)
2. **Composant `DrawerItemButton`** extrait : évite la répétition, maintient la cohérence visuelle
3. **Composant `SectionLabel`** : label de section `9px uppercase tracking-widest`
4. **Items compactés** : padding réduit `py-3` (was `py-3.5`), icônes `w-9 h-9` (was `w-10 h-10`)
5. **Supervision** intégrée dans le groupe Administration (n'est plus hors-groupe)
6. **Helper `navigate()`** : fonction locale dans PlusDrawer pour éviter le `if href / if view` dupliqué

---

### Phase 5 — Améliorations visuelles globales ✅
**Fichiers** : `vue-snapshot.tsx`, `vue-soir.tsx`, `vue-matin.tsx`, `boulanger-context.tsx`

#### Modifications (04/04) :

1. **Noms produits** : `truncate` → `line-clamp-2` dans `vue-snapshot.tsx` et `vue-soir.tsx`
   - Les noms longs (ex: "Chausson aux Pommes Caramélisées") s'affichent maintenant sur 2 lignes max
   - `vue-matin.tsx` n'avait pas de truncate (déjà `leading-tight`)

2. **Tailles texte KPI** : `text-[10px]` → `text-xs` (12px) sur les labels de référence importants
   - `vue-snapshot.tsx` : label référence produit/reste (ref, vendus, réservés C&C)
   - `vue-soir.tsx` : référence snapshot + sous-texte KPI cards
   - `vue-matin.tsx` : label "CA estimé"

3. **Boutons +/-** : déjà `w-12 h-12` (48×48px) dans les 3 vues ✓ (aucun changement nécessaire)

4. **Code couleur par étape** (déjà implémenté Phase 3) :
   - Matin : doré chaud `#C19A6B`
   - Stock : vert sauge `#5CC994`
   - Flash : orange énergie `#EAC43A`
   - Soir : bleu nuit `#6FA8EA`

5. **Bordures** : Solides pour éléments actifs, dashed uniquement pour "à venir" ✓

#### Bug fix — Production matin incomplète :
- **Symptôme** : seules les pâtisseries s'affichaient dans la vue Matin
- **Cause** : la clôture soir (roll-over) crée une journée J+1 avec uniquement les produits reportés (conservation > 1 jour). `loadTodayData` trouvait cette journée partielle et n'allait pas chercher les autres produits.
- **Fix** : dans `boulanger-context.tsx`, après chargement des stocks de la journée, on fetch aussi `/api/boulanger/produits` et on merge les produits absents avec `production: 0`

---

## Ordre d'exécution

| # | Phase | Impact | Risque | Fichiers | Status |
|---|-------|--------|--------|----------|--------|
| 1 | Navigation 3 onglets | -50% bruit nav | Faible | page.tsx | ✅ |
| 2 | Accueil simplifié | -70% éléments | Faible | page.tsx | ✅ |
| 3 | Vue Ma Journée + stepper | Coeur du redesign | Moyen | vue-journee.tsx | ✅ |
| 4 | Menu restructuré | Clarté secondaire | Faible | page.tsx | ✅ |
| 5 | Polish visuel | Finition | Faible | Multiples | ✅ |

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
| 04/04 | Phase 1 | Note : VueJournee extraite en composant séparé `components/boulanger/vue-journee.tsx` | ℹ️ |
| 04/04 | Phase 2 | Accueil simplifié : DayCountdown supprimé, accès rapides supprimés, 3 KPI cards remplacées par 1 ligne inline, carte hero pointe vers journee, workflow dots compacts avec code couleur par étape | ✅ |
| 04/04 | Phase 3 | vue-journee.tsx : prop onNavigateStep ajoutée (fix TS), touch targets 52px, indicateur ligne active (tabs iOS), glow icône, labels uppercase, pulse repositionné, bandeau contextuel avec badge statut | ✅ |
| 04/04 | Phase 4 | PlusDrawer restructuré : groupes QUOTIDIEN/GESTION/ADMINISTRATION, composants DrawerItemButton + SectionLabel extraits, items compactés (py-3, w-9), Supervision intégrée dans Administration | ✅ |
| 04/04 | Review | Nettoyage dead code : `snapshot10hFait` retiré de VueAccueil, `checkIsOwner` import supprimé, `MoreHorizontal` import supprimé. IA + Supervision unifiés via DrawerItemButton + activeColor. | ✅ |
| 04/04 | Phase 5 | Noms produits : `truncate` → `line-clamp-2` (snapshot + soir). Textes KPI : `text-[10px]` → `text-xs` sur labels référence (snapshot, soir, matin). Boutons +/- déjà 48px ✓ | ✅ |
| 04/04 | Bug fix | Production matin incomplète après roll-over : merge des produits catalogue manquants dans `loadTodayData()` (`boulanger-context.tsx`) | ✅ |

---

## Pistes futures (post Phase 5)

- Couleur de teinte légère sur le fond `main` selon `localView` actif (accueil vs journée)
- Micro-animations de transition entre les catégories dans vue-matin
- Haptic feedback sur les boutons +/- (navigator.vibrate si supporté)