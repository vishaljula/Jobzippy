import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Rocket, LogOut, Settings, BarChart3, Shield, Bell, Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/lib/auth/AuthContext';
import { SignInWithGoogle, GmailConsentMessage } from '@/components/SignInWithGoogle';
import { useOnboarding } from '@/lib/onboarding';
import { OnboardingWizard, ResumeOnboardingCard } from '@/components/onboarding';
import { LayoutShell } from './LayoutShell';
import { useIntakeAgent } from '@/lib/intake';
import { ChatComposer, ChatMessage } from '@/components/chat';

const NAV_ITEMS = [
  { key: 'settings', icon: Settings, label: 'Settings' },
  { key: 'insights', icon: BarChart3, label: 'Insights' },
  { key: 'vault', icon: Shield, label: 'Vault' },
  { key: 'alerts', icon: Bell, label: 'Alerts' },
] as const;

function App() {
  const { isAuthenticated, isLoading: authLoading, user, logout: handleLogout } = useAuth();
  const {
    snapshot,
    isLoading: onboardingLoading,
    begin,
    complete,
    skip,
  } = useOnboarding(isAuthenticated);
  const [isLoading, setIsLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [composerValue, setComposerValue] = useState('');
  const [queuedFile, setQueuedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authLoading) {
      setTimeout(() => setIsLoading(false), 300);
    }
  }, [authLoading]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsWizardOpen(false);
      return;
    }

    if (onboardingLoading) {
      return;
    }

    if (snapshot.status === 'in_progress') {
      setIsWizardOpen(true);
    } else {
      setIsWizardOpen(false);
    }
  }, [isAuthenticated, onboardingLoading, snapshot.status]);

  const handleResumeOnboarding = useCallback(() => {
    if (snapshot.status === 'completed') {
      setIsWizardOpen(false);
      return;
    }
    if (snapshot.status === 'not_started') {
      void begin();
    }
    setIsWizardOpen(true);
  }, [begin, snapshot.status]);

  const handleCompleteOnboarding = useCallback(async () => {
    await complete();
    setIsWizardOpen(false);
  }, [complete]);

  const handleSkipOnboarding = useCallback(async () => {
    await skip();
    setIsWizardOpen(false);
  }, [skip]);

  const appLoading = isLoading || authLoading || (isAuthenticated && onboardingLoading);

  const {
    isLoading: chatLoading,
    isProcessing,
    messages,
    pendingAttachment,
    setPendingAttachment,
    sendMessage,
    applyDraft,
    requestManualEdit,
    activeDraftMessageId,
  } = useIntakeAgent({ enabled: isAuthenticated, user });

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [messages]
  );

  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({
      behavior: sortedMessages.length > 1 ? 'smooth' : 'auto',
    });
  }, [sortedMessages.length, chatLoading]);

  const composerAttachment = useMemo(() => {
    if (pendingAttachment) {
      return {
        name: pendingAttachment.name,
        size: pendingAttachment.size,
        mimeType: pendingAttachment.mimeType,
      };
    }
    if (queuedFile) {
      return {
        name: queuedFile.name,
        size: queuedFile.size,
        mimeType: queuedFile.type || 'application/octet-stream',
      };
    }
    return null;
  }, [pendingAttachment, queuedFile]);

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
    if (!isAuthenticated || isProcessing) return;
    if (!composerValue.trim() && !queuedFile) return;

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

  if (appLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600"></div>
          <p className="text-gray-600 font-medium">Loading Jobzippy...</p>
        </div>
      </div>
    );
  }

  const statusLabel =
    isAuthenticated && user ? (
      <span className="flex items-center gap-2">
        <span className="hidden md:inline text-slate-400">Signed in as</span>
        <span className="font-medium text-slate-600">{user.given_name}</span>
      </span>
    ) : (
      <span className="flex items-center gap-2 text-slate-500">
        <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
        Not signed in
      </span>
    );

  const heroCard = (
    <div className="space-y-4 rounded-xl bg-white p-8 shadow-lg animate-slide-up">
      <div className="relative mx-auto h-20 w-20">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 opacity-20 blur-xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-secondary-500">
          <Rocket className="h-10 w-10 text-white" strokeWidth={2.5} />
        </div>
      </div>
      <h2 className="text-center text-2xl font-bold text-gray-900">Welcome to Jobzippy!</h2>
      <p className="text-center text-gray-600">
        Your personal agentic AI assistant who manages your job applications
      </p>
      <div className="space-y-3">
        <SignInWithGoogle />
        <GmailConsentMessage />
      </div>
    </div>
  );

  const conversationBody = (() => {
    if (!isAuthenticated) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-6 text-sm text-slate-500">
          Sign in to start chatting with Jobzippy. Upload your resume and the intake agent will
          parse it in real time.
        </div>
      );
    }

    if (chatLoading) {
      return (
        <div className="flex h-48 items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }

    if (sortedMessages.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/70 p-5 text-sm text-indigo-600">
          Whenever you&apos;re ready, attach a PDF or DOCX resume using the paperclip icon below.
          You can also start the conversation by telling Jobzippy what you need help with.
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {sortedMessages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onApplyPreview={
              activeDraftMessageId === message.id
                ? () => {
                    void applyDraft();
                  }
                : undefined
            }
            onEditPreview={activeDraftMessageId === message.id ? requestManualEdit : undefined}
            isPreviewProcessing={isProcessing && activeDraftMessageId === message.id}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    );
  })();

  const historyContent = (
    <div className="space-y-6">
      {!isAuthenticated && heroCard}
      {isAuthenticated && snapshot.status === 'skipped' && (
        <ResumeOnboardingCard onResume={handleResumeOnboarding} />
      )}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Intake Agent</h3>
            <p className="text-xs text-slate-400">
              Chat-first intake · Resume parsing · Vault sync
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <span>{isProcessing ? 'Processing…' : 'Live'}</span>
            {isAuthenticated && snapshot.status !== 'completed' && (
              <Button
                size="sm"
                className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-purple-600"
                onClick={handleResumeOnboarding}
              >
                Complete setup
              </Button>
            )}
          </div>
        </div>
        {conversationBody}
      </section>
    </div>
  );

  const composerContent = isAuthenticated ? (
    <>
      <ChatComposer
        value={composerValue}
        onChange={setComposerValue}
        onSubmit={() => {
          void handleSubmit();
        }}
        disabled={isProcessing}
        placeholder="Ask Jobzippy anything or paste a job note..."
        attachment={composerAttachment}
        onAttachClick={handleAttachClick}
        onRemoveAttachment={handleRemoveAttachment}
        isProcessing={isProcessing}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        hidden
        onChange={handleFileChange}
      />
    </>
  ) : (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-4 text-center text-sm text-slate-500 shadow-sm">
      Sign in to unlock the chat composer and let Jobzippy parse your resume in real time.
    </div>
  );

  return (
    <>
      <Toaster position="top-right" />
      <LayoutShell
        title="Jobzippy"
        subtitle="Your agentic AI for job search"
        statusLabel={statusLabel}
        headerActions={
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs md:hidden"
                onClick={handleLogout}
              >
                Logout
              </Button>
            )}
          </div>
        }
        history={historyContent}
        composer={composerContent}
        navItems={NAV_ITEMS}
        avatar={
          user
            ? {
                src: user.picture,
                alt: user.name,
              }
            : null
        }
        railFooter={
          <button
            type="button"
            onClick={isAuthenticated ? handleLogout : undefined}
            disabled={!isAuthenticated}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 shadow-sm transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LogOut className="h-4 w-4" />
          </button>
        }
      />
      <OnboardingWizard
        open={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleCompleteOnboarding}
        onSkip={handleSkipOnboarding}
      />
    </>
  );
}

export default App;
