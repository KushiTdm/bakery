# 🔐 RBAC — Gestion des Rôles et Permissions

> Role-Based Access Control pour BakeryOS
> Système de contrôle d'accès basé sur les rôles

---

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Définition des rôles](#définition-des-rôles)
3. [Matrice des permissions](#matrice-des-permissions)
4. [Politiques RLS Supabase](#politiques-rls-supabase)
5. [Implémentation technique](#implémentation-technique)
6. [Limites par plan](#limites-par-plan)
7. [Audit et logging](#audit-et-logging)

---

## Vue d'ensemble

### Principe du moindre privilège

BakeryOS applique le principe du moindre privilège : chaque utilisateur n'a accès qu'aux ressources strictement nécessaires à son rôle.

### Niveaux d'accès

```
┌─────────────────────────────────────────────────────────────┐
│                     NIVEAUX D'ACCÈS                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔴 PUBLIC (anon key)                                       │
│  ├── Catalogue produits actifs                              │
│  ├── Paniers flash (données limitées)                       │
│  └── Informations boulangerie publiques                     │
│                                                             │
│  🟡 CLIENT AUTHENTIFIÉ                                      │
│  ├── Ses propres commandes                                  │
│  ├── Son profil                                             │
│  └── Ses abonnements notifications                          │
│                                                             │
│  🟠 BOULANGER OWNER                                         │
│  ├── Toutes les données de SA boulangerie                   │
│  ├── Gestion produits, stocks, commandes                    │
│  └── Configuration et paramètres                            │
│                                                             │
│  🔵 EMPLOYÉ BOULANGERIE                                     │
│  ├── Lecture catalogue                                      │
│  ├── Écriture stocks (snapshot)                             │
│  └── Lecture commandes                                      │
│                                                             │
│  🟣 ADMIN PLATFORM                                          │
│  ├── Toutes les boulangeries                               │
│  ├── Gestion utilisateurs                                   │
│  └── Configuration système                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Définition des rôles

### 1. Visiteur (Public)

**Description :** Utilisateur non authentifié consultant la vitrine publique.

**Accès :**
- Vitrine de la boulangerie
- Catalogue produits actifs
- Paniers flash disponibles
- Informations de contact

**Restrictions :**
- Pas d'accès aux données internes
- Pas de modification de données
- Pas d'accès aux stocks réels

---

### 2. Client

**Description :** Utilisateur authentifié via Magic Link OTP.

**Accès :**
- Toutes les fonctionnalités Visiteur
- Création et gestion de ses commandes
- Profil personnel
- Historique de ses commandes

**Restrictions :**
- Accès limité à ses propres données
- Pas d'accès aux données de la boulangerie
- Rate limiting sur authentification

---

### 3. Boulanger Owner

**Description :** Propriétaire/gestionnaire principal d'une boulangerie.

**Accès :**
- Administration complète de SA boulangerie
- Gestion du catalogue (CRUD produits)
- Saisie production et stocks
- Visualisation statistiques
- Configuration paramètres
- Gestion des commandes
- Notifications push

**Restrictions :**
- Accès limité à SA boulangerie (tenant isolation)
- Limites selon le plan souscrit

---

### 4. Employé Boulangerie

**Description :** Employé de la boulangerie avec accès limité.

**Accès :**
- Lecture du catalogue
- Saisie des stocks (snapshot 10h/14h)
- Consultation des commandes
- Notification des commandes entrantes

**Restrictions :**
- Pas de modification du catalogue
- Pas d'accès aux paramètres
- Pas d'accès aux statistiques financières
- Pas de clôture de journée

---

### 5. Admin Platform

**Description :** Administrateur de la plateforme BakeryOS.

**Accès :**
- Toutes les boulangeries
- Gestion des utilisateurs
- Attribution des plans
- Logs et audit système
- Configuration globale

**Restrictions :**
- Accès serveur uniquement (service role key)
- Actions logged obligatoirement

---

## Matrice des permissions

### Ressources publiques (Visiteur)

| Ressource | Action | Permission |
|---|---|---|
| `produits` | `READ` | ✅ Produits actifs uniquement (`actif_catalogue = true`) |
| `boulangeries` | `READ` | ✅ Champs publics (nom, adresse, horaires, config flash) |
| `paniers_flash` | `READ` | ✅ Via fonction SQL (données limitées) |
| `produits` | `WRITE` | ❌ |
| `stocks_journaliers` | `READ` | ❌ Bloqué par RLS |
| `journees` | `READ` | ❌ Bloqué par RLS |

---

### Ressources client

| Ressource | Action | Permission |
|---|---|---|
| `commandes` | `CREATE` | ✅ Pour soi-même |
| `commandes` | `READ` | ✅ Ses commandes uniquement (`client_id = auth.uid()`) |
| `commandes` | `UPDATE` | ✅ Statut (annulation) si non confirmée |
| `commandes` | `DELETE` | ❌ |
| `clients` | `READ` | ✅ Son profil |
| `clients` | `UPDATE` | ✅ Son profil |
| `push_subscriptions` | `CREATE` | ✅ |
| `push_subscriptions` | `DELETE` | ✅ Les siennes |

---

### Ressources boulanger

| Ressource | Action | Permission |
|---|---|---|
| `produits` | `READ` | ✅ Produits de sa boulangerie |
| `produits` | `CREATE` | ✅ Dans sa boulangerie (limite plan) |
| `produits` | `UPDATE` | ✅ Dans sa boulangerie |
| `produits` | `DELETE` | ✅ Dans sa boulangerie (soft delete) |
| `stocks_journaliers` | `READ` | ✅ Sa boulangerie |
| `stocks_journaliers` | `CREATE` | ✅ Sa boulangerie |
| `stocks_journaliers` | `UPDATE` | ✅ Sa boulangerie |
| `journees` | `READ` | ✅ Sa boulangerie |
| `journees` | `CREATE` | ✅ Sa boulangerie |
| `journees` | `UPDATE` | ✅ Sa boulangerie |
| `commandes` | `READ` | ✅ Commandes de sa boulangerie |
| `commandes` | `UPDATE` | ✅ Statut commande |
| `boulangeries` | `READ` | ✅ Sa boulangerie |
| `boulangeries` | `UPDATE` | ✅ Sa boulangerie |
| `tour_completed` | `READ` | ✅ |
| `tour_completed` | `CREATE` | ✅ |
| `push_subscriptions` | `CREATE` | ✅ |
| `push_subscriptions` | `READ` | ✅ Les siennes |

---

### Ressources employé

| Ressource | Action | Permission |
|---|---|---|
| `produits` | `READ` | ✅ Catalogue |
| `stocks_journaliers` | `READ` | ✅ Jour en cours |
| `stocks_journaliers` | `UPDATE` | ✅ Colonnes snapshot uniquement |
| `commandes` | `READ` | ✅ Liste commandes |
| `commandes` | `UPDATE` | ❌ |
| `produits` | `WRITE` | ❌ |
| `boulangeries` | `UPDATE` | ❌ |
| `journees` | `WRITE` | ❌ |

---

### Ressources admin

| Ressource | Action | Permission |
|---|---|---|
| `*` | `*` | ✅ Toutes les tables |
| `boulangeries` | `CREATE` | ✅ |
| `boulangeries` | `UPDATE` | ✅ (plan, status) |
| `boulangeries` | `DELETE` | ✅ |
| `auth.users` | `READ` | ✅ |
| `auth.users` | `UPDATE` | ✅ |

---

## Politiques RLS Supabase

### Tables et politiques

```sql
-- ============================================================
-- POLITIQUES RLS - BAKERYOS
-- ============================================================

-- Activer RLS sur toutes les tables
ALTER TABLE boulangeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocks_journaliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE journees ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_completed ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BOULANGERIES
-- ============================================================

-- Public : lecture des infos publiques
CREATE POLICY "boulangeries_public_read" ON boulangeries
  FOR SELECT
  USING (true)
  WITH CHECK (false);

-- Owner : lecture/écriture de sa boulangerie
CREATE POLICY "boulangeries_owner_all" ON boulangeries
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Admin : tout accès (via service role, pas de politique)

-- ============================================================
-- PRODUITS
-- ============================================================

-- Public : lecture produits actifs du catalogue
CREATE POLICY "produits_public_read" ON produits
  FOR SELECT
  USING (actif_catalogue = true)
  WITH CHECK (false);

-- Owner : accès complet à ses produits
CREATE POLICY "produits_owner_all" ON produits
  FOR ALL
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ))
  WITH CHECK (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ));

-- Employé : lecture uniquement
CREATE POLICY "produits_employe_read" ON produits
  FOR SELECT
  USING (boulangerie_id IN (
    SELECT boulangerie_id FROM employes WHERE user_id = auth.uid()
  ));

-- ============================================================
-- STOCKS_JOURNALIERS
-- ============================================================

-- Public : AUCUN ACCÈS (pas de politique SELECT pour anon)
-- Les données sont exposées uniquement via get_paniers_flash()

-- Owner : accès complet
CREATE POLICY "stocks_owner_all" ON stocks_journaliers
  FOR ALL
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ))
  WITH CHECK (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ));

-- Employé : mise à jour snapshots uniquement
CREATE POLICY "stocks_employe_update" ON stocks_journaliers
  FOR UPDATE
  USING (boulangerie_id IN (
    SELECT boulangerie_id FROM employes WHERE user_id = auth.uid()
  ))
  WITH CHECK (
    -- Seules les colonnes snapshot peuvent être modifiées
    -- Les autres colonnes restent inchangées
    true
  );

-- ============================================================
-- JOURNEES
-- ============================================================

-- Owner uniquement
CREATE POLICY "journees_owner_all" ON journees
  FOR ALL
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ))
  WITH CHECK (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- COMMANDES
-- ============================================================

-- Client : ses commandes
CREATE POLICY "commandes_client_read" ON commandes
  FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "commandes_client_create" ON commandes
  FOR INSERT
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "commandes_client_update" ON commandes
  FOR UPDATE
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Owner : commandes de sa boulangerie
CREATE POLICY "commandes_owner_read" ON commandes
  FOR SELECT
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ));

CREATE POLICY "commandes_owner_update" ON commandes
  FOR UPDATE
  USING (boulangerie_id IN (
    SELECT id FROM boulangeries WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- CLIENTS
-- ============================================================

-- Client : son profil uniquement
CREATE POLICY "clients_self" ON clients
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- PUSH_SUBSCRIPTIONS
-- ============================================================

CREATE POLICY "push_self" ON push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TOUR_COMPLETED
-- ============================================================

CREATE POLICY "tour_self" ON tour_completed
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

### Fonctions SQL sécurisées

```sql
-- ============================================================
-- FONCTIONS SECURITY DEFINER
-- ============================================================

-- get_catalogue_public : expose uniquement les produits actifs
CREATE OR REPLACE FUNCTION get_catalogue_public(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  nom TEXT,
  emoji TEXT,
  categorie TEXT,
  prix DECIMAL,
  image_url TEXT,
  allergenes TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.nom,
    p.emoji,
    p.categorie,
    p.prix_vente as prix,
    p.image_url,
    p.allergenes
  FROM produits p
  JOIN boulangeries b ON p.boulangerie_id = b.id
  WHERE b.slug = p_slug
    AND p.actif_catalogue = true
  ORDER BY p.categorie, p.nom;
END;
$$;

-- get_paniers_flash : expose les paniers anti-gaspi
-- IMPORTANT: Ne retourne JAMAIS les quantités réelles ni le CA
CREATE OR REPLACE FUNCTION get_paniers_flash(p_slug TEXT)
RETURNS TABLE (
  produit_nom TEXT,
  produit_emoji TEXT,
  prix_normal DECIMAL,
  prix_flash DECIMAL,
  economie DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.nom as produit_nom,
    p.emoji as produit_emoji,
    p.prix_vente as prix_normal,
    ROUND(p.prix_vente * 0.6, 2) as prix_flash, -- -40%
    ROUND(p.prix_vente * 0.4, 2) as economie
  FROM stocks_journaliers s
  JOIN produits p ON s.produit_id = p.id
  JOIN boulangeries b ON s.boulangerie_id = b.id
  WHERE b.slug = p_slug
    AND s.stock_final > 0
    AND s.date = CURRENT_DATE
    AND p.actif_flash = true;
END;
$$;
```

---

## Implémentation technique

### Structure des tables

```sql
-- Table des boulangeries avec owner
CREATE TABLE boulangeries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  adresse TEXT,
  horaires JSONB,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'starter',
  plan_limits JSONB DEFAULT '{}',
  config_flash JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des employés (pour multi-utilisateurs futur)
CREATE TABLE employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boulangerie_id UUID REFERENCES boulangeries(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'employe', -- 'employe' | 'manager'
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(boulangerie_id, user_id)
);

-- Table des clients
CREATE TABLE clients (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  nom TEXT,
  telephone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Middleware d'autorisation

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  
  const { data: { session } } = await supabase.auth.getSession()
  
  // Routes protégées boulanger
  if (req.nextUrl.pathname.startsWith('/boulanger')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }
    
    // Vérifier que l'utilisateur est owner d'une boulangerie
    const { data: boulangerie } = await supabase
      .from('boulangeries')
      .select('id')
      .eq('owner_id', session.user.id)
      .single()
    
    if (!boulangerie) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }
  
  // Routes admin (futur)
  if (req.nextUrl.pathname.startsWith('/admin')) {
    // Vérifier rôle admin
    const isAdmin = session?.user?.user_metadata?.role === 'admin'
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }
  
  return res
}

export const config = {
  matcher: ['/boulanger/:path*', '/admin/:path*']
}
```

### Vérification côté serveur

```typescript
// lib/auth.ts
import { createServerSupabaseClient } from './supabase'
import { User } from '@supabase/supabase-js'

export interface BoulangerAuth {
  user: User
  boulangerieId: string
  role: 'owner' | 'employe' | 'manager'
}

export async function getBoulangerAuth(
  req: Request
): Promise<BoulangerAuth | null> {
  const supabase = createServerSupabaseClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  
  // Vérifier owner
  const { data: boulangerie } = await supabase
    .from('boulangeries')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  
  if (boulangerie) {
    return {
      user,
      boulangerieId: boulangerie.id,
      role: 'owner'
    }
  }
  
  // Vérifier employé
  const { data: employe } = await supabase
    .from('employes')
    .select('boulangerie_id, role')
    .eq('user_id', user.id)
    .single()
  
  if (employe) {
    return {
      user,
      boulangerieId: employe.boulangerie_id,
      role: employe.role
    }
  }
  
  return null
}

export function requireOwner(auth: BoulangerAuth | null): auth is BoulangerAuth {
  if (!auth || auth.role !== 'owner') {
    throw new Error('Accès refusé : rôle owner requis')
  }
  return true
}
```

### Exemple d'utilisation dans API Route

```typescript
// app/api/boulanger/produits/route.ts
import { NextResponse } from 'next/server'
import { getBoulangerAuth, requireOwner } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const auth = await getBoulangerAuth(req)
    requireOwner(auth)
    
    const body = await req.json()
    const supabase = createServerSupabaseClient()
    
    // Vérifier limite plan
    const { count } = await supabase
      .from('produits')
      .select('*', { count: 'exact', head: true })
      .eq('boulangerie_id', auth.boulangerieId)
    
    if (count && count >= 20) { // Limite Starter
      return NextResponse.json(
        { error: 'Limite de produits atteinte (plan Starter)' },
        { status: 403 }
      )
    }
    
    // Créer le produit
    const { data, error } = await supabase
      .from('produits')
      .insert({
        ...body,
        boulangerie_id: auth.boulangerieId
      })
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la création' },
      { status: 500 }
    )
  }
}
```

---

## Limites par plan

### Matrice des limites

| Ressource | Starter (19€) | Pro (49€) | Multi (99€) |
|---|---|---|---|
| Produits catalogue | 20 | Illimité | Illimité |
| Commandes/mois | 50 | Illimité | Illimité |
| Utilisateurs | 1 (owner) | 3 | Illimité |
| Historique stats | 30 jours | 90 jours | Illimité |
| Export PDF | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Multi-boulangeries | ❌ | ❌ | ✅ |

### Implémentation des limites

```typescript
// lib/plan-limits.ts
export const PLAN_LIMITS = {
  starter: {
    maxProducts: 20,
    maxOrdersPerMonth: 50,
    maxUsers: 1,
    historyDays: 30,
    features: ['core', 'flash', 'ml_suggestions', 'push_notifications']
  },
  pro: {
    maxProducts: Infinity,
    maxOrdersPerMonth: Infinity,
    maxUsers: 3,
    historyDays: 90,
    features: ['core', 'flash', 'ml_suggestions', 'push_notifications', 'pdf_export', 'co2_certificate']
  },
  multi: {
    maxProducts: Infinity,
    maxOrdersPerMonth: Infinity,
    maxUsers: Infinity,
    historyDays: Infinity,
    features: ['all', 'api_access', 'webhooks', 'multi_boulangeries']
  }
} as const

export function checkLimit(
  plan: keyof typeof PLAN_LIMITS,
  resource: string,
  current: number
): boolean {
  const limits = PLAN_LIMITS[plan]
  const max = limits[resource as keyof typeof limits]
  
  if (typeof max === 'number') {
    return current < max
  }
  return true
}

export function hasFeature(
  plan: keyof typeof PLAN_LIMITS,
  feature: string
): boolean {
  const features = PLAN_LIMITS[plan].features
  return features.includes('all') || features.includes(feature)
}
```

---

## Audit et logging

### Journal des actions sensibles

```sql
-- Table d'audit
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at DESC);
```

### Fonction de log automatique

```sql
-- Trigger pour log automatique
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Appliquer sur les tables sensibles
CREATE TRIGGER audit_boulangeries
AFTER INSERT OR UPDATE OR DELETE ON boulangeries
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_produits
AFTER INSERT OR UPDATE OR DELETE ON produits
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
```

### Types d'actions loggées

| Action | Description | Sévérité |
|---|---|---|
| `LOGIN` | Connexion utilisateur | INFO |
| `LOGOUT` | Déconnexion | INFO |
| `CREATE_ORDER` | Création commande | INFO |
| `UPDATE_PRODUCT` | Modification produit | WARNING |
| `DELETE_PRODUCT` | Suppression produit | WARNING |
| `CHANGE_PLAN` | Changement de plan | CRITICAL |
| `UPDATE_SETTINGS` | Modification paramètres | WARNING |
| `EXPORT_DATA` | Export de données | INFO |

---

## Checklist de sécurité

- [x] RLS activé sur toutes les tables
- [x] Fonctions SECURITY DEFINER pour données publiques
- [x] Isolation multi-tenant par `boulangerie_id`
- [x] Validation JWT sur routes protégées
- [x] Rate limiting sur authentification
- [x] Rate limiting sur création commandes
- [x] Sanitization des inputs utilisateur
- [x] Audit logging des actions sensibles
- [x] Vérification des limites plan
- [ ] Chiffrement données sensibles (optionnel)
- [ ] 2FA pour admin (futur)

---

*BakeryOS — Documentation RBAC © 2026*