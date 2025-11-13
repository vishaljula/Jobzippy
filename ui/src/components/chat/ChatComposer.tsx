import { Loader2, Paperclip, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface ChatComposerAttachment {
  name: string;
  size: number;
  mimeType: string;
}

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  attachment?: ChatComposerAttachment | null;
  onAttachClick?: () => void;
  onRemoveAttachment?: () => void;
  isProcessing?: boolean;
  hint?: string;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Ask Jobzippy anything…',
  attachment,
  onAttachClick,
  onRemoveAttachment,
  isProcessing,
  hint = 'Press Enter to send · Shift+Enter for newline',
}: ChatComposerProps) {
  const isSendDisabled = disabled || (value.trim().length === 0 && !attachment);

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-md backdrop-blur">
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onAttachClick}
          disabled={disabled}
          aria-label="Attach resume"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          className="min-h-[72px] flex-1 resize-none border-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!isSendDisabled) {
                onSubmit();
              }
            }
          }}
          disabled={disabled}
        />
      </div>
      {attachment && (
        <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-xs text-indigo-500">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-indigo-500">
              <Paperclip className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">{attachment.name}</p>
              <p className="text-[11px] text-indigo-400">
                {formatAttachmentSize(attachment.size)} · {attachment.mimeType}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-indigo-500 hover:bg-indigo-100"
            onClick={onRemoveAttachment}
            disabled={disabled}
          >
            Remove
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">{hint}</span>
        <Button
          size="sm"
          className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-purple-600 disabled:opacity-60"
          onClick={onSubmit}
          disabled={isSendDisabled}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function formatAttachmentSize(size: number) {
  if (size === 0) return '0 KB';
  return `${(size / 1024).toFixed(0)} KB`;
}
