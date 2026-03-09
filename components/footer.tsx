'use client';

import { motion } from 'framer-motion';
import { MapPin, Clock, Phone, Mail, Facebook, Instagram } from 'lucide-react';

export default function Footer() {
  const socialLinks = [
    { icon: Facebook, href: '#', label: 'Facebook' },
    { icon: Instagram, href: '#', label: 'Instagram' },
  ];

  const openingHours = [
    { day: 'Lundi - Vendredi', hours: '6h30 - 20h00' },
    { day: 'Samedi', hours: '7h00 - 20h00' },
    { day: 'Dimanche', hours: '7h00 - 13h00' },
  ];

  return (
    <footer id="contact" className="bg-[#2C1810] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-2xl font-bold mb-6 text-[#C19A6B]">
              L'Artisan Doré
            </h3>
            <p className="text-white/70 leading-relaxed">
              Votre boulangerie artisanale au cœur de Paris, où tradition et
              qualité se rencontrent chaque jour pour votre plus grand plaisir.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h4 className="text-xl font-semibold mb-6 text-[#C19A6B]">
              Horaires d'Ouverture
            </h4>
            <div className="space-y-3">
              {openingHours.map((schedule) => (
                <div key={schedule.day} className="flex items-start space-x-3">
                  <Clock size={20} className="text-[#C19A6B] mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{schedule.day}</p>
                    <p className="text-white/70 text-sm">{schedule.hours}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h4 className="text-xl font-semibold mb-6 text-[#C19A6B]">
              Nous Contacter
            </h4>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <MapPin size={20} className="text-[#C19A6B] mt-1 flex-shrink-0" />
                <p className="text-white/70">
                  42 Rue de la Boulangerie
                  <br />
                  75001 Paris, France
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <Phone size={20} className="text-[#C19A6B]" />
                <p className="text-white/70">+33 1 42 86 95 22</p>
              </div>
              <div className="flex items-center space-x-3">
                <Mail size={20} className="text-[#C19A6B]" />
                <p className="text-white/70">contact@artisandore.fr</p>
              </div>
              <div className="flex space-x-4 mt-6">
                {socialLinks.map((social) => (
                  <motion.a
                    key={social.label}
                    href={social.href}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    className="bg-[#C19A6B] p-3 rounded-full hover:bg-[#8B4513] transition-colors duration-300"
                    aria-label={social.label}
                  >
                    <social.icon size={20} />
                  </motion.a>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="border-t border-white/10 pt-8 text-center text-white/60 text-sm"
        >
          <p>
            © {new Date().getFullYear()} L'Artisan Doré. Tous droits réservés.
            Fait avec passion à Paris.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}
