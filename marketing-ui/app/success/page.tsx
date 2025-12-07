'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Sparkles } from 'lucide-react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [extensionNotified, setExtensionNotified] = useState(false);

  useEffect(() => {
    // Send message to extension (only runs in browser)
    const notifyExtension = async () => {
      try {
        // Check if chrome API is available (only in browser, not during SSR)
        if (typeof window === 'undefined') return;
        
        // @ts-ignore - chrome API not available during build
        if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
          const EXTENSION_ID = 'bjebcoccbgjddngioofnolbekednppia';
          
          // @ts-ignore
          chrome.runtime.sendMessage(
            EXTENSION_ID,
            {
              type: 'SUBSCRIPTION_ACTIVE',
              sessionId: sessionId
            },
            (response: any) => {
              // @ts-ignore
              if (chrome.runtime.lastError) {
                // @ts-ignore
                console.log('Extension not found:', chrome.runtime.lastError.message);
              } else {
                console.log('Extension notified successfully:', response);
                setExtensionNotified(true);
              }
            }
          );
        }
      } catch (error) {
        console.error('Error notifying extension:', error);
      }
    };

    if (sessionId) {
      notifyExtension();
    }
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Success Icon */}
        <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </div>

        {/* Success Message */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white">
            🎉 Payment Successful!
          </h1>
          <p className="text-xl text-slate-300">
            Your 3-day free trial has started
          </p>
        </div>

        {/* Details */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 space-y-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-white font-medium">Trial activated</p>
              <p className="text-sm text-slate-400">You have 3 days to try all features</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-white font-medium">300 applications/month</p>
              <p className="text-sm text-slate-400">Your monthly allowance is ready</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-white font-medium">No charges until {new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
              <p className="text-sm text-slate-400">Cancel anytime during trial</p>
            </div>
          </div>
        </div>

        {/* Extension Status */}
        {extensionNotified ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 text-green-400">
              <Sparkles className="w-5 h-5" />
              <span className="font-medium">Extension activated! You can close this tab.</span>
            </div>
          </div>
        ) : (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <p className="text-sm text-blue-300">
              Activating your extension...
            </p>
          </div>
        )}

        {/* Session ID (for debugging) */}
        {sessionId && (
          <p className="text-xs text-slate-600 break-all">
            Session: {sessionId.slice(0, 20)}...
          </p>
        )}

        {/* Close instruction */}
        <p className="text-sm text-slate-500">
          You can close this tab and return to the extension
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}

