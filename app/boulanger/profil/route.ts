// app/api/boulanger/profil/route.ts
// ─────────────────────────────────────────────────────────────
// GET  → profil boulangerie (sans clés sensibles)
// PATCH → mise à jour profil + credentials Airtable (chiffrés)
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';

// Clé de chiffrement — doit être définie dans .env.local
// Générer avec : openssl rand -hex 32
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

// ── GET — profil public (jamais les clés en clair) ──────────
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return errorResponse('Non authentifié', 401);
    const { user, admin } = auth;

    const { data, error } = await admin
      .from('boulangeries')
      .select('id, nom, slug, email_contact, plan, actif, created_at, airtable_api_key, airtable_base_id, airtable_api_key_enc, airtable_base_id_enc')
      .eq('user_id', user.id)
      .single();

    if (error || !data) return errorResponse('Boulangerie introuvable', 404);

    // Ne jamais renvoyer les clés au client — juste indiquer si elles sont configurées
    return NextResponse.json({
      id: data.id,
      nom: data.nom,
      slug: data.slug,
      email_contact: data.email_contact,
      plan: data.plan,
      actif: data.actif,
      created_at: data.created_at,
      hasAirtableKey: !!(data.airtable_api_key || data.airtable_api_key_enc),
      hasAirtableBaseId: !!(data.airtable_base_id || data.airtable_base_id_enc),
    });
  } catch (e) {
    console.error('[GET /api/boulanger/profil]', e);
    return errorResponse('Erreur serveur', 500);
  }
}

// ── PATCH — mise à jour avec chiffrement des clés ───────────
export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return errorResponse('Non authentifié', 401);
    const { user, admin } = auth;

    const body = await req.json();
    const { nom, email_contact, airtable_api_key, airtable_base_id } = body;

    const { data: boulangerie, error: findError } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (findError || !boulangerie) return errorResponse('Boulangerie introuvable', 404);

    const updates: Record<string, unknown> = {};
    if (nom !== undefined) updates.nom = nom;
    if (email_contact !== undefined) updates.email_contact = email_contact;

    // Chiffrement des clés Airtable via pgcrypto côté Postgres
    if (airtable_api_key !== undefined) {
      if (ENCRYPTION_KEY) {
        const { data: enc, error: encErr } = await admin.rpc('encrypt_text', {
          plaintext: airtable_api_key,
          key: ENCRYPTION_KEY,
        });
        if (!encErr && enc) {
          updates.airtable_api_key_enc = enc;
          updates.airtable_api_key = null; // Efface l'ancienne valeur en clair
        } else {
          // Fallback si la fonction SQL n'existe pas encore
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