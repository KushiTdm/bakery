// tests/auth/register.spec.ts
// Tests d'inscription boulanger
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { registerViaApi, loginViaApi } from '../helpers/auth-helpers';
import {
  createTestUser,
  TEST_PASSWORD_WEAK,
  RESERVED_SLUGS,
  INVALID_SLUGS,
} from '../fixtures/test-data';

test.describe('Inscription Boulanger', () => {
  test.describe('API Tests', () => {
    test('✅ Inscription réussie avec données valides', async ({ request }) => {
      const testUser = createTestUser();

      const { response, error, user } = await registerViaApi(request, testUser);

      // Vérifier qu'il n'y a pas d'erreur
      expect(error).toBeNull();
      expect(response).not.toBeNull();

      // Vérifier la structure de la réponse
      expect(response!.access_token).toBeDefined();
      expect(response!.refresh_token).toBeDefined();
      expect(response!.user.email).toBe(user.email);
      expect(response!.boulangerie).not.toBeNull();
      expect(response!.boulangerie!.nom).toBe(user.nom);
      expect(response!.boulangerie!.slug).toBe(user.slug);
      expect(response!.boulangerie!.plan).toBe('starter');

      // Vérifier qu'on peut se connecter avec les identifiants
      const loginResult = await loginViaApi(request, user.email, user.password);
      expect(loginResult.error).toBeNull();
      expect(loginResult.response!.access_token).toBeDefined();
    });

    test('❌ Erreur : email invalide', async ({ request }) => {
      const testUser = createTestUser();
      testUser.email = 'not-an-email';

      const { response, error } = await registerViaApi(request, testUser);

      expect(response).toBeNull();
      expect(error).toBeDefined();
      expect(error).toContain('invalide');
    });

    test('❌ Erreur : mot de passe trop faible (< 8 caractères)', async ({ request }) => {
      const testUser = createTestUser();
      testUser.password = 'Test1'; // 5 caractères

      const { response, error } = await registerViaApi(request, testUser);

      expect(response).toBeNull();
      expect(error).toBeDefined();
      expect(error).toContain('8 caractères');
    });

    test('❌ Erreur : mot de passe sans majuscule', async ({ request }) => {
      const testUser = createTestUser();
      testUser.password = 'testpass123'; // Pas de majuscule

      const { response, error } = await registerViaApi(request, testUser);

      expect(response).toBeNull();
      expect(error).toBeDefined();
      expect(error).toContain('majuscule');
    });

    test('❌ Erreur : mot de passe sans chiffre', async ({ request }) => {
      const testUser = createTestUser();
      testUser.password = 'TestPassword'; // Pas de chiffre

      const { response, error } = await registerViaApi(request, testUser);

      expect(response).toBeNull();
      expect(error).toBeDefined();
      expect(error).toContain('chiffre');
    });

    test('❌ Erreur : slug déjà utilisé', async ({ request }) => {
      const testUser1 = createTestUser();
      const testUser2 = createTestUser();

      // Première inscription
      const { response: response1 } = await registerViaApi(request, testUser1);
      expect(response1).not.toBeNull();

      // Deuxième inscription avec le même slug
      testUser2.slug = testUser1.slug;
      const { response: response2, error: error2 } = await registerViaApi(request, testUser2);

      expect(response2).toBeNull();
      expect(error2).toBeDefined();
      expect(error2).toContain('slug');
    });

    test('❌ Erreur : slug réservé', async ({ request }) => {
      const testUser = createTestUser();
      testUser.slug = RESERVED_SLUGS[0]; // 'api'

      const { response, error } = await registerViaApi(request, testUser);

      expect(response).toBeNull();
      expect(error).toBeDefined();
      expect(error!.toLowerCase()).toContain('slug');
    });

    test('❌ Erreur : slug avec format invalide', async ({ request }) => {
      const testUser = createTestUser();
      testUser.slug = INVALID_SLUGS[0]; // 'With-Uppercase'

      const { response, error } = await registerViaApi(request, testUser);

      expect(response).toBeNull();
      expect(error).toBeDefined();
      expect(error!.toLowerCase()).toContain('slug');
    });
  });

  test.describe('UI Tests', () => {
    test.skip('📋 Formulaire visible sur /boulanger', async ({ page }) => {
      await page.goto('/boulanger');

      // Vérifier le formulaire de login (pas de page register séparée en UI)
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });
  });
});

test.describe('Login Boulanger', () => {
  test('✅ Connexion réussie après inscription', async ({ request }) => {
    // Créer un utilisateur
    const testUser = createTestUser();
    const { response: registerResponse } = await registerViaApi(request, testUser);
    expect(registerResponse).not.toBeNull();

    // Se connecter
    const { response: loginResponse, error } = await loginViaApi(
      request,
      testUser.email,
      testUser.password
    );

    expect(error).toBeNull();
    expect(loginResponse).not.toBeNull();
    expect(loginResponse!.access_token).toBeDefined();
    expect(loginResponse!.user.email).toBe(testUser.email);
  });

  test('❌ Erreur : mauvais mot de passe', async ({ request }) => {
    // Créer un utilisateur
    const testUser = createTestUser();
    await registerViaApi(request, testUser);

    // Tenter de se connecter avec un mauvais mot de passe
    const { response, error } = await loginViaApi(
      request,
      testUser.email,
      'WrongPassword123'
    );

    expect(response).toBeNull();
    expect(error).toBeDefined();
  });

  test('❌ Erreur : utilisateur inexistant', async ({ request }) => {
    const { response, error } = await loginViaApi(
      request,
      'nonexistent@example.com',
      'SomePassword123'
    );

    expect(response).toBeNull();
    expect(error).toBeDefined();
  });
});