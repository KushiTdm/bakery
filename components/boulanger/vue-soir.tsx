'use client';
// components/boulanger/vue-soir.tsx
// FIX ✅ : empêche clôtures multiples + persiste état après reload + bouton Levain

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ZapOff, Package, Loader2, Check, ChevronDown, Info, Plus, Minus, Sparkles } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import VueRapportIA from './vue-rapport-ia';

function KpiCard({ label, value, sub, color='default' }: {
  label: string; value: string; sub?: string; color?: 'default'|'green'|'amber'|'red';
}) {
  const c={default:{text:'text-white',bg:'bg-white/5',border:'border-white/8'},green:{text:'text-green-400',bg:'bg-green-400/8',border:'border-green-400/15'},amber:{text:'text-amber-400',bg:'bg-amber-400/8',border:'border-amber-400/15'},red:{text:'text-red-400',bg:'bg-red-400/8',border:'border-red-400/15'}}[color];
  return <div className={`flex-1 rounded-2xl ${c.bg} border ${c.border} p-3`}><p className="text-white/30 text-[10px] uppercase tracking-widest">{label}</p><p className={`${c.text} text-xl font-bold mt-1 tabular-nums leading-none`}>{value}</p>{sub&&<p className="text-white/25 text-[10px] mt-1">{sub}</p>}</div>;
}

function StockFinalCell({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.button whileTap={{scale:0.85}} onPointerDown={()=>{if(value>0)onChange(value-1)}} disabled={value<=0}
        className={`w-12 h-12 rounded-xl flex items-center justify-center select-none touch-manipulation transition-all ${value<=0?'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed':'bg-white/10 border border-white/12 hover:bg-white/16'}`}>
        <Minus size={16} strokeWidth={2.5} className="text-white"/>
      </motion.button>
      <motion.div key={value} initial={{scale:1.2}} animate={{scale:1}} transition={{duration:0.15}}
        className={`w-14 h-12 rounded-xl flex items-center justify-center text-lg font-bold font-mono border select-none ${value>0?'bg-amber-500/12 border-amber-500/25 text-amber-400':'bg-white/5 border-white/8 text-white/40'}`}>
        {value}
      </motion.div>
      <motion.button whileTap={{scale:0.85}} onPointerDown={()=>{if(value<max)onChange(value+1)}} disabled={value>=max}
        className={`w-12 h-12 rounded-xl flex items-center justify-center select-none touch-manipulation transition-all ${value>=max?'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed':'bg-[#C19A6B]/18 border border-[#C19A6B]/28 hover:bg-[#C19A6B]/28'}`}>
        <Plus size={16} strokeWidth={2.5} className="text-[#C19A6B]"/>
      </motion.button>
    </div>
  );
}

interface PanierSuggere { nom: string; emoji: string; items: string[]; prix: number; prixFlash: number; }
function genererPaniers(stocks: StockEntry[], remise=40): PanierSuggere[] {
  const inv=stocks.filter(s=>s.stockFinal>0); if(!inv.length) return [];
  const vt=inv.reduce((s,p)=>s+p.stockFinal*p.prixVente,0); const p: PanierSuggere[]=[];
  if(inv.length>=2){const s=inv.slice(0,Math.min(3,inv.length));const t=s.reduce((x,p)=>x+p.prixVente,0);p.push({nom:'Panier Découverte',emoji:'🌅',items:s.map(p=>p.name),prix:parseFloat(t.toFixed(2)),prixFlash:parseFloat((t*(1-remise/100)).toFixed(2))});}
  if(inv.length>=3){const s=inv.slice(0,Math.min(5,inv.length));const t=s.reduce((x,p)=>x+p.prixVente,0);p.push({nom:'Panier Gourmand',emoji:'🧺',items:s.map(p=>p.name),prix:parseFloat(t.toFixed(2)),prixFlash:parseFloat((t*(1-remise/100)).toFixed(2))});}
  if(inv.length>=4&&vt>5){p.push({nom:'Grand Panier Anti-Gaspi',emoji:'🎁',items:inv.map(p=>`${p.stockFinal}× ${p.name}`),prix:parseFloat(vt.toFixed(2)),prixFlash:parseFloat((vt*(1-remise/100)).toFixed(2))});}
  return p;
}

export default function VueSoir() {
  const { todayStocks, updateStockFinal, closeDayAndSave, commandesOnline, revenueToday, unsoldToday, unsoldRateToday, totalProducedToday, syncStatus, authLoading } = useBoulanger();
  const [flashActifs,  setFlashActifs]  = useState<Record<string,boolean>>({});
  const [cloture,      setCloture]      = useState(false);
  const [cloturing,    setCloturing]    = useState(false);
  const [expanded,     setExpanded]     = useState(false);
  const [showRapport,  setShowRapport]  = useState(false);
  const [checkingDB,   setCheckingDB]   = useState(true);

  const isFlashActif = (s: StockEntry) => flashActifs[s.id]!==undefined?flashActifs[s.id]:true;
  const toggleFlash  = (id: string)    => setFlashActifs(p=>({...p,[id]:!p[id]}));

  // ── Charge l'état de clôture depuis la DB → persiste après reload
  // ⚠️ BUG MINUIT : compare la date de la journée avec AUJOURD'HUI dans le
  // fuseau horaire de la boulangerie. Si la journée clôturée est d'hier
  // (ex: minuit à Bogotá), on NE montre PAS l'état clôturé — c'est un nouveau jour.
  useEffect(()=>{
    async function check(){
      try {
        const {data:{session}}=await supabase.auth.getSession();
        if(!session?.access_token) return;

        // 1. Récupère "aujourd'hui" dans le timezone de la boulangerie
        const todayRes = await fetch('/api/boulanger/ai/today', {
          headers:{Authorization:`Bearer ${session.access_token}`},
          cache:'no-store',
        });
        const todayData = todayRes.ok
          ? await todayRes.json() as { today: string }
          : { today: new Date().toISOString().split('T')[0] };
        const todayTZ = todayData.today;

        // 2. Charge la journée
        const res=await fetch('/api/boulanger/journee',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
        if(!res.ok) return;
        const {journee}=await res.json() as {journee:{cloturee:boolean; date:string}|null};

        // 3. Guard minuit : la journée clôturée est-elle bien celle d'aujourd'hui ?
        if(journee?.cloturee && journee.date === todayTZ) {
          setCloture(true);
        }
        // Si journee.date !== todayTZ → journée d'hier → nouveau jour → cloture reste false
      } catch{}
      finally{setCheckingDB(false);}
    }
    check();
  },[]);

  const handleCloturer=async()=>{
    if(cloture||cloturing) return;  // GUARD clôture multiple
    setCloturing(true);
    try{await closeDayAndSave(commandesOnline);setCloture(true);}
    finally{setCloturing(false);}
  };

  const kpiColor=unsoldRateToday<5?'green':unsoldRateToday<10?'amber':'red';
  const invAvecStock=todayStocks.filter(s=>s.stockFinal>0);
  const paniers=genererPaniers(todayStocks);
  const flashCount=invAvecStock.filter(isFlashActif).length;

  if(authLoading||checkingDB) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="text-[#C19A6B]/50 animate-spin"/></div>;
  if(showRapport) return <VueRapportIA onClose={()=>setShowRapport(false)}/>;
  if(todayStocks.length===0) return <div className="flex flex-col items-center justify-center py-16 text-center"><span className="text-5xl mb-4">🌙</span><p className="text-white/50 font-medium">Aucune production saisie</p><p className="text-white/25 text-sm mt-1">Saisissez dans l'onglet <span className="text-[#C19A6B]">Matin</span></p></div>;

  return (
    <div className="space-y-4">
      <div data-tour="soir-header" className="pt-2">
        <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">Clôture du soir</p>
        <h1 className="text-white text-2xl font-bold mt-1" style={{fontFamily:'Playfair Display, serif'}}>Bilan & Invendus</h1>
        <p className="text-white/35 text-xs mt-1.5">Saisissez les invendus. Partez de <strong className="text-white/55">0</strong>.</p>
      </div>
      <div className="flex gap-2.5">
        <KpiCard label="CA estimé" value={`${revenueToday.toFixed(0)} €`} color="green"/>
        <KpiCard label="Invendus" value={`${unsoldRateToday.toFixed(1)} %`} sub={`${unsoldToday} pcs`} color={kpiColor as 'green'|'amber'|'red'}/>
        <KpiCard label="Pièces" value={`${totalProducedToday}`} sub={`−${unsoldToday} non vend.`}/>
      </div>
      <div className="rounded-2xl border overflow-hidden" style={{background:'linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))',borderColor:'rgba(255,255,255,0.07)'}}>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5"><p className="flex-1 text-white/30 text-[10px] uppercase tracking-widest">Produit · production</p><p className="text-amber-400/60 text-[10px] font-semibold uppercase">Invendus restants</p></div>
        {todayStocks.map(s=>{
          const max=s.snapshot14hDone?s.snapshot14h:s.snapshot10hDone?s.snapshot10h:s.production;
          const ref=s.snapshot14hDone?`Snapshot 14h : ${s.snapshot14h} restants`:s.snapshot10hDone?`Snapshot 10h : ${s.snapshot10h} restants`:`${s.production} produits`;
          return <div key={s.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/4 last:border-0">
            <div className="flex-1 flex items-center gap-2.5 min-w-0"><span className="text-xl flex-shrink-0">{s.emoji}</span><div className="min-w-0"><p className="text-white text-sm font-medium truncate">{s.name}</p><p className="text-white/35 text-[10px]">{ref}{s.stockFinal>0&&<span className="text-amber-400/70 ml-2">· {max-s.stockFinal} vendus</span>}</p></div></div>
            <StockFinalCell value={s.stockFinal} max={max} onChange={val=>updateStockFinal(s.id,val)}/>
          </div>;
        })}
      </div>
      <div data-tour="soir-flash" className="rounded-2xl border overflow-hidden" style={{background:'linear-gradient(145deg,rgba(193,154,107,0.06),rgba(193,154,107,0.02))',borderColor:'rgba(193,154,107,0.18)'}}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2"><Zap size={14} className="text-[#C19A6B]"/><span className="text-[#C19A6B] text-sm font-semibold">Paniers anti-gaspi</span>{flashCount>0&&<span className="text-[10px] bg-[#C19A6B]/20 text-[#C19A6B]/90 px-2 py-0.5 rounded-full">{flashCount} actif{flashCount>1?'s':''}</span>}</div>
          <p className="text-white/30 text-[10px]">−40% du prix</p>
        </div>
        <div className="px-4 py-1">
          {invAvecStock.length===0?<div className="py-4 text-center"><p className="text-white/25 text-sm">🎉 Aucun invendu</p></div>:
            invAvecStock.map(s=>{const pf=s.prixVente*0.6;const actif=isFlashActif(s);return <div key={s.id} className="flex items-center gap-3 py-2.5 border-b border-white/4 last:border-0"><span className="text-lg flex-shrink-0">{s.emoji}</span><div className="flex-1 min-w-0"><p className="text-white text-sm">{s.name}</p><p className="text-white/30 text-[10px]">{s.stockFinal} restant · <span className="line-through">{s.prixVente.toFixed(2)}€</span> <span className="text-[#C19A6B]/80">{pf.toFixed(2)}€</span></p></div><button onClick={()=>toggleFlash(s.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${actif?'bg-[#C19A6B]/20 border-[#C19A6B]/30 text-[#C19A6B]':'bg-white/5 border-white/8 text-white/40'}`}>{actif?<><Zap size={11}/> Actif</>:<><ZapOff size={11}/> Off</>}</button></div>;})
          }
        </div>
      </div>
      {paniers.length>0&&<div><button onClick={()=>setExpanded(!expanded)} className="w-full flex items-center justify-between py-2"><p className="text-white/50 text-xs font-semibold uppercase tracking-widest">Paniers suggérés ({paniers.length})</p><ChevronDown size={14} className={`text-white/30 transition-transform ${expanded?'rotate-180':''}`}/></button><AnimatePresence>{expanded&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="space-y-2 overflow-hidden">{paniers.map(p=><div key={p.nom} className="rounded-2xl border px-4 py-3" style={{background:'rgba(255,255,255,0.02)',borderColor:'rgba(255,255,255,0.06)'}}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-xl">{p.emoji}</span><p className="text-white text-sm font-semibold">{p.nom}</p></div><div className="text-right"><p className="text-[#C19A6B] text-sm font-bold">{p.prixFlash.toFixed(2)}€</p><p className="text-white/25 text-[10px] line-through">{p.prix.toFixed(2)}€</p></div></div><p className="text-white/35 text-[11px] mt-1.5">{p.items.join(' · ')}</p></div>)}</motion.div>}</AnimatePresence></div>}
      {commandesOnline>0&&<div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/15 rounded-xl px-4 py-3"><Info size={13} className="text-blue-400 flex-shrink-0"/><p className="text-white/50 text-xs"><span className="text-blue-300 font-semibold">{commandesOnline}</span> cmd click&collect</p></div>}

      {/* Clôture / Levain */}
      {!cloture?(
        <motion.button whileTap={{scale:0.97}} onClick={handleCloturer} disabled={cloturing||syncStatus==='saving'}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-base transition-all disabled:opacity-50 touch-manipulation"
          style={{background:'linear-gradient(135deg,rgba(193,154,107,0.25),rgba(193,154,107,0.12))',border:'1px solid rgba(193,154,107,0.3)',color:'#C19A6B'}}>
          {cloturing?<><Loader2 size={18} className="animate-spin"/> Clôture…</>:<><Package size={18}/> Clôturer la journée</>}
        </motion.button>
      ):(
        <div className="space-y-3">
          <div className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 border" style={{background:'rgba(74,222,128,0.1)',borderColor:'rgba(74,222,128,0.25)'}}>
            <Check size={18} className="text-green-400"/>
            <span className="text-green-400 text-base font-bold">Journée clôturée ✓</span>
          </div>
          <motion.button initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:0.2}}
            whileTap={{scale:0.97}} onClick={()=>setShowRapport(true)}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all"
            style={{background:'linear-gradient(135deg,rgba(139,92,246,0.18),rgba(193,154,107,0.12))',border:'1px solid rgba(139,92,246,0.3)',color:'#C19A6B'}}>
            <Sparkles size={18}/> Rapport Levain + Plan de production
          </motion.button>
          <p className="text-center text-white/20 text-[10px]">Levain · Votre assistant boulanger IA · Données anonymisées</p>
        </div>
      )}
      <p className="text-center text-white/18 text-[10px] pb-2">La clôture sauvegarde vos données pour les statistiques ML.</p>
    </div>
  );
}