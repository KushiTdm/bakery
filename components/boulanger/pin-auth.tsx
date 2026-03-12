'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBoulanger } from '@/context/boulanger-context';
import { Delete, Lock } from 'lucide-react';

export default function PinAuth() {
  const { authenticate } = useBoulanger();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + d;
    setPin(newPin);
    setError(false);
    if (newPin.length === 4) {
      setTimeout(() => {
        const ok = authenticate(newPin);
        if (!ok) {
          setShake(true);
          setError(true);
          setTimeout(() => { setPin(''); setShake(false); }, 700);
        }
      }, 150);
    }
  };

  const handleDelete = () => { setPin(p => p.slice(0, -1)); setError(false); };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="min-h-screen bg-[#1A0F0A] flex flex-col items-center justify-center px-6">
      {/* Texture grain */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-xs"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[#C19A6B]/15 border border-[#C19A6B]/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">🥖</span>
          </div>
          <h1 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
            L'Artisan Doré
          </h1>
          <p className="text-white/35 text-xs mt-1.5 tracking-widest uppercase font-medium">
            Espace Boulanger
          </p>
        </div>

        {/* Indicateur PIN */}
        <motion.div
          animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex justify-center gap-4 mb-10"
        >
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              animate={{
                scale: pin.length > i ? 1.15 : 1,
                backgroundColor: error ? '#ef4444' : pin.length > i ? '#C19A6B' : 'transparent',
              }}
              transition={{ duration: 0.15 }}
              className="w-4 h-4 rounded-full border-2"
              style={{ borderColor: error ? '#ef4444' : '#C19A6B40' }}
            />
          ))}
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-xs text-center mb-4 -mt-6"
            >
              Code incorrect
            </motion.p>
          )}
        </AnimatePresence>

        {/* Clavier */}
        <div className="grid grid-cols-3 gap-3">
          {keys.map((key, i) => {
            if (key === '') return <div key={i} />;
            if (key === '⌫') {
              return (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.88 }}
                  onClick={handleDelete}
                  className="h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors active:bg-white/15"
                >
                  <Delete size={20} />
                </motion.button>
              );
            }
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.88 }}
                onClick={() => handleDigit(key)}
                className="h-16 rounded-2xl bg-white/6 border border-white/8 text-white text-2xl font-light hover:bg-[#C19A6B]/20 hover:border-[#C19A6B]/40 transition-all active:bg-[#C19A6B]/30"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                {key}
              </motion.button>
            );
          })}
        </div>

        {/* Hint */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <Lock size={11} className="text-white/20" />
          <p className="text-white/20 text-xs">Code PIN · Demo : 1952</p>
        </div>
      </motion.div>
    </div>
  );
}