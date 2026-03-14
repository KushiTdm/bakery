// components/hero.tsx

import HeroCTA from './hero-cta';

export default function Hero() {
  return (
    <section
      id="accueil"
      className="relative h-screen flex items-center justify-center overflow-hidden"
      aria-label="Boulangerie artisanale L'Artisan Doré — Paris"
    >
      {/* Image de fond LCP — priorité maximale */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1920&q=80"
          alt="L'Artisan Doré — boulangerie artisanale parisienne depuis 1952, pains au levain naturel"
          className="w-full h-full object-cover brightness-[0.45]"
          fetchPriority="high"
          decoding="async"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2C1810]/80 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        {/* Badge — contenu indexable */}
        <p className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 text-xs font-medium px-4 py-1.5 rounded-full mb-6 tracking-wider uppercase">
          <span className="w-1.5 h-1.5 bg-[#C19A6B] rounded-full" aria-hidden="true" />
          Artisan Boulanger depuis 1952
        </p>

        {/* H1 — mot-clé principal "boulangerie artisanale" en tête */}
        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          Boulangerie artisanale <br />
          <span className="text-[#C19A6B] italic">à la française</span>
        </h1>

        {/* Description — renforce les mots-clés longue traîne */}
        <p className="text-lg text-white/75 mb-10 max-w-xl mx-auto leading-relaxed">
          Farines locales Label Rouge, levain naturel de 15 ans, fermentation lente 24h.
          Chaque pain façonné à la main dans la tradition artisanale.
        </p>

        {/* CTA — client island isolé */}
        <HeroCTA />
      </div>

      {/* Chevron animé */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/50"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </section>
  );
}