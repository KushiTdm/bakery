'use client';

import { motion } from 'framer-motion';
import { Plus, ShoppingBag } from 'lucide-react';
import { Product } from '@/lib/products';
import { useCart } from '@/context/cart-context';

interface ProductCardProps {
  product: Product;
  index: number;
}

export default function ProductCard({ product, index }: ProductCardProps) {
  const { addItem, user, setIsAuthOpen, setPendingProduct } = useCart();

  const handleAdd = () => {
    if (!user) {
      // Mémoriser le produit, ouvrir l'auth
      setPendingProduct(product);
      setIsAuthOpen(true);
    } else {
      addItem(product);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ y: -8 }}
      className="group bg-white rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-shadow duration-300"
    >
      {/* Image */}
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Badge catégorie */}
        <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-[#2C1810] text-xs font-medium px-2.5 py-1 rounded-full capitalize">
          {product.category}
        </span>
      </div>

      {/* Infos */}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-[#2C1810] mb-1">
          {product.name}
        </h3>
        <p className="text-[#2C1810]/60 text-sm mb-4 line-clamp-2">
          {product.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-[#C19A6B]">
            {product.price.toFixed(2)} €
          </span>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleAdd}
            className="group/btn bg-[#2C1810] text-white p-3 rounded-full hover:bg-[#C19A6B] transition-colors duration-300 flex items-center gap-0 hover:gap-2 overflow-hidden"
            title={user ? 'Ajouter au panier' : 'Se connecter pour commander'}
          >
            <Plus size={18} className="flex-shrink-0" />
            <span className="text-xs font-medium max-w-0 group-hover/btn:max-w-[80px] overflow-hidden transition-all duration-300 whitespace-nowrap">
              {user ? 'Ajouter' : 'Connexion'}
            </span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}