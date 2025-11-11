import { API_CONFIG } from '@/lib/config';
import { VAULT_STORES } from '@/lib/vault/constants';
import { vaultService } from '@/lib/vault/service';
import { intakeAgentConfig, INTAKE_STATUS_STEPS } from './config';
import { extractResumeWithProgress } from './extractors';
import { runLocalIntakeLLM } from './llm';
import type {
  IntakeAgentDependencies,
  IntakeKnownFields,
  IntakeLLMRequestPayload,
  IntakeProcessResult,
  IntakeProgressUpdate,
  ResumeExtractionResult,
  IntakeConversationMessage,
} from './types';

function isValueMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) || value === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function getValueAtPath(source: unknown, path: string): unknown {
  if (!source) return undefined;
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc === undefined || acc === null) {
      return undefined;
    }
    if (Array.isArray(acc)) {
      return acc;
    }
    if (typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

async function loadKnownFields(password: string): Promise<IntakeKnownFields | undefined> {
  const [profile, compliance, history, policies] = await Promise.all([
    vaultService.load(VAULT_STORES.profile, password).catch(() => null),
    vaultService.load(VAULT_STORES.compliance, password).catch(() => null),
    vaultService.load(VAULT_STORES.history, password).catch(() => null),
    vaultService.load(VAULT_STORES.policies, password).catch(() => null),
  ]);

  const known: IntakeKnownFields = {};
  if (profile) known.profile = profile;
  if (compliance) known.compliance = compliance;
  if (history) known.history = history;
  if (policies) known.policies = policies;

  return Object.keys(known).length > 0 ? known : undefined;
}

function computeMissingFields(knownFields?: IntakeKnownFields): string[] {
  return intakeAgentConfig.fieldMappings
    .filter((mapping) => {
      const value = getValueAtPath(knownFields, mapping.path);
      return isValueMissing(value);
    })
    .map((mapping) => mapping.path);
}

async function callIntakeEndpoint(payload: IntakeLLMRequestPayload) {
  const response = await fetch(`${API_CONFIG.baseUrl}/intake/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to parse resume');
  }

  return (await response.json()) as IntakeProcessResult['llm'];
}

async function runLLMWithFallback(
  extraction: ResumeExtractionResult,
  payload: IntakeLLMRequestPayload
) {
  try {
    return await callIntakeEndpoint(payload);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[IntakeAgent] Falling back to heuristic parsing', error);
    }
    return runLocalIntakeLLM(extraction);
  }
}

export interface ProcessResumeOptions {
  password: string;
  emit: (update: IntakeProgressUpdate) => void;
  conversation: IntakeConversationMessage[];
  overrides?: Partial<IntakeAgentDependencies>;
}

export async function processResumeWithAgent(
  file: File,
  { password, emit, conversation, overrides }: ProcessResumeOptions
): Promise<IntakeProcessResult> {
  emit({
    stage: 'prepare',
    step: {
      ...INTAKE_STATUS_STEPS.prepare,
      state: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  });

  const deps: IntakeAgentDependencies = {
    extractResume: (fileArg: File) => extractResumeWithProgress(fileArg, emit),
    runLLM: (extraction, payload) => runLLMWithFallback(extraction, payload),
  };

  if (overrides) {
    Object.assign(deps, overrides);
  }

  const knownFields = await loadKnownFields(password);
  const missingFields = computeMissingFields(knownFields);

  const extraction: ResumeExtractionResult = await deps.extractResume(file);

  emit({
    stage: 'analyze',
    step: {
      ...INTAKE_STATUS_STEPS.analyze,
      state: 'in_progress',
      startedAt: new Date().toISOString(),
    },
  });

  let llm;
  try {
    const payload: IntakeLLMRequestPayload = {
      resumeText: extraction.text,
      resumeMetadata: extraction.metadata,
      conversation,
      knownFields,
      missingFields,
    };
    llm = await deps.runLLM(extraction, payload);
  } catch (error) {
    emit({
      stage: 'analyze',
      step: {
        ...INTAKE_STATUS_STEPS.analyze,
        state: 'error',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Resume analysis failed',
      },
    });
    throw error;
  }

  emit({
    stage: 'analyze',
    step: {
      ...INTAKE_STATUS_STEPS.analyze,
      state: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  });

  return {
    extraction,
    llm,
    knownFields,
    missingFields,
  };
}

export async function persistIntakeResult(
  result: IntakeProcessResult,
  password: string,
  emit?: (update: IntakeProgressUpdate) => void
): Promise<void> {
  emit?.({
    stage: 'persist',
    step: {
      ...INTAKE_STATUS_STEPS.persist,
      state: 'in_progress',
      startedAt: new Date().toISOString(),
    },
  });

  // Save sequentially to avoid IndexedDB connection issues
  await vaultService.save(VAULT_STORES.profile, result.llm.profile, password);
  await vaultService.save(VAULT_STORES.compliance, result.llm.compliance, password);
  await vaultService.save(VAULT_STORES.history, result.llm.history, password);
  await vaultService.save(VAULT_STORES.policies, result.llm.policies, password);
  await vaultService.saveResume(result.extraction.raw, password);

  emit?.({
    stage: 'persist',
    step: {
      ...INTAKE_STATUS_STEPS.persist,
      state: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  });

  emit?.({
    stage: 'complete',
    step: {
      ...INTAKE_STATUS_STEPS.complete,
      state: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  });
}
