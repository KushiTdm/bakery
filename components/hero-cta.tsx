'use client';

import { motion } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import { useActiveTab } from '@/context/active-tab-context';

export default function HeroCTA() {
  const { setActiveTab } = useActiveTab();

  return (
    <div className="flex items-center justify-center gap-4 flex-wrap">
      <button
        onClick={() =>
          document.getElementById('notre-histoire')?.scrollIntoView({ behavior: 'smooth' })
        }
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
    </div>
  );
}