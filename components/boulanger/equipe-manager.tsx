'use client';
// components/boulanger/equipe-manager.tsx
// ─────────────────────────────────────────────────────────────
// Interface de gestion de l'équipe boulangerie.
// Accessible : Owner (CRUD complet) + Gérant (lecture)
//
// Features :
//   - Liste membres (owner + gérant + vendeurs)
//   - Invitation par email avec génération de lien
//   - Modification rôle / permissions / statut
//   - Révocation d'accès
//   - Indicateur limite plan
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, UserX, UserCheck, Settings2, Crown,
  Briefcase, ShoppingBag, Copy, Check, Loader2,
  AlertCircle, ChevronDown, ChevronUp, Link2, Shield,
  RefreshCw, X, Users, Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useBoulanger } from '@/context/boulanger-context';
import {
  ROLE_LABELS, ROLE_DESCRIPTIONS,
  PERMISSION_KEY_LABELS, DEFAULT_PERMISSIONS,
  type BoulangerRole, type PermissionKey, type PermissionLevel,
  type MembreEquipe, PLAN_MEMBER_LIMITS,
} from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────

interface TeamData {
  owner: { email: string; userId: string };
  members: MembreEquipe[];
  plan: string;
  limite: { current: number; max: number; allowed: boolean };
}

// ── Helpers ───────────────────────────────────────────────────

const ROLE_ICONS: Record<BoulangerRole, React.ElementType> = {
  owner:   Crown,
  gerant:  Briefcase,
  employe: ShoppingBag,
};

const ROLE_COLORS: Record<BoulangerRole, string> = {
  owner:   'bg-yellow-400/15 text-yellow-300 border-yellow-400/25',
  gerant:  'bg-blue-400/15 text-blue-300 border-blue-400/25',
  employe: 'bg-[#C19A6B]/15 text-[#C19A6B] border-[#C19A6B]/25',
};

const STATUT_COLORS: Record<string, string> = {
  actif:    'bg-green-400/10 text-green-400',
  invite:   'bg-amber-400/10 text-amber-400',
  suspendu: 'bg-red-400/10 text-red-400',
};

const STATUT_LABELS: Record<string, string> = {
  actif:    'Actif',
  invite:   'En attente',
  suspendu: 'Suspendu',
};

// ── Modal invitation ──────────────────────────────────────────

function InviteModal({
  token,
  boulangerieId,
  onClose,
  onSuccess,
}: {
  token: string;
  boulangerieId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email,       setEmail]      = useState('');
  const [role,        setRole]       = useState<'gerant' | 'employe'>('employe');
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState('');
  const [inviteUrl,   setInviteUrl]  = useState('');
  const [copied,      setCopied]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/boulanger/equipe', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ email, role }),
      });

      const data = await res.json() as {
        success?: boolean;
        inviteUrl?: string;
        error?: string;
      };

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Erreur création invitation');
        return;
      }

      setInviteUrl(data.inviteUrl ?? '');
      onSuccess();

    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-md bg-[#1A0F0A] border border-white/12 rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <UserPlus size={16} className="text-[#C19A6B]" />
            <h3 className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
              {inviteUrl ? 'Invitation créée' : 'Inviter un membre'}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {!inviteUrl ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="employe@boulangerie.fr"
                  required
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
                />
              </div>

              <div>
                <label className="text-white/40 text-xs uppercase tracking-wider block mb-2">
                  Rôle
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['gerant', 'employe'] as const).map(r => {
                    const Icon = ROLE_ICONS[r];
                    return (
                      <button
                        key={r} type="button"
                        onClick={() => setRole(r)}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                          role === r
                            ? 'bg-[#C19A6B]/10 border-[#C19A6B]/30'
                            : 'bg-white/4 border-white/8 hover:bg-white/6'
                        }`}
                      >
                        <Icon size={16} className={role === r ? 'text-[#C19A6B] mt-0.5' : 'text-white/30 mt-0.5'} />
                        <div>
                          <p className={`text-sm font-semibold ${role === r ? 'text-[#C19A6B]' : 'text-white/60'}`}>
                            {ROLE_LABELS[r]}
                          </p>
                          <p className="text-white/25 text-[10px] mt-0.5 leading-relaxed">
                            {ROLE_DESCRIPTIONS[r]}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-white/6 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-colors"
                >
                  Annuler
                </button>
                <motion.button
                  type="submit" whileTap={{ scale: 0.97 }}
                  disabled={loading}
                  className="flex-[2] py-2.5 rounded-xl bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] text-sm font-semibold hover:bg-[#C19A6B]/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" /> Création…</>
                    : <><UserPlus size={14} /> Créer l'invitation</>
                  }
                </motion.button>
              </div>
            </form>
          ) : (
            /* Invitation créée → afficher le lien */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <Check size={16} /> Invitation créée pour <strong>{email}</strong>
              </div>

              <div>
                <p className="text-white/40 text-xs mb-2">
                  Partagez ce lien avec <strong className="text-white/60">{email}</strong>
                  {process.env.NEXT_PUBLIC_RESEND_CONFIGURED === 'true'
                    ? ' (email envoyé automatiquement)'
                    : ' (lien à envoyer manuellement)'
                  }
                </p>
                <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
                  <Link2 size={13} className="text-white/30 flex-shrink-0" />
                  <p className="text-white/50 text-xs truncate flex-1">{inviteUrl}</p>
                  <button
                    onClick={copyLink}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                      copied ? 'bg-green-500/15 text-green-400' : 'bg-[#C19A6B]/15 text-[#C19A6B] hover:bg-[#C19A6B]/25'
                    }`}
                  >
                    {copied ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
                  </button>
                </div>
                <p className="text-white/25 text-[10px] mt-1.5">⏱ Ce lien expire dans 7 jours</p>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] text-sm font-semibold"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Carte membre ──────────────────────────────────────────────

function MembreCard({
  membre,
  isOwner,
  token,
  onRefresh,
}: {
  membre: MembreEquipe;
  isOwner: boolean;
  token: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [loading,  setLoading]    = useState(false);
  const [confirm,  setConfirm]    = useState(false);
  const [editRole, setEditRole]   = useState(membre.role);

  const Icon = ROLE_ICONS[membre.role];

  const isExpired = membre.statut === 'invite' && membre.inviteExpiresAt
    ? new Date(membre.inviteExpiresAt) < new Date()
    : false;

  async function updateMember(patch: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(`/api/boulanger/equipe/${membre.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (res.ok) onRefresh();
    } finally {
      setLoading(false);
    }
  }

  async function revokeAccess() {
    setLoading(true);
    try {
      const res = await fetch(`/api/boulanger/equipe/${membre.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onRefresh();
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  }

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Avatar */}
        <div className="w-10 h-10 bg-white/8 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-white/50" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-sm font-medium">
              {membre.prenom ?? membre.inviteEmail}
            </p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[membre.role]}`}>
              {ROLE_LABELS[membre.role]}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-white/35 text-xs truncate">{membre.inviteEmail}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUT_COLORS[membre.statut] ?? ''}`}>
              {isExpired ? '⏱ Expirée' : STATUT_LABELS[membre.statut] ?? membre.statut}
            </span>
          </div>
        </div>

        {/* Actions owner */}
        {isOwner && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {membre.statut === 'actif' && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/30 hover:text-[#C19A6B] hover:bg-[#C19A6B]/10 transition-all"
              >
                <Settings2 size={13} />
              </button>
            )}
            {membre.statut === 'actif' && (
              <button
                onClick={() => updateMember({ statut: 'suspendu' })}
                disabled={loading}
                className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/30 hover:text-amber-400 hover:bg-amber-400/10 transition-all disabled:opacity-40"
                title="Suspendre"
              >
                <UserX size={13} />
              </button>
            )}
            {membre.statut === 'suspendu' && (
              <button
                onClick={() => updateMember({ statut: 'actif' })}
                disabled={loading}
                className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/15 flex items-center justify-center text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-40"
                title="Réactiver"
              >
                <UserCheck size={13} />
              </button>
            )}
            {!confirm ? (
              <button
                onClick={() => setConfirm(true)}
                className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-all"
                title="Révoquer"
              >
                <UserX size={13} />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={revokeAccess}
                  disabled={loading}
                  className="px-2 py-1 text-[10px] font-bold bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
                >
                  {loading ? '…' : 'Confirmer'}
                </button>
                <button
                  onClick={() => setConfirm(false)}
                  className="px-2 py-1 text-[10px] text-white/30 hover:text-white/60"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section permissions (dépliable, owner seulement) */}
      <AnimatePresence>
        {expanded && isOwner && membre.statut === 'actif' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/6"
          >
            <div className="px-4 py-4 space-y-3">
              {/* Changement de rôle */}
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Rôle</p>
                <div className="flex gap-2">
                  {(['gerant', 'employe'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => {
                        setEditRole(r);
                        updateMember({ role: r });
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                        editRole === r
                          ? 'bg-[#C19A6B]/15 border-[#C19A6B]/25 text-[#C19A6B]'
                          : 'bg-white/4 border-white/8 text-white/40 hover:bg-white/6'
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aperçu permissions du rôle */}
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-2">
                  Permissions ({ROLE_LABELS[editRole]})
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(PERMISSION_KEY_LABELS) as PermissionKey[]).map(key => {
                    const perm = DEFAULT_PERMISSIONS[editRole][key];
                    if (perm === 'none') return null;
                    return (
                      <div key={key} className="flex items-center gap-1.5 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          perm === 'write' ? 'bg-green-400' : 'bg-amber-400'
                        }`} />
                        <span className="text-white/40 truncate">{PERMISSION_KEY_LABELS[key]}</span>
                        <span className={`text-[10px] ml-auto flex-shrink-0 ${
                          perm === 'write' ? 'text-green-400' : 'text-amber-400'
                        }`}>
                          {perm === 'write' ? 'Écriture' : 'Lecture'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function EquipeManager() {
  const { boulangerie, userRole, canRead, canWrite } = useBoulanger();
  const [teamData,     setTeamData]   = useState<TeamData | null>(null);
  const [loading,      setLoading]    = useState(true);
  const [error,        setError]      = useState('');
  const [token,        setToken]      = useState('');
  const [showInvite,   setShowInvite] = useState(false);
  const [inviteRefresh, setInviteRefresh] = useState(0);

  const isOwner = userRole === 'owner';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? '');
    });
  }, []);

  const loadTeam = useCallback(async () => {
    if (!token) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/boulanger/equipe', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json() as TeamData & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Erreur chargement'); return; }
      setTeamData(data);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadTeam();
  }, [token, loadTeam, inviteRefresh]);

  if (!canRead('equipe')) {
    return (
      <div className="text-center py-8">
        <Shield size={24} className="text-white/20 mx-auto mb-3" />
        <p className="text-white/35 text-sm">Accès non autorisé</p>
      </div>
    );
  }

  const planMax = teamData ? PLAN_MEMBER_LIMITS[teamData.plan] ?? 1 : 1;
  const currentCount = teamData ? teamData.limite.current : 1;
  const canInvite = isOwner && teamData?.limite.allowed;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider">Équipe</p>
          <h3 className="text-white font-bold text-lg mt-0.5" style={{ fontFamily: 'Playfair Display, serif' }}>
            Gestion des membres
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTeam}
            disabled={loading}
            className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/30 hover:text-white/60 transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {isOwner && canInvite && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-[#C19A6B]/25 transition-colors"
            >
              <UserPlus size={13} /> Inviter
            </button>
          )}
        </div>
      </div>

      {/* Indicateur plan */}
      {teamData && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs ${
          teamData.limite.allowed
            ? 'bg-white/4 border-white/8'
            : 'bg-amber-400/8 border-amber-400/20'
        }`}>
          <div className="flex items-center gap-2">
            <Users size={13} className={teamData.limite.allowed ? 'text-white/40' : 'text-amber-400'} />
            <span className={teamData.limite.allowed ? 'text-white/50' : 'text-amber-300'}>
              {currentCount} / {planMax === 999 ? '∞' : planMax} membre{currentCount > 1 ? 's' : ''} — Plan {teamData.plan.toUpperCase()}
            </span>
          </div>
          {!teamData.limite.allowed && (
            <span className="text-amber-400 font-medium">Limite atteinte</span>
          )}
          {isOwner && !teamData.limite.allowed && (
            <span className="text-[#C19A6B] text-[10px]">
              → Passer au plan {teamData.plan === 'starter' ? 'Pro' : 'Multi'}
            </span>
          )}
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Chargement */}
      {loading && !teamData && (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-16 bg-white/4 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {/* Owner (card fixe) */}
      {teamData && (
        <div>
          <p className="text-white/30 text-xs uppercase tracking-wider mb-2">Propriétaire</p>
          <div className="bg-yellow-400/6 border border-yellow-400/15 rounded-2xl px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-400/15 rounded-xl flex items-center justify-center">
              <Crown size={16} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-yellow-300 font-medium text-sm">Vous (propriétaire)</p>
              <p className="text-yellow-300/40 text-xs">{teamData.owner.email}</p>
            </div>
            <div className="ml-auto">
              <span className="text-[10px] bg-yellow-400/15 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-400/20">
                Accès complet
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Membres */}
      {teamData && teamData.members.length > 0 && (
        <div>
          <p className="text-white/30 text-xs uppercase tracking-wider mb-2">
            Membres ({teamData.members.length})
          </p>
          <div className="space-y-2">
            {teamData.members.map(membre => (
              <MembreCard
                key={membre.id}
                membre={membre}
                isOwner={isOwner}
                token={token}
                onRefresh={loadTeam}
              />
            ))}
          </div>
        </div>
      )}

      {teamData && teamData.members.length === 0 && (
        <div className="text-center py-8 text-white/25 text-sm">
          {isOwner ? 'Aucun membre — invitez votre équipe ci-dessus' : 'Aucun autre membre'}
        </div>
      )}

      {/* Note plan Starter */}
      {teamData?.plan === 'starter' && isOwner && (
        <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/15 rounded-xl px-4 py-3">
          <p className="text-[#C19A6B]/80 text-xs leading-relaxed">
            💡 Le plan <strong>Starter</strong> est limité à 1 utilisateur (vous seul).
            Passez au plan <strong>Pro</strong> pour inviter jusqu'à 2 membres,
            ou <strong>Multi</strong> pour une équipe illimitée.
          </p>
        </div>
      )}

      {/* Modal invitation */}
      <AnimatePresence>
        {showInvite && (
          <InviteModal
            token={token}
            boulangerieId={boulangerie?.id ?? ''}
            onClose={() => setShowInvite(false)}
            onSuccess={() => {
              setInviteRefresh(v => v + 1);
              setTimeout(() => setShowInvite(false), 3000);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}