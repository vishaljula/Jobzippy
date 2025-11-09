import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { intakeAgentConfig, INTAKE_STATUS_STEPS } from './config';
import { processResumeWithAgent } from './service';
import type { IntakeProgressUpdate } from './types';
import {
  type IntakeAttachment,
  type IntakeConversationSnapshot,
  type IntakeDeferredTask,
  type IntakeMessage,
  type IntakeStatusStep,
  type ProfileVault,
  type UserInfo,
} from '@/lib/types';
import { getStorage, setStorage } from '@/lib/storage';

interface UseIntakeAgentOptions {
  enabled: boolean;
  user: UserInfo | null;
}

interface SendMessagePayload {
  text: string;
  attachments: File[];
}

interface IntakeAgentState {
  messages: IntakeMessage[];
  deferred: IntakeDeferredTask[];
}

type IntakeAgentAction =
  | { type: 'set_all'; payload: IntakeAgentState }
  | { type: 'add_message'; payload: IntakeMessage }
  | { type: 'update_message'; id: string; mapper: (message: IntakeMessage) => IntakeMessage }
  | { type: 'add_deferred'; payload: IntakeDeferredTask }
  | { type: 'resolve_deferred'; id: string };

const DEFAULT_STATE: IntakeAgentState = {
  messages: [],
  deferred: [],
};

const STATUS_TEMPLATE: IntakeStatusStep[] = [
  { ...INTAKE_STATUS_STEPS.prepare, state: 'pending' },
  { ...INTAKE_STATUS_STEPS.extract, state: 'pending' },
  { ...INTAKE_STATUS_STEPS.analyze, state: 'pending' },
  { ...INTAKE_STATUS_STEPS.persist, state: 'pending' },
  { ...INTAKE_STATUS_STEPS.complete, state: 'pending' },
];

const SNAPSHOT_VERSION = 1;

function deriveVaultPassword(user: UserInfo | null): string {
  if (!user) {
    return 'jobzippy-demo';
  }
  const extensionId = chrome?.runtime?.id ?? 'jobzippy';
  return `vault-${extensionId}-${user.sub}`;
}

function applyProgressToSteps(
  steps: IntakeStatusStep[],
  update: IntakeProgressUpdate
): IntakeStatusStep[] {
  return steps.map((step) => {
    if (step.id !== update.step.id) {
      return step;
    }
    return {
      ...step,
      ...update.step,
    };
  });
}

function intakeReducer(state: IntakeAgentState, action: IntakeAgentAction): IntakeAgentState {
  switch (action.type) {
    case 'set_all':
      return action.payload;
    case 'add_message':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
    case 'update_message':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id ? action.mapper(message) : message
        ),
      };
    case 'add_deferred':
      return {
        ...state,
        deferred: [...state.deferred, action.payload],
      };
    case 'resolve_deferred':
      return {
        ...state,
        deferred: state.deferred.map((task) =>
          task.id === action.id ? { ...task, resolved: true } : task
        ),
      };
    default:
      return state;
  }
}

async function persistSnapshot(state: IntakeAgentState): Promise<void> {
  const snapshot: IntakeConversationSnapshot = {
    version: SNAPSHOT_VERSION,
    messages: state.messages,
    deferredTasks: state.deferred,
    lastUpdated: new Date().toISOString(),
  };
  await setStorage('intakeConversation', snapshot);
}

async function persistVaultDraft(data: ProfileVault): Promise<void> {
  await setStorage('intakeDraft', data);
}

export function useIntakeAgent({ enabled, user }: UseIntakeAgentOptions) {
  const [state, dispatch] = useReducer(intakeReducer, DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<IntakeAttachment | null>(null);
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);

  const vaultPassword = useMemo(() => deriveVaultPassword(user), [user]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      const snapshot = await getStorage('intakeConversation');

      if (cancelled) return;

      if (snapshot?.version === SNAPSHOT_VERSION) {
        dispatch({
          type: 'set_all',
          payload: {
            messages: snapshot.messages,
            deferred: snapshot.deferredTasks,
          },
        });
      } else {
        const welcomeMessage: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'text',
          content: `${intakeAgentConfig.prompts.welcome}\n${intakeAgentConfig.prompts.resumeRequest}`,
          createdAt: new Date().toISOString(),
        };
        dispatch({
          type: 'set_all',
          payload: {
            messages: [welcomeMessage],
            deferred: [],
          },
        });
        await persistSnapshot({
          messages: [welcomeMessage],
          deferred: [],
        });
      }

      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const appendMessage = useCallback((message: IntakeMessage) => {
    dispatch({ type: 'add_message', payload: message });
  }, []);

  useEffect(() => {
    // When state changes due to reducer actions (except append), persist snapshot.
    if (!enabled) return;
    void persistSnapshot(state);
  }, [enabled, state]);

  const handleProgressUpdate = useCallback(
    (statusMessageId: string) => (update: IntakeProgressUpdate) => {
      dispatch({
        type: 'update_message',
        id: statusMessageId,
        mapper: (message) => {
          const steps = message.statusSteps ?? STATUS_TEMPLATE;
          return {
            ...message,
            statusSteps: applyProgressToSteps(steps, update),
          };
        },
      });
    },
    []
  );

  const handleDeferredLater = useCallback(() => {
    const task: IntakeDeferredTask = {
      id: uuid(),
      prompt: pendingFollowUp ?? 'Review resume updates later',
      createdAt: new Date().toISOString(),
      reason: 'user_requested_later',
    };
    dispatch({ type: 'add_deferred', payload: task });
    const acknowledgement: IntakeMessage = {
      id: uuid(),
      role: 'assistant',
      kind: 'notice',
      content: `${intakeAgentConfig.followUps.deferAck}\n${intakeAgentConfig.prompts.deferLater}`,
      createdAt: new Date().toISOString(),
    };
    appendMessage(acknowledgement);
    setPendingFollowUp(null);
  }, [appendMessage, pendingFollowUp]);

  const handleResumeProcessing = useCallback(
    async (file: File) => {
      setIsProcessing(true);

      const statusMessage: IntakeMessage = {
        id: uuid(),
        role: 'assistant',
        kind: 'status',
        content: intakeAgentConfig.followUps.resumeReceived,
        createdAt: new Date().toISOString(),
        statusSteps: STATUS_TEMPLATE,
      };

      appendMessage(statusMessage);
      const emit = handleProgressUpdate(statusMessage.id);

      try {
        const result = await processResumeWithAgent(file, vaultPassword, emit);

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

        const profileVault: ProfileVault = {
          profile: result.llm.profile,
          compliance: result.llm.compliance,
          history: result.llm.history,
          policies: result.llm.policies,
        };

        await persistVaultDraft(profileVault);

        appendMessage(previewMessage);

        if (result.llm.followUpPrompt) {
          const followUp: IntakeMessage = {
            id: uuid(),
            role: 'assistant',
            kind: 'text',
            content: result.llm.followUpPrompt,
            createdAt: new Date().toISOString(),
          };
          appendMessage(followUp);
          setPendingFollowUp(followUp.id);
        } else {
          setPendingFollowUp(null);
        }
      } catch (error) {
        const message: IntakeMessage = {
          id: uuid(),
          role: 'assistant',
          kind: 'notice',
          content:
            error instanceof Error
              ? `${intakeAgentConfig.followUps.resumeFailed}\n${error.message}`
              : intakeAgentConfig.followUps.resumeFailed,
          createdAt: new Date().toISOString(),
        };
        appendMessage(message);
      } finally {
        setIsProcessing(false);
        setPendingAttachment(null);
      }
    },
    [appendMessage, handleProgressUpdate, vaultPassword]
  );

  const sendMessage = useCallback(
    async ({ text, attachments }: SendMessagePayload) => {
      if (!text && attachments.length === 0) {
        return;
      }

      const trimmed = text.trim();
      const now = new Date().toISOString();
      const attachmentDtos: IntakeAttachment[] = attachments.map((file) => ({
        id: uuid(),
        kind: 'file',
        name: file.name,
        size: file.size,
        mimeType: file.type,
      }));

      const userMessage: IntakeMessage = {
        id: uuid(),
        role: 'user',
        kind: 'text',
        content: trimmed,
        createdAt: now,
        attachments: attachmentDtos.length ? attachmentDtos : undefined,
      };

      appendMessage(userMessage);

      if (attachmentDtos.length > 0) {
        const [firstAttachment] = attachments;
        if (firstAttachment) {
          await handleResumeProcessing(firstAttachment);
        }
        return;
      }

      if (['later', 'not now', 'maybe later'].includes(trimmed.toLowerCase())) {
        handleDeferredLater();
        return;
      }

      const response: IntakeMessage = {
        id: uuid(),
        role: 'assistant',
        kind: 'text',
        content: intakeAgentConfig.prompts.resumeRequest,
        createdAt: new Date().toISOString(),
      };
      appendMessage(response);
    },
    [appendMessage, handleDeferredLater, handleResumeProcessing]
  );

  const resolveDeferredTask = useCallback((id: string) => {
    dispatch({ type: 'resolve_deferred', id });
  }, []);

  return {
    isLoading,
    isProcessing,
    messages: state.messages,
    deferredTasks: state.deferred,
    pendingAttachment,
    setPendingAttachment,
    sendMessage,
    resolveDeferredTask,
    pendingFollowUp,
  } as const;
}
