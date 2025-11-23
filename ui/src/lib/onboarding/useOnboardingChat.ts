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
      "Hi! I'm Jobzippy’s onboarding guide. Drop your latest resume so I can learn about you. I’ll only ask for anything that’s missing.",
    createdAt: new Date().toISOString(),
  },
];

const SALARY_CURRENCY_FALLBACK = 'USD';

const REQUIRED_FIELDS = [
  { path: 'profile.identity.phone', parse: parsePhone, label: 'phone number' },
  { path: 'profile.identity.address', parse: parseString, label: 'mailing address' },
  { path: 'profile.preferences.locations', parse: parseLocations, label: 'preferred locations' },
  { path: 'profile.preferences.salary_min', parse: parseSalary, label: 'minimum salary' },
  {
    path: 'profile.preferences.salary_currency',
    parse: parseCurrency,
    label: 'salary currency',
  },
  { path: 'profile.work_auth.visa_type', parse: parseString, label: 'visa / work authorization' },
  {
    path: 'profile.work_auth.sponsorship_required',
    parse: parseBoolean,
    label: 'sponsorship requirement',
  },
  { path: 'policies.salary', parse: parsePolicyPreference, label: 'salary disclosure policy' },
  { path: 'policies.relocation', parse: parsePolicyPreference, label: 'relocation policy' },
  { path: 'compliance.veteran_status', parse: parseComplianceChoice, label: 'veteran status' },
  {
    path: 'compliance.disability_status',
    parse: parseComplianceChoice,
    label: 'disability status',
  },
  {
    path: 'compliance.criminal_history_policy',
    parse: parsePolicyPreference,
    label: 'criminal history policy',
  },
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
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content: reply.reply,
          createdAt: new Date().toISOString(),
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
        logger.log('Onboarding', `Processing resume: ${file.name} (${file.size} bytes)`);

        // Convert file to base64 for storage
        const buffer = await file.arrayBuffer();

        // Save resume blob to vault immediately
        if (vaultPassword) {
          // vaultService.saveResume expects ArrayBuffer
          await vaultService.saveResume(buffer, vaultPassword);
          logger.log('Onboarding', 'Resume blob saved to vault');
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
        logger.log('Onboarding', 'Resume extraction result', extractedData);

        // Merge extracted data into draft
        const nextDraft = mergeExtractedData(draft, extractedData);
        logger.log('Onboarding', 'Merged draft after resume', nextDraft);

        setDraft(nextDraft);
        setHasResume(true);
        const remaining = computeMissingFields(nextDraft);
        setMissingFields(remaining);
        updateProgressState(remaining.length, nextDraft);

        if (remaining.length > 0) {
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
          const previewMessage: IntakeMessage = {
            id: uuid(),
            role: 'assistant',
            kind: 'preview',
            content: 'Here is what I found in your resume:',
            previewSections,
            createdAt: new Date().toISOString(),
          };

          const historyAfterResume = [...messages, previewMessage];

          // Show the preview message to the user
          appendMessage(previewMessage);

          await runAssistantTurn(historyAfterResume, nextDraft, remaining);
        }
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
    if (!draft || missingFields.length > 0 || !hasResume || completedAt) return;

    setProgress((prev) => ({ ...prev, status: 'saving' }));
    void (async () => {
      try {
        await syncDraftToVault(draft);
      } catch (error) {
        console.error('[Onboarding] Failed to persist final draft', error);
      }
      setProgress((prev) => ({ ...prev, status: 'ready' }));
      setCompletedAt(new Date().toISOString());
      appendMessage({
        id: uuid(),
        role: 'assistant',
        kind: 'notice',
        content:
          'All set! Your secure Jobzippy vault is ready. I’m routing you to the dashboard so you can see applied jobs and stats.',
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

function parsePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  return formatPhoneDigits(digits);
}

function parseString(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
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

const SALARY_SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

function parseSalary(input: string): number | null {
  if (!input) return null;
  const normalized = input.replace(/[$,]/g, '').toLowerCase();
  const regex = /(\d+(?:\.\d+)?)(?:\s*(k|m|b|thousand|million|billion))?/g;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    matches.push(match);
  }
  if (!matches.length) {
    return null;
  }
  const [first] = matches;
  if (!first || !first[1]) {
    return null;
  }
  const fallbackSuffix = first[2] ?? matches[1]?.[2];
  const multiplier = fallbackSuffix ? (SALARY_SUFFIX_MULTIPLIERS[fallbackSuffix] ?? 1) : 1;
  const value = Number(first[1]);
  if (Number.isNaN(value)) {
    return null;
  }
  const computed = value * multiplier;
  if (!Number.isFinite(computed)) {
    return null;
  }
  return Math.round(computed);
}

function parseCurrency(input: string): string | null {
  const trimmed = input.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function parseBoolean(input: string): boolean | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  if (['yes', 'y', 'true', 'yeah', 'yup', 'sure', 'affirmative'].includes(normalized)) return true;
  if (['no', 'n', 'false', 'nope', 'nah', 'negative'].includes(normalized)) return false;
  if (normalized.startsWith('y')) return true;
  if (normalized.startsWith('n')) return false;
  return null;
}

function parsePolicyPreference(
  input: string
): 'answer' | 'skip_if_optional' | 'ask_if_required' | 'never' | null {
  const normalized = input.trim().toLowerCase();
  if (normalized.includes('skip')) return 'skip_if_optional';
  if (normalized.includes('ask')) return 'ask_if_required';
  if (normalized.includes('never') || normalized.includes('decline')) return 'never';
  if (
    normalized.includes('answer') ||
    normalized.includes('reply') ||
    normalized.includes('go ahead') ||
    normalized.includes('share')
  ) {
    return 'answer';
  }
  if (normalized.includes('only if required') || normalized.includes('only if needed')) {
    return 'ask_if_required';
  }
  return null;
}

function parseComplianceChoice(input: string): 'yes' | 'no' | 'prefer_not' | null {
  const normalized = input.trim().toLowerCase();
  if (normalized.startsWith('y') || normalized.includes('affirm')) return 'yes';
  if (normalized.startsWith('n')) return 'no';
  if (normalized.includes('prefer') || normalized.includes('skip')) return 'prefer_not';
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

function formatPhoneDigits(digits: string): string {
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
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
