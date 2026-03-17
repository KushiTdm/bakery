'use client';
// app/boulanger/commandes/page.tsx
// Page commandes — refonte complète
// - Séparation Click & Collect / Paniers anti-gaspi
// - Filtres par heure de retrait
// - Modal client avec coordonnées au clic
// - Statut temps réel via Supabase Realtime

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BoulangerProvider, useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import type { DbCommande, DbLigneCommande } from '@/lib/supabase';
import {
  Zap, ShoppingBag, Phone, Mail, Clock, Check,
  X, RefreshCw, Loader2, AlertCircle, ChevronRight,
  User, Package,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface OrderItem { name: string; qty: number; price: number; }

interface Order {
  id:          string;
  shortId:     string;
  prenom:      string;
  email:       string;
  telephone:   string | null;
  items:       OrderItem[];
  total:       number;
  heureRetrait: string;
  status:      'pending' | 'confirmed' | 'ready' | 'done' | 'cancelled';
  type:        'clickcollect' | 'flash';
  createdAt:   string;
}

type FilterType = 'all' | 'clickcollect' | 'flash' | 'pending' | string;

const STATUS_DB_MAP: Record<Order['status'], DbCommande['statut']> = {
  pending:   'en_attente',
  confirmed: 'confirmee',
  ready:     'prete',
  done:      'recuperee',
  cancelled: 'annulee',
};

const DB_STATUS_MAP: Record<DbCommande['statut'], Order['status']> = {
  en_attente: 'pending',
  confirmee:  'confirmed',
  prete:      'ready',
  recuperee:  'done',
  annulee:    'cancelled',
};

const STATUS_LABEL: Record<Order['status'], string> = {
  pending:   'En attente',
  confirmed: 'Confirmée',
  ready:     'Prête',
  done:      'Récupérée',
  cancelled: 'Annulée',
};

const NEXT_STATUS: Partial<Record<Order['status'], Order['status']>> = {
  pending:   'confirmed',
  confirmed: 'ready',
  ready:     'done',
};

const NEXT_LABEL: Partial<Record<Order['status'], string>> = {
  pending:   'Confirmer',
  confirmed: 'Marquer prête',
  ready:     'Récupérée ✓',
};

// ── Helpers ───────────────────────────────────────────────────

function mapDbToOrder(c: DbCommande): Order {
  const items = (c.lignes ?? []).map((l: DbLigneCommande) => ({
    name: l.produit_nom, qty: l.quantite, price: l.prix_unitaire,
  }));
  const isFlash = items.some(i =>
    i.name.toLowerCase().includes('flash') ||
    i.name.toLowerCase().includes('anti-gaspi') ||
    i.name.toLowerCase().includes('panier')
  );
  return {
    id:          c.id,
    shortId:     c.id.slice(0, 6).toUpperCase(),
    prenom:      c.client_prenom ?? 'Client',
    email:       c.client_email,
    telephone:   c.client_telephone ?? null,
    items,
    total:       c.montant_total,
    heureRetrait: c.heure_retrait ? String(c.heure_retrait).slice(0, 5) : 'À définir',
    status:      DB_STATUS_MAP[c.statut] ?? 'pending',
    type:        isFlash ? 'flash' : 'clickcollect',
    createdAt:   c.created_at,
  };
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Composant : badge statut ──────────────────────────────────

function StatusBadge({ status }: { status: Order['status'] }) {
  const styles: Record<Order['status'], string> = {
    pending:   'bg-yellow-400/12 text-yellow-300 border-yellow-400/25',
    confirmed: 'bg-blue-400/12 text-blue-300 border-blue-400/25',
    ready:     'bg-green-400/12 text-green-300 border-green-400/25',
    done:      'bg-white/5 text-white/30 border-white/10',
    cancelled: 'bg-red-400/12 text-red-300 border-red-400/25',
  };
  return (
    <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${styles[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Composant : modal détail commande ─────────────────────────

function OrderModal({
  order,
  onClose,
  onAdvance,
  onCancel,
  advancing,
}: {
  order: Order;
  onClose: () => void;
  onAdvance: (id: string) => void;
  onCancel: (id: string) => void;
  advancing: boolean;
}) {
  const next = NEXT_STATUS[order.status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg bg-[#1A0F0A] border border-white/12 rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/15 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              order.type === 'flash'
                ? 'bg-yellow-400/20 text-yellow-300'
                : 'bg-[#C19A6B]/20 text-[#C19A6B]'
            }`}>
              {initials(order.prenom)}
            </div>
            <div>
              <p className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                {order.prenom}
              </p>
              <p className="text-white/30 text-xs">
                #{order.shortId} · {formatTime(order.createdAt)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Coordonnées */}
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Mail size={13} className="text-white/30 flex-shrink-0" />
              <a href={`mailto:${order.email}`} className="text-[#C19A6B]/80 text-sm hover:text-[#C19A6B] transition-colors">
                {order.email}
              </a>
            </div>
            {order.telephone ? (
              <div className="flex items-center gap-2.5">
                <Phone size={13} className="text-white/30 flex-shrink-0" />
                <a href={`tel:${order.telephone}`} className="text-[#C19A6B]/80 text-sm hover:text-[#C19A6B] transition-colors">
                  {order.telephone}
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Phone size={13} className="text-white/20 flex-shrink-0" />
                <span className="text-white/25 text-sm italic">Pas de téléphone</span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <Clock size={13} className="text-white/30 flex-shrink-0" />
              <span className="text-white/60 text-sm">
                {order.type === 'flash' ? 'Flash soir' : `Retrait à ${order.heureRetrait}`}
              </span>
              {order.type === 'flash' && (
                <span className="bg-yellow-400/15 text-yellow-400 text-[10px] px-2 py-0.5 rounded-full">Flash</span>
              )}
            </div>
          </div>

          {/* Articles */}
          <div className="bg-white/3 border border-white/6 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5">
              <p className="text-white/40 text-xs uppercase tracking-wider font-semibold">Articles</p>
            </div>
            <div className="divide-y divide-white/4">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 text-xs font-mono">{item.qty}×</span>
                    <span className="text-white/70 text-sm">{item.name}</span>
                  </div>
                  <span className="text-white/40 text-xs font-mono">{formatPrice(item.price * item.qty)}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-white/8 flex justify-between items-center">
              <span className="text-white/50 text-sm">Total</span>
              <span className="text-[#C19A6B] font-bold text-base font-mono">{formatPrice(order.total)}</span>
            </div>
          </div>

          {/* Statut + actions */}
          <div className="flex items-center gap-3">
            <StatusBadge status={order.status} />
            <span className="text-white/20 text-xs">→</span>
            {next && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => onAdvance(order.id)}
                disabled={advancing}
                className="flex items-center gap-1.5 bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] text-xs px-3 py-2 rounded-xl font-medium disabled:opacity-50 hover:bg-[#C19A6B]/25 transition-colors"
              >
                {advancing
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Check size={12} />
                }
                {NEXT_LABEL[order.status]}
              </motion.button>
            )}
            {order.status !== 'done' && order.status !== 'cancelled' && (
              <button
                onClick={() => onCancel(order.id)}
                className="text-red-400/60 text-xs hover:text-red-400 transition-colors ml-auto"
              >
                Annuler
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Composant : carte commande ─────────────────────────────────

function OrderCard({
  order,
  onOpen,
  onQuickAdvance,
  advancing,
}: {
  order: Order;
  onOpen: (o: Order) => void;
  onQuickAdvance: (e: React.MouseEvent, id: string) => void;
  advancing: boolean;
}) {
  const next = NEXT_STATUS[order.status];
  const isDone = order.status === 'done' || order.status === 'cancelled';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDone ? 0.45 : 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden cursor-pointer transition-all active:scale-[0.99] ${
        order.type === 'flash'
          ? 'bg-yellow-400/4 border-yellow-400/18'
          : 'bg-white/4 border-white/8'
      }`}
      onClick={() => onOpen(order)}
    >
      {order.type === 'flash' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-400/8 border-b border-yellow-400/12">
          <Zap size={11} className="text-yellow-400 fill-current" />
          <span className="text-yellow-400 text-[10px] font-semibold">Panier Anti-Gaspi</span>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="flex items-start justify-between mb-2">
          {/* Infos client */}
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              order.type === 'flash'
                ? 'bg-yellow-400/15 text-yellow-300'
                : 'bg-[#C19A6B]/15 text-[#C19A6B]'
            }`}>
              {initials(order.prenom)}
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-tight">{order.prenom}</p>
              <p className="text-white/30 text-[10px]">#{order.shortId} · {formatTime(order.createdAt)}</p>
            </div>
          </div>

          {/* Montant + heure */}
          <div className="text-right">
            <p className={`font-bold font-mono text-sm ${order.type === 'flash' ? 'text-yellow-300' : 'text-[#C19A6B]'}`}>
              {formatPrice(order.total)}
            </p>
            {order.type === 'clickcollect' && (
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <Clock size={10} className="text-white/25" />
                <span className="text-white/30 text-[10px]">{order.heureRetrait}</span>
              </div>
            )}
          </div>
        </div>

        {/* Articles résumé */}
        <p className="text-white/40 text-xs mb-3 truncate">
          {order.items.map(i => `${i.qty}× ${i.name}`).join(' · ')}
        </p>

        {/* Statut + action rapide */}
        <div className="flex items-center justify-between">
          <StatusBadge status={order.status} />
          {next && !isDone && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={e => onQuickAdvance(e, order.id)}
              disabled={advancing}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors touch-manipulation ${
                order.status === 'pending'
                  ? 'bg-blue-400/12 border-blue-400/25 text-blue-300 hover:bg-blue-400/20'
                  : order.status === 'confirmed'
                    ? 'bg-green-400/12 border-green-400/25 text-green-300 hover:bg-green-400/20'
                    : 'bg-white/8 border-white/12 text-white/50 hover:bg-white/12'
              }`}
            >
              {advancing
                ? <Loader2 size={11} className="animate-spin" />
                : <Check size={11} />
              }
              {NEXT_LABEL[order.status]}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Page principale ───────────────────────────────────────────

function CommandesPage() {
  const { isAuthenticated, authLoading } = useBoulanger();

  const [orders,        setOrders]        = useState<Order[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [lastRefresh,   setLastRefresh]   = useState<Date | null>(null);
  const [updating,      setUpdating]      = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filter,        setFilter]        = useState<FilterType>('all');
  const [boulangerieId, setBoulangerieId] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // ── Chargement ──────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Non authentifié'); return; }

      const profileRes = await fetch('/api/boulanger/profil', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!profileRes.ok) { setError('Impossible de charger le profil'); return; }

      const profile = await profileRes.json() as { id?: string };
      if (!profile.id || !UUID_REGEX.test(profile.id)) {
        setError('ID boulangerie invalide'); return;
      }
      setBoulangerieId(profile.id);

      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(
        `/api/orders?boulangerie_id=${profile.id}&date=${today}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }
      );

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'Erreur inconnue' })) as { error?: string };
        setError(j.error ?? 'Erreur lors du chargement'); return;
      }

      const { commandes } = await res.json() as { commandes: DbCommande[] };
      setOrders((commandes ?? []).map(mapDbToOrder));
      setLastRefresh(new Date());
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadOrders();
  }, [isAuthenticated, loadOrders]);

  // Realtime Supabase
  useEffect(() => {
    if (!boulangerieId) return;
    const channel = supabase
      .channel(`commandes-page-${boulangerieId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'commandes', filter: `boulangerie_id=eq.${boulangerieId}` },
        payload => {
          setOrders(prev => [mapDbToOrder(payload.new as DbCommande), ...prev]);
          setLastRefresh(new Date());
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'commandes', filter: `boulangerie_id=eq.${boulangerieId}` },
        payload => {
          const updated = mapDbToOrder(payload.new as DbCommande);
          setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
          setSelectedOrder(prev => prev?.id === updated.id ? updated : prev);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [boulangerieId]);

  // ── Actions ──────────────────────────────────────────────────

  const updateStatus = useCallback(async (orderId: string, newStatus: Order['status']) => {
    if (!UUID_REGEX.test(orderId) || submittingRef.current) return;
    submittingRef.current = true;
    setUpdating(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status: STATUS_DB_MAP[newStatus] }),
      });
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        setSelectedOrder(prev => prev?.id === orderId ? { ...prev, status: newStatus } : prev);
      }
    } finally {
      submittingRef.current = false;
      setUpdating(null);
    }
  }, []);

  const handleAdvance = useCallback((id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const next = NEXT_STATUS[order.status];
    if (next) updateStatus(id, next);
  }, [orders, updateStatus]);

  const handleQuickAdvance = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    handleAdvance(id);
  }, [handleAdvance]);

  const handleCancel = useCallback((id: string) => {
    updateStatus(id, 'cancelled');
    setSelectedOrder(null);
  }, [updateStatus]);

  // ── Données dérivées ─────────────────────────────────────────

  const clickCollect = orders.filter(o => o.type === 'clickcollect');
  const flashOrders  = orders.filter(o => o.type === 'flash');
  const pending      = orders.filter(o => o.status === 'pending');

  const totalCA      = orders.reduce((s, o) => s + o.total, 0);
  const flashCA      = flashOrders.reduce((s, o) => s + o.total, 0);

  // Groupement par heure de retrait pour Click & Collect
  const ccByHeure: Record<string, Order[]> = {};
  clickCollect.forEach(o => {
    const k = o.heureRetrait;
    if (!ccByHeure[k]) ccByHeure[k] = [];
    ccByHeure[k].push(o);
  });

  // Filtrage
  const filteredOrders = (() => {
    if (filter === 'all')          return orders;
    if (filter === 'clickcollect') return clickCollect;
    if (filter === 'flash')        return flashOrders;
    if (filter === 'pending')      return pending;
    // filtre par heure de retrait
    return clickCollect.filter(o => o.heureRetrait === filter);
  })();

  // Filtres disponibles (heures de retrait uniques)
  const heures = [...new Set(clickCollect.map(o => o.heureRetrait))].sort();

  // ── UI guards ─────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
        <Loader2 size={22} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
        <p className="text-white/40 text-sm">Veuillez vous connecter.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A0F0A] pb-24">

      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-[#1A0F0A]/96 backdrop-blur border-b border-white/8 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1
              className="text-white font-bold text-lg"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Commandes
            </h1>
            <p className="text-white/30 text-xs flex items-center gap-1.5 mt-0.5">
              {lastRefresh
                ? <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    Temps réel · {formatTime(lastRefresh.toISOString())}
                  </>
                : 'Chargement…'
              }
            </p>
          </div>
          <button
            onClick={loadOrders}
            disabled={loading}
            className="text-[#C19A6B] text-xs px-3 py-1.5 rounded-lg border border-[#C19A6B]/30 hover:bg-[#C19A6B]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4 text-center">
            <p className="text-white font-bold text-2xl font-mono">{orders.length}</p>
            <p className="text-white/35 text-[10px] uppercase tracking-wider mt-1">Total</p>
          </div>
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4 text-center">
            <p className="text-[#C19A6B] font-bold text-xl font-mono">{totalCA.toFixed(0)}€</p>
            <p className="text-white/35 text-[10px] uppercase tracking-wider mt-1">CA jour</p>
          </div>
          <div className={`border rounded-2xl p-4 text-center ${
            pending.length > 0
              ? 'bg-yellow-400/8 border-yellow-400/20'
              : 'bg-white/4 border-white/8'
          }`}>
            <p className={`font-bold text-2xl font-mono ${pending.length > 0 ? 'text-yellow-300' : 'text-white'}`}>
              {pending.length}
            </p>
            <p className="text-white/35 text-[10px] uppercase tracking-wider mt-1">Attente</p>
          </div>
        </div>

        {/* Bloc flash si pertinent */}
        {flashOrders.length > 0 && (
          <div className="bg-yellow-400/5 border border-yellow-400/15 rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-yellow-400 rounded-lg p-1">
                <Zap size={12} className="text-[#2C1810] fill-current" />
              </div>
              <p className="text-yellow-300 font-semibold text-sm">Paniers Anti-Gaspi</p>
              <span className="ml-auto text-yellow-400/70 text-xs font-mono">{formatPrice(flashCA)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-black/20 rounded-xl p-2.5 text-center">
                <p className="text-yellow-300 font-bold font-mono">{flashOrders.length}</p>
                <p className="text-white/30 text-[10px]">commandes</p>
              </div>
              <div className="bg-black/20 rounded-xl p-2.5 text-center">
                <p className="text-yellow-300 font-bold font-mono">
                  {flashOrders.filter(o => o.status === 'pending').length}
                </p>
                <p className="text-white/30 text-[10px]">en attente</p>
              </div>
              <div className="bg-black/20 rounded-xl p-2.5 text-center">
                <p className="text-green-400 font-bold font-mono">
                  {flashOrders.filter(o => o.status === 'done').length}
                </p>
                <p className="text-white/30 text-[10px]">récupérées</p>
              </div>
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {([
            { key: 'all',          label: `Toutes (${orders.length})` },
            { key: 'clickcollect', label: `Click & Collect (${clickCollect.length})`, icon: ShoppingBag },
            { key: 'flash',        label: `Anti-Gaspi (${flashOrders.length})`,       icon: Zap, highlight: true },
            { key: 'pending',      label: `En attente (${pending.length})` },
            ...heures.map(h => ({ key: h, label: `${h} (${ccByHeure[h]?.length ?? 0})`, icon: Clock })),
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                filter === f.key
                  ? (('highlight' in f && f.highlight)
                      ? 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30'
                      : 'bg-[#C19A6B]/15 text-[#C19A6B] border-[#C19A6B]/30')
                  : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/8'
              }`}
            >
              {f.key === 'flash' && <Zap size={11} />}
              {f.key === 'clickcollect' && <ShoppingBag size={11} />}
              {f.key !== 'flash' && f.key !== 'clickcollect' && heures.includes(f.key) && <Clock size={11} />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Squelettes */}
        {loading && !orders.length && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-white/4 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {/* État vide */}
        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-16">
            <span className="text-5xl block mb-4">🛒</span>
            <p className="text-white/50 font-medium">Aucune commande pour aujourd'hui</p>
            <p className="text-white/25 text-sm mt-1">Elles apparaîtront ici en temps réel</p>
          </div>
        )}

        {/* Liste triée par sections */}
        {!loading && !error && filteredOrders.length > 0 && (() => {
          // Sections : Flash d'abord, puis Click & Collect par heure
          const sections: { label: string; orders: Order[] }[] = [];

          const flashVisible = filteredOrders.filter(o => o.type === 'flash');
          if (flashVisible.length) {
            sections.push({ label: 'Paniers Anti-Gaspi', orders: flashVisible });
          }

          const ccVisible = filteredOrders.filter(o => o.type === 'clickcollect');
          const ccHeures = [...new Set(ccVisible.map(o => o.heureRetrait))].sort();
          ccHeures.forEach(h => {
            const grp = ccVisible.filter(o => o.heureRetrait === h);
            if (grp.length) sections.push({ label: `Click & Collect — Retrait ${h}`, orders: grp });
          });

          return (
            <div className="space-y-6">
              {sections.map(section => (
                <div key={section.label}>
                  <div className="flex items-center gap-2 mb-3">
                    {section.label.includes('Anti-Gaspi')
                      ? <Zap size={13} className="text-yellow-400" />
                      : <ShoppingBag size={13} className="text-[#C19A6B]" />
                    }
                    <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                      {section.label}
                    </p>
                    <span className="bg-white/8 border border-white/10 text-white/30 text-[10px] px-2 py-0.5 rounded-full">
                      {section.orders.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {section.orders.map(order => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          onOpen={setSelectedOrder}
                          onQuickAdvance={handleQuickAdvance}
                          advancing={updating === order.id}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Résultat vide après filtre */}
        {!loading && !error && orders.length > 0 && filteredOrders.length === 0 && (
          <div className="text-center py-10">
            <Package size={32} className="text-white/15 mx-auto mb-3" />
            <p className="text-white/35 text-sm">Aucune commande dans ce filtre</p>
          </div>
        )}
      </div>

      {/* Modal détail */}
      <AnimatePresence>
        {selectedOrder && (
          <OrderModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onAdvance={id => { handleAdvance(id); setSelectedOrder(null); }}
            onCancel={handleCancel}
            advancing={updating === selectedOrder.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Export enveloppé dans BoulangerProvider ───────────────────
// La page /boulanger/commandes est une route séparée de /boulanger.
// Elle a besoin de son propre BoulangerProvider pour que
// useBoulanger() fonctionne (isAuthenticated, authLoading).
export default function CommandesPageWrapper() {
  return (
    <BoulangerProvider>
      <CommandesPage />
    </BoulangerProvider>
  );
}