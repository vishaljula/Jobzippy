import { INTAKE_STATUS_STEPS } from './config';
import { extractResumeWithProgress } from './extractors';
import { runLocalIntakeLLM } from './llm';
import type {
  IntakeAgentDependencies,
  IntakeLLMResponse,
  IntakeProcessResult,
  IntakeProgressUpdate,
  ResumeExtractionResult,
} from './types';
import { VAULT_STORES } from '@/lib/vault/constants';
import { vaultService } from '@/lib/vault/service';

async function persistToVaultInternal(
  llm: IntakeLLMResponse,
  resume: ResumeExtractionResult,
  password: string
): Promise<void> {
  await Promise.all([
    vaultService.save(VAULT_STORES.profile, llm.profile, password),
    vaultService.save(VAULT_STORES.compliance, llm.compliance, password),
    vaultService.save(VAULT_STORES.history, llm.history, password),
    vaultService.save(VAULT_STORES.policies, llm.policies, password),
  ]);
  await vaultService.saveResume(resume.raw, password);
}

export async function processResumeWithAgent(
  file: File,
  password: string,
  emit: (update: IntakeProgressUpdate) => void,
  overrides?: Partial<IntakeAgentDependencies>
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
    runLLM: runLocalIntakeLLM,
    persistToVault: (llm: IntakeLLMResponse, resume: ResumeExtractionResult) =>
      persistToVaultInternal(llm, resume, password),
  };

  if (overrides) {
    Object.assign(deps, overrides);
  }

  let extraction: ResumeExtractionResult;
  try {
    extraction = await deps.extractResume(file);
  } catch (error) {
    emit({
      stage: 'extract',
      step: {
        ...INTAKE_STATUS_STEPS.extract,
        state: 'error',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      },
    });
    throw error;
  }

  emit({
    stage: 'analyze',
    step: {
      ...INTAKE_STATUS_STEPS.analyze,
      state: 'in_progress',
      startedAt: new Date().toISOString(),
    },
  });

  let llm: IntakeLLMResponse;
  try {
    llm = await deps.runLLM(extraction);
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

  emit({
    stage: 'persist',
    step: {
      ...INTAKE_STATUS_STEPS.persist,
      state: 'in_progress',
      startedAt: new Date().toISOString(),
    },
  });

  try {
    await deps.persistToVault(llm, extraction);
  } catch (error) {
    emit({
      stage: 'persist',
      step: {
        ...INTAKE_STATUS_STEPS.persist,
        state: 'error',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Vault sync failed',
      },
    });
    throw error;
  }

  emit({
    stage: 'persist',
    step: {
      ...INTAKE_STATUS_STEPS.persist,
      state: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  });

  emit({
    stage: 'complete',
    step: {
      ...INTAKE_STATUS_STEPS.complete,
      state: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  });

  return {
    extraction,
    llm,
  };
}
