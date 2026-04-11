// lib/send-order-email.ts
// Envoi d'email de confirmation de commande via Resend.
// Appelé directement depuis /api/orders (pas de self-fetch).

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface Ligne {
  produit_nom:   string;
  quantite:      number;
  prix_unitaire: number;
}

interface SendOrderEmailParams {
  commande_id:   string;
  client_prenom: string;
  client_email:  string;
  heure_retrait: string;
  lignes:        Ligne[];
  montant_total: number;
  date_retrait?: string | null;
  boulangerie: {
    nom:         string;
    adresse:     string | null;
    ville:       string | null;
    code_postal: string | null;
    telephone:   string | null;
  };
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

export async function sendOrderConfirmationEmail(params: SendOrderEmailParams): Promise<{ success: boolean; email_id?: string; error?: string }> {
  const { commande_id, client_prenom, client_email, heure_retrait, lignes, boulangerie } = params;

  if (!process.env.RESEND_API_KEY) {
    console.error('[send-order-email] RESEND_API_KEY non configurée');
    return { success: false, error: 'RESEND_API_KEY manquante' };
  }

  const montantRecalcule = lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire, 0);
  const shortId = commande_id.slice(0, 8).toUpperCase();

  const adresseComplete = [boulangerie.adresse, boulangerie.code_postal, boulangerie.ville]
    .filter(Boolean)
    .join(', ');

  const isPreOrder = !!params.date_retrait;
  const dateRetraitFormatted = params.date_retrait
    ? new Date(params.date_retrait + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  const subject = isPreOrder
    ? `Pré-commande confirmée pour ${dateRetraitFormatted} — ${boulangerie.nom}`
    : `Votre commande est enregistrée — ${boulangerie.nom}`;

  // ── Lignes produits ────────────────────────────────────────

  const produitsHtml = lignes
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

  const produitsText = lignes
    .map(l => `  ${l.quantite}× ${l.produit_nom}  ${formatPrice(l.quantite * l.prix_unitaire)}`)
    .join('\n');

  // ── Template HTML Sauve Mie ────────────────────────────────

  const htmlContent = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Gloock&display=swap" rel="stylesheet" />
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Gloock&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background-color: #F3EBE0; }
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 12px !important; }
      .email-card { border-radius: 16px !important; }
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

  <!-- Wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F3EBE0;">
    <tr>
      <td class="email-wrapper" style="padding:32px 16px;">

        <!-- Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#FAF6EF; border-radius:20px; overflow:hidden; box-shadow:0 4px 32px rgba(28,15,7,0.10);">

          <!-- ══ HEADER ══ -->
          <tr>
            <td class="header-pad" style="background-color:#1C0F07; padding:44px 40px 36px; text-align:center; position:relative;">

              <!-- Grain mark décoratif SVG -->
              <div style="margin-bottom:20px;">
                <svg width="40" height="56" viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; opacity:0.85; transform:rotate(-12deg);">
                  <ellipse cx="20" cy="28" rx="16" ry="24" fill="none" stroke="#C4882A" stroke-width="1.5"/>
                  <line x1="20" y1="10" x2="20" y2="46" stroke="#C4882A" stroke-width="1" opacity="0.6"/>
                  <line x1="11" y1="18" x2="29" y2="22" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                  <line x1="10" y1="28" x2="30" y2="28" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                  <line x1="11" y1="38" x2="29" y2="34" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                </svg>
              </div>

              <!-- Wordmark -->
              <h1 style="margin:0 0 4px; font-family:'Gloock',Georgia,serif; font-size:30px; font-weight:400; color:#FAF6EF; letter-spacing:-0.3px; line-height:1.1;">
                ${escapeHtml(boulangerie.nom)}
              </h1>

              <!-- Ligne dorée -->
              <div style="width:40px; height:1px; background-color:#C4882A; margin:14px auto 0;"></div>

              <!-- Badge type commande -->
              <div style="margin-top:18px; display:inline-block;">
                <span style="display:inline-block; background:rgba(196,136,42,0.18); border:1px solid rgba(196,136,42,0.4); color:#C4882A; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; padding:5px 14px; border-radius:100px;">
                  ${isPreOrder ? 'Pré-commande' : 'Click &amp; Collect'}
                </span>
              </div>

            </td>
          </tr>

          <!-- ══ BODY ══ -->
          <tr>
            <td class="body-pad" style="padding:36px 40px;">

              <!-- Salutation -->
              <p style="margin:0 0 6px; font-family:'Outfit',Arial,sans-serif; font-size:13px; font-weight:400; color:#A8876E; letter-spacing:0.5px; text-transform:uppercase;">
                Bonjour,
              </p>
              <h2 style="margin:0 0 20px; font-family:'Gloock',Georgia,serif; font-size:22px; font-weight:400; color:#1C0F07; line-height:1.3;">
                ${escapeHtml(client_prenom)}
              </h2>

              <!-- Message intro -->
              <p style="margin:0 0 28px; font-family:'Outfit',Arial,sans-serif; font-size:15px; font-weight:300; color:#4A2C1A; line-height:1.7;">
                ${isPreOrder
                  ? `Votre pré-commande pour le <strong style="font-weight:600; color:#1C0F07;">${escapeHtml(dateRetraitFormatted!)}</strong> a bien été enregistrée. Nous préparerons vos produits spécialement pour vous.`
                  : `Votre commande a bien été enregistrée et sera prête à l'heure convenue. Il ne vous reste plus qu'à passer récupérer votre pain.`
                }
              </p>

              <!-- ── Récapitulatif ── -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td style="padding-bottom:12px; border-bottom:2px solid #C4882A;">
                    <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#A8876E;">
                      Récapitulatif
                    </p>
                  </td>
                </tr>
              </table>

              <!-- En-têtes colonnes -->
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

              <!-- Numéro de commande -->
              <p style="margin:8px 0 32px; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:400; color:#A8876E; letter-spacing:0.5px;">
                Référence&nbsp;: <span style="font-weight:600; color:#7A5240; letter-spacing:1px;">CMD-${escapeHtml(shortId)}</span>
              </p>

              <!-- ── Bloc retrait ── -->
              <table role="presentation" class="retrait-block" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#1C0F07; border-radius:14px; overflow:hidden; margin-bottom:28px;">
                <tr>
                  <td style="padding:28px 28px;">

                    <p style="margin:0 0 14px; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:rgba(196,136,42,0.7);">
                      Votre retrait
                    </p>

                    <!-- Heure -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:${adresseComplete || boulangerie.telephone ? '10px' : '0'};">
                      <tr>
                        <td style="width:28px; vertical-align:middle;">
                          <span style="font-size:16px; line-height:1;">🕐</span>
                        </td>
                        <td style="vertical-align:middle; padding-left:8px;">
                          <span style="font-family:'Gloock',Georgia,serif; font-size:18px; color:#FAF6EF; font-weight:400;">
                            ${escapeHtml(heure_retrait)}
                          </span>
                          ${isPreOrder && dateRetraitFormatted ? `<span style="font-family:'Outfit',Arial,sans-serif; font-size:13px; color:rgba(250,246,239,0.5); margin-left:10px;">${escapeHtml(dateRetraitFormatted)}</span>` : ''}
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

              <!-- Note bas de page -->
              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:13px; font-weight:300; color:#A8876E; line-height:1.6; font-style:italic;">
                Donnez simplement votre nom au comptoir lors de votre passage.
              </p>

            </td>
          </tr>

          <!-- ══ FOOTER ══ -->
          <tr>
            <td class="footer-pad" style="background-color:#1C0F07; padding:24px 40px; text-align:center;">

              <!-- Ligne dorée décorative -->
              <div style="width:32px; height:1px; background-color:#C4882A; margin:0 auto 16px; opacity:0.6;"></div>

              <p style="margin:0 0 6px; font-family:'Outfit',Arial,sans-serif; font-size:12px; font-weight:400; color:rgba(250,246,239,0.35); line-height:1.5;">
                Cet email a été envoyé suite à votre commande sur <strong style="color:rgba(250,246,239,0.55); font-weight:500;">${escapeHtml(boulangerie.nom)}</strong>.
              </p>
              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:300; color:rgba(250,246,239,0.2);">
                En cas de problème, contactez directement la boulangerie.
              </p>

            </td>
          </tr>

          <!-- Bordure dorée bas de card -->
          <tr>
            <td style="height:3px; background:linear-gradient(90deg, transparent 0%, #C4882A 30%, #C4882A 70%, transparent 100%);"></td>
          </tr>

        </table>

        <!-- Mention Sauve Mie -->
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

  // ── Version texte ──────────────────────────────────────────

  const textContent = `
${boulangerie.nom}
${'─'.repeat(40)}

Bonjour ${client_prenom},

${isPreOrder
  ? `Votre pré-commande pour le ${dateRetraitFormatted} a bien été enregistrée.`
  : `Votre commande a bien été enregistrée.`
}

RÉCAPITULATIF
${'─'.repeat(40)}
${produitsText}
${'─'.repeat(40)}
TOTAL  ${formatPrice(montantRecalcule)}

Référence : CMD-${shortId}

RETRAIT
${'─'.repeat(40)}
Heure    : ${heure_retrait}${isPreOrder && dateRetraitFormatted ? ` · ${dateRetraitFormatted}` : ''}
${adresseComplete ? `Adresse  : ${adresseComplete}` : ''}
${boulangerie.telephone ? `Téléphone: ${boulangerie.telephone}` : ''}

Donnez simplement votre nom au comptoir.

À très bientôt,
${boulangerie.nom}

──
Propulsé par Sauve Mie · Moins de pain gaspillé, plus de clients.
`.trim();

  const fromAddress = process.env.RESEND_FROM_DOMAIN
    ? `${boulangerie.nom} <noreply@${process.env.RESEND_FROM_DOMAIN}>`
    : 'onboarding@resend.dev';

  try {
    console.log(`[send-order-email] Envoi à ${client_email} depuis ${fromAddress}...`);

    const { data, error } = await resend.emails.send({
      from:    fromAddress,
      to:      client_email,
      subject,
      html:    htmlContent,
      text:    textContent,
    });

    if (error) {
      console.error('[send-order-email] Erreur Resend:', JSON.stringify(error));
      return { success: false, error: error.message };
    }

    console.log('[send-order-email] Email envoyé, id:', data?.id);
    return { success: true, email_id: data?.id };

  } catch (err) {
    console.error('[send-order-email] Exception:', err);
    return { success: false, error: String(err) };
  }
}