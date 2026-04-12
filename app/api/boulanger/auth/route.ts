// app/api/boulanger/auth/route.ts
// Auth boulanger — email + password (pas d'OTP).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidSlug } from '@/lib/sanitize';
import { isAuthRateLimited, resetAuthRateLimit } from '@/lib/rate-limit';

// ── Schémas Zod ───────────────────────────────────────────────

const LoginSchema = z.object({
  action:   z.literal('login'),
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

const RegisterSchema = z.object({
  action:   z.literal('register'),
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  nom:      z.string().min(1).max(100),
  slug:     z.string().min(1).max(60),
});

const AuthBodySchema = z.discriminatedUnion('action', [LoginSchema, RegisterSchema]);

// ── Helpers ───────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

// ── Validation mot de passe ───────────────────────────────────

interface PasswordValidationResult {
  valid:  boolean;
  errors: string[];
}

function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8)     errors.push('au moins 8 caractères');
  if (!/[a-z]/.test(password)) errors.push('une lettre minuscule');
  if (!/[A-Z]/.test(password)) errors.push('une lettre majuscule');
  if (!/[0-9]/.test(password)) errors.push('un chiffre');

  return { valid: errors.length === 0, errors };
}

// ── Template email bienvenue Sauve Mie ────────────────────────

function buildWelcomeEmail(nomBoulangerie: string, appUrl: string): { html: string; text: string } {
  const dashboardUrl = `${appUrl}/boulanger`;

  const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenue sur Sauve Mie — ${nomBoulangerie}</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Gloock&display=swap" rel="stylesheet" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Gloock&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background-color: #F3EBE0; }
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 12px !important; }
      .header-pad { padding: 36px 24px 32px !important; }
      .body-pad { padding: 28px 20px 32px !important; }
      .footer-pad { padding: 20px !important; }
      .steps-cell { padding: 14px 16px !important; }
      .cta-btn { font-size: 14px !important; padding: 14px 28px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F3EBE0; -webkit-font-smoothing:antialiased;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F3EBE0;">
    <tr>
      <td class="email-wrapper" style="padding:32px 16px;">

        <!-- Card principale -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#FAF6EF; border-radius:20px; overflow:hidden; box-shadow:0 4px 32px rgba(28,15,7,0.10);">

          <!-- ══ HEADER ══ -->
          <tr>
            <td class="header-pad" style="background-color:#1C0F07; padding:44px 40px 40px; text-align:center;">

              <!-- Grain mark SVG -->
              <div style="margin-bottom:22px;">
                <svg width="40" height="56" viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; opacity:0.85; transform:rotate(-12deg);">
                  <ellipse cx="20" cy="28" rx="16" ry="24" fill="none" stroke="#C4882A" stroke-width="1.5"/>
                  <line x1="20" y1="10" x2="20" y2="46" stroke="#C4882A" stroke-width="1" opacity="0.6"/>
                  <line x1="11" y1="18" x2="29" y2="22" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                  <line x1="10" y1="28" x2="30" y2="28" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                  <line x1="11" y1="38" x2="29" y2="34" stroke="#C4882A" stroke-width="0.8" opacity="0.5"/>
                </svg>
              </div>

              <!-- Wordmark Sauve Mie -->
              <p style="margin:0 0 2px; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:rgba(196,136,42,0.6);">
                Sauve Mie
              </p>
              <h1 style="margin:0; font-family:'Gloock',Georgia,serif; font-size:28px; font-weight:400; color:#FAF6EF; line-height:1.15; letter-spacing:-0.2px;">
                Bienvenue,<br/>
                <span style="color:#C4882A;">${nomBoulangerie}</span>
              </h1>

              <!-- Séparateur doré -->
              <div style="width:40px; height:1px; background-color:#C4882A; margin:20px auto 0; opacity:0.7;"></div>

            </td>
          </tr>

          <!-- ══ BODY ══ -->
          <tr>
            <td class="body-pad" style="padding:36px 40px 40px;">

              <!-- Message principal -->
              <p style="margin:0 0 10px; font-family:'Outfit',Arial,sans-serif; font-size:13px; font-weight:400; color:#A8876E; letter-spacing:0.5px; text-transform:uppercase;">
                Votre boulangerie est prête.
              </p>
              <p style="margin:0 0 24px; font-family:'Outfit',Arial,sans-serif; font-size:15px; font-weight:300; color:#4A2C1A; line-height:1.7;">
                Votre espace de gestion est configuré et vous attend. Commencez dès maintenant à saisir votre production du matin, gérer vos paniers flash et générer vos premiers rapports Levain.
              </p>

              <!-- Séparateur -->
              <div style="height:1px; background:rgba(196,136,42,0.2); margin-bottom:24px;"></div>

              <!-- Étapes de démarrage -->
              <p style="margin:0 0 14px; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#A8876E;">
                Pour commencer
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">

                <!-- Étape 1 -->
                <tr>
                  <td class="steps-cell" style="padding:14px 18px; background:rgba(196,136,42,0.06); border:1px solid rgba(196,136,42,0.15); border-radius:10px; margin-bottom:8px; display:block; margin-bottom:8px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="width:28px; vertical-align:middle;">
                          <span style="font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:600; color:#C4882A; background:rgba(196,136,42,0.15); border-radius:50%; width:22px; height:22px; display:inline-block; text-align:center; line-height:22px;">1</span>
                        </td>
                        <td style="padding-left:12px; vertical-align:middle;">
                          <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:14px; font-weight:500; color:#1C0F07; line-height:1.3;">Configurez votre profil</p>
                          <p style="margin:2px 0 0; font-family:'Outfit',Arial,sans-serif; font-size:12px; font-weight:300; color:#7A5240;">Horaires, adresse, créneaux de retrait</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr><td style="height:8px;"></td></tr>

                <!-- Étape 2 -->
                <tr>
                  <td class="steps-cell" style="padding:14px 18px; background:rgba(196,136,42,0.06); border:1px solid rgba(196,136,42,0.15); border-radius:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="width:28px; vertical-align:middle;">
                          <span style="font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:600; color:#C4882A; background:rgba(196,136,42,0.15); border-radius:50%; width:22px; height:22px; display:inline-block; text-align:center; line-height:22px;">2</span>
                        </td>
                        <td style="padding-left:12px; vertical-align:middle;">
                          <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:14px; font-weight:500; color:#1C0F07; line-height:1.3;">Créez votre catalogue</p>
                          <p style="margin:2px 0 0; font-family:'Outfit',Arial,sans-serif; font-size:12px; font-weight:300; color:#7A5240;">Ajoutez vos produits avec prix et catégories</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr><td style="height:8px;"></td></tr>

                <!-- Étape 3 -->
                <tr>
                  <td class="steps-cell" style="padding:14px 18px; background:rgba(196,136,42,0.06); border:1px solid rgba(196,136,42,0.15); border-radius:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="width:28px; vertical-align:middle;">
                          <span style="font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:600; color:#C4882A; background:rgba(196,136,42,0.15); border-radius:50%; width:22px; height:22px; display:inline-block; text-align:center; line-height:22px;">3</span>
                        </td>
                        <td style="padding-left:12px; vertical-align:middle;">
                          <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:14px; font-weight:500; color:#1C0F07; line-height:1.3;">Saisissez votre première journée</p>
                          <p style="margin:2px 0 0; font-family:'Outfit',Arial,sans-serif; font-size:12px; font-weight:300; color:#7A5240;">Production matin → snapshots → clôture → rapport IA</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" class="cta-btn" style="display:inline-block; background-color:#C4882A; color:#1C0F07; font-family:'Outfit',Arial,sans-serif; font-size:15px; font-weight:600; text-decoration:none; padding:16px 36px; border-radius:10px; letter-spacing:0.3px;">
                      Accéder à mon tableau de bord
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Séparateur -->
              <div style="height:1px; background:rgba(196,136,42,0.2); margin-bottom:24px;"></div>

              <!-- Note bas -->
              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:13px; font-weight:300; color:#A8876E; line-height:1.6; font-style:italic;">
                Une question ? Répondez directement à cet email, nous vous répondrons avec soin.
              </p>

            </td>
          </tr>

          <!-- ══ FOOTER ══ -->
          <tr>
            <td class="footer-pad" style="background-color:#1C0F07; padding:24px 40px; text-align:center;">

              <div style="width:32px; height:1px; background-color:#C4882A; margin:0 auto 16px; opacity:0.6;"></div>

              <p style="margin:0 0 4px; font-family:'Gloock',Georgia,serif; font-size:14px; color:rgba(250,246,239,0.5); font-weight:400; font-style:italic;">
                Moins de pain gaspillé, plus de clients.
              </p>
              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:11px; font-weight:300; color:rgba(250,246,239,0.2);">
                L'équipe Sauve Mie
              </p>

            </td>
          </tr>

          <!-- Bordure dorée -->
          <tr>
            <td style="height:3px; background:linear-gradient(90deg, transparent 0%, #C4882A 30%, #C4882A 70%, transparent 100%);"></td>
          </tr>

        </table>

        <!-- Mention bas de page -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:16px auto 0;">
          <tr>
            <td style="text-align:center;">
              <p style="margin:0; font-family:'Outfit',Arial,sans-serif; font-size:10px; font-weight:400; color:rgba(28,15,7,0.3); letter-spacing:1px;">
                Sauve Mie · <a href="${appUrl}" style="color:#C4882A; text-decoration:none;">sauvemie.fr</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `
Sauve Mie — Bienvenue, ${nomBoulangerie} !
${'─'.repeat(50)}

Votre boulangerie est configurée et prête à l'emploi.

POUR COMMENCER
${'─'.repeat(50)}
1. Configurez votre profil (horaires, adresse, créneaux)
2. Créez votre catalogue de produits
3. Saisissez votre première journée de production

Accéder à votre tableau de bord :
${dashboardUrl}

${'─'.repeat(50)}
Une question ? Répondez directement à cet email.
L'équipe Sauve Mie · Moins de pain gaspillé, plus de clients.
`.trim();

  return { html, text };
}

// ── GET — Vérifie la session depuis le token JWT ───────────────

export async function GET(req: NextRequest) {
  try {
    const admin      = getSupabaseAdmin();
    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await admin.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id, nom, slug, plan')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      boulangerie,
    });

  } catch (err) {
    console.error('[/api/boulanger/auth GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST — Login ou Register ───────────────────────────────────

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);

  // 1. Rate limiting
  const rateCheck = await isAuthRateLimited(clientIp);
  if (rateCheck.blocked) {
    const retryMinutes = Math.ceil(rateCheck.retryAfterMs / 60_000);
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${retryMinutes} minute(s).` },
      {
        status:  429,
        headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
      }
    );
  }

  // 2. Parsing JSON
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  // 3. Validation Zod
  const parsed = AuthBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  try {
    const admin = getSupabaseAdmin();

    // ── Login ────────────────────────────────────────────────

    if (body.action === 'login') {
      const { data, error } = await admin.auth.signInWithPassword({
        email:    body.email,
        password: body.password,
      });

      if (error || !data.session) {
        return NextResponse.json(
          { error: 'Email ou mot de passe incorrect' },
          { status: 401 }
        );
      }

      resetAuthRateLimit(clientIp);

      const { data: boulangerie } = await admin
        .from('boulangeries')
        .select('id, nom, slug, plan')
        .eq('user_id', data.user.id)
        .single();

      return NextResponse.json({
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
        user:          { id: data.user.id, email: data.user.email },
        boulangerie,
      });
    }

    // ── Register ─────────────────────────────────────────────

    if (body.action === 'register') {
      if (!isValidSlug(body.slug)) {
        return NextResponse.json(
          {
            error:
              'Slug invalide. Utilisez uniquement des lettres minuscules, chiffres et tirets. ' +
              'Certains slugs sont réservés (api, admin, www…)',
          },
          { status: 400 }
        );
      }

      const passwordValidation = validatePasswordStrength(body.password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { error: `Le mot de passe doit contenir : ${passwordValidation.errors.join(', ')}.` },
          { status: 400 }
        );
      }

      const { data: existing } = await admin
        .from('boulangeries')
        .select('id')
        .eq('slug', body.slug)
        .single();

      if (existing) {
        return NextResponse.json({ error: 'Ce slug est déjà utilisé' }, { status: 409 });
      }

      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email:         body.email,
        password:      body.password,
        email_confirm: true,
      });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      const { data: boulangerie, error: boulangerieError } = await admin
        .from('boulangeries')
        .insert({
          user_id:       authData.user.id,
          nom:           body.nom,
          slug:          body.slug,
          email_contact: body.email,
          plan:          'starter',
          actif:         true,
        })
        .select()
        .single();

      if (boulangerieError) {
        await admin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: 'Erreur création boulangerie' }, { status: 500 });
      }

      const { data: session } = await admin.auth.signInWithPassword({
        email:    body.email,
        password: body.password,
      });

      // Email de bienvenue (non bloquant)
      const fromDomain = process.env.RESEND_FROM_DOMAIN;
      const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sauvemie.fr';

      const { html: welcomeHtml, text: welcomeText } = buildWelcomeEmail(body.nom, appUrl);

      if (!process.env.RESEND_API_KEY) {
        console.log('[auth/register] RESEND_API_KEY manquante — email de bienvenue non envoyé');
      } else {
        const resend = new Resend(process.env.RESEND_API_KEY);
        resend.emails.send({
          from:    fromDomain ? `Sauve Mie <noreply@${fromDomain}>` : 'Sauve Mie <onboarding@resend.dev>',
          to:      body.email,
          subject: `Bienvenue sur Sauve Mie — ${body.nom} est prête !`,
          html:    welcomeHtml,
          text:    welcomeText,
        }).catch(e => console.warn('[auth/register] email bienvenue non envoyé:', e));
      }

      return NextResponse.json(
        {
          access_token:  session?.session?.access_token,
          refresh_token: session?.session?.refresh_token,
          user:          { id: authData.user.id, email: body.email },
          boulangerie,
        },
        { status: 201 }
      );
    }

  } catch (err) {
    console.error('[/api/boulanger/auth POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}