/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },

  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              // Images : Supabase Storage + URLs externes de produits + data/blob pour previews
              "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
              "font-src 'self' data:",
              // Connexions : Supabase (HTTPS + WSS), IA, météo, Stripe, Resend
              [
                "connect-src 'self'",
                "https://*.supabase.co",
                "wss://*.supabase.co",
                "https://api.z.ai",
                "https://api.open-meteo.com",
                "https://api.stripe.com",
                "https://api.resend.com",
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