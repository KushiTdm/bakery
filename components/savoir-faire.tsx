// components/savoir-faire.tsx
// Server Component — rendu côté serveur, indexé par Google.
// Optimisations SEO :
//   - Structure H2 / H3 cohérente avec les mots-clés
//   - Attributs alt détaillés sur les images
//   - Balisage sémantique <article>, <section>
//   - Texte riche en termes recherchés (levain, farine, artisan)

const features = [
  {
    emoji: '🌾',
    title: 'Farines du Moulin',
    description:
      'Sélection rigoureuse de farines bio Label Rouge issues de moulins partenaires ' +
      'de la région. Farine T65 de tradition française, sans additif ni améliorant.',
  },
  {
    emoji: '⏱️',
    title: 'Fermentation 24h',
    description:
      'Pétrissage lent et fermentation naturelle au levain sur 24 heures minimum. ' +
      'Un processus artisanal qui développe les arômes et facilite la digestion.',
  },
  {
    emoji: '🏆',
    title: 'Savoir-Faire Artisan',
    description:
      'Techniques boulangères transmises depuis 1952. Façonnage à la main, ' +
      'cuisson sur sole réfractaire à 250°C pour une croûte croustillante parfaite.',
  },
  {
    emoji: '❤️',
    title: 'Passion du Pain Français',
    description:
      "L'amour du pain de qualité et de la pâtisserie créative au cœur de notre métier. " +
      'Chaque fournée, une histoire d\'artisan.',
  },
];

export default function SavoirFaire() {
  return (
    <section
      id="notre-histoire"
      className="py-20 px-4 sm:px-6 lg:px-8 bg-white"
      aria-labelledby="savoir-faire-title"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Image principale — alt riche */}
          <div>
            <img
              src="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80"
              alt="Boulanger artisan façonnant une baguette tradition à la main — L'Artisan Doré Paris"
              className="rounded-lg shadow-2xl w-full h-[600px] object-cover"
              loading="lazy"
              width={800}
              height={600}
            />
          </div>

          {/* Contenu textuel — H2 avec mot-clé */}
          <article>
            <p className="text-[#C19A6B] text-xs font-medium tracking-[0.3em] uppercase mb-3">
              Notre histoire · Paris depuis 1952
            </p>

            <h2
              id="savoir-faire-title"
              className="text-4xl sm:text-5xl font-bold text-[#2C1810] mb-6"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Boulangerie artisanale <br className="hidden sm:block" />
              au levain naturel
            </h2>

            <p className="text-lg text-[#2C1810]/70 mb-6 leading-relaxed">
              Depuis 1952, notre boulangerie artisanale perpétue l&apos;art traditionnel du pain français
              au cœur de Paris. Chaque matin, avant l&apos;aube, nos boulangers pétrisent, façonnent
              et cuisent avec passion des pains au levain naturel et des pâtisseries délicates.
            </p>

            <p className="text-lg text-[#2C1810]/70 mb-10 leading-relaxed">
              Notre engagement : farines issues de meuniers locaux, levain naturel de 15 ans
              rafraîchi quotidiennement, et fermentation longue qui donne à nos pains leur goût
              authentique, leur texture alvéolée et leur excellente digestibilité.
            </p>

            {/* Features — H3 pour la hiérarchie */}
            <div className="grid sm:grid-cols-2 gap-6">
              {features.map(feature => (
                <div key={feature.title} className="flex items-start space-x-4">
                  <div className="bg-[#C19A6B]/10 p-3 rounded-lg flex-shrink-0" aria-hidden="true">
                    <span className="text-2xl">{feature.emoji}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#2C1810] mb-1 text-sm">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-[#2C1810]/60 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}