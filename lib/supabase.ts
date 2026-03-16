// lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// En production, les variables sont obligatoires — on bloque au démarrage.
// En développement, on avertit et on utilise des valeurs locales.
const isProduction = process.env.NODE_ENV === 'production';

if (!supabaseUrl || !supabaseAnonKey) {
  const missing =
    (!supabaseUrl     ? '  → NEXT_PUBLIC_SUPABASE_URL\n'     : '') +
    (!supabaseAnonKey ? '  → NEXT_PUBLIC_SUPABASE_ANON_KEY\n' : '');

  const msg =
    '[Supabase] Variables d\'environnement manquantes :\n' +
    missing +
    'Vérifiez votre fichier .env.local';

  if (isProduction) {
    throw new Error(msg);
  }

  console.warn(msg + '\n→ Utilisation des valeurs de développement (localhost:54321)');
}

// Valeurs définitives — en prod elles sont garanties non-undefined par le throw ci-dessus.
// En dev on tolère un fallback local pour ne pas bloquer le hot-reload.
const resolvedUrl = supabaseUrl ?? 'http://localhost:54321';
const resolvedKey = supabaseAnonKey ?? 'anon-key-missing';

export const supabase = createClient(resolvedUrl, resolvedKey, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  },
});

export function getSupabaseAdmin() {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      '[Supabase] NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis côté serveur.\n' +
      'Vérifiez votre .env.local'
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Types base de données ──────────────────────────────────────

export interface DbBoulangerie {
  id:            string;
  user_id:       string;
  nom:           string;
  slug:          string;
  email_contact: string | null;
  plan:          'starter' | 'pro' | 'multi';
  actif:         boolean;
  adresse:       string | null;
  ville:         string | null;
  code_postal:   string | null;
  telephone:     string | null;
  creneaux_retrait:  string[];
  flash_heure_debut: number;
  flash_heure_fin:   number;
  flash_remise_pct:  number;
  tour_completed_at: string | null;
  created_at:    string;
  updated_at:    string;
}

export interface DbJournee {
  id:               string;
  boulangerie_id:   string;
  date:             string;
  commandes_online: number;
  ca_estime:        number;
  taux_invendu:     number;
  total_produit:    number;
  total_invendu:    number;
  cloturee:         boolean;
  created_at:       string;
  updated_at:       string;
  stocks_journaliers?: DbStockJournalier[];
}

export interface DbStockJournalier {
  id:                string;
  journee_id:        string;
  boulangerie_id:    string;
  produit_id:        string;
  produit_nom:       string;
  produit_emoji:     string;
  categorie:         string;
  prix_vente:        number;
  cout_production:   number;
  production:        number;
  snapshot_10h:      number;
  snapshot_10h_done: boolean;
  snapshot_14h:      number;
  snapshot_14h_done: boolean;
  stock_final:       number;
  created_at:        string;
  updated_at:        string;
}

export interface DbCommande {
  id:               string;
  boulangerie_id:   string;
  client_prenom:    string;
  client_email:     string;
  client_telephone: string | null;
  heure_retrait:    string;
  notes:            string | null;
  montant_total:    number;
  statut:           'en_attente' | 'confirmee' | 'prete' | 'recuperee' | 'annulee';
  lignes:           DbLigneCommande[];
  created_at:       string;
  updated_at:       string;
}

export interface DbLigneCommande {
  produit_id:    string;
  produit_nom:   string;
  quantite:      number;
  prix_unitaire: number;
}