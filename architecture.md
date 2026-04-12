# Architecture complète du Projet BakeryOS

> Généré le 12/04/2026 - Arborescence EXHAUSTIVE
> Total: 91 répertoires / 257 fichiers

```
project-boulangerie/
├── .claude/
│   └── settings.local.json
├── .env
├── .eslintrc.json
├── .github/
│   └── workflows/
│       ├── workflows/
│       │   └── test.yml
│       ├── readme.md
│       └── playwright.yml
├── .gitignore
├── aides.md
├── architecture.md
├── BakeryOS_Strategie_Commerciale.docx
├── certificates/
│   ├── localhost-key.pem
│   └── localhost.pem
├── components.json
├── ia.md
├── netlify.toml
├── next-env.d.ts
├── next.config.js
├── package-lock.json
├── package.json
├── pitch.md
├── playwright.config.ts
├── postcss.config.js
├── proposition-fidelite.md
├── proxy.ts
├── publicite.md
├── rapport.md
├── README.md
├── rgpd-cnil-2026.md
├── roadmap.md
├── securite-developpement-web-2026.md
├── SECURITY_REPORT.md
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.tsbuildinfo
├── UI.md
├── user_metier.md
│
├── 📁 app/                    ✅ Application Next.js 15 (App Router)
│   ├── error.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   ├── sitemap.xml
│   │
│   ├── 📁 activer/
│   │   └── page.tsx
│   │
│   ├── 📁 api/
│   │   ├── 📁 boulanger/
│   │   │   ├── 📁 ai/
│   │   │   │   ├── 📁 appliquer/    └── route.ts
│   │   │   │   ├── 📁 historique/   └── route.ts
│   │   │   │   ├── 📁 rapport/      └── route.ts
│   │   │   │   └── 📁 today/        └── route.ts
│   │   │   ├── 📁 auth/             └── route.ts
│   │   │   ├── 📁 clients/
│   │   │   │   ├── 📁 [email]/
│   │   │   │   │   └── 📁 debloquer/ └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── 📁 commandes/        └── route.ts
│   │   │   ├── 📁 dashboard-supervision/ └── route.ts
│   │   │   ├── 📁 equipe/
│   │   │   │   ├── 📁 [id]/         └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── 📁 export/           └── route.ts
│   │   │   ├── 📁 flash/            └── route.ts
│   │   │   ├── 📁 historique/       └── route.ts
│   │   │   ├── 📁 journee/
│   │   │   │   ├── 📁 feedback/     └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── 📁 precommandes/     └── route.ts
│   │   │   ├── 📁 produits/
│   │   │   │   ├── 📁 upload/       └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── 📁 profil/           └── route.ts
│   │   │   ├── 📁 rejoindre/        └── route.ts
│   │   │   └── 📁 vitrine/
│   │   │       └── 📁 upload/       └── route.ts
│   │   │
│   │   ├── 📁 boulangerie/
│   │   │   └── 📁 [slug]/           └── route.ts
│   │   ├── 📁 catalogue/
│   │   │   └── 📁 [slug]/           └── route.ts
│   │   ├── 📁 client/
│   │   │   ├── 📁 commandes/
│   │   │   │   ├── 📁 [id]/         └── route.ts
│   │   │   │   └── route.ts
│   │   │   └── 📁 profil/           └── route.ts
│   │   ├── 📁 notifications/
│   │   │   ├── 📁 send/             └── route.ts
│   │   │   ├── 📁 subscribe/        └── route.ts
│   │   │   └── 📁 test/             └── route.ts
│   │   ├── 📁 orders/
│   │   │   ├── 📁 [id]/             └── route.ts
│   │   │   ├── 📁 confirm-email/    └── route.ts
│   │   │   └── route.ts
│   │   └── 📁 paniers/
│   │       └── 📁 [slug]/
│   │           ├── 📁 acheter/       └── route.ts
│   │           └── route.ts
│   │
│   ├── 📁 auth/
│   │   └── 📁 callback/             └── route.ts
│   │
│   ├── 📁 boulanger/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── 📁 commandes/            └── page.tsx
│   │   └── 📁 rejoindre/            └── page.tsx
│   │
│   └── 📁 reset-password/           └── page.tsx
│
├── 📁 components/             ✅ Composants React
│   ├── auth-modal.tsx
│   ├── cart-sidebar.tsx
│   ├── click-collect.tsx
│   ├── client-push-toggle.tsx
│   ├── client-space.tsx
│   ├── FlashBanner.tsx
│   ├── flash-section.tsx
│   ├── footer.tsx
│   ├── galerie.tsx
│   ├── hero-cta.tsx
│   ├── hero.tsx
│   ├── ingredients.tsx
│   ├── landing-client.tsx
│   ├── Loadingscreen.tsx
│   ├── navbar.tsx
│   ├── product-card.tsx
│   ├── savoir-faire.tsx
│   ├── sw-register.tsx
│   │
│   ├── 📁 boulanger/
│   │   ├── catalogue-starter.tsx
│   │   ├── catalogue.tsx
│   │   ├── dashboard-supervision.tsx
│   │   ├── dashboard.tsx
│   │   ├── day-countdown.tsx
│   │   ├── equipe-manager.tsx
│   │   ├── feedback-vendeuse.tsx
│   │   ├── fin-journee-modal.tsx
│   │   ├── gestion-clients.tsx
│   │   ├── login-form.tsx
│   │   ├── onboarding-wizard.tsx
│   │   ├── parametres.tsx
│   │   ├── produit-form-modal.tsx
│   │   ├── push-notification-toggle.tsx
│   │   ├── tour-wizard.tsx
│   │   ├── upgrade-modal.tsx
│   │   ├── vitrine-editor.tsx
│   │   ├── vue-flash.tsx
│   │   ├── vue-journee.tsx
│   │   ├── vue-matin.tsx
│   │   ├── vue-rapport-ia.tsx
│   │   ├── vue-sandwichs.tsx
│   │   ├── vue-snapshot.tsx
│   │   ├── vue-soir.tsx
│   │   ├── wizard-pre-rapport.tsx
│   │   └── workflow-guard.tsx
│   │
│   ├── 📁 seo/
│   │   └── json-ld.tsx
│   │
│   └── 📁 ui/                  ✅ shadcn/ui Components
│       ├── badge.tsx
│       ├── button.tsx
│       ├── calendar.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── form.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── select.tsx
│       ├── skeleton.tsx
│       ├── table.tsx
│       ├── textarea.tsx
│       ├── toast.tsx
│       ├── toaster.tsx
│       └── toggle.tsx
│
├── 📁 context/                ✅ Contextes React
│   ├── active-tab-context.tsx
│   ├── boulanger-context.tsx
│   └── cart-context.tsx
│
├── 📁 hooks/                  ✅ Hooks personnalisés
│   ├── use-flash-paniers.ts
│   ├── use-produits-boulanger.ts
│   ├── use-push-notifications.ts
│   ├── use-slug.ts
│   ├── use-toast.ts
│   ├── use-tour.ts
│   └── use-workflow-journee.ts
│
├── 📁 levain_AI/              ✅ Documentation IA
│   ├── chatgpt.md
│   ├── claude.md
│   ├── gemini.md
│   ├── grok.md
│   └── perplexity.md
│
├── 📁 lib/                    ✅ Logiques métier
│   ├── ai-anonymize.ts
│   ├── audit.ts
│   ├── auth-boulanger.ts
│   ├── products.ts
│   ├── rate-limit.ts
│   ├── resolve-slug.ts
│   ├── sanitize.ts
│   ├── send-order-email.ts
│   ├── supabase.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── weather.ts
│   └── workflow.ts
│
├── 📁 migrations/             ✅ Base de données
│   ├── migration-complete.sql
│   └── seed.sql
│
├── 📁 playwright-report/
│   └── index.html
│
├── 📁 public/                 ✅ Assets statiques
│   ├── manifest.json
│   ├── robots.txt
│   ├── sw.js
│   │
│   ├── 📁 icons/
│   │   ├── apple-touch-icon.png
│   │   ├── favicon.ico
│   │   ├── icon-72x72.png
│   │   ├── icon-96x96.png
│   │   ├── icon-128x128.png
│   │   ├── icon-144x144.png
│   │   ├── icon-152x152.png
│   │   ├── icon-192x192.png
│   │   ├── icon-384x384.png
│   │   ├── icon-512x512.png
│   │   └── icon.svg
│   │
│   └── 📁 products/
│       ├── BaguetteTradition.jpg
│       ├── Croissant.png
│       ├── Eclair_au_chocolat.png
│       ├── Pain_au_cereales.png
│       ├── Pain_de_campagne.png
│       └── Tarte_au_citron.png
│
├── 📁 scripts/                ✅ Scripts utilitaires
│   ├── debug-rpc.ts
│   ├── generate-icons.js
│   ├── test-levain-artisan.mjs
│   ├── test-levain.mjs
│   └── test-push.js
│
├── 📁 test-results/
│   └── .last-run.json
│
├── 📁 tests/                  ✅ Suite de tests
│   ├── tests.md
│   │
│   ├── 📁 auth/
│   ├── 📁 conservation/
│   ├── 📁 e2e/
│   ├── 📁 equipe/
│   ├── 📁 fixtures/
│   ├── 📁 helpers/
│   ├── 📁 ia/
│   ├── 📁 journee/
│   ├── 📁 penalites/
│   ├── 📁 security/
│   ├── 📁 stock/
│   └── 📁 unit/
│
├── 📁 tmp/
│
└── 📁 z claude_project/       ✅ Documentation interne
    ├── 00_INSTRUCTIONS_CLAUDE.md
    ├── 01_ARCHITECTURE.md
    ├── 01_SECURITE_CODE.md
    ├── 02_ACQUISITION_CLIENTS.md
    ├── 02_SECURITE.md
    ├── 03_COMMERCIAL.md
    ├── 03_CONTENU_MARKETING.md
    ├── 04_MARKETING.md
    ├── 04_PROMPTS_DEVELOPPEMENT.md
    ├── 05_ROADMAP.md
    └── 06_PROMPTS_IA.md
```

---

## 📊 Statistiques du projet
| Catégorie | Valeur |
|---|---|
| Nombre total de répertoires | 91 |
| Nombre total de fichiers | 257 |
| Lignes de code estimées | ~ 26 200 lignes |

## 🛠 Stack Technique
✅ **Framework**: Next.js 15 App Router
✅ **Langage**: TypeScript 5
✅ **UI**: shadcn/ui + Tailwind CSS 4
✅ **Base de données**: Supabase PostgreSQL
✅ **Tests**: Playwright
✅ **PWA**: Service Worker intégré
✅ **CI/CD**: Github Actions
✅ **Hébergement**: Netlify