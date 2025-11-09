import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Rocket,
  LogOut,
  Settings,
  BarChart3,
  Shield,
  Bell,
  Paperclip,
  Send,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import clsx from 'clsx';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/lib/auth/AuthContext';
import { SignInWithGoogle, GmailConsentMessage } from '@/components/SignInWithGoogle';
import { useOnboarding } from '@/lib/onboarding';
import { OnboardingWizard, ResumeOnboardingCard } from '@/components/onboarding';
import { NewLayoutPreview } from './NewLayoutPreview';
import { LayoutShell } from './LayoutShell';
import { useIntakeAgent } from '@/lib/intake';
import type {
  IntakeAttachment,
  IntakeMessage,
  IntakePreviewSection,
  IntakeStatusStep,
} from '@/lib/types';

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
  const [showPreview, setShowPreview] = useState(false);
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

  if (showPreview) {
    return <NewLayoutPreview onExit={() => setShowPreview(false)} />;
  }

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
          <ChatMessage key={message.id} message={message} />
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
    <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-md backdrop-blur">
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition hover:bg-slate-100"
          onClick={handleAttachClick}
          disabled={isProcessing}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          className="min-h-[72px] flex-1 resize-none border-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
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
      </div>
      {(pendingAttachment || queuedFile) && (
        <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-xs text-indigo-500">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-indigo-500">
              <Paperclip className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">
                {pendingAttachment?.name ?? queuedFile?.name ?? 'pending-attachment'}
              </p>
              <p className="text-[11px] text-indigo-400">
                {formatAttachmentSize(pendingAttachment?.size ?? queuedFile?.size ?? 0)} ·{' '}
                {pendingAttachment?.mimeType ?? queuedFile?.type ?? 'Unknown format'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-indigo-500 hover:bg-indigo-100"
            onClick={handleRemoveAttachment}
            disabled={isProcessing}
          >
            Remove
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Commands · Attach resumes · Slash actions
        </span>
        <Button
          size="sm"
          className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-purple-600"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={isProcessing || (!composerValue.trim() && !queuedFile)}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        hidden
        onChange={handleFileChange}
      />
    </div>
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
            <Button
              variant="outline"
              size="sm"
              className="hidden text-xs md:inline-flex"
              onClick={() => setShowPreview(true)}
            >
              Preview layout
            </Button>
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

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatAttachmentSize(size: number) {
  if (size === 0) return '0 KB';
  return `${(size / 1024).toFixed(0)} KB`;
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
    </div>
  );
}

function ChatMessage({ message }: { message: IntakeMessage }) {
  const isAssistant = message.role !== 'user';
  const alignment = isAssistant ? 'items-start' : 'items-end';
  const bubbleClass = isAssistant
    ? 'bg-white/80 text-slate-700 border border-indigo-100 rounded-3xl rounded-tl-md'
    : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-3xl rounded-tr-md';

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
    <div className={clsx('flex flex-col', alignment, 'space-y-2')}>
      <div
        className={clsx('max-w-[85%] rounded-3xl px-4 py-3 shadow-sm backdrop-blur', bubbleClass)}
      >
        <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
        {message.attachments && <AttachmentChips attachments={message.attachments} />}
      </div>
      <span className="text-[10px] uppercase tracking-wide text-slate-300">
        {formatTimestamp(message.createdAt)}
      </span>
    </div>
  );
}
