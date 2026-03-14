// app/api/orders/confirm-email/route.ts
// ─────────────────────────────────────────────────────────────
// S3 FIX : INTERNAL_API_SECRET désormais obligatoire en production.
// En développement, l'absence du secret est signalée par un warning
// mais non bloquante (appels server-side sans secret via localhost).
// ─────────────────────────────────────────────────────────────

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

// ── Validation du secret interne ─────────────────────────────
function checkInternalSecret(req: NextRequest): NextResponse | null {
  const secret   = process.env.INTERNAL_API_SECRET;
  const provided = req.headers.get('x-internal-secret');

  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      // En production sans secret configuré → erreur bloquante
      console.error(
        '[confirm-email] INTERNAL_API_SECRET non défini en production. ' +
        'Ajoutez-le dans Netlify → Site settings → Environment variables.'
      );
      return NextResponse.json(
        { error: 'Configuration serveur incomplète (INTERNAL_API_SECRET manquant)' },
        { status: 500 }
      );
    } else {
      // En dev, on accepte mais on avertit
      console.warn(
        '[confirm-email] INTERNAL_API_SECRET non défini — ' +
        'appel accepté en développement uniquement.'
      );
      return null; // OK, on continue
    }
  }

  // Secret configuré → vérification stricte quel que soit l'environnement
  if (provided !== secret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  return null; // OK
}

export async function POST(req: NextRequest) {
  const authError = checkInternalSecret(req);
  if (authError) return authError;

  try {
    const payload: ConfirmPayload = await req.json();
    const { client_prenom, client_email, heure_retrait, lignes, montant_total, commande_id } = payload;

    if (!client_email || !lignes?.length) {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

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
      from:    process.env.RESEND_FROM_EMAIL ?? 'BakeryOS <commandes@artisandore.fr>',
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