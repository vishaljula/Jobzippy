import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { processResumeWithAgent } from './service';
import type { IntakeLLMResponse, ResumeExtractionResult } from './types';
import { vaultService } from '@/lib/vault/service';
import { VAULT_STORES } from '@/lib/vault/constants';

describe('processResumeWithAgent', () => {
  const password = 'test-password';
  const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' });

  const extraction: ResumeExtractionResult = {
    text: 'John Doe\njohn@example.com\n555-123-4567',
    raw: new ArrayBuffer(8),
    metadata: {
      fileName: 'resume.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      pageCount: 1,
      wordCount: 10,
      language: 'en',
    },
  };

  const llmResponse: IntakeLLMResponse = {
    profile: {
      identity: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
        address: '',
      },
      work_auth: {
        visa_type: '',
        sponsorship_required: false,
      },
      preferences: {
        remote: true,
        locations: [],
        salary_min: 0,
        start_date: '',
      },
    },
    compliance: {
      veteran_status: 'prefer_not',
      disability_status: 'prefer_not',
      criminal_history_policy: 'ask_if_required',
    },
    history: {
      employment: [],
      education: [],
    },
    policies: {
      eeo: 'ask_if_required',
      salary: 'ask_if_required',
      relocation: 'ask_if_required',
      work_shift: 'ask_if_required',
    },
    previewSections: [],
    summary: 'Summary',
    confidence: 0.8,
    followUpPrompt: 'Should I sync these updates now?',
    warnings: [],
  };

  const progressUpdates: string[] = [];

  beforeEach(() => {
    progressUpdates.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes resume and persists to vault', async () => {
    const saveSpy = vi.spyOn(vaultService, 'save').mockResolvedValue(undefined);
    const saveResumeSpy = vi.spyOn(vaultService, 'saveResume').mockResolvedValue(undefined);

    const result = await processResumeWithAgent(
      file,
      password,
      (update) => {
        progressUpdates.push(update.stage);
      },
      {
        extractResume: vi.fn(async () => {
          progressUpdates.push('extract');
          progressUpdates.push('extract');
          return extraction;
        }),
        runLLM: vi.fn(async () => llmResponse),
      }
    );

    expect(result.extraction).toEqual(extraction);
    expect(result.llm).toEqual(llmResponse);

    expect(saveSpy).toHaveBeenCalledWith(VAULT_STORES.profile, llmResponse.profile, password);
    expect(saveSpy).toHaveBeenCalledWith(VAULT_STORES.compliance, llmResponse.compliance, password);
    expect(saveSpy).toHaveBeenCalledWith(VAULT_STORES.history, llmResponse.history, password);
    expect(saveSpy).toHaveBeenCalledWith(VAULT_STORES.policies, llmResponse.policies, password);
    expect(saveResumeSpy).toHaveBeenCalledWith(extraction.raw, password);

    expect(progressUpdates).toEqual([
      'prepare',
      'extract',
      'extract',
      'analyze',
      'analyze',
      'persist',
      'persist',
      'complete',
    ]);
  });

  it('propagates extraction errors and marks progress state', async () => {
    const failingExtract = vi.fn(async () => {
      throw new Error('failed to parse');
    });

    await expect(
      processResumeWithAgent(
        file,
        password,
        (update) => {
          progressUpdates.push(`${update.stage}:${update.step.state}`);
        },
        {
          extractResume: failingExtract,
          runLLM: vi.fn(),
        }
      )
    ).rejects.toThrow('failed to parse');

    expect(progressUpdates).toContain('extract:error');
  });
});
