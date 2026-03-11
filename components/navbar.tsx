'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, Menu, X, LogOut, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/context/cart-context';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { totalItems, setIsCartOpen, user, setIsAuthOpen, logout } = useCart();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { href: '#accueil', label: 'Accueil' },
    { href: '#nos-pains', label: 'Nos Pains' },
    { href: '#patisseries', label: 'Pâtisseries' },
    { href: '#notre-histoire', label: 'Notre Histoire' },
    { href: '#contact', label: 'Contact' },
  ];

  const linkColor = isScrolled
    ? 'text-[#2C1810] hover:text-[#C19A6B]'
    : 'text-white hover:text-[#C19A6B]';
  const logoColor = isScrolled ? 'text-[#2C1810]' : 'text-white';
  const iconColor = isScrolled
    ? 'text-[#2C1810] hover:text-[#C19A6B]'
    : 'text-white hover:text-[#C19A6B]';

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#FDFBF7]/95 backdrop-blur-md shadow-lg'
          : 'bg-gradient-to-b from-black/40 to-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">

          <motion.a
            href="#accueil"
            className={`text-2xl font-bold transition-colors duration-300 ${logoColor}`}
            whileHover={{ scale: 1.05 }}
          >
            L'Artisan Doré
          </motion.a>

          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                className={`transition-colors duration-200 font-medium ${linkColor}`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center space-x-2">

            {/* Utilisateur connecté */}
            {user ? (
              <div className="hidden md:flex items-center gap-2">
                <span className={`text-xs font-medium ${isScrolled ? 'text-[#2C1810]/60' : 'text-white/70'}`}>
                  {user.email}
                </span>
                <button
                  onClick={logout}
                  className={`p-2 transition-colors ${iconColor}`}
                  title="Se déconnecter"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                  isScrolled
                    ? 'border-[#C19A6B] text-[#C19A6B] hover:bg-[#C19A6B] hover:text-white'
                    : 'border-white/60 text-white hover:bg-white/20'
                }`}
              >
                <User size={13} /> Connexion
              </button>
            )}

            {/* Panier */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className={`relative p-2 transition-colors duration-300 ${iconColor}`}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag size={24} />
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

            {/* Menu mobile */}
            <button
              className={`md:hidden p-2 transition-colors duration-300 ${iconColor}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
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
            className="md:hidden bg-[#FDFBF7] border-t border-[#C19A6B]/20"
          >
            <div className="px-4 py-6 space-y-4">
              {navLinks.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block text-[#2C1810] hover:text-[#C19A6B] transition-colors font-medium"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-2 border-t border-[#C19A6B]/20">
                {user ? (
                  <button onClick={logout} className="text-[#2C1810]/60 text-sm flex items-center gap-2">
                    <LogOut size={14} /> Se déconnecter
                  </button>
                ) : (
                  <button
                    onClick={() => { setIsAuthOpen(true); setIsMobileMenuOpen(false); }}
                    className="text-[#C19A6B] font-medium text-sm flex items-center gap-2"
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
  );
}