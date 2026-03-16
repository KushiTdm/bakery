# Audit Sécurité Routes BakeryOS

## Vulnérabilités identifiées

### 🔴 CRITIQUE

| Route | Problème | Correctif |
|---|---|---|
| `/api/orders/route.ts` | `lignes` JSONB non sanitisé (injections via produit_nom, prix_unitaire non bornés) | Validation Zod renforcée + sanitizeText sur produit_nom |
| `/api/boulanger/profil` PATCH | `nom`, `email_contact` non sanitisés avant update DB | sanitizeText() ajouté |
| `/api/orders/[id]/route.ts` | `params.id` non validé UUID avant requête | isValidUUID() ajouté |

### 🟡 MOYEN

| Route | Problème | Correctif |
|---|---|---|
| `/api/boulanger/journee` POST | `commandesOnline` non borné (peut être négatif ou > 999999) | Math.max(0, Math.min(...)) |
| `/api/boulanger/historique` GET | `limit` param peut être NaN | parseInt + isNaN check |
| `/api/catalogue/[slug]` | Slug non normalisé côté server (seulement trimLowercase, pas regex) | SLUG_REGEX validation |
| `/api/paniers/[slug]` | Idem slug | SLUG_REGEX validation |

### 🟢 OK (déjà sanitisés)

- `/api/boulanger/produits` ✅ (lib/sanitize.ts + Zod)
- `/api/boulanger/produits/upload` ✅ (UUID validation + MIME check + taille)
- `/api/boulanger/auth` ✅ (Zod implicite + password length check)
- `/api/boulanger/airtable` ✅ (proxy server-side, clés jamais exposées)
- `/api/client/profil` ✅ (Zod ProfilSchema)
- `/api/notifications/subscribe` ✅ (endpoint TEXT, pas injectable)