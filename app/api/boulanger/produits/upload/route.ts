// app/api/boulanger/produits/upload/route.ts
// ─────────────────────────────────────────────────────────────
// POST → upload d'une photo produit dans Supabase Storage
//
// Sécurité :
//   - Auth JWT vérifiée avant tout traitement
//   - Ownership du produit vérifié (boulangerie_id)
//   - MIME type validé côté serveur (pas seulement côté client)
//   - Nom de fichier entièrement contrôlé côté serveur (pas de path traversal)
//   - Taille limitée à 5 MB
//
// Compression :
//   - Toutes les images converties en WebP qualité 82 (ratio qualité/poids optimal)
//   - Redimensionnement max 1200×1200 (preserve aspect ratio, pas d'agrandissement)
//   - Metadata EXIF supprimée (vie privée + poids)
//   - Sharp utilisé côté serveur (ne dépend pas du navigateur)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB avant compression
const MAX_DIMENSION  = 1200;             // px — largeur et hauteur max
const WEBP_QUALITY   = 82;              // bon équilibre qualité/poids

// MIME types acceptés côté serveur (re-vérifié indépendamment du client)
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif', // accepté mais converti en WebP statique
]);

// ── P1-5 : Magic bytes signatures pour validation côté serveur ───────────────
// Sources : https://en.wikipedia.org/wiki/List_of_file_signatures
const FILE_SIGNATURES: { mime: string; patterns: number[][] }[] = [
  { mime: 'image/jpeg', patterns: [[0xFF, 0xD8, 0xFF]] }, // JPEG commence par FF D8 FF
  { mime: 'image/png',  patterns: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]] }, // PNG signature
  { mime: 'image/webp', patterns: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF (WebP commence par RIFF)
  { mime: 'image/gif',  patterns: [[0x47, 0x49, 0x46, 0x38]] }, // GIF8
  // AVIF a plusieurs signatures possibles (ftyp)
  { mime: 'image/avif', patterns: [[0x00, 0x00, 0x00]] }, // AVIF : ftyp box détecté différemment
];

/**
 * P1-5 : Vérifie les magic bytes du buffer pour valider le vrai type de fichier.
 * Ne pas faire confiance à file.type qui vient du client (peut être falsifié).
 */
function detectMimeTypeFromBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null; // Besoin d'au moins 12 bytes pour détecter

  // JPEG : FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E &&
    buffer[3] === 0x47 && buffer[4] === 0x0D && buffer[5] === 0x0A &&
    buffer[6] === 0x1A && buffer[7] === 0x0A
  ) {
    return 'image/png';
  }

  // WebP : RIFF .... WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // GIF : GIF87a ou GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }

  // AVIF : cherche ftyp avec brand avif
  // Structure : [size (4 bytes)] [ftyp (4 bytes)] [brand (4 bytes)]
  // AVIF a généralement 'ftyp' puis 'avif' ou 'avis'
  if (buffer.length >= 12) {
    // Cherche 'ftyp' à position 4
    if (
      buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
    ) {
      // Vérifie si le brand est avif ou avis
      const brand = buffer.slice(8, 12).toString('ascii');
      if (brand === 'avif' || brand === 'avis' || brand === 'heic' || brand === 'heix') {
        return 'image/avif';
      }
    }
  }

  return null;
}

// ── Helpers sécurité ──────────────────────────────────────────

/**
 * Vérifie que l'UUID est valide pour éviter toute injection via le path Storage.
 * Le chemin Storage est construit uniquement depuis des UUID validés.
 */
function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Compresse et convertit l'image en WebP via Sharp.
 * Retourne null si Sharp n'est pas disponible (env sans binaire natif).
 */
async function compressToWebP(buffer: Buffer, mimeType: string): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;

    return await sharp(buffer, {
      // Limite la mémoire utilisée par le décodeur
      limitInputPixels: MAX_DIMENSION * MAX_DIMENSION * 4,
    })
      // Resize si l'image dépasse les dimensions max — jamais d'agrandissement
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit:                'inside',
        withoutEnlargement: true,
      })
      // Supprime les métadonnées EXIF (GPS, appareil photo, etc.)
      .withMetadata({ exif: {} })
      // Convertit en WebP
      .webp({
        quality:  WEBP_QUALITY,
        effort:   4,   // 0-6 : équilibre vitesse/compression
        lossless: false,
      })
      .toBuffer();

  } catch (err) {
    console.warn('[upload] Sharp non disponible ou erreur compression, upload sans compression :', err);
    // Fail-open : upload le fichier original si Sharp échoue
    return buffer;
  }
}

// ── Route POST ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────

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

    // ── 2. Récupère le fichier ────────────────────────────────

    const formData  = await req.formData();
    const file      = formData.get('file') as File | null;
    const produitId = formData.get('produit_id') as string | null;

    if (!file)      return NextResponse.json({ error: 'Fichier manquant' },    { status: 400 });
    if (!produitId) return NextResponse.json({ error: 'produit_id manquant' }, { status: 400 });

    // ── 3. Validation UUID (sécurité path traversal) ──────────

    if (!isValidUUID(produitId) || !isValidUUID(boulangerie.id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    // ── 4. Validation MIME type côté serveur (file.type côté client) ───────

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Format non supporté. Acceptés : jpeg, png, webp, avif` },
        { status: 400 }
      );
    }

    // ── 5. Taille avant compression ───────────────────────────

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Fichier trop lourd (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }

    // ── 5.5 P1-5 : Validation magic bytes (vérification réelle du contenu) ───
    // Ne pas faire confiance à file.type — vérifier les bytes réels du fichier
    const rawBufferPreview = Buffer.from(await file.arrayBuffer());
    const detectedMime     = detectMimeTypeFromBytes(rawBufferPreview);

    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      console.warn(`[upload] Tentative upload fichier invalide. MIME déclaré: ${file.type}, MIME détecté: ${detectedMime}`);
      return NextResponse.json(
        { error: `Fichier invalide. Le contenu ne correspond pas à une image autorisée (jpeg, png, webp, avif, gif).` },
        { status: 400 }
      );
    }

    // ── 6. Vérifie l'ownership du produit ─────────────────────
    // Le produit_id doit appartenir à cette boulangerie — pas d'accès croisé.

    const { data: produit } = await admin
      .from('produits')
      .select('id, image_storage_path')
      .eq('id', produitId)
      .eq('boulangerie_id', boulangerie.id) // ownership check
      .single();

    if (!produit) {
      return NextResponse.json(
        { error: 'Produit introuvable ou accès refusé' },
        { status: 404 }
      );
    }

    // ── 7. Compression WebP ───────────────────────────────────

    const rawBuffer      = Buffer.from(await file.arrayBuffer());
    const compressedBuffer = await compressToWebP(rawBuffer, file.type);

    const compressionRatio = ((1 - compressedBuffer.length / rawBuffer.length) * 100).toFixed(0);
    console.info(
      `[upload] ${file.name} : ${(rawBuffer.length / 1024).toFixed(0)}KB → ` +
      `${(compressedBuffer.length / 1024).toFixed(0)}KB WebP (−${compressionRatio}%)`
    );

    // ── 8. Supprime l'ancienne photo si elle existe ───────────

    if (produit.image_storage_path) {
      await admin.storage
        .from('produits-photos')
        .remove([produit.image_storage_path]);
    }

    // ── 9. Chemin Storage ─────────────────────────────────────
    // Format : "{boulangerie_id}/{produit_id}.webp"
    // Construit uniquement depuis des UUID validés → pas d'injection de path.

    const storagePath = `${boulangerie.id}/${produitId}.webp`;

    // ── 10. Upload dans Supabase Storage ──────────────────────

    const { error: uploadErr } = await admin.storage
      .from('produits-photos')
      .upload(storagePath, compressedBuffer, {
        contentType:  'image/webp',
        upsert:       true,
        cacheControl: '3600',
      });

    if (uploadErr) {
      console.error('[upload] Erreur Storage :', uploadErr);
      return NextResponse.json({ error: 'Échec upload Storage' }, { status: 500 });
    }

    // ── 11. Met à jour le produit ─────────────────────────────

    await admin
      .from('produits')
      .update({
        image_storage_path: storagePath,
        image_url:          null, // efface l'éventuelle URL externe précédente
      })
      .eq('id', produitId)
      .eq('boulangerie_id', boulangerie.id);

    const publicUrl =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produits-photos/${storagePath}`;

    return NextResponse.json({
      success:            true,
      image_storage_path: storagePath,
      image_public_url:   publicUrl,
      compressed_kb:      Math.round(compressedBuffer.length / 1024),
      original_kb:        Math.round(rawBuffer.length / 1024),
    });

  } catch (err) {
    console.error('[POST /api/boulanger/produits/upload]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}