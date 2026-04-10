# Rapport de Sécurité — Sauve Mie
**Date** : 10 avril 2026  
**Périmètre** : API Next.js + Supabase (multi-tenant SaaS boulangerie)  
**Tests générés** : 6 fichiers spec, ~80 cas de test

---

## Résumé exécutif

L'analyse du code source de Sauve Mie révèle **5 vulnérabilités actives** dont 2 critiques et 3 moyennes, ainsi que **plusieurs angles morts fonctionnels** non couverts par les tests existants.

Les vulnérabilités critiques permettent respectivement :
1. À un client d'acheter des paniers flash en dehors des heures de vente configurées
2. Aux employés de recevoir 401 au lieu de leur accès normal (cause des 3 tests KO existants)

---

## 🔴 CRITIQUE

### VULN-001 : Rate limiting mémoire inefficace en serverless

**Route/Fichier** : `lib/rate-limit.ts` → `isMemoryRateLimited()`, utilisé dans `/api/orders/route.ts`

**Description** : `isMemoryRateLimited()` stocke les compteurs dans un `Map<string, RateLimitEntry>` en mémoire de processus. Sur Netlify/Vercel (architecture serverless), chaque invocation de lambda est isolée. Le compteur se réinitialise à zéro à chaque cold start — typiquement toutes les 15 minutes d'inactivité.

**Preuve de concept** :
```bash
# Envoyer 5 requêtes, attendre un cold start, envoyer 5 autres
# Aucune ne reçoit 429 car le compteur repart de 0 à chaque cold start
for i in {1..10}; do
  curl -X POST https://sauvemie.fr/api/orders -d '{"boulangerie_slug":"...",...}'
  sleep 60  # force cold start
done
```

**Impact** : Spam de commandes frauduleuses, surcharge base de données, faux orders pouvant saturer les stocks des boulangers.

**Correction** :
```typescript
// Option 1 : utiliser Upstash Redis (déjà intégré conditionnellement)
// → configurer UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

// Option 2 : remplacer par isSupabaseRateLimited() côté email
// dans /api/orders/route.ts, supprimer isMemoryRateLimited
// et s'appuyer uniquement sur isSupabaseRateLimited (max 3/email/24h)
```

**Test associé** : `tests/security/quota-race-condition.spec.ts` — section VULN-001

---

### VULN-002 : Achat flash hors période horaire

**Route/Fichier** : `app/api/paniers/[slug]/acheter/route.ts`

**Description** : La route ne vérifie pas si l'heure locale de la boulangerie (dans son timezone) est comprise dans `[flash_heure_debut, flash_heure_fin]` avant de déclencher la RPC d'achat. Un client peut acheter des paniers flash à 8h du matin si la boulangerie a configuré le flash de 18h à 20h.

**Preuve de concept** :
```bash
curl -X POST "https://boulangerie.sauvemie.fr/api/paniers/ma-boulangerie/acheter" \
  -H "Authorization: Bearer <client_token>" \
  -H "Content-Type: application/json" \
  -d '{"panier_complet": true}'
# Retourne 201 à 8h du matin alors que flash_heure_debut=18
```

**Impact** : Les boulangers configurent les paniers flash en fin de journée pour les invendus. Un achat trop tôt vide un stock qui aurait pu être vendu normalement.

**Correction** :
```typescript
// Dans /api/paniers/[slug]/acheter/route.ts, après la récupération de boulangerie :
const tz = boulangerie.timezone ?? 'Europe/Paris';
const nowLocal = new Date().toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
const currentHour = parseInt(nowLocal.split('T')[1].split(':')[0]);
const hDebut = boulangerie.flash_heure_debut ?? 18;
const hFin   = boulangerie.flash_heure_fin   ?? 20;

if (currentHour < hDebut || currentHour >= hFin) {
  return NextResponse.json(
    { error: `Les paniers flash sont disponibles de ${hDebut}h à ${hFin}h.` },
    { status: 403 }
  );
}
```

**Test associé** : `tests/security/flash-achat-hors-periode.spec.ts`

---

## 🟠 ÉLEVÉ

### VULN-003 : Auth helpers locaux ignorent les employés

**Routes/Fichiers** :
- `app/api/boulanger/journee/route.ts` → `getBoulangerieId()` local
- `app/api/boulanger/journee/feedback/route.ts` → `getAuth()` local
- `app/api/boulanger/ai/today/route.ts` → vérification directe `auth.users`

**Description** : Ces routes utilisent des helpers d'authentification maison qui cherchent la boulangerie via `boulangeries WHERE user_id = uid`. Les employés actifs (liés via la table `employes`) reçoivent donc un 401 ou 404 au lieu de leur accès normal.

**Impact** :
- Les employés ne peuvent pas saisir les stocks du matin (si l'owner leur a donné les droits)
- Les employés ne peuvent pas soumettre le feedback de fin de journée
- La navigation dans l'interface boulanger est cassée pour les employés

**Cause des 3 tests KO** existants dans `tests/auth/tenant-isolation.spec.ts`.

**Correction** :
```typescript
// Remplacer le helper local par getBoulangerSession() dans les 3 fichiers

// AVANT (journee/route.ts) :
async function getBoulangerieId(req) {
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id, timezone')
    .eq('user_id', user.id)  // ← ignore les employés
    .single();
}

// APRÈS :
import { getBoulangerSession } from '@/lib/auth-boulanger';
const session = await getBoulangerSession(req);
if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
const { boulangerieId } = session;
```

**Test associé** : `tests/security/auth-helpers-employe.spec.ts`

---

### VULN-004 : Upload photo réservé owner — gérants bloqués

**Route/Fichier** : `app/api/boulanger/produits/upload/route.ts`

**Description** : La route vérifie uniquement `boulangeries WHERE user_id = user.id`. Un gérant avec `catalogue:write` reçoit un 404 (boulangerie introuvable) au lieu d'avoir accès à la fonctionnalité d'upload.

**Impact** : Les gérants ne peuvent pas mettre à jour les photos des produits, alors que leur rôle l'autorise logiquement.

**Correction** :
```typescript
// AVANT :
const { data: boulangerie } = await admin
  .from('boulangeries')
  .select('id')
  .eq('user_id', user.id)  // ← ne connaît pas les gérants
  .single();

// APRÈS :
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
const session = await getBoulangerSession(req);
if (!session) return 401;
if (!canAccess(session, 'catalogue', 'write')) return 403;
const boulangerieId = session.boulangerieId;
```

Même correction applicable à `app/api/boulanger/vitrine/upload/route.ts`.

**Test associé** : `tests/security/upload-permission.spec.ts`

---

## 🟡 MOYEN

### VULN-005 : Race condition quota IA non-atomique

**Route/Fichier** : `app/api/boulanger/ai/rapport/route.ts`

**Description** : Le quota est incrémenté via `check_and_increment_levain_quota` (RPC PostgreSQL avec `FOR UPDATE` — correctement sérialisé). Cependant, si la vérification `journeeCloturee` échoue APRÈS l'incrément, le remboursement s'effectue via un `UPDATE levain_quota_used - 1` non-atomique. Si la connexion Supabase tombe entre les deux opérations, le quota est consommé sans que le rapport soit généré.

**Impact** : Sur plan Starter (1 rapport/semaine), un bug réseau peut priver le boulanger de son seul rapport hebdomadaire.

**Correction** :
```typescript
// Déplacer la vérification journeeCloturee AVANT l'appel à checkAndIncrementLevainQuota
// Structure recommandée :
// 1. Vérifier journeeCloturee
// 2. Si ok → checkAndIncrementLevainQuota
// 3. Si quota ok → générer le rapport

// Ou idéalement : incorporer la vérification journeeCloturee dans la RPC PostgreSQL
```

**Test associé** : `tests/security/quota-race-condition.spec.ts`

---

## Angles morts fonctionnels (non sécurité)

### Système de pénalités no-show
- Comptage via `PATCH /api/orders/:id { status: 'non_recuperee' }` non testé
- Déblocage via `POST /api/boulanger/clients/:email/debloquer` non testé
- Isolation tenant sur `/api/boulanger/clients` non vérifiée
- **Tests ajoutés** : `tests/penalites/no-show-system.spec.ts`

### Report inter-journées (conservation invendus)
- Aucun test ne vérifie que `PUT /api/boulanger/journee` déclenche le roll-over
- `est_reporte=true` empêchant le double-report non testé
- Valeurs par défaut `duree_conservation_jours` par catégorie non vérifiées
- **Tests ajoutés** : `tests/conservation/rollover-invendus.spec.ts`

### Invitation équipe
- Acceptation doublon token (410 Already Used) non testé
- Owner ne peut pas s'auto-inviter (400) non testé
- Permissions par rôle après acceptation partiellement testées
- **Tests ajoutés** : `tests/equipe/invitation-expiration.spec.ts`

### Achat flash authentifié
- Doublon d'achat concurrent (même client, même session) non testé
- Client bloqué (pénalités) tentant un achat flash non testé
- **Tests ajoutés** : `tests/security/flash-achat-hors-periode.spec.ts`

---

## Matrice de couverture après ajout des tests

| Domaine | Avant | Après |
|---------|-------|-------|
| Auth inscription/login | ✅ | ✅ |
| Multi-tenant isolation | ✅ 14/17 | ✅ 17/17 (avec fix VULN-003) |
| Permissions RBAC | ✅ | ✅ |
| Workflow journée | ✅ | ✅ |
| Rapport IA + quota | ✅ mocks | ✅ + race condition |
| Paniers flash (CRUD) | ⚠️ Partiel | ✅ + contrôle horaire |
| Achat flash authentifié | ❌ | ✅ |
| Pénalités no-show | ❌ | ✅ |
| Conservation invendus | ❌ | ✅ |
| Invitation équipe | ⚠️ Partiel | ✅ |
| Upload photos | ⚠️ Basic | ✅ + magic bytes + gérant |
| Export RGPD | ✅ Accès | ✅ |
| Rate limiting | ⚠️ Bypass only | ✅ + documentation VULN-001 |

---

## Actions prioritaires

| Priorité | Action | Effort | Impact |
|----------|--------|--------|--------|
| 🔴 P0 | Fix VULN-003 : remplacer helpers locaux par `getBoulangerSession()` dans `journee/route.ts`, `feedback/route.ts`, `ai/today/route.ts` | 30 min | Corrige 3 tests KO |
| 🔴 P0 | Fix VULN-002 : ajouter vérification horaire dans `/api/paniers/[slug]/acheter/route.ts` | 15 min | Ferme brèche achat hors période |
| 🟠 P1 | Fix VULN-004 : remplacer helper local dans `produits/upload/route.ts` par `getBoulangerSession()` + `canAccess('catalogue', 'write')` | 20 min | Débloque les gérants |
| 🟠 P1 | Fix VULN-001 : configurer Upstash Redis ou basculer sur `isSupabaseRateLimited` par email pour `/api/orders` | 1h | Rate limit serverless-compatible |
| 🟡 P2 | Fix VULN-005 : déplacer vérification `journeeCloturee` avant incrément quota | 30 min | Protège le quota Starter |