'use client';
// components/boulanger/vue-soir.tsx
// ─────────────────────────────────────────────────────────────
// Refactorisée :
//   ✅ Feedback vendeuse avant la clôture (toujours)
//   ✅ Wizard pré-rapport pour l'owner (consignes + événement)
//   ✅ Vue rapport IA après génération
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, ZapOff, Package, Loader2, Check, ChevronDown,
  Plus, Minus, Sparkles, Send, ChefHat,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import VueRapportIA from './vue-rapport-ia';
import FeedbackVendeuse, { type FeedbackVendeuseData } from './feedback-vendeuse';
import WizardPreRapport, { type WizardPreRapportData } from './wizard-pre-rapport';

// ── Types ─────────────────────────────────────────────────────

type EtapeSoir = 'stocks' | 'feedback_vendeuse' | 'wizard_rapport' | 'rapport';

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'default' }: {
  label: string; value: string; sub?: string; color?: 'default' | 'green' | 'amber' | 'red';
}) {
  const c = {
    default: { text: 'text-white',      bg: 'bg-white/5',         border: 'border-white/8' },
    green:   { text: 'text-green-400',  bg: 'bg-green-400/8',     border: 'border-green-400/15' },
    amber:   { text: 'text-amber-400',  bg: 'bg-amber-400/8',     border: 'border-amber-400/15' },
    red:     { text: 'text-red-400',    bg: 'bg-red-400/8',       border: 'border-red-400/15' },
  }[color];
  return (
    <div className={`flex-1 rounded-2xl ${c.bg} border ${c.border} p-3`}>
      <p className="text-white/30 text-[10px] uppercase tracking-widest">{label}</p>
      <p className={`${c.text} text-xl font-bold mt-1 tabular-nums leading-none`}>{value}</p>
      {sub && <p className="text-white/25 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ── Contrôle stock final ──────────────────────────────────────

function StockFinalCell({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.button whileTap={{ scale: 0.85 }} onPointerDown={() => { if (value > 0) onChange(value - 1); }} disabled={value <= 0}
        className={`w-12 h-12 rounded-xl flex items-center justify-center select-none touch-manipulation transition-all ${value <= 0 ? 'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed' : 'bg-white/10 border border-white/12 hover:bg-white/16'}`}>
        <Minus size={16} strokeWidth={2.5} className="text-white" />
      </motion.button>
      <motion.div key={value} initial={{ scale: 1.2 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }}
        className={`w-14 h-12 rounded-xl flex items-center justify-center text-lg font-bold font-mono border select-none ${value > 0 ? 'bg-amber-500/12 border-amber-500/25 text-amber-400' : 'bg-white/5 border-white/8 text-white/40'}`}>
        {value}
      </motion.div>
      <motion.button whileTap={{ scale: 0.85 }} onPointerDown={() => { if (value < max) onChange(value + 1); }} disabled={value >= max}
        className={`w-12 h-12 rounded-xl flex items-center justify-center select-none touch-manipulation transition-all ${value >= max ? 'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed' : 'bg-[#C19A6B]/18 border border-[#C19A6B]/28 hover:bg-[#C19A6B]/28'}`}>
        <Plus size={16} strokeWidth={2.5} className="text-[#C19A6B]" />
      </motion.button>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function VueSoir() {
  const {
    todayStocks, updateStockFinal, closeDayAndSave,
    commandesOnline, revenueToday, unsoldToday, unsoldRateToday,
    totalProducedToday, syncStatus, authLoading,
    userRole, boulangerie,
  } = useBoulanger();

  const [flashActifs,  setFlashActifs]   = useState<Record<string, boolean>>({});
  const [cloture,      setCloture]       = useState(false);
  const [cloturing,    setCloturing]     = useState(false);
  const [expanded,     setExpanded]      = useState(false);
  const [etape,        setEtape]         = useState<EtapeSoir>('stocks');
  const [showRapport,  setShowRapport]   = useState(false);
  const [checkingDB,   setCheckingDB]    = useState(true);
  const [feedbackSent, setFeedbackSent]  = useState(false);
  const [wizardData,   setWizardData]    = useState<WizardPreRapportData | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const isOwner   = userRole === 'owner';
  const isGerant  = userRole === 'gerant';
  const canOpenWizard = isOwner || isGerant;

  const isFlashActif = (s: StockEntry) => flashActifs[s.id] !== undefined ? flashActifs[s.id] : true;
  const toggleFlash  = (id: string) => setFlashActifs(p => ({ ...p, [id]: !p[id] }));

  // Vérifie l'état de clôture depuis la DB
  useEffect(() => {
    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const todayRes = await fetch('/api/boulanger/ai/today', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        });
        const todayData = todayRes.ok ? await todayRes.json() as { today: string } : { today: new Date().toISOString().split('T')[0] };
        const todayTZ = todayData.today;

        const res = await fetch('/api/boulanger/journee', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        });
        if (!res.ok) return;
        const { journee } = await res.json() as { journee: { cloturee: boolean; date: string } | null };
        if (journee?.cloturee && journee.date === todayTZ) setCloture(true);
      } catch {}
      finally { setCheckingDB(false); }
    }
    check();
  }, []);

  // Sauvegarde le feedback vendeuse en DB
  const handleFeedbackSubmit = async (data: FeedbackVendeuseData) => {
    setSavingFeedback(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Récupère la journée du jour
      const res = await fetch('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const { journee } = await res.json() as { journee: { id: string } | null };
      if (!journee?.id) return;

      // Encode comme texte pour l'IA
      const commentaireEnrichi = [
        `Humeur: ${data.humeur}`,
        data.points_positifs.length > 0 ? `Points positifs: ${data.points_positifs.join(', ')}` : '',
        data.problemes.length > 0 ? `Problèmes: ${data.problemes.join(', ')}` : '',
        data.commentaire_libre ? `Message: ${data.commentaire_libre}` : '',
      ].filter(Boolean).join(' | ');

      await fetch('/api/boulanger/journee/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          journee_id:        journee.id,
          rating_journee:    data.humeur === 'super' ? 5 : data.humeur === 'bien' ? 4 : data.humeur === 'moyen' ? 3 : 2,
          points_forts:      data.points_positifs,
          points_ameliorer:  data.problemes,
          commentaire_libre: data.commentaire_libre,
          has_evenement:     false,
        }),
      });

      setFeedbackSent(true);
    } finally {
      setSavingFeedback(false);
      setEtape('stocks'); // Retour aux stocks après feedback
    }
  };

  // Clôture + passe au wizard ou rapport
  const handleCloturer = async () => {
    if (cloture || cloturing) return;
    setCloturing(true);
    try {
      await closeDayAndSave(commandesOnline);
      setCloture(true);
    } finally {
      setCloturing(false);
    }
  };

  // Génération rapport depuis le wizard
  const handleWizardValider = (data: WizardPreRapportData) => {
    setWizardData(data);
    setShowRapport(true);
    setEtape('rapport');
  };

  const kpiColor = unsoldRateToday < 5 ? 'green' : unsoldRateToday < 10 ? 'amber' : 'red';
  const invAvecStock = todayStocks.filter(s => s.stockFinal > 0);

  if (authLoading || checkingDB) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  if (showRapport || etape === 'rapport') {
    return <VueRapportIA onClose={() => { setShowRapport(false); setEtape('stocks'); }} wizardData={wizardData} />;
  }

  if (todayStocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-5xl mb-4">🌙</span>
        <p className="text-white/50 font-medium">Aucune production saisie</p>
        <p className="text-white/25 text-sm mt-1">Saisissez dans l'onglet <span className="text-[#C19A6B]">Matin</span></p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div data-tour="soir-header" className="pt-2">
          <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">Clôture du soir</p>
          <h1 className="text-white text-2xl font-bold mt-1" style={{ fontFamily: 'Playfair Display, serif' }}>Bilan & Invendus</h1>
          <p className="text-white/35 text-xs mt-1.5">Saisissez les invendus. Partez de <strong className="text-white/55">0</strong>.</p>
        </div>

        {/* KPIs */}
        <div className="flex gap-2.5">
          <KpiCard label="CA estimé" value={`${revenueToday.toFixed(0)} €`} color="green" />
          <KpiCard label="Invendus" value={`${unsoldRateToday.toFixed(1)} %`} sub={`${unsoldToday} pcs`} color={kpiColor as 'green' | 'amber' | 'red'} />
          <KpiCard label="Pièces" value={`${totalProducedToday}`} sub={`−${unsoldToday} non vend.`} />
        </div>

        {/* Stocks */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: 'linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5">
            <p className="flex-1 text-white/30 text-[10px] uppercase tracking-widest">Produit · production</p>
            <p className="text-amber-400/60 text-[10px] font-semibold uppercase">Invendus restants</p>
          </div>
          {todayStocks.map(s => {
            const max = s.snapshot14hDone ? s.snapshot14h : s.snapshot10hDone ? s.snapshot10h : s.production;
            const ref = s.snapshot14hDone ? `Snapshot 14h : ${s.snapshot14h}` : s.snapshot10hDone ? `Snapshot 10h : ${s.snapshot10h}` : `${s.production} produits`;
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/4 last:border-0">
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <span className="text-xl flex-shrink-0">{s.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium line-clamp-2">{s.name}</p>
                    <p className="text-white/35 text-xs">{ref}</p>
                  </div>
                </div>
                <StockFinalCell value={s.stockFinal} max={max} onChange={val => updateStockFinal(s.id, val)} />
              </div>
            );
          })}
        </div>

        {/* Flash anti-gaspi */}
        <div data-tour="soir-flash" className="rounded-2xl border overflow-hidden" style={{ background: 'linear-gradient(145deg,rgba(193,154,107,0.06),rgba(193,154,107,0.02))', borderColor: 'rgba(193,154,107,0.18)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-[#C19A6B]" />
              <span className="text-[#C19A6B] text-sm font-semibold">Paniers anti-gaspi</span>
            </div>
            <p className="text-white/30 text-[10px]">−40% du prix</p>
          </div>
          <div className="px-4 py-1">
            {invAvecStock.length === 0
              ? <div className="py-4 text-center"><p className="text-white/25 text-sm">🎉 Aucun invendu</p></div>
              : invAvecStock.map(s => {
                  const pf = s.prixVente * 0.6;
                  const actif = isFlashActif(s);
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2.5 border-b border-white/4 last:border-0">
                      <span className="text-lg flex-shrink-0">{s.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">{s.name}</p>
                        <p className="text-white/30 text-[10px]">{s.stockFinal} restant · <span className="line-through">{s.prixVente.toFixed(2)}€</span> <span className="text-[#C19A6B]/80">{pf.toFixed(2)}€</span></p>
                      </div>
                      <button onClick={() => toggleFlash(s.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${actif ? 'bg-[#C19A6B]/20 border-[#C19A6B]/30 text-[#C19A6B]' : 'bg-white/5 border-white/8 text-white/40'}`}>
                        {actif ? <><Zap size={11} /> Actif</> : <><ZapOff size={11} /> Off</>}
                      </button>
                    </div>
                  );
                })
            }
          </div>
        </div>

        {/* ── Actions ── */}
        {!cloture ? (
          <div className="space-y-3">
            {/* Feedback vendeuse AVANT clôture */}
            {!feedbackSent && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setEtape('feedback_vendeuse')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all border border-blue-400/25 bg-blue-400/8 text-blue-300 hover:bg-blue-400/15"
              >
                <Send size={15} />
                Transmettre le retour vendeuse à Levain
              </motion.button>
            )}
            {feedbackSent && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
                <Check size={14} className="text-green-400" />
                <p className="text-green-300 text-xs font-medium">Retour vendeuse transmis à Levain ✓</p>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleCloturer}
              disabled={cloturing || syncStatus === 'saving'}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-base transition-all disabled:opacity-50 touch-manipulation"
              style={{ background: 'linear-gradient(135deg,rgba(193,154,107,0.25),rgba(193,154,107,0.12))', border: '1px solid rgba(193,154,107,0.3)', color: '#C19A6B' }}
            >
              {cloturing ? <><Loader2 size={18} className="animate-spin" /> Clôture…</> : <><Package size={18} /> Clôturer la journée</>}
            </motion.button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Journée clôturée */}
            <div className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 border" style={{ background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.25)' }}>
              <Check size={18} className="text-green-400" />
              <span className="text-green-400 text-base font-bold">Journée clôturée ✓</span>
            </div>

            {/* Feedback vendeuse si pas encore fait */}
            {!feedbackSent && (
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setEtape('feedback_vendeuse')}
                className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2.5 font-semibold text-sm border border-blue-400/25 bg-blue-400/8 text-blue-300 hover:bg-blue-400/15 transition-all"
              >
                <Send size={16} />
                Transmettre le retour de la journée à Levain
              </motion.button>
            )}

            {/* Rapport Levain — wizard pour owner/gérant */}
            {canOpenWizard ? (
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setEtape('wizard_rapport')}
                className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all"
                style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.18),rgba(193,154,107,0.12))', border: '1px solid rgba(139,92,246,0.3)', color: '#C19A6B' }}
              >
                <ChefHat size={18} />
                Préparer & Générer le rapport Levain
              </motion.button>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowRapport(true)}
                className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all"
                style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.18),rgba(193,154,107,0.12))', border: '1px solid rgba(139,92,246,0.3)', color: '#C19A6B' }}
              >
                <Sparkles size={18} />
                Voir le rapport Levain
              </motion.button>
            )}
            <p className="text-center text-white/20 text-[10px]">Levain · Votre assistant boulanger IA · Données anonymisées</p>
          </div>
        )}

        <p className="text-center text-white/18 text-[10px] pb-2">La clôture sauvegarde vos données pour les statistiques ML.</p>
      </div>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {etape === 'feedback_vendeuse' && (
          <FeedbackVendeuse
            onSubmit={handleFeedbackSubmit}
            onClose={() => setEtape('stocks')}
            isSubmitting={savingFeedback}
          />
        )}
        {etape === 'wizard_rapport' && (
          <WizardPreRapport
            onValider={handleWizardValider}
            onAnnuler={() => setEtape('stocks')}
          />
        )}
      </AnimatePresence>
    </>
  );
}