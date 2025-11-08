import 'fake-indexeddb/auto';

import { describe, expect, it, beforeEach } from 'vitest';

import type { ProfileVault } from '@/lib/types';
import { VAULT_STORES } from './constants';
import { getEncryptedValue } from './db';
import { vaultService } from './service';

const SAMPLE_PROFILE: ProfileVault['profile'] = {
  identity: {
    first_name: 'Ada',
    last_name: 'Lovelace',
    phone: '+1-555-0000',
    email: 'ada@example.com',
    address: 'London, UK',
  },
  work_auth: {
    visa_type: 'Citizen',
    sponsorship_required: false,
  },
  preferences: {
    remote: true,
    locations: ['London', 'Remote'],
    salary_min: 120000,
    start_date: '2025-01-01',
  },
};

const SAMPLE_POLICIES: ProfileVault['policies'] = {
  eeo: 'answer',
  salary: 'answer',
  relocation: 'ask_if_required',
  work_shift: 'skip_if_optional',
};

const PASSWORD = 'SuperSecurePassword!123';

describe('vaultService', () => {
  beforeEach(async () => {
    await vaultService.clearAll();
  });

  it('saves and retrieves profile data with encryption', async () => {
    await vaultService.save(VAULT_STORES.profile, SAMPLE_PROFILE, PASSWORD);

    const stored = await getEncryptedValue(VAULT_STORES.profile);
    expect(stored).toBeTruthy();
    expect(stored?.ciphertext).toBeDefined();
    expect(stored?.ciphertext).not.toContain('Ada');

    const retrieved = await vaultService.load(VAULT_STORES.profile, PASSWORD);
    expect(retrieved).toEqual(SAMPLE_PROFILE);
  });

  it('validates schema before persisting', async () => {
    const invalidProfile = {
      ...SAMPLE_PROFILE,
      identity: { ...SAMPLE_PROFILE.identity, email: 'not-an-email' },
    } as unknown as ProfileVault['profile'];

    await expect(
      vaultService.save(VAULT_STORES.profile, invalidProfile, PASSWORD)
    ).rejects.toThrow();
  });

  it('exports and imports encrypted vault data', async () => {
    await vaultService.save(VAULT_STORES.profile, SAMPLE_PROFILE, PASSWORD);
    await vaultService.save(VAULT_STORES.policies, SAMPLE_POLICIES, PASSWORD);

    const exported = await vaultService.export(PASSWORD);
    expect(exported.version).toBeGreaterThanOrEqual(1);
    expect(exported.stores[VAULT_STORES.profile]).toBeTruthy();

    await vaultService.clearAll();

    await vaultService.import(exported, PASSWORD);

    const profile = await vaultService.load(VAULT_STORES.profile, PASSWORD);
    const policies = await vaultService.load(VAULT_STORES.policies, PASSWORD);

    expect(profile).toEqual(SAMPLE_PROFILE);
    expect(policies).toEqual(SAMPLE_POLICIES);
  });

  it('throws when importing with incorrect password', async () => {
    await vaultService.save(VAULT_STORES.profile, SAMPLE_PROFILE, PASSWORD);
    const exported = await vaultService.export(PASSWORD);
    await vaultService.clearAll();

    await expect(vaultService.import(exported, 'wrong-password')).rejects.toThrow(
      /Unable to decrypt/
    );
  });
});
