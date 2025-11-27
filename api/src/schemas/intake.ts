import { z } from 'zod';

const identitySchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const workAuthSchema = z.object({
  visa_type: z.string().optional(),
  sponsorship_required: z.boolean().optional(),
});

const preferencesSchema = z.object({
  remote: z.boolean().optional(),
  locations: z.array(z.string()).optional(),
  salary_min: z.number().optional(),
  salary_currency: z.string().optional(),
  start_date: z.string().optional(),
});

const profileSchema = z
  .object({
    identity: identitySchema.optional(),
    work_auth: workAuthSchema.optional(),
    preferences: preferencesSchema.optional(),
  })
  .partial();

const complianceSchema = z
  .object({
    veteran_status: z.string().optional(),
    disability_status: z.string().optional(),
    criminal_history_policy: z.string().optional(),
  })
  .partial();

const historySchema = z
  .object({
    employment: z.array(z.record(z.any())).optional(),
    education: z.array(z.record(z.any())).optional(),
  })
  .partial();

const policiesSchema = z
  .object({
    eeo: z.string().optional(),
    salary: z.string().optional(),
    relocation: z.string().optional(),
    work_shift: z.string().optional(),
  })
  .partial();

export const resumeMetadataSchema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number().nonnegative(),
  pageCount: z.number().int().positive().optional(),
  wordCount: z.number().int().positive().optional(),
  language: z.string().optional(),
});

export const intakeRequestSchema = z.object({
  resumeText: z.string().min(1, 'resumeText is required'),
  resumeMetadata: resumeMetadataSchema,
  conversation: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .default([]),
  knownFields: z
    .object({
      profile: profileSchema.optional(),
      compliance: complianceSchema.optional(),
      history: historySchema.optional(),
      policies: policiesSchema.optional(),
    })
    .optional(),
  missingFields: z.array(z.string()).optional(),
});

export type IntakeRequestInput = z.infer<typeof intakeRequestSchema>;


