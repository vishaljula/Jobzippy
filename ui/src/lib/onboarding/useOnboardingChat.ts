import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';
import { intakeAgentConfig } from '@/lib/intake';
import { vaultService } from '@/lib/vault';
import { VAULT_STORES } from '@/lib/vault/constants';
import {
  type IntakeDeferredTask,
  type IntakeMessage,
  type ProfileVault,
  type UserInfo,
} from '@/lib/types';
import { getStorage, removeStorage, setStorage } from '@/lib/storage';
import type { IntakeProcessResult } from '@/lib/intake';
import { persistIntakeResult } from '@/lib/intake';
import { chatOnboarding, type ChatMessage } from '@/lib/chat/llm';

type OnboardingThreadSnapshot = NonNullable<
  import('@/lib/types').ExtensionStorage['onboardingConversation:v1']
>;

interface UseOnboardingChatOptions {
  enabled: boolean;
  user: UserInfo | null;
}

interface SendMessagePayload {
  text: string;
}

interface OnboardingState {
  messages: IntakeMessage[];
  deferred: IntakeDeferredTask[];
}

type OnboardingAction =
  | { type: 'set_all'; payload: OnboardingState }
  | { type: 'add_message'; payload: IntakeMessage }
  | { type: 'update_message'; id: string; mapper: (m: IntakeMessage) => IntakeMessage }
  | { type: 'add_deferred'; payload: IntakeDeferredTask }
  | { type: 'resolve_deferred'; id: string };

const DEFAULT_STATE: OnboardingState = {
  messages: [],
  deferred: [],
};

const SNAPSHOT_KEY = 'onboardingConversation:v1';
const DRAFT_KEY = 'onboardingDraft:v1';

function deriveVaultPassword(user: UserInfo | null): string {
  if (!user) return 'jobzippy-demo';
  const extensionId = chrome?.runtime?.id ?? 'jobzippy';
  return `vault-${extensionId}-${user.sub}`;
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

function isValueMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value) || value === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function computeMissingFields(known?: Partial<ProfileVault>): string[] {
  return intakeAgentConfig.fieldMappings
    .filter((mapping) => {
      const value = getValueAtPath(known, mapping.path);
      return isValueMissing(value);
    })
    .map((m) => m.path);
}

function reducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'set_all':
      return action.payload;
    case 'add_message':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'update_message':
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.id ? action.mapper(m) : m)),
      };
    case 'add_deferred':
      return { ...state, deferred: [...state.deferred, action.payload] };
    case 'resolve_deferred':
      return {
        ...state,
        deferred: state.deferred.map((t) => (t.id === action.id ? { ...t, resolved: true } : t)),
      };
    default:
      return state;
  }
}

async function persistSnapshot(userId: string | undefined, state: OnboardingState): Promise<void> {
  const snapshot: OnboardingThreadSnapshot = {
    messages: state.messages,
    deferredTasks: state.deferred,
    lastUpdated: new Date().toISOString(),
    userId,
  };
  await setStorage(SNAPSHOT_KEY, snapshot as unknown as OnboardingThreadSnapshot);
}

export function useOnboardingChat({ enabled, user }: UseOnboardingChatOptions) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isProcessing, setIsProcessing] = useState(false);
  // pendingQuestionId not currently read; omit to satisfy noUnusedLocals
  const [draft, setDraft] = useState<Partial<ProfileVault> | null>(null);
  const [baselineKnown, setBaselineKnown] = useState<Partial<ProfileVault> | null>(null);

  const vaultPassword = useMemo(() => deriveVaultPassword(user), [user]);
  const userId = user?.sub;

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      const [snapshot, loadedDraft] = await Promise.all([
        getStorage(SNAPSHOT_KEY as never),
        getStorage(DRAFT_KEY as never),
      ]);

      if (cancelled) return;

      const initialDraft = (loadedDraft as Partial<ProfileVault> | undefined) ?? null;
      setDraft(initialDraft);

      if (snapshot && (snapshot as OnboardingThreadSnapshot).messages) {
        const typed = snapshot as OnboardingThreadSnapshot;
        dispatch({
          type: 'set_all',
          payload: { messages: typed.messages, deferred: typed.deferredTasks ?? [] },
        });
        setIsLoading(false);
        return;
      }

      // Prefill from vault and greet with missing fields
      try {
        const [profile, compliance, history, policies] = await Promise.all([
          vaultService.load(VAULT_STORES.profile, vaultPassword).catch(() => null),
          vaultService.load(VAULT_STORES.compliance, vaultPassword).catch(() => null),
          vaultService.load(VAULT_STORES.history, vaultPassword).catch(() => null),
          vaultService.load(VAULT_STORES.policies, vaultPassword).catch(() => null),
        ]);
        const known: Partial<ProfileVault> = {};
        if (profile) known.profile = profile;
        if (compliance) known.compliance = compliance;
        if (history) known.history = history;
        if (policies) known.policies = policies;
        setBaselineKnown(known);

        const missing = computeMissingFields(known);
        const welcome: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content:
            missing.length === 0
              ? "Great news—your profile looks complete. You can say 'Apply updates' to sync any changes or 'Edit manually'."
              : `I'll help complete your profile. First, let's fill what's missing.\nMissing: ${missing
                  .slice(0, 5)
                  .join(', ')}${missing.length > 5 ? '…' : ''}\nWhat is your ${
                  intakeAgentConfig.fieldMappings.find((m) => m.path === missing[0])?.label ??
                  missing[0]
                }?`,
          createdAt: new Date().toISOString(),
        };

        dispatch({ type: 'set_all', payload: { messages: [welcome], deferred: [] } });
        await persistSnapshot(userId, { messages: [welcome], deferred: [] });
      } catch (error) {
        const fallback: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content:
            'I had trouble loading your vault to prefill details. You can still tell me your info and I’ll prepare a draft.',
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'set_all', payload: { messages: [fallback], deferred: [] } });
        await persistSnapshot(userId, { messages: [fallback], deferred: [] });
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, vaultPassword]);

  useEffect(() => {
    if (!enabled) return;
    void persistSnapshot(userId, state);
  }, [enabled, state, userId]);

  const appendMessage = useCallback((message: IntakeMessage) => {
    dispatch({ type: 'add_message', payload: message });
  }, []);

  const askNextMissingField = useCallback(
    async (currentDraft: Partial<ProfileVault>) => {
      const missing = computeMissingFields(currentDraft);
      const known: Partial<ProfileVault> = {
        ...(baselineKnown ?? {}),
        ...currentDraft,
      };
      try {
        const history: ChatMessage[] = state.messages
          .filter((m) => m.kind === 'text')
          .slice(-10)
          .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        const content = await chatOnboarding(history, {
          knownFields: known,
          missingFields: missing,
        });
        const msg: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content,
          createdAt: new Date().toISOString(),
        };
        appendMessage(msg);
        // track pending question if needed in future
      } catch (error) {
        const failed: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content: 'Unable to generate the next question. Retry?',
          createdAt: new Date().toISOString(),
          metadata: { retryable: true },
        };
        appendMessage(failed);
        toast.error('Assistant failed to respond. You can retry.');
      }
    },
    [appendMessage, baselineKnown, state.messages]
  );

  const updateDraftAtPath = useCallback((path: string, value: unknown) => {
    setDraft((prev) => {
      const base = { ...(prev ?? {}) } as Record<string, unknown>;
      const segments = path.split('.');
      let cursor: Record<string, unknown> = base;
      for (let i = 0; i < segments.length - 1; i += 1) {
        const seg = segments[i]!;
        if (typeof cursor[seg] !== 'object' || cursor[seg] === null) {
          cursor[seg] = {};
        }
        cursor = cursor[seg] as Record<string, unknown>;
      }
      cursor[segments[segments.length - 1]!] = value as never;
      void setStorage(DRAFT_KEY as never, base as never);
      return base as Partial<ProfileVault>;
    });
  }, []);

  const handleDeferredLater = useCallback(() => {
    const task: IntakeDeferredTask = {
      id: uuid(),
      prompt: 'User deferred providing requested info',
      createdAt: new Date().toISOString(),
      reason: 'user_requested_later',
    };
    dispatch({ type: 'add_deferred', payload: task });
    const acknowledgement: IntakeMessage = {
      id: uuid(),
      role: 'assistant',
      kind: 'notice',
      content: "No problem—I'll remind you later. We can continue with the next item.",
      createdAt: new Date().toISOString(),
    };
    appendMessage(acknowledgement);
    // clear pending question if tracked in future
  }, [appendMessage]);

  const applyDraft = useCallback(async () => {
    if (!draft) {
      toast.info('Nothing to apply yet.');
      return;
    }
    setIsProcessing(true);

    appendMessage({
      id: uuid(),
      role: 'user',
      kind: 'text',
      content: 'Apply updates',
      createdAt: new Date().toISOString(),
    });

    try {
      const llm: IntakeProcessResult['llm'] = {
        profile: {
          identity: {
            first_name: draft.profile?.identity?.first_name ?? '',
            last_name: draft.profile?.identity?.last_name ?? '',
            email: draft.profile?.identity?.email ?? '',
            phone: draft.profile?.identity?.phone ?? '',
            address: draft.profile?.identity?.address ?? '',
          },
          work_auth: {
            visa_type: draft.profile?.work_auth?.visa_type ?? '',
            sponsorship_required: Boolean(draft.profile?.work_auth?.sponsorship_required),
          },
          preferences: {
            remote: Boolean(draft.profile?.preferences?.remote),
            locations: draft.profile?.preferences?.locations ?? [],
            salary_min: draft.profile?.preferences?.salary_min ?? 0,
            start_date: draft.profile?.preferences?.start_date ?? '',
          },
        },
        compliance: {
          veteran_status:
            (draft.compliance?.veteran_status as ProfileVault['compliance']['veteran_status']) ??
            'prefer_not',
          disability_status:
            (draft.compliance
              ?.disability_status as ProfileVault['compliance']['disability_status']) ??
            'prefer_not',
          criminal_history_policy:
            (draft.compliance
              ?.criminal_history_policy as ProfileVault['compliance']['criminal_history_policy']) ??
            'ask_if_required',
        },
        history: {
          employment: draft.history?.employment ?? [],
          education: draft.history?.education ?? [],
        },
        policies: {
          eeo: (draft.policies?.eeo as ProfileVault['policies']['eeo']) ?? 'ask_if_required',
          salary:
            (draft.policies?.salary as ProfileVault['policies']['salary']) ?? 'ask_if_required',
          relocation:
            (draft.policies?.relocation as ProfileVault['policies']['relocation']) ??
            'ask_if_required',
          work_shift:
            (draft.policies?.work_shift as ProfileVault['policies']['work_shift']) ??
            'ask_if_required',
        },
        previewSections: [],
        summary: '',
        confidence: 0.5,
      };
      const result: IntakeProcessResult = {
        extraction: {
          text: '',
          raw: new ArrayBuffer(0),
          metadata: { fileName: '', fileType: '', fileSize: 0 },
        },
        llm,
      };
      await persistIntakeResult(result, vaultPassword);
      await removeStorage(DRAFT_KEY as never);
      setDraft(null);
      appendMessage({
        id: uuid(),
        role: 'assistant',
        kind: 'notice',
        content: intakeAgentConfig.followUps.confirmApply,
        createdAt: new Date().toISOString(),
      });
      // clear pending question if tracked in future
    } catch (error) {
      appendMessage({
        id: uuid(),
        role: 'assistant',
        kind: 'notice',
        content:
          error instanceof Error
            ? `Failed to apply updates: ${error.message}`
            : 'Failed to apply updates.',
        createdAt: new Date().toISOString(),
        metadata: { retryable: true },
      });
    } finally {
      setIsProcessing(false);
    }
  }, [appendMessage, draft, vaultPassword]);

  const requestManualEdit = useCallback(() => {
    appendMessage({
      id: uuid(),
      role: 'user',
      kind: 'text',
      content: 'Edit manually',
      createdAt: new Date().toISOString(),
    });
    appendMessage({
      id: uuid(),
      role: 'assistant',
      kind: 'notice',
      content: intakeAgentConfig.followUps.editManual,
      createdAt: new Date().toISOString(),
    });
    // clear pending question if tracked in future
  }, [appendMessage]);

  const sendMessage = useCallback(
    async ({ text }: SendMessagePayload) => {
      if (!text.trim()) return;
      const now = new Date().toISOString();

      const userMessage: IntakeMessage = {
        id: uuid(),
        role: 'user',
        kind: 'text',
        content: text.trim(),
        createdAt: now,
      };
      appendMessage(userMessage);

      // Command handling
      const normalized = text.trim().toLowerCase();
      if (['apply updates', 'apply'].includes(normalized)) {
        void (async () => {
          await applyDraft();
        })();
        return;
      }
      if (['edit manually', 'edit'].includes(normalized)) {
        requestManualEdit();
        return;
      }
      if (['later', 'not now', 'maybe later', 'skip', 'not yet'].includes(normalized)) {
        handleDeferredLater();
        return;
      }

      // Try to map answer to the first missing field deterministically
      try {
        setIsProcessing(true);
        const currentDraft = draft ?? {};
        const missing = computeMissingFields(currentDraft);
        if (missing.length > 0) {
          const path = missing[0]!;
          // naive coercion for common types
          const lower = userMessage.content.toLowerCase();
          let value: unknown = userMessage.content;
          if (path.endsWith('sponsorship_required') || path.endsWith('remote')) {
            value = ['yes', 'true', 'y', '1'].includes(lower);
          } else if (path.endsWith('salary_min')) {
            const parsed = Number.parseFloat(userMessage.content.replace(/[^\d.]/g, ''));
            value = Number.isNaN(parsed) ? 0 : parsed;
          } else if (path.endsWith('locations')) {
            value = userMessage.content
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
          updateDraftAtPath(path, value);
        }
        await askNextMissingField((draft ?? {}) as Partial<ProfileVault>);
      } catch (error) {
        const failed: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content: 'Something went wrong generating a response. Retry?',
          createdAt: new Date().toISOString(),
          metadata: { retryable: true },
        };
        appendMessage(failed);
        toast.error('Assistant failed to respond. You can retry.');
      } finally {
        setIsProcessing(false);
      }
    },
    [
      appendMessage,
      askNextMissingField,
      draft,
      handleDeferredLater,
      requestManualEdit,
      updateDraftAtPath,
      applyDraft,
    ]
  );

  const startOver = useCallback(async () => {
    await Promise.all([removeStorage(SNAPSHOT_KEY as never), removeStorage(DRAFT_KEY as never)]);
    dispatch({ type: 'set_all', payload: DEFAULT_STATE });
    setDraft(null);
    toast.success('Onboarding conversation and draft cleared.');
  }, []);

  const saveAndContinue = useCallback(async () => {
    await persistSnapshot(userId, state);
    if (draft) {
      await setStorage(DRAFT_KEY as never, draft as never);
    }
    toast.success('Progress saved. You can continue later.');
  }, [draft, state, userId]);

  const retryMessage = useCallback(
    async (messageId: string) => {
      const failed = state.messages.find((m) => m.id === messageId);
      if (!failed) return;
      dispatch({
        type: 'update_message',
        id: messageId,
        mapper: (m) => ({ ...m, metadata: { ...m.metadata, retryable: false } }),
      });
      // Simply ask next item again
      await askNextMissingField((draft ?? {}) as Partial<ProfileVault>);
    },
    [askNextMissingField, draft, state.messages]
  );

  return {
    isLoading,
    isProcessing,
    messages: state.messages,
    deferredTasks: state.deferred,
    sendMessage,
    applyDraft,
    requestManualEdit,
    startOver,
    saveAndContinue,
    retryMessage,
    hasDraft: Boolean(draft),
  } as const;
}
