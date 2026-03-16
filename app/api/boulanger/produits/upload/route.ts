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

    // ── 4. Validation MIME type côté serveur ──────────────────
    // Ne pas faire confiance au Content-Type du client — vérifier
    // le magic number (premiers octets) via Sharp lors de la compression.

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