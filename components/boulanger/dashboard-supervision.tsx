'use client';
// components/boulanger/dashboard-supervision.tsx
// ─────────────────────────────────────────────────────────────
// Dashboard Supervision — Vue gérant/owner pour le suivi équipe
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, AlertTriangle, Check, X, Clock, Users,
  Sun, Camera, Moon, Zap, ShoppingBag, Loader2,
  TrendingUp, TrendingDown, Activity,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────

interface JourneeData {
  date: string;
  production_saisie: boolean;
  snapshot_10h_fait: boolean;
  snapshot_10h_at: string | null;
  snapshot_14h_fait: boolean;
  snapshot_14h_at: string | null;
  flash_actif: boolean;
  cloturee: boolean;
  ca_estime: number;
  taux_invendu: number | null;
}

interface CommandesData {
  total: number;
  en_attente: number;
  confirmee: number;
  prete: number;
  recuperee: number;
  annulee: number;
}

interface EquipeMembre {
  id: string;
  prenom: string;
  role: 'gerant' | 'employe';
  statut: string;
  last_login_at: string | null;
}

interface Alerte {
  niveau: 'rouge' | 'orange' | 'jaune';
  message: string;
  action: string | null;
}

interface ActiviteJour {
  date: string;
  actif: boolean;
}

interface ActiviteMembre {
  membre_id: string;
  prenom: string;
  jours: ActiviteJour[];
}

interface DashboardData {
  journee: JourneeData;
  commandes: CommandesData;
  equipe: EquipeMembre[];
  alertes: Alerte[];
  activite_7j: ActiviteMembre[];
}

// ── Helpers ──────────────────────────────────────────────────

function formatLastLogin(isoDate: string | null): string {
  if (!isoDate) return 'Jamais';
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

// ── Composants UI ─────────────────────────────────────────────

function AlerteCard({ alert }: { alert: Alerte }) {
  const colors = {
    rouge:  { bg: 'rgba(196,75,75,0.1)',  border: 'rgba(196,75,75,0.3)',  text: '#F87171', icon: AlertTriangle },
    orange: { bg: 'rgba(212,137,26,0.1)', border: 'rgba(212,137,26,0.3)', text: '#F59E0B', icon: AlertTriangle },
    jaune:  { bg: 'rgba(250,204,21,0.1)', border: 'rgba(250,204,21,0.3)', text: '#FACC15', icon: Clock },
  };
  const c = colors[alert.niveau];
  const Icon = c.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border"
      style={{ background: c.bg, borderColor: c.border }}>
      <Icon size={16} style={{ color: c.text }} />
      <p className="text-sm flex-1" style={{ color: c.text }}>{alert.message}</p>
    </motion.div>
  );
}

function EtapeJournee({
  label, icon: Icon, done, time, locked,
}: {
  label: string;
  icon: React.ElementType;
  done: boolean;
  time?: string | null;
  locked?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
        style={{
          background: done ? 'rgba(61,158,106,0.15)' : locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${done ? 'rgba(61,158,106,0.3)' : locked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`,
        }}>
        {done ? (
          <Check size={18} className="text-green-400" />
        ) : locked ? (
          <Icon size={16} className="text-white/20" />
        ) : (
          <Icon size={16} className="text-white/40" />
        )}
      </div>
      <p className={`text-[9px] font-medium uppercase tracking-wide ${done ? 'text-green-400' : locked ? 'text-white/20' : 'text-white/40'}`}>
        {label}
      </p>
      {time && <p className="text-[9px] text-white/30 font-mono">{time}</p>}
    </div>
  );
}

function CommandesBar({ commandes }: { commandes: CommandesData }) {
  const total = commandes.total || 1;
  const segments = [
    { key: 'en_attente', count: commandes.en_attente, color: '#F59E0B', label: 'En attente' },
    { key: 'confirmee',  count: commandes.confirmee,  color: '#3B82F6', label: 'Confirmées' },
    { key: 'prete',      count: commandes.prete,      color: '#8B5CF6', label: 'Prêtes' },
    { key: 'recuperee',  count: commandes.recuperee,  color: '#22C55E', label: 'Récupérées' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">Commandes du jour</p>
        <p className="text-white font-mono text-sm">{commandes.total}</p>
      </div>

      {/* Barre segmentée */}
      <div className="h-2 rounded-full overflow-hidden flex bg-white/5">
        {segments.map(s => (
          s.count > 0 && (
            <div
              key={s.key}
              className="h-full transition-all"
              style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            />
          )
        ))}
      </div>

      {/* Légende */}
      <div className="grid grid-cols-4 gap-2">
        {segments.map(s => (
          <div key={s.key} className="text-center">
            <p className="font-mono text-sm" style={{ color: s.color }}>{s.count}</p>
            <p className="text-[9px] text-white/30">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquipeRow({ membre }: { membre: EquipeMembre }) {
  const isOnline = membre.last_login_at && (Date.now() - new Date(membre.last_login_at).getTime()) < 30 * 60 * 1000;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
          <span className="text-white/60 text-xs font-bold">{membre.prenom[0]}</span>
        </div>
        {isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#1A0F0A]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm font-medium truncate">{membre.prenom}</p>
        <p className="text-white/30 text-[10px]">
          {membre.role === 'gerant' ? 'Gérant' : 'Vendeur'}
          {membre.statut === 'invite' && ' · Invitation en attente'}
        </p>
      </div>
      <div className="text-right">
        <p className="text-white/40 text-xs">{formatLastLogin(membre.last_login_at)}</p>
      </div>
    </div>
  );
}

function ActiviteHeatmap({ membre }: { membre: ActiviteMembre }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <p className="text-white/60 text-xs w-20 truncate">{membre.prenom}</p>
      <div className="flex gap-1">
        {membre.jours.map((j, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded"
            style={{
              background: j.actif ? 'rgba(61,158,106,0.5)' : 'rgba(255,255,255,0.05)',
            }}
            title={`${formatDateShort(j.date)} — ${j.actif ? 'Actif' : 'Inactif'}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────

export default function DashboardSupervision({ isOwner }: { isOwner: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Non authentifié');

        const res = await fetch('/api/boulanger/dashboard-supervision', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });

        if (!res.ok) throw new Error('Erreur chargement');
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    // Refresh toutes les 60 secondes
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={24} className="text-white/30 animate-spin" />
        <p className="text-white/40 text-sm mt-3">Chargement du tableau de bord...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle size={32} className="text-red-400/50 mb-4" />
        <p className="text-white/50 text-sm">{error || 'Erreur de chargement'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={18} className="text-purple-400" />
          <p className="text-purple-400 text-[11px] uppercase tracking-widest font-medium">Supervision</p>
        </div>
        <h1 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
          Tableau de bord
        </h1>
        {isOwner && (
          <p className="text-white/30 text-xs mt-1">Vue propriétaire — toutes les données de l'équipe</p>
        )}
      </div>

      {/* Alertes */}
      {data.alertes.length > 0 && (
        <div className="space-y-2">
          <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium px-0.5">Alertes</p>
          {data.alertes.map((alert, i) => (
            <AlerteCard key={i} alert={alert} />
          ))}
        </div>
      )}

      {/* État de la journée */}
      <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium mb-4">Progression de la journée</p>

        <div className="flex justify-between items-start">
          <EtapeJournee
            label="Matin"
            icon={Sun}
            done={data.journee.production_saisie}
            locked={false}
          />
          <EtapeJournee
            label="10h"
            icon={Camera}
            done={data.journee.snapshot_10h_fait}
            time={formatTime(data.journee.snapshot_10h_at)}
            locked={!data.journee.production_saisie}
          />
          <EtapeJournee
            label="14h"
            icon={Camera}
            done={data.journee.snapshot_14h_fait}
            time={formatTime(data.journee.snapshot_14h_at)}
            locked={!data.journee.snapshot_10h_fait}
          />
          <EtapeJournee
            label="Flash"
            icon={Zap}
            done={data.journee.flash_actif}
            locked={false}
          />
          <EtapeJournee
            label="Soir"
            icon={Moon}
            done={data.journee.cloturee}
            locked={false}
          />
        </div>

        {/* Résumé */}
        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
          <div>
            <p className="text-white/40 text-[10px]">CA estimé</p>
            <p className="text-[#C19A6B] font-mono text-lg font-bold">{data.journee.ca_estime.toFixed(2)}€</p>
          </div>
          {data.journee.taux_invendu !== null && (
            <div className="text-right">
              <p className="text-white/40 text-[10px]">Taux invendu</p>
              <p className={`font-mono text-lg font-bold ${data.journee.taux_invendu < 5 ? 'text-green-400' : data.journee.taux_invendu < 10 ? 'text-amber-400' : 'text-red-400'}`}>
                {data.journee.taux_invendu.toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Commandes */}
      <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <CommandesBar commandes={data.commandes} />
      </div>

      {/* Équipe */}
      {data.equipe.length > 0 && (
        <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">Équipe</p>
            <div className="flex items-center gap-1.5 text-white/30">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[9px]">En ligne</span>
            </div>
          </div>
          <div className="divide-y divide-white/5">
            {data.equipe.map(m => (
              <EquipeRow key={m.id} membre={m} />
            ))}
          </div>
        </div>
      )}

      {/* Activité 7 jours */}
      {data.activite_7j.length > 0 && (
        <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium">Activité 7 jours</p>
            <Activity size={12} className="text-white/30" />
          </div>

          {/* Jours headers */}
          <div className="flex items-center gap-2 mb-2 pl-20">
            {data.activite_7j[0]?.jours.map((j, i) => (
              <p key={i} className="w-5 text-center text-[8px] text-white/30">
                {new Date(j.date).toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 1)}
              </p>
            ))}
          </div>

          {/* Heatmap par membre */}
          {data.activite_7j.map(m => (
            <ActiviteHeatmap key={m.membre_id} membre={m} />
          ))}
        </div>
      )}

      {/* Aucune alerte */}
      {data.alertes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(61,158,106,0.1)', border: '1px solid rgba(61,158,106,0.2)' }}>
            <Check size={20} className="text-green-400" />
          </div>
          <p className="text-white/50 text-sm font-medium">Tout va bien !</p>
          <p className="text-white/30 text-xs mt-1">Aucune alerte à signaler</p>
        </div>
      )}
    </div>
  );
}