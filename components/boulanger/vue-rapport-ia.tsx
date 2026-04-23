'use client';
// components/boulanger/vue-rapport-ia.tsx — Levain v5
// v5 : corrections sécurité & UX
//   - today récupéré depuis /api/boulanger/ai/today (timezone boulangerie)
//   - StarterBanner visible quand starter_preview = true
//   - QuotaInfo importé depuis upgrade-modal (single source of truth)
//   - starterPreview affiché dans l'UI (plus seulement en state silencieux)

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, TrendingUp, TrendingDown, Zap, ShoppingBag, AlertTriangle,
  ChevronRight, Loader2, Check, BarChart2, ArrowUpRight, ArrowDownRight,
  Minus, Play, CheckCircle2, X, Info, Calendar, ChevronLeft, Wheat,
  Package2, Sun, CloudRain, Eye, Coffee, Users, Briefcase,
  Heart, Star, MessageSquare, Trophy, Target, Lightbulb,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { UpgradeModal, StarterBanner, useUpgradeModal, type QuotaInfo } from './upgrade-modal';

// ── Types rapport ─────────────────────────────────────────────

interface BriefingMatin {
  titre?:                string;
  contexte_jour?:        string;
  meteo_resume?:         string;
  impact_meteo_vente?:   string;
  top3_a_produire?:      string[];
  point_vigilance?:      string;
  fiabilite_previsions?: string;
  conseil_ouverture?:    string;
}

interface BriefingVendeuse {
  titre?:                      string;
  accueil_client?:             string;
  produits_a_mettre_en_avant?: string[];
  gestion_fin_journee?:        string;
  message_encouragement?:      string;
  retour_integre?:             string;
}

interface BriefingGerant {
  titre?:                 string;
  tendances_ca?:          string;
  points_attention?:      string[];
  opportunites_business?: string[];
  recommendation?:        string;
}

interface SyntheseJournee {
  resume?:              string;
  points_forts?:        string[];
  points_amelioration?: string[];
  message_equipe?:      string;
}

interface AnalyseProduit {
  nom:              string;
  emoji?:           string;
  taux_vente?:      number;
  taux_invendu?:    number;
  commentaire?:     string;
  cause_probable?:  string;
  action?:          string;
}

interface AnalyseProduits {
  top_ventes?:         AnalyseProduit[];
  invendus_critiques?: AnalyseProduit[];
  opportunites?:       string[];
}

interface AnalyseContextuelle {
  impact_meteo?:           string;
  impact_evenements?:      string;
  correlation_historique?: string;
}

interface AnalyseCommandes {
  click_collect?: { resume?: string; performance?: string; conseil?: string };
  anti_gaspi?:    { resume?: string; impact?: string; conseil?: string };
}

interface AnalyseClients {
  nouveaux?:       string;
  tendances?:      string;
  recommendation?: string;
}

interface ConsignesTransmises {
  au_boulanger?:  string;
  a_la_vendeuse?: string;
}

interface RapportJSON {
  score?:   number;
  verdict?: string;

  // Schéma v3
  synthese_journee?:     SyntheseJournee;
  analyse_produits?:     AnalyseProduits;
  analyse_contextuelle?: string | AnalyseContextuelle;
  analyse_commandes?:    AnalyseCommandes;
  analyse_clients?:      AnalyseClients;
  matieres_premieres?:   {
    resume?: string;
    alertes?: string[];
    details?: { ingredient: string; quantite: string; observation?: string }[];
  };
  briefing_matin?:       BriefingMatin;
  briefing_vendeuse?:    BriefingVendeuse;
  briefing_gerant?:      BriefingGerant;
  consignes_transmises?: ConsignesTransmises;
  message_levain?:       string;
  defis?: {
    cible:      'boulanger' | 'vendeuse';
    titre:      string;
    objectif:   string;
    conseil:    string;
    motivation: string;
  }[];

  // Compatibilité schéma v2
  succes?:               string[];
  flops?:                string[];
  anti_gaspillage?:      string[];
  opportunites?:         string[];
  alerte_ingredients?:   string[];

  // Flag Starter
  _starter_preview?:  boolean;
  _upgrade_message?:  string;
}

interface AiRapport {
  id:                string;
  date:              string;
  score_performance: number | null;
  verdict_flash:     string | null;
  rapport_json:      RapportJSON;
  statut:            'en_cours' | 'genere' | 'erreur';
  erreur_msg:        string | null;
  created_at:        string;
}

interface ProductionForecast {
  id:                string;
  produit_id:        string;
  produit_nom:       string;
  produit_categorie: string;
  produit_emoji:     string;
  quantite_suggeree: number;
  quantite_base:     number;
  variation_pct:     number;
  raison:            string | null;
  appliquee:         boolean;
}

// ── Helpers ───────────────────────────────────────────────────

/** Convertit n'importe quelle valeur IA en string affichable (l'IA retourne parfois des objets au lieu de strings) */
function toStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return String(v ?? '');
  const o = v as Record<string, unknown>;
  if (o.produit && o.argumentaire) return `${o.produit} : ${o.argumentaire}`;
  if (o.produit && o.description)  return `${o.produit} : ${o.description}`;
  if (o.titre && o.contenu)        return `${o.titre} : ${o.contenu}`;
  if (o.texte)                     return String(o.texte);
  if (o.contenu)                   return String(o.contenu);
  if (o.description)               return String(o.description);
  if (o.nom)                       return String(o.nom);
  return JSON.stringify(v);
}

function getAnalyseContextuelle(rj: RapportJSON): string {
  const ac = rj.analyse_contextuelle;
  if (!ac) return '';
  if (typeof ac === 'string') return ac;
  return [ac.impact_meteo, ac.impact_evenements, ac.correlation_historique].filter(Boolean).join(' · ');
}

function isV3(rj: RapportJSON): boolean {
  return !!(rj.synthese_journee || rj.analyse_produits || rj.analyse_commandes);
}

// ── Sous-composants ───────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 45, circ = 2 * Math.PI * r, dash = (score / 100) * circ;
  const col = score >= 85 ? '#4ADE80' : score >= 65 ? '#C19A6B' : score >= 45 ? '#FBBF24' : '#F87171';
  return (
    <div className="relative inline-flex items-center justify-center w-28 h-28">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <motion.circle cx="56" cy="56" r={r} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          style={{ filter: `drop-shadow(0 0 8px ${col}66)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }} className="text-3xl font-black font-mono" style={{ color: col }}>
          {score}
        </motion.span>
        <span className="text-white/30 text-[9px] font-bold uppercase tracking-widest">/ 100</span>
      </div>
    </div>
  );
}

function VBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="flex items-center gap-0.5 text-white/35 text-xs"><Minus size={10} /> Stable</span>;
  if (pct > 0)   return <span className="flex items-center gap-0.5 text-green-400 text-xs font-semibold"><ArrowUpRight size={12} /> +{pct}%</span>;
  return             <span className="flex items-center gap-0.5 text-red-400 text-xs font-semibold"><ArrowDownRight size={12} /> {pct}%</span>;
}

function HistoCard({ r, onSelect }: { r: AiRapport; onSelect: () => void }) {
  const d = new Date(r.date + 'T12:00:00');
  const label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const s   = r.score_performance;
  const col = s == null ? '#ffffff30' : s >= 85 ? '#4ADE80' : s >= 65 ? '#C19A6B' : s >= 45 ? '#FBBF24' : '#F87171';
  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all hover:bg-white/5 bg-white/3 border-white/7">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${col}18`, border: `1px solid ${col}30` }}>
        <span className="font-black text-sm font-mono" style={{ color: col }}>{s ?? '—'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white/75 text-sm font-medium capitalize">{label}</p>
        <p className="text-white/35 text-xs truncate">{r.verdict_flash ?? '—'}</p>
      </div>
      <ChevronRight size={14} className="text-white/20 flex-shrink-0" />
    </button>
  );
}

function BriefingMatinCard({ bm, previsions, onApply, applying, applied, isToday, demainLabel }: {
  bm: BriefingMatin; previsions: ProductionForecast[]; onApply: () => void;
  applying: boolean; applied: boolean; isToday: boolean; demainLabel: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      className="rounded-2xl overflow-hidden border"
      style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.08),rgba(193,154,107,0.08))', borderColor: 'rgba(139,92,246,0.25)' }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
          <Coffee size={16} className="text-purple-400" />
        </div>
        <div>
          <p className="text-purple-400 text-[10px] font-semibold uppercase tracking-widest">Briefing Boulanger</p>
          <p className="text-white font-bold text-sm leading-tight">{bm.titre ?? 'Votre journée de demain'}</p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {bm.contexte_jour && <p className="text-white/70 text-sm leading-relaxed">{bm.contexte_jour}</p>}
        {(bm.meteo_resume || bm.impact_meteo_vente) && (
          <div className="bg-white/4 border border-white/8 rounded-xl px-3.5 py-3 space-y-1">
            {bm.meteo_resume && <div className="flex items-center gap-2"><Sun size={12} className="text-amber-400 flex-shrink-0" /><p className="text-white/65 text-xs font-medium">{bm.meteo_resume}</p></div>}
            {bm.impact_meteo_vente && <div className="flex items-center gap-2"><CloudRain size={12} className="text-blue-400 flex-shrink-0" /><p className="text-white/50 text-xs">{bm.impact_meteo_vente}</p></div>}
          </div>
        )}
        {bm.top3_a_produire && bm.top3_a_produire.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-white/35 text-[10px] font-semibold uppercase tracking-wider">Priorités production</p>
            {bm.top3_a_produire.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[#C19A6B] font-black text-xs mt-0.5 w-4 flex-shrink-0">{i + 1}.</span>
                <p className="text-white/75 text-sm leading-snug">{toStr(item)}</p>
              </div>
            ))}
          </div>
        )}
        {previsions.length > 0 && (
          <div className="rounded-xl border overflow-hidden bg-white/3 border-white/7">
            <div className="grid grid-cols-3 px-3 py-2 border-b border-white/5 text-[9px] text-white/30 font-semibold uppercase tracking-wider">
              <span>Produit</span><span className="text-center">Demain</span><span className="text-right">Variation</span>
            </div>
            {previsions.slice(0, 6).map(p => (
              <div key={p.id} className="grid grid-cols-3 items-center px-3 py-2 border-b border-white/4 last:border-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm flex-shrink-0">{p.produit_emoji}</span>
                  <p className="text-white/60 text-[11px] truncate">{p.produit_nom}</p>
                </div>
                <div className="text-center"><span className="text-white font-bold font-mono text-sm">{p.quantite_suggeree}</span></div>
                <div className="flex justify-end"><VBadge pct={p.variation_pct} /></div>
              </div>
            ))}
            {previsions.length > 6 && (
              <div className="px-3 py-2 text-center">
                <p className="text-white/25 text-[10px]">+{previsions.length - 6} autres dans l'onglet Plan</p>
              </div>
            )}
          </div>
        )}
        {bm.point_vigilance && (
          <div className="flex items-start gap-2.5 bg-amber-400/8 border border-amber-400/20 rounded-xl px-3.5 py-2.5">
            <Eye size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300/90 text-xs leading-relaxed"><strong>Point vigilance :</strong> {bm.point_vigilance}</p>
          </div>
        )}
        {bm.fiabilite_previsions && (
          <p className="text-white/30 text-[10px] italic leading-relaxed">{bm.fiabilite_previsions}</p>
        )}
        {bm.conseil_ouverture && (
          <div className="flex items-start gap-2.5 bg-green-500/8 border border-green-500/20 rounded-xl px-3.5 py-2.5">
            <Check size={13} className="text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-green-300/90 text-xs leading-relaxed">{bm.conseil_ouverture}</p>
          </div>
        )}
        {isToday && previsions.length > 0 && (
          <motion.button whileTap={{ scale: 0.97 }} onClick={onApply} disabled={applying || applied}
            className="w-full py-3.5 rounded-xl flex items-center justify-center gap-2.5 font-bold text-sm transition-all disabled:opacity-60"
            style={{
              background: applied
                ? 'rgba(74,222,128,0.15)'
                : 'linear-gradient(135deg,rgba(139,92,246,0.25),rgba(193,154,107,0.15))',
              border: applied ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(139,92,246,0.35)',
              color:  applied ? 'rgb(74,222,128)' : '#C19A6B',
            }}>
            {applying   ? <><Loader2 size={16} className="animate-spin" /> Application…</> :
             applied    ? <><CheckCircle2 size={16} /> Plan appliqué pour {demainLabel} ✓</> :
                          <><Play size={15} /> Appliquer ce plan pour {demainLabel}</>}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function VueRapportIA({ onClose }: { onClose?: () => void }) {
  const [currentRapport, setCR]      = useState<AiRapport | null>(null);
  const [previsions,     setPrev]    = useState<ProductionForecast[]>([]);
  const [historique,     setHisto]   = useState<AiRapport[]>([]);
  const [loading,        setLoading] = useState(true);
  const [generating,     setGen]     = useState(false);
  const [applying,       setApply]   = useState(false);
  const [error,          setError]   = useState<string | null>(null);
  const [applied,        setApplied] = useState(false);
  const [showHisto,      setShowHisto] = useState(false);
  const [gamiStats,      setGamiStats] = useState<{ reussisToday: number; totalToday: number; streak: number; xpToday: number } | null>(null);

  // today en timezone boulangerie (via API) — pas new Date() en UTC
  const [today,      setToday]      = useState<string>('');
  const [demainDate, setDemainDate] = useState<string>('');
  const [demainLabel, setDemainLabel] = useState<string>('');

  // Timeout polling en_cours (2 min max)
  const [pollingStart, setPollingStart] = useState<number | null>(null);
  const pollingTimedOut = pollingStart !== null && Date.now() - pollingStart > 2 * 60 * 1000;

  // P0-4 — Feature gate
  const upgradeModal    = useUpgradeModal();
  const [starterPreview, setStarterPreview] = useState(false);
  const [quotaInfo,      setQuotaInfo]      = useState<QuotaInfo | undefined>(undefined);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  // Récupérer la date aujourd'hui dans le timezone de la boulangerie
  useEffect(() => {
    (async () => {
      const tok = await getToken();
      if (!tok) return;
      try {
        const res = await fetch('/api/boulanger/ai/today', {
          headers: { Authorization: `Bearer ${tok}` },
          cache:   'no-store',
        });
        if (res.ok) {
          const j = await res.json() as { today: string; timezone: string };
          const t = j.today;
          setToday(t);
          const d = new Date(t + 'T12:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          const dm = d.toISOString().split('T')[0];
          setDemainDate(dm);
          setDemainLabel(
            new Date(dm + 'T12:00:00').toLocaleDateString('fr-FR', {
              weekday: 'long', day: 'numeric', month: 'long',
            })
          );
        }
      } catch { /* fallback silencieux */ }
    })();
  }, []);

  const loadRapport = useCallback(async (date?: string) => {
    if (!today && !date) return;
    const targetDate = date ?? today;
    setLoading(true); setError(null);
    try {
      const tok = await getToken();
      if (!tok) { setError('Non authentifié'); return; }
      const res = await fetch(`/api/boulanger/ai/rapport?date=${targetDate}`, {
        headers: { Authorization: `Bearer ${tok}` },
        cache:   'no-store',
      });
      if (!res.ok) return;
      const j = await res.json() as {
        rapport:         AiRapport | null;
        previsions:      ProductionForecast[];
        quota_info?:     QuotaInfo;
        starter_preview?: boolean;
      };
      setCR(j.rapport);
      setPrev(j.previsions ?? []);
      if (j.quota_info)     setQuotaInfo(j.quota_info);
      if (j.starter_preview !== undefined) setStarterPreview(!!j.starter_preview);
      if (j.previsions?.every(p => p.appliquee)) setApplied(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [today]);

  const loadHisto = useCallback(async () => {
    try {
      const tok = await getToken();
      if (!tok) return;
      const res = await fetch('/api/boulanger/ai/historique', {
        headers: { Authorization: `Bearer ${tok}` },
        cache:   'no-store',
      });
      if (!res.ok) return;
      const j = await res.json() as { rapports: AiRapport[] };
      setHisto(j.rapports ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (today) { loadRapport(); loadHisto(); } }, [today, loadRapport, loadHisto]);

  // Stats gamification (défis du jour + streak) pour badge hero
  useEffect(() => {
    if (!today) return;
    (async () => {
      try {
        const tok = await getToken();
        if (!tok) return;
        const res = await fetch(`/api/boulanger/defis?date=${today}`, {
          headers: { Authorization: `Bearer ${tok}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const j = await res.json() as {
          defisToday?: { statut: string; xp_gagne?: number }[];
          profil?: { streak_actuel?: number };
        };
        const defisToday = j.defisToday ?? [];
        const reussisToday = defisToday.filter(d => d.statut === 'reussi').length;
        const xpToday = defisToday.reduce((s, d) => s + (d.xp_gagne ?? 0), 0);
        setGamiStats({
          reussisToday,
          totalToday: defisToday.length,
          streak: j.profil?.streak_actuel ?? 0,
          xpToday,
        });
      } catch { /* silent */ }
    })();
  }, [today, currentRapport?.id]);

  useEffect(() => {
    if (currentRapport?.statut !== 'en_cours') {
      setPollingStart(null);
      return;
    }
    if (!pollingStart) setPollingStart(Date.now());
    const t = setInterval(() => loadRapport(), 3000);
    return () => clearInterval(t);
  }, [currentRapport?.statut, loadRapport, pollingStart]);

  const handleGenerate = async () => {
    setGen(true); setError(null);
    try {
      const tok = await getToken();
      if (!tok) { setError('Non authentifié'); return; }
      const res = await fetch('/api/boulanger/ai/rapport', {
        method:  'POST',
        headers: { Authorization: `Bearer ${tok}` },
      });
      const j = await res.json() as {
        rapport?:         AiRapport;
        previsions?:      ProductionForecast[];
        error?:           string;
        quota_reached?:   boolean;
        upgrade_required?: boolean;
        quota_info?:      QuotaInfo;
        starter_preview?: boolean;
      };

      // Quota atteint (402)
      if (res.status === 402 || j.quota_reached) {
        upgradeModal.showUpgradeModal('quota_reached', j.quota_info ? {
          plan:            j.quota_info.plan,
          quota_limit:     j.quota_info.quota_limit,
          quota_used:      j.quota_info.quota_used,
          quota_remaining: j.quota_info.quota_remaining,
        } : undefined);
        return;
      }

      // Rapport déjà en cours de génération (409)
      if (res.status === 409) {
        await loadRapport();
        return;
      }

      if (!res.ok) { setError(j.error ?? 'Erreur'); return; }

      if (j.quota_info)              setQuotaInfo(j.quota_info);
      if (j.starter_preview !== undefined) setStarterPreview(!!j.starter_preview);
      if (j.rapport)   setCR(j.rapport);
      if (j.previsions) setPrev(j.previsions);
    } catch { setError('Erreur réseau'); }
    finally { setGen(false); }
  };

  const handleApply = async () => {
    if (applied) return;
    setApply(true);
    try {
      const tok = await getToken();
      if (!tok) return;
      const res = await fetch('/api/boulanger/ai/appliquer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body:    JSON.stringify({ date_production: demainDate }),
      });
      if (res.ok) { setApplied(true); await loadRapport(); }
    } finally { setApply(false); }
  };

  // ── Données normalisées ────────────────────────────────────

  const rj = currentRapport?.rapport_json ?? {} as RapportJSON;
  const hasRapport   = currentRapport?.statut === 'genere';
  const isGenerating = currentRapport?.statut === 'en_cours' || generating;
  const isToday      = currentRapport?.date === today;
  const allApplied   = applied || (previsions.length > 0 && previsions.every(p => p.appliquee));
  const v3           = isV3(rj);

  const synthese         = rj.synthese_journee;
  const analyseProduits  = rj.analyse_produits;
  const analyseCommandes = rj.analyse_commandes;
  const analyseClients   = rj.analyse_clients;
  const briefingVendeuse = rj.briefing_vendeuse;
  const briefingGerant   = rj.briefing_gerant;
  const consignes        = rj.consignes_transmises;

  const succes  = rj.succes  ?? synthese?.points_forts          ?? [];
  const flops   = rj.flops   ?? synthese?.points_amelioration   ?? [];
  const antiGas = rj.anti_gaspillage ?? [];
  const oppsRaw = rj.opportunites ?? analyseProduits?.opportunites ?? [];
  const opps    = oppsRaw.map((o: unknown) =>
    typeof o === 'string' ? o : (o && typeof o === 'object' && 'commentaire' in (o as Record<string, unknown>)) ? `${(o as Record<string, string>).emoji ?? ''} ${(o as Record<string, string>).nom ?? ''} — ${(o as Record<string, string>).commentaire}`.trim() : String(o)
  );
  const alertes = rj.alerte_ingredients ?? [];
  const analyseCtx = getAnalyseContextuelle(rj);

  if (loading || !today) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  // ── Vue historique ─────────────────────────────────────────

  if (showHisto) return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => setShowHisto(false)}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/40">
          <ChevronLeft size={16} />
        </button>
        <div>
          <p className="text-[#C19A6B] text-[11px] uppercase tracking-widest font-semibold">Levain</p>
          <h1 className="text-white text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
            30 derniers rapports
          </h1>
        </div>
      </div>
      {historique.length === 0
        ? <div className="text-center py-12"><p className="text-white/30 text-sm">Aucun rapport disponible</p></div>
        : <div className="space-y-2">
            {historique.map(r => (
              <HistoCard key={r.id} r={r} onSelect={() => {
                setCR(r); setPrev([]); setApplied(true); setShowHisto(false);
                setStarterPreview(!!(r.rapport_json?._starter_preview));
              }} />
            ))}
          </div>
      }
    </div>
  );

  // ── Vue principale ─────────────────────────────────────────

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="pt-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[#C19A6B] text-[11px] font-semibold uppercase tracking-widest">Levain</span>
              <span className="text-white/15 text-[11px]">·</span>
              <span className="text-white/25 text-[10px]">Votre assistant boulanger</span>
            </div>
            <h1 className="text-white text-2xl font-bold mt-0.5" style={{ fontFamily: 'Playfair Display, serif' }}>
              {currentRapport && !isToday
                ? new Date(currentRapport.date + 'T12:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })
                : 'Rapport du soir'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHisto(true)}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/30 hover:text-[#C19A6B] transition-all">
              <Calendar size={14} />
            </button>
            {onClose && (
              <button onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/30 hover:text-white/60 transition-all">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          <p className="text-white/20 text-[10px]">IA Levain · Données réelles</p>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Bannière Starter — visible dès qu'un rapport aperçu est affiché */}
      {hasRapport && starterPreview && (
        <StarterBanner
          onUpgrade={() => upgradeModal.showUpgradeModal('quota_reached', quotaInfo)}
          quotaUsed={quotaInfo?.quota_used}
          quotaLimit={quotaInfo?.quota_limit}
        />
      )}

      {/* Génération en cours */}
      {isGenerating && !hasRapport && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'rgba(193,154,107,0.07)', borderColor: 'rgba(193,154,107,0.2)' }}>
          <div className="px-5 py-6 text-center space-y-4">
            <motion.div animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 rounded-full border-2 border-[#C19A6B]/30 border-t-[#C19A6B] mx-auto" />
            <div>
              <p className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                Levain analyse votre journée…
              </p>
              <p className="text-white/40 text-xs mt-1">
                {pollingTimedOut
                  ? 'La génération semble bloquée.'
                  : 'Bilan · Briefings · Plan de production · ~30 secondes'}
              </p>
              {pollingTimedOut && (
                <button
                  onClick={() => { setPollingStart(null); handleGenerate(); }}
                  className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
                  style={{ background: 'rgba(193,154,107,0.2)', borderColor: 'rgba(193,154,107,0.35)', color: '#C19A6B' }}
                >
                  Relancer la génération
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Pas de rapport */}
      {!isGenerating && !hasRapport && !currentRapport && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'rgba(193,154,107,0.06)', borderColor: 'rgba(193,154,107,0.18)' }}>
          <div className="px-5 py-6 text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.25)' }}>
              <Sparkles size={24} className="text-[#C19A6B]" />
            </div>
            <div>
              <p className="text-white font-bold text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
                Levain est prêt
              </p>
              <p className="text-white/40 text-sm mt-1.5 leading-relaxed max-w-xs mx-auto">
                Bilan · Score · Plan de production ·{' '}
                <strong className="text-white/60">Briefing matin pour {demainLabel}</strong>
              </p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={handleGenerate} disabled={generating}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: '#C19A6B', color: '#1A0F0A' }}>
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Analyser avec Levain
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Rapport disponible */}
      {hasRapport && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

          {/* ══ HERO STICKY — Score + Verdict + Pills + Gami ══ */}
          <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-3 backdrop-blur-xl"
            style={{ background: 'rgba(26,15,10,0.82)' }}>
            <div className="rounded-2xl overflow-hidden border"
              style={{ background: 'linear-gradient(135deg,rgba(193,154,107,0.12),rgba(193,154,107,0.04))', borderColor: 'rgba(193,154,107,0.25)' }}>
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="flex-shrink-0 scale-[0.82] origin-left -my-2 -ml-1">
                  <ScoreRing score={currentRapport!.score_performance ?? 0} />
                </div>
                <div className="flex-1 min-w-0 -ml-4">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles size={10} className="text-[#C19A6B]" />
                    <span className="text-[#C19A6B] text-[9px] font-semibold uppercase tracking-widest">Verdict</span>
                  </div>
                  <p className="text-white font-bold text-sm leading-tight line-clamp-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {currentRapport!.verdict_flash ?? '—'}
                  </p>
                  {gamiStats && (gamiStats.totalToday > 0 || gamiStats.streak > 0) && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {gamiStats.totalToday > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
                          style={{
                            background: gamiStats.reussisToday === gamiStats.totalToday ? 'rgba(74,222,128,0.15)' : 'rgba(234,179,8,0.15)',
                            border: gamiStats.reussisToday === gamiStats.totalToday ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(234,179,8,0.25)',
                            color: gamiStats.reussisToday === gamiStats.totalToday ? 'rgb(134 239 172)' : 'rgb(250 204 21)',
                          }}>
                          <Trophy size={9} /> {gamiStats.reussisToday}/{gamiStats.totalToday}
                        </span>
                      )}
                      {gamiStats.streak > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)', color: 'rgb(251 146 60)' }}>
                          🔥 {gamiStats.streak}j
                        </span>
                      )}
                      {gamiStats.xpToday > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.3)', color: '#C19A6B' }}>
                          +{gamiStats.xpToday} XP
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* 3 pills d'action prioritaires */}
              {(() => {
                type PillColor = 'green' | 'amber' | 'red' | 'info';
                const pills: { icon: string; label: string; color: PillColor }[] = [];
                const topVente = analyseProduits?.top_ventes?.[0];
                if (topVente) {
                  const pct = topVente.taux_vente != null ? ` ${topVente.taux_vente}%` : '';
                  pills.push({ icon: '▲', label: `${topVente.emoji ?? ''} ${topVente.nom}${pct}`.trim(), color: 'green' });
                } else if (succes[0]) {
                  pills.push({ icon: '▲', label: toStr(succes[0]).slice(0, 38), color: 'green' });
                }
                const critique = analyseProduits?.invendus_critiques?.[0];
                if (critique) {
                  const pct = critique.taux_invendu != null ? ` ${critique.taux_invendu}%` : '';
                  pills.push({ icon: '⚠', label: `${critique.emoji ?? ''} ${critique.nom}${pct}`.trim(), color: 'red' });
                } else if (flops[0]) {
                  pills.push({ icon: '⚠', label: toStr(flops[0]).slice(0, 38), color: 'amber' });
                }
                const top3 = rj.briefing_matin?.top3_a_produire?.[0];
                if (top3) {
                  pills.push({ icon: '🥖', label: `Demain : ${toStr(top3).slice(0, 32)}`, color: 'info' });
                } else if (rj.briefing_matin?.meteo_resume) {
                  pills.push({ icon: '🌤', label: rj.briefing_matin.meteo_resume.slice(0, 38), color: 'info' });
                }
                if (pills.length === 0) return null;
                const colorMap: Record<PillColor, { bg: string; border: string; text: string }> = {
                  green: { bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)',  text: 'rgb(134 239 172)' },
                  amber: { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)',  text: 'rgb(252 211 77)'  },
                  red:   { bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', text: 'rgb(252 165 165)' },
                  info:  { bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)',  text: 'rgb(196 181 253)' },
                };
                return (
                  <div className="px-3 pb-3 flex gap-1.5 overflow-x-auto scrollbar-none">
                    {pills.map((p, i) => {
                      const c = colorMap[p.color];
                      return (
                        <div key={i} className="flex-shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                          <span>{p.icon}</span>{p.label}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ══ TL;DR 30 secondes ══ */}
          {(synthese?.points_forts?.[0] || analyseProduits?.invendus_critiques?.[0] || flops[0] || rj.briefing_matin?.top3_a_produire?.[0]) && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border overflow-hidden"
              style={{ background: 'rgba(193,154,107,0.05)', borderColor: 'rgba(193,154,107,0.18)' }}>
              <div className="px-4 py-2 border-b border-white/6 flex items-center gap-2">
                <Zap size={11} className="text-[#C19A6B]" />
                <p className="text-[#C19A6B] text-[10px] font-bold uppercase tracking-widest">Récap 30 secondes</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {synthese?.points_forts?.[0] && (
                  <div className="flex items-start gap-2.5">
                    <span className="text-green-400 text-base leading-none mt-0.5">●</span>
                    <p className="text-white/80 text-sm leading-snug">{toStr(synthese.points_forts[0])}</p>
                  </div>
                )}
                {(analyseProduits?.invendus_critiques?.[0] || flops[0]) && (
                  <div className="flex items-start gap-2.5">
                    <span className="text-amber-400 text-base leading-none mt-0.5">●</span>
                    <p className="text-white/80 text-sm leading-snug">
                      {analyseProduits?.invendus_critiques?.[0]
                        ? `${analyseProduits.invendus_critiques[0].emoji ?? ''} ${analyseProduits.invendus_critiques[0].nom} — ${analyseProduits.invendus_critiques[0].commentaire ?? 'à surveiller'}`
                        : toStr(flops[0])}
                    </p>
                  </div>
                )}
                {rj.briefing_matin?.top3_a_produire?.[0] && (
                  <div className="flex items-start gap-2.5">
                    <span className="text-purple-400 text-base leading-none mt-0.5">●</span>
                    <p className="text-white/80 text-sm leading-snug">
                      <strong className="text-white/95">Demain :</strong> {toStr(rj.briefing_matin.top3_a_produire[0])}
                    </p>
                  </div>
                )}
              </div>
              {(synthese?.message_equipe || rj.message_levain) && (
                <div className="px-4 py-2 border-t border-white/5 space-y-1">
                  {synthese?.message_equipe && <p className="text-white/45 text-[11px]">👥 {synthese.message_equipe}</p>}
                  {rj.message_levain && <p className="text-[#C19A6B]/70 text-[11px] italic">💬 {rj.message_levain}</p>}
                </div>
              )}
            </motion.section>
          )}

          {/* Consignes owner */}
          {(consignes?.au_boulanger || consignes?.a_la_vendeuse) && (
            <div className="rounded-2xl bg-purple-500/8 border border-purple-500/20 px-4 py-3.5 space-y-2">
              <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-wider">Consignes du propriétaire</p>
              {consignes.au_boulanger && <p className="text-white/70 text-sm">🥖 <strong>Boulanger :</strong> {consignes.au_boulanger}</p>}
              {consignes.a_la_vendeuse && <p className="text-white/70 text-sm">🧑‍💼 <strong>Vendeuse :</strong> {consignes.a_la_vendeuse}</p>}
            </div>
          )}

          {/* ══ SECTION DEMAIN — briefing + vendeuse + gérant + défis ══ */}
          {!starterPreview && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45 }}
              className="space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <Coffee size={13} className="text-[#C19A6B]" />
                <h2 className="text-white/90 text-[11px] font-bold uppercase tracking-widest" style={{ fontFamily: 'Playfair Display, serif' }}>Demain</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              {rj.briefing_matin ? (
                <BriefingMatinCard bm={rj.briefing_matin} previsions={previsions}
                  onApply={handleApply} applying={applying} applied={allApplied}
                  isToday={isToday} demainLabel={demainLabel} />
              ) : (
                <div className="text-center py-8">
                  <Coffee size={28} className="text-white/15 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">Briefing non disponible</p>
                </div>
              )}

              {briefingVendeuse && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="rounded-2xl overflow-hidden border"
                  style={{ background: 'rgba(236,72,153,0.06)', borderColor: 'rgba(236,72,153,0.2)' }}>
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(236,72,153,0.15)' }}>
                      <Heart size={14} className="text-pink-400" />
                    </div>
                    <p className="text-pink-400 text-[10px] font-semibold uppercase tracking-widest">
                      {briefingVendeuse.titre ?? 'Briefing Vendeuse'}
                    </p>
                  </div>
                  <div className="px-5 py-4 space-y-2.5">
                    {briefingVendeuse.accueil_client && <p className="text-white/65 text-sm leading-relaxed">{briefingVendeuse.accueil_client}</p>}
                    {briefingVendeuse.produits_a_mettre_en_avant && briefingVendeuse.produits_a_mettre_en_avant.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-white/30 text-[10px] uppercase tracking-wider font-semibold">À valoriser au comptoir</p>
                        {briefingVendeuse.produits_a_mettre_en_avant.map((p, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Star size={11} className="text-pink-400/60 mt-0.5 flex-shrink-0" />
                            <p className="text-white/60 text-xs">{toStr(p)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {briefingVendeuse.gestion_fin_journee && (
                      <div className="bg-white/4 border border-white/7 rounded-xl px-3 py-2.5">
                        <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-1">Fin de journée</p>
                        <p className="text-white/60 text-xs leading-relaxed">{briefingVendeuse.gestion_fin_journee}</p>
                      </div>
                    )}
                    {briefingVendeuse.message_encouragement && (
                      <p className="text-pink-300/70 text-xs italic">💪 {briefingVendeuse.message_encouragement}</p>
                    )}
                  </div>
                </motion.div>
              )}

              {briefingGerant && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  className="rounded-2xl overflow-hidden border"
                  style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.2)' }}>
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                      <Briefcase size={14} className="text-blue-400" />
                    </div>
                    <p className="text-blue-400 text-[10px] font-semibold uppercase tracking-widest">
                      {briefingGerant.titre ?? 'Briefing Gérant'}
                    </p>
                  </div>
                  <div className="px-5 py-4 space-y-2.5">
                    {briefingGerant.tendances_ca && (
                      <div className="flex items-start gap-2">
                        <BarChart2 size={12} className="text-blue-400/60 mt-0.5 flex-shrink-0" />
                        <p className="text-white/65 text-sm">{briefingGerant.tendances_ca}</p>
                      </div>
                    )}
                    {briefingGerant.points_attention && briefingGerant.points_attention.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-white/30 text-[10px] uppercase tracking-wider font-semibold">Points d'attention</p>
                        {briefingGerant.points_attention.map((p, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <AlertTriangle size={10} className="text-amber-400/60 mt-0.5 flex-shrink-0" />
                            <p className="text-white/60 text-xs">{toStr(p)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {briefingGerant.recommendation && (
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2.5">
                        <p className="text-blue-300/90 text-xs leading-relaxed">💡 {briefingGerant.recommendation}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── DÉFIS GAMIFICATION ── */}
              {rj.defis && rj.defis.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                  className="rounded-2xl overflow-hidden border"
                  style={{ background: 'rgba(234,179,8,0.05)', borderColor: 'rgba(234,179,8,0.2)' }}>
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)' }}>
                      <Trophy size={14} className="text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-yellow-400 text-[10px] font-semibold uppercase tracking-widest">Défis pour demain</p>
                      <p className="text-white/25 text-[9px]">Objectifs atteignables · progressez ensemble</p>
                    </div>
                  </div>
                  <div className="px-5 py-4 space-y-4">
                    {rj.defis.map((d, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{d.cible === 'boulanger' ? '👨‍🍳' : '💁‍♀️'}</span>
                          <div>
                            <p className="text-white/80 text-sm font-semibold leading-tight">{d.titre}</p>
                            <p className="text-white/30 text-[10px] capitalize">{d.cible}</p>
                          </div>
                        </div>
                        <div className="bg-white/4 border border-white/7 rounded-xl px-3 py-2.5 space-y-2">
                          <div className="flex items-start gap-2">
                            <Target size={11} className="text-yellow-400/70 mt-0.5 flex-shrink-0" />
                            <p className="text-white/70 text-xs leading-relaxed">{d.objectif}</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <Lightbulb size={11} className="text-amber-300/60 mt-0.5 flex-shrink-0" />
                            <p className="text-white/50 text-xs leading-relaxed">{d.conseil}</p>
                          </div>
                        </div>
                        <p className="text-yellow-300/60 text-xs italic pl-1">💪 {d.motivation}</p>
                        {i < rj.defis!.length - 1 && <div className="border-t border-white/5 pt-1" />}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.section>
          )}

          {/* ══ SECTION BILAN — synthèse + succès + flops + contexte + commandes + alertes ══ */}
          {!starterPreview && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45 }}
              className="space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <BarChart2 size={13} className="text-[#C19A6B]" />
                <h2 className="text-white/90 text-[11px] font-bold uppercase tracking-widest" style={{ fontFamily: 'Playfair Display, serif' }}>Bilan du jour</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              {v3 && synthese && (
                <div className="rounded-2xl bg-white/4 border border-white/8 px-4 py-4 space-y-3">
                  {synthese.resume && <p className="text-white/65 text-sm leading-relaxed">{synthese.resume}</p>}
                  {synthese.message_equipe && (
                    <div className="flex items-center gap-2 pt-1 border-t border-white/6">
                      <Users size={12} className="text-white/30" />
                      <p className="text-white/45 text-xs italic">{synthese.message_equipe}</p>
                    </div>
                  )}
                </div>
              )}
              {succes.length > 0 && (
                <div className="rounded-2xl border overflow-hidden"
                  style={{ background: 'rgba(74,222,128,0.05)', borderColor: 'rgba(74,222,128,0.18)' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(74,222,128,0.1)' }}>
                    <TrendingUp size={13} className="text-green-400" />
                    <p className="text-green-400 text-xs font-semibold uppercase tracking-wider">Succès</p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {succes.map((s, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Check size={13} className="text-green-400 mt-0.5 flex-shrink-0" />
                        <p className="text-white/70 text-sm leading-relaxed">{toStr(s)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {flops.length > 0 && (
                <div className="rounded-2xl border overflow-hidden"
                  style={{ background: 'rgba(251,191,36,0.05)', borderColor: 'rgba(251,191,36,0.2)' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(251,191,36,0.1)' }}>
                    <TrendingDown size={13} className="text-amber-400" />
                    <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">À améliorer</p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {flops.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <AlertTriangle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-white/70 text-sm leading-relaxed">{toStr(f)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {analyseCtx && (
                <div className="rounded-2xl bg-white/4 border border-white/8 px-4 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={12} className="text-white/35" />
                    <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Analyse contextuelle</p>
                  </div>
                  <p className="text-white/65 text-sm leading-relaxed">{analyseCtx}</p>
                </div>
              )}
              {analyseCommandes && (
                <div className="rounded-2xl border overflow-hidden"
                  style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.18)' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
                    <ShoppingBag size={13} className="text-blue-400" />
                    <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Commandes en ligne</p>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {analyseCommandes.click_collect && (
                      <div>
                        <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-1">Click & Collect</p>
                        {analyseCommandes.click_collect.performance && <p className="text-white/65 text-xs">{analyseCommandes.click_collect.performance}</p>}
                        {analyseCommandes.click_collect.conseil && <p className="text-[#C19A6B]/70 text-xs mt-1">→ {analyseCommandes.click_collect.conseil}</p>}
                      </div>
                    )}
                    {analyseCommandes.anti_gaspi && (
                      <div className="border-t border-white/6 pt-3">
                        <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-1">Anti-Gaspi</p>
                        {analyseCommandes.anti_gaspi.impact && <p className="text-white/65 text-xs">{analyseCommandes.anti_gaspi.impact}</p>}
                        {analyseCommandes.anti_gaspi.conseil && <p className="text-[#C19A6B]/70 text-xs mt-1">→ {analyseCommandes.anti_gaspi.conseil}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {alertes.length > 0 && (
                <div className="rounded-2xl bg-red-500/8 border border-red-500/20 px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={13} className="text-red-400" />
                    <p className="text-red-400 text-xs font-semibold uppercase tracking-wider">Alertes ingrédients</p>
                  </div>
                  {alertes.map((a, i) => <p key={i} className="text-red-300/80 text-sm">{toStr(a)}</p>)}
                </div>
              )}
            </motion.section>
          )}

          {/* ══ SECTION PLAN — bouton appliquer + table prévisions ══ */}
          {!starterPreview && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45 }}
              className="space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <Play size={12} className="text-[#C19A6B]" />
                <h2 className="text-white/90 text-[11px] font-bold uppercase tracking-widest" style={{ fontFamily: 'Playfair Display, serif' }}>Plan production ({previsions.length})</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              {!isToday && (
                <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3">
                  <p className="text-white/40 text-xs">Rapport passé — prévisions à titre indicatif.</p>
                </div>
              )}
              {isToday && !allApplied && previsions.length > 0 && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleApply} disabled={applying}
                  className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,rgba(193,154,107,0.28),rgba(193,154,107,0.12))', border: '1px solid rgba(193,154,107,0.35)', color: '#C19A6B' }}>
                  {applying
                    ? <><Loader2 size={18} className="animate-spin" /> Application…</>
                    : <><Play size={16} /> Appliquer pour {demainLabel} ({previsions.length} produits)</>}
                </motion.button>
              )}
              {allApplied && isToday && (
                <div className="flex items-center gap-3 rounded-2xl bg-green-500/10 border border-green-500/20 px-4 py-3">
                  <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                  <p className="text-green-300 text-sm font-medium">Plan appliqué · Onglet Matin mis à jour</p>
                </div>
              )}
              {previsions.length === 0
                ? <div className="text-center py-8"><Play size={28} className="text-white/15 mx-auto mb-3" /><p className="text-white/30 text-sm">Aucune prévision disponible</p></div>
                : (
                  <div className="rounded-2xl border overflow-hidden bg-white/3 border-white/7">
                    <div className="grid grid-cols-3 px-4 py-2.5 border-b border-white/5 text-[10px] text-white/30 font-semibold uppercase tracking-wider">
                      <span>Produit</span><span className="text-center">Demain</span><span className="text-right">Variation</span>
                    </div>
                    {previsions.map((p, i) => (
                      <motion.div key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="grid grid-cols-3 items-start px-4 py-3 border-b border-white/4 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base flex-shrink-0">{p.produit_emoji}</span>
                          <div className="min-w-0">
                            <p className="text-white/75 text-xs font-medium truncate">{p.produit_nom}</p>
                            {p.raison && <p className="text-white/25 text-[9px] truncate">{p.raison}</p>}
                            {p.appliquee && <span className="text-[9px] text-green-400/70">✓ appliqué</span>}
                          </div>
                        </div>
                        <div className="text-center pt-0.5">
                          <span className="text-white font-bold font-mono text-sm">{p.quantite_suggeree}</span>
                          <span className="text-white/25 text-xs ml-0.5">pcs</span>
                        </div>
                        <div className="flex justify-end pt-0.5"><VBadge pct={p.variation_pct} /></div>
                      </motion.div>
                    ))}
                  </div>
                )
              }
            </motion.section>
          )}

          {/* ══ SECTION MATIÈRES — ingrédients + observations ══ */}
          {!starterPreview && rj.matieres_premieres && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45 }}
              className="space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <Wheat size={13} className="text-[#C19A6B]" />
                <h2 className="text-white/90 text-[11px] font-bold uppercase tracking-widest" style={{ fontFamily: 'Playfair Display, serif' }}>Matières premières</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              {rj.matieres_premieres.resume && (
                <div className="rounded-2xl bg-white/4 border border-white/8 px-4 py-4">
                  <p className="text-white/65 text-sm leading-relaxed">{rj.matieres_premieres.resume}</p>
                </div>
              )}
              {rj.matieres_premieres.details && rj.matieres_premieres.details.length > 0 && (
                <div className="rounded-2xl border overflow-hidden bg-white/3 border-white/7">
                  <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
                    <Package2 size={13} className="text-white/35" />
                    <p className="text-white/35 text-[10px] font-semibold uppercase tracking-wider">Détail par ingrédient</p>
                  </div>
                  {rj.matieres_premieres.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-white/4 last:border-0">
                      <div className="flex-1">
                        <p className="text-white/75 text-sm font-medium capitalize">{d.ingredient}</p>
                        {d.observation && <p className="text-white/35 text-xs mt-0.5">{d.observation}</p>}
                      </div>
                      <span className="text-[#C19A6B] font-bold font-mono text-sm flex-shrink-0">{d.quantite}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.section>
          )}
        </motion.div>
      )}

      {/* ══ CTA STICKY BOTTOM — "Appliquer pour demain" ══ */}
      {hasRapport && isToday && !allApplied && previsions.length > 0 && !starterPreview && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-4 left-4 right-4 z-30 max-w-md mx-auto pointer-events-none">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleApply}
            disabled={applying}
            className="pointer-events-auto w-full py-3.5 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-sm disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg,#C19A6B,rgba(193,154,107,0.85))',
              color: '#1A0F0A',
              boxShadow: '0 10px 40px rgba(193,154,107,0.45), 0 2px 6px rgba(0,0,0,0.2)',
            }}>
            {applying
              ? <><Loader2 size={16} className="animate-spin" /> Application…</>
              : <><Play size={15} /> Appliquer pour {demainLabel}</>}
          </motion.button>
        </motion.div>
      )}

      {/* Modal upgrade */}
      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={upgradeModal.setOpen}
        reason={upgradeModal.reason}
        quotaInfo={upgradeModal.quotaInfo}
      />
    </div>
  );
}