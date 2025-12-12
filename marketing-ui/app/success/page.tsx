'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Sparkles } from 'lucide-react';

// Extension ID - inlined at build time
const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [extensionNotified, setExtensionNotified] = useState(false);
  const hasAttempted = useRef(false); // Use ref instead of state to avoid re-render

  useEffect(() => {
    // Only run once - use ref to avoid triggering cleanup
    if (hasAttempted.current) return;
    hasAttempted.current = true;

    console.log('[Success Page] Mounted. Extension ID:', EXTENSION_ID);
    console.log('[Success Page] Session ID:', sessionId);

    const notifyExtension = () => {
      console.log('[Success Page] notifyExtension() called after 500ms');
      console.log('[Success Page] typeof chrome:', typeof chrome);
      console.log('[Success Page] chrome.runtime exists:', typeof chrome !== 'undefined' && !!chrome?.runtime);
      console.log('[Success Page] sendMessage exists:', typeof chrome !== 'undefined' && !!chrome?.runtime?.sendMessage);
      
      try {
        if (!EXTENSION_ID) {
          console.error('[Success Page] ❌ EXTENSION_ID not set; cannot notify extension');
          return;
        }

        // Check if chrome API is available
        if (typeof chrome === 'undefined') {
          console.error('[Success Page] ❌ chrome is undefined - not running in Chrome browser');
          return;
        }
        
        if (!chrome?.runtime) {
          console.error('[Success Page] ❌ chrome.runtime is undefined');
          return;
        }
        
        if (!chrome?.runtime?.sendMessage) {
          console.error('[Success Page] ❌ chrome.runtime.sendMessage is undefined');
          return;
        }

        console.log('[Success Page] ✅ All checks passed, sending message to extension:', EXTENSION_ID);
        
        console.log('[Success Page] 📤 Calling chrome.runtime.sendMessage now...');
        
        // @ts-ignore - chrome API types
        chrome.runtime.sendMessage(
          EXTENSION_ID,
          {
            type: 'SUBSCRIPTION_ACTIVE',
            sessionId: sessionId
          },
          (response: unknown) => {
            console.log('[Success Page] 📥 sendMessage callback fired');
            // @ts-ignore
            if (chrome.runtime.lastError) {
              // @ts-ignore
              console.error('[Success Page] ❌ Extension error:', chrome.runtime.lastError.message);
            } else {
              console.log('[Success Page] ✅ Extension notified successfully! Response:', response);
              setExtensionNotified(true);
            }
          }
        );
        console.log('[Success Page] sendMessage called (waiting for callback...)');
      } catch (error) {
        console.error('[Success Page] ❌ Exception in notifyExtension:', error);
      }
    };

    // Small delay to ensure page is fully loaded
    const timer = setTimeout(notifyExtension, 500);
    return () => clearTimeout(timer);
  }, [sessionId]); // Only depend on sessionId, not on the ref

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Success Icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-[#00f0ff] to-[#7000ff] rounded-full blur-xl opacity-50 animate-pulse"></div>
          <div className="relative mx-auto w-20 h-20 bg-gradient-to-br from-[#00f0ff] to-[#7000ff] rounded-full flex items-center justify-center shadow-2xl">
            <Check className="w-10 h-10 text-white" strokeWidth={3} />
          </div>
        </div>

        {/* Success Message */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-[#00f0ff] to-[#7000ff] bg-clip-text text-transparent">
            🎉 Payment Successful!
          </h1>
          <p className="text-xl text-slate-300">
            Your 3-day free trial has started
          </p>
        </div>

        {/* Details */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 backdrop-blur-lg">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-[#00ff9d]/20 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3 h-3 text-[#00ff9d]" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">Trial activated</p>
              <p className="text-sm text-slate-400">You have 3 days to try all features</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-[#00ff9d]/20 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3 h-3 text-[#00ff9d]" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">300 applications/month</p>
              <p className="text-sm text-slate-400">Your monthly allowance is ready</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-[#00ff9d]/20 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3 h-3 text-[#00ff9d]" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">No charges until {new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
              <p className="text-sm text-slate-400">Cancel anytime during trial</p>
            </div>
          </div>
        </div>

        {/* Extension Status */}
        {extensionNotified ? (
          <div className="bg-[#00ff9d]/10 border border-[#00ff9d]/30 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 text-[#00ff9d]">
              <Sparkles className="w-5 h-5" />
              <span className="font-medium">Extension activated! You can close this tab.</span>
            </div>
          </div>
        ) : (
          <div className="bg-[#00f0ff]/10 border border-[#00f0ff]/30 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-[#00f0ff]">
                Activating your extension...
              </p>
            </div>
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
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin"></div>
          <div className="text-white">Loading...</div>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}

