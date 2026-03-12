// lib/supabase.ts
// ─────────────────────────────────────────────────────────────
// Client Supabase — le crash au démarrage est supprimé.
// Les variables manquantes sont gérées silencieusement.
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ── Client navigateur (RLS actif) ─────────────────────────────
// Ne plante pas si les variables sont vides — les appels
// échoueront proprement avec des erreurs réseau.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: true,
      },
    })
  : null as any; // null safe — les composants vérifient isAuthenticated avant d'appeler

// ── Client serveur (service role) ─────────────────────────────
// Instancié à la demande uniquement dans les API routes.
// Ne jamais importer cette fonction côté navigateur.
export function getSupabaseAdmin() {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      '[Supabase] NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis côté serveur. ' +
      'Vérifiez votre .env.local'
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Types base de données ──────────────────────────────────────

export interface DbBoulangerie {
  id: string;
  user_id: string;
  nom: string;
  slug: string;
  email_contact: string | null;
  airtable_api_key: string | null;
  airtable_base_id: string | null;
  plan: 'starter' | 'pro' | 'multi';
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbJournee {
  id: string;
  boulangerie_id: string;
  date: string;
  commandes_online: number;
  ca_estime: number;
  taux_invendu: number;
  total_produit: number;
  total_invendu: number;
  cloturee: boolean;
  created_at: string;
  updated_at: string;
  stocks_journaliers?: DbStockJournalier[];
}

export interface DbStockJournalier {
  id: string;
  journee_id: string;
  boulangerie_id: string;
  produit_id: string;
  produit_nom: string;
  produit_emoji: string;
  categorie: string;
  prix_vente: number;
  cout_production: number;
  production: number;
  snapshot_10h: number;
  snapshot_10h_done: boolean;
  snapshot_14h: number;
  snapshot_14h_done: boolean;
  stock_final: number;
  created_at: string;
  updated_at: string;
}