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
  Heart, Star, MessageSquare,
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
                <p className="text-white/75 text-sm leading-snug">{item}</p>
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
  const [tab,            setTab]     = useState<'briefing' | 'analyse' | 'plan' | 'matieres'>('briefing');
  const [showHisto,      setShowHisto] = useState(false);

  // today en timezone boulangerie (via API) — pas new Date() en UTC
  const [today,      setToday]      = useState<string>('');
  const [demainDate, setDemainDate] = useState<string>('');
  const [demainLabel, setDemainLabel] = useState<string>('');

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
      setTab(j.rapport?.rapport_json?.briefing_matin ? 'briefing' : 'analyse');
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

  useEffect(() => {
    if (currentRapport?.statut !== 'en_cours') return;
    const t = setInterval(() => loadRapport(), 3000);
    return () => clearInterval(t);
  }, [currentRapport?.statut, loadRapport]);

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

      if (!res.ok) { setError(j.error ?? 'Erreur'); return; }

      if (j.quota_info)              setQuotaInfo(j.quota_info);
      if (j.starter_preview !== undefined) setStarterPreview(!!j.starter_preview);
      if (j.rapport)   setCR(j.rapport);
      if (j.previsions) setPrev(j.previsions);
      setTab(j.rapport?.rapport_json?.briefing_matin ? 'briefing' : 'analyse');
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
  const opps    = rj.opportunites ?? analyseProduits?.opportunites ?? [];
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
                setTab(r.rapport_json?.briefing_matin ? 'briefing' : 'analyse');
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
              <p className="text-white/40 text-xs mt-1">Bilan · Briefings · Plan de production · ~30 secondes</p>
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

          {/* Score card */}
          <div className="rounded-2xl overflow-hidden border"
            style={{ background: 'linear-gradient(135deg,rgba(193,154,107,0.12),rgba(193,154,107,0.04))', borderColor: 'rgba(193,154,107,0.25)' }}>
            <div className="flex items-center gap-5 px-5 py-5">
              <ScoreRing score={currentRapport!.score_performance ?? 0} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={12} className="text-[#C19A6B]" />
                  <span className="text-[#C19A6B] text-[10px] font-semibold uppercase tracking-widest">Score du jour</span>
                </div>
                <p className="text-white font-bold text-base leading-snug" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {currentRapport!.verdict_flash ?? '—'}
                </p>
                {synthese?.resume && (
                  <p className="text-white/45 text-xs mt-1.5 leading-relaxed">{synthese.resume}</p>
                )}
              </div>
            </div>
            {(synthese?.message_equipe || rj.message_levain) && (
              <div className="px-5 pb-4 border-t border-white/6 pt-3 space-y-1">
                {synthese?.message_equipe && <p className="text-white/50 text-xs">👥 {synthese.message_equipe}</p>}
                {rj.message_levain && <p className="text-[#C19A6B]/70 text-xs italic">💬 {rj.message_levain}</p>}
              </div>
            )}
          </div>

          {/* Consignes owner */}
          {(consignes?.au_boulanger || consignes?.a_la_vendeuse) && (
            <div className="rounded-2xl bg-purple-500/8 border border-purple-500/20 px-4 py-3.5 space-y-2">
              <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-wider">Consignes du propriétaire</p>
              {consignes.au_boulanger && <p className="text-white/70 text-sm">🥖 <strong>Boulanger :</strong> {consignes.au_boulanger}</p>}
              {consignes.a_la_vendeuse && <p className="text-white/70 text-sm">🧑‍💼 <strong>Vendeuse :</strong> {consignes.a_la_vendeuse}</p>}
            </div>
          )}

          {/* Onglets — masqués en aperçu Starter (sauf analyse partielle) */}
          {!starterPreview && (
            <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/8 overflow-x-auto">
              {([
                { id: 'briefing' as const, label: 'Demain',              icon: Coffee   },
                { id: 'analyse'  as const, label: 'Bilan',               icon: BarChart2 },
                { id: 'plan'     as const, label: `Plan (${previsions.length})`, icon: Play },
                { id: 'matieres' as const, label: 'Matières',            icon: Wheat    },
              ] as const).map(t => {
                const Icon = t.icon;
                const ia   = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                      ia ? 'bg-[#C19A6B]/20 text-[#C19A6B] border border-[#C19A6B]/30' : 'text-white/40 hover:text-white/60'
                    }`}>
                    <Icon size={12} strokeWidth={ia ? 2.2 : 1.8} />{t.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── TAB BRIEFING ── */}
          {!starterPreview && tab === 'briefing' && (
            <div className="space-y-3">
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
                            <p className="text-white/60 text-xs">{p}</p>
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
                            <p className="text-white/60 text-xs">{p}</p>
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
            </div>
          )}

          {/* ── TAB ANALYSE ── */}
          {!starterPreview && tab === 'analyse' && (
            <div className="space-y-3">
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
                        <p className="text-white/70 text-sm leading-relaxed">{s}</p>
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
                        <p className="text-white/70 text-sm leading-relaxed">{f}</p>
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
                  {alertes.map((a, i) => <p key={i} className="text-red-300/80 text-sm">{a}</p>)}
                </div>
              )}
            </div>
          )}

          {/* ── TAB PLAN ── */}
          {!starterPreview && tab === 'plan' && (
            <div className="space-y-3">
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
            </div>
          )}

          {/* ── TAB MATIÈRES ── */}
          {!starterPreview && tab === 'matieres' && (
            <div className="space-y-3">
              {rj.matieres_premieres ? (
                <>
                  <div className="rounded-2xl bg-white/4 border border-white/8 px-4 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Wheat size={13} className="text-[#C19A6B]" />
                      <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Résumé journée</p>
                    </div>
                    <p className="text-white/65 text-sm leading-relaxed">{rj.matieres_premieres.resume}</p>
                  </div>
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
                </>
              ) : (
                <div className="text-center py-8">
                  <Wheat size={28} className="text-white/15 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">Non disponible pour ce rapport</p>
                </div>
              )}
            </div>
          )}
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