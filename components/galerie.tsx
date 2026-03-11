'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

const photos = [
  {
    id: 1,
    src: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
    label: 'Croissant Pur Beurre',
    size: 'large',
  },
  {
    id: 2,
    src: 'https://images.unsplash.com/photo-1542826438-bd32f43d626f?w=800&q=80',
    label: 'Millefeuille',
    size: 'small',
  },
  {
    id: 3,
    src: 'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=800&q=80',
    label: 'Tarte Citron Meringuée',
    size: 'small',
  },
  {
    id: 4,
    src: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80',
    label: 'Paris-Brest',
    size: 'medium',
  },
  {
    id: 5,
    src: 'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
    label: 'Baguette Tradition',
    size: 'medium',
  },
  {
    id: 6,
    src: 'https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?w=800&q=80',
    label: 'Éclair au Café',
    size: 'large',
  },
];

export default function Galerie() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section id="galerie" className="bg-[#FDFBF7] py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <p className="text-[#C19A6B] text-xs font-medium tracking-[0.3em] uppercase mb-4">
            Nos créations
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-[#2C1810]" style={{ fontFamily: 'Playfair Display, serif' }}>
            La fournée du moment
          </h2>
          <p className="text-[#2C1810]/55 mt-4 max-w-lg mx-auto leading-relaxed">
            Chaque création est une édition limitée. La sélection change chaque matin selon les saisons et l'inspiration de nos artisans.
          </p>
        </motion.div>

        {/* Grille masonry-style */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[200px]">
          {photos.map((photo, i) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              onHoverStart={() => setHovered(photo.id)}
              onHoverEnd={() => setHovered(null)}
              className={`relative overflow-hidden rounded-2xl cursor-pointer group ${
                photo.size === 'large' ? 'row-span-2' :
                photo.size === 'medium' ? 'row-span-1 col-span-1' :
                'row-span-1'
              }`}
            >
              <img
                src={photo.src}
                alt={photo.label}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              {/* Overlay hover */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: hovered === photo.id ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 bg-gradient-to-t from-[#2C1810]/80 via-[#2C1810]/20 to-transparent flex items-end p-5"
              >
                <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {photo.label}
                </p>
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Note de bas */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-[#2C1810]/35 text-sm mt-10 italic"
        >
          Photos prises chaque matin par notre équipe · Disponibilité selon la saison
        </motion.p>

      </div>
    </section>
  );
}