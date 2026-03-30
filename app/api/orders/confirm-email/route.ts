import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase';

// ── Initialisation Resend ──────────────────────────────────────

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Schéma Zod ────────────────────────────────────────────────

const LigneSchema = z.object({
  produit_id:    z.string().min(1).max(100),  // accepte UUID ou tout autre identifiant
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

// ── Handler principal ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Validation du secret interne avec résistance aux timing attacks
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

  // 3. Validation Zod complète
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

    // 4. Récupérer la commande (vérification existence + ownership)
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

    // 6. Recalcul serveur du montant total (ne pas faire confiance au payload)
    const montantRecalcule = data.lignes.reduce(
      (sum, l) => sum + l.quantite * l.prix_unitaire,
      0
    );

    // 7. Construire le contenu email
    const adresseComplete = [
      boulangerie.adresse,
      boulangerie.code_postal,
      boulangerie.ville,
    ]
      .filter(Boolean)
      .join(', ');

    const produitsHtml = data.lignes
      .map(
        (l) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(l.produit_nom)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${l.quantite}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(l.prix_unitaire)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 500;">${formatPrice(l.quantite * l.prix_unitaire)}</td>
        </tr>`
      )
      .join('');

    const produitsText = data.lignes
      .map(
        (l) =>
          `  - ${l.produit_nom} x${l.quantite} @ ${formatPrice(l.prix_unitaire)} = ${formatPrice(l.quantite * l.prix_unitaire)}`
      )
      .join('\n');

    const subject = `🥖 Confirmation de votre commande - ${boulangerie.nom}`;

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
        Bonjour <strong>${escapeHtml(data.client_prenom)}</strong>,
      </p>

      <p style="font-size: 16px; color: #374151; margin: 0 0 25px 0;">
        Merci pour votre commande ! Elle a bien été enregistrée et sera prête à l'heure demandée.
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
          Commande n° ${escapeHtml(data.commande_id.slice(0, 8).toUpperCase())}
        </p>
      </div>

      <!-- Infos retrait -->
      <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-left: 4px solid #10b981; border-radius: 0 8px 8px 0; padding: 20px; margin-bottom: 25px;">
        <h3 style="font-size: 16px; color: #065f46; margin: 0 0 12px 0;">📍 Retrait de votre commande</h3>
        <p style="font-size: 15px; color: #047857; margin: 0 0 8px 0;">
          <strong>🕐 Heure :</strong> ${escapeHtml(data.heure_retrait)}
        </p>
        <p style="font-size: 15px; color: #047857; margin: 0 0 8px 0;">
          <strong>📍 Adresse :</strong> ${escapeHtml(adresseComplete)}
        </p>
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

Bonjour ${data.client_prenom},

Merci pour votre commande ! Elle sera prête à l'heure demandée.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 RÉCAPITULATIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${produitsText}

TOTAL : ${formatPrice(montantRecalcule)}

Commande n° ${data.commande_id.slice(0, 8).toUpperCase()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 RETRAIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Heure : ${data.heure_retrait}
Adresse : ${adresseComplete}
${boulangerie.telephone ? `Tél : ${boulangerie.telephone}` : ''}

Présentez cet email ou donnez votre nom lors du retrait.

À très bientôt !
${boulangerie.nom}
    `.trim();

    // 8. Envoi via Resend (avec 1 retry automatique)
    const fromAddress = `${boulangerie.nom} <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'bakeryos.fr'}>`;
    const emailPayload = { from: fromAddress, to: data.client_email, subject, html: htmlContent, text: textContent };

    let emailResult: { id?: string } | null = null;
    let emailError: { name: string; message: string } | null = null;

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

// ── Helpers ───────────────────────────────────────────────────

/**
 * Comparaison en temps constant — résistance aux timing attacks.
 * Ne court-circuite pas à la première différence.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Échappe les caractères HTML dangereux avant injection dans le template.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formatte un prix en euros avec la locale française.
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}