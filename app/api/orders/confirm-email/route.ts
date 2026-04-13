// app/api/orders/confirm-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase';

// ── Initialisation Resend ──────────────────────────────────────

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? '');
}

// ── Schéma Zod ────────────────────────────────────────────────

const LigneSchema = z.object({
  produit_id:    z.string().min(1).max(100),
  produit_nom:   z.string().min(1).max(100),
  quantite:      z.number().int().min(1).max(999),
  prix_unitaire: z.number().min(0).max(9999),
});

const ConfirmEmailSchema = z.object({
  commande_id:   z.string().uuid(),
  client_prenom: z.string().min(1).max(50),
  client_email:  z.string().email(),
  heure_retrait: z.string().regex(/^\d{2}:\d{2}$/, 'Format heure invalide (HH:MM)'),
  lignes:        z.array(LigneSchema).min(1).max(50),
  montant_total: z.number().min(0).max(99999),
});

type ConfirmEmailPayload = z.infer<typeof ConfirmEmailSchema>;

// ── Helpers ───────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

// ── Handler principal ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Validation du secret interne
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  const providedSecret = req.headers.get('x-internal-secret');

  if (!expectedSecret) {
    console.error('[orders/confirm-email] INTERNAL_API_SECRET non configuré');
    return NextResponse.json({ error: 'Configuration serveur incorrecte' }, { status: 503 });
  }

  if (expectedSecret.length < 32) {
    console.error('[orders/confirm-email] INTERNAL_API_SECRET trop court (minimum 32 caractères)');
    return NextResponse.json({ error: 'Configuration serveur incorrecte' }, { status: 503 });
  }

  if (!providedSecret || !timingSafeEqual(expectedSecret, providedSecret)) {
    console.error('[orders/confirm-email] Accès refusé : secret invalide');
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // 2. Parsing JSON sécurisé
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  // 3. Validation Zod
  const parsed = ConfirmEmailSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data: ConfirmEmailPayload = parsed.data;

  try {
    const supabase = getSupabaseAdmin();

    // 4. Récupérer la commande
    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select('boulangerie_id')
      .eq('id', data.commande_id)
      .single();

    if (cmdError || !commande) {
      console.error('[orders/confirm-email] Commande non trouvée');
      return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 });
    }

    // 5. Récupérer les infos boulangerie
    const { data: boulangerie, error: boulError } = await supabase
      .from('boulangeries')
      .select('nom, adresse, ville, code_postal, telephone')
      .eq('id', commande.boulangerie_id)
      .single();

    if (boulError || !boulangerie) {
      console.error('[orders/confirm-email] Boulangerie non trouvée');
      return NextResponse.json({ error: 'Boulangerie non trouvée' }, { status: 404 });
    }

    // 6. Recalcul serveur du montant total
    const montantRecalcule = data.lignes.reduce(
      (sum, l) => sum + l.quantite * l.prix_unitaire,
      0
    );

    const adresseComplete = [
      boulangerie.adresse,
      boulangerie.code_postal,
      boulangerie.ville,
    ]
      .filter(Boolean)
      .join(', ');

    const shortId = data.commande_id.slice(0, 8).toUpperCase();

    // ── Lignes produits HTML ─────────────────────────────────

    const produitsHtml = data.lignes
      .map(l => `
        <tr>
          <td style="padding:12px 0; border-bottom:1px solid rgba(196,136,42,0.15); font-family:'Outfit',Arial,sans-serif; font-size:14px; color:#4A2C1A; font-weight:400;">
            ${escapeHtml(l.produit_nom)}
          </td>
          <td style="padding:12px 0; border-bottom:1px solid rgba(196,136,42,0.15); font-family:'Outfit',Arial,sans-serif; font-size:14px; color:#7A5240; text-align:center; font-weight:500;">
            ×&thinsp;${l.quantite}
          </td>
          <td style="padding:12px 0; border-bottom:1px solid rgba(196,136,42,0.15); font-family:'Outfit',Arial,sans-serif; font-size:14px; color:#7A5240; text-align:right;">
            ${formatPrice(l.prix_unitaire)}
          </td>
          <td style="padding:12px 0; border-bottom:1px solid rgba(196,136,42,0.15); font-family:'Outfit',Arial,sans-serif; font-size:14px; color:#1C0F07; text-align:right; font-weight:600;">
            ${formatPrice(l.quantite * l.prix_unitaire)}
          </td>
        </tr>`)
      .join('');

    const produitsText = data.lignes
      .map(l => `  ${l.quantite}× ${l.produit_nom}  ${formatPrice(l.quantite * l.prix_unitaire)}`)
      .join('\n');

    const subject = `Votre commande est enregistrée — ${boulangerie.nom}`;

    // ── Template HTML Sauve Mie ──────────────────────────────

    const htmlContent = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Gloock&display=swap" rel="stylesheet" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Gloock&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background-color: #F3EBE0; }
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 12px !important; }
      .header-pad { padding: 36px 24px 28px !important; }
      .body-pad { padding: 28px 20px !important; }
      .footer-pad { padding: 20px !important; }
      .product-table td { font-size: 13px !important; padding: 10px 0 !important; }
      .retrait-block { padding: 20px !important; }
      .total-row td { font-size: 16px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F3EBE0; -webkit-font-smoothing:antialiased;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F3EBE0;">
    <tr>
      <td class="email-wrapper" style="padding:32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#FAF6EF; border-radius:20px; overflow:hidden; box-shadow:0 4px 32px rgba(28,15,7,0.10);">

          <!-- ══ HEADER ══ -->
          <tr>
            <td class="header-pad" style="background-color:#1C0F07; padding:44px 40px 36px; text-align:center;">

              <div style="margin-bottom:20px;">
                <svg width="40" height="56" viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; opacity:0.85; transform:rotate(-12deg);">
                  <ellipse cx="20" cy="28" rx="16" ry="24" fill="none" stroke="#C4882A" stroke-width="1.5"/>
                  <line x1="20" y1="10" x2="20" y2="46" stroke="#C4882A" stroke-width="1" opacity="0.6"/>
                  <line x1="11" y1="18" x2="29" y2="22" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                  <line x1="10" y1="28" x2="30" y2="28" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                  <line x1="11" y1="38" x2="29" y2="34" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                </svg>
              </div>

              <h1 style="margin:0 0 4px; font-family:'Gloock',Georgia,serif; font-size:30px; font-weight:400; color:#FAF6EF; letter-spacing:-0.3px; line-height:1.1;">
                ${escapeHtml(boulangerie.nom)}
              </h1>

              <div style="width:40px; height:1px; background-color:#C4882A; margin:14px auto 0;"></div>

              <div style="margin-top:18px; display:inline-block;">
                <span style="display:inline-block; background:rgba(196,136,42,0.18); border:1px solid rgba(196,136,42,0.4); color:#C4882A; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; padding:5px 14px; border-radius:100px;">
                  Click &amp; Collect
                </span>
              </div>

            </td>
          </tr>

          <!-- ══ BODY ══ -->
          <tr>
            <td class="body-pad" style="padding:36px 40px;">

              <p style="margin:0 0 6px; font-family:'Outfit',Arial,sans-serif; font-size:13px; font-weight:400; color:#A8876E; letter-spacing:0.5px; text-transform:uppercase;">
                Bonjour,
              </p>
              <h2 style="margin:0 0 20px; font-family:'Gloock',Georgia,serif; font-size:22px; font-weight:400; color:#1C0F07; line-height:1.3;">
                ${escapeHtml(data.client_prenom)}
              </h2>

              <p style="margin:0 0 28px; font-family:'Outfit',Arial,sans-serif; font-size:15px; font-weight:300; color:#4A2C1A; line-height:1.7;">
                Votre commande a bien été enregistrée et sera prête à l'heure convenue. Il ne vous reste plus qu'à passer récupérer votre pain.
              </p>

              <!-- Titre section -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
                <tr>
                  <td style="padding-bottom:12px; border-bottom:2px solid #C4882A;">
                    <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#A8876E;">
                      Récapitulatif
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Table produits -->
              <table role="presentation" class="product-table" cellpadding="0" cellspacing="0" border="0" width="100%">
                <thead>
                  <tr>
                    <th style="padding:0 0 8px; text-align:left; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:#A8876E; border-bottom:1px solid rgba(196,136,42,0.2);">Produit</th>
                    <th style="padding:0 0 8px; text-align:center; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:#A8876E; border-bottom:1px solid rgba(196,136,42,0.2); width:40px;">Qté</th>
                    <th style="padding:0 0 8px; text-align:right; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:#A8876E; border-bottom:1px solid rgba(196,136,42,0.2); width:70px;">P.U.</th>
                    <th style="padding:0 0 8px; text-align:right; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:#A8876E; border-bottom:1px solid rgba(196,136,42,0.2); width:80px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${produitsHtml}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan="3" style="padding:16px 0 0; font-family:'Outfit',Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:#7A5240; text-align:right; padding-right:16px;">
                      Total
                    </td>
                    <td style="padding:16px 0 0; text-align:right; font-family:'Gloock',Georgia,serif; font-size:20px; color:#C4882A; font-weight:400;">
                      ${formatPrice(montantRecalcule)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <p style="margin:8px 0 32px; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:400; color:#A8876E; letter-spacing:0.5px;">
                Référence&nbsp;: <span style="font-weight:600; color:#7A5240; letter-spacing:1px;">CMD-${escapeHtml(shortId)}</span>
              </p>

              <!-- Bloc retrait -->
              <table role="presentation" class="retrait-block" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#1C0F07; border-radius:14px; overflow:hidden; margin-bottom:28px;">
                <tr>
                  <td style="padding:28px;">

                    <p style="margin:0 0 14px; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:rgba(196,136,42,0.7);">
                      Votre retrait
                    </p>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:${adresseComplete || boulangerie.telephone ? '10px' : '0'};">
                      <tr>
                        <td style="width:28px; vertical-align:middle;">
                          <span style="font-size:16px; line-height:1;">🕐</span>
                        </td>
                        <td style="vertical-align:middle; padding-left:8px;">
                          <span style="font-family:'Gloock',Georgia,serif; font-size:18px; color:#FAF6EF; font-weight:400;">
                            ${escapeHtml(data.heure_retrait)}
                          </span>
                        </td>
                      </tr>
                    </table>

                    ${adresseComplete ? `
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:${boulangerie.telephone ? '10px' : '0'};">
                      <tr>
                        <td style="width:28px; vertical-align:top; padding-top:2px;">
                          <span style="font-size:14px; line-height:1;">📍</span>
                        </td>
                        <td style="vertical-align:top; padding-left:8px;">
                          <span style="font-family:'Outfit',Arial,sans-serif; font-size:14px; color:rgba(250,246,239,0.65); line-height:1.4;">
                            ${escapeHtml(adresseComplete)}
                          </span>
                        </td>
                      </tr>
                    </table>` : ''}

                    ${boulangerie.telephone ? `
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:28px; vertical-align:middle;">
                          <span style="font-size:14px; line-height:1;">📞</span>
                        </td>
                        <td style="vertical-align:middle; padding-left:8px;">
                          <a href="tel:${escapeHtml(boulangerie.telephone)}" style="font-family:'Outfit',Arial,sans-serif; font-size:14px; color:rgba(250,246,239,0.65); text-decoration:none;">
                            ${escapeHtml(boulangerie.telephone)}
                          </a>
                        </td>
                      </tr>
                    </table>` : ''}

                  </td>
                </tr>
              </table>

              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:13px; font-weight:300; color:#A8876E; line-height:1.6; font-style:italic;">
                Donnez simplement votre nom au comptoir lors de votre passage.
              </p>

            </td>
          </tr>

          <!-- ══ FOOTER ══ -->
          <tr>
            <td class="footer-pad" style="background-color:#1C0F07; padding:24px 40px; text-align:center;">

              <div style="width:32px; height:1px; background-color:#C4882A; margin:0 auto 16px; opacity:0.6;"></div>

              <p style="margin:0 0 6px; font-family:'Outfit',Arial,sans-serif; font-size:12px; font-weight:400; color:rgba(250,246,239,0.35); line-height:1.5;">
                Cet email a été envoyé suite à votre commande sur <strong style="color:rgba(250,246,239,0.55); font-weight:500;">${escapeHtml(boulangerie.nom)}</strong>.
              </p>
              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:300; color:rgba(250,246,239,0.2);">
                En cas de problème, contactez directement la boulangerie.
              </p>

            </td>
          </tr>

          <tr>
            <td style="height:3px; background:linear-gradient(90deg, transparent 0%, #C4882A 30%, #C4882A 70%, transparent 100%);"></td>
          </tr>

        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:16px auto 0;">
          <tr>
            <td style="text-align:center;">
              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:400; color:rgba(28,15,7,0.3); letter-spacing:1px;">
                Propulsé par <span style="color:#C4882A; letter-spacing:0.5px;">Sauve Mie</span> · Moins de pain gaspillé, plus de clients.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

    const textContent = `
${boulangerie.nom}
${'─'.repeat(40)}

Bonjour ${data.client_prenom},

Votre commande a bien été enregistrée.

RÉCAPITULATIF
${'─'.repeat(40)}
${produitsText}
${'─'.repeat(40)}
TOTAL  ${formatPrice(montantRecalcule)}

Référence : CMD-${shortId}

RETRAIT
${'─'.repeat(40)}
Heure    : ${data.heure_retrait}
${adresseComplete ? `Adresse  : ${adresseComplete}` : ''}
${boulangerie.telephone ? `Téléphone: ${boulangerie.telephone}` : ''}

Donnez simplement votre nom au comptoir.

À très bientôt,
${boulangerie.nom}

──
Propulsé par Sauve Mie · Moins de pain gaspillé, plus de clients.
`.trim();

    // 8. Envoi via Resend (avec 1 retry automatique)
    const fromAddress = process.env.RESEND_FROM_DOMAIN
      ? `${boulangerie.nom} <noreply@${process.env.RESEND_FROM_DOMAIN}>`
      : 'onboarding@resend.dev';

    const emailPayload = { from: fromAddress, to: data.client_email, subject, html: htmlContent, text: textContent };

    let emailResult: { id?: string } | null = null;
    let emailError: { name: string; message: string } | null = null;

    const resend = getResend();
    const firstAttempt = await resend.emails.send(emailPayload);
    if (firstAttempt.error) {
      console.warn('[orders/confirm-email] 1ère tentative échouée, retry dans 1s :', firstAttempt.error);
      await new Promise(r => setTimeout(r, 1000));
      const retry = await resend.emails.send(emailPayload);
      emailError  = retry.error;
      emailResult = retry.data;
    } else {
      emailResult = firstAttempt.data;
    }

    if (emailError) {
      console.error('[orders/confirm-email] Erreur Resend après retry :', JSON.stringify(emailError));
      return NextResponse.json(
        { error: "Erreur lors de l'envoi de l'email" },
        { status: 500 }
      );
    }

    console.log('[orders/confirm-email] Email envoyé avec succès');
    return NextResponse.json({ success: true, email_id: emailResult?.id });

  } catch (err) {
    console.error('[orders/confirm-email] Erreur serveur inattendue');
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}