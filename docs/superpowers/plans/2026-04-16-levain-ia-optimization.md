# Levain IA — Optimisation Pipeline & Fix Plan(0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixer le bug "Plan (0)" causé par un upsert silencieux, pré-calculer les suggestions de production côté serveur (historique par jour de semaine + coefficients météo), réduire le prompt de ~9 750 à ~4 500 tokens (-55%), et tracer les coûts IA par appel pour le tableau de bord SaaS owner.

**Architecture:** Une nouvelle couche de pré-calcul (`lib/ai-production-compute.ts`) calcule les quantités suggérées avant l'appel IA. Le prompt est reécrit en format compact JSON. L'IA reçoit des chiffres déjà calculés et se concentre sur la validation et la rédaction des narratifs. Les colonnes `tokens_input`, `tokens_output`, `cout_usd` sont ajoutées à `ai_rapports` pour le tracking des coûts.

**Tech Stack:** TypeScript / Next.js 14, Supabase (PostgreSQL), Playwright (tests), GLM-4.7-FlashX (nouveau modèle quotidien recommandé)

---

## File Map

| Action | Fichier | Rôle |
|--------|---------|------|
| Create | `lib/ai-production-compute.ts` | Algorithme de suggestion de production par produit |
| Create | `migrations/add-ia-cost-tracking.sql` | Colonnes tokens_input/output/cout_usd + vue admin |
| Create | `tests/unit/production-compute.spec.ts` | Tests unitaires de l'algorithme de calcul |
| Modify | `app/api/boulanger/ai/rapport/route.ts` | Fix upsert + tracking coût + nouvelle requête histo + wire compute |
| Modify | `lib/ai-anonymize.ts` | Refactoring buildUserPrompt en format compact + buildSystemPrompt réduit |
| Create | `docs/levain_ia.md` | Documentation vivante du pipeline IA |
| Create | `docs/machine_learning.md` | Feuille de route Phase B (XGBoost) |
| Create | `docs/dashboard_admin.md` | Plan d'implémentation dashboard SaaS owner |

---

## Task 1: Fix bug "Plan (0)" — upsert silencieux

**Files:**
- Modify: `app/api/boulanger/ai/rapport/route.ts:803-807`

- [ ] **Étape 1 : Ouvrir route.ts et localiser le bloc upsert (ligne ~803)**

```bash
grep -n "allPrevisions" "app/api/boulanger/ai/rapport/route.ts"
```

Chercher le bloc :
```typescript
const allPrevisions = [...previsionsRows, ...manquants].filter(Boolean);
if (allPrevisions.length > 0) {
  await admin.from('production_forecasts')
    .upsert(allPrevisions, { onConflict: 'boulangerie_id,date_production,produit_id' });
}
```

- [ ] **Étape 2 : Remplacer par la version avec capture d'erreur**

```typescript
const allPrevisions = [...previsionsRows, ...manquants].filter(Boolean);
if (allPrevisions.length > 0) {
  const { error: upsertError } = await admin
    .from('production_forecasts')
    .upsert(allPrevisions, { onConflict: 'boulangerie_id,date_production,produit_id' });

  if (upsertError) {
    console.error('[Prévisions] Erreur upsert production_forecasts:', JSON.stringify(upsertError));
    // Fallback : insert individuel pour identifier le produit fautif
    for (const row of allPrevisions) {
      const { error: e } = await admin
        .from('production_forecasts')
        .upsert(row, { onConflict: 'boulangerie_id,date_production,produit_id' });
      if (e) console.error('[Prévisions] Échec ligne produit_id:', row?.produit_id, e.message);
    }
  } else {
    console.log(`[Prévisions] ${allPrevisions.length} prévisions insérées pour ${demainDate}`);
  }
}
```

- [ ] **Étape 3 : Vérifier le typecheck**

```bash
npm run typecheck 2>&1 | grep -E "error|warning" | head -20
```

Expected : aucune erreur nouvelle.

- [ ] **Étape 4 : Commit**

```bash
git add app/api/boulanger/ai/rapport/route.ts
git commit -m "fix: capturer erreur upsert production_forecasts (fix Plan 0)"
```

---

## Task 2: Migration SQL — colonnes coût IA + vue métriques

**Files:**
- Create: `migrations/add-ia-cost-tracking.sql`

- [ ] **Étape 1 : Créer le fichier de migration**

```sql
-- migrations/add-ia-cost-tracking.sql
-- Tracking granulaire des tokens et coûts IA par rapport

ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS tokens_input  integer;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS tokens_output integer;
ALTER TABLE ai_rapports ADD COLUMN IF NOT EXISTS cout_usd      numeric(10,6);

COMMENT ON COLUMN ai_rapports.tokens_input  IS 'Tokens du prompt envoyé au LLM';
COMMENT ON COLUMN ai_rapports.tokens_output IS 'Tokens générés par le LLM';
COMMENT ON COLUMN ai_rapports.cout_usd      IS 'Coût estimé en USD selon le modèle utilisé';

-- Vue agrégée pour dashboard SaaS owner
CREATE OR REPLACE VIEW admin_ia_metrics AS
SELECT
  DATE(created_at AT TIME ZONE 'Europe/Paris') AS jour,
  COUNT(*)                                      AS nb_rapports,
  SUM(tokens_input)                             AS total_tokens_input,
  SUM(tokens_output)                            AS total_tokens_output,
  COALESCE(SUM(tokens_utilises), 0)             AS total_tokens,
  SUM(cout_usd)                                 AS cout_total_usd,
  AVG(cout_usd)                                 AS cout_moyen_usd,
  modele_ia
FROM ai_rapports
WHERE statut = 'genere'
GROUP BY DATE(created_at AT TIME ZONE 'Europe/Paris'), modele_ia
ORDER BY jour DESC;
```

- [ ] **Étape 2 : Appliquer via Supabase SQL Editor**

Copier le contenu de `migrations/add-ia-cost-tracking.sql` et l'exécuter dans le SQL Editor de Supabase.

Vérifier : `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_rapports' AND column_name IN ('tokens_input','tokens_output','cout_usd');` → 3 lignes.

- [ ] **Étape 3 : Commit**

```bash
git add migrations/add-ia-cost-tracking.sql
git commit -m "feat: migration SQL tracking coût IA (tokens_input/output/cout_usd)"
```

---

## Task 3: Tracking coût tokens dans le POST handler

**Files:**
- Modify: `app/api/boulanger/ai/rapport/route.ts`

- [ ] **Étape 1 : Ajouter les variables d'env pour le modèle dans `.env.local`**

```bash
# Dans .env.local (et dans l'interface Netlify/Vercel pour prod)
ZHIPU_MODEL_DAILY=glm-4.7-flashx
ZHIPU_MODEL_WEEKLY=glm-4.5-air
```

- [ ] **Étape 2 : Mettre à jour la constante ZHIPU_MODEL en haut de route.ts**

Localiser (ligne ~33) :
```typescript
const ZHIPU_MODEL    = process.env.ZHIPU_MODEL ?? 'glm-4.5-air';
```

Remplacer par :
```typescript
const ZHIPU_MODEL_DAILY  = process.env.ZHIPU_MODEL_DAILY  ?? 'glm-4.5-air';
const ZHIPU_MODEL_WEEKLY = process.env.ZHIPU_MODEL_WEEKLY ?? 'glm-4.5-air';
// Pour l'instant tous les rapports utilisent DAILY ; WEEKLY sera utilisé pour les rapports hebdo futurs
const ZHIPU_MODEL = ZHIPU_MODEL_DAILY;
```

- [ ] **Étape 3 : Créer la fonction de calcul de coût**

Ajouter après les constantes de config (ligne ~38) :

```typescript
/** Calcule le coût USD selon le modèle et les tokens utilisés */
function calculerCoutUsd(model: string, tokensInput: number, tokensOutput: number): number {
  // Tarifs z.ai en USD per 1M tokens (avril 2026)
  const tarifs: Record<string, { input: number; output: number }> = {
    'glm-4.7-flashx': { input: 0.07,  output: 0.4  },
    'glm-4.5-air':    { input: 0.2,   output: 1.1  },
    'glm-4.5-flash':  { input: 0,     output: 0    },
    'glm-4.7-flash':  { input: 0,     output: 0    },
    'glm-4-32b-0414-128k': { input: 0.1, output: 0.1 },
    'glm-4.7':        { input: 0.6,   output: 2.2  },
  };
  const t = tarifs[model.toLowerCase()] ?? { input: 0.2, output: 1.1 };
  return (tokensInput * t.input + tokensOutput * t.output) / 1_000_000;
}
```

- [ ] **Étape 4 : Extraire input/output séparément après l'appel IA**

Localiser dans le POST handler le bloc qui traite `zhipuResponse` (section `// ── 11. Finalization`).

Trouver la ligne qui lit `usage?.total_tokens` et la remplacer / compléter :

```typescript
const tokensInput  = zhipuResponse.usage?.prompt_tokens     ?? 0;
const tokensOutput = zhipuResponse.usage?.completion_tokens  ?? 0;
const totalTokens  = tokensInput + tokensOutput;
const coutUsd      = calculerCoutUsd(ZHIPU_MODEL, tokensInput, tokensOutput);
```

- [ ] **Étape 5 : Inclure les nouvelles colonnes dans l'update ai_rapports**

Dans le bloc `await admin.from('ai_rapports').update({ ... })` (section 12) :

```typescript
await admin.from('ai_rapports').update({
  statut:            'genere',
  score_performance: score,
  verdict_flash:     verdict,
  rapport_json:      rapportFinal,
  modele_ia:         ZHIPU_MODEL,
  tokens_utilises:   totalTokens,
  tokens_input:      tokensInput,
  tokens_output:     tokensOutput,
  cout_usd:          coutUsd,
  erreur_msg:        null,
  // ... reste des champs existants
}).eq('id', rapportId);
```

- [ ] **Étape 6 : Typecheck**

```bash
npm run typecheck 2>&1 | grep error | head -10
```

- [ ] **Étape 7 : Commit**

```bash
git add app/api/boulanger/ai/rapport/route.ts
git commit -m "feat: tracking coût tokens IA (tokens_input/output/cout_usd) + multi-modèle"
```

---

## Task 4: `lib/ai-production-compute.ts` — algorithme de suggestions

**Files:**
- Create: `lib/ai-production-compute.ts`
- Create: `tests/unit/production-compute.spec.ts`

- [ ] **Étape 1 : Écrire le test en premier**

```typescript
// tests/unit/production-compute.spec.ts
import { test, expect } from '@playwright/test';

// On importe en ESM dynamique pour éviter les deps serveur
test.describe('computeProductionSuggestions', () => {
  // Fixtures minimalistes
  const produitBaguette = {
    id: 'uuid-baguette', nom: 'Baguette Tradition', emoji: '🥖',
    categorie: 'boulangerie', prix_vente: 1.2,
  };
  const produitCroissant = {
    id: 'uuid-croissant', nom: 'Croissant', emoji: '🥐',
    categorie: 'viennoiserie', prix_vente: 1.5,
  };
  const stockAujourd = [
    { produit_id: 'uuid-baguette', production: 100, stock_final: 10 },
    { produit_id: 'uuid-croissant', production: 50, stock_final: 0 },
  ];
  // 4 jeudis passés pour la baguette
  const histoMemeJour = [
    { date: '2026-04-10', stocks_journaliers: [
      { produit_id: 'uuid-baguette', production: 95, stock_final: 5 },
      { produit_id: 'uuid-croissant', production: 55, stock_final: 0 },
    ]},
    { date: '2026-04-03', stocks_journaliers: [
      { produit_id: 'uuid-baguette', production: 90, stock_final: 8 },
      { produit_id: 'uuid-croissant', production: 50, stock_final: 2 },
    ]},
    { date: '2026-03-27', stocks_journaliers: [
      { produit_id: 'uuid-baguette', production: 100, stock_final: 6 },
      { produit_id: 'uuid-croissant', production: 48, stock_final: 1 },
    ]},
  ];

  test('produit avec historique : utilise moyenne pondérée', async ({ request }) => {
    // Test via API interne (route de test dédiée)
    // OU test direct si la fonction est exportée en module Node
    // Pour ce projet Playwright, on teste via une route de test
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd,
        histoMemeJour,
        meteo: null,
        preCommandes: {},
      },
    });
    expect(res.ok()).toBeTruthy();
    const { suggestions } = await res.json();
    const baguette = suggestions.find((s: { produit_id: string }) => s.produit_id === 'uuid-baguette');
    expect(baguette).toBeDefined();
    // Moyenne pondérée de 95, 90, 100 → ~95 (les plus récents ont plus de poids)
    expect(baguette.qty_suggere).toBeGreaterThanOrEqual(85);
    expect(baguette.qty_suggere).toBeLessThanOrEqual(105);
    expect(baguette.nb_jours_histo).toBe(3);
  });

  test('produit sans historique : utilise production aujourd\'hui', async ({ request }) => {
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd,
        histoMemeJour: [],
        meteo: null,
        preCommandes: {},
      },
    });
    const { suggestions } = await res.json();
    const baguette = suggestions.find((s: { produit_id: string }) => s.produit_id === 'uuid-baguette');
    expect(baguette.nb_jours_histo).toBe(0);
    expect(baguette.qty_base).toBe(100);
  });

  test('produit 100% vendu aujourd\'hui → qty_suggere augmente', async ({ request }) => {
    const stockToutVendu = [{ produit_id: 'uuid-croissant', production: 50, stock_final: 0 }];
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitCroissant],
        stocksAujourd: stockToutVendu,
        histoMemeJour: [],
        meteo: null,
        preCommandes: {},
      },
    });
    const { suggestions } = await res.json();
    const croissant = suggestions[0];
    // 100% vendu → coefficient ×1.10
    expect(croissant.qty_suggere).toBeGreaterThan(50);
  });

  test('météo pluie forte → coefficient réduit boulangerie', async ({ request }) => {
    const meteoOrage = {
      actuelle: { temperature_c: 14, ressenti_c: 12, humidite_pct: 90, precipitations_mm: 8,
                  vitesse_vent_kmh: 20, code_meteo: 95, description: 'Orage', icone: '⛈️' },
      demain:   { temp_max_c: 12, temp_min_c: 9, precip_mm: 12, code_meteo: 95,
                  description: 'Orage', icone: '⛈️' },
    };
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd,
        histoMemeJour,
        meteo: meteoOrage,
        preCommandes: {},
      },
    });
    const { suggestions } = await res.json();
    const baguette = suggestions[0];
    // Pluie forte → boulangerie ×0.85 (légère hausse) vs base ~95 → ~80-90
    expect(baguette.facteur_meteo).toBeLessThan(1.0);
  });

  test('pré-commandes forcent qty_min', async ({ request }) => {
    const res = await request.post('/api/test/production-compute', {
      data: {
        produits: [produitBaguette],
        stocksAujourd: [{ produit_id: 'uuid-baguette', production: 10, stock_final: 0 }],
        histoMemeJour: [],
        meteo: null,
        preCommandes: { 'uuid-baguette': { nom: 'Baguette Tradition', quantite: 25 } },
      },
    });
    const { suggestions } = await res.json();
    // qty_min doit être >= 25 (nb pré-commandes)
    expect(suggestions[0].qty_min).toBeGreaterThanOrEqual(25);
  });
});
```

- [ ] **Étape 2 : Créer la route de test `/api/test/production-compute`**

```typescript
// app/api/test/production-compute/route.ts
// ⚠️ UNIQUEMENT EN DÉVELOPPEMENT — supprimer ou désactiver en production
import { NextRequest, NextResponse } from 'next/server';
import { computeProductionSuggestions } from '@/lib/ai-production-compute';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
  const body = await req.json();
  const suggestions = computeProductionSuggestions(body);
  return NextResponse.json({ suggestions });
}
```

- [ ] **Étape 3 : Lancer les tests (doit échouer — fonction pas encore créée)**

```bash
npm run test:unit -- tests/unit/production-compute.spec.ts 2>&1 | tail -20
```

Expected : FAIL (fonction `computeProductionSuggestions` non trouvée).

- [ ] **Étape 4 : Créer `lib/ai-production-compute.ts`**

```typescript
// lib/ai-production-compute.ts
// ─────────────────────────────────────────────────────────────
// Calcul côté serveur des suggestions de production par produit.
// Utilisé AVANT l'appel LLM pour fournir des quantités pré-calculées.
// ─────────────────────────────────────────────────────────────

import { analyserImpactMeteo } from './weather';
import type { MeteoComplet } from './weather';

// ── Types entrée ──────────────────────────────────────────────

export interface ProduitMinimal {
  id:        string;
  nom:       string;
  emoji:     string;
  categorie: string;
  prix_vente: number;
}

export interface StockRow {
  produit_id:  string;
  production:  number;
  stock_final: number;
}

export interface JourneeHistoRow {
  date:              string;
  stocks_journaliers: StockRow[];
}

// ── Type sortie ───────────────────────────────────────────────

export interface ProductionSuggestion {
  produit_id:     string;
  produit_nom:    string;
  qty_suggere:    number;
  qty_min:        number;
  qty_max:        number;
  qty_base:       number;     // référence historique (ou prod aujourd'hui si pas d'histo)
  variation_pct:  number;     // variation vs qty_base
  nb_jours_histo: number;     // nb de même-jour-semaine disponibles
  facteur_meteo:  number;     // coefficient météo appliqué (ex: 0.80)
  raison_calcul:  string;     // "moy 4 jeu=88 -20%pluie" etc.
}

// ── Coefficients météo par catégorie ─────────────────────────

function getCoeffMeteo(
  categorie: string,
  meteo: MeteoComplet | null
): number {
  if (!meteo) return 1.0;

  const analyse = analyserImpactMeteo(meteo);
  const cat = analyse.impact_par_categorie;

  // Convertir les labels textuels en coefficients numériques
  const parseCoeff = (label: string): number => {
    if (label.includes('+20') || label.includes('+15-20')) return 1.18;
    if (label.includes('+15'))  return 1.15;
    if (label.includes('+10-15')) return 1.12;
    if (label.includes('+10'))  return 1.10;
    if (label.includes('+5'))   return 1.05;
    if (label.includes('-30'))  return 0.70;
    if (label.includes('-25'))  return 0.75;
    if (label.includes('-20'))  return 0.80;
    if (label.includes('-15-20')) return 0.82;
    if (label.includes('-15'))  return 0.85;
    if (label.includes('-10'))  return 0.90;
    if (label.includes('-5'))   return 0.95;
    return 1.0; // neutre ou non reconnu
  };

  const catNorm = categorie.toLowerCase();
  if (catNorm === 'boulangerie')  return parseCoeff(cat.boulangerie);
  if (catNorm === 'viennoiserie') return parseCoeff(cat.viennoiserie);
  if (catNorm === 'patisserie' || catNorm === 'pâtisserie') return parseCoeff(cat.patisserie);
  if (catNorm === 'sandwich')     return parseCoeff(cat.sandwich);
  return 1.0;
}

// ── Arrondi par catégorie ─────────────────────────────────────

function arrondir(qty: number, categorie: string): number {
  const cat = categorie.toLowerCase();
  if (cat === 'boulangerie') return Math.round(qty / 5) * 5;
  if (cat === 'viennoiserie' || cat === 'patisserie' || cat === 'pâtisserie') {
    return Math.round(qty / 2) * 2;
  }
  return Math.round(qty);
}

// ── Calcul du taux d'invendu d'un produit dans une journée ────

function getTauxInvendu(stock: StockRow): number {
  if (!stock || stock.production <= 0) return 0;
  return (stock.stock_final / stock.production) * 100;
}

// ── Fonction principale ───────────────────────────────────────

export function computeProductionSuggestions(params: {
  produits:      ProduitMinimal[];
  stocksAujourd: StockRow[];
  histoMemeJour: JourneeHistoRow[];
  meteo:         MeteoComplet | null;
  preCommandes:  Record<string, { nom: string; quantite: number }>;
}): ProductionSuggestion[] {
  const { produits, stocksAujourd, histoMemeJour, meteo, preCommandes } = params;

  return produits.map(produit => {
    const stockAuj = stocksAujourd.find(s => s.produit_id === produit.id);
    const productionAuj = stockAuj?.production ?? 0;
    const stockFinalAuj = stockAuj?.stock_final ?? 0;
    const tauxInvenduAuj = productionAuj > 0 ? (stockFinalAuj / productionAuj) * 100 : 0;

    // ── 1. Collecte historique du même jour de semaine ────────
    const pointsHisto = histoMemeJour
      .map(j => {
        const s = j.stocks_journaliers.find(s => s.produit_id === produit.id);
        return s && s.production > 0 ? { production: s.production, taux_invendu: getTauxInvendu(s) } : null;
      })
      .filter((x): x is { production: number; taux_invendu: number } => x !== null);

    const nbHisto = pointsHisto.length;

    // ── 2. Calcul de la base ──────────────────────────────────
    let qtyBase: number;
    let taux_invendu_moy = tauxInvenduAuj; // fallback = aujourd'hui

    if (nbHisto >= 2) {
      // Moyenne pondérée : poids décroissants (plus récent = plus de poids)
      // poids[0] = nbHisto, poids[1] = nbHisto-1, ...
      let somme = 0;
      let totalPoids = 0;
      pointsHisto.forEach((p, i) => {
        const poids = nbHisto - i; // plus récent → poids le plus élevé
        somme += p.production * poids;
        totalPoids += poids;
      });
      qtyBase = somme / totalPoids;
      taux_invendu_moy = pointsHisto.reduce((acc, p) => acc + p.taux_invendu, 0) / nbHisto;
    } else {
      // Pas assez d'histo → fallback sur aujourd'hui
      qtyBase = productionAuj;
    }

    // ── 3. Ajustement taux invendu ────────────────────────────
    let coeffInvendu = 1.0;
    if (taux_invendu_moy > 20)       coeffInvendu = 0.75;
    else if (taux_invendu_moy > 10)  coeffInvendu = 0.88;
    else if (taux_invendu_moy > 5)   coeffInvendu = 0.95;
    // Signal de rupture : si aujourd'hui 100% vendu → légère hausse
    if (tauxInvenduAuj === 0 && productionAuj > 0) coeffInvendu = Math.max(coeffInvendu, 1.10);

    // ── 4. Coefficient météo ──────────────────────────────────
    const coeffMeteo = getCoeffMeteo(produit.categorie, meteo);

    // ── 5. Calcul final ───────────────────────────────────────
    const qtySuggereRaw = qtyBase * coeffInvendu * coeffMeteo;
    const precoQte = preCommandes[produit.id]?.quantite ?? 0;

    const qtySuggere = arrondir(Math.max(qtySuggereRaw, precoQte), produit.categorie);
    const qtyMin     = Math.max(arrondir(qtySuggereRaw * 0.88, produit.categorie), precoQte);
    const qtyMax     = arrondir(qtySuggereRaw * 1.12, produit.categorie);
    const qtyBaseArr = arrondir(qtyBase, produit.categorie);

    const variation = qtyBaseArr > 0 ? Math.round(((qtySuggere - qtyBaseArr) / qtyBaseArr) * 100) : 0;

    // ── 6. Raison courte ──────────────────────────────────────
    const baseLabel  = nbHisto >= 2 ? `moy ${nbHisto} sem=${qtyBaseArr}` : `fallback_auj=${qtyBaseArr}`;
    const invenduLbl = coeffInvendu !== 1.0 ? ` inv${taux_invendu_moy.toFixed(0)}%→${Math.round((coeffInvendu - 1) * 100)}%` : '';
    const meteoLbl   = coeffMeteo !== 1.0 ? ` meteo${Math.round((coeffMeteo - 1) * 100)}%` : '';
    const precoLbl   = precoQte > 0 ? ` +${precoQte}préco` : '';
    const raison = `${baseLabel}${invenduLbl}${meteoLbl}${precoLbl}`.slice(0, 80);

    return {
      produit_id:     produit.id,
      produit_nom:    produit.nom,
      qty_suggere:    Math.max(0, qtySuggere),
      qty_min:        Math.max(0, qtyMin),
      qty_max:        Math.max(0, qtyMax),
      qty_base:       Math.max(0, qtyBaseArr),
      variation_pct:  variation,
      nb_jours_histo: nbHisto,
      facteur_meteo:  coeffMeteo,
      raison_calcul:  raison,
    };
  });
}
```

- [ ] **Étape 5 : Lancer les tests (doit passer)**

```bash
npm run test:unit -- tests/unit/production-compute.spec.ts 2>&1 | tail -20
```

Expected : tous les tests PASS.

- [ ] **Étape 6 : Typecheck**

```bash
npm run typecheck 2>&1 | grep error | head -10
```

- [ ] **Étape 7 : Commit**

```bash
git add lib/ai-production-compute.ts app/api/test/production-compute/route.ts tests/unit/production-compute.spec.ts
git commit -m "feat: algorithme pré-calcul suggestions production (histo jour-semaine + météo)"
```

---

## Task 5: Nouvelle requête historique par jour de semaine + wire dans route.ts

**Files:**
- Modify: `app/api/boulanger/ai/rapport/route.ts`

- [ ] **Étape 1 : Ajouter la requête historique par jour de semaine**

Localiser après la requête historique 14j (ligne ~389). Ajouter juste après :

```typescript
// ── 3b. Historique du même jour de semaine (jusqu'à 8 semaines) ──
// Calcul du jour de semaine ISO de demain (1=lundi…7=dimanche)
const jourSemaineDemain = (() => {
  const d = new Date(demainDatePreco + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=dimanche
  return dow === 0 ? 7 : dow;
})();

const { data: histoMemeJourRaw } = await admin
  .from('journees')
  .select('date, stocks_journaliers(produit_id, production, stock_final)')
  .eq('boulangerie_id', boulangerieId)
  .eq('jour_semaine', jourSemaineDemain)
  .eq('cloturee', true)
  .lt('date', today)
  .order('date', { ascending: false })
  .limit(8);

const histoMemeJour = (histoMemeJourRaw ?? []) as {
  date: string;
  stocks_journaliers: { produit_id: string; production: number; stock_final: number }[];
}[];
```

- [ ] **Étape 2 : Appeler computeProductionSuggestions avant l'appel IA**

Localiser dans le POST handler la section `// ── 9. Construction du payload` (ou là où `buildUserPromptEnrichi` est appelé).

Ajouter avant cet appel :

```typescript
// ── Pré-calcul suggestions de production ─────────────────────
import { computeProductionSuggestions } from '@/lib/ai-production-compute';
// (l'import va en haut du fichier)

const suggestionsAlgo = computeProductionSuggestions({
  produits:      produitsList,
  stocksAujourd: stocksList,
  histoMemeJour,
  meteo:         meteoComplet,
  preCommandes:  preCommandesProduits,
});
```

Note : ajouter l'import `computeProductionSuggestions` en haut du fichier avec les autres imports.

- [ ] **Étape 3 : Passer les nouvelles données au payload**

Dans la construction du `PayloadEnrichi`, ajouter les deux nouveaux champs :

```typescript
const payloadBase: PayloadEnrichi = {
  // ... champs existants
  suggestions_algo: suggestionsAlgo,
  histo_meme_jour_raw: histoMemeJour,
};
```

Note : `suggestions_algo` et `histo_meme_jour_raw` seront ajoutés à l'interface `PayloadEnrichi` dans la Task 6.

- [ ] **Étape 4 : Typecheck**

```bash
npm run typecheck 2>&1 | grep error | head -20
```

Corriger les erreurs de type si nécessaire.

- [ ] **Étape 5 : Commit**

```bash
git add app/api/boulanger/ai/rapport/route.ts
git commit -m "feat: requête historique par jour de semaine + wire computeProductionSuggestions"
```

---

## Task 6: Refactoring buildUserPrompt — format compact

**Files:**
- Modify: `lib/ai-anonymize.ts`

- [ ] **Étape 1 : Mettre à jour l'interface `PayloadEnrichi`**

Localiser l'interface `PayloadEnrichi` dans `lib/ai-anonymize.ts`. Ajouter les nouveaux champs :

```typescript
export interface PayloadEnrichi {
  // ... champs existants conservés ...
  suggestions_algo?:    import('./ai-production-compute').ProductionSuggestion[];
  histo_meme_jour_raw?: { date: string; stocks_journaliers: { produit_id: string; production: number; stock_final: number }[] }[];
}
```

- [ ] **Étape 2 : Réduire `buildSystemPrompt()`**

Remplacer le contenu de `buildSystemPrompt()` (lignes 855-1022) par la version compacte (~400 tokens) :

```typescript
export function buildSystemPrompt(): string {
  return `Tu es Levain, l'assistant IA d'un boulanger artisanal. Comme le levain naturel, tu t'améliores chaque jour grâce aux données.

## Tes 3 audiences
- **Boulanger** : production, fournées, matières premières
- **Vendeuse** : accueil client, mise en avant produits, fin de journée
- **Gérant** : CA, tendances, stratégie, rentabilité

## Règles absolues
1. Dans \`previsions_production\`, utilise TOUJOURS le \`produit_id\` UUID exact fourni dans les suggestions.
2. \`quantite_suggeree\` est un ENTIER ABSOLU (pièces), jamais un pourcentage.
3. Fournis \`quantite_min\` et \`quantite_max\` pour chaque produit.
4. Les suggestions sont pré-calculées par algorithme serveur. Valide-les ou ajuste-les avec une justification contextuelle courte.
5. Utilise toujours les vrais noms de produits (jamais "Produit A").
6. Arrondis : pains → multiples de 5 | viennoiseries/pâtisseries → multiples de 2.

## Format de réponse
JSON strict avec les sections :
\`score\`, \`verdict\`, \`synthese_journee\`, \`analyse_produits\`, \`analyse_contextuelle\`,
\`analyse_commandes\`, \`analyse_clients\`, \`previsions_production\`, \`matieres_premieres\`,
\`briefing_matin\`, \`briefing_vendeuse\`, \`briefing_gerant\`, \`consignes_transmises\`, \`message_levain\`

Structure \`previsions_production\` :
\`\`\`json
[{
  "produit_id": "<UUID exact>",
  "produit_nom": "<nom exact>",
  "quantite_suggeree": <entier>,
  "quantite_min": <entier>,
  "quantite_max": <entier>,
  "variation_pct": <entier signé>,
  "raison": "<justification courte>"
}]
\`\`\``;
}
```

- [ ] **Étape 3 : Réécrire `buildUserPrompt()`**

Remplacer le corps de la fonction `buildUserPrompt()` (lignes 1024-1161) :

```typescript
export function buildUserPrompt(payload: PayloadEnrichi): string {
  const {
    journee, demain_info, historique_14j, histo_meme_jour,
    nb_jours_histo, catalogue, meteo, commandes, clients,
    evenements, performance_globale, suggestions_algo,
  } = payload;

  // Contexte cycle salarial
  const jourDuMois = new Date(demain_info.date + 'T12:00:00').getDate();
  const cycleSalarial = jourDuMois <= 5 ? 'debut_mois' : jourDuMois >= 25 ? 'fin_mois' : 'milieu_mois';

  // Impact trafic météo (résumé court)
  const impactTrafic = meteo ? meteo.impact.facteur_trafic : 'neutre';
  const meteoDemain = meteo
    ? `${meteo.demain.icone}${meteo.demain.temp_max}°C/${meteo.demain.temp_min}°C précip:${meteo.demain.precipitations}mm`
    : 'N/A';

  // Événements (court)
  const eventLabel = evenements?.jour_ferie
    ? `${evenements.fete_nom}${evenements.vacances_scolaires ? '+vacances' : ''}`
    : evenements?.vacances_scolaires ? 'vacances' : 'null';

  // Produits aujourd'hui (format compact : id|nom|prod|vendu%|invendu_pcs)
  const produitsLignes = journee.produits.map(p =>
    `${p.produit_id}|${p.nom}|${p.production}|${p.taux_vente}%|${p.invendu}`
  ).join('\n');

  // Suggestions algorithme (JSON compact)
  const suggestionsJson = suggestions_algo && suggestions_algo.length > 0
    ? JSON.stringify(suggestions_algo.map(s => ({
        id: s.produit_id,
        nom: s.produit_nom,
        qty: s.qty_suggere,
        min: s.qty_min,
        max: s.qty_max,
        base_histo: s.qty_base,
        nb_sem: s.nb_jours_histo,
        meteo_coeff: s.facteur_meteo !== 1.0 ? `${Math.round((s.facteur_meteo - 1) * 100)}%` : null,
        raison: s.raison_calcul,
      })), null, 0)
    : '[]';

  // Résumé historique du même jour de semaine
  const histoResume = histo_meme_jour.length > 0
    ? `${demain_info.jour_semaine}s récents (${histo_meme_jour.length} sem): ca_moy=${
        Math.round(histo_meme_jour.reduce((a, h) => a + h.ca, 0) / histo_meme_jour.length)
      }€ inv_moy=${(histo_meme_jour.reduce((a, h) => a + h.taux_invendu, 0) / histo_meme_jour.length).toFixed(1)}%`
    : 'Pas de données pour ce jour de semaine';

  // Tendances
  const tendanceHier = performance_globale.tendance_vs_hier >= 0
    ? `+${performance_globale.tendance_vs_hier}%` : `${performance_globale.tendance_vs_hier}%`;
  const tendanceSem = performance_globale.tendance_vs_meme_jour >= 0
    ? `+${performance_globale.tendance_vs_meme_jour}%` : `${performance_globale.tendance_vs_meme_jour}%`;

  // Pré-commandes demain
  const precos = catalogue
    .filter(p => (p as { precos_demain?: number }).precos_demain && (p as { precos_demain?: number }).precos_demain! > 0)
    .map(p => `${p.nom}×${(p as { precos_demain?: number }).precos_demain}`)
    .join(', ') || 'aucune';

  // Commandes online résumé
  const cmdResume = commandes
    ? `CC:${commandes.click_collect.nb_commandes}cmd ${commandes.click_collect.ca_total}€ | AG:${commandes.anti_gaspi.nb_paniers}paniers ${commandes.anti_gaspi.ca_genere}€`
    : 'N/A';

  return `# CONTEXTE
date=${demain_info.date} | jour=${demain_info.jour_semaine}${demain_info.est_weekend ? ' ⚠️WEEKEND+20-40%' : ''} | meteo_demain=${meteoDemain}
impact_trafic=${impactTrafic} | event=${eventLabel} | cycle=${cycleSalarial} | histo=${nb_jours_histo}j

# AUJOURD'HUI (${journee.jour_semaine} — score ${performance_globale.score_jour}/100)
ca=${journee.ca_estime}€ | invendu=${journee.taux_invendu}% (${journee.total_invendu}/${journee.total_produit}pcs) | ${tendanceHier} vs hier | ${tendanceSem} vs même ${demain_info.jour_semaine}
commandes: ${cmdResume}

# PRODUITS_AUJOURD'HUI (produit_id|nom|prod|vendu%|invendu_pcs)
${produitsLignes}

# SUGGESTIONS_ALGORITHME (pré-calculées — à valider/ajuster avec contexte)
${suggestionsJson}

# RÉSUMÉ_HISTORIQUE
${histoResume}
histo_14j: ${historique_14j.slice(0, 7).map(h => `${h.est_weekend ? '[WE]' : '[sem]'}${h.jour_semaine}:${h.ca}€/${h.taux_invendu}%inv`).join(' | ')}

# PRÉ-COMMANDES_DEMAIN
${precos}

${clients ? `# CLIENTS
total=${clients.total_clients} actifs=${clients.clients_actifs} rétention30j=${clients.retention_30j}% | +${clients.nouveaux_clients_mois} ce mois` : ''}

→ Génère le JSON complet. Dans previsions_production, reprends chaque produit_id UUID des suggestions.`;
}
```

- [ ] **Étape 4 : Typecheck**

```bash
npm run typecheck 2>&1 | grep error | head -20
```

Corriger toutes les erreurs avant de continuer.

- [ ] **Étape 5 : Test smoke — générer un rapport et vérifier la structure**

```bash
npm run test:smoke 2>&1 | tail -30
```

- [ ] **Étape 6 : Commit**

```bash
git add lib/ai-anonymize.ts
git commit -m "refactor: prompt compact (-60% tokens) + système prompt réduit"
```

---

## Task 7: Vérification end-to-end

- [ ] **Étape 1 : Générer un nouveau rapport via l'UI**

Ouvrir `https://localhost:3000/boulanger` → déclencher la génération du rapport IA.

- [ ] **Étape 2 : Vérifier en base que les forecasts sont créés**

Dans Supabase Table Editor → `production_forecasts` → filtrer sur `date_production = demain` → vérifier N lignes.

- [ ] **Étape 3 : Vérifier l'onglet Plan dans l'UI**

Recharger la page → onglet "Plan (X)" doit afficher X > 0.

- [ ] **Étape 4 : Vérifier les colonnes de coût**

Dans Supabase → `ai_rapports` → dernière ligne → vérifier `tokens_input`, `tokens_output`, `cout_usd` non null.

- [ ] **Étape 5 : Comparer les tokens**

```sql
SELECT tokens_utilises, tokens_input, tokens_output, cout_usd, modele_ia
FROM ai_rapports ORDER BY created_at DESC LIMIT 5;
```

Objectif : `tokens_utilises` < 5 000 (était ~9 750).

- [ ] **Étape 6 : Lancer les tests IA**

```bash
npm run test -- tests/ia/rapport-ia.spec.ts 2>&1 | tail -30
```

- [ ] **Étape 7 : Commit final si tout est OK**

```bash
git add -A
git commit -m "test: vérification end-to-end pipeline IA optimisé"
```

---

## Task 8: Documents de référence

**Files:**
- Create: `docs/levain_ia.md`
- Create: `docs/machine_learning.md`
- Create: `docs/dashboard_admin.md`

- [ ] **Étape 1 : Créer `docs/levain_ia.md`**

```markdown
# Levain IA — Documentation Technique

## Pipeline

```
Données brutes (Supabase)
  → computeProductionSuggestions() [lib/ai-production-compute.ts]
  → buildUserPrompt() [lib/ai-anonymize.ts]  ~2 500 tokens input
  → LLM z.ai (GLM-4.7-FlashX quotidien / GLM-4.5-Air hebdo)
  → parseJSON + validation [route.ts]
  → upsert ai_rapports + production_forecasts [Supabase]
```

## Modèles utilisés

| Usage | Modèle | Coût/appel* |
|-------|--------|-------------|
| Rapport quotidien | GLM-4.7-FlashX | ~$0.001 |
| Rapport hebdo/mensuel | GLM-4.5-Air | ~$0.003 |

*Basé sur ~2 500 tokens input + ~2 000 tokens output après optimisation v2.

Variables d'env : `ZHIPU_MODEL_DAILY`, `ZHIPU_MODEL_WEEKLY`

## Format prompt (v2 — compact)

System prompt : ~400 tokens (rôle, règles absolues, format JSON attendu)
User prompt : ~2 500 tokens (contexte, produits, suggestions algorithme, historique résumé)

## Format réponse JSON attendu

[Voir buildSystemPrompt() dans lib/ai-anonymize.ts pour le format complet]

Sections clés :
- `previsions_production[]` : qty_suggere (entier absolu), produit_id (UUID), raison
- `briefing_matin` : résumé pour le boulanger à l'ouverture
- `score` : 0-100, `verdict` : ≤15 mots

## Historique des versions

| Version | Date | Tokens avant | Tokens après | Changement |
|---------|------|-------------|-------------|-----------|
| v1 | avant 2026-04 | ~9 750 | - | Prompt verbeux, calculs côté LLM |
| v2 | 2026-04-16 | ~9 750 | ~4 500 | Prompt compact + pré-calcul serveur |
```

- [ ] **Étape 2 : Créer `docs/machine_learning.md`**

```markdown
# Machine Learning — Plan Phase B

## Vision

Remplacer le LLM pour les prédictions de quantités par un modèle XGBoost léger.
Le LLM reste pour les narratifs et l'analyse qualitative (hebdo/mensuel).

## Données à collecter DÈS MAINTENANT

### Features (variables d'entrée)
| Feature | Source | Note |
|---------|--------|------|
| jour_semaine (1-7) | journees.jour_semaine | Déjà collecté |
| temp_max_c | meteo_journees.demain_temp_max_c | Déjà collecté |
| precip_mm | meteo_journees.demain_precip_mm | Déjà collecté |
| code_meteo | meteo_journees.demain_code_meteo | Déjà collecté |
| est_vacances | Calculé | À ajouter à journees |
| est_ferie | Calculé | À ajouter à journees |
| cycle_salarial | Calculé (1=debut, 2=milieu, 3=fin) | À ajouter |
| snapshot_10h_pct | stocks_journaliers.snapshot_10h / production | À calculer |
| snapshot_14h_pct | stocks_journaliers.snapshot_14h / production | À calculer |
| ca_j7 | journees.ca_estime J-7 | Déjà accessible |
| invendu_moy_4sem | Calculé | À matérialiser |

### Target (variable cible)
| Target | Calcul |
|--------|--------|
| stock_final_reel | stocks_journaliers.stock_final (ground truth) |

## Architecture du modèle

```
Phase B :
  XGBoost par produit (ou par cluster de produits)
  + LLM pour narratif/conseil uniquement

Entrées XGBoost : features ci-dessus
Sortie XGBoost  : quantite_suggeree, quantite_min, quantite_max

LLM reçoit : chiffres XGBoost + contexte → génère texte uniquement
```

## Clustering des boulangeries

Pour éviter un modèle par boulangerie (trop peu de données individuelles) :

| Cluster | Profil | Critères |
|---------|--------|----------|
| A | Urbaine dynamique | CA > 800€/j, clientèle dense |
| B | Boulangerie de quartier | CA 400-800€/j, fidèles |
| C | Péri-urbain/rural | CA < 400€/j, saisonnalité forte |
| D | Centre commercial | Forte variance week-end |

Algorithme : K-means sur (ca_moyen, invendu_moy, variance_semaine)

## Métriques de déclenchement Phase B

Switcher du LLM au ML quand :
- ≥ 90 jours de données par boulangerie
- MAE (Mean Absolute Error) du modèle < 15% sur validation croisée
- Performance cluster ≥ performance LLM sur 30 jours glissants

## Plan d'implémentation

1. **Collecte (maintenant → mois 3)** : S'assurer que tous les snapshots sont saisis, ajouter les features manquantes à la table `journees`
2. **Feature engineering (mois 3-4)** : Script Python/Node de calcul des features agrégées, export CSV par cluster
3. **Modèle pilote (mois 4-6)** : XGBoost sur cluster A (20+ boulangeries), évaluation vs LLM actuel
4. **Déploiement progressif (mois 6+)** : A/B test sur 10% des boulangeries, monitoring MAE
5. **Transition complète** : LLM uniquement pour rapports hebdo/mensuel
```

- [ ] **Étape 3 : Créer `docs/dashboard_admin.md`**

```markdown
# Dashboard Admin SaaS — Plan d'implémentation

## Objectif

Tableau de bord accessible uniquement au propriétaire du SaaS (rôle `super_admin`).
Visualiser inscriptions, abonnements actifs, utilisation IA et coûts.

## Protection

Route protégée par `session.role === 'super_admin'` côté API.
Page Next.js `/app/admin/page.tsx` avec middleware de vérification.

## Pages & sections

### 1. Vue Globale
- Boulangeries actives / total
- Nouvelles inscriptions (7j, 30j)
- Distribution des plans (Starter / Pro / Multi)
- Churns du mois

### 2. Coûts IA
- Coût total aujourd'hui / ce mois / projection fin mois
- Nb rapports générés
- Tokens moyens input/output
- Coût moyen par rapport
- Graphique évolution quotidienne (30 jours)

Requête source : `admin_ia_metrics` view (créée dans migration)

### 3. Abonnements
- Liste des abonnements actifs avec plan, date, CA mensuel
- Intégration Stripe (future) : MRR, factures, churns

### 4. Détail Boulangeries
- Liste triable : nom, ville, plan, dernière activité, nb rapports ce mois
- Alertes : boulangeries sans activité depuis > 7j

## Routes API à créer

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/admin/metrics` | GET | Métriques agrégées (ia_metrics view) |
| `/api/admin/boulangeries` | GET | Liste boulangeries avec stats |
| `/api/admin/subscriptions` | GET | Abonnements actifs |

Toutes les routes vérifient `session.role === 'super_admin'`.

## Composants UI

- `components/admin/MetricsCard.tsx` — carte stat avec icône + valeur + tendance
- `components/admin/CostChart.tsx` — graphique recharts évolution coûts IA
- `components/admin/BoulangeriTable.tsx` — tableau triable

## Tech stack

Next.js App Router, Recharts (déjà dans le projet), Supabase admin client.

## Ordre d'implémentation recommandé

1. Routes API `/api/admin/*` avec protection super_admin
2. Page `/app/admin/page.tsx` minimaliste (stats textuelles)
3. Ajout des graphiques recharts
4. Intégration Stripe (future — après validation MVP)
```

- [ ] **Étape 4 : Commit**

```bash
git add docs/
git commit -m "docs: levain_ia.md + machine_learning.md + dashboard_admin.md"
```

---

## Résumé des tokens économisés

| Métrique | Avant | Après | Δ |
|---------|-------|-------|---|
| Tokens input | ~7 000 | ~2 500 | -64% |
| Tokens output | ~2 750 | ~2 000 | -27% |
| Total | ~9 750 | ~4 500 | -54% |
| Coût/rapport (GLM-4.7-FlashX) | $0.0055 | ~$0.001 | -82% |
| Coût 100 boul × 30j | ~$16.50 | ~$3.00 | -82% |
