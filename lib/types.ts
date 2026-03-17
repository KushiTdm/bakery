// lib/types.ts
// ─────────────────────────────────────────────────────────────
// Types partagés entre le contexte client (context/boulanger-context.tsx)
// et les routes API serveur (app/api/boulanger/journee/route.ts, etc.).
//
// I2 : Ces types étaient définis dans context/boulanger-context.tsx
// (marqué 'use client') et importés depuis des routes serveur.
// Importer un module 'use client' dans une route API peut provoquer
// des erreurs de bundling selon la version de Next.js. On les isole
// ici dans un fichier sans directive, importable des deux côtés.
// ─────────────────────────────────────────────────────────────

// 'flash' ajouté pour l'onglet paniers anti-gaspi dans la nav du bas
export type ViewType   = 'matin' | 'snapshot' | 'soir' | 'flash' | 'catalogue' | 'dashboard' | 'parametres';
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface StockEntry {
  id:              string;
  name:            string;
  emoji:           string;
  category:        'boulangerie' | 'viennoiserie' | 'patisserie';
  prixVente:       number;
  coutProduction:  number;
  production:      number;
  snapshot10h:     number;
  snapshot10hDone: boolean;
  snapshot14h:     number;
  snapshot14hDone: boolean;
  stockFinal:      number;
}

export interface HistoryEntry {
  date:            string;
  chiffreAffaires: number;
  tauxInvendu:     number;
  commandesOnline: number;
  stocks:          StockEntry[];
}

export interface ProductionSuggestion {
  id:            string;
  name:          string;
  emoji:         string;
  avgProduction: number;
  suggestedQty:  number;
  dataPoints:    number;
  changePercent: number;
  confidence:    'high' | 'medium' | 'low';
}