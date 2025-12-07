import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Rocket,
  LogOut,
  Settings,
  BarChart3,
  Shield,
  Bell,
  ClipboardCheck,
  Upload,
} from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthContext';
import { useOnboarding } from '@/lib/onboarding';
import { useJobMatches } from '@/lib/jobs/useJobMatches';
import { OnboardingWizard, ResumeOnboardingCard } from '@/components/onboarding';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { TutorialCarousel } from '@/components/dashboard/TutorialCarousel';
import { SubscriptionStatus, PricingWelcome } from '@/components/subscription';
import { LayoutShell } from './LayoutShell';
import { logger } from '@/lib/logger';

const NAV_ITEMS = [
  { key: 'settings', icon: Settings, label: 'Settings' },
  { key: 'insights', icon: BarChart3, label: 'Insights' },
  {
    key: 'vault',
    icon: Shield,
    label: 'Vault',
    onClick: async () => {
      try {
        const backupSheetId = await chrome.storage.local.get('backupSheetId');
        if (backupSheetId.backupSheetId) {
          window.open(
            `https://docs.google.com/spreadsheets/d/${backupSheetId.backupSheetId}/edit`,
            '_blank'
          );
        } else {
          console.warn('No backup sheet ID found');
        }
      } catch (error) {
        console.error('Failed to open backup sheet:', error);
      }
    },
  },
  {
    key: 'backup',
    icon: Upload,
    label: 'Backup',
    onClick: async () => {
      try {
        const { forceBackup } = await import('@/lib/backup-scheduler');
        const { toast } = await import('sonner');
        const tokens = await chrome.storage.local.get('oauth_tokens');
        if (tokens.oauth_tokens?.access_token) {
          toast.loading('Backing up to Google Sheets...', { id: 'backup' });
          await forceBackup(tokens.oauth_tokens.access_token);
          toast.success('Backup completed!', { id: 'backup' });
        } else {
          toast.error('No OAuth token found', { id: 'backup' });
        }
      } catch (error) {
        const { toast } = await import('sonner');
        toast.error('Backup failed', { id: 'backup' });
        console.error('Manual backup failed:', error);
      }
    },
  },
  { key: 'alerts', icon: Bell, label: 'Alerts' },
] as const;

interface ExtensionMessage {
  type: string;
  data?: {
    state?: 'IDLE' | 'RUNNING' | 'PAUSED';
    status?: string;
    engineStatus?: string;
    platform?: string;
    loggedIn?: boolean;
    [key: string]: unknown;
  };
}

function App() {
  const {
    isAuthenticated,
    isLoading: authLoading,
    isReady,
    needsOnboarding,
    user,
    login,
    logout: handleLogout,
  } = useAuth();

  // Only load onboarding state if user needs onboarding
  const {
    snapshot,
    isLoading: onboardingLoading,
    begin,
    complete,
    skip,
  } = useOnboarding(isAuthenticated && needsOnboarding);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const onboardingInitRef = useRef(false);
  const [manualWizardOpen, setManualWizardOpen] = useState(false);
  const [navHighlight, setNavHighlight] = useState(false);
  const prevWizardOpenRef = useRef(isWizardOpen);
  const [showTutorial, setShowTutorial] = useState(false);
  // Engine state/status
  const [engineState, setEngineState] = useState<'IDLE' | 'RUNNING' | 'PAUSED'>('IDLE');
  const [engineStatus, setEngineStatus] = useState<string>('Idle');
  const [, setAuthNeeded] = useState<{ linkedin?: boolean; indeed?: boolean }>({});
  const [, setPreflightPending] = useState(false);
  const tabToastIdRef = useRef<string | number | null>(null);

  // Subscription state
  const [, setSubscriptionStatus] = useState<{
    status: string;
    tier: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showPricing, setShowPricing] = useState(!isAuthenticated); // Start with pricing if not authenticated
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);

  const countdownIntervalRef = useRef<number | null>(null);
  const prevEngineStateRef = useRef<'IDLE' | 'RUNNING' | 'PAUSED'>('IDLE');

  // Log environment mode once so we can verify dev vs production behavior
  useEffect(() => {
    const envInfo = {
      DEV: import.meta.env.DEV,
      MODE: import.meta.env.MODE,
      NODE_ENV: import.meta.env.NODE_ENV,
    };
    console.log('[Jobzippy] Sidepanel env info:', envInfo);
    try {
      chrome.runtime
        .sendMessage({
          type: 'LOG_MESSAGE',
          data: {
            component: 'SidePanel',
            message: 'Sidepanel env info',
            data: envInfo,
          },
        })
        .catch(() => { });
    } catch {
      // ignore if messaging is not available yet
    }
  }, []);

  // Simple onboarding control - only if user needs onboarding
  useEffect(() => {
    if (!isAuthenticated || !isReady) {
      setIsWizardOpen(false);
      onboardingInitRef.current = false;
      setManualWizardOpen(false);
      return;
    }

    // If user doesn't need onboarding, don't show wizard
    if (!needsOnboarding) {
      setIsWizardOpen(false);
      return;
    }

    // User needs onboarding
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
    }
  }, [
    begin,
    isAuthenticated,
    isReady,
    needsOnboarding,
    onboardingLoading,
    manualWizardOpen,
    snapshot.status,
  ]);

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

  // App is loading until auth is ready (which includes restore check)
  const appLoading = authLoading || !isReady;

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
    jobs: _jobs,
    status: _jobStatus,
    refresh: _refreshJobs,
    error: _jobError,
  } = useJobMatches(isAuthenticated ? user : null);

  // Listen for engine state broadcasts
  useEffect(() => {
    const handler = (message: ExtensionMessage) => {
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
      } else if (message?.type === 'TAB_ACTIVATED' || message?.type === 'SHOW_TAB_TOAST') {
        // Show toast when user switches to search tab
        const platform = message.data?.platform as 'LinkedIn' | 'Indeed';
        console.log('[Jobzippy] TAB_ACTIVATED received:', { platform, engineState });
        if (platform && engineState === 'RUNNING') {
          // Dismiss previous toast if it exists to prevent accumulation
          if (tabToastIdRef.current !== null) {
            toast.dismiss(tabToastIdRef.current);
          }
          const toastId = toast.info(
            `Jobzippy is working on ${platform}. Your actions will pause automation and it will auto-resume.`,
            {
              duration: Infinity,
              closeButton: true,
              className: 'rounded-xl border-slate-200 shadow-lg',
            }
          );
          tabToastIdRef.current = toastId;
          console.log('[Jobzippy] Toast shown for', platform, 'toastId:', toastId);
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [engineState]);

  // Unified toast management - handles all toast states in one place
  useEffect(() => {
    // Clear existing countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    const wasPaused = prevEngineStateRef.current === 'PAUSED';

    const isNowRunning = engineState === 'RUNNING';
    const isNowPaused = engineState === 'PAUSED';
    const isNowIdle = engineState === 'IDLE';
    const justResumed = wasPaused && isNowRunning;

    // Dismiss all toasts when engine stops
    if (isNowIdle) {
      if (tabToastIdRef.current !== null) {
        toast.dismiss(tabToastIdRef.current);
        tabToastIdRef.current = null;
      }
      prevEngineStateRef.current = engineState;
      return;
    }

    // Handle pause state with countdown
    if (isNowPaused) {
      // Dismiss any existing toast first
      if (tabToastIdRef.current !== null) {
        toast.dismiss(tabToastIdRef.current);
      }

      // Show initial countdown toast
      const toastId = toast.loading('Paused. Resuming in 8 seconds...', {
        duration: Infinity,
        closeButton: true,
        className: 'rounded-xl border-slate-200 shadow-lg',
      });
      tabToastIdRef.current = toastId;

      // Start countdown interval
      let countdown = 8;
      countdownIntervalRef.current = window.setInterval(() => {
        countdown--;
        if (countdown > 0) {
          toast.loading(`Paused. Resuming in ${countdown} seconds...`, {
            id: toastId,
            duration: Infinity,
            closeButton: true,
            className: 'rounded-xl border-slate-200 shadow-lg',
          });
        } else {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }
      }, 1000);
    }

    // Handle resume from pause
    if (justResumed) {
      // Reuse the same toast ID to replace the countdown toast
      if (tabToastIdRef.current !== null) {
        toast.success('Jobzippy resumed', {
          id: tabToastIdRef.current, // Reuse existing ID to replace countdown toast
          duration: 2000,
          closeButton: true,
          className: 'rounded-xl border-slate-200 shadow-lg',
        });
        const currentToastId = tabToastIdRef.current;
        setTimeout(() => {
          toast.dismiss(currentToastId);
          tabToastIdRef.current = null;
        }, 2000);
      }
    }

    // Update previous state
    prevEngineStateRef.current = engineState;

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [engineState]);

  // After sign-in: Check subscription and open Stripe if needed
  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Only show pricing if we're sure they're not authenticated
      // Don't show pricing during the brief moment when isAuthenticated is true but user isn't loaded yet
      if (!isAuthenticated) {
        setShowPricing(true);
      }
      return;
    }

    const checkSubscription = async () => {
      try {
        const { getFirestoreDb } = await import('@/lib/firebase/client');
        const { doc, getDoc } = await import('firebase/firestore');

        const firestore = getFirestoreDb();
        const userDocRef = doc(firestore, `users/${user.sub}`);
        const userDoc = await getDoc(userDocRef);
        const sub = userDoc.data()?.subscription;

        logger.log('[Subscription] Checked status for user:', user.sub);
        logger.log('[Subscription] Subscription object:', sub);
        setSubscriptionStatus(sub);
        setSubscriptionChecked(true);

        if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) {
          // No subscription - open Stripe checkout
          logger.log('[Subscription] No subscription, opening Stripe...');
          setShowPricing(false);
          setCheckoutLoading(true);

          try {
            const { getFirebaseApp } = await import('@/lib/firebase/client');
            const { getFunctions, httpsCallable } = await import('firebase/functions');

            const firebaseApp = getFirebaseApp();
            const functions = getFunctions(firebaseApp);
            const createCheckout = httpsCallable(functions, 'createCheckoutSession');

            toast.info('Opening payment page...');

            const result = await createCheckout({
              successUrl: 'https://jobzippy.ai/success?session_id={CHECKOUT_SESSION_ID}',
              cancelUrl: 'https://jobzippy.ai/welcome',
            });

            const { url } = result.data as { url: string; sessionId: string };
            logger.log('[Subscription] Opening Stripe checkout:', url);

            chrome.tabs.create({ url });
            toast.info('Complete payment in the opened tab');
          } catch (error) {
            logger.error('[Subscription] Failed to create checkout:', error);
            toast.error('Failed to open payment page');
            setShowPricing(true); // Go back to pricing on error
          } finally {
            setCheckoutLoading(false);
          }
        } else {
          // Has subscription - show dashboard
          logger.log('[Subscription] Active subscription, showing dashboard');
          setShowPricing(false);
        }
      } catch (error) {
        logger.error('[Subscription] Error checking status:', error);

        // If error checking subscription (e.g., stale token, permissions),
        // still mark as checked and show dashboard - let user try from there
        // Don't send them back to pricing page!
        setSubscriptionChecked(true);
        setShowPricing(false);

        toast.error('Could not verify subscription status. Please try again from dashboard.');
      }
    };

    checkSubscription();
  }, [isAuthenticated, user]);

  // Listen for subscription updates from success page
  useEffect(() => {
    const handler = async (message: { type: string; sessionId?: string }) => {
      if (message.type === 'SUBSCRIPTION_ACTIVE') {
        logger.log('[Subscription] Received activation message from success page');
        // Refresh subscription status with retry (webhook might be slow)
        if (user) {
          const maxRetries = 5;
          let retryCount = 0;

          const checkWithRetry = async () => {
            try {
              const { getFirestoreDb } = await import('@/lib/firebase/client');
              const { doc, getDoc } = await import('firebase/firestore');

              const firestore = getFirestoreDb();
              const userDocRef = doc(firestore, `users/${user.sub}`);
              const userDoc = await getDoc(userDocRef);
              const sub = userDoc.data()?.subscription;

              logger.log('[Subscription] Retry', retryCount + 1, '- Sub status:', sub?.status);

              setSubscriptionStatus(sub);
              if (sub?.status === 'active' || sub?.status === 'trialing') {
                setShowPricing(false);
                toast.success('Trial started! Welcome to JobZippy 🎉');
                return true; // Success
              }

              return false; // Not ready yet
            } catch (error) {
              logger.error('[Subscription] Error refreshing status:', error);
              return false;
            }
          };

          // Try immediately
          const success = await checkWithRetry();

          // If not successful, retry every 2 seconds up to 5 times
          if (!success) {
            const interval = setInterval(async () => {
              retryCount++;
              console.log(
                '[Subscription] Webhook may be slow, retrying...',
                retryCount,
                '/',
                maxRetries
              );

              const success = await checkWithRetry();
              if (success || retryCount >= maxRetries) {
                clearInterval(interval);
                if (!success) {
                  console.warn(
                    '[Subscription] Max retries reached, subscription may not be active yet'
                  );
                  toast.info("Please refresh if your subscription doesn't activate");
                }
              }
            }, 2000);
          }
        }
      }
    };

    chrome.runtime.onMessageExternal.addListener(handler);
    return () => chrome.runtime.onMessageExternal.removeListener(handler);
  }, [user]);

  // Poll engine status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'ENGINE_STATE' }, (resp) => {
      if (resp?.state) {
        setEngineState(resp.state);
        if (resp.engineStatus) setEngineStatus(resp.engineStatus);
      }
    });
  }, []);

  const handleStartTrial = useCallback(() => {
    logger.log('[Subscription] Closing pricing, showing main app with sign-in...');
    setShowPricing(false);
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

      // In dev mode, assume success if we timed out (bypass missing mock server/slow load)
      // Check both DEV flag and MODE string for robustness
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

      // Log the timeout event
      chrome.runtime
        .sendMessage({
          type: 'LOG_MESSAGE',
          data: {
            component: 'SidePanel',
            message: `Auth check timed out. Dev mode: ${isDev}`,
            data: {
              env: {
                DEV: import.meta.env.DEV,
                MODE: import.meta.env.MODE,
              },
            },
          },
        })
        .catch(() => { });

      if (isDev) {
        console.log('[Jobzippy] Dev mode timeout: Forcing auth success');
        results.linkedin = true;
        results.indeed = true;
        // Update received tracking so start logic proceeds
        received.linkedin = true;
        received.indeed = true;
      }

      // If we didn't get responses, assume not logged in
      const need = {
        linkedin: required.linkedin && !results.linkedin,
        indeed: required.indeed && !results.indeed,
      };
      setAuthNeeded(need);
      const allMissing = need.linkedin && need.indeed;
      if (!allMissing) {
        chrome.runtime.sendMessage(
          { type: 'START_AGENT', data: { maxApplications: 15 } },
          (resp) => {
            if (chrome.runtime.lastError) {
              console.error(
                '[Jobzippy] ERROR sending START_AGENT from sidepanel:',
                chrome.runtime.lastError.message
              );
            } else {
              console.log('[Jobzippy] Sidepanel START_AGENT response:', resp);
            }
          }
        );
      }
    }, 5000);

    const handler = (message: ExtensionMessage) => {
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
            chrome.runtime.sendMessage(
              { type: 'START_AGENT', data: { maxApplications: 15 } },
              () => { }
            );
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);

    // Probe existing tabs first (in case user already has tabs open)
    chrome.runtime.sendMessage({ type: 'AUTH_PROBE_ALL' }, () => { });
  }, [user]);
  const stopAgent = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'STOP_AUTO_APPLY' }, () => { });
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#020617]">
        <div className="text-center">
          <div className="relative mx-auto mb-6 h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#00f0ff]/25 via-[#7000ff]/20 to-[#00ff9d]/25 blur-[10px] animate-pulse-slow" />
            <div className="animate-spin rounded-full h-16 w-16 bg-gradient-to-r from-[#00f0ff]/60 via-[#7000ff]/60 to-[#00ff9d]/60 p-[3px] shadow-[0_0_25px_rgba(0,240,255,0.25)]">
              <div className="h-full w-full rounded-full bg-[#020617]" />
            </div>
          </div>
          <p className="text-[#00ff9d] font-semibold text-lg tracking-wide">Loading Jobzippy...</p>
        </div>
      </div>
    );
  }

  // Wait for subscription check to complete for authenticated users
  if (isAuthenticated && !subscriptionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#020617]">
        <div className="text-center">
          <div className="relative mx-auto mb-6 h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#00f0ff]/25 via-[#7000ff]/20 to-[#00ff9d]/25 blur-[10px] animate-pulse-slow" />
            <div className="animate-spin rounded-full h-16 w-16 bg-gradient-to-r from-[#00f0ff]/60 via-[#7000ff]/60 to-[#00ff9d]/60 p-[3px] shadow-[0_0_25px_rgba(0,240,255,0.25)]">
              <div className="h-full w-full rounded-full bg-[#020617]" />
            </div>
          </div>
          <p className="text-[#00ff9d] font-semibold text-lg tracking-wide">
            Checking subscription...
          </p>
        </div>
      </div>
    );
  }

  // Show pricing page if user needs to subscribe
  if (showPricing) {
    return (
      <>
        <Toaster position="top-right" />
        <PricingWelcome onStartTrial={handleStartTrial} loading={checkoutLoading} />
      </>
    );
  }

  const historyContent = (
    <div className="space-y-6">
      {snapshot.status === 'skipped' && <ResumeOnboardingCard onResume={handleResumeOnboarding} />}

      {/* Subscription Status - Shows trial/active status */}
      <SubscriptionStatus />

      <DashboardOverview
        user={user}
        onEditProfile={handleResumeOnboarding}
        engineState={engineState}
        engineStatus={engineStatus}
        onStartAgent={startAgent}
        onStopAgent={stopAgent}
      />
    </div>
  );

  // Pricing mock removed; focusing on main dashboard only

  const composerContent = (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">
      Jobzippy automatically searches and applies once your onboarding answers are synced. Use the
      Onboarding button in the rail to update your profile via the chat agent at any time.
    </div>
  );

  // Show sign-in page without side menu if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#020617] p-6">
        <Toaster position="top-right" />
        <div className="w-full max-w-md text-center space-y-8">
          {/* Logo with neon glow */}
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#00ff9d] opacity-50 animate-pulse-slow" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#00f0ff] to-[#00ff9d]">
              <Rocket className="h-10 w-10 text-black" strokeWidth={2.5} />
            </div>
          </div>

          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">Welcome to Jobzippy</h1>
            <p className="text-lg text-slate-400">
              Your personal AI assistant for job applications
            </p>
          </div>

          {/* Sign-in button styled like pricing button */}
          <button
            onClick={async () => {
              try {
                setSignInLoading(true);
                await login(true); // includeGmailScope
                toast.success('Successfully signed in!');
              } catch (error) {
                logger.error('[SignIn] Error:', error);
                toast.error('Failed to sign in. Please try again.');
              } finally {
                setSignInLoading(false);
              }
            }}
            disabled={signInLoading}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#7000ff] hover:opacity-90 transition-opacity font-medium text-white shadow-lg shadow-[#00f0ff]/20 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signInLoading ? (
              <>Signing in...</>
            ) : (
              <>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z"
                    fill="currentColor"
                    fillOpacity="0.9"
                  />
                  <path
                    d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
                    fill="currentColor"
                    fillOpacity="0.9"
                  />
                  <path
                    d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
                    fill="currentColor"
                    fillOpacity="0.9"
                  />
                  <path
                    d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
                    fill="currentColor"
                    fillOpacity="0.9"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {/* Trust signals - minimal */}
          <div className="pt-8 space-y-3">
            <p className="text-slate-500 text-sm">Trusted by job seekers worldwide</p>
            <div className="flex justify-center gap-8 text-slate-400 text-xs">
              <div>
                <div className="text-xl font-bold text-[#00f0ff]">10K+</div>
                <div className="text-slate-500">Applications</div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#00ff9d]">500+</div>
                <div className="text-slate-500">Hired</div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#7000ff]">4.8/5</div>
                <div className="text-slate-500">Rating</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <LayoutShell
        title="Jobzippy"
        subtitle="Your agentic AI for job search"
        statusLabel={null}
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
      <TutorialCarousel open={false} onClose={() => { }} />
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
