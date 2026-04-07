
interface BoulangerieInfo {
  nom?:           string;
  adresse?:       string | null;
  ville?:         string | null;
  code_postal?:   string | null;
  telephone?:     string | null;
  email_contact?: string | null;
  vitrine?: {
    horaires?: { day: string; hours: string }[] | null;
  } | null;
}

interface FooterProps {
  boulangerie?: BoulangerieInfo;
}

export default function Footer({ boulangerie }: FooterProps) {
  const nom          = boulangerie?.nom ?? 'Boulangerie Artisanale';
  const adresse      = boulangerie?.adresse ?? null;
  const ville        = boulangerie?.ville ?? null;
  const codePostal   = boulangerie?.code_postal ?? null;
  const telephone    = boulangerie?.telephone ?? null;
  const emailContact = boulangerie?.email_contact ?? null;
  const openingHours = boulangerie?.vitrine?.horaires ?? null;
  const telFormatted = telephone?.replace(/\s/g, '').replace(/^\+33/, '0033') ?? null;

  return (
    <footer
      id="contact"
      className="bg-[#2C1810] text-white py-16 px-4 sm:px-6 lg:px-8"
      itemScope
      itemType="https://schema.org/Bakery"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-12 mb-12">

          {/* Colonne 1 — Identité */}
          <div>
            <h2
              className="text-2xl font-bold mb-4 text-[#C19A6B]"
              style={{ fontFamily: 'Playfair Display, serif' }}
              itemProp="name"
            >
              {nom}
            </h2>
            {ville && (
              <p className="text-white/30 text-xs uppercase tracking-widest mb-4">
                Boulangerie artisanale · {ville}
              </p>
            )}
            <p className="text-white/70 leading-relaxed" itemProp="description">
              Pains au levain naturel, viennoiseries pur beurre, pâtisseries artisanales.
              Commandez en ligne, retirez en boutique.
            </p>
          </div>

          {/* Colonne 2 — Horaires */}
          {openingHours && openingHours.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-6 text-[#C19A6B]" style={{ fontFamily: 'Playfair Display, serif' }}>
                Horaires d'Ouverture
              </h3>
              <div className="space-y-3">
                {openingHours.map(schedule => (
                  <div key={schedule.day} className="flex items-start space-x-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C19A6B] mt-0.5 flex-shrink-0" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                    <div>
                      <p className="font-medium text-sm">{schedule.day}</p>
                      <p className="text-white/70 text-sm">{schedule.hours}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Colonne 3 — Contact dynamique */}
          <div>
            <h3 className="text-xl font-semibold mb-6 text-[#C19A6B]" style={{ fontFamily: 'Playfair Display, serif' }}>
              Nous Contacter
            </h3>
            <address className="not-italic space-y-4 text-white/70">
              {/* Adresse */}
              {adresse && (
                <div className="flex items-start space-x-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C19A6B] mt-1 flex-shrink-0" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <p itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                    <span itemProp="streetAddress">{adresse}</span><br />
                    {codePostal && <><span itemProp="postalCode">{codePostal}</span>{' '}</>}
                    {ville && <><span itemProp="addressLocality">{ville}</span>, </>}
                    <span itemProp="addressCountry">France</span>
                  </p>
                </div>
              )}

              {/* Téléphone */}
              {telephone && telFormatted && (
                <div className="flex items-center space-x-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C19A6B] flex-shrink-0" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.05 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <a href={`tel:${telFormatted}`} className="hover:text-[#C19A6B] transition-colors" itemProp="telephone">
                    {telephone}
                  </a>
                </div>
              )}

              {/* Email */}
              {emailContact && (
                <div className="flex items-center space-x-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C19A6B] flex-shrink-0" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                  <a href={`mailto:${emailContact}`} className="hover:text-[#C19A6B] transition-colors" itemProp="email">
                    {emailContact}
                  </a>
                </div>
              )}

              {/* Message si aucun contact renseigné */}
              {!adresse && !telephone && !emailContact && (
                <p className="text-white/30 text-sm italic">
                  Coordonnées bientôt disponibles
                </p>
              )}
            </address>

          </div>
        </div>

        {/* Bas de page */}
        <div className="border-t border-white/10 pt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/60 text-sm text-center sm:text-left">
              © {new Date().getFullYear()} {nom}. Tous droits réservés.
            </p>
            <nav aria-label="Liens légaux" className="flex gap-4 text-white/40 text-xs">
              <span>Paiement sur place uniquement</span>
              <span>·</span>
              <span>Click & Collect gratuit</span>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}