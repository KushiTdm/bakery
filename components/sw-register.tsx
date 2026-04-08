'use client';

// components/sw-register.tsx
// Enregistre le Service Worker au démarrage de l'app.
// Gère les mises à jour de manière non-intrusive (toast au lieu de rechargement).

import { useEffect, useState, useCallback } from 'react';

export default function SwRegister() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  const applyUpdate = useCallback(() => {
    if (!waitingSW) return;
    waitingSW.postMessage({ type: 'SKIP_WAITING' });
    setWaitingSW(null);
  }, [waitingSW]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator)
    ) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Enregistré :', reg.scope);

        // Détecte un SW en attente déjà présent
        if (reg.waiting) {
          setWaitingSW(reg.waiting);
        }

        // Écoute les nouvelles versions
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              // Nouvelle version disponible
              setWaitingSW(newSW);
            }
          });
        });

        // Vérifie les mises à jour périodiquement (toutes les 10 min en prod)
        if (process.env.NODE_ENV === 'production') {
          setInterval(() => reg.update(), 600_000);
        }
      })
      .catch((err) => {
        console.warn('[SW] Échec enregistrement :', err);
      });

    // Recharge la page quand le nouveau SW prend le contrôle (après clic utilisateur)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  // Toast non-intrusif pour la mise à jour
  if (!waitingSW) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'rgba(30, 30, 30, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(193, 154, 107, 0.3)',
        borderRadius: 16,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        maxWidth: 360,
        width: 'calc(100% - 32px)',
      }}
    >
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', flex: 1 }}>
        Mise à jour disponible
      </span>
      <button
        onClick={applyUpdate}
        style={{
          background: 'rgba(193, 154, 107, 0.25)',
          border: '1px solid rgba(193, 154, 107, 0.4)',
          borderRadius: 10,
          color: '#C19A6B',
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Actualiser
      </button>
    </div>
  );
}
