'use client';
// components/boulanger/vue-rapport-mensuel.tsx
// ─────────────────────────────────────────────────────────────
// Vue du rapport mensuel : génération manuelle, affichage, PDF.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, Loader2, Download, ChevronLeft, ChevronRight, Calendar,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, Target,
  MapPin, Store, Users, Coffee, Briefcase, ArrowUp, ArrowDown,
  BarChart2, FileText, Trophy, Heart,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────

interface Rapport {
  id:                string;
  mois_reference:    string;
  score_performance: number | null;
  verdict_flash:     string | null;
  rapport_json:      Record<string, unknown>;
  statut:            'en_cours' | 'genere' | 'erreur';
  erreur_msg?:       string | null;
  created_at:        string;
  updated_at?:       string | null;
}

interface HistoriqueItem {
  id:                string;
  mois_reference:    string;
  score_performance: number | null;
  verdict_flash:     string | null;
  statut:            string;
  created_at:        string;
}

// ── Helpers ──────────────────────────────────────────────────

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (m === 0) return `${y - 1}-12`;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function shiftMonth(mois: string, delta: number): string {
  const [y, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function moisLabel(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  const l = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function fmtEuro(n: number | null | undefined): string {
  return `${Number(n ?? 0).toLocaleString('fr-FR')} €`;
}

function fmtPct(n: number | null | undefined, signed = false): string {
  if (n == null) return 'n/a';
  const s = signed && n > 0 ? '+' : '';
  return `${s}${n}%`;
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-stone-100 text-stone-600';
  if (score >= 80) return 'bg-green-100 text-green-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function priorityBadge(p: string): { label: string; cls: string } {
  if (p === 'high')   return { label: 'Priorité haute',   cls: 'bg-red-50 text-red-700 border-red-200' };
  if (p === 'medium') return { label: 'Priorité moyenne', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Priorité basse', cls: 'bg-green-50 text-green-700 border-green-200' };
}

// ── Composant principal ──────────────────────────────────────

export default function VueRapportMensuel() {
  const [mois,      setMois]    = useState<string>(previousMonth());
  const [rapport,   setRapport] = useState<Rapport | null>(null);
  const [historique, setHisto]  = useState<HistoriqueItem[]>([]);
  const [loading,   setLoading] = useState(false);
  const [generating, setGen]    = useState(false);
  const [downloading, setDL]    = useState(false);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const loadRapport = useCallback(async () => {
    setLoading(true);
    try {
      const tok = await getToken();
      if (!tok) return;
      const res = await fetch(`/api/boulanger/ai/rapport-mensuel?mois=${mois}`, {
        headers: { Authorization: `Bearer ${tok}` },
        cache:   'no-store',
      });
      if (!res.ok) return;
      const j = await res.json() as { rapport: Rapport | null; historique: HistoriqueItem[] };
      setRapport(j.rapport);
      setHisto(j.historique ?? []);
    } finally {
      setLoading(false);
    }
  }, [mois]);

  useEffect(() => { loadRapport(); }, [loadRapport]);

  // Polling si en_cours
  useEffect(() => {
    if (rapport?.statut !== 'en_cours') return;
    const t = setInterval(() => loadRapport(), 3000);
    return () => clearInterval(t);
  }, [rapport?.statut, loadRapport]);

  const handleGenerate = async () => {
    setGen(true);
    try {
      const tok = await getToken();
      if (!tok) { toast.error('Non authentifié'); return; }
      const res = await fetch('/api/boulanger/ai/rapport-mensuel', {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mois }),
      });
      const j = await res.json() as { rapport?: Rapport; cached?: boolean; error?: string };
      if (!res.ok) {
        toast.error(j.error ?? 'Erreur génération');
        return;
      }
      if (j.rapport) setRapport(j.rapport);
      toast.success(j.cached ? 'Rapport déjà généré' : 'Rapport généré');
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setGen(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDL(true);
    try {
      const tok = await getToken();
      if (!tok) { toast.error('Non authentifié'); return; }
      const res = await fetch(`/api/boulanger/ai/rapport-mensuel/pdf?mois=${mois}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) {
        toast.error('Erreur export PDF');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-mensuel-${mois}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur téléchargement');
    } finally {
      setDL(false);
    }
  };

  const j = (rapport?.rapport_json ?? {}) as Record<string, unknown>;

  const score    = rapport?.score_performance ?? (j.score_global as number | undefined) ?? null;
  const verdict  = rapport?.verdict_flash ?? (j.verdict_mensuel as string | undefined) ?? null;
  const encourage = (j.message_encouragement as string | undefined) ?? null;
  const finalMsg = (j.message_final as string | undefined) ?? null;

  const kpis = (j.kpis_mois as Record<string, unknown> | undefined) ?? {};
  const kpisResume = (j.kpis_resume as Record<string, string> | undefined) ?? {};
  const comparaison = (j.comparaison_m_precedent as Record<string, unknown> | undefined) ?? {};

  const topProduits = (j.top_produits as Array<{ nom: string; emoji: string; ca_estime: number; total_vendu: number; taux_invendu: number }> | undefined) ?? [];
  const sousPerf    = (j.produits_sous_performants as Array<{ nom: string; emoji: string; taux_invendu: number; total_production: number }> | undefined) ?? [];
  const jourSemaine = (j.jour_semaine_analyse as Array<{ jour_label: string; ca_moyen: number; invendus_pct: number; n: number }> | undefined) ?? [];

  const axes  = (j.axes_amelioration as Array<{ priorite: string; titre: string; pourquoi: string; comment: string }> | undefined) ?? [];
  const recos = (j.recommandations_macro as Array<{ priorite: string; titre: string; action: string }> | undefined) ?? [];

  const quartier = (j.contexte_quartier as Record<string, unknown> | undefined) ?? null;

  const evolCa  = (j.evolution_ca as Array<{ date: string; ca: number }> | undefined) ?? [];
  const evolInv = (j.evolution_invendus as Array<{ date: string; taux: number }> | undefined) ?? [];

  const caDelta    = comparaison.ca_delta_pct as number | null | undefined;
  const invDelta   = comparaison.invendus_delta_pct as number | null | undefined;
  const cmdDelta   = comparaison.commandes_delta_pct as number | null | undefined;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white pb-24">
      <div className="mx-auto max-w-4xl px-4 pt-6">
        {/* ── Sélecteur de mois ── */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setMois(shiftMonth(mois, -1))}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-sm text-stone-700"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-stone-900">
            <Calendar className="w-4 h-4 text-amber-600" />
            <h2 className="font-serif text-xl">{moisLabel(mois)}</h2>
          </div>
          <button
            onClick={() => setMois(shiftMonth(mois, 1))}
            disabled={shiftMonth(mois, 1) > currentMonth()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-sm text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Mois suivant"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && !rapport ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          </div>
        ) : null}

        {/* ── Pas de rapport : CTA génération ── */}
        {!loading && !rapport ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <Sparkles className="w-10 h-10 text-amber-500 mx-auto mb-4" />
            <h3 className="font-serif text-xl text-stone-900 mb-2">
              Aucun rapport pour {moisLabel(mois)}
            </h3>
            <p className="text-sm text-stone-600 mb-6 max-w-md mx-auto">
              Levain analyse votre mois : tendances, produits phares, recommandations personnalisées et contexte du quartier.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Génération…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Générer le rapport</>
              )}
            </button>
          </div>
        ) : null}

        {/* ── En cours ── */}
        {rapport?.statut === 'en_cours' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <Loader2 className="w-6 h-6 text-amber-600 animate-spin mx-auto mb-3" />
            <p className="text-sm text-amber-900">Rapport en cours de génération…</p>
          </div>
        ) : null}

        {/* ── Erreur ── */}
        {rapport?.statut === 'erreur' ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-red-900 mb-1">Génération échouée</h3>
                <p className="text-sm text-red-700 mb-3">{rapport.erreur_msg ?? 'Erreur inconnue'}</p>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {generating ? 'Nouvelle tentative…' : 'Réessayer'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Rapport généré ── */}
        {rapport?.statut === 'genere' ? (
          <div className="space-y-5">
            {/* Hero : Score + Verdict + PDF */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center ${scoreBg(score)}`}>
                  <span className="font-serif text-2xl leading-none">{score ?? '–'}</span>
                  <span className="text-[10px] uppercase tracking-wide mt-1 opacity-75">/100</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-amber-600 mb-1">Verdict du mois</p>
                  <p className="font-serif text-lg text-stone-900 leading-snug">
                    {verdict ?? '—'}
                  </p>
                </div>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium disabled:opacity-50"
                  aria-label="Télécharger PDF"
                >
                  {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  PDF
                </button>
              </div>
            </motion.section>

            {/* Message d'encouragement */}
            {encourage ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5"
              >
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed text-stone-800">{encourage}</p>
                </div>
              </motion.section>
            ) : null}

            {/* KPIs + comparaison m-1 */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-2xl border border-stone-200 p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-amber-600" />
                <h3 className="font-serif text-lg text-stone-900">KPIs du mois</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <KpiCard label="CA total"         value={fmtEuro(kpis.ca_total as number)}        delta={caDelta} />
                <KpiCard label="CA moyen/jour"    value={fmtEuro(kpis.ca_moyen_jour as number)} />
                <KpiCard label="Invendus moyens"  value={fmtPct(kpis.taux_invendu_moyen as number)} delta={invDelta} inverted />
                <KpiCard label="Jours clôturés"   value={`${kpis.jours_cloturee ?? 0}/${kpis.jours_total ?? 0}`} />
                <KpiCard label="Commandes online" value={String(kpis.commandes_online_total ?? 0)}  delta={cmdDelta} />
                <KpiCard label="Paniers flash"    value={String(kpis.paniers_flash_vendus ?? 0)} />
              </div>

              {(kpisResume.ca_commentaire || kpisResume.invendus_commentaire || kpisResume.cloture_commentaire) ? (
                <ul className="space-y-1.5 text-sm text-stone-700 border-t border-stone-100 pt-4">
                  {kpisResume.ca_commentaire ? <li className="flex gap-2"><span className="text-amber-600">—</span>{kpisResume.ca_commentaire}</li> : null}
                  {kpisResume.invendus_commentaire ? <li className="flex gap-2"><span className="text-amber-600">—</span>{kpisResume.invendus_commentaire}</li> : null}
                  {kpisResume.cloture_commentaire ? <li className="flex gap-2"><span className="text-amber-600">—</span>{kpisResume.cloture_commentaire}</li> : null}
                </ul>
              ) : null}
            </motion.section>

            {/* Évolution CA */}
            {evolCa.length > 1 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <h3 className="font-serif text-lg text-stone-900 mb-4">Évolution du CA</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolCa} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid stroke="#F3EFE8" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716C' }} tickFormatter={(d: string) => d.slice(8, 10)} />
                      <YAxis tick={{ fontSize: 10, fill: '#78716C' }} tickFormatter={(v: number) => `${v}€`} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}
                        formatter={(v: number) => [fmtEuro(v), 'CA']}
                      />
                      <Line type="monotone" dataKey="ca" stroke="#C19A6B" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>
            ) : null}

            {/* Évolution invendus */}
            {evolInv.length > 1 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <h3 className="font-serif text-lg text-stone-900 mb-4">Taux d'invendus</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolInv} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid stroke="#F3EFE8" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716C' }} tickFormatter={(d: string) => d.slice(8, 10)} />
                      <YAxis tick={{ fontSize: 10, fill: '#78716C' }} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}
                        formatter={(v: number) => [`${v}%`, 'Invendus']}
                      />
                      <Line type="monotone" dataKey="taux" stroke="#F5A623" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>
            ) : null}

            {/* Top produits */}
            {topProduits.length > 0 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-amber-600" />
                  <h3 className="font-serif text-lg text-stone-900">Top produits du mois</h3>
                </div>
                {j.analyse_top_produits ? (
                  <p className="text-sm text-stone-700 mb-4 leading-relaxed">{j.analyse_top_produits as string}</p>
                ) : null}
                <ul className="space-y-2">
                  {topProduits.map((p, i) => (
                    <li key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-stone-50">
                      <span className="text-lg">{p.emoji}</span>
                      <span className="flex-1 text-sm text-stone-900 font-medium">{p.nom}</span>
                      <span className="text-xs text-stone-500">{p.total_vendu} vendus</span>
                      <span className="text-sm font-medium text-amber-700 w-20 text-right">{fmtEuro(p.ca_estime)}</span>
                    </li>
                  ))}
                </ul>
              </motion.section>
            ) : null}

            {/* Sous-performants */}
            {sousPerf.length > 0 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <h3 className="font-serif text-lg text-stone-900">Produits à surveiller</h3>
                </div>
                {j.analyse_sous_performants ? (
                  <p className="text-sm text-stone-700 mb-4 leading-relaxed">{j.analyse_sous_performants as string}</p>
                ) : null}
                <ul className="space-y-2">
                  {sousPerf.map((p, i) => (
                    <li key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50/50 border border-red-100">
                      <span className="text-lg">{p.emoji}</span>
                      <span className="flex-1 text-sm text-stone-900 font-medium">{p.nom}</span>
                      <span className="text-xs text-stone-500">{p.total_production} produits</span>
                      <span className="text-sm font-medium text-red-600 w-16 text-right">{fmtPct(p.taux_invendu)}</span>
                    </li>
                  ))}
                </ul>
              </motion.section>
            ) : null}

            {/* Analyse jour semaine */}
            {jourSemaine.length > 0 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <h3 className="font-serif text-lg text-stone-900 mb-1">Analyse par jour de semaine</h3>
                {j.analyse_jour_semaine ? (
                  <p className="text-sm text-stone-700 mb-4 leading-relaxed">{j.analyse_jour_semaine as string}</p>
                ) : null}
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={jourSemaine} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid stroke="#F3EFE8" strokeDasharray="3 3" />
                      <XAxis dataKey="jour_label" tick={{ fontSize: 10, fill: '#78716C' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#78716C' }} tickFormatter={(v: number) => `${v}€`} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}
                        formatter={(v: number) => [fmtEuro(v), 'CA moyen']}
                      />
                      <Bar dataKey="ca_moyen" fill="#C19A6B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>
            ) : null}

            {/* Axes d'amélioration */}
            {axes.length > 0 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4 text-amber-600" />
                  <h3 className="font-serif text-lg text-stone-900">Axes d'amélioration</h3>
                </div>
                <div className="space-y-3">
                  {axes.map((a, i) => {
                    const badge = priorityBadge(a.priorite);
                    return (
                      <div key={i} className="p-3 rounded-lg border border-stone-200 bg-stone-50/50">
                        <span className={`inline-block text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${badge.cls} mb-2`}>
                          {badge.label}
                        </span>
                        <h4 className="font-medium text-stone-900 mb-1.5">{a.titre}</h4>
                        <p className="text-xs text-stone-700 mb-1.5"><span className="font-medium">Pourquoi : </span>{a.pourquoi}</p>
                        <p className="text-xs text-stone-700"><span className="font-medium">Comment : </span>{a.comment}</p>
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            ) : null}

            {/* Recommandations macro */}
            {recos.length > 0 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                  <h3 className="font-serif text-lg text-stone-900">Recommandations</h3>
                </div>
                <div className="space-y-2">
                  {recos.map((r, i) => {
                    const badge = priorityBadge(r.priorite);
                    return (
                      <div key={i} className="p-3 rounded-lg border border-stone-200">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <h4 className="font-medium text-stone-900 text-sm">{r.titre}</h4>
                        </div>
                        <p className="text-xs text-stone-700">{r.action}</p>
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            ) : null}

            {/* Contexte quartier */}
            {quartier ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-amber-600" />
                  <h3 className="font-serif text-lg text-stone-900">Contexte quartier</h3>
                </div>
                {quartier.lecture ? (
                  <p className="text-sm text-stone-700 mb-4 leading-relaxed">{quartier.lecture as string}</p>
                ) : null}

                {Array.isArray(quartier.commerces_proximite) === false && typeof quartier.commerces_proximite === 'object' && quartier.commerces_proximite ? (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                    <CommerceBadge icon={<Store className="w-3.5 h-3.5" />} label="Boulangeries" value={(quartier.commerces_proximite as Record<string, number>).boulangeries ?? 0} />
                    <CommerceBadge icon={<Coffee className="w-3.5 h-3.5" />} label="Cafés"        value={(quartier.commerces_proximite as Record<string, number>).cafes ?? 0} />
                    <CommerceBadge icon={<Store className="w-3.5 h-3.5" />} label="Restaurants"  value={(quartier.commerces_proximite as Record<string, number>).restaurants ?? 0} />
                    <CommerceBadge icon={<Users className="w-3.5 h-3.5" />} label="Écoles"        value={(quartier.commerces_proximite as Record<string, number>).ecoles ?? 0} />
                    <CommerceBadge icon={<Briefcase className="w-3.5 h-3.5" />} label="Bureaux"   value={(quartier.commerces_proximite as Record<string, number>).bureaux ?? 0} />
                    <CommerceBadge icon={<Store className="w-3.5 h-3.5" />} label="Supermarchés" value={(quartier.commerces_proximite as Record<string, number>).supermarches ?? 0} />
                  </div>
                ) : null}

                {quartier.type_quartier ? (
                  <p className="text-xs text-stone-600 mb-3">
                    <span className="font-medium">Type : </span>{quartier.type_quartier as string}
                    {quartier.population_estimee_rayon_500m ? ` · ~${quartier.population_estimee_rayon_500m} habitants à 500m` : ''}
                  </p>
                ) : null}

                {quartier.opportunite_positionnement ? (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 mb-3">
                    <p className="text-xs uppercase tracking-wide text-amber-700 font-medium mb-1">Opportunité</p>
                    <p className="text-sm text-stone-800">{quartier.opportunite_positionnement as string}</p>
                  </div>
                ) : null}

                {quartier.veille_concurrentielle ? (
                  <p className="text-sm text-stone-700 mb-3"><span className="font-medium">Concurrence : </span>{quartier.veille_concurrentielle as string}</p>
                ) : null}

                {Array.isArray(quartier.concurrents_directs) && (quartier.concurrents_directs as unknown[]).length > 0 ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-stone-500 font-medium mb-2">Concurrents proches</p>
                    <ul className="space-y-1.5">
                      {(quartier.concurrents_directs as Array<{ nom: string; distance_m: number; note_google: number | null; nombre_avis: number | null }>).slice(0, 5).map((c, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-stone-700">
                          <span className="flex-1">{c.nom}</span>
                          <span className="text-stone-500">{c.distance_m}m</span>
                          {c.note_google != null ? <span className="text-amber-600">★ {c.note_google}</span> : null}
                          {c.nombre_avis != null ? <span className="text-stone-400">({c.nombre_avis})</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </motion.section>
            ) : null}

            {/* Message final */}
            {finalMsg ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5 text-center"
              >
                <p className="font-serif italic text-stone-800 leading-relaxed">« {finalMsg} »</p>
              </motion.section>
            ) : null}

            {/* Historique */}
            {historique.length > 1 ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <h3 className="font-serif text-lg text-stone-900">Historique des rapports</h3>
                </div>
                <ul className="space-y-1.5">
                  {historique.map(h => {
                    const m = h.mois_reference.slice(0, 7);
                    const isCurrent = m === mois;
                    return (
                      <li key={h.id}>
                        <button
                          onClick={() => setMois(m)}
                          disabled={isCurrent}
                          className={`w-full flex items-center justify-between p-2.5 rounded-lg text-sm transition ${isCurrent ? 'bg-amber-50 text-amber-900' : 'hover:bg-stone-50 text-stone-700'}`}
                        >
                          <span className="font-medium">{moisLabel(m)}</span>
                          <span className="flex items-center gap-2">
                            {h.score_performance != null ? (
                              <span className={`text-xs px-2 py-0.5 rounded ${scoreBg(h.score_performance)}`}>
                                {h.score_performance}/100
                              </span>
                            ) : null}
                            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Sub-composants ───────────────────────────────────────────

function KpiCard({ label, value, delta, inverted }: {
  label: string;
  value: string;
  delta?: number | null;
  inverted?: boolean;
}) {
  const hasDelta = delta != null;
  const positive = hasDelta && (inverted ? (delta as number) < 0 : (delta as number) > 0);
  const negative = hasDelta && (inverted ? (delta as number) > 0 : (delta as number) < 0);
  const neutral  = hasDelta && delta === 0;

  return (
    <div className="p-3 rounded-lg bg-stone-50 border border-stone-100">
      <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">{label}</p>
      <p className="text-base font-medium text-stone-900">{value}</p>
      {hasDelta ? (
        <p className={`text-[11px] mt-0.5 flex items-center gap-0.5 ${positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-stone-500'}`}>
          {positive ? <ArrowUp className="w-3 h-3" /> : negative ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {fmtPct(delta, true)}
        </p>
      ) : null}
    </div>
  );
}

function CommerceBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-stone-50 border border-stone-100">
      <div className="text-stone-500 mb-1">{icon}</div>
      <span className="text-sm font-medium text-stone-900">{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-stone-500 text-center mt-0.5 leading-tight">{label}</span>
    </div>
  );
}
