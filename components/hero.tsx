import HeroCTA from './hero-cta';

export default function Hero() {
  return (
    <section
      id="accueil"
      className="relative h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Image de fond — rendue côté serveur */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1920&q=80"
          alt="Boulangerie artisanale"
          className="w-full h-full object-cover brightness-[0.45]"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2C1810]/80 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        {/* Label */}
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 text-xs font-medium px-4 py-1.5 rounded-full mb-6 tracking-wider uppercase">
          <span className="w-1.5 h-1.5 bg-[#C19A6B] rounded-full" />
          Artisan Boulanger depuis 1952
        </div>

        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          L'art du pain <br />
          <span className="text-[#C19A6B] italic">à la française</span>
        </h1>

        <p className="text-lg text-white/75 mb-10 max-w-xl mx-auto leading-relaxed">
          Farines locales, levain naturel, fermentation lente.
          Chaque pain est une œuvre façonnée dans le respect de la tradition.
        </p>

        {/* Boutons interactifs isolés dans un Client Component */}
        <HeroCTA />
      </div>

      {/* Chevron animé — CSS only, pas besoin de framer-motion */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36" height="36"
          viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className="text-white/50"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </section>
  );
}