import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Rocket, LogOut, Shield, ClipboardCheck, Upload, CreditCard } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthContext';
import { useOnboarding } from '@/lib/onboarding';
import { useJobMatches } from '@/lib/jobs/useJobMatches';
import { OnboardingWizard, ResumeOnboardingCard } from '@/components/onboarding';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { TutorialCarousel } from '@/components/dashboard/TutorialCarousel';
import { PricingWelcome } from '@/components/subscription';
import { LayoutShell } from './LayoutShell';
import { logger } from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const NAV_ITEMS = [
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
        const { getValidAccessToken } = await import('@/lib/oauth/google-auth');
        const { toast } = await import('sonner');
        let accessToken: string;
        try {
          accessToken = await getValidAccessToken();
        } catch {
          toast.error('Please sign in to back up', { id: 'backup' });
          return;
        }
        toast.loading('Backing up to Google Sheets...', { id: 'backup' });
        await forceBackup(accessToken);
        toast.success('Backup completed!', { id: 'backup' });
      } catch (error) {
        const { toast } = await import('sonner');
        toast.error('Backup failed', { id: 'backup' });
        console.error('Manual backup failed:', error);
      }
    },
  },
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
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    status: string;
    tier: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: { toDate: () => Date };
  } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showPricing, setShowPricing] = useState(!isAuthenticated); // Start with pricing if not authenticated
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false); // After sign-in, waiting for Stripe payment
  const [signInLoading, setSignInLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const countdownIntervalRef = useRef<number | null>(null);
  const prevEngineStateRef = useRef<'IDLE' | 'RUNNING' | 'PAUSED'>('IDLE');

  const renderNeonToast = useCallback(
    (message: string, tone: 'info' | 'error' | 'success' = 'info') => (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0f172a] px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            tone === 'error'
              ? 'bg-[#ff4d6d] shadow-[0_0_12px_rgba(255,77,109,0.6)]'
              : tone === 'success'
                ? 'bg-[#00ff9d] shadow-[0_0_12px_rgba(0,255,157,0.6)]'
                : 'bg-[#00f0ff] shadow-[0_0_12px_rgba(0,240,255,0.6)]'
          }`}
        />
        <span className="text-sm font-semibold text-slate-50">{message}</span>
      </div>
    ),
    []
  );

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
        .catch(() => {});
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
    // Set both states together to avoid race conditions
    setManualWizardOpen(true);
    // Use setTimeout to ensure state update happens after manualWizardOpen is set
    setTimeout(() => setIsWizardOpen(true), 0);
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

  const navItems = useMemo(
    () => [
      ...NAV_ITEMS,
      {
        key: 'subscription',
        icon: CreditCard,
        label: 'Subscription',
        onClick: () => setManageOpen(true),
      },
      ...onboardingNavItems,
    ],
    [onboardingNavItems]
  );

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
  }, [engineState, renderNeonToast]);

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
    logger.log(
      '[Subscription] 🔄 Subscription check effect triggered - isAuthenticated:',
      isAuthenticated,
      'user:',
      !!user
    );

    if (!isAuthenticated || !user) {
      if (!isAuthenticated) {
        logger.log('[Subscription] Not authenticated, showing pricing page');
        setShowPricing(true);
      } else {
        logger.log('[Subscription] Authenticated but no user object yet, waiting...');
      }
      return;
    }

    const checkSubscription = async () => {
      logger.log('[Subscription] 🔍 Starting subscription check for user:', user.email);

      try {
        const { getFirestoreDb, getFirebaseApp } = await import('@/lib/firebase/client');
        const { getAuth } = await import('firebase/auth');
        const { doc, getDoc } = await import('firebase/firestore');

        const firebaseApp = getFirebaseApp();
        const auth = getAuth(firebaseApp);
        const firebaseUid = auth.currentUser?.uid;

        logger.log(
          '[Subscription] Firebase currentUser:',
          auth.currentUser?.email,
          'UID:',
          firebaseUid
        );

        if (!firebaseUid) {
          logger.error(
            '[Subscription] ❌ No Firebase UID - user is authenticated with Google but not synced to Firebase'
          );
          setSubscriptionChecked(true);
          setShowPricing(true);
          toast.error('Could not verify subscription. Please sign out and sign back in.');
          return;
        }

        const firestore = getFirestoreDb();
        const userDocPath = `users/${firebaseUid}`;
        logger.log('[Subscription] 📖 Reading Firestore doc:', userDocPath);

        const userDocRef = doc(firestore, userDocPath);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          logger.log('[Subscription] ⚠️ User doc does not exist in Firestore');
        }

        const userData = userDoc.data();
        const sub = userData?.subscription;

        logger.log(
          '[Subscription] 📋 Full user data from Firestore:',
          JSON.stringify(userData, null, 2)
        );
        logger.log('[Subscription] 📋 Subscription object:', JSON.stringify(sub, null, 2));

        setSubscriptionStatus(sub);
        setSubscriptionChecked(true);

        if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) {
          logger.log('[Subscription] ❌ No active subscription found, auto-redirecting to Stripe');
          logger.log('[Subscription] Sub status was:', sub?.status || 'NONE');
          // Auto-trigger Stripe checkout instead of showing pricing again
          setAwaitingPayment(true);
          setShowPricing(false);
          // Trigger checkout automatically
          triggerCheckout();
        } else {
          logger.log(
            '[Subscription] ✅ Active subscription found! Status:',
            sub.status,
            '- Showing dashboard'
          );
          setShowPricing(false);
        }
      } catch (error) {
        logger.error('[Subscription] ❌ Error checking subscription status:', error);
        setSubscriptionChecked(true);
        setShowPricing(true);

        toast.custom(
          () => renderNeonToast('Could not verify subscription status. Please try again.', 'error'),
          {
            id: 'sub-check-error',
            duration: 5000,
          }
        );
      }
    };

    checkSubscription();
  }, [isAuthenticated, renderNeonToast, user]);

  // Listen for subscription updates from success page (via background script)
  useEffect(() => {
    logger.log('[Subscription] 🎧 Setting up message listener for SUBSCRIPTION_ACTIVE');

    // Activation handler function - FAST PATH: call finalize immediately, no retries
    const handleSubscriptionActivation = async (sessionId?: string) => {
      logger.log('[Subscription] 🚀 Processing subscription activation, sessionId:', sessionId);

      // Show loading state immediately - hide pricing page and awaiting payment
      setShowPricing(false);
      setAwaitingPayment(false); // Clear awaiting payment state
      setSubscriptionChecked(false); // This will show the "Checking subscription..." loader

      if (!user) {
        logger.error('[Subscription] ❌ No user context when processing activation');
        setShowPricing(true);
        return;
      }

      if (!sessionId) {
        logger.error('[Subscription] ❌ No sessionId provided');
        setShowPricing(true);
        return;
      }

      const { getFirebaseApp } = await import('@/lib/firebase/client');
      const { getAuth } = await import('firebase/auth');
      const firebaseApp = getFirebaseApp();
      const auth = getAuth(firebaseApp);
      const firebaseUid = auth.currentUser?.uid;

      if (!firebaseUid) {
        logger.error('[Subscription] ❌ No Firebase UID during activation');
        setShowPricing(true);
        return;
      }

      logger.log('[Subscription] Firebase UID:', firebaseUid);

      try {
        // Call finalize IMMEDIATELY - don't wait for webhook
        logger.log('[Subscription] 📞 Calling finalizeSubscriptionFromSession immediately...');
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(firebaseApp);
        const finalize = httpsCallable(functions, 'finalizeSubscriptionFromSession');
        const result = await finalize({ sessionId });
        logger.log('[Subscription] ✅ Finalize result:', result);

        // Read the subscription we just wrote
        const { getFirestoreDb } = await import('@/lib/firebase/client');
        const { doc, getDoc } = await import('firebase/firestore');
        const firestore = getFirestoreDb();
        const userDocRef = doc(firestore, `users/${firebaseUid}`);
        const userDoc = await getDoc(userDocRef);
        const sub = userDoc.data()?.subscription;

        logger.log('[Subscription] Subscription status:', sub?.status);
        setSubscriptionStatus(sub);

        if (sub?.status === 'active' || sub?.status === 'trialing') {
          logger.log('[Subscription] 🎉 Subscription activated! Showing dashboard.');
          setSubscriptionChecked(true);
          // awaitingPayment already cleared at start of function
          toast.custom(() => renderNeonToast('Trial started! Welcome to JobZippy 🎉', 'success'), {
            id: 'sub-activated',
            duration: 4000,
          });
        } else {
          logger.error('[Subscription] ❌ Unexpected subscription status:', sub?.status);
          setAwaitingPayment(false);
          setShowPricing(true);
          setSubscriptionChecked(true);
        }
      } catch (err) {
        logger.error('[Subscription] ❌ Finalize failed:', err);
        toast.custom(
          () => renderNeonToast('Failed to activate subscription. Please try again.', 'error'),
          { id: 'sub-error', duration: 5000 }
        );
        setAwaitingPayment(false);
        setShowPricing(true);
        setSubscriptionChecked(true);
      }
    };

    // Check for pending activation in chrome.storage (in case sidepanel was closed during payment)
    chrome.storage.local.get('pendingSubscriptionActivation').then((result) => {
      const pending = result.pendingSubscriptionActivation;
      if (pending && pending.timestamp > Date.now() - 5 * 60 * 1000) {
        logger.log('[Subscription] 🔔 Found pending activation in storage:', pending);
        handleSubscriptionActivation(pending.sessionId);
        chrome.storage.local.remove('pendingSubscriptionActivation');
      }
    });

    // Listen for forwarded message from background script
    const handler = (message: { type: string; sessionId?: string; source?: string }) => {
      logger.log('[Subscription] 📨 Received message:', message.type);
      if (message.type === 'SUBSCRIPTION_ACTIVE_FROM_WEBSITE') {
        logger.log(
          '[Subscription] ✅ SUBSCRIPTION_ACTIVE received from website! sessionId:',
          message.sessionId
        );
        handleSubscriptionActivation(message.sessionId);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    logger.log('[Subscription] ✅ Internal message listener registered');

    return () => {
      chrome.runtime.onMessage.removeListener(handler);
      logger.log('[Subscription] 🔇 Message listener removed');
    };
  }, [renderNeonToast, user]);

  // Poll engine status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'ENGINE_STATE' }, (resp) => {
      if (resp?.state) {
        setEngineState(resp.state);
        if (resp.engineStatus) setEngineStatus(resp.engineStatus);
      }
    });
  }, []);

  const handleStartTrial = useCallback(async () => {
    logger.log('[Subscription] 🚀 Start trial button clicked');
    logger.log(
      '[Subscription] Current state - isAuthenticated:',
      isAuthenticated,
      'user:',
      user?.email
    );

    if (!isAuthenticated) {
      logger.log('[Subscription] User not authenticated, closing pricing to show sign-in page');
      setShowPricing(false);
      return;
    }

    logger.log('[Subscription] User is authenticated, proceeding to create checkout session...');
    setCheckoutLoading(true);

    try {
      logger.log('[Subscription] 📞 Calling createCheckoutSession Cloud Function...');
      const { getFirebaseApp } = await import('@/lib/firebase/client');
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getAuth } = await import('firebase/auth');

      const firebaseApp = getFirebaseApp();
      const auth = getAuth(firebaseApp);
      const functions = getFunctions(firebaseApp);

      logger.log('[Subscription] Firebase UID for checkout:', auth.currentUser?.uid);
      logger.log('[Subscription] Firebase user email:', auth.currentUser?.email);

      const createCheckout = httpsCallable(functions, 'createCheckoutSession');

      const toastId = 'checkout';
      toast.custom(() => renderNeonToast('Opening payment page...'), {
        id: toastId,
        duration: Infinity,
      });

      const result = await createCheckout({
        successUrl: 'https://jobzippy.ai/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://jobzippy.ai/welcome',
      });

      logger.log('[Subscription] ✅ Checkout session created successfully');
      const { url, sessionId } = result.data as { url: string; sessionId: string };
      logger.log('[Subscription] Session ID:', sessionId);
      logger.log('[Subscription] 🌐 Opening Stripe checkout URL:', url);

      chrome.tabs.create({ url });
      toast.custom(() => renderNeonToast('Complete payment in the opened tab'), {
        id: toastId,
        duration: 6000,
      });
    } catch (error) {
      logger.error('[Subscription] ❌ Failed to create checkout session:', error);
      if (error instanceof Error) {
        logger.error('[Subscription] Error details:', error.message, error.stack);
      }
      toast.custom(() => renderNeonToast('Failed to open payment page', 'error'), {
        id: 'checkout',
        duration: 6000,
      });
      setShowPricing(true);
    } finally {
      setCheckoutLoading(false);
    }
  }, [isAuthenticated, renderNeonToast, user]);

  // Auto-trigger checkout after sign-in (no auth check needed, already authenticated)
  const triggerCheckout = useCallback(async () => {
    logger.log('[Subscription] 🚀 Auto-triggering checkout after sign-in');
    setCheckoutLoading(true);

    try {
      const { getFirebaseApp } = await import('@/lib/firebase/client');
      const { getFunctions, httpsCallable } = await import('firebase/functions');

      const firebaseApp = getFirebaseApp();
      const functions = getFunctions(firebaseApp);
      const createCheckout = httpsCallable(functions, 'createCheckoutSession');

      const result = await createCheckout({
        successUrl: 'https://jobzippy.ai/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://jobzippy.ai/welcome',
      });

      const { url } = result.data as { url: string; sessionId: string };
      logger.log('[Subscription] 🌐 Opening Stripe checkout URL:', url);

      chrome.tabs.create({ url });
    } catch (error) {
      logger.error('[Subscription] ❌ Failed to auto-trigger checkout:', error);
      toast.custom(() => renderNeonToast('Failed to open payment page', 'error'), {
        id: 'checkout-error',
        duration: 6000,
      });
      setAwaitingPayment(false);
      setShowPricing(true);
    } finally {
      setCheckoutLoading(false);
    }
  }, [renderNeonToast]);

  const startAgent = useCallback(async () => {
    // Immediately show "Running" state - no need to wait for background
    setEngineState('RUNNING');
    setEngineStatus('Starting agent...');

    // Check if we're resuming (saved orchestration state exists)
    const savedState = await chrome.storage.local.get('orchestrationState');
    const isResuming = !!savedState.orchestrationState;

    if (isResuming) {
      console.log('[Jobzippy] Resuming from saved state - skipping new tab creation');
      setEngineStatus('Resuming...');
      // Just send START_AGENT - background will restore state and use existing tab
      chrome.runtime.sendMessage({ type: 'START_AGENT' });
      return;
    }

    // Preflight auth check: probe existing tabs, then open search URLs directly
    setPreflightPending(true);
    const required = { linkedin: true, indeed: false }; // MVP1: Indeed disabled
    const received = { linkedin: false, indeed: false };
    const results = { linkedin: false, indeed: false };
    const openedTabIds: number[] = [];

    // Build search URLs first using onboarding preferences
    let urls: { linkedin?: string; indeed?: string } = {};
    try {
      const [
        { deriveVaultPassword },
        { vaultService },
        { VAULT_STORES },
        { buildLinkedInUrlWithFilters },
      ] = await Promise.all([
        import('@/lib/vault/utils'),
        import('@/lib/vault/service'),
        import('@/lib/vault/constants'),
        import('@/lib/jobs/search'),
      ]);
      const password = deriveVaultPassword(user);
      const profile = await vaultService.load(VAULT_STORES.profile, password).catch(() => null);
      // Use the new filter-based URL builder that uses onboarding preferences
      urls = { linkedin: buildLinkedInUrlWithFilters(profile) };
    } catch {
      // ignore URL build errors; we'll still check auth
    }

    // Open search URLs directly (they'll trigger auth checks via content scripts)
    // But first check if LinkedIn tab already exists to avoid duplicates
    if (urls.linkedin) {
      const existingTabs = await chrome.tabs.query({});
      const existingLinkedInTab = existingTabs.find(
        (tab) =>
          tab.url &&
          (tab.url.includes('linkedin.com/jobs') ||
            (tab.url.startsWith('http://localhost:') && tab.url.includes('linkedin-jobs.html')))
      );

      if (existingLinkedInTab?.id) {
        console.log('[Jobzippy] Found existing LinkedIn tab, reusing:', existingLinkedInTab.id);
        // Navigate existing tab to search URL and activate it
        chrome.tabs.update(existingLinkedInTab.id, { url: urls.linkedin, active: true });
        openedTabIds.push(existingLinkedInTab.id);
      } else {
        chrome.tabs.create({ url: urls.linkedin, active: true }, (tab) => {
          if (tab?.id) openedTabIds.push(tab.id);
        });
      }
    }
    // MVP1: Indeed disabled
    // if (urls.indeed) {
    //   chrome.tabs.create({ url: urls.indeed, active: false }, (tab) => {
    //     if (tab?.id) openedTabIds.push(tab.id);
    //   });
    // }

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
        .catch(() => {});

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
        if (received.linkedin) {
          // MVP1: Indeed disabled - only wait for LinkedIn
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
              () => {}
            );
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);

    // Probe existing tabs first (in case user already has tabs open)
    chrome.runtime.sendMessage({ type: 'AUTH_PROBE_ALL' }, () => {});
  }, [user]);
  const stopAgent = useCallback(() => {
    // Immediately show "Stopping..." state
    setEngineState('PAUSED');
    setEngineStatus('Stopping...');

    chrome.runtime.sendMessage({ type: 'STOP_AUTO_APPLY' }, () => {});
  }, []);

  const handleOpenPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const { getFirebaseApp } = await import('@/lib/firebase/client');
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const app = getFirebaseApp();
      const functions = getFunctions(app);
      const createPortal = httpsCallable(functions, 'createPortalSession');
      const result = await createPortal({
        returnUrl: 'https://jobzippy.ai/welcome',
      });
      const { url } = result.data as { url?: string };
      if (url) {
        chrome.tabs.create({ url });
      } else {
        toast.error('No portal URL returned');
      }
    } catch (error) {
      logger.error('[Subscription] Failed to open billing portal:', error);
      toast.error('Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const handleCancelSubscription = useCallback(async () => {
    if (!subscriptionStatus?.stripeSubscriptionId) {
      toast.error('No active subscription to cancel');
      return;
    }
    setCancelLoading(true);
    try {
      const { getFirebaseApp } = await import('@/lib/firebase/client');
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const app = getFirebaseApp();
      const functions = getFunctions(app);
      const cancel = httpsCallable(functions, 'cancelSubscription');
      await cancel({});
      toast.success('Subscription cancellation requested');
      setSubscriptionStatus((prev) =>
        prev
          ? {
              ...prev,
              cancelAtPeriodEnd: true,
              status: 'canceled',
            }
          : prev
      );
      setShowPricing(true);
    } catch (error) {
      logger.error('[Subscription] Failed to cancel subscription:', error);
      toast.error('Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  }, [subscriptionStatus]);

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

  const neonToaster = (
    <Toaster
      position="top-right"
      theme="dark"
      richColors
      visibleToasts={1}
      toastOptions={{
        classNames: {
          toast:
            'bg-[#0f172a] text-slate-50 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.35)] font-semibold rounded-2xl',
          title: 'text-slate-50 text-sm',
          description: 'text-slate-400 text-xs',
          actionButton:
            'bg-[#00f0ff] text-slate-900 font-semibold rounded-lg px-3 py-1 shadow-[0_10px_25px_rgba(0,240,255,0.35)]',
          cancelButton: 'text-slate-300',
          closeButton:
            'text-slate-300 hover:text-white rounded-full border border-white/10 bg-white/5',
        },
      }}
    />
  );

  if (appLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#020617]">
        {neonToaster}
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
        {neonToaster}
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

  // Show "Awaiting Payment" state while user is completing Stripe checkout in another tab
  if (awaitingPayment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#020617] p-6">
        {neonToaster}
        <div className="w-full max-w-md text-center space-y-8">
          {/* Animated card icon */}
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00f0ff] to-[#7000ff] opacity-30 animate-pulse blur-xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00f0ff]/20 to-[#7000ff]/20 border border-white/10">
              <CreditCard className="h-10 w-10 text-[#00f0ff]" strokeWidth={1.5} />
            </div>
          </div>

          {/* Status text */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-white">Complete your payment</h2>
            <p className="text-slate-400">
              A payment page has opened in a new tab.
              <br />
              Return here once you&apos;re done.
            </p>
          </div>

          {/* Loading indicator */}
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <div className="h-2 w-2 rounded-full bg-[#00f0ff] animate-pulse" />
              <span>Waiting for confirmation...</span>
            </div>
          </div>

          {/* Back button */}
          <button
            onClick={() => {
              setAwaitingPayment(false);
              setShowPricing(true);
            }}
            className="text-slate-400 hover:text-white text-sm underline underline-offset-4 transition-colors"
          >
            Cancel and go back
          </button>
        </div>
      </div>
    );
  }

  // Show pricing page if user needs to subscribe
  if (showPricing) {
    return (
      <>
        {neonToaster}
        <PricingWelcome
          onStartTrial={handleStartTrial}
          onSignIn={() => setShowPricing(false)}
          loading={checkoutLoading}
        />
      </>
    );
  }

  const historyContent = (
    <div className="space-y-6">
      {snapshot.status === 'skipped' && <ResumeOnboardingCard onResume={handleResumeOnboarding} />}

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

  // Show sign-in page without side menu if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#020617] p-6">
        {neonToaster}
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
            <h1 className="text-4xl font-bold text-white">Sign in to continue</h1>
            <p className="text-lg text-slate-400">Connect your Google account to get started</p>
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
      {neonToaster}
      <LayoutShell
        title="Jobzippy"
        subtitle="Your agentic AI for job search"
        statusLabel={null}
        history={historyContent}
        navItems={navItems}
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
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="bg-[#0f172a] border border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage subscription</DialogTitle>
            <DialogDescription className="text-slate-400">
              View your current plan or cancel your subscription.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Status</span>
              <span className="font-semibold">
                {subscriptionStatus?.status ?? 'No subscription'}
                {subscriptionStatus?.cancelAtPeriodEnd ? ' (cancels at period end)' : ''}
              </span>
            </div>
            {subscriptionStatus?.currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Current period ends</span>
                <span className="font-semibold">
                  {subscriptionStatus.currentPeriodEnd.toDate().toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <button
              onClick={handleOpenPortal}
              disabled={portalLoading}
              className="w-full rounded-lg bg-gradient-to-r from-[#00f0ff] to-[#7000ff] px-4 py-2.5 text-sm font-semibold shadow-[0_10px_25px_rgba(0,240,255,0.25)] hover:opacity-90 transition disabled:opacity-50"
            >
              {portalLoading ? 'Opening portal...' : 'Open billing portal'}
            </button>
            <button
              onClick={handleCancelSubscription}
              disabled={cancelLoading || !subscriptionStatus?.stripeSubscriptionId}
              className="w-full rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-white border border-white/20 hover:bg-white/15 transition disabled:opacity-50"
            >
              {cancelLoading ? 'Cancelling...' : 'Cancel subscription'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
