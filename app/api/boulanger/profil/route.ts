import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sanitizeText } from '@/lib/sanitize';

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return { user, admin };
}

const VALID_TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Sao_Paulo',
  'America/Buenos_Aires', 'America/Mexico_City', 'America/Montreal',
  'America/Toronto', 'America/Vancouver', 'America/Phoenix',
  'Africa/Casablanca', 'Africa/Tunis', 'Africa/Abidjan', 'Africa/Dakar',
  'Asia/Dubai', 'Asia/Beirut', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
  'Australia/Sydney', 'Pacific/Auckland',
];

const HoraireSchema = z.object({
  day:   z.string().min(1).max(50),
  hours: z.string().min(1).max(50),
});

const ProfilPatchSchema = z.object({
  nom:           z.string().min(1).max(100).optional(),
  email_contact: z.string().email().max(254).optional(),
  // Adresse
  adresse:       z.string().max(300).optional().nullable(),
  ville:         z.string().max(100).optional().nullable(),
  code_postal:   z.string().regex(/^\d{5}$/).optional().nullable(),
  telephone:     z.string().max(20).optional().nullable(),
  // Configuration flash
  flash_heure_debut: z.number().int().min(0).max(23).optional(),
  flash_heure_fin:   z.number().int().min(1).max(24).optional(),
  flash_remise_pct:  z.number().int().min(1).max(100).optional(),
  // Créneaux de retrait
  creneaux_retrait: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(20).optional(),
  // Timezone
  timezone: z.string().refine(v => VALID_TIMEZONES.includes(v), { message: 'Timezone non supportée' }).optional(),
  // Vitrine CMS
  vitrine_accroche:    z.string().max(120).optional().nullable(),
  vitrine_sous_titre:  z.string().max(200).optional().nullable(),
  vitrine_histoire:    z.string().max(800).optional().nullable(),
  vitrine_badge_label: z.string().max(60).optional().nullable(),
  vitrine_horaires:    z.array(HoraireSchema).max(10).optional().nullable(),
}).strict();

// ── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return errorResponse('Non authentifié', 401);
    const { user, admin } = auth;

    const { data, error } = await admin
      .from('boulangeries')
      .select(`
        id, nom, slug, email_contact, plan, actif, created_at,
        adresse, ville, code_postal, telephone,
        flash_heure_debut, flash_heure_fin, flash_remise_pct,
        creneaux_retrait, timezone,
        vitrine_accroche, vitrine_sous_titre,
        vitrine_hero_image_url, vitrine_hero_storage_path,
        vitrine_about_image_url, vitrine_about_storage_path,
        vitrine_histoire, vitrine_badge_label, vitrine_horaires
      `)
      .eq('user_id', user.id)
      .single();

    if (error || !data) return errorResponse('Boulangerie introuvable', 404);

    const d = data as Record<string, unknown>;
    return NextResponse.json({
      id:            data.id,
      nom:           data.nom,
      slug:          data.slug,
      email_contact: data.email_contact,
      plan:          data.plan,
      actif:         data.actif,
      created_at:    data.created_at,
      adresse:       data.adresse ?? null,
      ville:         data.ville ?? null,
      code_postal:   data.code_postal ?? null,
      telephone:     data.telephone ?? null,
      flash_heure_debut: data.flash_heure_debut ?? 18,
      flash_heure_fin:   data.flash_heure_fin ?? 20,
      flash_remise_pct:  data.flash_remise_pct ?? 40,
      creneaux_retrait:  data.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
      timezone:          d.timezone ?? 'Europe/Paris',
      // Vitrine CMS
      vitrine_accroche:          d.vitrine_accroche ?? null,
      vitrine_sous_titre:        d.vitrine_sous_titre ?? null,
      vitrine_hero_image_url:    d.vitrine_hero_image_url ?? null,
      vitrine_hero_storage_path: d.vitrine_hero_storage_path ?? null,
      vitrine_about_image_url:   d.vitrine_about_image_url ?? null,
      vitrine_about_storage_path: d.vitrine_about_storage_path ?? null,
      vitrine_histoire:          d.vitrine_histoire ?? null,
      vitrine_badge_label:       d.vitrine_badge_label ?? null,
      vitrine_horaires:          d.vitrine_horaires ?? null,
    });
  } catch (e) {
    console.error('[GET /api/boulanger/profil]', e);
    return errorResponse('Erreur serveur', 500);
  }
}

// ── PATCH ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return errorResponse('Non authentifié', 401);
    const { user, admin } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Corps de requête invalide', 400);
    }

    const parsed = ProfilPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      nom, email_contact,
      adresse, ville, code_postal, telephone,
      flash_heure_debut, flash_heure_fin, flash_remise_pct,
      creneaux_retrait, timezone,
      vitrine_accroche, vitrine_sous_titre, vitrine_histoire,
      vitrine_badge_label, vitrine_horaires,
    } = parsed.data;

    const { data: boulangerie, error: findError } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (findError || !boulangerie) return errorResponse('Boulangerie introuvable', 404);

    const updates: Record<string, unknown> = {};

    if (nom           !== undefined) updates.nom           = sanitizeText(nom, 100);
    if (email_contact !== undefined) updates.email_contact = email_contact.trim().toLowerCase();
    if (adresse       !== undefined) updates.adresse       = adresse ? sanitizeText(adresse, 300) : null;
    if (ville         !== undefined) updates.ville         = ville ? sanitizeText(ville, 100) : null;
    if (code_postal   !== undefined) updates.code_postal   = code_postal ?? null;
    if (telephone     !== undefined) updates.telephone     = telephone ? sanitizeText(telephone, 20) : null;

    if (flash_heure_debut !== undefined) updates.flash_heure_debut = flash_heure_debut;
    if (flash_heure_fin   !== undefined) updates.flash_heure_fin   = flash_heure_fin;
    if (flash_remise_pct  !== undefined) updates.flash_remise_pct  = flash_remise_pct;

    if (flash_heure_debut !== undefined && flash_heure_fin !== undefined) {
      if (flash_heure_debut >= flash_heure_fin) {
        return errorResponse("L'heure de début doit être avant l'heure de fin", 400);
      }
    }

    if (creneaux_retrait !== undefined) {
      const unique = [...new Set(creneaux_retrait)].sort();
      updates.creneaux_retrait = unique;
    }

    if (timezone !== undefined) updates.timezone = timezone;

    // Vitrine CMS
    if (vitrine_accroche    !== undefined) updates.vitrine_accroche    = vitrine_accroche ? sanitizeText(vitrine_accroche, 120) : null;
    if (vitrine_sous_titre  !== undefined) updates.vitrine_sous_titre  = vitrine_sous_titre ? sanitizeText(vitrine_sous_titre, 200) : null;
    if (vitrine_histoire    !== undefined) updates.vitrine_histoire    = vitrine_histoire ? sanitizeText(vitrine_histoire, 800) : null;
    if (vitrine_badge_label !== undefined) updates.vitrine_badge_label = vitrine_badge_label ? sanitizeText(vitrine_badge_label, 60) : null;
    if (vitrine_horaires    !== undefined) updates.vitrine_horaires    = vitrine_horaires ?? null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, message: 'Aucun changement' });
    }

    const { error: updateError } = await admin
      .from('boulangeries')
      .update(updates)
      .eq('id', boulangerie.id);

    if (updateError) return errorResponse(updateError.message, 500);

    // Invalide le cache Next.js de la page vitrine pour que les changements
    // (adresse, créneaux, flash) soient visibles immédiatement côté client
    revalidatePath('/');

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[PATCH /api/boulanger/profil]', e);
    return errorResponse('Erreur serveur', 500);
  }
}