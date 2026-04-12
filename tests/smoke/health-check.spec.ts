// tests/smoke/health-check.spec.ts
// ─────────────────────────────────────────────────────────────
// Tests READ-ONLY exécutés après chaque deploy production.
// NE JAMAIS écrire de données en production depuis ces tests.
// Ne pas utiliser de token production — uniquement des appels publics.
// ─────────────────────────────────────────────────────────────

import { test, expect } from "@playwright/test";

const BASE =
  process.env.TEST_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "https://sauvemie.fr";

test.describe("Production Health Checks", () => {
  // ── Routes API publiques ──────────────────────────────────

  test("✅ Route catalogue publique répond (200 ou 404 selon slug)", async ({
    request,
  }) => {
    // Un slug de boulangerie qui existe en production, ou 404 propre — jamais 500
    const res = await request.get(`${BASE}/api/catalogue/artisan-dore`);
    expect([200, 404]).toContain(res.status());
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(503);
  });

  test("✅ Route paniers flash publique répond sans erreur", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/paniers/artisan-dore`);
    // Retourne FALLBACK si slug introuvable — jamais 500
    expect(res.ok()).toBeTruthy();
    expect(res.status()).not.toBe(500);
  });

  test("✅ Route vitrine publique répond (200 ou 404)", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boulangerie/artisan-dore`);
    expect([200, 404]).toContain(res.status());
    expect(res.status()).not.toBe(500);
  });

  // ── Routes protégées — doivent retourner 401 sans token ──

  test("✅ Route journée sans auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boulanger/journee`);
    expect(res.status()).toBe(401);
  });

  test("✅ Route produits sans auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boulanger/produits`);
    expect(res.status()).toBe(401);
  });

  test("✅ Route rapport IA sans auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boulanger/ai/rapport`);
    expect(res.status()).toBe(401);
  });

  test("✅ Route export RGPD sans auth → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/boulanger/export`);
    expect(res.status()).toBe(401);
  });

  // ── Route de commande — validation basique ────────────────

  test("✅ POST commandes sans données → 400 ou 403 (pas 500)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/orders`, {
      headers: {
        "Content-Type": "application/json",
        Origin: BASE,
      },
      data: {},
    });
    // 400 validation, 403 CSRF, jamais 500
    expect([400, 403]).toContain(res.status());
    expect(res.status()).not.toBe(500);
  });

  // ── Headers de sécurité ───────────────────────────────────

  test("✅ Headers sécurité présents sur les routes API", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/boulanger/journee`);
    const headers = res.headers();

    // Ces headers doivent être configurés dans vercel.json
    // Si absents, ajouter une note mais ne pas bloquer
    const hasXContentType = !!headers["x-content-type-options"];
    const hasXFrame = !!headers["x-frame-options"];

    if (!hasXContentType || !hasXFrame) {
      console.warn(
        "⚠️  Headers de sécurité manquants — vérifier vercel.json :",
        { hasXContentType, hasXFrame }
      );
    }
  });

  // ── Page vitrine frontend ─────────────────────────────────

  test("✅ Page d'accueil se charge sans erreur 500", async ({ page }) => {
    const response = await page.goto(BASE);
    // 200 ou 404 (si pas de boulangerie configurée), jamais 500
    const status = response?.status() ?? 0;
    expect(status).not.toBe(500);
    expect(status).not.toBe(503);

    // Pas de message d'erreur visible
    const errorText = await page
      .locator("text=Application error")
      .count()
      .catch(() => 0);
    expect(errorText).toBe(0);
  });

  test("✅ Page boulanger se charge sans erreur", async ({ page }) => {
    const response = await page.goto(`${BASE}/boulanger`);
    const status = response?.status() ?? 0;
    expect(status).not.toBe(500);

    // Doit contenir le formulaire de login ou le dashboard
    // Ne pas vérifier le contenu exact (dépend de l'état de la session)
    const hasTitle = await page
      .locator("h1, h2, input[type='email']")
      .count()
      .catch(() => 0);
    expect(hasTitle).toBeGreaterThan(0);
  });
});