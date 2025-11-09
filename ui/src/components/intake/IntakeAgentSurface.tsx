import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

import { Button } from '@/components/ui/button';
import {
  type IntakeAttachment,
  type IntakeMessage,
  type IntakePreviewSection,
  type IntakeStatusStep,
  type UserInfo,
} from '@/lib/types';
import { useIntakeAgent } from '@/lib/intake';
import type { ResumeExtractionMetadata } from '@/lib/intake';
import { cn } from '@/lib/utils';

interface IntakeAgentSurfaceProps {
  enabled: boolean;
  user: UserInfo | null;
  className?: string;
}

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

function AttachmentChips({ attachments }: { attachments: IntakeAttachment[] }) {
  if (!attachments?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <span
          key={attachment.id}
          className="inline-flex items-center space-x-2 rounded-full bg-white/70 px-3 py-1 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200 backdrop-blur"
        >
          <Paperclip className="h-3 w-3" />
          <span className="font-medium">{attachment.name}</span>
          <span className="text-[10px] text-slate-400">
            {(attachment.size / 1024).toFixed(0)} KB
          </span>
        </span>
      ))}
    </div>
  );
}

function StatusStep({ step }: { step: IntakeStatusStep }) {
  const Icon =
    step.state === 'completed'
      ? CheckCircle2
      : step.state === 'in_progress'
        ? Loader2
        : step.state === 'error'
          ? AlertTriangle
          : Clock;

  return (
    <div className="flex items-start space-x-3">
      <div
        className={clsx(
          'mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border',
          step.state === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-600',
          step.state === 'in_progress' &&
            'border-indigo-200 bg-indigo-50 text-indigo-600 animate-pulse',
          step.state === 'error' && 'border-rose-200 bg-rose-50 text-rose-500',
          step.state === 'pending' && 'border-slate-200 bg-white text-slate-300'
        )}
      >
        <Icon className={clsx('h-4 w-4', step.state === 'in_progress' && 'animate-spin')} />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">{step.label}</p>
        {step.description && <p className="text-xs text-slate-500">{step.description}</p>}
        {step.error && <p className="text-xs text-rose-500">{step.error}</p>}
      </div>
    </div>
  );
}

function StatusMessage({ message }: { message: IntakeMessage }) {
  const steps = message.statusSteps ?? [];
  return (
    <div className="rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex items-center space-x-2">
        <Sparkles className="h-4 w-4 text-indigo-500" />
        <p className="text-sm font-semibold text-indigo-600">{message.content}</p>
      </div>
      <div className="space-y-4">
        {steps.map((step) => (
          <StatusStep key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

function PreviewSection({ section }: { section: IntakePreviewSection }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">{section.title}</h4>
          <p className="text-xs text-slate-400">
            Confidence {Math.round(section.confidence * 100)}%
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {section.fields.map((field) => (
          <div key={field.id} className="rounded-lg border border-slate-200 bg-white/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">{field.label}</p>
            {Array.isArray(field.value) ? (
              <p className="mt-1 text-sm text-slate-700">{field.value.join(', ')}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-700">{field.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewMessage({ message }: { message: IntakeMessage }) {
  const sections = message.previewSections ?? [];
  const metadata =
    (message.metadata as {
      confidence?: number;
      resumeMetadata?: ResumeExtractionMetadata;
    }) ?? {};
  const confidence = typeof metadata.confidence === 'number' ? metadata.confidence : undefined;
  const resumeMeta = metadata.resumeMetadata;

  return (
    <div className="space-y-4 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Resume parsed successfully</p>
          <p className="text-xs text-slate-400">
            Confidence {Math.round((confidence ?? 0) * 100)}%
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-600">
          {resumeMeta?.fileName ?? 'Resume'}
        </span>
      </div>
      <p className="text-sm text-slate-700">{message.content}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((section) => (
          <PreviewSection key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: IntakeMessage }) {
  const isAssistant = message.role !== 'user';
  const wrapperClass = clsx(
    'flex flex-col space-y-2',
    isAssistant ? 'items-start' : 'items-end self-end'
  );
  const bubbleClass = isAssistant
    ? 'max-w-full md:max-w-[65%] bg-white/85 text-slate-700 border border-indigo-100 rounded-3xl rounded-tl-md'
    : 'max-w-full md:max-w-[55%] bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-3xl rounded-tr-md self-end';

  if (message.kind === 'status') {
    return (
      <div className="flex flex-col items-start space-y-2">
        <StatusMessage message={message} />
        <span className="text-[10px] uppercase tracking-wide text-slate-300">
          {formatTimestamp(message.createdAt)}
        </span>
      </div>
    );
  }

  if (message.kind === 'preview') {
    return (
      <div className="flex flex-col items-start space-y-2">
        <PreviewMessage message={message} />
        <span className="text-[10px] uppercase tracking-wide text-slate-300">
          {formatTimestamp(message.createdAt)}
        </span>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className={clsx('rounded-3xl px-4 py-3 shadow-sm backdrop-blur', bubbleClass)}>
        <p className="text-sm leading-relaxed">{message.content}</p>
        {message.attachments && <AttachmentChips attachments={message.attachments} />}
      </div>
      <span className="text-[10px] uppercase tracking-wide text-slate-300">
        {formatTimestamp(message.createdAt)}
      </span>
    </div>
  );
}

export function IntakeAgentSurface({ enabled, user, className }: IntakeAgentSurfaceProps) {
  const {
    isLoading,
    isProcessing,
    messages,
    pendingAttachment,
    setPendingAttachment,
    sendMessage,
  } = useIntakeAgent({ enabled, user });

  const [composerValue, setComposerValue] = useState('');
  const [queuedFile, setQueuedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [messages]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [sortedMessages.length]);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setQueuedFile(file);
    setPendingAttachment({
      id: 'pending',
      kind: 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });
  };

  const handleRemoveAttachment = () => {
    setQueuedFile(null);
    setPendingAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (isProcessing) return;
    if (!composerValue.trim() && !queuedFile) {
      return;
    }

    try {
      await sendMessage({
        text: composerValue,
        attachments: queuedFile ? [queuedFile] : [],
      });
    } finally {
      setComposerValue('');
      handleRemoveAttachment();
    }
  };

  if (!enabled) return null;

  return (
    <div
      className={cn(
        'relative flex h-full min-h-[560px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-xl backdrop-blur',
        className
      )}
    >
      <header className="border-b border-slate-200 bg-white/85 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Intake Agent</h3>
            <p className="text-xs text-slate-400">
              Chat-first intake · Resume parsing · Vault sync
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <span>Live</span>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          sortedMessages.map((message) => <ChatMessage key={message.id} message={message} />)
        )}
      </div>

      <footer className="mt-auto border-t border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm backdrop-blur">
          <div className="flex items-end space-x-3">
            <button
              type="button"
              onClick={handleAttachClick}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              disabled={isProcessing}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              className="h-16 flex-1 resize-none rounded-2xl border-none bg-transparent p-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
              placeholder="Ask Jobzippy anything or paste a job note..."
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              disabled={isProcessing}
            />
            <Button
              size="icon"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={isProcessing || (!composerValue.trim() && !queuedFile)}
              className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg hover:from-indigo-600 hover:to-purple-600"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {(pendingAttachment || queuedFile) && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-indigo-500">
                  <Paperclip className="h-4 w-4" />
                </div>
                <div>
                  {(() => {
                    const attachmentSize = pendingAttachment?.size ?? queuedFile?.size ?? 0;
                    const attachmentType =
                      pendingAttachment?.mimeType ?? queuedFile?.type ?? 'Unknown format';
                    const formattedSize = `${(attachmentSize / 1024).toFixed(0)} KB`;
                    return (
                      <>
                        <p className="text-sm font-semibold text-indigo-600">
                          {pendingAttachment?.name ?? queuedFile?.name}
                        </p>
                        <p className="text-xs text-indigo-400">
                          {formattedSize} · {attachmentType}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-indigo-500 hover:bg-indigo-100"
                onClick={handleRemoveAttachment}
              >
                Remove
              </Button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          hidden
          onChange={handleFileChange}
        />
      </footer>
    </div>
  );
}
