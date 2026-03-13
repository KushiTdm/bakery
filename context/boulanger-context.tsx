'use client';

// context/boulanger-context.tsx
// CORRECTIF : suppression du bypass PIN 1952
//
// AVANT (dangereux) :
//   async function authenticate(pin: string) {
//     if (pin === '1952') { setIsAuthenticated(true); return; }   ← BYPASS
//     const { error } = await supabase.auth.signInWithPassword(...)
//   }
//
// APRÈS : L'authentification passe TOUJOURS par Supabase.
// Le PIN local n'existe plus. Utilisez la Magic Link / OTP déjà en place.

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface BoulangerContextType {
  session: Session | null;
  user: User | null;
  boulangerie: Boulangerie | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

interface Boulangerie {
  id: string;
  nom: string;
  slug: string;
  plan: 'starter' | 'pro' | 'multi';
  actif: boolean;
  airtable_api_key: string | null;
  airtable_base_id: string | null;
}

const BoulangerContext = createContext<BoulangerContextType | null>(null);

export function BoulangerProvider({ children }: { children: ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [user, setUser]             = useState<User | null>(null);
  const [boulangerie, setBoulangerie] = useState<Boulangerie | null>(null);
  const [isLoading, setIsLoading]   = useState(true);

  useEffect(() => {
    // Récupère la session initiale
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchBoulangerie(session.user.id);
      else setIsLoading(false);
    });

    // Écoute les changements de session (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) fetchBoulangerie(session.user.id);
        else {
          setBoulangerie(null);
          setIsLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchBoulangerie(userId: string) {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('boulangeries')
        .select('id, nom, slug, plan, actif, airtable_api_key, airtable_base_id')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setBoulangerie(data);
    } catch (err) {
      console.error('[BoulangerContext] fetchBoulangerie:', err);
      setBoulangerie(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <BoulangerContext.Provider value={{ session, user, boulangerie, isLoading, signOut }}>
      {children}
    </BoulangerContext.Provider>
  );
}

export function useBoulanger() {
  const ctx = useContext(BoulangerContext);
  if (!ctx) throw new Error('useBoulanger doit être utilisé dans <BoulangerProvider>');
  return ctx;
}