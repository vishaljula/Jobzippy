import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Paperclip, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type {
  IntakeAttachment,
  IntakeMessage,
  IntakePreviewSection,
  IntakeStatusStep,
} from '@/lib/types';

export interface ChatMessageProps {
  message: IntakeMessage;
  onApplyPreview?: () => void;
  onEditPreview?: () => void;
  isPreviewProcessing?: boolean;
}

export function ChatMessage({
  message,
  onApplyPreview,
  onEditPreview,
  isPreviewProcessing,
}: ChatMessageProps) {
  const isAssistant = message.role !== 'user';
  const alignment = isAssistant ? 'items-start' : 'items-end';
  const bubbleClass = isAssistant
    ? 'bg-white/80 text-slate-700 border border-indigo-100 rounded-3xl rounded-tl-md'
    : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-3xl rounded-tr-md';

  if (message.kind === 'status') {
    return (
      <div className="flex flex-col items-start space-y-2">
        <StatusMessage message={message} />
        <Timestamp iso={message.createdAt} />
      </div>
    );
  }

  if (message.kind === 'preview') {
    return (
      <div className="flex flex-col items-start space-y-2">
        <PreviewMessage
          message={message}
          onApply={onApplyPreview}
          onEdit={onEditPreview}
          isApplying={isPreviewProcessing}
        />
        <Timestamp iso={message.createdAt} />
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col', alignment, 'space-y-2')}>
      <div
        className={clsx('max-w-[85%] rounded-3xl px-4 py-3 shadow-sm backdrop-blur', bubbleClass)}
      >
        <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
        {message.attachments && <AttachmentChips attachments={message.attachments} />}
      </div>
      <Timestamp iso={message.createdAt} />
    </div>
  );
}

function Timestamp({ iso }: { iso: string }) {
  return (
    <span className="text-[10px] uppercase tracking-wide text-slate-300">
      {formatTimestamp(iso)}
    </span>
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

function PreviewMessage({
  message,
  onApply,
  onEdit,
  isApplying,
}: {
  message: IntakeMessage;
  onApply?: () => void;
  onEdit?: () => void;
  isApplying?: boolean;
}) {
  const sections = message.previewSections ?? [];
  const metadata = message.metadata ?? {};

  return (
    <div className="space-y-4 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Resume parsed successfully</p>
          <p className="text-xs text-slate-400">
            Confidence {Math.round(((metadata.confidence as number) ?? 0) * 100)}%
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-600">
          {(metadata.resumeMetadata as { fileName?: string })?.fileName ?? 'Resume'}
        </span>
      </div>
      <p className="text-sm text-slate-700">{message.content}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((section) => (
          <PreviewSection key={section.id} section={section} />
        ))}
      </div>
      {(onApply || onEdit) && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-200 text-xs text-slate-500 hover:bg-slate-100"
            onClick={onEdit}
            disabled={!onEdit}
          >
            Edit manually
          </Button>
          <Button
            size="sm"
            className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-xs font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-purple-600"
            onClick={onApply}
            disabled={!onApply || isApplying}
          >
            {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply updates'}
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewSection({ section }: { section: IntakePreviewSection }) {
  const normalizedConfidence = Math.min(1, Math.max(0, section.confidence));
  const confidencePercent = Math.round(normalizedConfidence * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">{section.title}</h4>
          <p className="text-xs text-slate-400">Confidence {confidencePercent}%</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {section.fields.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No data extracted for this section</p>
        ) : (
          section.fields.map((field) => (
            <div key={field.id} className="rounded-lg border border-slate-200 bg-white/70 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{field.label}</p>
              {Array.isArray(field.value) ? (
                <p className="mt-1 text-sm text-slate-700">
                  {field.value.length > 0 ? field.value.join(', ') : '(empty)'}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-700">{field.value || '(empty)'}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

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
            {formatAttachmentSize(attachment.size)}
          </span>
        </span>
      ))}
    </div>
  );
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatAttachmentSize(size: number) {
  if (size === 0) return '0 KB';
  return `${(size / 1024).toFixed(0)} KB`;
}
