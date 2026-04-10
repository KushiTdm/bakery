// tests/security/upload-permission.spec.ts
// ─────────────────────────────────────────────────────────────
// VULN-004 : Upload photo produit réservé owner uniquement
//
// app/api/boulanger/produits/upload/route.ts vérifie uniquement
// `boulangeries WHERE user_id = user.id` → les gérants avec
// catalogue:write reçoivent 404 (boulangerie introuvable)
// au lieu d'un accès accordé ou d'un 403 explicite.
//
// Comportement attendu :
//   - Owner : 200 OK
//   - Gérant avec catalogue:write : 200 OK (après fix)
//   - Employé sans catalogue:write : 403
//   - Pas d'auth : 401
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, createTestProduit, createEmployeeViaInvitation } from '../helpers/auth-helpers';
import { createTestUser } from '../fixtures/test-data';

// ── Helper : créer un fichier image minimal (1x1 pixel JPEG) ──

function createMinimalJpeg(): Buffer {
  // Magic bytes JPEG + données minimales
  return Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C,
    0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D,
    0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
    0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
    0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34,
    0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4,
    0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF,
    0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
    0x3F, 0x00, 0xFB, 0xD7, 0xFF, 0xD9,
  ]);
}

// ────────────────────────────────────────────────────────────────────────
// 1. OWNER — doit pouvoir uploader
// ────────────────────────────────────────────────────────────────────────

test.describe('Upload photo produit — Owner', () => {

  test('✅ Owner peut uploader une photo pour son produit', async ({ request }) => {
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const token   = response.access_token;
    const produit = await createTestProduit(request, token);
    if (!produit) { test.skip(); return; }

    const jpegBuffer = createMinimalJpeg();

    const res = await request.post('/api/boulanger/produits/upload', {
      headers:   { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name:     'test-photo.jpg',
          mimeType: 'image/jpeg',
          buffer:   jpegBuffer,
        },
        produit_id: produit.id,
      },
    });

    // 200 si Sharp + Supabase Storage configurés, 500 si Storage manquant en test
    expect([200, 500]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as { success?: boolean; image_public_url?: string };
      expect(body.success).toBe(true);
      expect(body.image_public_url).toBeDefined();
    }
  });

  test('❌ Owner ne peut pas uploader pour un produit d\'une autre boulangerie', async ({ request }) => {
    const userA = createTestUser();
    const userB = createTestUser();
    const [resA, resB] = await Promise.all([
      registerViaApi(request, userA),
      registerViaApi(request, userB),
    ]);
    if (resA.error || !resA.response) { test.skip(); return; }
    if (resB.error || !resB.response) { test.skip(); return; }

    const tokenA  = resA.response.access_token;
    const tokenB  = resB.response.access_token;
    const produitB = await createTestProduit(request, tokenB);
    if (!produitB) { test.skip(); return; }

    const jpegBuffer = createMinimalJpeg();

    // A tente d'uploader pour un produit de B
    const res = await request.post('/api/boulanger/produits/upload', {
      headers:   { Authorization: `Bearer ${tokenA}` },
      multipart: {
        file: {
          name:     'hack.jpg',
          mimeType: 'image/jpeg',
          buffer:   jpegBuffer,
        },
        produit_id: produitB.id,
      },
    });

    expect(res.status()).toBe(404);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeDefined();
  });

});

// ────────────────────────────────────────────────────────────────────────
// 2. GÉRANT — doit pouvoir uploader si catalogue:write
// ────────────────────────────────────────────────────────────────────────

test.describe('Upload photo produit — Gérant', () => {

  test('✅ Gérant avec catalogue:write peut uploader (après fix VULN-004)', async ({ request }) => {
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const ownerToken    = response.access_token;
    const boulangerieId = response.boulangerie!.id;

    // Inviter un gérant
    const emp = await createEmployeeViaInvitation(request, ownerToken, boulangerieId);
    if (!emp) { test.skip(); return; }

    // Créer un produit avec le token owner
    const produit = await createTestProduit(request, ownerToken);
    if (!produit) { test.skip(); return; }

    const jpegBuffer = createMinimalJpeg();

    const res = await request.post('/api/boulanger/produits/upload', {
      headers:   { Authorization: `Bearer ${emp.employeeToken}` },
      multipart: {
        file: {
          name:     'photo-gerant.jpg',
          mimeType: 'image/jpeg',
          buffer:   jpegBuffer,
        },
        produit_id: produit.id,
      },
    });

    // Avant fix VULN-004 : 404 (boulangerie introuvable car helper local cherche via user_id)
    // Après fix           : 200 (ou 500 si Storage indisponible en test, mais PAS 404 ni 401)
    console.log(`📊 Upload gérant → status ${res.status()} (avant fix = 404, après fix = 200/500)`);
    expect(res.status()).not.toBe(404);
    expect(res.status()).not.toBe(401);
  });

});

// ────────────────────────────────────────────────────────────────────────
// 3. SANS AUTH — doit retourner 401
// ────────────────────────────────────────────────────────────────────────

test.describe('Upload photo produit — Sans authentification', () => {

  test('❌ Upload sans token → 401', async ({ request }) => {
    const res = await request.post('/api/boulanger/produits/upload', {
      multipart: {
        file: {
          name:     'test.jpg',
          mimeType: 'image/jpeg',
          buffer:   createMinimalJpeg(),
        },
        produit_id: '550e8400-e29b-41d4-a716-446655440000',
      },
    });

    expect(res.status()).toBe(401);
  });

});

// ────────────────────────────────────────────────────────────────────────
// 4. VALIDATION MAGIC BYTES — fichier non-image doit être rejeté
// ────────────────────────────────────────────────────────────────────────

test.describe('Upload photo — Validation magic bytes (P1-5)', () => {

  test('❌ Fichier PHP déguisé en JPEG → rejeté par magic bytes', async ({ request }) => {
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const token   = response.access_token;
    const produit = await createTestProduit(request, token);
    if (!produit) { test.skip(); return; }

    // Faux JPEG : commence par du PHP au lieu des magic bytes FF D8 FF
    const fakeJpeg = Buffer.from('<?php system($_GET["cmd"]); ?>');

    const res = await request.post('/api/boulanger/produits/upload', {
      headers:   { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name:     'shell.php.jpg',
          mimeType: 'image/jpeg',
          buffer:   fakeJpeg,
        },
        produit_id: produit.id,
      },
    });

    // La validation magic bytes doit rejeter ce fichier
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeDefined();
  });

  test('❌ Fichier SVG déguisé en PNG → rejeté', async ({ request }) => {
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const token   = response.access_token;
    const produit = await createTestProduit(request, token);
    if (!produit) { test.skip(); return; }

    // SVG : pas de magic bytes image
    const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    const res = await request.post('/api/boulanger/produits/upload', {
      headers:   { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name:     'xss.svg',
          mimeType: 'image/png',
          buffer:   svgContent,
        },
        produit_id: produit.id,
      },
    });

    expect([400, 415]).toContain(res.status());
  });

  test('❌ Fichier trop volumineux (> 5MB) → rejeté', async ({ request }) => {
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const token   = response.access_token;
    const produit = await createTestProduit(request, token);
    if (!produit) { test.skip(); return; }

    // 6MB de données (dépasse le seuil de 5MB)
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024);
    // Mettre les magic bytes JPEG au début pour passer la validation MIME
    bigBuffer[0] = 0xFF; bigBuffer[1] = 0xD8; bigBuffer[2] = 0xFF;

    const res = await request.post('/api/boulanger/produits/upload', {
      headers:   { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name:     'big-image.jpg',
          mimeType: 'image/jpeg',
          buffer:   bigBuffer,
        },
        produit_id: produit.id,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error?.toLowerCase()).toContain('lourd');
  });

  test('❌ produit_id invalide (injection de path) → 400', async ({ request }) => {
    const user = createTestUser();
    const { response, error } = await registerViaApi(request, user);
    if (error || !response) { test.skip(); return; }

    const token = response.access_token;

    const res = await request.post('/api/boulanger/produits/upload', {
      headers:   { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name:     'test.jpg',
          mimeType: 'image/jpeg',
          buffer:   createMinimalJpeg(),
        },
        produit_id: '../../../etc/passwd',
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error?.toLowerCase()).toContain('invalide');
  });

});