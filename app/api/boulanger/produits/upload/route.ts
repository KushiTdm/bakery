// app/api/boulanger/produits/upload/route.ts
// ─────────────────────────────────────────────────────────────
// POST → upload d'une photo produit dans Supabase Storage
//
// Reçoit un FormData avec :
//   - file  : le fichier image
//   - produit_id : UUID du produit (pour nommer le fichier)
//
// Retourne l'image_storage_path à sauvegarder sur le produit.
// Le PATCH /api/boulanger/produits est ensuite appelé pour
// mettre à jour image_storage_path sur le produit.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const MAX_SIZE   = 5 * 1024 * 1024; // 5 MB
const MIME_OK    = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    // ── Récupère le fichier ───────────────────────────────────
    const formData   = await req.formData();
    const file       = formData.get('file') as File | null;
    const produit_id = formData.get('produit_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
    }
    if (!produit_id) {
      return NextResponse.json({ error: 'produit_id manquant' }, { status: 400 });
    }

    // ── Validations ───────────────────────────────────────────
    if (!MIME_OK.includes(file.type)) {
      return NextResponse.json(
        { error: `Format non supporté. Acceptés : ${MIME_OK.join(', ')}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Fichier trop lourd (max 5 MB)' },
        { status: 400 }
      );
    }

    // Vérifie que le produit appartient bien à cette boulangerie
    const { data: produit } = await admin
      .from('produits')
      .select('id, image_storage_path')
      .eq('id', produit_id)
      .eq('boulangerie_id', boulangerie.id)
      .single();

    if (!produit) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
    }

    // ── Supprime l'ancienne photo si elle existe ──────────────
    if (produit.image_storage_path) {
      await admin.storage
        .from('produits-photos')
        .remove([produit.image_storage_path]);
    }

    // ── Chemin Storage ────────────────────────────────────────
    // Format : "{boulangerie_id}/{produit_id}.{ext}"
    // On convertit toujours en webp côté navigateur (si supporté)
    // sinon on garde l'extension originale
    const ext       = file.type === 'image/webp' ? 'webp'
                    : file.type === 'image/avif' ? 'avif'
                    : file.type === 'image/png'  ? 'png'
                    : 'jpg';
    const storagePath = `${boulangerie.id}/${produit_id}.${ext}`;

    // ── Upload ────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await admin.storage
      .from('produits-photos')
      .upload(storagePath, buffer, {
        contentType:  file.type,
        upsert:       true,        // écrase si déjà présent
        cacheControl: '3600',
      });

    if (uploadErr) {
      console.error('[upload photo]', uploadErr);
      return NextResponse.json({ error: 'Échec upload Storage' }, { status: 500 });
    }

    // ── Met à jour image_storage_path sur le produit ──────────
    await admin
      .from('produits')
      .update({ image_storage_path: storagePath, image_url: null })
      .eq('id', produit_id)
      .eq('boulangerie_id', boulangerie.id);

    // URL publique
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produits-photos/${storagePath}`;

    return NextResponse.json({
      success:            true,
      image_storage_path: storagePath,
      image_public_url:   publicUrl,
    });

  } catch (err) {
    console.error('[POST /api/boulanger/produits/upload]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}