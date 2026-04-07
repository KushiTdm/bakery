// app/api/boulanger/vitrine/upload/route.ts
// ─────────────────────────────────────────────────────────────
// POST → upload d'une image vitrine (hero ou about) dans le bucket vitrine-images
// Même pattern de sécurité que produits/upload :
//   - Auth JWT + ownership boulangerie
//   - Magic bytes validation
//   - Sharp compression WebP
//   - Path contrôlé côté serveur
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION  = 1920;
const WEBP_QUALITY   = 82;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif',
]);

const VALID_TYPES = new Set(['hero', 'about']);

function detectMimeTypeFromBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) return 'image/png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  if (buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.slice(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function compressToWebP(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION * 4 })
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .withMetadata({ exif: {} })
      .webp({ quality: WEBP_QUALITY, effort: 4, lossless: false })
      .toBuffer();
  } catch (err) {
    console.warn('[vitrine/upload] Sharp non disponible, upload sans compression :', err);
    return buffer;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
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

    // 2. Ownership — owner uniquement
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('id, user_id, vitrine_hero_storage_path, vitrine_about_storage_path')
      .eq('user_id', user.id)
      .single();

    if (!boulangerie) {
      return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
    }

    // 3. FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
    if (!type || !VALID_TYPES.has(type)) {
      return NextResponse.json({ error: 'Type invalide (hero | about)' }, { status: 400 });
    }

    // 4. Validation MIME
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Format non supporté (jpeg, png, webp, avif)' }, { status: 400 });
    }

    // 5. Taille
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'Fichier trop lourd (max 5 MB)' }, { status: 400 });
    }

    // 6. Magic bytes
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const detectedMime = detectMimeTypeFromBytes(rawBuffer);
    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      return NextResponse.json({ error: 'Contenu invalide' }, { status: 400 });
    }

    // 7. UUID validation
    if (!isValidUUID(boulangerie.id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    // 8. Compression WebP
    const compressed = await compressToWebP(rawBuffer);

    // 9. Supprimer l'ancienne image si elle existe
    const oldPathKey = type === 'hero' ? 'vitrine_hero_storage_path' : 'vitrine_about_storage_path';
    const oldPath = (boulangerie as Record<string, unknown>)[oldPathKey] as string | null;
    if (oldPath) {
      await admin.storage.from('vitrine-images').remove([oldPath]);
    }

    // 10. Upload
    const storagePath = `${boulangerie.id}/${type}.webp`;
    const { error: uploadErr } = await admin.storage
      .from('vitrine-images')
      .upload(storagePath, compressed, {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadErr) {
      console.error('[vitrine/upload] Erreur Storage :', uploadErr);
      return NextResponse.json({ error: 'Échec upload Storage' }, { status: 500 });
    }

    // 11. Mise à jour DB
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vitrine-images/${storagePath}`;
    const urlKey  = type === 'hero' ? 'vitrine_hero_image_url'    : 'vitrine_about_image_url';
    const pathKey = type === 'hero' ? 'vitrine_hero_storage_path' : 'vitrine_about_storage_path';

    await admin
      .from('boulangeries')
      .update({ [urlKey]: publicUrl, [pathKey]: storagePath })
      .eq('id', boulangerie.id);

    revalidatePath('/');

    return NextResponse.json({
      success: true,
      image_url: publicUrl,
      storage_path: storagePath,
      compressed_kb: Math.round(compressed.length / 1024),
      original_kb:   Math.round(rawBuffer.length / 1024),
    });

  } catch (err) {
    console.error('[POST /api/boulanger/vitrine/upload]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
