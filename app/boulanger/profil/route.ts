// app/api/boulanger/profil/route.ts
// ─────────────────────────────────────────────────────────────
// GET  → récupère le profil de la boulangerie connectée
// PATCH → met à jour les credentials Airtable ou infos
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getAuthUser(req: NextRequest) {
  const admin = getSupabaseAdmin();
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── GET — Profil complet ──────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: boulangerie, error } = await admin
      .from('boulangeries')
      .select('id, nom, slug, email_contact, plan, actif, airtable_base_id, created_at')
      // Note : on NE retourne PAS airtable_api_key côté client — sécurité
      .eq('user_id', user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    return NextResponse.json({ boulangerie });

  } catch (err) {
    console.error('[/api/boulanger/profil GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── PATCH — Mise à jour partielle ─────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();

    // Champs autorisés à la mise à jour (whitelist)
    const allowedFields: Record<string, unknown> = {};
    if (body.nom)              allowedFields.nom = body.nom;
    if (body.email_contact)    allowedFields.email_contact = body.email_contact;
    if (body.airtable_api_key) allowedFields.airtable_api_key = body.airtable_api_key;
    if (body.airtable_base_id) allowedFields.airtable_base_id = body.airtable_base_id;

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('boulangeries')
      .update(allowedFields)
      .eq('user_id', user.id)
      .select('id, nom, slug, email_contact, plan, airtable_base_id')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 });
    }

    return NextResponse.json({ boulangerie: data });

  } catch (err) {
    console.error('[/api/boulanger/profil PATCH]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}