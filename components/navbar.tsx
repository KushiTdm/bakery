'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, Menu, X, LogOut, User, Store, UtensilsCrossed, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/context/cart-context';
import type { ActiveTab } from '@/context/active-tab-context';
import ClientSpace from '@/components/client-space';

interface NavbarProps {
  activeTab:    ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  nom?:         string | null;
}

export default function Navbar({ activeTab, setActiveTab, nom }: NavbarProps) {
  const bakName = nom ?? 'Boulangerie Artisanale';
  const [isScrolled, setIsScrolled]             = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [clientSpaceOpen, setClientSpaceOpen]   = useState(false);

  const { totalItems, setIsCartOpen, user, setIsAuthOpen, logout } = useCart();

  const onVitrine = activeTab === 'vitrine';

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isTransparent = onVitrine && !isScrolled;

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isTransparent
            ? 'bg-gradient-to-b from-black/50 to-transparent'
            : 'bg-[#FDFBF7]/96 backdrop-blur-md shadow-sm border-b border-[#E8E0D5]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">

            {/* Logo */}
            <button
              onClick={() => { setActiveTab('vitrine'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`text-xl font-bold tracking-tight transition-colors duration-300 ${isTransparent ? 'text-white' : 'text-[#2C1810]'}`}
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {bakName}
            </button>

            {/* Tabs centraux — desktop */}
            <div className={`hidden md:flex items-center rounded-full p-1 transition-all duration-300 ${isTransparent ? 'bg-black/20 backdrop-blur-sm' : 'bg-[#F5F0E8]'}`}>
              <button
                onClick={() => setActiveTab('vitrine')}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeTab === 'vitrine'
                    ? 'bg-white text-[#2C1810] shadow-sm'
                    : isTransparent ? 'text-white/80 hover:text-white' : 'text-[#2C1810]/60 hover:text-[#2C1810]'
                }`}
              >
                <Store size={14} />
                La Boulangerie
              </button>
              <button
                onClick={() => setActiveTab('commander')}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeTab === 'commander'
                    ? 'bg-[#C19A6B] text-white shadow-sm'
                    : isTransparent ? 'text-white/80 hover:text-white' : 'text-[#2C1810]/60 hover:text-[#2C1810]'
                }`}
              >
                <UtensilsCrossed size={14} />
                Click & Collect
              </button>
            </div>

            {/* Actions droite */}
            <div className="flex items-center gap-2">
              {user ? (
                <div className="hidden md:flex items-center gap-2">
                  {/* Bouton espace client */}
                  <button
                    onClick={() => setClientSpaceOpen(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                      isTransparent
                        ? 'border-white/40 text-white/80 hover:bg-white/15'
                        : 'border-[#C19A6B]/50 text-[#C19A6B] hover:bg-[#C19A6B]/10'
                    }`}
                    title="Mes commandes et paramètres"
                  >
                    <Package size={12} />
                    Mes commandes
                  </button>
                  <button
                    onClick={logout}
                    className={`p-2 transition-colors ${isTransparent ? 'text-white/70 hover:text-white' : 'text-[#2C1810]/50 hover:text-[#2C1810]'}`}
                    title="Se déconnecter"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                    isTransparent
                      ? 'border-white/40 text-white/80 hover:bg-white/15'
                      : 'border-[#C19A6B]/50 text-[#C19A6B] hover:bg-[#C19A6B]/10'
                  }`}
                >
                  <User size={12} /> Connexion
                </button>
              )}

              {/* Panier — toujours visible sur commander */}
              <AnimatePresence>
                {activeTab === 'commander' && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative p-2 text-[#2C1810] hover:text-[#C19A6B] transition-colors"
                    onClick={() => setIsCartOpen(true)}
                  >
                    <ShoppingBag size={22} />
                    <AnimatePresence>
                      {totalItems > 0 && (
                        <motion.span
                          key="badge"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute -top-1 -right-1 bg-[#C19A6B] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                        >
                          {totalItems > 9 ? '9+' : totalItems}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )}
              </AnimatePresence>

              <button
                className={`md:hidden p-2 transition-colors ${isTransparent ? 'text-white' : 'text-[#2C1810]'}`}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {/* Menu mobile */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-[#FDFBF7] border-t border-[#E8E0D5]"
            >
              <div className="px-4 py-5 space-y-3">
                <button
                  onClick={() => { setActiveTab('vitrine'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === 'vitrine' ? 'bg-[#2C1810] text-white' : 'text-[#2C1810] hover:bg-[#F5F0E8]'
                  }`}
                >
                  <Store size={16} /> La Boulangerie
                </button>
                <button
                  onClick={() => { setActiveTab('commander'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === 'commander' ? 'bg-[#C19A6B] text-white' : 'text-[#2C1810] hover:bg-[#F5F0E8]'
                  }`}
                >
                  <UtensilsCrossed size={16} /> Click & Collect
                </button>

                {/* Espace client mobile */}
                {user && (
                  <button
                    onClick={() => { setClientSpaceOpen(true); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#C19A6B] hover:bg-[#C19A6B]/10 transition-all"
                  >
                    <Package size={16} /> Mes commandes
                  </button>
                )}

                <div className="pt-2 border-t border-[#E8E0D5]">
                  {user ? (
                    <button onClick={logout} className="text-[#2C1810]/50 text-sm flex items-center gap-2 px-2">
                      <LogOut size={14} /> Se déconnecter
                    </button>
                  ) : (
                    <button
                      onClick={() => { setIsAuthOpen(true); setIsMobileMenuOpen(false); }}
                      className="text-[#C19A6B] font-medium text-sm flex items-center gap-2 px-2"
                    >
                      <User size={14} /> Se connecter
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Espace client modal */}
      <AnimatePresence>
        {clientSpaceOpen && (
          <ClientSpace onClose={() => setClientSpaceOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}