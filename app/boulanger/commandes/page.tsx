'use client';

// app/boulanger/commandes/page.tsx
// ─────────────────────────────────────────────────────────────
// Dashboard des commandes click & collect du jour.
// Authentification via BoulangerProvider (Supabase JWT).
// Source de données : GET /api/orders (bearer token).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────

interface OrderItem {
  name:     string;
  qty:      number;
  price:    number;
}

interface Order {
  id:            string;
  commande_id:   string;
  email:         string;
  prenom:        string | null;
  items:         OrderItem[];
  total:         number;
  pickup_time:   string | null;
  status:        'pending' | 'confirmed' | 'ready' | 'done';
  created_at:    string;
}

const STATUS_LABELS: Record<Order['status'], string> = {
  pending:   'En attente',
  confirmed: 'Confirmée',
  ready:     'Prête',
  done:      'Récupérée',
};

const STATUS_COLORS: Record<Order['status'], string> = {
  pending:   'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  confirmed: 'bg-blue-500/15  text-blue-300  border-blue-500/30',
  ready:     'bg-green-500/15 text-green-300 border-green-500/30',
  done:      'bg-white/5      text-white/30  border-white/10',
};

// ── Utils ─────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

// ── Composant ─────────────────────────────────────────────────

export default function CommandesPage() {
  const { isAuthenticated, authLoading } = useBoulanger();
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Charge les commandes du jour
  const loadOrders = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Non authentifié'); return; }

      const res = await fetch('/api/orders', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        setError(error ?? 'Erreur lors du chargement');
        return;
      }

      const { orders: data } = await res.json();
      setOrders(data ?? []);
      setLastRefresh(new Date());
    } catch (e) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mise à jour du statut d'une commande
  const updateStatus = useCallback(async (orderId: string, status: Order['status']) => {
    setUpdating(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/orders/${orderId}`, {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setOrders(prev =>
          prev.map(o => o.id === orderId ? { ...o, status } : o)
        );
      }
    } finally {
      setUpdating(null);
    }
  }, []);

  // Chargement initial + rafraîchissement auto toutes les 60 s
  useEffect(() => {
    if (!isAuthenticated) return;
    loadOrders();
    const interval = setInterval(loadOrders, 60_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, loadOrders]);

  // ── États ──────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C19A6B]/30 border-t-[#C19A6B] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
        <p className="text-white/40">Veuillez vous connecter.</p>
      </div>
    );
  }

  // ── Stats du jour ──────────────────────────────────────────

  const totalCA = orders.reduce((s, o) => s + o.total, 0);
  const byStatus = {
    pending:   orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    ready:     orders.filter(o => o.status === 'ready').length,
    done:      orders.filter(o => o.status === 'done').length,
  };

  // ── Rendu ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#1A0F0A] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1A0F0A]/95 backdrop-blur border-b border-white/8 px-4 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
              Commandes du jour
            </h1>
            <p className="text-white/30 text-xs">
              {lastRefresh ? `Mis à jour à ${formatTime(lastRefresh.toISOString())}` : 'Chargement…'}
            </p>
          </div>
          <button
            onClick={loadOrders}
            disabled={loading}
            className="text-[#C19A6B] text-sm px-3 py-1.5 rounded-lg border border-[#C19A6B]/30 hover:bg-[#C19A6B]/10 transition-colors disabled:opacity-40"
          >
            {loading ? '…' : '↻ Actualiser'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Résumé */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">CA estimé</p>
            <p className="text-[#C19A6B] text-2xl font-bold">{formatPrice(totalCA)}</p>
          </div>
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Commandes</p>
            <p className="text-white text-2xl font-bold">{orders.length}</p>
          </div>
        </div>

        {/* Filtres statuts */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(byStatus) as Order['status'][]).map(status => (
            <div
              key={status}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium ${STATUS_COLORS[status]}`}
            >
              {STATUS_LABELS[status]} · {byStatus[status]}
            </div>
          ))}
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Chargement */}
        {loading && !orders.length && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-white/4 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Aucune commande */}
        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-16">
            <span className="text-5xl block mb-4">🛒</span>
            <p className="text-white/50 font-medium">Aucune commande pour aujourd'hui</p>
            <p className="text-white/25 text-sm mt-1">Elles apparaîtront ici en temps réel</p>
          </div>
        )}

        {/* Liste des commandes */}
        <div className="flex flex-col gap-3">
          {orders.map(order => (
            <div
              key={order.id}
              className={`bg-white/4 border rounded-2xl overflow-hidden transition-opacity ${
                order.status === 'done' ? 'opacity-50' : 'opacity-100'
              }`}
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {/* Entête commande */}
              <div className="flex items-start justify-between p-4 pb-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-semibold text-sm">
                      {order.prenom || order.email.split('@')[0]}
                    </span>
                    <span className="text-white/25 text-xs">#{order.commande_id}</span>
                  </div>
                  <p className="text-white/30 text-xs">{order.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#C19A6B] font-bold">{formatPrice(order.total)}</p>
                  <p className="text-white/25 text-xs">{formatTime(order.created_at)}</p>
                </div>
              </div>

              {/* Pickup */}
              {order.pickup_time && (
                <div className="px-4 py-1.5 bg-[#C19A6B]/6 flex items-center gap-2">
                  <span className="text-sm">🕐</span>
                  <p className="text-[#C19A6B]/80 text-xs">Retrait : {order.pickup_time}</p>
                </div>
              )}

              {/* Articles */}
              <div className="px-4 pt-2 pb-3 space-y-1">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">
                      <span className="text-white/35 mr-2">{item.qty}×</span>
                      {item.name}
                    </span>
                    <span className="text-white/35 text-xs">{formatPrice(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>

              {/* Actions statut */}
              <div className="px-4 pb-4 flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[order.status]}`}>
                  {STATUS_LABELS[order.status]}
                </span>
                <div className="flex-1" />
                {order.status !== 'done' && (
                  <div className="flex gap-1.5">
                    {order.status === 'pending' && (
                      <ActionButton
                        onClick={() => updateStatus(order.id, 'confirmed')}
                        loading={updating === order.id}
                        label="Confirmer"
                        emoji="✓"
                        color="blue"
                      />
                    )}
                    {order.status === 'confirmed' && (
                      <ActionButton
                        onClick={() => updateStatus(order.id, 'ready')}
                        loading={updating === order.id}
                        label="Prête"
                        emoji="🟢"
                        color="green"
                      />
                    )}
                    {order.status === 'ready' && (
                      <ActionButton
                        onClick={() => updateStatus(order.id, 'done')}
                        loading={updating === order.id}
                        label="Récupérée"
                        emoji="✓✓"
                        color="gray"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Bouton action ──────────────────────────────────────────────

function ActionButton({
  onClick, loading, label, emoji, color,
}: {
  onClick: () => void;
  loading: boolean;
  label:   string;
  emoji:   string;
  color:   'blue' | 'green' | 'gray';
}) {
  const colors = {
    blue:  'bg-blue-500/15  border-blue-500/30  text-blue-300  hover:bg-blue-500/25',
    green: 'bg-green-500/15 border-green-500/30 text-green-300 hover:bg-green-500/25',
    gray:  'bg-white/8      border-white/15      text-white/50  hover:bg-white/15',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 ${colors[color]}`}
    >
      {loading
        ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        : <span>{emoji}</span>
      }
      {label}
    </button>
  );
}