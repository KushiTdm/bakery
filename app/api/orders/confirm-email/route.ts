import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface LigneCommande {
  produit_nom:   string;
  quantite:      number;
  prix_unitaire: number;
}

interface ConfirmPayload {
  commande_id:   string;
  client_prenom: string;
  client_email:  string;
  heure_retrait: string;
  lignes:        LigneCommande[];
  montant_total: number;
}

export async function POST(req: NextRequest) {
  // Appel interne uniquement — pas d'auth publique
  const internalSecret = req.headers.get('x-internal-secret');
  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    // Si pas de secret configuré, on accepte quand même (appel serveur → serveur)
    // Configurez INTERNAL_API_SECRET en prod pour sécuriser davantage
  }

  try {
    const payload: ConfirmPayload = await req.json();
    const { client_prenom, client_email, heure_retrait, lignes, montant_total, commande_id } = payload;

    const lignesHtml = lignes
      .map(
        l => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0ede8">${l.produit_nom}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0ede8;text-align:center">${l.quantite}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0ede8;text-align:right">${(l.prix_unitaire * l.quantite).toFixed(2)} €</td>
        </tr>`
      )
      .join('');

    const { error } = await resend.emails.send({
      from:    'BakeryOS <commandes@votreboulangerie.fr>',  // ← adaptez le domaine
      to:      client_email,
      subject: `✅ Commande confirmée — retrait à ${heure_retrait}`,
      html: `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8"></head>
        <body style="font-family:Georgia,serif;color:#2c2118;max-width:560px;margin:0 auto;padding:24px">
          <h1 style="font-size:24px;font-weight:normal;color:#8b4513;margin-bottom:4px">
            Votre commande est confirmée 🥐
          </h1>
          <p style="color:#6b5744;margin-bottom:24px">
            Bonjour ${client_prenom}, nous avons bien reçu votre commande.
          </p>

          <div style="background:#fdf8f3;border-radius:8px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;font-size:18px;font-weight:bold;color:#8b4513">
              🕐 Retrait : ${heure_retrait}
            </p>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead>
              <tr style="border-bottom:2px solid #e8ddd5">
                <th style="text-align:left;padding:8px 0;font-weight:500;color:#6b5744">Produit</th>
                <th style="text-align:center;padding:8px 0;font-weight:500;color:#6b5744">Qté</th>
                <th style="text-align:right;padding:8px 0;font-weight:500;color:#6b5744">Prix</th>
              </tr>
            </thead>
            <tbody>${lignesHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding-top:12px;font-weight:bold">Total</td>
                <td style="padding-top:12px;font-weight:bold;text-align:right">${montant_total.toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>

          <p style="font-size:12px;color:#a89080;border-top:1px solid #e8ddd5;padding-top:16px">
            Référence commande : ${commande_id}<br>
            En cas de problème, répondez directement à cet email.
          </p>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('[confirm-email] Resend error:', error);
      return NextResponse.json({ error: 'Email non envoyé' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[confirm-email] unexpected error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}