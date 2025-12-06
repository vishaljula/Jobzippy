import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

interface SubscriptionData {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused';
  tier: 'free' | 'pro' | 'trial';
  trialEndsAt?: { seconds: number };
  currentPeriodEnd?: { seconds: number };
  cancelAtPeriodEnd?: boolean;
}

interface UsageData {
  applications_this_month: number;
}

export function SubscriptionStatus() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData>({ applications_this_month: 0 });

  useEffect(() => {
    if (!user) return;

    const db = getFirestoreDb();
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.sub),
      (snapshot) => {
        const data = snapshot.data();
        if (data) {
          setSubscription(data.subscription || null);
          setUsage(data.usage || { applications_this_month: 0 });
        }
      },
      (error) => {
        console.error('Error fetching subscription:', error);
      }
    );

    return unsubscribe;
  }, [user]);

  if (!subscription || subscription.status === 'paused') {
    return null; // Don't show if no subscription
  }

  const applicationsRemaining = 300 - usage.applications_this_month;
  const isTrialing = subscription.status === 'trialing';
  const isActive = subscription.status === 'active';
  const isPastDue = subscription.status === 'past_due';

  const trialDaysRemaining = subscription.trialEndsAt
    ? Math.ceil((subscription.trialEndsAt.seconds * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Card className="border-primary-200 bg-gradient-to-r from-primary-500 to-secondary-500 text-white">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-sm opacity-90">Applications This Month</p>
            <p className="text-3xl font-bold">{usage.applications_this_month} / 300</p>
          </div>

          <div className="text-right">
            {isTrialing && (
              <Badge variant="secondary" className="text-base px-3 py-1">
                <Clock className="h-4 w-4 mr-1 inline" />
                Trial ({trialDaysRemaining} days left)
              </Badge>
            )}
            {isActive && (
              <Badge variant="secondary" className="text-base px-3 py-1">
                <CheckCircle2 className="h-4 w-4 mr-1 inline" />
                Pro Active
              </Badge>
            )}
            {isPastDue && (
              <Badge variant="destructive" className="text-base px-3 py-1">
                <XCircle className="h-4 w-4 mr-1 inline" />
                Payment Failed
              </Badge>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white transition-all duration-300"
            style={{
              width: `${(usage.applications_this_month / 300) * 100}%`,
            }}
          />
        </div>

        <div className="mt-2 flex justify-between text-xs opacity-75">
          <span>{applicationsRemaining} remaining</span>
          {subscription.currentPeriodEnd && (
            <span>
              Resets on{' '}
              {new Date(subscription.currentPeriodEnd.seconds * 1000).toLocaleDateString()}
            </span>
          )}
        </div>

        {isPastDue && (
          <div className="mt-3 p-3 bg-red-500/20 rounded-lg">
            <p className="text-sm">
              Your payment failed. Please update your payment method to continue using Jobzippy.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => {
                // TODO: Open Stripe Customer Portal
                console.log('Open customer portal');
              }}
            >
              Update Payment Method
            </Button>
          </div>
        )}

        {subscription.cancelAtPeriodEnd && (
          <div className="mt-3 p-3 bg-yellow-500/20 rounded-lg">
            <p className="text-sm">
              Your subscription will cancel at the end of the current billing period.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
