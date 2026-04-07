/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  turbopack: {
    root: __dirname,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referrer
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS — 2 ans, preload-ready
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Permissions API navigateur
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          // CSP
          // Remarques :
          //   - 'unsafe-inline' + 'unsafe-eval' sur script-src sont requis par Next.js 14 (hydration)
          //   - *.supabase.co couvre la DB, Auth, Storage et Realtime (wss://)
          //   - api.z.ai = IA Levain (proxy côté serveur uniquement, mais Next.js peut en avoir besoin en SSR)
          //   - api.open-meteo.com = météo
          //   - js.stripe.com anticipé pour le futur checkout (P0-1 roadmap)
          //   - fonts.googleapis.com + fonts.gstatic.com = Google Fonts (Playfair Display, Montserrat)
          //   - images.unsplash.com dans connect-src car le Service Worker les intercepte via fetch()
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              // Google Fonts injecte une feuille de style via <link> → doit être autorisé
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Images : Supabase Storage + Unsplash (wildcard pour CDN) + data/blob pour previews
              "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.unsplash.com",
              // Fonts : Google Fonts CDN (fichiers woff2) + data URIs
              "font-src 'self' data: https://fonts.gstatic.com",
              // Connexions : Supabase (HTTPS + WSS), IA, météo, Stripe, Resend
              // + Unsplash : le Service Worker intercepte les fetch() d'images → connect-src requis
              [
                "connect-src 'self'",
                "https://*.supabase.co",
                "wss://*.supabase.co",
                "https://api.z.ai",
                "https://api.open-meteo.com",
                "https://api.stripe.com",
                "https://api.resend.com",
                "https://images.unsplash.com",
                "https://*.unsplash.com",
              ].join(' '),
              // Stripe Checkout est dans un iframe — DENY global mais on autorise Stripe
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          // DNS prefetch activé (perf, pas de risque sécurité ici)
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;