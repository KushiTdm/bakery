
const features = [
  {
    emoji: '🌾',
    title: 'Farines Locales',
    description: 'Sélection rigoureuse de farines bio issues de moulins de la région',
  },
  {
    emoji: '⏱️',
    title: 'Fermentation Longue',
    description: 'Pétrissage lent et fermentation naturelle sur 24 heures minimum',
  },
  {
    emoji: '🏆',
    title: 'Savoir-Faire',
    description: 'Techniques artisanales transmises de génération en génération',
  },
  {
    emoji: '❤️',
    title: 'Passion Française',
    description: "L'amour du bon pain et de la pâtisserie au cœur de notre métier",
  },
];

export default function SavoirFaire() {
  return (
    <section id="notre-histoire" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Image */}
          <div>
            <img
              src="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80"
              alt="Artisan boulanger au travail"
              className="rounded-lg shadow-2xl w-full h-[600px] object-cover"
              loading="lazy"
            />
          </div>

          {/* Texte */}
          <div>
            <h2
              className="text-4xl sm:text-5xl font-bold text-[#2C1810] mb-6"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Notre Savoir-Faire
            </h2>
            <p className="text-lg text-[#2C1810]/70 mb-8 leading-relaxed">
              Depuis 1952, notre boulangerie perpétue l'art traditionnel du pain français.
              Chaque matin, avant l'aube, nos artisans boulangers pétrissent, façonnent
              et cuisent avec passion des pains au levain naturel et des pâtisseries délicates.
            </p>
            <p className="text-lg text-[#2C1810]/70 mb-12 leading-relaxed">
              Notre engagement : utiliser uniquement des ingrédients nobles, des farines
              issues de meuniers locaux, et respecter les temps de fermentation qui donnent
              à nos produits leur goût authentique et leur texture incomparable.
            </p>

            <div className="grid sm:grid-cols-2 gap-6">
              {features.map(feature => (
                <div key={feature.title} className="flex items-start space-x-4">
                  <div className="bg-[#C19A6B]/10 p-3 rounded-lg flex-shrink-0">
                    <span className="text-2xl" role="img" aria-label={feature.title}>
                      {feature.emoji}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#2C1810] mb-1">{feature.title}</h3>
                    <p className="text-sm text-[#2C1810]/60">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}