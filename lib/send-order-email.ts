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

  const produitsHtml = lignes
    .map(l => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(l.produit_nom)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${l.quantite}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(l.prix_unitaire)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 500;">${formatPrice(l.quantite * l.prix_unitaire)}</td>
      </tr>`)
    .join('');

  const produitsText = lignes
    .map(l => `  - ${l.produit_nom} x${l.quantite} @ ${formatPrice(l.prix_unitaire)} = ${formatPrice(l.quantite * l.prix_unitaire)}`)
    .join('\n');

  const isPreOrder = !!params.date_retrait;
  const dateRetraitFormatted = params.date_retrait
    ? new Date(params.date_retrait + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  const subject = isPreOrder
    ? `📅 Pré-commande confirmée pour ${dateRetraitFormatted} - ${boulangerie.nom}`
    : `🥖 Confirmation de votre commande - ${boulangerie.nom}`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation de commande</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #fafafa; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">🥖 ${escapeHtml(boulangerie.nom)}</h1>
    </div>

    <!-- Body -->
    <div style="padding: 30px 20px;">

      <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
        Bonjour <strong>${escapeHtml(client_prenom)}</strong>,
      </p>

      <p style="font-size: 16px; color: #374151; margin: 0 0 25px 0;">
        ${isPreOrder
          ? `Merci pour votre pré-commande ! Elle a bien été enregistrée pour <strong>${escapeHtml(dateRetraitFormatted!)}</strong>. Votre boulanger préparera vos produits spécialement pour vous.`
          : `Merci pour votre commande ! Elle a bien été enregistrée et sera prête à l'heure demandée.`
        }
      </p>

      <!-- Récapitulatif -->
      <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <h2 style="font-size: 18px; color: #111827; margin: 0 0 15px 0; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">
          📋 Récapitulatif de votre commande
        </h2>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 10px 8px; text-align: left; font-size: 14px; color: #6b7280;">Produit</th>
              <th style="padding: 10px 8px; text-align: center; font-size: 14px; color: #6b7280;">Qté</th>
              <th style="padding: 10px 8px; text-align: right; font-size: 14px; color: #6b7280;">Prix unit.</th>
              <th style="padding: 10px 8px; text-align: right; font-size: 14px; color: #6b7280;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${produitsHtml}
          </tbody>
          <tfoot>
            <tr style="background-color: #fef3c7; font-weight: 600;">
              <td colspan="3" style="padding: 12px 8px; text-align: right; font-size: 16px; color: #92400e;">Total</td>
              <td style="padding: 12px 8px; text-align: right; font-size: 18px; color: #92400e;">${formatPrice(montantRecalcule)}</td>
            </tr>
          </tfoot>
        </table>

        <p style="font-size: 12px; color: #9ca3af; margin: 0;">
          Commande n° CMD-${escapeHtml(shortId)}
        </p>
      </div>

      <!-- Infos retrait -->
      <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-left: 4px solid #10b981; border-radius: 0 8px 8px 0; padding: 20px; margin-bottom: 25px;">
        <h3 style="font-size: 16px; color: #065f46; margin: 0 0 12px 0;">📍 Retrait de votre commande</h3>
        <p style="font-size: 15px; color: #047857; margin: 0 0 8px 0;">
          <strong>🕐 Heure :</strong> ${escapeHtml(heure_retrait)}
        </p>
        ${adresseComplete ? `<p style="font-size: 15px; color: #047857; margin: 0 0 8px 0;"><strong>📍 Adresse :</strong> ${escapeHtml(adresseComplete)}</p>` : ''}
        ${boulangerie.telephone ? `<p style="font-size: 15px; color: #047857; margin: 0;"><strong>📞 Tél :</strong> ${escapeHtml(boulangerie.telephone)}</p>` : ''}
      </div>

      <!-- Footer message -->
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 15px 0; padding-top: 15px; border-top: 1px solid #e5e7eb;">
        Présentez cet email ou donnez votre nom lors du retrait. À très bientôt ! 🥐
      </p>

    </div>

    <!-- Footer -->
    <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">
        Cet email a été envoyé suite à votre commande sur ${escapeHtml(boulangerie.nom)}.
        <br>En cas de problème, contactez directement la boulangerie.
      </p>
    </div>

  </div>
</body>
</html>`;

  const textContent = `
Confirmation de commande - ${boulangerie.nom}

Bonjour ${client_prenom},

Merci pour votre commande ! Elle sera prête à l'heure demandée.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 RÉCAPITULATIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${produitsText}

TOTAL : ${formatPrice(montantRecalcule)}

Commande n° CMD-${shortId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 RETRAIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Heure : ${heure_retrait}
${adresseComplete ? `Adresse : ${adresseComplete}` : ''}
${boulangerie.telephone ? `Tél : ${boulangerie.telephone}` : ''}

Présentez cet email ou donnez votre nom lors du retrait.

À très bientôt !
${boulangerie.nom}
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
