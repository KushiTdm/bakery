// components/footer.tsx
// Server Component — rendu côté serveur.
// Optimisations SEO :
//   - Balise <address> pour les infos de contact (crawlable)
//   - Numéro de téléphone en format tel: (cliquable + indexable)
//   - Liens internes pour le maillage
//   - aria-label sur les liens réseaux sociaux

const openingHours = [
  { day: 'Lundi — Vendredi', hours: '6h30 – 20h00', itemprop: 'Mo-Fr 06:30-20:00' },
  { day: 'Samedi',           hours: '7h00 – 20h00', itemprop: 'Sa 07:00-20:00' },
  { day: 'Dimanche',         hours: '7h00 – 13h00', itemprop: 'Su 07:00-13:00' },
];

export default function Footer() {
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
              L'Artisan Doré
            </h2>
            <p className="text-white/30 text-xs uppercase tracking-widest mb-4">
              Boulangerie artisanale · Paris · depuis 1952
            </p>
            <p className="text-white/70 leading-relaxed" itemProp="description">
              Votre boulangerie artisanale au cœur de Paris 1er, où tradition et qualité
              se rencontrent chaque jour. Pains au levain, viennoiseries pur beurre,
              pâtisseries créatives.
            </p>
          </div>

          {/* Colonne 2 — Horaires */}
          <div>
            <h3
              className="text-xl font-semibold mb-6 text-[#C19A6B]"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Horaires d'Ouverture
            </h3>
            <div className="space-y-3" itemProp="openingHours" content="Mo-Fr 06:30-20:00, Sa 07:00-20:00, Su 07:00-13:00">
              {openingHours.map(schedule => (
                <div key={schedule.day} className="flex items-start space-x-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18" height="18"
                    viewBox="0 0 24 24"
                    fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="text-[#C19A6B] mt-0.5 flex-shrink-0"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <div>
                    <p className="font-medium text-sm">{schedule.day}</p>
                    <p className="text-white/70 text-sm">{schedule.hours}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Colonne 3 — Contact */}
          <div>
            <h3
              className="text-xl font-semibold mb-6 text-[#C19A6B]"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Nous Contacter
            </h3>

            {/* Balise <address> — sémantique pour les moteurs */}
            <address className="not-italic space-y-4 text-white/70">
              <div className="flex items-start space-x-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C19A6B] mt-1 flex-shrink-0" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <p itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                  <span itemProp="streetAddress">42 Rue de la Boulangerie</span><br />
                  <span itemProp="postalCode">75001</span>{' '}
                  <span itemProp="addressLocality">Paris</span>,{' '}
                  <span itemProp="addressCountry">France</span>
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C19A6B] flex-shrink-0" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.05 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
                <a
                  href="tel:+33142869522"
                  className="hover:text-[#C19A6B] transition-colors"
                  itemProp="telephone"
                  aria-label="Appeler L'Artisan Doré"
                >
                  +33 1 42 86 95 22
                </a>
              </div>

              <div className="flex items-center space-x-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C19A6B] flex-shrink-0" aria-hidden="true">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                </svg>
                <a
                  href="mailto:contact@artisandore.fr"
                  className="hover:text-[#C19A6B] transition-colors"
                  itemProp="email"
                >
                  contact@artisandore.fr
                </a>
              </div>
            </address>

            {/* Réseaux sociaux */}
            <div className="flex space-x-4 mt-6">
              <a
                href="https://www.facebook.com/artisandore"
                aria-label="Suivre L'Artisan Doré sur Facebook"
                rel="noopener noreferrer"
                target="_blank"
                className="bg-[#C19A6B] p-3 rounded-full hover:bg-[#8B4513] transition-colors duration-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/artisandore"
                aria-label="Suivre L'Artisan Doré sur Instagram"
                rel="noopener noreferrer"
                target="_blank"
                className="bg-[#C19A6B] p-3 rounded-full hover:bg-[#8B4513] transition-colors duration-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bas de page — maillage interne */}
        <div className="border-t border-white/10 pt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/60 text-sm text-center sm:text-left">
              © {new Date().getFullYear()} L'Artisan Doré. Tous droits réservés.
              Boulangerie artisanale à Paris depuis 1952.
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