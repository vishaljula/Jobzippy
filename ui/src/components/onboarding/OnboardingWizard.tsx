import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { ChatComposer, ChatMessage } from '@/components/chat';
import { Button } from '@/components/ui/button';
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

  const handleApplyPreview = useCallback(() => {
    toast.success('Resume data applied to profile');
  }, []);

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
        isVisible ? 'bg-black/30 backdrop-blur-sm opacity-100' : 'bg-black/0 opacity-0'
      }`}
    >
      <div
        className={`relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-purple-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Finish setting up Jobzippy</h2>
              <p className="text-xs text-slate-500">{statusLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-slate-500">Progress</p>
              <p className="text-sm font-semibold text-slate-700">{progress.percentage}%</p>
            </div>
            <div className="h-10 w-px bg-slate-200" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-slate-400"
              aria-label="Close onboarding wizard"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid h-[520px] grid-rows-[1fr_auto] gap-0 bg-white">
          <div className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-100 to-transparent" />
            <div className="h-full overflow-y-auto px-6 py-5 space-y-4">
              {isLoading ? (
                <div className="flex h-48 flex-col items-center justify-center text-slate-400">
                  <Loader2 className="mb-3 h-5 w-5 animate-spin" />
                  <p className="text-xs">Booting up your onboarding agent…</p>
                </div>
              ) : (
                <>
                  {!hasResume && (
                    <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-600">
                      Drop your resume or paste it in below—I’ll parse it and only ask about the
                      gaps.
                    </div>
                  )}

                  {pendingPrompt && !showCompletionCard && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      <span className="font-medium text-amber-900">Up next:</span> {pendingPrompt}
                    </div>
                  )}

                  {showCompletionCard && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700 shadow-sm">
                      <h3 className="text-base font-semibold text-emerald-800">All set!</h3>
                      <p className="mt-1 text-emerald-700">
                        Your answers are synced. Head to the dashboard to see your stats, or keep
                        chatting if you want to refine anything.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
                          onClick={handleFinish}
                        >
                          View dashboard
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
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
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      Say hello or upload your resume to get started. I’ll keep track of everything
                      we collect together.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {sortedMessages.map((message) => (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          onApplyPreview={
                            message.kind === 'preview' ? handleApplyPreview : undefined
                          }
                        />
                      ))}
                      {isThinking && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
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

          <div className="border-t border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between pb-3 text-[11px] uppercase tracking-wide text-slate-400">
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
                  className="text-slate-400 transition hover:text-slate-600"
                >
                  Skip for now
                </button>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                  <span
                    className="block h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    startOver();
                  }}
                  className="text-slate-400 transition hover:text-slate-600"
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
