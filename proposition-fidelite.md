# 🏆 Proposition de Système de Fidélité — BakeryOS

## 📋 Résumé Exécutif

Ce document propose un système de fidélité complet pour inciter les clients à :
1. **Commander en ligne** avant de venir en boutique
2. **Récupérer leurs commandes** ponctuellement
3. **Bénéficier d'avantages exclusifs** après un certain nombre de commandes

---

## 🎯 Objectifs Business

| Objectif | Solution proposée |
|----------|-------------------|
| Inciter aux commandes en ligne | Points de fidélité + réductions progressives |
| Réduire les no-show | Système de blocage après 3 non-récupérations |
| Récompenser les clients fidèles | Bonus paniers anti-gaspi, avant-premières, cadeau anniversaire |
| Augmenter le panier moyen | Seuils de déclenchement des avantages |

---

## 🗄️ Modèle de Données

### 1. Table `profils_clients` (extension)

```sql
-- Ajouter ces colonnes à la table existante
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS points_fidelite        INT      NOT NULL DEFAULT 0;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS commandes_recuperees   INT      NOT NULL DEFAULT 0;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS commandes_non_recuperees INT    NOT NULL DEFAULT 0;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS niveau_fidelite        TEXT     NOT NULL DEFAULT 'bronze'
                              CHECK (niveau_fidelite IN ('bronze', 'argent', 'or', 'platinum'));
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS bloque_commande_online BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS bloque_raison          TEXT     DEFAULT NULL;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS bloque_jusqua          TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS date_inscription       DATE     NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS date_anniversaire      DATE     DEFAULT NULL;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS optin_nouveautes       BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS dernier_avantage_date  DATE     DEFAULT NULL;
ALTER TABLE profils_clients ADD COLUMN IF NOT EXISTS dernier_avantage_type  TEXT     DEFAULT NULL;
```

### 2. Table `historique_fidelite`

```sql
CREATE TABLE IF NOT EXISTS historique_fidelite (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id       UUID        NOT NULL REFERENCES profils_clients(id) ON DELETE CASCADE,
  boulangerie_id  UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  
  -- Type d'action
  action          TEXT        NOT NULL CHECK (action IN (
    'commande', 'recuperee', 'non_recuperee', 'annulee',
    'bonus_flash', 'bonus_anniversaire', 'bonus_nouveaute',
    'conversion_points', 'penalite'
  )),
  
  -- Points gagnés/perdus
  points_delta    INT         NOT NULL,  -- positif = gain, négatif = perte
  
  -- Contexte
  commande_id     UUID        REFERENCES commandes(id) ON DELETE SET NULL,
  description     TEXT        DEFAULT NULL,
  metadata        JSONB       DEFAULT '{}',
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_historique_fidelite_profil ON historique_fidelite(profil_id, created_at DESC);
CREATE INDEX idx_historique_fidelite_boulangerie ON historique_fidelite(boulangerie_id, created_at DESC);
```

### 3. Table `avantages_fidelite`

```sql
CREATE TABLE IF NOT EXISTS avantages_fidelite (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id  UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  
  -- Type d'avantage
  type            TEXT        NOT NULL CHECK (type IN (
    'reduction_panier', 'bonus_flash', 'produit_gratuit', 
    'echantillon', 'acces_anticipe', 'anniversaire'
  )),
  
  -- Configuration
  nom             TEXT        NOT NULL,
  description     TEXT        DEFAULT NULL,
  
  -- Conditions de déclenchement
  niveau_min      TEXT        NOT NULL DEFAULT 'bronze'
                    CHECK (niveau_min IN ('bronze', 'argent', 'or', 'platinum')),
  commandes_min   INT         DEFAULT 0,
  points_cout     INT         DEFAULT 0,  -- 0 = automatique, >0 = échange points
  
  -- Récompense
  remise_pct      INT         DEFAULT NULL CHECK (remise_pct BETWEEN 1 AND 100),
  produit_offert  TEXT        DEFAULT NULL,  -- ID produit ou catégorie
  montant_min     DECIMAL(8,2) DEFAULT NULL,
  
  -- Validité
  actif           BOOLEAN     NOT NULL DEFAULT TRUE,
  validite_jours  INT         DEFAULT NULL,  -- NULL = sans limite
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Table `non_recuperations`

```sql
-- Tracking des commandes non récupérées pour le blocage
CREATE TABLE IF NOT EXISTS non_recuperations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id       UUID        NOT NULL REFERENCES profils_clients(id) ON DELETE CASCADE,
  commande_id     UUID        NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  boulangerie_id  UUID        NOT NULL REFERENCES boulangeries(id) ON DELETE CASCADE,
  
  -- Détails
  creneau_fin     TIMESTAMPTZ NOT NULL,  -- Fin du créneau de retrait
  constate_le     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  annule_par      TEXT        CHECK (annule_par IN ('client', 'systeme', 'boulanger')),
  
  -- Compteur au moment de l'incident
  compteur_avant  INT         NOT NULL DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_non_recuperations_profil ON non_recuperations(profil_id, constate_le DESC);
```

---

## ⚙️ Règles Métier

### 1. Système de Points

| Action | Points |
|--------|--------|
| Commande en ligne | +10 points |
| Commande récupérée | +5 points bonus |
| Commande à J+1 (anticipée) | +5 points extra |
| Panier anti-gaspi acheté | +15 points |
| Non-récupération | -20 points |

### 2. Niveaux de Fidélité

| Niveau | Commandes récupérées | Avantages |
|--------|---------------------|-----------|
| 🥉 Bronze | 0-9 | Points de base |
| 🥈 Argent | 10-24 | +5% remise flash |
| 🥇 Or | 25-49 | +10% remise flash, accès anticipé nouveautés |
| 💎 Platinum | 50+ | +15% remise flash, produit anniversaire, priorité |

### 3. Blocage après Non-Récupérations

```
RÈGLE DES 3 NON-RÉCUPÉRATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Si client a 3 commandes non récupérées ET non annulées dans l'heure suivant
la fin du créneau proposé :

→ Blocage commande en ligne pendant 30 jours
→ Perte des avantages fidélité pendant cette période
→ Obligation de se déplacer en boutique

Le compteur se réinitialise après une période de 30 jours sans incident
OU après 5 commandes récupérées consécutives.
```

### 4. Avantages Spéciaux

#### A. Bonus Paniers Anti-Gaspi (après 10 commandes)
```
Niveau Argent+ : +5% de réduction supplémentaire sur les paniers flash
Niveau Or+     : +10% de réduction supplémentaire
Niveau Platinum: +15% de réduction supplémentaire
```

#### B. Alertes Nouveaux Produits
```sql
-- Configuration par boulangerie
INSERT INTO avantages_fidelite (boulangerie_id, type, nom, niveau_min, commandes_min)
VALUES (
  'uuid-boulangerie',
  'acces_anticipe',
  'Avant-première nouveaux produits',
  'argent',  -- Niveau minimum
  10         -- 10 commandes minimum
);
```

**Workflow :**
1. Le boulanger ajoute un nouveau produit avec `disponible_du = J+7`
2. Les clients fidèles (Argent+) reçoivent un email 3 jours avant
3. Le mail inclut un code promo ou promesse d'échantillon gratuit

#### C. Cadeau Anniversaire
```
À la date anniversaire de l'inscription :

→ Pâtisserie offerte pour tout achat ≥ 10€
→ Valable 7 jours avant/après la date
→ Niveau Bronze+ requis
```

---

## 🔧 Implémentation Technique

### 1. API Routes Nécessaires

```
/api/client/fidelite/
├── route.ts              # GET: statut fidélité du client
├── historique/route.ts   # GET: historique des points
├── avantages/route.ts    # GET: avantages disponibles
└── utiliser/route.ts     # POST: utiliser un avantage
```

### 2. Extension de l'API Orders

```typescript
// À ajouter dans app/api/orders/route.ts

// Avant création de commande, vérifier le blocage
const { data: profil } = await supabase
  .from('profils_clients')
  .select('bloque_commande_online, bloque_raison, bloque_jusqua')
  .eq('user_id', user.id)
  .single();

if (profil?.bloque_commande_online) {
  if (profil.bloque_jusqua && new Date(profil.bloque_jusqua) > new Date()) {
    return NextResponse.json({
      error: 'Commande en ligne suspendue',
      reason: profil.bloque_raison,
      bloquJusqua: profil.bloque_jusqua,
      suggestion: 'Vous pouvez commander directement en boutique.'
    }, { status: 403 });
  }
}
```

### 3. Job de Vérification des Non-Récupérations

```typescript
// À exécuter toutes les heures via cron ou Supabase Edge Functions

async function checkNonRecuperations() {
  const now = new Date();
  
  // Trouver les commandes dont le créneau est dépassé de +1h
  // et qui ne sont ni récupérées ni annulées
  const { data: commandesEnRetard } = await supabase
    .from('commandes')
    .select('id, client_email, heure_retrait, created_at, boulangerie_id')
    .in('statut', ['en_attente', 'confirmee', 'prete'])
    .lt('heure_retrait', /* heure actuelle - 1h */);
    
  for (const cmd of commandesEnRetard) {
    // Enregistrer la non-récupération
    // Incrémenter le compteur
    // Vérifier si blocage nécessaire
  }
}
```

### 4. Calcul des Niveaux (Fonction SQL)

```sql
CREATE OR REPLACE FUNCTION calculer_niveau_fidelite(commandes_recuperees INT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN commandes_recuperees >= 50 THEN 'platinum'
    WHEN commandes_recuperees >= 25 THEN 'or'
    WHEN commandes_recuperees >= 10 THEN 'argent'
    ELSE 'bronze'
  END;
END;
$$;
```

---

## 📱 Interface Client

### 1. Onglet Fidélité dans l'Espace Client

```tsx
// À ajouter dans components/client-space.tsx

function OngletFidelite() {
  return (
    <div className="space-y-5">
      {/* Carte niveau */}
      <FideliteCard />
      
      {/* Barre de progression */}
      <ProgressNiveau />
      
      {/* Avantages disponibles */}
      <AvantagesList />
      
      {/* Historique des points */}
      <HistoriquePoints />
    </div>
  );
}
```

### 2. Indicateur Visuel du Niveau

```tsx
function FideliteCard({ niveau, points, commandesRecuperees }) {
  const NIVEAU_CONFIG = {
    bronze:  { emoji: '🥉', color: 'from-amber-600 to-amber-800', label: 'Bronze' },
    argent:  { emoji: '🥈', color: 'from-gray-300 to-gray-500',   label: 'Argent' },
    or:      { emoji: '🥇', color: 'from-yellow-400 to-yellow-600', label: 'Or' },
    platinum:{ emoji: '💎', color: 'from-purple-400 to-purple-600', label: 'Platinum' },
  };
  
  const config = NIVEAU_CONFIG[niveau];
  
  return (
    <div className={`bg-gradient-to-br ${config.color} rounded-2xl p-5 text-white`}>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-3xl">{config.emoji}</span>
          <h3 className="font-bold text-lg mt-1">{config.label}</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{points}</p>
          <p className="text-white/70 text-xs">points</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-white/80 text-sm">
        <CheckCircle size={14} />
        {commandesRecuperees} commandes récupérées
      </div>
    </div>
  );
}
```

### 3. Indicateur de Risque de Blocage

```tsx
function AlerteBlocage({ nonRecuperees }) {
  if (nonRecuperees === 0) return null;
  
  const isWarning = nonRecuperees === 2;
  const isDanger = nonRecuperees >= 3;
  
  return (
    <div className={`rounded-xl p-4 ${
      isDanger ? 'bg-red-50 border-red-200' : 
      isWarning ? 'bg-amber-50 border-amber-200' : 
      'bg-gray-50 border-gray-200'
    } border`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={isDanger ? 'text-red-500' : 'text-amber-500'} />
        <div>
          <p className="font-medium text-sm">
            {isDanger 
              ? 'Commandes en ligne suspendues'
              : `${3 - nonRecuperees} non-récupération(s) avant suspension`
            }
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Récupérez vos commandes pour éviter le blocage.
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

## 📧 Emails & Notifications

### 1. Email de Confirmation avec Points

```html
<h2>✅ Commande confirmée !</h2>
<p>Bonjour {{prenom}},</p>
<p>Votre commande est validée pour le créneau {{creneau}}.</p>

<div class="fidelite-banner">
  <p>🎯 +{{points_gagnes}} points fidélité</p>
  <p>Total : {{points_total}} points</p>
</div>
```

### 2. Email d'Alerte Nouveauté (Fidèles)

```html
<h2>🌟 Avant-première exclusive</h2>
<p>Bonjour {{prenom}},</p>
<p>En tant que client fidèle, découvrez en avant-première notre nouvelle création :</p>

<h3>{{nouveau_produit}}</h3>
<p>Disponible pour tous le {{date_public}}, mais vous pouvez déjà le commander !</p>

<div class="bonus">
  <p>🎁 Bonus : {{bonus_description}}</p>
</div>
```

### 3. Email Anniversaire

```html
<h2>🎂 Joyeux anniversaire d'inscription !</h2>
<p>Cela fait {{annees}} an(s) que vous faites partie de notre communauté.</p>

<div class="gift">
  <p>🎁 Votre cadeau : une pâtisserie offerte</p>
  <p>Pour tout achat supérieur à 10€, valable 7 jours</p>
</div>
```

---

## 🔒 Gestion des Cas Limites

### 1. Réinitialisation du Compteur

```sql
-- Fonction appelée après chaque commande récupérée
CREATE OR REPLACE FUNCTION reset_non_recuperations_counter(profil_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE profils_clients
  SET commandes_non_recuperees = 0,
      bloque_commande_online = FALSE,
      bloque_raison = NULL,
      bloque_jusqua = NULL
  WHERE id = profil_id
    AND commandes_non_recuperees < 3;
END;
$$;
```

### 2. Réactivation après Blocage

```sql
-- Après 30 jours de blocage, réactiver automatiquement
CREATE OR REPLACE FUNCTION reactivate_after_block()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE profils_clients
  SET bloque_commande_online = FALSE,
      bloque_raison = NULL,
      bloque_jusqua = NULL,
      commandes_non_recuperees = 0
  WHERE bloque_commande_online = TRUE
    AND bloque_jusqua < NOW();
END;
$$;
```

### 3. Annulation Client (ne compte pas comme no-show)

```typescript
// Si le client annule AVANT la fin de son créneau, ce n'est pas un no-show
if (statut === 'annulee' && new Date() < finCreneau) {
  // Ne pas incrémenter commandes_non_recuperees
  // Ne pas pénaliser
}
```

---

## 📊 Dashboard Boulanger

### KPIs Fidélité à Afficher

```
┌─────────────────────────────────────────────────┐
│  📊 Fidélité Clients                             │
├─────────────────────────────────────────────────┤
│  Clients fidèles (Argent+)    : 127 (+12%)      │
│  Commandes fidèles ce mois    : 89              │
│  Taux de récupération         : 94.2%           │
│  Non-récupérations ce mois    : 8               │
│  Clients bloqués              : 3               │
│  Avantages utilisés           : 45              │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Phases d'Implémentation

### Phase 1 — Fondations (1-2 semaines)
- [ ] Migration SQL : nouvelles colonnes + tables
- [ ] API `/api/client/fidelite` (lecture seule)
- [ ] Onglet Fidélité dans l'espace client
- [ ] Attribution des points à chaque commande

### Phase 2 — Système de Blocage (1 semaine)
- [ ] Job de vérification des non-récupérations
- [ ] API de blocage automatique
- [ ] Notifications email d'alerte
- [ ] Indicateur de risque dans l'espace client

### Phase 3 — Avantages (1-2 semaines)
- [ ] Bonus paniers anti-gaspi par niveau
- [ ] Système de cadeau anniversaire
- [ ] Alertes nouveautés produits
- [ ] Codes promo automatiques

### Phase 4 — Gamification (optionnel)
- [ ] Badges et défis
- [ ] Classement mensuel
- [ ] Programme parrainage
- [ ] Doublement de points jours spéciaux

---

## 📈 Métriques de Succès

| KPI | Objectif | Mesure |
|-----|----------|--------|
| Taux de récupération | > 95% | commandes récupérées / total |
| Clients niveau Argent+ | +30% en 6 mois | évolution mensuelle |
| Usage avantages fidélité | > 50% | avantages utilisés / disponibles |
| Commandes en ligne | +25% | comparaison avant/après |
| Satisfaction client | NPS > 50 | enquête trimestrielle |

---

## ❓ Questions à Clarifier

1. **Seuil du cadeau anniversaire** : 10€ minimum d'achat, est-ce adapté ?
2. **Durée du blocage** : 30 jours, ou autre durée ?
3. **Réduction flash supplémentaire** : cumulable avec les 40% de base ?
4. **Produits exclus anniversaire** : toutes pâtisseries ou sélection ?
5. **Notification boulanger** : doit-il voir les clients bloqués ?

---

*Document généré par analyse du codebase BakeryOS le 18/03/2026*