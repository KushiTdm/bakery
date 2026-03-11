'use client';

import { motion } from 'framer-motion';
import { ChevronDown, ShoppingBag } from 'lucide-react';
import type { ActiveTab } from '@/app/page';

interface HeroProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export default function Hero({ setActiveTab }: HeroProps) {
  return (
    <section
      id="accueil"
      className="relative h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Image de fond */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1920&q=80"
          alt="Boulangerie artisanale"
          className="w-full h-full object-cover brightness-[0.45]"
        />
        {/* Dégradé bas */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#2C1810]/80 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        {/* Petit label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 text-xs font-medium px-4 py-1.5 rounded-full mb-6 tracking-wider uppercase"
        >
          <span className="w-1.5 h-1.5 bg-[#C19A6B] rounded-full" />
          Artisan Boulanger depuis 1952
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          L'art du pain <br />
          <span className="text-[#C19A6B] italic">à la française</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-lg text-white/75 mb-10 max-w-xl mx-auto leading-relaxed"
        >
          Farines locales, levain naturel, fermentation lente. 
          Chaque pain est une œuvre façonnée dans le respect de la tradition.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="flex items-center justify-center gap-4 flex-wrap"
        >
          <button
            onClick={() => document.getElementById('savoir-faire')?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-white text-[#2C1810] px-7 py-3.5 rounded-full text-sm font-semibold hover:bg-[#FDFBF7] transition-colors shadow-xl"
          >
            Découvrir notre savoir-faire
          </button>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveTab('commander')}
            className="flex items-center gap-2 bg-[#C19A6B] text-white px-7 py-3.5 rounded-full text-sm font-semibold hover:bg-[#8B4513] transition-colors shadow-xl"
          >
            <ShoppingBag size={16} />
            Commander en ligne
          </motion.button>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <ChevronDown size={36} className="text-white/50" />
        </motion.div>
      </motion.div>
    </section>
  );
}