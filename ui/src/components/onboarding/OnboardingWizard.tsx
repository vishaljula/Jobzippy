import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { ChatComposer, ChatMessage } from '@/components/chat';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth/AuthContext';
import { useOnboardingChat } from '@/lib/onboarding';

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  onSkip: () => void;
  autoCloseOnComplete?: boolean;
}

const TRANSITION_MS = 250;

export function OnboardingWizard({
  open,
  onClose,
  onComplete,
  onSkip,
  autoCloseOnComplete = true,
}: OnboardingWizardProps) {
  const { user } = useAuth();
  const {
    isLoading,
    isThinking,
    messages,
    progress,
    pendingFieldPath,
    sendMessage,
    startOver,
    hasResume,
    confirmPreview,
  } = useOnboardingChat({ enabled: open && Boolean(user), user });

  const [composerValue, setComposerValue] = useState('');
  const [queuedFile, setQueuedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const completionTriggeredRef = useRef(false);
  const [completionVisible, setCompletionVisible] = useState(false);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [messages]
  );

  useEffect(() => {
    if (!open) {
      completionTriggeredRef.current = false;
      setComposerValue('');
      setQueuedFile(null);
      setCompletionVisible(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open]);

  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }
    setIsVisible(false);
    const timeout = setTimeout(() => {
      setIsMounted(false);
    }, TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open || completionTriggeredRef.current || progress.status !== 'ready') return;
    completionTriggeredRef.current = true;
    if (autoCloseOnComplete) {
      onComplete();
      onClose();
      return;
    }
    setCompletionVisible(true);
  }, [autoCloseOnComplete, onClose, onComplete, open, progress.status]);

  useEffect(() => {
    if (!open) return;
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages, open, isThinking]);

  const handleSubmit = useCallback(async () => {
    if (isThinking || (!composerValue.trim() && !queuedFile)) return;
    const payloadText = composerValue;
    const payloadFile = queuedFile;
    setComposerValue('');
    try {
      await sendMessage({
        text: payloadText,
        attachments: payloadFile ? [payloadFile] : [],
      });
      if (payloadFile) {
        setQueuedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch {
      setComposerValue(payloadText);
      if (payloadFile) {
        setQueuedFile(payloadFile);
      }
    }
  }, [composerValue, isThinking, queuedFile, sendMessage]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setQueuedFile(file);
  };

  const handleRemoveAttachment = () => {
    setQueuedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleApplyPreview = useCallback(
    async (
      editedSections?: Array<{ id: string; fields: Array<{ id: string; value: string }> }>
    ) => {
      toast.success('Profile saved');
      // Confirm the preview and trigger the next question
      await confirmPreview(editedSections);
    },
    [confirmPreview]
  );

  const handleEditPreview = useCallback(() => {
    // Edit mode is handled within ChatMessage component
  }, []);

  const handleQuickReply = useCallback(
    async (reply: string) => {
      if (isThinking) return;
      await sendMessage({ text: reply, attachments: [] });
    },
    [isThinking, sendMessage]
  );

  if (!isMounted) return null;

  const attachmentPreview = queuedFile
    ? {
        name: queuedFile.name,
        size: queuedFile.size,
        mimeType: queuedFile.type || 'application/octet-stream',
      }
    : null;

  const statusLabel =
    progress.status === 'ready'
      ? 'All required fields captured'
      : progress.status === 'collecting'
        ? 'Collecting profile details'
        : 'Waiting for resume';

  const pendingPrompt = pendingFieldPath
    ? pendingFieldPath.split('.').slice(-1)[0]?.replace(/_/g, ' ')
    : null;
  const showCompletionCard = completionVisible && !autoCloseOnComplete;

  const handleFinish = () => {
    setCompletionVisible(false);
    onComplete();
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center px-4 py-6 transition-all duration-300 ${
        isVisible ? 'bg-[#020617]/80 backdrop-blur-sm opacity-100' : 'bg-black/0 opacity-0'
      }`}
    >
      <div
        className={`relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl transition-all duration-300 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <header className="flex items-center justify-between border-b border-white/5 bg-[#0f172a]/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-auto drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]" />
            <div>
              <h2 className="text-base font-semibold text-white">Finish setting up Jobzippy</h2>
              <p className="text-xs text-slate-400">{statusLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-slate-500">Progress</p>
              <p className="text-sm font-semibold text-white">{progress.percentage}%</p>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-slate-400 hover:text-white hover:bg-white/5"
              aria-label="Close onboarding wizard"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid h-[520px] grid-rows-[1fr_auto] gap-0 bg-[#0f172a]">
          <div className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00f0ff]/20 to-transparent" />
            <div className="h-full overflow-y-auto px-6 py-5 space-y-4">
              {isLoading ? (
                <div className="flex h-48 flex-col items-center justify-center text-slate-400">
                  <Loader2 className="mb-3 h-5 w-5 animate-spin text-[#00f0ff]" />
                  <p className="text-xs">Booting up your onboarding agent…</p>
                </div>
              ) : (
                <>
                  {!hasResume && (
                    <div className="rounded-2xl border border-dashed border-[#00f0ff]/30 bg-[#00f0ff]/5 px-4 py-3 text-sm text-[#00f0ff]">
                      Drop your resume or paste it in below—I’ll parse it and only ask about the
                      gaps.
                    </div>
                  )}

                  {pendingPrompt && !showCompletionCard && (
                    <div className="rounded-xl border border-[#7000ff]/30 bg-[#7000ff]/10 px-3 py-2 text-xs text-[#a78bfa]">
                      <span className="font-medium text-[#d8b4fe]">Up next:</span> {pendingPrompt}
                    </div>
                  )}

                  {showCompletionCard && (
                    <div className="rounded-2xl border border-[#00ff9d]/20 bg-[#00ff9d]/10 p-4 text-sm text-[#00ff9d] shadow-[0_0_20px_rgba(0,255,157,0.1)]">
                      <h3 className="text-base font-semibold text-white">All set!</h3>
                      <p className="mt-1 text-[#00ff9d]/80">
                        Your answers are synced. Head to the dashboard to see your stats, or keep
                        chatting if you want to refine anything.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-full bg-gradient-to-r from-[#00ff9d] to-[#00f0ff] text-[#020617] font-semibold hover:opacity-90 shadow-[0_0_15px_rgba(0,255,157,0.4)] border-0"
                          onClick={handleFinish}
                        >
                          View dashboard
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#00ff9d]/30 text-[#00ff9d] hover:bg-[#00ff9d]/10 bg-transparent"
                          onClick={() => {
                            setCompletionVisible(false);
                            completionTriggeredRef.current = false;
                            void startOver();
                          }}
                        >
                          Review answers
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ... existing code ... */}

                  {sortedMessages.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-400">
                      Say hello or upload your resume to get started. I’ll keep track of everything
                      we collect together.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {sortedMessages.map((message, index) => (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          onApplyPreview={
                            message.kind === 'preview' ? handleApplyPreview : undefined
                          }
                          onEditPreview={message.kind === 'preview' ? handleEditPreview : undefined}
                          onQuickReply={
                            // Only show quick reply handler for the last assistant message
                            message.role === 'assistant' &&
                            index === sortedMessages.length - 1 &&
                            message.quickReplies?.length
                              ? handleQuickReply
                              : undefined
                          }
                        />
                      ))}
                      {isThinking && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Loader2 className="h-3 w-3 animate-spin text-[#00f0ff]" />
                          Thinking through your last answer…
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border-t border-white/5 bg-[#0f172a] px-5 py-4">
            <div className="flex items-center justify-between pb-3 text-[11px] uppercase tracking-wide text-slate-500">
              <span>
                Fields complete: {progress.completed}/{progress.total}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onSkip();
                    onClose();
                  }}
                  className="text-slate-500 transition hover:text-white"
                >
                  Skip for now
                </button>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full bg-gradient-to-r from-[#00f0ff] to-[#00ff9d] transition-all shadow-[0_0_10px_rgba(0,240,255,0.5)]"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    startOver();
                  }}
                  className="text-slate-500 transition hover:text-white"
                >
                  Start over
                </button>
              </div>
            </div>
            <div className="relative">
              <ChatComposer
                value={composerValue}
                onChange={setComposerValue}
                onSubmit={() => {
                  void handleSubmit();
                }}
                disabled={isLoading || showCompletionCard}
                placeholder="Share the next detail, or drop your resume PDF/DOCX…"
                attachment={attachmentPreview}
                onAttachClick={() => fileInputRef.current?.click()}
                onRemoveAttachment={handleRemoveAttachment}
                isProcessing={isThinking}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              hidden
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
