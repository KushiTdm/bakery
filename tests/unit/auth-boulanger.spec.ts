// tests/unit/auth-boulanger.spec.ts
// Tests unitaires pour lib/auth-boulanger.ts (helpers de permissions)
// ─────────────────────────────────────────────────────────────
//
// On teste les fonctions pures exportées :
//   - canAccess()
//   - isOwner()
//   - isManager()
//
// Les fonctions async (getBoulangerSession, checkMemberLimit) sont
// testées via les tests d'intégration API.
// ─────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';
import { canAccess, isOwner, isManager } from '../../lib/auth-boulanger';
import { DEFAULT_PERMISSIONS } from '../../lib/types';
import type { BoulangerSession } from '../../lib/auth-boulanger';

// ── Fixtures sessions ─────────────────────────────────────────

const ownerSession: BoulangerSession = {
  userId:        'user-owner-123',
  boulangerieId: 'boul-123',
  role:          'owner',
  permissions:   DEFAULT_PERMISSIONS.owner,
};

const gerantSession: BoulangerSession = {
  userId:        'user-gerant-456',
  boulangerieId: 'boul-123',
  role:          'gerant',
  permissions:   DEFAULT_PERMISSIONS.gerant,
  memberId:      'membre-456',
};

const employeSession: BoulangerSession = {
  userId:        'user-employe-789',
  boulangerieId: 'boul-123',
  role:          'employe',
  permissions:   DEFAULT_PERMISSIONS.employe,
  memberId:      'membre-789',
};

// ── isOwner ───────────────────────────────────────────────────

test.describe('isOwner', () => {
  test('✅ Owner reconnu', () => {
    expect(isOwner(ownerSession)).toBe(true);
  });

  test('❌ Gérant n\'est pas owner', () => {
    expect(isOwner(gerantSession)).toBe(false);
  });

  test('❌ Employé n\'est pas owner', () => {
    expect(isOwner(employeSession)).toBe(false);
  });

  test('❌ null retourne false', () => {
    expect(isOwner(null)).toBe(false);
  });
});

// ── isManager ─────────────────────────────────────────────────

test.describe('isManager', () => {
  test('✅ Owner est manager', () => {
    expect(isManager(ownerSession)).toBe(true);
  });

  test('✅ Gérant est manager', () => {
    expect(isManager(gerantSession)).toBe(true);
  });

  test('❌ Employé n\'est pas manager', () => {
    expect(isManager(employeSession)).toBe(false);
  });

  test('❌ null retourne false', () => {
    expect(isManager(null)).toBe(false);
  });
});

// ── canAccess ─────────────────────────────────────────────────

test.describe('canAccess - Owner', () => {
  test('✅ Owner peut écrire partout', () => {
    const features = ['matin', 'snapshot', 'soir', 'flash', 'catalogue', 'dashboard', 'commandes', 'parametres', 'equipe', 'plan'] as const;
    for (const feature of features) {
      expect(canAccess(ownerSession, feature, 'write')).toBe(true);
      expect(canAccess(ownerSession, feature, 'read')).toBe(true);
    }
  });

  test('✅ Owner : permission "none" toujours satisfaite', () => {
    expect(canAccess(ownerSession, 'catalogue', 'none')).toBe(true);
  });
});

test.describe('canAccess - Gérant', () => {
  test('✅ Gérant peut écrire sur les features métier', () => {
    const writeable = ['matin', 'snapshot', 'soir', 'flash', 'catalogue', 'dashboard', 'commandes', 'parametres'] as const;
    for (const feature of writeable) {
      expect(canAccess(gerantSession, feature, 'write')).toBe(true);
    }
  });

  test('✅ Gérant peut lire l\'équipe', () => {
    expect(canAccess(gerantSession, 'equipe', 'read')).toBe(true);
  });

  test('❌ Gérant ne peut pas écrire sur l\'équipe', () => {
    expect(canAccess(gerantSession, 'equipe', 'write')).toBe(false);
  });

  test('❌ Gérant n\'a pas accès au plan', () => {
    expect(canAccess(gerantSession, 'plan', 'read')).toBe(false);
    expect(canAccess(gerantSession, 'plan', 'write')).toBe(false);
  });
});

test.describe('canAccess - Employé', () => {
  test('✅ Employé peut écrire les snapshots et commandes', () => {
    expect(canAccess(employeSession, 'snapshot', 'write')).toBe(true);
    expect(canAccess(employeSession, 'commandes', 'write')).toBe(true);
  });

  test('✅ Employé peut lire le catalogue et flash', () => {
    expect(canAccess(employeSession, 'catalogue', 'read')).toBe(true);
    expect(canAccess(employeSession, 'flash', 'read')).toBe(true);
  });

  test('❌ Employé ne peut pas écrire le catalogue', () => {
    expect(canAccess(employeSession, 'catalogue', 'write')).toBe(false);
  });

  test('❌ Employé ne peut pas accéder au matin (production)', () => {
    expect(canAccess(employeSession, 'matin', 'read')).toBe(false);
    expect(canAccess(employeSession, 'matin', 'write')).toBe(false);
  });

  test('❌ Employé ne peut pas accéder au dashboard', () => {
    expect(canAccess(employeSession, 'dashboard', 'read')).toBe(false);
    expect(canAccess(employeSession, 'dashboard', 'write')).toBe(false);
  });

  test('❌ Employé ne peut pas accéder aux paramètres', () => {
    expect(canAccess(employeSession, 'parametres', 'read')).toBe(false);
    expect(canAccess(employeSession, 'parametres', 'write')).toBe(false);
  });

  test('❌ Employé ne peut pas accéder à l\'équipe', () => {
    expect(canAccess(employeSession, 'equipe', 'read')).toBe(false);
    expect(canAccess(employeSession, 'equipe', 'write')).toBe(false);
  });

  test('❌ Employé ne peut pas accéder au plan', () => {
    expect(canAccess(employeSession, 'plan', 'read')).toBe(false);
    expect(canAccess(employeSession, 'plan', 'write')).toBe(false);
  });
});

test.describe('canAccess - Session null', () => {
  test('❌ null session → toujours false', () => {
    expect(canAccess(null, 'catalogue', 'read')).toBe(false);
    expect(canAccess(null, 'matin', 'write')).toBe(false);
    expect(canAccess(null, 'plan', 'none')).toBe(false);
  });
});

// ── Hiérarchie des niveaux de permission ─────────────────────

test.describe('Hiérarchie write > read > none', () => {
  test('✅ write satisfait read', () => {
    // L\'owner a write sur tout → doit satisfaire read aussi
    expect(canAccess(ownerSession, 'catalogue', 'read')).toBe(true);
  });

  test('✅ write satisfait write', () => {
    expect(canAccess(ownerSession, 'catalogue', 'write')).toBe(true);
  });

  test('✅ read satisfait read', () => {
    // Gérant a read sur equipe
    expect(canAccess(gerantSession, 'equipe', 'read')).toBe(true);
  });

  test('❌ read ne satisfait pas write', () => {
    // Gérant a read sur equipe, pas write
    expect(canAccess(gerantSession, 'equipe', 'write')).toBe(false);
  });

  test('❌ none ne satisfait ni read ni write', () => {
    // Employé a none sur matin
    expect(canAccess(employeSession, 'matin', 'none')).toBe(true);  // none est toujours ok
    expect(canAccess(employeSession, 'matin', 'read')).toBe(false);
    expect(canAccess(employeSession, 'matin', 'write')).toBe(false);
  });
});