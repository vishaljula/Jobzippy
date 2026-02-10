import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { logger } from '@/lib/logger';

// ... imports

import { API_CONFIG } from '@/lib/config';
import { processResumeWithAgent } from '@/lib/intake/service';
import type {
  IntakeDeferredTask,
  IntakeMessage,
  OnboardingConversationSnapshot,
  ProfileVault,
  UserInfo,
} from '@/lib/types';
import type { IntakeConversationMessage } from '@/lib/intake/types';

// ... (existing imports)

import { getStorage, setStorage } from '@/lib/storage';
import { deriveVaultPassword } from '@/lib/vault/utils';
import { vaultService } from '@/lib/vault/service';
import { VAULT_STORES } from '@/lib/vault/constants';
import { mergeExtractedData } from './utils';

const SNAPSHOT_VERSION = 1;
const CONVERSATION_LIMIT = 12;

const DEFAULT_MESSAGES: IntakeMessage[] = [
  {
    id: uuid(),
    role: 'assistant',
    kind: 'text',
    content:
      "Hi! I'm Jobzippy. Drop your resume and I'll set up your job search filters in under a minute.",
    createdAt: new Date().toISOString(),
  },
];

const SALARY_CURRENCY_FALLBACK = 'USD';

// LinkedIn-aligned onboarding fields (MVP1)
const REQUIRED_FIELDS = [
  { path: 'profile.preferences.target_roles', parse: parseTargetRoles, label: 'target job roles' },
  {
    path: 'profile.preferences.experience_level',
    parse: parseExperienceLevel,
    label: 'experience level',
  },
  { path: 'profile.preferences.job_type', parse: parseJobType, label: 'job type' },
  {
    path: 'profile.preferences.work_arrangement',
    parse: parseWorkArrangement,
    label: 'work arrangement',
  },
  { path: 'profile.preferences.locations', parse: parseLocations, label: 'preferred locations' },
] as const;

const VISA_REQUIRING_SPONSORSHIP = [
  'h-1b',
  'h1b',
  'f-1',
  'f1',
  'f-1 opt',
  'opt',
  'stem opt',
  'tn',
  'l-1',
  'o-1',
  'e-3',
  'j-1',
] as const;

const FIELD_PARSERS: Record<string, (value: string) => unknown | null> = REQUIRED_FIELDS.reduce(
  (acc, field) => {
    acc[field.path] = field.parse;
    return acc;
  },
  {} as Record<string, (value: string) => unknown | null>
);

const FIELD_LABELS = REQUIRED_FIELDS.reduce<Record<string, string>>((acc, field) => {
  acc[field.path] = field.label;
  return acc;
}, {});

const createDefaultProgress = (): OnboardingConversationSnapshot['progress'] => ({
  completed: 0,
  total: REQUIRED_FIELDS.length,
  percentage: 0,
  status: 'idle',
});

const DEFER_KEYWORDS = ['later', 'not now', 'maybe later', 'skip', 'not yet'];

interface UseOnboardingChatOptions {
  enabled: boolean;
  user: UserInfo | null;
  overrides?: {
    processResume?: typeof processResumeWithAgent;
  };
}

interface AssistantReply {
  reply: string;
  updates?: Array<{ path: string; value: string }>;
  requestedField?: string | null;
  quickReplies?: string[];
}

export function useOnboardingChat({ enabled, user, overrides }: UseOnboardingChatOptions) {
  const [messages, setMessages] = useState<IntakeMessage[]>(DEFAULT_MESSAGES);
  const [deferredTasks, setDeferredTasks] = useState<IntakeDeferredTask[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>(REQUIRED_FIELDS.map((f) => f.path));
  const [pendingFieldPath, setPendingFieldPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileVault | null>(null);
  const [progress, setProgress] = useState<OnboardingConversationSnapshot['progress']>(() =>
    createDefaultProgress()
  );
  const [isLoading, setIsLoading] = useState(enabled);
  const [isThinking, setIsThinking] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const vaultPassword = useMemo(() => deriveVaultPassword(user), [user]);
  const userKey = user?.sub ?? 'anonymous';
  const resumeProcessor = overrides?.processResume ?? processResumeWithAgent;
  const lastPersistedDraftRef = useRef<string | null>(null);

  const appendMessage = useCallback((message: IntakeMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const runAssistantTurn = useCallback(
    async (history: IntakeMessage[], knownDraft: ProfileVault | null, currentMissing: string[]) => {
      const payload = {
        conversation: buildConversationPayload(history),
        knownFields: knownDraft ?? undefined,
        missingFields: currentMissing,
      };

      try {
        const reply = await requestAssistantReply(payload);

        // Log LLM response
        logger.log('Onboarding', `🤖 Assistant: "${reply.reply}"`);
        if (reply.requestedField) {
          logger.log('Onboarding', `📋 Requested field: ${reply.requestedField}`);
        }

        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content: reply.reply,
          createdAt: new Date().toISOString(),
          quickReplies: reply.quickReplies,
        });

        let updatedDraft: ProfileVault | null = null;
        const invalidPaths: string[] = [];
        if (reply.updates?.length) {
          setDraft((prev) => {
            const base = ensureDraft(knownDraft ?? prev);
            let mutated = false;
            reply.updates?.forEach(({ path, value }) => {
              const parser = FIELD_PARSERS[path];
              if (!parser) return;
              const parsed = parser(value);
              if (parsed === null || parsed === undefined) {
                invalidPaths.push(path);
                return;
              }
              setValueAtPath(base, path, parsed);
              mutated = true;
            });
            if (applyDerivedFieldsToDraft(base)) {
              mutated = true;
            }
            if (!mutated) {
              return prev ?? base;
            }
            updatedDraft = { ...base };
            return updatedDraft;
          });
        }

        if (updatedDraft) {
          const remaining = computeMissingFields(updatedDraft);
          setMissingFields(remaining);
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          updateProgressState(remaining.length, updatedDraft);
        }
        if (invalidPaths.length) {
          setMissingFields((prev) => addUniquePaths(prev, invalidPaths));
          appendMessage({
            id: uuid(),
            role: 'assistant',
            kind: 'notice',
            content: buildValidationNotice(invalidPaths),
            createdAt: new Date().toISOString(),
          });
          setPendingFieldPath(invalidPaths[0] ?? reply.requestedField ?? null);
        } else {
          setPendingFieldPath(reply.requestedField ?? null);
        }
      } catch (error) {
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content:
            error instanceof Error
              ? `I had trouble reaching the onboarding agent: ${error.message}`
              : 'I had trouble reaching the onboarding agent. Please try again in a moment.',
          createdAt: new Date().toISOString(),
        });
      }
    },
    [appendMessage]
  );

  const updateProgressState = useCallback(
    (remaining: number, currentDraft: ProfileVault | null) => {
      const completed = Math.max(0, REQUIRED_FIELDS.length - remaining);
      const percentage = Math.round((completed / REQUIRED_FIELDS.length) * 100);
      const nextStatus: OnboardingConversationSnapshot['progress']['status'] =
        remaining === 0 && currentDraft && hasResume
          ? 'ready'
          : completed === 0
            ? 'idle'
            : 'collecting';

      // Debug logging for field validation
      if (nextStatus === 'ready') {
        logger.log('Onboarding', '✅ All required fields collected! Status: ready');
        logger.log('Onboarding', `Completed: ${completed}/${REQUIRED_FIELDS.length}`);
      } else if (remaining > 0) {
        const missing = computeMissingFields(currentDraft);
        logger.log(
          'Onboarding',
          `Missing ${remaining} fields:`,
          missing.map((path) => {
            const field = REQUIRED_FIELDS.find((f) => f.path === path);
            return field ? `${field.label} (${path})` : path;
          })
        );
      }

      setProgress({
        completed,
        total: REQUIRED_FIELDS.length,
        percentage,
        status: nextStatus,
      });
    },
    [hasResume]
  );

  const handleResumeProcessing = useCallback(
    async (file: File) => {
      setIsThinking(true);
      try {
        logger.log('Onboarding', `📄 Processing resume: ${file.name} (${file.size} bytes)`);

        // Convert file to base64 for storage
        const buffer = await file.arrayBuffer();

        // Save resume blob to vault immediately
        if (vaultPassword) {
          // vaultService.saveResume expects ArrayBuffer
          await vaultService.saveResume(buffer, vaultPassword);
          logger.log('Onboarding', '✓ Resume blob saved to vault');
        } else {
          logger.error('Onboarding', '✗ No vault password available, cannot save resume!');
        }

        // Prepare conversation history for the agent
        const conversation: IntakeConversationMessage[] = messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }));

        const extractedData = await resumeProcessor(file, {
          password: vaultPassword || '', // Should be available if we are here
          emit: (update) => {
            // Optional: handle progress updates if we want to show granular status
            logger.log('Onboarding', 'Resume processing update', update);
          },
          conversation,
        });
        logger.log('Onboarding', '✓ Resume extraction complete', extractedData);

        // Merge extracted data into draft
        const nextDraft = mergeExtractedData(draft, extractedData);
        logger.log('Onboarding', '✓ Merged draft after resume processing');

        setDraft(nextDraft);
        setHasResume(true);
        const remaining = computeMissingFields(nextDraft);
        setMissingFields(remaining);
        logger.log('Onboarding', `→ Missing fields after resume: ${remaining.length}`);
        updateProgressState(remaining.length, nextDraft);

        // ALWAYS show resume preview, regardless of missing fields
        // This allows user to review and confirm the extracted data
        const previewSections = [
          {
            id: 'resume-identity',
            title: 'Personal Details',
            confidence: 0.9,
            fields: Object.entries(extractedData.llm.profile.identity || {}).map(
              ([key, value]) => ({
                id: key,
                label: key.replace(/_/g, ' '),
                value: String(value),
              })
            ),
          },
        ];

        if (extractedData.llm.history?.employment?.length) {
          previewSections.push({
            id: 'resume-experience',
            title: 'Experience',
            confidence: 0.9,
            fields: extractedData.llm.history.employment.map((job, idx) => ({
              id: `job-${idx}`,
              label: job.company,
              value: `${job.title} ${job.start ? `(${job.start} - ${job.end || 'Present'})` : ''}`,
            })),
          });
        }

        if (extractedData.llm.history?.education?.length) {
          previewSections.push({
            id: 'resume-education',
            title: 'Education',
            confidence: 0.9,
            fields: extractedData.llm.history.education.map((edu, idx) => ({
              id: `edu-${idx}`,
              label: edu.school,
              value: `${edu.degree} ${edu.start ? `(${edu.start} - ${edu.end || 'Present'})` : ''}`,
            })),
          });
        }

        // Create a preview message for the resume data
        logger.log('Onboarding', `Creating resume preview with ${previewSections.length} sections`);
        const previewMessage: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'preview',
          content: 'Here is what I found in your resume:',
          previewSections,
          createdAt: new Date().toISOString(),
        };

        // Show the preview message to the user
        logger.log('Onboarding', '📋 Showing resume preview to user (Edit / Looks good screen)');
        appendMessage(previewMessage);

        // DON'T run assistant turn here - wait for user to confirm the preview
        // The next question will be triggered when user clicks "Looks good" or "Save & continue"
      } catch (error) {
        logger.error('Onboarding', 'Resume processing failed', error);
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content:
            error instanceof Error
              ? `I couldn’t parse that resume: ${error.message}. Could you try a different PDF or DOCX?`
              : 'I hit an issue reading that file. Could you try a different format (PDF or DOCX)?',
          createdAt: new Date().toISOString(),
        });
      } finally {
        setIsThinking(false);
      }
    },
    [appendMessage, draft, messages, runAssistantTurn, updateProgressState, vaultPassword]
  );

  const syncDraftToVault = useCallback(
    async (finalDraft: ProfileVault) => {
      if (!vaultPassword) return;

      logger.log('Onboarding', 'Syncing final draft to vault', finalDraft);

      try {
        await vaultService.save(VAULT_STORES.profile, finalDraft.profile, vaultPassword);
        await vaultService.save(VAULT_STORES.compliance, finalDraft.compliance, vaultPassword);
        await vaultService.save(VAULT_STORES.history, finalDraft.history, vaultPassword);
        await vaultService.save(VAULT_STORES.policies, finalDraft.policies, vaultPassword);

        logger.log('Onboarding', 'Vault sync complete');
      } catch (error) {
        logger.error('Onboarding', 'Vault sync failed', error);
      }
    },
    [vaultPassword]
  );

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      const conversations = (await getStorage('onboardingConversations')) ?? {};
      const snapshot = conversations[userKey] as OnboardingConversationSnapshot | undefined;

      if (cancelled) return;

      if (snapshot?.version === SNAPSHOT_VERSION) {
        if (snapshot.draft) {
          applyDerivedFieldsToDraft(snapshot.draft);
        }

        setMessages(snapshot.messages.length ? snapshot.messages : DEFAULT_MESSAGES);
        setDeferredTasks(snapshot.deferredTasks ?? []);
        setMissingFields(snapshot.missingFields ?? REQUIRED_FIELDS.map((f) => f.path));
        setPendingFieldPath(snapshot.pendingFieldPath ?? null);
        setProgress(snapshot.progress ?? createDefaultProgress());
        setDraft(snapshot.draft ?? null);
        setHasResume(Boolean(snapshot.hasResume));
      } else {
        setMessages(DEFAULT_MESSAGES);
        setDeferredTasks([]);
        setMissingFields(REQUIRED_FIELDS.map((f) => f.path));
        setPendingFieldPath(null);
        setProgress(createDefaultProgress());
        setDraft(null);
        setHasResume(false);
      }

      if (!snapshot?.draft) {
        try {
          const existing = await loadVaultSnapshot(vaultPassword);
          if (existing) {
            applyDerivedFieldsToDraft(existing);
            setDraft(existing);
            const remaining = computeMissingFields(existing);
            setMissingFields(remaining);
            updateProgressState(remaining.length, existing);
            setHasResume(true);
          }
        } catch {
          // ignore vault load errors
        }
      }

      setHydrated(true);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, updateProgressState, userKey, vaultPassword]);

  useEffect(() => {
    if (!hydrated) return;

    const snapshot: OnboardingConversationSnapshot = {
      version: SNAPSHOT_VERSION,
      messages,
      deferredTasks,
      pendingFieldPath,
      missingFields,
      progress,
      draft,
      hasResume,
      lastUpdated: new Date().toISOString(),
    };
    void persistSnapshot(userKey, snapshot);
  }, [
    draft,
    deferredTasks,
    hasResume,
    hydrated,
    messages,
    missingFields,
    pendingFieldPath,
    progress,
    userKey,
  ]);

  useEffect(() => {
    // Only recompute when a concrete draft exists. This preserves snapshot-provided
    // progress/missingFields when the snapshot did not include a draft.
    if (!hydrated || !draft) return;
    const remaining = computeMissingFields(draft);
    setMissingFields((prev) => (arraysEqual(prev, remaining) ? prev : remaining));
    updateProgressState(remaining.length, draft);
  }, [draft, hydrated, updateProgressState]);

  useEffect(() => {
    lastPersistedDraftRef.current = null;
  }, [userKey]);

  useEffect(() => {
    if (!hydrated || !draft || !hasResume) return;
    void syncDraftToVault(draft).catch((error) => {
      console.error('[Onboarding] Failed to sync draft to vault', error);
    });
  }, [draft, hasResume, hydrated, syncDraftToVault]);

  const sendMessage = useCallback(
    async ({ text, attachments = [] }: { text: string; attachments?: File[] }) => {
      if (!enabled) return;
      if (!text.trim() && attachments.length === 0) return;

      const now = new Date().toISOString();
      const normalizedText = text.trim();
      const userContent =
        normalizedText || (attachments.length ? `Uploaded ${attachments.length} file(s)` : '');
      const userMessage: IntakeMessage = {
        id: uuid(),
        role: 'user',
        kind: 'text',
        content: userContent || '(empty)',
        createdAt: now,
        attachments: attachments.length
          ? attachments.map((file) => ({
              id: uuid(),
              kind: 'file' as const,
              name: file.name,
              size: file.size,
              mimeType: file.type,
            }))
          : undefined,
      };

      // Log user message
      logger.log('Onboarding', `👤 User: "${userContent}"`);

      const nextHistory = [...messages, userMessage];
      appendMessage(userMessage);

      if (attachments.length) {
        await handleResumeProcessing(attachments[0]!);
        return;
      }

      const normalized = text.trim().toLowerCase();
      if (DEFER_KEYWORDS.includes(normalized)) {
        const task: IntakeDeferredTask = {
          id: uuid(),
          prompt: pendingFieldPath ?? 'Review onboarding info later',
          createdAt: new Date().toISOString(),
          reason: 'user_requested_later',
        };
        setDeferredTasks((prev) => [...prev, task]);
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content: "No problem—I'll remind you later when you're ready.",
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (!hasResume) {
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content:
            "Let's start with your resume so I can pre-fill the basics. Could you upload it?",
          createdAt: new Date().toISOString(),
        });
        return;
      }

      setIsThinking(true);
      try {
        await runAssistantTurn(nextHistory, draft, missingFields);
      } finally {
        setIsThinking(false);
      }
    },
    [
      appendMessage,
      draft,
      enabled,
      handleResumeProcessing,
      hasResume,
      messages,
      missingFields,
      pendingFieldPath,
      runAssistantTurn,
    ]
  );

  const startOver = useCallback(async () => {
    setMessages(DEFAULT_MESSAGES);
    setDeferredTasks([]);
    setMissingFields(REQUIRED_FIELDS.map((field) => field.path));
    setPendingFieldPath(null);
    setDraft(null);
    setHasResume(false);
    setProgress(createDefaultProgress());
    setCompletedAt(null);
    await persistSnapshot(userKey, {
      version: SNAPSHOT_VERSION,
      messages: DEFAULT_MESSAGES,
      deferredTasks: [],
      pendingFieldPath: null,
      missingFields: REQUIRED_FIELDS.map((field) => field.path),
      progress: createDefaultProgress(),
      draft: null,
      hasResume: false,
      lastUpdated: new Date().toISOString(),
    });
  }, [userKey]);

  useEffect(() => {
    if (!draft || missingFields.length > 0 || !hasResume || completedAt) {
      if (!completedAt) {
        logger.log(
          'Onboarding',
          `Auto-save check: draft=${!!draft}, missing=${missingFields.length}, hasResume=${hasResume}`
        );
      }
      return;
    }

    logger.log('Onboarding', '💾 All conditions met, starting auto-save to vault...');
    setProgress((prev) => ({ ...prev, status: 'saving' }));
    void (async () => {
      try {
        await syncDraftToVault(draft);
        logger.log('Onboarding', '✓ Draft synced to vault');

        // Trigger backup to Google Sheets after vault sync
        try {
          logger.log('Onboarding', '☁️ Triggering backup to Google Sheets...');
          const { forceBackup } = await import('@/lib/backup-scheduler');
          const tokens = await getStorage('oauth_tokens');
          if (tokens?.access_token) {
            await forceBackup(tokens.access_token);
            logger.log('Onboarding', '✓ Backup to Google Sheets completed');
          }
        } catch (backupError) {
          logger.error('Onboarding', 'Backup to Google Sheets failed', backupError);
          // Don't block onboarding completion if backup fails
        }
      } catch (error) {
        logger.error('Onboarding', 'Failed to persist final draft', error);
      }
      setProgress((prev) => ({ ...prev, status: 'ready' }));
      setCompletedAt(new Date().toISOString());
      logger.log('Onboarding', '✅ Onboarding complete, showing completion message');
      appendMessage({
        id: uuid(),
        role: 'assistant',
        kind: 'notice',
        content:
          "All set! Your secure Jobzippy vault is ready. I'm routing you to the dashboard so you can see applied jobs and stats.",
        createdAt: new Date().toISOString(),
      });
    })();
  }, [
    appendMessage,
    completedAt,
    draft,
    hasResume,
    missingFields.length,
    vaultPassword,
    syncDraftToVault,
  ]);

  // Callback to update draft from edited preview sections
  const updateDraftFromPreview = useCallback(
    (editedSections: Array<{ id: string; fields: Array<{ id: string; value: string }> }>) => {
      if (!draft) return;

      // Deep clone to ensure React detects the change
      const nextDraft: ProfileVault = {
        ...draft,
        profile: {
          ...draft.profile,
          identity: { ...draft.profile.identity },
        },
      };

      for (const section of editedSections) {
        if (section.id === 'resume-identity') {
          // Map identity fields back to draft.profile.identity
          for (const field of section.fields) {
            if (field.id in nextDraft.profile.identity) {
              (nextDraft.profile.identity as Record<string, string>)[field.id] = field.value;
            }
          }
        }
        // Note: employment and education edits are display-only for now
        // (they show job titles/companies which aren't directly editable in this format)
      }

      setDraft(nextDraft);
      logger.log('Onboarding', '✓ Updated draft from preview edits', nextDraft.profile.identity);
    },
    [draft]
  );

  // Callback to confirm the preview and proceed to next question
  const confirmPreview = useCallback(
    async (
      editedSections?: Array<{ id: string; fields: Array<{ id: string; value: string }> }>
    ) => {
      if (!draft) return;

      let currentDraft = draft;

      // If edited sections provided, update the draft first
      if (editedSections) {
        const nextDraft: ProfileVault = {
          ...draft,
          profile: {
            ...draft.profile,
            identity: { ...draft.profile.identity },
          },
        };

        for (const section of editedSections) {
          if (section.id === 'resume-identity') {
            for (const field of section.fields) {
              if (field.id in nextDraft.profile.identity) {
                (nextDraft.profile.identity as Record<string, string>)[field.id] = field.value;
              }
            }
          }
        }

        setDraft(nextDraft);
        currentDraft = nextDraft;
        logger.log('Onboarding', '✓ Updated draft from preview edits', nextDraft.profile.identity);
      }

      // Now proceed to ask the next question
      const remaining = computeMissingFields(currentDraft);
      logger.log(
        'Onboarding',
        `Preview confirmed, proceeding with ${remaining.length} missing fields`
      );
      await runAssistantTurn(messages, currentDraft, remaining);
    },
    [draft, messages, runAssistantTurn]
  );

  return {
    isLoading,
    isThinking,
    messages,
    deferredTasks,
    progress,
    pendingFieldPath,
    sendMessage,
    uploadResume: handleResumeProcessing,
    startOver,
    hasResume,
    completedAt,
    updateDraftFromPreview,
    confirmPreview,
  } as const;
}

function buildConversationPayload(
  history: IntakeMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history
    .filter((message) => message.kind === 'text' || message.kind === 'notice')
    .filter((message) => message.role === 'assistant' || message.role === 'user')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }))
    .slice(-CONVERSATION_LIMIT);
}

async function requestAssistantReply(payload: {
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  knownFields?: ProfileVault | null;
  missingFields: string[];
}): Promise<AssistantReply> {
  const response = await fetch(`${API_CONFIG.baseUrl}/onboarding/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation: payload.conversation,
      knownFields: payload.knownFields ?? undefined,
      missingFields: payload.missingFields,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as AssistantReply;
}
async function loadVaultSnapshot(password: string): Promise<ProfileVault | null> {
  const [profile, compliance, history, policies] = await Promise.all([
    vaultService.load(VAULT_STORES.profile, password).catch(() => null),
    vaultService.load(VAULT_STORES.compliance, password).catch(() => null),
    vaultService.load(VAULT_STORES.history, password).catch(() => null),
    vaultService.load(VAULT_STORES.policies, password).catch(() => null),
  ]);

  if (!profile && !compliance && !history && !policies) {
    return null;
  }

  const draft: ProfileVault = {
    profile: profile ?? {
      identity: { first_name: '', last_name: '', phone: '', email: '', address: '' },
      work_auth: { visa_type: '', sponsorship_required: false },
      preferences: {
        remote: true,
        locations: [],
        salary_min: 0,
        salary_currency: SALARY_CURRENCY_FALLBACK,
        start_date: '',
        // LinkedIn filter fields
        target_roles: [],
        experience_level: '',
        job_type: '',
        work_arrangement: '',
      },
    },
    compliance: compliance ?? {
      disability_status: 'prefer_not',
      veteran_status: 'prefer_not',
      criminal_history_policy: 'ask_if_required',
    },
    history: history ?? { employment: [], education: [] },
    policies: policies ?? {
      eeo: 'ask_if_required',
      salary: 'ask_if_required',
      relocation: 'ask_if_required',
      work_shift: 'ask_if_required',
    },
  };
  applyDerivedFieldsToDraft(draft);
  return draft;
}

async function persistSnapshot(userKey: string, snapshot: OnboardingConversationSnapshot) {
  const conversations = (await getStorage('onboardingConversations')) ?? {};
  await setStorage('onboardingConversations', {
    ...conversations,
    [userKey]: snapshot,
  });
}

function computeMissingFields(draft: ProfileVault | null): string[] {
  if (!draft) return REQUIRED_FIELDS.map((field) => field.path);
  return REQUIRED_FIELDS.filter((field) => isValueMissing(getValueAtPath(draft, field.path))).map(
    (field) => field.path
  );
}

function ensureDraft(draft: ProfileVault | null): ProfileVault {
  if (draft) {
    applyDerivedFieldsToDraft(draft);
    return draft;
  }
  const emptyDraft: ProfileVault = {
    profile: {
      identity: { first_name: '', last_name: '', phone: '', email: '', address: '' },
      work_auth: { visa_type: '', sponsorship_required: false },
      preferences: {
        remote: true,
        locations: [],
        salary_min: 0,
        salary_currency: SALARY_CURRENCY_FALLBACK,
        start_date: '',
        // LinkedIn filter fields
        target_roles: [],
        experience_level: '',
        job_type: '',
        work_arrangement: '',
      },
    },
    compliance: {
      disability_status: 'prefer_not',
      veteran_status: 'prefer_not',
      criminal_history_policy: 'ask_if_required',
    },
    history: { employment: [], education: [] },
    policies: {
      eeo: 'ask_if_required',
      salary: 'ask_if_required',
      relocation: 'ask_if_required',
      work_shift: 'ask_if_required',
    },
  };
  applyDerivedFieldsToDraft(emptyDraft);
  return emptyDraft;
}

function getValueAtPath(source: unknown, path: string): unknown {
  if (!source) return undefined;
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc === undefined || acc === null) {
      return undefined;
    }
    if (typeof acc !== 'object') {
      return undefined;
    }
    return (acc as Record<string, unknown>)[segment];
  }, source);
}

function setValueAtPath(target: unknown, path: string, value: unknown) {
  if (!target || typeof target !== 'object') return;
  const segments = path.split('.');
  let cursor: Record<string, unknown> = target as Record<string, unknown>;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }
    const nextCursor = cursor[segment];
    if (!nextCursor || typeof nextCursor !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  });
}

function isValueMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value) || value <= 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function parseLocations(input: string): string[] | null {
  const normalized = input.trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'remote') return ['Remote'];
  const formatted = normalized
    .split(',')
    .map((token) => formatLocationToken(token))
    .filter((token): token is string => Boolean(token));
  if (!formatted.length) {
    return null;
  }
  return Array.from(new Set(formatted));
}

// Parsers for LinkedIn-aligned fields

function parseTargetRoles(input: string): string[] | null {
  const normalized = input.trim();
  if (!normalized) return null;
  // Split by comma, semicolon, or "or"
  const roles = normalized
    .split(/[,;]|\bor\b/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  if (!roles.length) return null;
  return Array.from(new Set(roles));
}

type ExperienceLevel =
  | 'internship'
  | 'entry'
  | 'associate'
  | 'mid_senior'
  | 'director'
  | 'executive';

function parseExperienceLevel(input: string): ExperienceLevel | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  // Direct matches
  if (normalized.includes('intern')) return 'internship';
  if (
    normalized.includes('entry') ||
    normalized.includes('junior') ||
    normalized.includes('fresh grad')
  )
    return 'entry';
  if (
    normalized.includes('associate') ||
    normalized.includes('mid-level') ||
    normalized.includes('mid level')
  )
    return 'associate';
  if (
    normalized.includes('senior') ||
    normalized.includes('mid-senior') ||
    normalized.includes('lead')
  )
    return 'mid_senior';
  if (
    normalized.includes('director') ||
    normalized.includes('vp') ||
    normalized.includes('head of')
  )
    return 'director';
  if (
    normalized.includes('executive') ||
    normalized.includes('c-level') ||
    normalized.includes('chief')
  )
    return 'executive';

  // Try to parse years and map to level
  const yearsMatch = normalized.match(/(\d+)\s*(years?|yrs?)/i);
  if (yearsMatch && yearsMatch[1]) {
    const years = parseInt(yearsMatch[1], 10);
    if (years < 1) return 'internship';
    if (years <= 2) return 'entry';
    if (years <= 5) return 'associate';
    if (years <= 10) return 'mid_senior';
    return 'director';
  }

  return null;
}

type JobType = 'full_time' | 'part_time' | 'contract' | 'internship';

function parseJobType(input: string): JobType | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('full') || normalized.includes('ft') || normalized.includes('permanent'))
    return 'full_time';
  if (normalized.includes('part') || normalized.includes('pt')) return 'part_time';
  if (
    normalized.includes('contract') ||
    normalized.includes('freelance') ||
    normalized.includes('gig')
  )
    return 'contract';
  if (normalized.includes('intern')) return 'internship';

  return null;
}

type WorkArrangement = 'remote' | 'hybrid' | 'onsite' | 'any';

function parseWorkArrangement(input: string): WorkArrangement | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes('remote') ||
    normalized.includes('wfh') ||
    normalized.includes('work from home')
  )
    return 'remote';
  if (
    normalized.includes('hybrid') ||
    normalized.includes('flexible') ||
    normalized.includes('mix')
  )
    return 'hybrid';
  if (
    normalized.includes('onsite') ||
    normalized.includes('on-site') ||
    normalized.includes('in office') ||
    normalized.includes('in-person')
  )
    return 'onsite';
  if (
    normalized.includes('any') ||
    normalized.includes('either') ||
    normalized.includes("don't mind") ||
    normalized.includes('no preference')
  )
    return 'any';

  return null;
}

function visaImpliesSponsorship(visaType?: string): boolean {
  if (!visaType) return false;
  const normalized = visaType.trim().toLowerCase();
  return VISA_REQUIRING_SPONSORSHIP.some((keyword) => normalized.includes(keyword));
}

function applyDerivedFieldsToDraft(draft: ProfileVault | null): boolean {
  if (!draft) return false;
  let mutated = false;
  const visaType = draft.profile?.work_auth?.visa_type;
  if (visaImpliesSponsorship(visaType)) {
    if (!draft.profile.work_auth) {
      draft.profile.work_auth = { visa_type: visaType ?? '', sponsorship_required: true };
      mutated = true;
    } else if (!draft.profile.work_auth.sponsorship_required) {
      draft.profile.work_auth.sponsorship_required = true;
      mutated = true;
    }
  }
  const preferences = draft.profile?.preferences;
  if (preferences && !preferences.salary_currency) {
    preferences.salary_currency = SALARY_CURRENCY_FALLBACK;
    mutated = true;
  }
  return mutated;
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function addUniquePaths(existing: string[], additions: string[]): string[] {
  let changed = false;
  const next = new Set(existing);
  additions.forEach((path) => {
    if (!next.has(path)) {
      next.add(path);
      changed = true;
    }
  });
  return changed ? Array.from(next) : existing;
}

function buildValidationNotice(paths: string[]): string {
  const labels = paths.map((path) => FIELD_LABELS[path] ?? path);
  const formatted =
    labels.length === 1
      ? (labels[0] ?? 'that answer')
      : `${labels.slice(0, -1).join(', ')} and ${labels.slice(-1)}`;
  return `I couldn’t quite understand your ${formatted}. Could you rephrase or clarify?`;
}

function formatLocationToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'remote') return 'Remote';
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}
