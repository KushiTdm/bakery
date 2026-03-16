import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeText } from '@/lib/sanitize';

const ENCRYPTION_KEY = process.env.AIRTABLE_ENCRYPTION_KEY;

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

// Schéma de validation pour le PATCH profil
const ProfilPatchSchema = z.object({
  nom:              z.string().min(1).max(100).optional(),
  email_contact:    z.string().email().max(254).optional(),
  airtable_api_key: z.string().max(200).optional(),
  airtable_base_id: z.string().max(100).optional(),
  // Nouveaux champs roadmap
  adresse:          z.string().max(300).optional().nullable(),
  ville:            z.string().max(100).optional().nullable(),
  code_postal:      z.string().regex(/^\d{5}$/).optional().nullable(),
  telephone:        z.string().max(20).optional().nullable(),
  // Configuration flash
  flash_heure_debut: z.number().int().min(0).max(23).optional(),
  flash_heure_fin:   z.number().int().min(1).max(24).optional(),
  flash_remise_pct:  z.number().int().min(1).max(100).optional(),
  // Créneaux de retrait
  creneaux_retrait: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(20).optional(),
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
        airtable_api_key, airtable_base_id,
        airtable_api_key_enc, airtable_base_id_enc,
        adresse, ville, code_postal, telephone,
        flash_heure_debut, flash_heure_fin, flash_remise_pct,
        creneaux_retrait
      `)
      .eq('user_id', user.id)
      .single();

    if (error || !data) return errorResponse('Boulangerie introuvable', 404);

    return NextResponse.json({
      id:            data.id,
      nom:           data.nom,
      slug:          data.slug,
      email_contact: data.email_contact,
      plan:          data.plan,
      actif:         data.actif,
      created_at:    data.created_at,
      // Adresse
      adresse:       data.adresse ?? null,
      ville:         data.ville ?? null,
      code_postal:   data.code_postal ?? null,
      telephone:     data.telephone ?? null,
      // Flash
      flash_heure_debut: data.flash_heure_debut ?? 18,
      flash_heure_fin:   data.flash_heure_fin ?? 20,
      flash_remise_pct:  data.flash_remise_pct ?? 40,
      // Créneaux
      creneaux_retrait:  data.creneaux_retrait ?? ['08:00', '09:00', '10:00'],
      // Clés Airtable — juste un flag, jamais la valeur
      hasAirtableKey:    !!(data.airtable_api_key || data.airtable_api_key_enc),
      hasAirtableBaseId: !!(data.airtable_base_id || data.airtable_base_id_enc),
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
      airtable_api_key, airtable_base_id,
      adresse, ville, code_postal, telephone,
      flash_heure_debut, flash_heure_fin, flash_remise_pct,
      creneaux_retrait,
    } = parsed.data;

    const { data: boulangerie, error: findError } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (findError || !boulangerie) return errorResponse('Boulangerie introuvable', 404);

    const updates: Record<string, unknown> = {};

    // Champs texte — sanitisés après validation Zod
    if (nom              !== undefined) updates.nom              = sanitizeText(nom, 100);
    if (email_contact    !== undefined) updates.email_contact    = email_contact.trim().toLowerCase();
    if (adresse          !== undefined) updates.adresse          = adresse ? sanitizeText(adresse, 300) : null;
    if (ville            !== undefined) updates.ville            = ville ? sanitizeText(ville, 100) : null;
    if (code_postal      !== undefined) updates.code_postal      = code_postal ?? null;
    if (telephone        !== undefined) updates.telephone        = telephone ? sanitizeText(telephone, 20) : null;

    // Config flash — validée par Zod, pas de sanitization textuelle nécessaire
    if (flash_heure_debut !== undefined) updates.flash_heure_debut = flash_heure_debut;
    if (flash_heure_fin   !== undefined) updates.flash_heure_fin   = flash_heure_fin;
    if (flash_remise_pct  !== undefined) updates.flash_remise_pct  = flash_remise_pct;

    // Cohérence heures flash
    if (flash_heure_debut !== undefined && flash_heure_fin !== undefined) {
      if (flash_heure_debut >= flash_heure_fin) {
        return errorResponse('L\'heure de début doit être avant l\'heure de fin', 400);
      }
    }

    // Créneaux de retrait
    if (creneaux_retrait !== undefined) {
      // Déduplication + tri
      const unique = [...new Set(creneaux_retrait)].sort();
      updates.creneaux_retrait = unique;
    }

    // Chiffrement des clés Airtable via pgcrypto côté Postgres
    if (airtable_api_key !== undefined) {
      if (ENCRYPTION_KEY) {
        const { data: enc, error: encErr } = await admin.rpc('encrypt_text', {
          plaintext: airtable_api_key,
          key: ENCRYPTION_KEY,
        });
        if (!encErr && enc) {
          updates.airtable_api_key_enc = enc;
          updates.airtable_api_key = null;
        } else {
          console.warn('[profil PATCH] encrypt_text RPC failed, storing plain');
          updates.airtable_api_key = airtable_api_key;
        }
      } else {
        console.warn('[profil PATCH] AIRTABLE_ENCRYPTION_KEY non définie — stockage en clair');
        updates.airtable_api_key = airtable_api_key;
      }
    }

    if (airtable_base_id !== undefined) {
      if (ENCRYPTION_KEY) {
        const { data: enc, error: encErr } = await admin.rpc('encrypt_text', {
          plaintext: airtable_base_id,
          key: ENCRYPTION_KEY,
        });
        if (!encErr && enc) {
          updates.airtable_base_id_enc = enc;
          updates.airtable_base_id = null;
        } else {
          updates.airtable_base_id = airtable_base_id;
        }
      } else {
        updates.airtable_base_id = airtable_base_id;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, message: 'Aucun changement' });
    }

    const { error: updateError } = await admin
      .from('boulangeries')
      .update(updates)
      .eq('id', boulangerie.id);

    if (updateError) return errorResponse(updateError.message, 500);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[PATCH /api/boulanger/profil]', e);
    return errorResponse('Erreur serveur', 500);
  }
}