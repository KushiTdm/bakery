'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { categories } from '@/lib/products';
import ProductCard from './product-card';
import { useProducts } from '@/hooks/use-products';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ProductMenu() {
  const [activeCategory, setActiveCategory] = useState('all');
  const { products, loading, error, source } = useProducts();

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category === activeCategory);

  return (
    <section id="nos-pains" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-[#2C1810] mb-4">
            Notre Sélection Quotidienne
          </h2>
          <p className="text-lg text-[#2C1810]/70 max-w-2xl mx-auto">
            Des produits frais préparés chaque jour avec des ingrédients de première qualité
          </p>

          {/* Indicateur source données */}
          {!loading && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                source === 'airtable' ? 'bg-green-500' :
                source === 'fallback' ? 'bg-amber-500' : 'bg-gray-400'
              }`} />
              <span className="text-xs text-[#2C1810]/40">
                {source === 'airtable' && 'Catalogue mis à jour en temps réel'}
                {source === 'fallback' && 'Catalogue de secours (données locales)'}
                {source === 'local' && 'Catalogue local'}
              </span>
            </div>
          )}
        </motion.div>

        {/* Bannière erreur Airtable */}
        {error && source === 'fallback' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 max-w-lg mx-auto"
          >
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
            <p className="text-amber-700 text-sm">
              Catalogue temporairement indisponible. Les prix peuvent ne pas être affichés.
            </p>
          </motion.div>
        )}

        {/* Filtres catégories */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-4 mb-12"
        >
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                activeCategory === category.id
                  ? 'bg-[#C19A6B] text-white shadow-lg scale-105'
                  : 'bg-white text-[#2C1810] hover:bg-[#C19A6B]/10 shadow-md'
              }`}
            >
              {category.label}
            </button>
          ))}
        </motion.div>

        {/* Grille produits */}
        {loading ? (
          // Skeleton loading
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
                <div className="aspect-[4/3] bg-[#E8E0D5]" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-[#E8E0D5] rounded w-3/4" />
                  <div className="h-3 bg-[#E8E0D5] rounded w-full" />
                  <div className="h-3 bg-[#E8E0D5] rounded w-2/3" />
                  <div className="flex justify-between items-center pt-2">
                    <div className="h-6 bg-[#E8E0D5] rounded w-16" />
                    <div className="w-10 h-10 bg-[#E8E0D5] rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
          >
            {filteredProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </motion.div>
        )}

      </div>
    </section>
  );
}