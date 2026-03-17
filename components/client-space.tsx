'use client';
// components/client-space.tsx
// Espace client : commandes et paramètres
// Accessible via la navbar quand l'utilisateur est connecté

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag, Settings, Clock, Package, X,
  ChevronRight, AlertCircle, Loader2, CheckCircle,
  Phone, Mail, ArrowLeft, RefreshCw, Ban,
} from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { supabase } from '@/lib/supabase';
import { useSlug } from '@/hooks/use-slug';

// ── Types ─────────────────────────────────────────────────────

interface LigneCommande {
  produit_id:    string;
  produit_nom:   string;
  quantite:      number;
  prix_unitaire: number;
}

interface Commande {
  id:               string;
  client_prenom:    string;
  client_email:     string;
  heure_retrait:    string;
  montant_total:    number;
  statut:           'en_attente' | 'confirmee' | 'prete' | 'recuperee' | 'annulee';
  lignes:           LigneCommande[];
  created_at:       string;
  notes:            string | null;
}

interface ProfilClient {
  id:                 string;
  prenom:             string;
  telephone:          string | null;
  optin_flash:        boolean;
  profil_completed:   boolean;
}

type TabType = 'commandes' | 'parametres';

// ── Helpers ───────────────────────────────────────────────────

function heureToPlage(heure: string): string {
  if (!heure) return '—';
  const h = parseInt(heure.split(':')[0], 10);
  const hFin = h + 4;
  return `${h}h–${hFin}h`;
}

const STATUT_LABELS: Record<Commande['statut'], string> = {
  en_attente: 'En attente',
  confirmee:  'Confirmée',
  prete:      'Prête à retirer',
  recuperee:  'Récupérée',
  annulee:    'Annulée',
};

const STATUT_COLORS: Record<Commande['statut'], string> = {
  en_attente: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  confirmee:  'bg-blue-100 text-blue-700 border-blue-200',
  prete:      'bg-green-100 text-green-700 border-green-200',
  recuperee:  'bg-gray-100 text-gray-500 border-gray-200',
  annulee:    'bg-red-100 text-red-600 border-red-200',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

// ── Composant commande détail ─────────────────────────────────

function CommandeDetail({
  commande,
  onClose,
  onCancel,
  cancelling,
}: {
  commande: Commande;
  onClose:  () => void;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const canCancel = commande.statut === 'en_attente';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full max-w-md bg-[#FDFBF7] rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#2C1810] px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
              Commande #{commande.id.slice(0, 8).toUpperCase()}
            </h3>
            <p className="text-white/50 text-xs mt-0.5">{formatDate(commande.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Statut */}
          <div className="flex items-center gap-3">
            <span className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${STATUT_COLORS[commande.statut]}`}>
              {STATUT_LABELS[commande.statut]}
            </span>
            <div className="flex items-center gap-1.5 text-[#2C1810]/50 text-xs">
              <Clock size={12} />
              Créneau : <strong className="text-[#2C1810]">{heureToPlage(commande.heure_retrait)}</strong>
            </div>
          </div>

          {/* Articles */}
          <div className="bg-[#F5F0E8] rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#E8E0D5]">
              <p className="text-[#2C1810]/50 text-xs font-semibold uppercase tracking-wider">Articles</p>
            </div>
            <div className="divide-y divide-[#E8E0D5]">
              {commande.lignes.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[#2C1810]/40 text-xs font-mono">{l.quantite}×</span>
                    <span className="text-[#2C1810]/80 text-sm">{l.produit_nom}</span>
                  </div>
                  <span className="text-[#2C1810]/60 text-xs font-mono">{formatPrice(l.prix_unitaire * l.quantite)}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-[#E8E0D5] flex justify-between items-center">
              <span className="text-[#2C1810]/60 text-sm">Total</span>
              <span className="text-[#C19A6B] font-bold text-base font-mono">{formatPrice(commande.montant_total)}</span>
            </div>
          </div>

          {/* Notes */}
          {commande.notes && (
            <div className="bg-[#F5F0E8] rounded-xl px-4 py-3">
              <p className="text-[#2C1810]/50 text-xs mb-1">Note</p>
              <p className="text-[#2C1810]/70 text-sm">{commande.notes}</p>
            </div>
          )}

          {/* Actions */}
          {canCancel && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onCancel(commande.id)}
              disabled={cancelling}
              className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 py-3 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              Annuler cette commande
            </motion.button>
          )}

          {!canCancel && commande.statut !== 'annulee' && (
            <p className="text-center text-[#2C1810]/40 text-xs">
              Cette commande ne peut plus être annulée
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Onglet Commandes ──────────────────────────────────────────

function OngletCommandes({ boulangerieSlug }: { boulangerieSlug: string }) {
  const { user } = useCart();
  const [commandes, setCommandes]         = useState<Commande[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [selected, setSelected]           = useState<Commande | null>(null);
  const [cancelling, setCancelling]       = useState(false);

  const loadCommandes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Non authentifié'); return; }

      // Récupère les commandes via l'API client
      const res = await fetch(`/api/client/commandes?email=${encodeURIComponent(user.email ?? '')}&slug=${boulangerieSlug}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Erreur chargement');
        return;
      }

      const { commandes: data } = await res.json() as { commandes: Commande[] };
      setCommandes(data ?? []);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [user, boulangerieSlug]);

  useEffect(() => { loadCommandes(); }, [loadCommandes]);

  const handleCancel = async (id: string) => {
    setCancelling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/client/commandes/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ statut: 'annulee' }),
      });

      if (res.ok) {
        setCommandes(prev => prev.map(c => c.id === id ? { ...c, statut: 'annulee' } : c));
        setSelected(prev => prev?.id === id ? { ...prev, statut: 'annulee' } : prev);
      }
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (commandes.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-[#C19A6B]/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Package size={28} className="text-[#C19A6B]/50" />
        </div>
        <p className="text-[#2C1810]/50 font-medium">Aucune commande</p>
        <p className="text-[#2C1810]/30 text-sm mt-1">Vos commandes apparaîtront ici</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[#2C1810]/50 text-sm">{commandes.length} commande{commandes.length > 1 ? 's' : ''}</p>
        <button
          onClick={loadCommandes}
          className="text-[#C19A6B] text-xs flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>

      <div className="space-y-3">
        {commandes.map(commande => (
          <motion.div
            key={commande.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelected(commande)}
            className={`bg-white border rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all ${
              commande.statut === 'annulee' || commande.statut === 'recuperee'
                ? 'opacity-60 border-[#E8E0D5]'
                : 'border-[#E8E0D5] hover:border-[#C19A6B]/40'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[#2C1810] font-semibold text-sm">
                  #{commande.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-[#2C1810]/40 text-xs mt-0.5">{formatDate(commande.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-[#C19A6B] font-bold text-sm font-mono">{formatPrice(commande.montant_total)}</p>
                <div className="flex items-center gap-1 justify-end mt-0.5">
                  <Clock size={10} className="text-[#2C1810]/30" />
                  <span className="text-[#2C1810]/40 text-[10px]">{heureToPlage(commande.heure_retrait)}</span>
                </div>
              </div>
            </div>

            <p className="text-[#2C1810]/50 text-xs mb-3 truncate">
              {commande.lignes.map(l => `${l.quantite}× ${l.produit_nom}`).join(' · ')}
            </p>

            <div className="flex items-center justify-between">
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUT_COLORS[commande.statut]}`}>
                {STATUT_LABELS[commande.statut]}
              </span>
              <ChevronRight size={14} className="text-[#2C1810]/25" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal détail */}
      <AnimatePresence>
        {selected && (
          <CommandeDetail
            commande={selected}
            onClose={() => setSelected(null)}
            onCancel={handleCancel}
            cancelling={cancelling}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Onglet Paramètres ─────────────────────────────────────────

function OngletParametres() {
  const { user } = useCart();
  const [profil, setProfil]               = useState<ProfilClient | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Champs du formulaire
  const [prenom, setPrenom]               = useState('');
  const [telephone, setTelephone]         = useState('');
  const [email, setEmail]                 = useState('');

  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch('/api/client/profil', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;

        const { profil: data } = await res.json() as { profil: ProfilClient | null };
        if (data) {
          setProfil(data);
          setPrenom(data.prenom ?? '');
          setTelephone(data.telephone ?? '');
        }
        setEmail(user.email ?? '');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Mise à jour du profil client (prénom, téléphone)
      const res = await fetch('/api/client/profil', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prenom:         prenom.trim(),
          telephone:      telephone.trim() || null,
          optin_flash:    profil?.optin_flash ?? false,
          optin_marketing: false,
          rgpd_accepted:  true,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Erreur de sauvegarde');
        return;
      }

      // Mise à jour email Supabase si changé
      if (email.trim() && email !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() });
        if (emailError) {
          setError('Erreur mise à jour email : ' + emailError.message);
          return;
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E8E0D5] rounded-2xl p-5 space-y-4">
        <h3 className="text-[#2C1810] font-semibold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
          Informations personnelles
        </h3>

        {/* Prénom */}
        <div>
          <label className="text-[#2C1810]/50 text-xs uppercase tracking-wider block mb-1.5">
            Prénom
          </label>
          <input
            type="text"
            value={prenom}
            onChange={e => setPrenom(e.target.value)}
            placeholder="Votre prénom"
            className="w-full border border-[#E8E0D5] rounded-xl px-4 py-2.5 text-[#2C1810] text-sm outline-none focus:border-[#C19A6B]/60 transition-colors"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-[#2C1810]/50 text-xs uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
            <Mail size={11} />
            Adresse email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="votre@email.com"
            className="w-full border border-[#E8E0D5] rounded-xl px-4 py-2.5 text-[#2C1810] text-sm outline-none focus:border-[#C19A6B]/60 transition-colors"
          />
          {email !== user?.email && (
            <p className="text-[#C19A6B] text-xs mt-1">
              Un email de confirmation vous sera envoyé pour valider ce changement.
            </p>
          )}
        </div>

        {/* Téléphone */}
        <div>
          <label className="text-[#2C1810]/50 text-xs uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
            <Phone size={11} />
            Téléphone <span className="text-[#2C1810]/30 normal-case">(optionnel)</span>
          </label>
          <input
            type="tel"
            value={telephone}
            onChange={e => setTelephone(e.target.value)}
            placeholder="+33 6 12 34 56 78"
            className="w-full border border-[#E8E0D5] rounded-xl px-4 py-2.5 text-[#2C1810] text-sm outline-none focus:border-[#C19A6B]/60 transition-colors"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-600 text-xs">{error}</p>
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
            saved
              ? 'bg-green-100 border border-green-200 text-green-700'
              : 'bg-[#2C1810] text-white hover:bg-[#C19A6B]'
          }`}
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> Sauvegarde…</>
            : saved
              ? <><CheckCircle size={14} /> Sauvegardé !</>
              : 'Enregistrer les modifications'
          }
        </motion.button>
      </div>

      {/* Info compte */}
      <div className="bg-[#F5F0E8] border border-[#E8E0D5] rounded-2xl p-4">
        <p className="text-[#2C1810]/40 text-xs">
          Compte créé avec l'adresse <strong className="text-[#2C1810]/60">{user?.email}</strong>.
          Pour supprimer votre compte, contactez-nous directement.
        </p>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────

interface ClientSpaceProps {
  onClose: () => void;
}

export default function ClientSpace({ onClose }: ClientSpaceProps) {
  const { user, boulangerieSlug } = useCart();
  const resolution = useSlug();
  const slug = resolution?.slug ?? boulangerieSlug;

  const [activeTab, setActiveTab] = useState<TabType>('commandes');

  if (!user) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[57] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="w-full max-w-lg bg-[#FDFBF7] rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-[#2C1810] px-5 py-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Mon Espace
                </h2>
                <p className="text-white/40 text-xs mt-0.5">{user.email}</p>
              </div>
              <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Onglets */}
            <div className="flex gap-2">
              {([
                { id: 'commandes',  label: 'Mes commandes', icon: ShoppingBag },
                { id: 'parametres', label: 'Paramètres',    icon: Settings    },
              ] as const).map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-[#C19A6B] text-[#2C1810]'
                        : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'commandes' && (
                  <OngletCommandes boulangerieSlug={slug} />
                )}
                {activeTab === 'parametres' && (
                  <OngletParametres />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}