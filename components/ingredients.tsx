const ingredients = [
  {
    number: '01',
    title: 'Farines du moulin',
    subtitle: 'Moulins Viron · Chartres',
    description:
      'Notre farine de tradition française Label Rouge est moulue sur meule de pierre. Aucun additif, aucun améliorant. Juste le grain, le vent, et le temps.',
    detail: 'T65 · T80 · Seigle intégral',
    image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800&q=80',
  },
  {
    number: '02',
    title: 'Levain naturel',
    subtitle: "Chef de 15 ans d'âge",
    description:
      "Notre levain est né en 2009. Nourri chaque jour de farine et d'eau de source, il donne à nos pains leur acidité douce et leur alvéolage caractéristique.",
    detail: "Hydratation 100% · Rafraîchi 2×/jour",
    image: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=800&q=80',
  },
  {
    number: '03',
    title: 'Fermentation lente',
    subtitle: '24 à 48 heures au froid',
    description:
      "Pas de levure industrielle. Le froid ralentit la fermentation, développe les arômes complexes et améliore la digestibilité. La patience est notre principal ingrédient.",
    detail: '4°C · Pousse contrôlée · Sans additifs',
    image: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=800&q=80',
  },
  {
    number: '04',
    title: 'Cuisson sur sole',
    subtitle: 'Four à sole réfractaire',
    description:
      "La sole en pierre emmagasine la chaleur et la restitue de façon homogène. La croûte se forme en quelques secondes, piégeant l'humidité et les arômes à l'intérieur.",
    detail: '250°C · Vapeur initiale · 35 min',
    image: 'https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=80',
  },
];

export default function Ingredients() {
  return (
    <section id="ingredients" className="bg-[#2C1810] py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-20">
          <p className="text-[#C19A6B] text-xs font-medium tracking-[0.3em] uppercase mb-4">
            Notre processus
          </p>
          <h2
            className="text-4xl sm:text-5xl font-bold text-white leading-tight"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            De la farine <br />
            <span className="text-[#C19A6B] italic">au pain dans votre main</span>
          </h2>
          <div className="w-16 h-px bg-[#C19A6B]/50 mt-6" />
        </div>

        {/* Étapes */}
        <div className="space-y-24">
          {ingredients.map((item, i) => (
            <div
              key={item.number}
              className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
                i % 2 === 1 ? 'lg:grid-flow-col-dense' : ''
              }`}
            >
              {/* Image */}
              <div className={`relative ${i % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                <div className="relative overflow-hidden rounded-2xl aspect-[4/3]">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-5 left-5">
                    <span
                      className="text-6xl font-black text-white/10"
                      style={{ fontFamily: 'Playfair Display, serif' }}
                    >
                      {item.number}
                    </span>
                  </div>
                </div>
              </div>

              {/* Texte */}
              <div className={i % 2 === 1 ? 'lg:col-start-1' : ''}>
                <div className="flex items-center gap-3 mb-5">
                  <span
                    className="text-4xl font-black text-[#C19A6B]/20"
                    style={{ fontFamily: 'Playfair Display, serif' }}
                  >
                    {item.number}
                  </span>
                  <div className="h-px flex-1 bg-[#C19A6B]/20" />
                </div>
                <h3
                  className="text-3xl font-bold text-white mb-2"
                  style={{ fontFamily: 'Playfair Display, serif' }}
                >
                  {item.title}
                </h3>
                <p className="text-[#C19A6B] text-sm font-medium mb-5 tracking-wide">
                  {item.subtitle}
                </p>
                <p className="text-white/60 leading-relaxed mb-6 text-lg">
                  {item.description}
                </p>
                <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B]" />
                  <span className="text-white/50 text-xs font-mono tracking-wider">
                    {item.detail}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Citation */}
        <blockquote className="mt-28 text-center max-w-2xl mx-auto">
          <div className="text-[#C19A6B] text-5xl font-serif mb-4 opacity-40">"</div>
          <p
            className="text-white/70 text-xl italic leading-relaxed"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Un bon pain ne ment jamais. Il porte en lui chaque décision prise,
            du choix de la farine à la température du four.
          </p>
          <footer className="mt-5 text-[#C19A6B] text-sm font-medium tracking-wider uppercase">
            — Jacques Morel, Maître Boulanger
          </footer>
        </blockquote>
      </div>
    </section>
  );
}