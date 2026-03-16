# Rapport d'analyse — BakeryOS

*Généré automatiquement le 16/03/2026*

---

## LÉGENDE DES NIVEAUX

| Niveau | Icône | Description |
|--------|-------|-------------|
| 🔴 **CRITIQUE** | 🔴 | Faille de sécurité ou bug bloquant — corriger immédiatement |
| 🟠 **ÉLEVÉ** | 🟠 | Problème important affectant la stabilité ou la sécurité |
| 🟡 **MOYEN** | 🟡 | Incohérence ou bug non bloquant mais à corriger |
| 🔵 **FAIBLE** | 🔵 | Problème mineur, optimisation ou amélioration suggérée |
| ⚪ **INFO** | ⚪ | Note informative, pas de correction requise |

---

## 🔴 SÉCURITÉ — PRIORITÉ 1

### S1. 🔴 CRITIQUE — Validation du slug côté register absente
**Fichier** : `app/api/boulanger/auth/route.ts` (ligne 79-86)

**Problème** : Le slug n'est pas validé avec `isValidSlug()` avant l'insertion en base. Un utilisateur pourrait injecter un slug malveillant ou utiliser un slug réservé (`api`, `admin`, `www`, etc.).

```typescript
// Actuel (vulnérable)
const { data: existing } = await admin
  .from('boulangeries')
  .select('id')
  .eq('slug', slug)
  .single();
```

**Correction** :
```typescript
import { isValidSlug } from '@/lib/sanitize';

// Ajouter avant la vérification d'existence
if (!isValidSlug(slug)) {
  return NextResponse.json(
    { error: 'Slug invalide ou réservé' },
    { status: 400 }
  );
}
```

---

### S2. 🔴 CRITIQUE — Absence de rate limiting sur l'authentification
**Fichier** : `app/api/boulanger/auth/route.ts`

**Problème** : Les endpoints de login/register n'ont aucun rate limiting applicatif. Même si Supabase a son propre rate limiting, une protection supplémentaire est recommandée contre les attaques brute-force.

**Correction suggérée** : Ajouter un rate limiting IP sur les tentatives de login (ex: 5 tentatives / 15 min).

---

### S3. 🟠 ÉLEVÉ — Fallback unsafe dans lib/supabase.ts
**Fichier** : `lib/supabase.ts` (ligne 15-19)

**Problème** : En l'absence de variables d'environnement, le client utilise des valeurs fallback (`http://localhost:54321`, `anon-key-missing`). En production, cela pourrait masquer une erreur de configuration.

```typescript
export const supabase = createClient(
  supabaseUrl  || 'http://localhost:54321',  // ⚠️ Fallback potentiellement problématique
  supabaseAnonKey || 'anon-key-missing',
  ...
);
```

**Correction** : En production, lever une erreur bloquante :
```typescript
if (process.env.NODE_ENV === 'production' && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Configuration Supabase manquante');
}
```

---

### S4. 🟠 ÉLEVÉ — Validation insuffisante du password côté register
**Fichier** : `app/api/boulanger/auth/route.ts` (ligne 72-76)

**Problème** : Seule la longueur minimale (8 caractères) est vérifiée. Pas de vérification de complexité.

**Correction suggérée** : Ajouter une validation de complexité (majuscule, minuscule, chiffre, caractère spécial).

---

### S5. 🟡 MOYEN — Secret interne faiblement validé
**Fichier** : `app/api/notifications/send/route.ts` (ligne 38-40)

**Problème** : Si `INTERNAL_API_SECRET` n'est pas défini, l'endpoint accepte toutes les requêtes.

```typescript
if (secret !== process.env.INTERNAL_API_SECRET && process.env.INTERNAL_API_SECRET) {
  // Si INTERNAL_API_SECRET est undefined, la condition est toujours false → accès autorisé
}
```

**Correction** :
```typescript
if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
  return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
}
```

---

## 🐛 BUGS — PRIORITÉ 2

### B1. 🟠 ÉLEVÉ — Casting `produit_id::UUID` potentiellement invalide
**Fichier** : `migrations/migration-complete-v1.sql` (ligne 380)

**Problème** : Dans `get_paniers_flash()`, le cast `sj.produit_id::UUID` peut échouer si `produit_id` contient une valeur non-UUID (anciennes données).

```sql
LEFT JOIN produits p
  ON p.id = sj.produit_id::UUID  -- ⚠️ Cast unsafe
```

**Correction** : Ajouter une validation ou utiliser une fonction de cast sécurisée.

---

### B2. 🟡 MOYEN — `client_telephone` non validé côté client
**Fichier** : `components/cart-sidebar.tsx`

**Problème** : Le téléphone client n'est pas collecté dans le formulaire de commande, pourtant le champ existe en base. Si un boulangerie a besoin du téléphone, le client ne peut pas le fournir.

**Note** : Ce n'est pas un bug technique mais une incohérence fonctionnelle.

---

### B3. 🟡 MOYEN — Double appel API lors du checkout
**Fichier** : `components/cart-sidebar.tsx` (ligne 127-152)

**Problème** : Si l'utilisateur soumet rapidement plusieurs fois, plusieurs commandes pourraient être créées (race condition).

**Correction** : Ajouter un état `isSubmitting` (déjà présent) et désactiver le boutton, mais aussi vérifier côté serveur qu'une commande similaire n'existe pas déjà.

---

### B4. 🔵 FAIBLE — Gestion d'erreur silencieuse dans cart-sidebar
**Fichier** : `components/cart-sidebar.tsx` (ligne 63-66)

**Problème** : Les erreurs de fetch pour les infos boulangerie sont ignorées silencieusement.

```typescript
.catch(() => {/* fail silently, utilise les valeurs par défaut */});
```

**Suggestion** : Logger l'erreur pour le debugging en développement.

---

### B5. 🔵 FAIBLE — TVA calculée mais pas envoyée
**Fichier** : `components/cart-sidebar.tsx` (ligne 185-186)

**Problème** : La TVA est calculée côté client pour l'affichage, mais n'est pas stockée en base avec la commande.

**Suggestion** : Envisager de stocker le montant HT et TVA dans la table `commandes`.

---

## ⚠️ INCOHÉRENCES — PRIORITÉ 3

### I1. 🟡 MOYEN — Middleware quasi-vide
**Fichier** : `middleware.ts`

**Problème** : Le middleware ne fait rien d'utile. Il laisse passer toutes les requêtes sans vérification réelle.

```typescript
// Commentaire du code :
// Laisse passer /boulanger et /boulanger/xxx
// La vérification auth est dans BoulangerProvider / BoulangerContext
```

**Question** : Pourquoi avoir un middleware qui ne middleware rien ? Soit supprimer ce fichier, soit y implémenter une vraie logique de protection.

---

### I2. 🟡 MOYEN — Types dupliqués entre context et API
**Fichiers** : 
- `context/boulanger-context.tsx` → `StockEntry`
- `app/api/boulanger/journee/route.ts` → importe `StockEntry` depuis le context

**Problème** : Un type défini dans un fichier client (`context/`) est importé dans un fichier serveur (`app/api/`). Cela peut causer des problèmes de bundling.

**Correction** : Déplacer les types partagés dans `lib/types.ts` ou `types/`.

---

### I3. 🔵 FAIBLE — Plan Starter limité à 20 produits mais count uniquement sur `actif_catalogue=true`
**Fichier** : `app/api/boulanger/produits/route.ts` (ligne 144-148)

**Problème** : Le comptage pour la limite du plan Starter ne compte que les produits actifs. Un utilisateur pourrait contourner la limite en désactivant des produits.

```typescript
const { count } = await admin
  .from('produits')
  .select('*', { count: 'exact', head: true })
  .eq('boulangerie_id', boulangerieId)
  .eq('actif_catalogue', true);  // Uniquement les actifs
```

**Question** : Est-ce intentionnel ? Sinon, retirer le filtre `actif_catalogue`.

---

### I4. 🔵 FAIBLE — Colonnes `adresse`, `ville`, `code_postal`, `telephone` absentes de la migration initiale
**Fichier** : `migrations/migration-complete-v1.sql`

**Problème** : Ces colonnes sont utilisées dans le code mais ne sont pas définies dans le `CREATE TABLE boulangeries`. Elles sont ajoutées plus tard via des `ALTER TABLE IF NOT EXISTS` implicites dans les policies, mais pas dans la structure de table.

**Correction** : Ajouter les colonnes manquantes dans le `CREATE TABLE` initial :
```sql
adresse       TEXT,
ville         TEXT,
code_postal   TEXT,
telephone     TEXT,
```

---

### I5. 🔵 FAIBLE — ESLint ignoré pendant le build
**Fichier** : `next.config.js` (ligne 4)

```javascript
eslint: { ignoreDuringBuilds: true },
```

**Problème** : Les erreurs ESLint sont ignorées lors du build, ce qui peut masquer des problèmes.

---

## 📝 FAUTES DE GRAMMAIRE/ORTHOGRAPHE — PRIORITÉ 4

### G1. 🔵 FAIBLE — Messages d'erreur en français incohérents
**Fichier** : `app/api/orders/route.ts`

- Ligne 87 : `'Trop de tentatives. Réessayez dans une heure.'` ✓
- Ligne 121 : `"Limite de commandes atteinte pour aujourd'hui..."` ✓

**Note** : Les messages sont cohérents, aucun problème détecté.

---

### G2. 🔵 FAIBLE — Commentaire en anglais dans fichier français
**Fichier** : `app/api/boulanger/produits/route.ts` (ligne 277)

```typescript
// Invalide le catalogue côté client
revalidatePath('/');
```

**Suggestion** : Harmoniser les commentaires en français.

---

## 🎯 ERREURS STRATÉGIQUES — PRIORITÉ 5

### E1. 🟡 MOYEN — Pas de pagination sur l'historique
**Fichier** : `app/api/boulanger/historique/route.ts` (non analysé mais inféré)

**Problème** : Si beaucoup de journées sont enregistrées, le chargement de l'historique devient lent.

**Suggestion** : Implémenter une pagination (cursor-based) ou limiter côté serveur.

---

### E2. 🟡 MOYEN — Pas de soft delete pour les produits
**Fichier** : `app/api/boulanger/produits/route.ts` (DELETE)

**Problème** : Les produits sont supprimés définitivement. Si un produit est référencé dans une commande historique, cela peut causer des problèmes d'intégrité.

**Suggestion** : Implémenter un soft delete (colonne `deleted_at`) ou archiver les produits.

---

### E3. 🔵 FAIBLE — Images externes Unsplash utilisées comme fallback
**Fichier** : `app/api/catalogue/[slug]/route.ts` (ligne 21-26)

```typescript
const imageDefaults: Record<string, string> = {
  boulangerie:  'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
  ...
};
```

**Problème** : Dépendance à un service externe pour les images par défaut. Si Unsplash est indisponible ou supprime l'image, l'affichage sera cassé.

**Suggestion** : Héberger les images par défaut dans `/public/images/`.

---

### E4. 🔵 FAIBLE — Pas de validation du format d'heure `heure_retrait`
**Fichier** : `app/api/orders/route.ts`

**Problème** : Le format est validé (`^\d{2}:\d{2}$`) mais pas la cohérence avec les créneaux configurés par la boulangerie.

**Suggestion** : Vérifier que l'heure de retrait fait partie des créneaux disponibles.

---

## 📊 RÉSUMÉ

| Catégorie | 🔴 Critique | 🟠 Élevé | 🟡 Moyen | 🔵 Faible | ⚪ Info |
|-----------|-------------|----------|----------|-----------|---------|
| Sécurité  | 1 | 2 | 1 | 0 | 0 |
| Bugs      | 0 | 1 | 2 | 2 | 0 |
| Incohérences | 0 | 0 | 2 | 3 | 0 |
| Grammaire | 0 | 0 | 0 | 2 | 0 |
| Stratégique | 0 | 0 | 2 | 2 | 0 |
| **TOTAL** | **1** | **3** | **7** | **9** | **0** |

---

## 🔧 ACTIONS PRIORITAIRES

1. **[URGENT]** Ajouter `isValidSlug()` dans `app/api/boulanger/auth/route.ts`
2. **[URGENT]** Corriger la validation du secret dans `app/api/notifications/send/route.ts`
3. **[IMPORTANT]** Implémenter un rate limiting sur l'authentification
4. **[IMPORTANT]** Déplacer les types partagés hors du context client
5. **[MOYEN]** Supprimer ou implémenter le middleware

---

*Analyse générée par Cline — 16/03/2026*