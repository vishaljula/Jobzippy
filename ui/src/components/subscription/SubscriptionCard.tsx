import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/lib/firebase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { logger } from '@/lib/logger';

export function SubscriptionCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Log component mount
  useEffect(() => {
    logger.log('Subscription', '💳 SubscriptionCard component mounted');
  }, []);

  const handleStartTrial = async () => {
    logger.log('Subscription', '🚀 Starting trial checkout flow (redirect mode)...');
    setLoading(true);
    setError(null);

    try {
      // Call Cloud Function to create checkout session
      logger.log('Subscription', '📞 Calling Firebase Cloud Function: createCheckoutSession');
      const app = getFirebaseApp();
      const functions = getFunctions(app);
      const createCheckout = httpsCallable(functions, 'createCheckoutSession');

      // Return URL for after payment completion
      const successUrl = chrome.runtime.getURL('sidepanel.html?session_id={CHECKOUT_SESSION_ID}');
      const cancelUrl = chrome.runtime.getURL('sidepanel.html');

      logger.log('Subscription', `📍 Success URL: ${successUrl}`);
      logger.log('Subscription', `📍 Cancel URL: ${cancelUrl}`);

      const result = await createCheckout({
        successUrl,
        cancelUrl,
      });

      const data = result.data as { url: string; sessionId: string };
      logger.log('Subscription', `✅ Received checkout URL: ${data.url}`);
      logger.log('Subscription', `🎫 Session ID: ${data.sessionId}`);

      // Open Stripe checkout in new tab
      logger.log('Subscription', '🌐 Opening Stripe checkout in new tab...');
      chrome.tabs.create({ url: data.url });

      logger.log('Subscription', '✅ Checkout tab opened successfully');
    } catch (err) {
      console.error('[Subscription] ❌ Failed to create checkout session:', err);
      logger.error('Subscription', 'Failed to create checkout session:', err);

      // Log detailed error info
      if (err && typeof err === 'object') {
        const errorObj = err as any;
        logger.log('Subscription', `Error code: ${errorObj.code || 'unknown'}`);
        logger.log('Subscription', `Error message: ${errorObj.message || 'unknown'}`);
        if (errorObj.details) {
          logger.log('Subscription', `Error details: ${JSON.stringify(errorObj.details)}`);
        }
      }

      setError('Failed to start trial. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary-200 bg-gradient-to-br from-primary-50 to-secondary-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary-600" />
          Start Your 3-Day Free Trial
        </CardTitle>
        <CardDescription>Apply to 300 jobs/month • Full access to all features</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span>Auto-fill LinkedIn, Indeed, Glassdoor</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span>AI cover letter generation</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span>Google Sheets backup</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span>Priority support</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span>Advanced job matching</span>
          </div>
        </div>

        <Button onClick={handleStartTrial} disabled={loading} size="lg" className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            'Start Free Trial - $9.99/month after'
          )}
        </Button>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <p className="text-xs text-center text-gray-500">
          Card required. Cancel anytime. No questions asked.
        </p>
      </CardContent>
    </Card>
  );
}
