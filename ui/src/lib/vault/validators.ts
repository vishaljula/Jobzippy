import { z } from 'zod';

import { VAULT_STORES } from './constants';
import type { VaultDataStoreKey, VaultValue } from './types';

const identitySchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string(),
  email: z.string().email(),
  address: z.string(),
});

const workAuthSchema = z.object({
  visa_type: z.string(),
  sponsorship_required: z.boolean(),
});

const preferencesSchema = z.object({
  remote: z.boolean(),
  locations: z.array(z.string()),
  salary_min: z.number(),
  start_date: z.string(),
});

const profileSchema = z.object({
  identity: identitySchema,
  work_auth: workAuthSchema,
  preferences: preferencesSchema,
});

const complianceChoice = z.enum(['yes', 'no', 'prefer_not']);
const complianceSchema = z.object({
  veteran_status: complianceChoice,
  disability_status: complianceChoice,
  criminal_history_policy: z.enum(['answer', 'skip_if_optional', 'ask_if_required', 'never']),
});

const employmentHistorySchema = z.object({
  company: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  duties: z.string(),
  city: z.string(),
  state: z.string(),
});

const educationSchema = z.object({
  school: z.string(),
  degree: z.string(),
  field: z.string(),
  start: z.string(),
  end: z.string(),
});

const historySchema = z.object({
  employment: z.array(employmentHistorySchema),
  education: z.array(educationSchema),
});

const policyChoice = z.enum(['answer', 'skip_if_optional', 'ask_if_required', 'never']);
const policiesSchema = z.object({
  eeo: policyChoice,
  salary: policyChoice,
  relocation: policyChoice,
  work_shift: policyChoice,
});

type ValidatorMap = {
  [VAULT_STORES.profile]: typeof profileSchema;
  [VAULT_STORES.compliance]: typeof complianceSchema;
  [VAULT_STORES.history]: typeof historySchema;
  [VAULT_STORES.policies]: typeof policiesSchema;
};

const validators: ValidatorMap = {
  [VAULT_STORES.profile]: profileSchema,
  [VAULT_STORES.compliance]: complianceSchema,
  [VAULT_STORES.history]: historySchema,
  [VAULT_STORES.policies]: policiesSchema,
};

export function validateVaultValue<T extends VaultDataStoreKey>(
  store: T,
  value: unknown
): VaultValue<T> {
  const schema = validators[store as keyof ValidatorMap];
  return schema.parse(value) as VaultValue<T>;
}
