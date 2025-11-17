import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Rocket,
  LogOut,
  Settings,
  BarChart3,
  Shield,
  Bell,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/lib/auth/AuthContext';
import { SignInWithGoogle, GmailConsentMessage } from '@/components/SignInWithGoogle';
import { useOnboarding } from '@/lib/onboarding';
import { useJobMatches } from '@/lib/jobs/useJobMatches';
import { OnboardingWizard, ResumeOnboardingCard } from '@/components/onboarding';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { TutorialCarousel } from '@/components/dashboard/TutorialCarousel';
import { LayoutShell } from './LayoutShell';

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
  const onboardingInitRef = useRef(false);
  const [manualWizardOpen, setManualWizardOpen] = useState(false);
  const [navHighlight, setNavHighlight] = useState(false);
  const prevWizardOpenRef = useRef(isWizardOpen);
  const [showTutorial, setShowTutorial] = useState(false);
  // Engine state/status
  const [engineState, setEngineState] = useState<'IDLE' | 'RUNNING'>('IDLE');
  const [engineStatus, setEngineStatus] = useState<string>('Idle');
  const [authNeeded, setAuthNeeded] = useState<{ linkedin?: boolean; indeed?: boolean }>({});
  const [preflightPending, setPreflightPending] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      setTimeout(() => setIsLoading(false), 300);
    }
  }, [authLoading]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsWizardOpen(false);
      onboardingInitRef.current = false;
      setManualWizardOpen(false);
      return;
    }

    if (onboardingLoading) {
      return;
    }

    if (snapshot.status === 'not_started') {
      if (!onboardingInitRef.current) {
        onboardingInitRef.current = true;
        void begin();
      }
      setIsWizardOpen(true);
    } else if (snapshot.status === 'in_progress') {
      setIsWizardOpen(true);
    } else {
      setIsWizardOpen(manualWizardOpen);
      onboardingInitRef.current = false;
      if (!manualWizardOpen) {
        setManualWizardOpen(false);
      }
    }
  }, [begin, isAuthenticated, onboardingLoading, manualWizardOpen, snapshot.status]);

  const handleResumeOnboarding = useCallback(() => {
    if (snapshot.status === 'not_started' && !onboardingInitRef.current) {
      onboardingInitRef.current = true;
      void begin();
    }
    setManualWizardOpen(true);
    setIsWizardOpen(true);
  }, [begin, snapshot.status]);

  const handleCompleteOnboarding = useCallback(async () => {
    await complete();
    setIsWizardOpen(false);
    onboardingInitRef.current = false;
    setManualWizardOpen(false);
  }, [complete]);

  const handleSkipOnboarding = useCallback(async () => {
    await skip();
    setIsWizardOpen(false);
    onboardingInitRef.current = false;
    setManualWizardOpen(false);
  }, [skip]);

  const appLoading = isLoading || authLoading || (isAuthenticated && onboardingLoading);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (isWizardOpen) {
      setNavHighlight(false);
    }
    if (prevWizardOpenRef.current && !isWizardOpen) {
      setNavHighlight(true);
      timeout = setTimeout(() => setNavHighlight(false), 1200);
    }
    prevWizardOpenRef.current = isWizardOpen;
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isWizardOpen]);

  const onboardingNavItems = useMemo(() => {
    if (!isAuthenticated) {
      return [];
    }
    return [
      {
        key: 'onboarding',
        icon: ClipboardCheck,
        label: 'Onboarding',
        onClick: handleResumeOnboarding,
        active: isWizardOpen,
        highlight: navHighlight,
      },
    ];
  }, [handleResumeOnboarding, isAuthenticated, isWizardOpen, navHighlight]);

  const {
    jobs,
    status: jobStatus,
    refresh: refreshJobs,
    error: jobError,
  } = useJobMatches(isAuthenticated ? user : null);

  // Listen for engine state broadcasts
  useEffect(() => {
    const handler = (message: any) => {
      if (message?.type === 'ENGINE_STATE') {
        setEngineState(message.data?.state ?? 'IDLE');
        setEngineStatus(message.data?.status ?? 'Idle');
      } else if (message?.type === 'AUTH_STATE' && message?.data?.platform) {
        const p = message.data.platform as 'LinkedIn' | 'Indeed';
        const loggedIn = Boolean(message.data.loggedIn);
        setAuthNeeded((prev) => ({
          linkedin: p === 'LinkedIn' ? !loggedIn : prev.linkedin,
          indeed: p === 'Indeed' ? !loggedIn : prev.indeed,
        }));
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, []);

  // Poll engine status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'ENGINE_STATE' }, (resp) => {
      if (resp?.state) {
        setEngineState(resp.state);
        if (resp.engineStatus) setEngineStatus(resp.engineStatus);
      }
    });
  }, []);

  const startAgent = useCallback(async () => {
    // Preflight auth check: probe existing tabs, then open search URLs directly
    setPreflightPending(true);
    const required = { linkedin: true, indeed: true };
    const received = { linkedin: false, indeed: false };
    const results = { linkedin: false, indeed: false };
    const openedTabIds: number[] = [];

    // Build search URLs first
    let urls: { linkedin?: string; indeed?: string } = {};
    try {
      const [{ deriveVaultPassword }, { vaultService }, { VAULT_STORES }, { buildSearchUrls }] =
        await Promise.all([
          import('@/lib/vault/utils'),
          import('@/lib/vault/service'),
          import('@/lib/vault/constants'),
          import('@/lib/jobs/search'),
        ]);
      const password = deriveVaultPassword(user);
      const [profile, history] = await Promise.all([
        vaultService.load(VAULT_STORES.profile, password).catch(() => null),
        vaultService.load(VAULT_STORES.history, password).catch(() => null),
      ]);
      urls = buildSearchUrls(profile, history);
    } catch {
      // ignore URL build errors; we'll still check auth
    }

    // Open search URLs directly (they'll trigger auth checks via content scripts)
    if (urls.linkedin) {
      chrome.tabs.create({ url: urls.linkedin, active: false }, (tab) => {
        if (tab?.id) openedTabIds.push(tab.id);
      });
    }
    if (urls.indeed) {
      chrome.tabs.create({ url: urls.indeed, active: false }, (tab) => {
        if (tab?.id) openedTabIds.push(tab.id);
      });
    }

    // Timeout fallback (5 seconds)
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      setPreflightPending(false);
      // If we didn't get responses, assume not logged in
      const need = {
        linkedin: required.linkedin && !results.linkedin,
        indeed: required.indeed && !results.indeed,
      };
      setAuthNeeded(need);
      const allMissing = need.linkedin && need.indeed;
      if (!allMissing) {
        chrome.runtime.sendMessage({ type: 'START_AUTO_APPLY' }, () => {});
      }
    }, 5000);

    const handler = (message: any) => {
      if (message?.type === 'AUTH_STATE' && message?.data?.platform) {
        const p = message.data.platform as 'LinkedIn' | 'Indeed';
        if (p === 'LinkedIn') {
          received.linkedin = true;
          results.linkedin = Boolean(message.data.loggedIn);
        }
        if (p === 'Indeed') {
          received.indeed = true;
          results.indeed = Boolean(message.data.loggedIn);
        }
        if (received.linkedin && received.indeed) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(handler);
          setPreflightPending(false);
          const need = {
            linkedin: required.linkedin && !results.linkedin,
            indeed: required.indeed && !results.indeed,
          };
          setAuthNeeded(need);
          // Allow starting if at least one platform is signed in
          const allMissing = need.linkedin && need.indeed;
          if (!allMissing) {
            chrome.runtime.sendMessage({ type: 'START_AUTO_APPLY' }, () => {});
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);

    // Probe existing tabs first (in case user already has tabs open)
    chrome.runtime.sendMessage({ type: 'AUTH_PROBE_ALL' }, () => {});
  }, [user]);
  const stopAgent = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'STOP_AUTO_APPLY' }, () => {});
  }, []);

  // Tutorial gating: show after onboarding completed AND a profile exists in the vault, unless dismissed
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthenticated || snapshot.status !== 'completed') {
        if (!cancelled) setShowTutorial(false);
        return;
      }
      try {
        const [{ getStorage }, { deriveVaultPassword }, { vaultService }, { VAULT_STORES }] =
          await Promise.all([
            import('@/lib/storage'),
            import('@/lib/vault/utils'),
            import('@/lib/vault/service'),
            import('@/lib/vault/constants'),
          ]);
        const dismissed = await getStorage('tutorialDismissed');
        if (dismissed === true) {
          if (!cancelled) setShowTutorial(false);
          return;
        }
        const password = deriveVaultPassword(user);
        const profile = await vaultService.load(VAULT_STORES.profile, password).catch(() => null);
        if (!cancelled) {
          setShowTutorial(Boolean(profile));
        }
      } catch {
        if (!cancelled) setShowTutorial(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, snapshot.status, user]);

  const handleDismissTutorial = useCallback(async () => {
    try {
      const { setStorage } = await import('@/lib/storage');
      await setStorage('tutorialDismissed', true);
    } finally {
      setShowTutorial(false);
    }
  }, []);

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

  const statusLabel = isAuthenticated ? (
    <span className="flex items-center gap-2 text-slate-600">
      <span
        className={`h-2 w-2 rounded-full ${
          engineState === 'RUNNING' ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      />
      <span className="font-medium">
        Agent: {engineState === 'RUNNING' ? 'Running' : 'Stopped'}
      </span>
      {engineStatus ? <span className="text-slate-400">({engineStatus})</span> : null}
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

  const historyContent = (
    <div className="space-y-6">
      {!isAuthenticated && heroCard}
      {isAuthenticated && (
        <>
          {snapshot.status === 'skipped' && (
            <ResumeOnboardingCard onResume={handleResumeOnboarding} />
          )}
          <DashboardOverview
            user={user}
            onEditProfile={handleResumeOnboarding}
            jobs={jobs}
            jobStatus={jobStatus}
            onRetry={refreshJobs}
            jobError={jobError}
          />
        </>
      )}
    </div>
  );

  const composerContent = (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">
      Jobzippy automatically searches and applies once your onboarding answers are synced. Use the
      Onboarding button in the rail to update your profile via the chat agent at any time.
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
            {isAuthenticated && (authNeeded.linkedin || authNeeded.indeed) && (
              <div className="mr-2 hidden items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 md:flex">
                <span>Sign in:</span>
                {authNeeded.linkedin && (
                  <a
                    href="https://www.linkedin.com/jobs/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    LinkedIn
                  </a>
                )}
                {authNeeded.linkedin && authNeeded.indeed && <span>·</span>}
                {authNeeded.indeed && (
                  <a
                    href="https://www.indeed.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Indeed
                  </a>
                )}
              </div>
            )}
            {isAuthenticated && (
              <>
                {(() => {
                  const missing = [
                    authNeeded.linkedin ? 'LinkedIn' : null,
                    authNeeded.indeed ? 'Indeed' : null,
                  ].filter(Boolean) as string[];
                  const totalNeeded = 2;
                  const okCount = totalNeeded - missing.length;
                  const variant =
                    okCount === 0 ? 'red' : okCount === totalNeeded ? 'green' : 'amber';
                  const borderClass =
                    variant === 'green'
                      ? 'border-emerald-300 hover:border-emerald-400'
                      : variant === 'amber'
                        ? 'border-amber-300 hover:border-amber-400'
                        : 'border-rose-300 hover:border-rose-400';
                  const icon =
                    variant === 'green' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle
                        className={`h-3.5 w-3.5 ${variant === 'amber' ? 'text-amber-600' : 'text-rose-600'}`}
                      />
                    );
                  const title =
                    missing.length === 0
                      ? 'All platforms signed in'
                      : `Not signed in: ${missing.join(', ')}`;
                  return (
                    <div className="flex items-center gap-1.5">
                      <span title={title}>{icon}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`text-xs ${borderClass}`}
                        onClick={startAgent}
                        disabled={engineState === 'RUNNING' || preflightPending}
                      >
                        {preflightPending ? 'Checking…' : 'Start Agent'}
                      </Button>
                    </div>
                  );
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={stopAgent}
                  disabled={engineState === 'IDLE'}
                >
                  Stop Agent
                </Button>
              </>
            )}
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
        secondaryNavItems={onboardingNavItems}
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
        onClose={() => {
          setIsWizardOpen(false);
          setManualWizardOpen(false);
        }}
        onComplete={handleCompleteOnboarding}
        onSkip={handleSkipOnboarding}
        autoCloseOnComplete={!manualWizardOpen}
      />
      <TutorialCarousel open={showTutorial && !isWizardOpen} onClose={handleDismissTutorial} />
      <TutorialCarousel open={false} onClose={() => {}} />
      <TutorialCarousel
        open={showTutorial && !isWizardOpen}
        onClose={handleDismissTutorial}
        onStart={startAgent}
      />
      {/* No bottom-right retry prompt by design; Start button itself conveys status */}
    </>
  );
}

export default App;
