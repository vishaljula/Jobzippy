import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { processResumeWithAgent } from '@/lib/intake/service';
import type {
  IntakeMessage,
  IntakeDeferredTask,
  ProfileVault,
  UserInfo,
  OnboardingConversationSnapshot,
} from '@/lib/types';
import { getStorage, setStorage } from '@/lib/storage';
import { deriveVaultPassword } from '@/lib/vault/utils';
import { vaultService } from '@/lib/vault/service';
import { VAULT_STORES } from '@/lib/vault/constants';

const SNAPSHOT_VERSION = 1;
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

const REQUIRED_FIELDS = [
  {
    path: 'profile.identity.phone',
    question: 'What phone number should recruiters use (digits only)?',
    parse: parsePhone,
  },
  {
    path: 'profile.identity.address',
    question: 'What city/state are you based in?',
    parse: parseString,
  },
  {
    path: 'profile.preferences.locations',
    question: 'List your preferred locations (comma-separated or type “remote”).',
    parse: parseLocations,
  },
  {
    path: 'profile.preferences.salary_min',
    question: 'What minimum salary should I target (USD)?',
    parse: parseSalary,
  },
  {
    path: 'profile.work_auth.visa_type',
    question: 'What visa or work authorization do you have?',
    parse: parseString,
  },
  {
    path: 'profile.work_auth.sponsorship_required',
    question: 'Do you need sponsorship now or in the future? (yes/no)',
    parse: parseBoolean,
  },
  {
    path: 'policies.salary',
    question:
      'When apps ask for salary expectations, should I answer, skip if optional, or ask you first?',
    parse: parsePolicyPreference,
  },
  {
    path: 'policies.relocation',
    question: 'How should I answer relocation questions? (answer/skip/ask/never)',
    parse: parsePolicyPreference,
  },
  {
    path: 'compliance.veteran_status',
    question: 'How should we answer veteran status questions? (yes/no/prefer not to say)',
    parse: parseComplianceChoice,
  },
  {
    path: 'compliance.disability_status',
    question: 'How should we answer disability questions? (yes/no/prefer not to say)',
    parse: parseComplianceChoice,
  },
  {
    path: 'compliance.criminal_history_policy',
    question:
      'If an application asks about criminal history, should I answer, skip if optional, ask you first, or never answer?',
    parse: parsePolicyPreference,
  },
];

const DEFAULT_PROGRESS = {
  completed: 0,
  total: REQUIRED_FIELDS.length,
  percentage: 0,
  status: 'idle' as const,
};

const DEFER_KEYWORDS = ['later', 'not now', 'maybe later', 'skip', 'not yet'];

interface UseOnboardingChatOptions {
  enabled: boolean;
  user: UserInfo | null;
}

export function useOnboardingChat({ enabled, user }: UseOnboardingChatOptions) {
  const [messages, setMessages] = useState<IntakeMessage[]>(DEFAULT_MESSAGES);
  const [deferredTasks, setDeferredTasks] = useState<IntakeDeferredTask[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>(REQUIRED_FIELDS.map((f) => f.path));
  const [pendingFieldPath, setPendingFieldPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileVault | null>(null);
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isThinking, setIsThinking] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const vaultPassword = useMemo(() => deriveVaultPassword(user), [user]);
  const userKey = user?.sub ?? 'anonymous';

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      const conversations = (await getStorage('onboardingConversations')) ?? {};
      const snapshot = conversations[userKey];

      if (cancelled) return;

      if (snapshot?.version === SNAPSHOT_VERSION) {
        setMessages(snapshot.messages.length ? snapshot.messages : DEFAULT_MESSAGES);
        setDeferredTasks(snapshot.deferredTasks ?? []);
        setMissingFields(snapshot.missingFields ?? REQUIRED_FIELDS.map((f) => f.path));
        setPendingFieldPath(snapshot.pendingFieldPath ?? null);
        setProgress(snapshot.progress ?? DEFAULT_PROGRESS);
        setDraft(snapshot.draft ?? null);
        setHasResume(Boolean(snapshot.hasResume));
      } else {
        setMessages(DEFAULT_MESSAGES);
        setDeferredTasks([]);
        setMissingFields(REQUIRED_FIELDS.map((f) => f.path));
        setPendingFieldPath(null);
        setProgress(DEFAULT_PROGRESS);
        setDraft(null);
        setHasResume(false);
      }

      if (!snapshot?.draft) {
        try {
          const existing = await loadVaultSnapshot(vaultPassword);
          if (existing) {
            setDraft(existing);
            const remaining = computeMissingFields(existing);
            setMissingFields(remaining);
            updateProgressState(remaining.length, existing);
            setHasResume(true);
          }
        } catch {
          // ignore vault load errors in onboarding chat
        }
      }

      setHydrated(true);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userKey]);

  useEffect(() => {
    if (!hydrated) return;
    void persistSnapshot(userKey, {
      version: SNAPSHOT_VERSION,
      messages,
      deferredTasks,
      pendingFieldPath,
      missingFields,
      progress,
      draft,
      hasResume,
      lastUpdated: new Date().toISOString(),
    });
  }, [
    messages,
    deferredTasks,
    pendingFieldPath,
    missingFields,
    progress,
    draft,
    hasResume,
    userKey,
    hydrated,
  ]);

  const updateProgressState = useCallback(
    (remaining: number, currentDraft: ProfileVault | null) => {
      const completed = Math.max(0, REQUIRED_FIELDS.length - remaining);
      const percentage = Math.round((completed / REQUIRED_FIELDS.length) * 100);
      const nextStatus =
        remaining === 0 && currentDraft && hasResume
          ? ('ready' as const)
          : completed === 0
            ? 'idle'
            : 'collecting';
      setProgress({
        completed,
        total: REQUIRED_FIELDS.length,
        percentage,
        status: nextStatus,
      });
    },
    [hasResume]
  );

  const appendMessage = useCallback((message: IntakeMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const askNextField = useCallback(
    (fields: string[]) => {
      if (!fields.length) {
        setPendingFieldPath(null);
        return;
      }
      const path = fields[0];
      setPendingFieldPath(path);
      const config = REQUIRED_FIELDS.find((field) => field.path === path);
      if (config) {
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content: config.question,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [appendMessage]
  );

  const handleResumeProcessing = useCallback(
    async (file: File) => {
      setIsThinking(true);
      try {
        const conversationPayload = messages
          .filter((message) => message.kind === 'text')
          .slice(-6)
          .map((message) => ({
            role: message.role,
            content: message.content,
          }));

        const result = await processResumeWithAgent(file, {
          password: vaultPassword,
          emit: () => {},
          conversation: conversationPayload,
        });

        const previewMessage: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'preview',
          content: result.llm.summary,
          createdAt: new Date().toISOString(),
          previewSections: result.llm.previewSections,
          metadata: {
            confidence: result.llm.confidence,
            resumeMetadata: result.extraction.metadata,
          },
        };

        appendMessage(previewMessage);
        setDraft({
          profile: result.llm.profile,
          compliance: result.llm.compliance,
          history: result.llm.history,
          policies: result.llm.policies,
        });
        setHasResume(true);

        const remaining = computeMissingFields({
          profile: result.llm.profile,
          compliance: result.llm.compliance,
          history: result.llm.history,
          policies: result.llm.policies,
        });
        setMissingFields(remaining);
        updateProgressState(remaining.length, {
          profile: result.llm.profile,
          compliance: result.llm.compliance,
          history: result.llm.history,
          policies: result.llm.policies,
        });
        askNextField(remaining);
      } catch (error) {
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content:
            error instanceof Error
              ? `I couldn’t parse that resume: ${error.message}. Could you try a different PDF or DOCX?`
              : 'I ran into an issue reading that file. Could you try a different format (PDF or DOCX)?',
          createdAt: new Date().toISOString(),
        });
      } finally {
        setIsThinking(false);
      }
    },
    [appendMessage, messages, askNextField, updateProgressState, vaultPassword]
  );

  const handleFieldAnswer = useCallback(
    (answer: string) => {
      if (!pendingFieldPath) return;
      const config = REQUIRED_FIELDS.find((field) => field.path === pendingFieldPath);
      if (!config) return;

      const parsed = config.parse(answer);
      if (parsed === null || parsed === undefined || parsed === '') {
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content: 'I couldn’t quite parse that. Could you rephrase it clearly?',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      setDraft((prev) => {
        const next = ensureDraft(prev);
        setValueAtPath(next, config.path, parsed);
        return { ...next };
      });

      const remaining = missingFields.filter((path) => path !== config.path);
      setMissingFields(remaining);
      updateProgressState(remaining.length, ensureDraft(draft));

      appendMessage({
        id: uuid(),
        role: 'assistant',
        kind: 'text',
        content: `Got it — recorded ${formatValue(parsed)} for ${config.question}`,
        createdAt: new Date().toISOString(),
      });

      setPendingFieldPath(null);
      if (remaining.length > 0) {
        askNextField(remaining);
      }
    },
    [appendMessage, pendingFieldPath, missingFields, updateProgressState, draft, askNextField]
  );

  const sendMessage = useCallback(
    async ({ text, attachments = [] }: { text: string; attachments?: File[] }) => {
      if (!enabled) return;
      if (!text.trim() && attachments.length === 0) return;

      const now = new Date().toISOString();
      const userMessage: IntakeMessage = {
        id: uuid(),
        role: 'user',
        kind: 'text',
        content: text.trim(),
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
      appendMessage(userMessage);

      if (attachments.length) {
        await handleResumeProcessing(attachments[0]!);
        return;
      }

      if (DEFER_KEYWORDS.includes(text.trim().toLowerCase())) {
        const task: IntakeDeferredTask = {
          id: uuid(),
          prompt: pendingFieldPath ?? 'General onboarding follow-up',
          createdAt: new Date().toISOString(),
          reason: 'user_requested_later',
        };
        setDeferredTasks((prev) => [...prev, task]);
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content: "No problem—I'll remind you about this later.",
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (!hasResume && attachments.length === 0) {
        appendMessage({
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content: 'Could you upload your resume first? I’ll use it to pre-fill everything.',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (!pendingFieldPath && missingFields.length > 0) {
        askNextField(missingFields);
        return;
      }

      handleFieldAnswer(text);
    },
    [
      appendMessage,
      handleResumeProcessing,
      hasResume,
      pendingFieldPath,
      missingFields,
      handleFieldAnswer,
      askNextField,
      enabled,
    ]
  );

  const startOver = useCallback(async () => {
    setMessages(DEFAULT_MESSAGES);
    setDeferredTasks([]);
    setMissingFields(REQUIRED_FIELDS.map((field) => field.path));
    setPendingFieldPath(null);
    setDraft(null);
    setHasResume(false);
    setProgress(DEFAULT_PROGRESS);
    setCompletedAt(null);
    await persistSnapshot(userKey, {
      version: SNAPSHOT_VERSION,
      messages: DEFAULT_MESSAGES,
      deferredTasks: [],
      missingFields: REQUIRED_FIELDS.map((field) => field.path),
      pendingFieldPath: null,
      progress: DEFAULT_PROGRESS,
      draft: null,
      hasResume: false,
      lastUpdated: new Date().toISOString(),
    });
  }, [userKey]);

  useEffect(() => {
    if (!draft || missingFields.length > 0 || !hasResume || completedAt) return;

    setProgress((prev) => ({ ...prev, status: 'saving' }));
    void (async () => {
      await persistDraftToVault(draft, vaultPassword);
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
  }, [draft, missingFields.length, hasResume, vaultPassword, completedAt, appendMessage]);

  return {
    isLoading,
    isThinking,
    messages,
    deferredTasks,
    progress,
    sendMessage,
    startOver,
    hasResume,
    completedAt,
  } as const;
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

  return {
    profile: profile ?? {
      identity: { first_name: '', last_name: '', phone: '', email: '', address: '' },
      work_auth: { visa_type: '', sponsorship_required: false },
      preferences: { remote: true, locations: [], salary_min: 0, start_date: '' },
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
}

async function persistDraftToVault(draft: ProfileVault, password: string) {
  await vaultService.save(VAULT_STORES.profile, draft.profile, password);
  await vaultService.save(VAULT_STORES.compliance, draft.compliance, password);
  await vaultService.save(VAULT_STORES.history, draft.history, password);
  await vaultService.save(VAULT_STORES.policies, draft.policies, password);
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
  if (draft) return draft;
  return {
    profile: {
      identity: { first_name: '', last_name: '', phone: '', email: '', address: '' },
      work_auth: { visa_type: '', sponsorship_required: false },
      preferences: { remote: true, locations: [], salary_min: 0, start_date: '' },
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

function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  });
}

function isValueMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function parsePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  return digits;
}

function parseString(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

function parseLocations(input: string): string[] | null {
  const normalized = input.trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'remote') return ['Remote'];
  return normalized
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseSalary(input: string): number | null {
  const normalized = input.replace(/[,$]/g, '').toLowerCase();
  const match = normalized.match(/(\d+)(k)?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  return match[2] ? value * 1000 : value;
}

function parseBoolean(input: string): boolean | null {
  const normalized = input.trim().toLowerCase();
  if (['yes', 'y', 'true', 'yeah', 'yup'].includes(normalized)) return true;
  if (['no', 'n', 'false', 'nope'].includes(normalized)) return false;
  return null;
}

function parsePolicyPreference(
  input: string
): 'answer' | 'skip_if_optional' | 'ask_if_required' | 'never' | null {
  const normalized = input.trim().toLowerCase();
  if (normalized.includes('skip')) return 'skip_if_optional';
  if (normalized.includes('ask')) return 'ask_if_required';
  if (normalized.includes('never')) return 'never';
  if (
    normalized.includes('answer') ||
    normalized.includes('reply') ||
    normalized.includes('go ahead')
  ) {
    return 'answer';
  }
  return null;
}

function parseComplianceChoice(input: string): 'yes' | 'no' | 'prefer_not' | null {
  const normalized = input.trim().toLowerCase();
  if (normalized.startsWith('y')) return 'yes';
  if (normalized.startsWith('n')) return 'no';
  if (normalized.includes('prefer')) return 'prefer_not';
  return null;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '(empty)';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value ?? '(empty)');
}
