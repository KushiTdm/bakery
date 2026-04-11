'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { BoulangerProvider, useBoulanger } from '@/context/boulanger-context';
import GestionClients from '@/components/boulanger/gestion-clients';
import { supabase } from '@/lib/supabase';
import type { DbCommande, DbLigneCommande } from '@/lib/supabase';
import {
  Zap, ShoppingBag, Phone, Mail, Clock, Check,
  X, RefreshCw, Loader2, AlertCircle, ChevronRight,
  ArrowLeft, BellOff, Send, Package, Users, CalendarCheck,
} from 'lucide-react';

interface OrderItem { name: string; qty: number; price: number; }

interface Order {
  id:           string;
  shortId:      string;
  prenom:       string;
  email:        string;
  telephone:    string | null;
  items:        OrderItem[];
  total:        number;
  heureRetrait: string;
  status:       'pending' | 'confirmed' | 'ready' | 'done' | 'cancelled' | 'not_collected';
  type:         'clickcollect' | 'flash';
  createdAt:    string;
  dateRetrait:  string | null;
  isPreOrder:   boolean;
}

type FilterType = 'all' | 'clickcollect' | 'flash' | 'pending' | string;

const STATUS_DB_MAP: Record<Order['status'], DbCommande['statut']> = {
  pending:       'en_attente',
  confirmed:     'confirmee',
  ready:         'prete',
  done:          'recuperee',
  cancelled:     'annulee',
  not_collected: 'non_recuperee',
};

const DB_STATUS_MAP: Record<DbCommande['statut'], Order['status']> = {
  en_attente:      'pending',
  confirmee:       'confirmed',
  prete:           'ready',
  recuperee:       'done',
  annulee:         'cancelled',
  non_recuperee:   'not_collected',
};

const STATUS_LABEL: Record<Order['status'], string> = {
  pending:       'En attente',
  confirmed:     'Confirmée',
  ready:         'Prête',
  done:          'Récupérée',
  cancelled:     'Annulée',
  not_collected: 'Non récupérée',
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

// Heure DB → plage horaire (ex: "08:00" → "8h–12h")
function heureToPlage(heure: string): string {
  if (!heure) return 'À définir';
  const h = parseInt(String(heure).slice(0, 5).split(':')[0], 10);
  return isNaN(h) ? String(heure).slice(0, 5) : `${h}h–${h + 4}h`;
}

type EnrichedCommande = DbCommande & { client_telephone?: string | null };

function mapDbToOrder(c: EnrichedCommande): Order {
  const items = (c.lignes ?? []).map((l: DbLigneCommande) => ({
    name: l.produit_nom, qty: l.quantite, price: l.prix_unitaire,
  }));
  const isFlash = items.some(i =>
    i.name.toLowerCase().includes('flash') ||
    i.name.toLowerCase().includes('anti-gaspi') ||
    i.name.toLowerCase().includes('panier')
  );
  const dateRetrait = (c as unknown as Record<string, unknown>).date_retrait as string | null ?? null;
  return {
    id:           c.id,
    shortId:      c.id.slice(0, 6).toUpperCase(),
    prenom:       c.client_prenom ?? 'Client',
    email:        c.client_email,
    telephone:    c.client_telephone ?? null,
    items,
    total:        c.montant_total,
    heureRetrait: c.heure_retrait ? String(c.heure_retrait).slice(0, 5) : '',
    status:       DB_STATUS_MAP[c.statut] ?? 'pending',
    type:         isFlash ? 'flash' : 'clickcollect',
    createdAt:    c.created_at,
    dateRetrait,
    isPreOrder:   !!dateRetrait,
  };
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string, tz = 'Europe/Paris'): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function StatusBadge({ status }: { status: Order['status'] }) {
  const styles: Record<Order['status'], string> = {
    pending:       'bg-yellow-400/12 text-yellow-300 border-yellow-400/25',
    confirmed:     'bg-blue-400/12 text-blue-300 border-blue-400/25',
    ready:         'bg-green-400/12 text-green-300 border-green-400/25',
    done:          'bg-white/5 text-white/30 border-white/10',
    cancelled:     'bg-red-400/12 text-red-300 border-red-400/25',
    not_collected: 'bg-orange-400/12 text-orange-300 border-orange-400/25',
  };
  return (
    <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${styles[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function OrderModal({
  order, onClose, onAdvance, onCancel, onNotCollected, advancing, boulangerieTz,
}: {
  order: Order; onClose: () => void; onAdvance: (id: string) => void;
  onCancel: (id: string) => void; onNotCollected: (id: string) => void; advancing: boolean; boulangerieTz: string;
}) {
  const next = NEXT_STATUS[order.status];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg bg-[#1A0F0A] border border-white/12 rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/15 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              order.type === 'flash' ? 'bg-yellow-400/20 text-yellow-300' : 'bg-[#C19A6B]/20 text-[#C19A6B]'
            }`}>
              {initials(order.prenom)}
            </div>
            <div>
              <p className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                {order.prenom}
              </p>
              <p className="text-white/30 text-xs">#{order.shortId} · {formatTime(order.createdAt, boulangerieTz)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
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
                {order.type === 'flash' ? 'Flash soir' : `Retrait ${heureToPlage(order.heureRetrait)}`}
              </span>
              {order.type === 'flash' && (
                <span className="bg-yellow-400/15 text-yellow-400 text-[10px] px-2 py-0.5 rounded-full">Flash</span>
              )}
            </div>
          </div>

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

          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status={order.status} />
          </div>

          <div className="space-y-2">
            {next && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => onAdvance(order.id)} disabled={advancing}
                className="w-full flex items-center justify-center gap-2 bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] text-sm px-4 py-3 rounded-xl font-medium disabled:opacity-50 hover:bg-[#C19A6B]/25 transition-colors">
                {advancing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {NEXT_LABEL[order.status]}
              </motion.button>
            )}
            {order.status !== 'done' && order.status !== 'cancelled' && order.status !== 'not_collected' && (
              <a href={`mailto:${order.email}?subject=Votre%20commande%20%23${order.shortId}&body=Bonjour%20${encodeURIComponent(order.prenom)}%2C%0A%0AVotre%20commande%20est%20pr%C3%AAte.%0A%0AL%27Artisan%20Dor%C3%A9`}
                className="w-full flex items-center justify-center gap-2 bg-blue-400/10 border border-blue-400/20 text-blue-300 text-sm px-4 py-3 rounded-xl font-medium hover:bg-blue-400/18 transition-colors">
                <Send size={14} />Relancer le client par email
              </a>
            )}
            {(order.status === 'ready' || order.status === 'confirmed') && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNotCollected(order.id)} disabled={advancing}
                className="w-full flex items-center justify-center gap-2 bg-orange-400/10 border border-orange-400/20 text-orange-300 text-sm px-4 py-3 rounded-xl font-medium hover:bg-orange-400/18 transition-colors">
                <BellOff size={14} />Commande non récupérée
              </motion.button>
            )}
            {order.status !== 'done' && order.status !== 'cancelled' && order.status !== 'not_collected' && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => onCancel(order.id)}
                className="w-full flex items-center justify-center gap-2 bg-red-500/8 border border-red-500/15 text-red-400/70 text-sm px-4 py-3 rounded-xl hover:bg-red-500/15 hover:text-red-400 transition-colors">
                <X size={14} />Annuler la commande
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function OrderCard({ order, onOpen, onQuickAdvance, advancing }: {
  order: Order; onOpen: (o: Order) => void;
  onQuickAdvance: (e: React.MouseEvent, id: string) => void; advancing: boolean;
}) {
  const next = NEXT_STATUS[order.status];
  const isDone = order.status === 'done' || order.status === 'cancelled';

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: isDone ? 0.45 : 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden cursor-pointer transition-all active:scale-[0.99] ${
        order.type === 'flash' ? 'bg-yellow-400/4 border-yellow-400/18' : 'bg-white/4 border-white/8'
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
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              order.type === 'flash' ? 'bg-yellow-400/15 text-yellow-300' : 'bg-[#C19A6B]/15 text-[#C19A6B]'
            }`}>
              {initials(order.prenom)}
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-tight">{order.prenom}</p>
              <p className="text-white/30 text-[10px]">#{order.shortId} · {formatTime(order.createdAt)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-bold font-mono text-sm ${order.type === 'flash' ? 'text-yellow-300' : 'text-[#C19A6B]'}`}>
              {formatPrice(order.total)}
            </p>
            {order.type === 'clickcollect' && order.heureRetrait && (
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <Clock size={10} className="text-white/25" />
                <span className="text-white/30 text-[10px]">{heureToPlage(order.heureRetrait)}</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-white/40 text-xs mb-3 truncate">
          {order.items.map(i => `${i.qty}× ${i.name}`).join(' · ')}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={order.status} />
            {order.isPreOrder && (
              <span className="text-[10px] px-2 py-1 rounded-full border font-medium bg-amber-400/12 text-amber-300 border-amber-400/25 flex items-center gap-1">
                <CalendarCheck size={9} />
                Pré-commande
              </span>
            )}
          </div>
          {next && !isDone && (
            <motion.button whileTap={{ scale: 0.92 }} onClick={e => onQuickAdvance(e, order.id)} disabled={advancing}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors touch-manipulation ${
                order.status === 'pending' ? 'bg-blue-400/12 border-blue-400/25 text-blue-300 hover:bg-blue-400/20'
                  : order.status === 'confirmed' ? 'bg-green-400/12 border-green-400/25 text-green-300 hover:bg-green-400/20'
                  : 'bg-white/8 border-white/12 text-white/50 hover:bg-white/12'
              }`}
            >
              {advancing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {NEXT_LABEL[order.status]}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CommandesPage() {
  const { isAuthenticated, authLoading } = useBoulanger();
  const router = useRouter();

  const [orders,        setOrders]        = useState<Order[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [lastRefresh,   setLastRefresh]   = useState<Date | null>(null);
  const [updating,      setUpdating]      = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filter,        setFilter]        = useState<FilterType>('all');
  const [boulangerieId, setBoulangerieId] = useState<string | null>(null);
  const [showClients,   setShowClients]   = useState(false);
  const [boulangerieTz, setBoulangerieTz] = useState('Europe/Paris');
  const submittingRef = useRef(false);

  const loadOrders = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Non authentifié'); return; }

      const profileRes = await fetch('/api/boulanger/profil', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!profileRes.ok) { setError('Impossible de charger le profil'); return; }

      const profile = await profileRes.json() as { id?: string; timezone?: string };
      if (!profile.id || !UUID_REGEX.test(profile.id)) { setError('ID boulangerie invalide'); return; }
      setBoulangerieId(profile.id);

      // Utiliser le timezone de la boulangerie (pas le timezone du navigateur)
      const tz = profile.timezone ?? 'Europe/Paris';
      setBoulangerieTz(tz);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

      // Utilise la route enrichie qui joint profils_clients
      const res = await fetch(
        `/api/boulanger/commandes?date=${today}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }
      );

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'Erreur inconnue' })) as { error?: string };
        setError(j.error ?? 'Erreur lors du chargement'); return;
      }

      const { commandes } = await res.json() as { commandes: EnrichedCommande[] };
      setOrders((commandes ?? []).map(mapDbToOrder));
      setLastRefresh(new Date());
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadOrders();
  }, [isAuthenticated, loadOrders]);

  // Synchronise l'auth Realtime puis s'abonne aux changements
  useEffect(() => {
    if (!boulangerieId) return;

    // setAuth() est requis pour que Realtime fonctionne avec RLS
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    const channel = supabase
      .channel(`commandes-page-${boulangerieId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'commandes', filter: `boulangerie_id=eq.${boulangerieId}` },
        () => { loadOrders(); }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'commandes', filter: `boulangerie_id=eq.${boulangerieId}` },
        payload => {
          const updated = mapDbToOrder(payload.new as EnrichedCommande);
          setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, status: updated.status } : o));
          setSelectedOrder(prev => prev?.id === updated.id ? { ...prev, status: updated.status } : prev);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') console.log('[Realtime] Connecté aux commandes');
        if (status === 'CHANNEL_ERROR') console.error('[Realtime] Erreur channel:', err);
        if (status === 'TIMED_OUT') console.warn('[Realtime] Timeout subscription');
      });
    return () => { supabase.removeChannel(channel); };
  }, [boulangerieId, loadOrders]);

  // Fallback polling (30s) + rechargement au retour sur l'onglet
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => loadOrders(), 30_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadOrders();
        // Re-synchroniser l'auth Realtime après retour en premier plan
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token) {
            supabase.realtime.setAuth(session.access_token);
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, loadOrders]);

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
    } finally { submittingRef.current = false; setUpdating(null); }
  }, []);

  const handleAdvance      = useCallback((id: string) => { const o = orders.find(x => x.id === id); if (!o) return; const n = NEXT_STATUS[o.status]; if (n) updateStatus(id, n); }, [orders, updateStatus]);
  const handleQuickAdvance = useCallback((e: React.MouseEvent, id: string) => { e.stopPropagation(); handleAdvance(id); }, [handleAdvance]);
  const handleCancel       = useCallback((id: string) => { updateStatus(id, 'cancelled'); setSelectedOrder(null); }, [updateStatus]);
  const handleNotCollected = useCallback((id: string) => { updateStatus(id, 'not_collected'); setSelectedOrder(null); }, [updateStatus]);

  const clickCollect = orders.filter(o => o.type === 'clickcollect');
  const flashOrders  = orders.filter(o => o.type === 'flash');
  const pending      = orders.filter(o => o.status === 'pending');
  const totalCA      = orders.reduce((s, o) => s + o.total, 0);
  const flashCA      = flashOrders.reduce((s, o) => s + o.total, 0);

  const ccByHeure: Record<string, Order[]> = {};
  clickCollect.forEach(o => { if (!ccByHeure[o.heureRetrait]) ccByHeure[o.heureRetrait] = []; ccByHeure[o.heureRetrait].push(o); });

  const filteredOrders = filter === 'all' ? orders : filter === 'clickcollect' ? clickCollect : filter === 'flash' ? flashOrders : filter === 'pending' ? pending : clickCollect.filter(o => o.heureRetrait === filter);
  const heures = [...new Set(clickCollect.map(o => o.heureRetrait))].sort();

  if (authLoading) return <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center"><Loader2 size={22} className="text-[#C19A6B]/50 animate-spin" /></div>;
  if (!isAuthenticated) return <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center"><p className="text-white/40 text-sm">Veuillez vous connecter.</p></div>;

  return (
    <div className="min-h-screen bg-[#1A0F0A] pb-24">
      <div className="sticky top-0 z-10 bg-[#1A0F0A]/96 backdrop-blur border-b border-white/8 px-4 py-4">
        <div className="max-w-2xl lg:max-w-5xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push('/boulanger')}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-all flex-shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-lg leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>Commandes</h1>
            <p className="text-white/30 text-xs flex items-center gap-1.5 mt-0.5">
              {lastRefresh ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />Temps réel · {formatTime(lastRefresh.toISOString(), boulangerieTz)}</> : 'Chargement…'}
            </p>
          </div>
          <button onClick={() => setShowClients(!showClients)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 flex-shrink-0 ${
              showClients ? 'text-white bg-[#C19A6B]/20 border-[#C19A6B]/40' : 'text-[#C19A6B] border-[#C19A6B]/30 hover:bg-[#C19A6B]/10'
            }`}>
            <Users size={12} />Clients
          </button>
          <button onClick={loadOrders} disabled={loading}
            className="text-[#C19A6B] text-xs px-3 py-1.5 rounded-lg border border-[#C19A6B]/30 hover:bg-[#C19A6B]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Actualiser
          </button>
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 md:px-6 lg:px-8 pt-5 space-y-5">
        {showClients && (
          <GestionClients onClose={() => setShowClients(false)} />
        )}

        {!showClients && <>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4 text-center">
            <p className="text-white font-bold text-2xl font-mono">{orders.length}</p>
            <p className="text-white/35 text-[10px] uppercase tracking-wider mt-1">Total</p>
          </div>
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4 text-center">
            <p className="text-[#C19A6B] font-bold text-xl font-mono">{totalCA.toFixed(0)}€</p>
            <p className="text-white/35 text-[10px] uppercase tracking-wider mt-1">CA jour</p>
          </div>
          <div className={`border rounded-2xl p-4 text-center ${pending.length > 0 ? 'bg-yellow-400/8 border-yellow-400/20' : 'bg-white/4 border-white/8'}`}>
            <p className={`font-bold text-2xl font-mono ${pending.length > 0 ? 'text-yellow-300' : 'text-white'}`}>{pending.length}</p>
            <p className="text-white/35 text-[10px] uppercase tracking-wider mt-1">Attente</p>
          </div>
        </div>

        {flashOrders.length > 0 && (
          <div className="bg-yellow-400/5 border border-yellow-400/15 rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-yellow-400 rounded-lg p-1"><Zap size={12} className="text-[#2C1810] fill-current" /></div>
              <p className="text-yellow-300 font-semibold text-sm">Paniers Anti-Gaspi</p>
              <span className="ml-auto text-yellow-400/70 text-xs font-mono">{formatPrice(flashCA)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { v: flashOrders.length, l: 'commandes', c: 'text-yellow-300' },
                { v: flashOrders.filter(o => o.status === 'pending').length, l: 'en attente', c: 'text-yellow-300' },
                { v: flashOrders.filter(o => o.status === 'done').length, l: 'récupérées', c: 'text-green-400' },
              ].map(({ v, l, c }) => (
                <div key={l} className="bg-black/20 rounded-xl p-2.5 text-center">
                  <p className={`font-bold font-mono ${c}`}>{v}</p>
                  <p className="text-white/30 text-[10px]">{l}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {([
            { key: 'all',          label: `Toutes (${orders.length})` },
            { key: 'clickcollect', label: `Click & Collect (${clickCollect.length})` },
            { key: 'flash',        label: `Anti-Gaspi (${flashOrders.length})`, highlight: true },
            { key: 'pending',      label: `En attente (${pending.length})` },
            ...heures.map(h => ({ key: h, label: `${heureToPlage(h)} (${ccByHeure[h]?.length ?? 0})` })),
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                filter === f.key
                  ? ('highlight' in f && f.highlight ? 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30' : 'bg-[#C19A6B]/15 text-[#C19A6B] border-[#C19A6B]/30')
                  : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/8'
              }`}>{f.label}</button>
          ))}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3"><AlertCircle size={16} className="text-red-400 flex-shrink-0" /><p className="text-red-300 text-sm">{error}</p></div>}
        {loading && !orders.length && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 bg-white/4 rounded-2xl animate-pulse" />)}</div>}
        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-16"><span className="text-5xl block mb-4">🛒</span><p className="text-white/50 font-medium">Aucune commande pour aujourd'hui</p><p className="text-white/25 text-sm mt-1">Elles apparaîtront ici en temps réel</p></div>
        )}

        {!loading && !error && filteredOrders.length > 0 && (() => {
          const sections: { label: string; orders: Order[] }[] = [];
          const fv = filteredOrders.filter(o => o.type === 'flash');
          if (fv.length) sections.push({ label: 'Paniers Anti-Gaspi', orders: fv });
          const cv = filteredOrders.filter(o => o.type === 'clickcollect');
          [...new Set(cv.map(o => o.heureRetrait))].sort().forEach(h => {
            const grp = cv.filter(o => o.heureRetrait === h);
            if (grp.length) sections.push({ label: `Click & Collect — ${heureToPlage(h)}`, orders: grp });
          });
          return (
            <div className="space-y-6">
              {sections.map(section => (
                <div key={section.label}>
                  <div className="flex items-center gap-2 mb-3">
                    {section.label.includes('Anti-Gaspi') ? <Zap size={13} className="text-yellow-400" /> : <ShoppingBag size={13} className="text-[#C19A6B]" />}
                    <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">{section.label}</p>
                    <span className="bg-white/8 border border-white/10 text-white/30 text-[10px] px-2 py-0.5 rounded-full">{section.orders.length}</span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {section.orders.map(order => (
                        <OrderCard key={order.id} order={order} onOpen={setSelectedOrder} onQuickAdvance={handleQuickAdvance} advancing={updating === order.id} />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {!loading && !error && orders.length > 0 && filteredOrders.length === 0 && (
          <div className="text-center py-10"><Package size={32} className="text-white/15 mx-auto mb-3" /><p className="text-white/35 text-sm">Aucune commande dans ce filtre</p></div>
        )}
        </>}
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)}
            onAdvance={id => { handleAdvance(id); setSelectedOrder(null); }}
            onCancel={handleCancel} onNotCollected={handleNotCollected}
            advancing={updating === selectedOrder.id} boulangerieTz={boulangerieTz} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CommandesPageWrapper() {
  return <BoulangerProvider><CommandesPage /></BoulangerProvider>;
}