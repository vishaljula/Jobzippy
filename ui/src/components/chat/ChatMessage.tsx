import React from 'react';
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
  onApplyPreview?: (
    editedSections?: Array<{ id: string; fields: Array<{ id: string; value: string }> }>
  ) => void;
  onEditPreview?: () => void;
  isPreviewProcessing?: boolean;
  onQuickReply?: (reply: string) => void;
}

export function ChatMessage({
  message,
  onApplyPreview,
  onEditPreview,
  isPreviewProcessing,
  onQuickReply,
}: ChatMessageProps) {
  const isAssistant = message.role !== 'user';
  const alignment = isAssistant ? 'items-start' : 'items-end';
  const bubbleClass = isAssistant
    ? 'bg-white/10 text-slate-200 border border-white/5 rounded-3xl rounded-tl-md'
    : 'bg-[#00f0ff]/10 text-slate-200 border border-[#00f0ff]/20 rounded-3xl rounded-tr-md';

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

  // Check if this assistant message has quick reply options
  const hasQuickReplies = isAssistant && message.quickReplies && message.quickReplies.length > 0;

  return (
    <div className={clsx('flex flex-col', alignment, 'space-y-2')}>
      <div
        className={clsx('max-w-[85%] rounded-3xl px-4 py-3 shadow-sm backdrop-blur', bubbleClass)}
      >
        <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
        {message.attachments && <AttachmentChips attachments={message.attachments} />}
      </div>
      {hasQuickReplies && (
        <div className="flex flex-wrap gap-2 mt-1">
          {message.quickReplies!.map((option) => (
            <Button
              key={option}
              size="sm"
              variant="outline"
              className="rounded-full border-[#00f0ff]/30 text-[#00f0ff] hover:bg-[#00f0ff]/10 bg-transparent text-xs px-3 py-1"
              onClick={() => onQuickReply?.(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      )}
      <Timestamp iso={message.createdAt} />
    </div>
  );
}

function Timestamp({ iso }: { iso: string }) {
  return (
    <span className="text-[10px] uppercase tracking-wide text-slate-500">
      {formatTimestamp(iso)}
    </span>
  );
}

function StatusMessage({ message }: { message: IntakeMessage }) {
  const steps = message.statusSteps ?? [];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex items-center space-x-2">
        <Sparkles className="h-4 w-4 text-[#00f0ff]" />
        <p className="text-sm font-semibold text-white">{message.content}</p>
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
          step.state === 'completed' && 'border-[#00ff9d]/20 bg-[#00ff9d]/10 text-[#00ff9d]',
          step.state === 'in_progress' &&
            'border-[#00f0ff]/20 bg-[#00f0ff]/10 text-[#00f0ff] animate-pulse',
          step.state === 'error' && 'border-[#ff0055]/20 bg-[#ff0055]/10 text-[#ff0055]',
          step.state === 'pending' && 'border-white/10 bg-white/5 text-slate-500'
        )}
      >
        <Icon className={clsx('h-4 w-4', step.state === 'in_progress' && 'animate-spin')} />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-200">{step.label}</p>
        {step.description && <p className="text-xs text-slate-400">{step.description}</p>}
        {step.error && <p className="text-xs text-[#ff0055]">{step.error}</p>}
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
  onApply?: (
    editedSections?: Array<{ id: string; fields: Array<{ id: string; value: string }> }>
  ) => void;
  onEdit?: () => void;
  isApplying?: boolean;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedSections, setEditedSections] = React.useState<IntakePreviewSection[]>([]);

  const sections = message.previewSections ?? [];
  const metadata = message.metadata ?? {};

  React.useEffect(() => {
    setEditedSections(sections);
  }, [sections]);

  const handleEditClick = () => {
    setIsEditing(true);
    onEdit?.();
  };

  const handleSaveClick = () => {
    // Update the message with edited data (for display)
    message.previewSections = editedSections;
    setIsEditing(false);
    // Pass edited sections to save to draft/vault
    onApply?.(
      editedSections.map((section) => ({
        id: section.id,
        fields: section.fields.map((f) => ({ id: f.id, value: f.value })),
      }))
    );
  };

  const handleCancelClick = () => {
    setEditedSections(sections);
    setIsEditing(false);
  };

  const handleFieldChange = (sectionId: string, fieldId: string, newValue: string) => {
    setEditedSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId ? { ...field, value: newValue } : field
              ),
            }
          : section
      )
    );
  };

  const displaySections = isEditing ? editedSections : sections;

  return (
    <div className="w-full space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#00f0ff]">Resume parsed successfully</p>
          <p className="text-xs text-slate-400">
            Confidence {Math.round(((metadata.confidence as number) ?? 0) * 100)}%
          </p>
        </div>
        <span className="rounded-full bg-[#00f0ff]/10 px-3 py-1 text-[11px] font-medium text-[#00f0ff]">
          {(metadata.resumeMetadata as { fileName?: string })?.fileName ?? 'Resume'}
        </span>
      </div>
      <p className="text-sm text-slate-300">{message.content}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {displaySections.map((section) => (
          <PreviewSection
            key={section.id}
            section={section}
            isEditing={isEditing}
            onFieldChange={(fieldId, value) => handleFieldChange(section.id, fieldId, value)}
          />
        ))}
      </div>
      {(onApply || onEdit) && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-transparent text-xs text-slate-400 hover:bg-white/5 hover:text-white"
                onClick={handleCancelClick}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-gradient-to-r from-[#00f0ff] to-[#7000ff] text-xs font-semibold text-white shadow-[0_0_15px_rgba(0,240,255,0.4)] hover:opacity-90 border-0"
                onClick={handleSaveClick}
              >
                Save & continue
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-transparent text-xs text-slate-400 hover:bg-white/5 hover:text-white"
                onClick={handleEditClick}
                disabled={!onEdit}
              >
                Edit
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-gradient-to-r from-[#00f0ff] to-[#7000ff] text-xs font-semibold text-white shadow-[0_0_15px_rgba(0,240,255,0.4)] hover:opacity-90 border-0"
                onClick={() => onApply?.()}
                disabled={!onApply || isApplying}
              >
                {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Looks good'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewSection({
  section,
  isEditing,
  onFieldChange,
}: {
  section: IntakePreviewSection;
  isEditing?: boolean;
  onFieldChange?: (fieldId: string, value: string) => void;
}) {
  const normalizedConfidence = Math.min(1, Math.max(0, section.confidence));
  const confidencePercent = Math.round(normalizedConfidence * 100);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-200">{section.title}</h4>
          <p className="text-xs text-slate-400">Confidence {confidencePercent}%</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {section.fields.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No data extracted for this section</p>
        ) : (
          section.fields.map((field) => (
            <div key={field.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{field.label}</p>
              {isEditing ? (
                <input
                  type="text"
                  value={Array.isArray(field.value) ? field.value.join(', ') : field.value || ''}
                  onChange={(e) => onFieldChange?.(field.id, e.target.value)}
                  className="mt-1 block w-full min-w-0 rounded border border-[#00f0ff]/30 bg-[#0f172a] px-3 py-2 text-sm text-white focus:border-[#00f0ff] focus:outline-none focus:ring-2 focus:ring-[#00f0ff]/20"
                />
              ) : Array.isArray(field.value) ? (
                <p className="mt-1 text-sm text-slate-300">
                  {field.value.length > 0 ? field.value.join(', ') : '(empty)'}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-300">{field.value || '(empty)'}</p>
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
          className="inline-flex items-center space-x-2 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300 shadow-sm ring-1 ring-white/10 backdrop-blur"
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
