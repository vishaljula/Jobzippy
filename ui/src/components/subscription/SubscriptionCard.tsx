import { useState, useEffect } from 'react';
import { loadStripe, StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Check, Loader2, X } from 'lucide-react';

// Initialize Stripe
const stripePromise = loadStripe(
  'pk_test_51Sb0fK3mnoQdTKv9gqoX6XJDnJR7Kn8HsjZrKI72kEibDhxRFYFkghDZJRz1LPKbtjGXWEEj10ddvvIawQGn5UNc00JgykZmTe'
);

export function SubscriptionCard() {
  const [showCheckout, setShowCheckout] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<StripeEmbeddedCheckout | null>(null);

  const handleStartTrial = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call Cloud Function to create embedded checkout session
      const functions = getFunctions();
      const createCheckout = httpsCallable(functions, 'createEmbeddedCheckout');

      const result = await createCheckout({
        returnUrl: chrome.runtime.getURL('sidepanel.html'),
      });

      const data = result.data as { clientSecret: string; sessionId: string };
      setClientSecret(data.clientSecret);
      setShowCheckout(true);
    } catch (err) {
      console.error('Failed to create checkout session:', err);
      setError('Failed to start trial. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Mount embedded checkout when modal opens
  useEffect(() => {
    if (!clientSecret || !showCheckout) return;

    const initCheckout = async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe) throw new Error('Stripe failed to load');

        const checkoutInstance = await stripe.initEmbeddedCheckout({
          clientSecret,
        });

        setCheckout(checkoutInstance);
        checkoutInstance.mount('#embedded-checkout');
      } catch (err) {
        console.error('Failed to initialize checkout:', err);
        setError('Failed to load payment form. Please try again.');
      }
    };

    initCheckout();

    // Cleanup
    return () => {
      if (checkout) {
        checkout.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret, showCheckout]);

  // Handle modal close
  const handleCloseCheckout = () => {
    if (checkout) {
      checkout.destroy();
      setCheckout(null);
    }
    setShowCheckout(false);
    setClientSecret(null);
  };

  return (
    <>
      <Card className="border-primary-200 bg-gradient-to-br from-primary-50 to-secondary-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">🚀 Start Your 3-Day Free Trial</CardTitle>
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

      {/* Embedded Checkout Modal */}
      <Dialog open={showCheckout} onOpenChange={handleCloseCheckout}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="relative">
            <button
              onClick={handleCloseCheckout}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div id="embedded-checkout" className="min-h-[600px]" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
