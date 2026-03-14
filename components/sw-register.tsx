'use client';

// components/sw-register.tsx
// Enregistre le Service Worker au démarrage de l'app.
// À importer dans app/layout.tsx.

import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator)
    ) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Enregistré :', reg.scope);

        // Vérifie les mises à jour périodiquement (toutes les 60s en prod)
        if (process.env.NODE_ENV === 'production') {
          setInterval(() => reg.update(), 60_000);
        }
      })
      .catch((err) => {
        console.warn('[SW] Échec enregistrement :', err);
      });
  }, []);

  return null;
}