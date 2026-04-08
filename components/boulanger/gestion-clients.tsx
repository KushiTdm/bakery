'use client';
// components/boulanger/gestion-clients.tsx
// ─────────────────────────────────────────────────────────────
// Gestion des pénalités clients (no-show)
// Accessible depuis la page commandes (owner/gérant)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import {
  Shield, ShieldOff, AlertTriangle, Check, Loader2,
  Mail, X, ArrowLeft,
} from 'lucide-react';

interface ClientPenalite {
  id:               string;
  client_email:     string;
  nb_non_recupere:  number;
  bloque:           boolean;
  blocage_date:     string | null;
  debloque_le:      string | null;
  note_deblocage:   string | null;
  updated_at:       string;
}

interface Config {
  seuil:  number;
  active: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function DebloquerModal({ client, onConfirm, onClose }: {
  client: ClientPenalite;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-sm bg-[#1A0F0A] border border-white/12 rounded-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Débloquer le client</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white/60">
            <X size={16} />
          </button>
        </div>

        <div className="bg-white/5 rounded-xl px-3 py-2.5">
          <p className="text-white/60 text-xs flex items-center gap-2">
            <Mail size={12} />
            {client.client_email}
          </p>
          <p className="text-white/40 text-xs mt-1">
            {client.nb_non_recupere} commande(s) non récupérée(s)
          </p>
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note optionnelle (ex: client contacté par téléphone)"
          maxLength={500}
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm placeholder:text-white/25 resize-none focus:outline-none focus:border-[#C19A6B]/40"
        />

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 text-sm hover:bg-white/5 transition-colors">
            Annuler
          </button>
          <button onClick={() => onConfirm(note)}
            className="flex-1 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm font-medium hover:bg-green-500/25 transition-colors flex items-center justify-center gap-1.5">
            <ShieldOff size={13} />Débloquer
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function GestionClients({ onClose }: { onClose: () => void }) {
  const [clients, setClients] = useState<ClientPenalite[]>([]);
  const [config,  setConfig]  = useState<Config>({ seuil: 3, active: true });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<'all' | 'bloque'>('all');
  const [debloquerClient, setDebloquerClient] = useState<ClientPenalite | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadClients = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Non authentifié'); return; }

      const params = filter === 'bloque' ? '?bloque=true' : '';
      const res = await fetch(`/api/boulanger/clients${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Erreur chargement');
        return;
      }

      const data = await res.json() as { clients: ClientPenalite[]; config: Config };
      setClients(data.clients ?? []);
      setConfig(data.config);
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const handleDebloquer = useCallback(async (email: string, note: string) => {
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/boulanger/clients/${encodeURIComponent(email)}/debloquer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ note }),
      });

      if (res.ok) {
        setDebloquerClient(null);
        loadClients();
      }
    } finally { setActionLoading(false); }
  }, [loadClients]);

  const bloques = clients.filter(c => c.bloque);
  const displayed = filter === 'bloque' ? bloques : clients;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/40 hover:text-white/60 transition-colors">
            <ArrowLeft size={14} />
          </button>
          <div>
            <h2 className="text-white font-bold text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
              Gestion Clients
            </h2>
            <p className="text-white/30 text-xs">
              Pénalités no-show · Seuil : {config.seuil} absence{config.seuil > 1 ? 's' : ''}
              {!config.active && ' (désactivé)'}
            </p>
          </div>
        </div>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white/4 border border-white/8 rounded-2xl p-3 text-center">
          <p className="text-white font-bold text-xl font-mono">{clients.length}</p>
          <p className="text-white/35 text-[10px] uppercase tracking-wider mt-0.5">Total pénalités</p>
        </div>
        <div className={`border rounded-2xl p-3 text-center ${
          bloques.length > 0 ? 'bg-red-400/8 border-red-400/20' : 'bg-white/4 border-white/8'
        }`}>
          <p className={`font-bold text-xl font-mono ${bloques.length > 0 ? 'text-red-300' : 'text-white'}`}>
            {bloques.length}
          </p>
          <p className="text-white/35 text-[10px] uppercase tracking-wider mt-0.5">Bloqués</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {(['all', 'bloque'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              filter === f
                ? 'bg-[#C19A6B]/15 text-[#C19A6B] border-[#C19A6B]/30'
                : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/8'
            }`}>
            {f === 'all' ? `Tous (${clients.length})` : `Bloqués (${bloques.length})`}
          </button>
        ))}
      </div>

      {/* Liste */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
        </div>
      )}

      {!loading && !error && displayed.length === 0 && (
        <div className="text-center py-10">
          <Shield size={32} className="text-white/10 mx-auto mb-3" />
          <p className="text-white/40 text-sm">
            {filter === 'bloque' ? 'Aucun client bloqué' : 'Aucune pénalité enregistrée'}
          </p>
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {displayed.map(client => (
              <motion.div
                key={client.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-4 ${
                  client.bloque
                    ? 'bg-red-400/5 border-red-400/15'
                    : 'bg-white/4 border-white/8'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-white/80 text-sm font-medium truncate">
                      {client.client_email}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        client.bloque
                          ? 'bg-red-400/12 text-red-300 border-red-400/25'
                          : 'bg-amber-400/12 text-amber-300 border-amber-400/25'
                      }`}>
                        {client.bloque ? 'Bloqué' : `${client.nb_non_recupere}/${config.seuil} absence${client.nb_non_recupere > 1 ? 's' : ''}`}
                      </span>
                      {client.blocage_date && (
                        <span className="text-white/25 text-[10px]">
                          depuis {formatDate(client.blocage_date)}
                        </span>
                      )}
                      {client.debloque_le && !client.bloque && (
                        <span className="text-green-400/50 text-[10px] flex items-center gap-1">
                          <Check size={10} />débloqué {formatDate(client.debloque_le)}
                        </span>
                      )}
                    </div>
                  </div>

                  {client.bloque && (
                    <button
                      onClick={() => setDebloquerClient(client)}
                      disabled={actionLoading}
                      className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-green-500/12 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-40"
                    >
                      Débloquer
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal déblocage */}
      {debloquerClient && (
        <DebloquerModal
          client={debloquerClient}
          onConfirm={(note) => handleDebloquer(debloquerClient.client_email, note)}
          onClose={() => setDebloquerClient(null)}
        />
      )}
    </div>
  );
}
