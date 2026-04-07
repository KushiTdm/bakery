// components/savoir-faire.tsx
// Server Component — rendu côté serveur, indexé par Google.

interface SavoirFaireProps {
  histoire?: string | null;
  nom?:      string | null;
}

const DEFAULT_HISTOIRE =
  "Chaque matin, avant l'aube, nos boulangers pétrisent, façonnent " +
  "et cuisent avec passion des pains au levain naturel et des pâtisseries délicates. " +
  "Notre engagement : farines issues de meuniers locaux, levain naturel " +
  "rafraîchi quotidiennement, et fermentation longue qui donne à nos pains " +
  "leur goût authentique et leur excellente digestibilité.";

export default function SavoirFaire({ histoire, nom }: SavoirFaireProps) {
  const bakName = nom ?? 'Notre Boulangerie';
  const texte   = histoire || DEFAULT_HISTOIRE;

  return (
    <section
      id="notre-histoire"
      className="py-20 px-4 sm:px-6 lg:px-8 bg-white"
      aria-labelledby="savoir-faire-title"
    >
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-[#C19A6B] text-xs font-medium tracking-[0.3em] uppercase mb-3">
          Notre histoire
        </p>

        <h2
          id="savoir-faire-title"
          className="text-4xl sm:text-5xl font-bold text-[#2C1810] mb-8"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          {bakName}
        </h2>

        <p className="text-lg text-[#2C1810]/70 leading-relaxed whitespace-pre-line">
          {texte}
        </p>
      </div>
    </section>
  );
}
