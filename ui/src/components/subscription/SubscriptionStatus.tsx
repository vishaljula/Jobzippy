import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseApp, getFirestoreDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { getAuth } from 'firebase/auth';

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

    const app = getFirebaseApp();
    const auth = getAuth(app);
    const firebaseUid = auth.currentUser?.uid;
    if (!firebaseUid) return;

    const db = getFirestoreDb();
    const unsubscribe = onSnapshot(
      doc(db, 'users', firebaseUid),
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
    <Card className="relative overflow-hidden border-white/10 bg-white/5 backdrop-blur-lg text-white">
      {/* Gradient glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#00f0ff]/10 to-[#7000ff]/10 pointer-events-none" />
      <CardContent className="relative p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-sm text-[#00f0ff] font-medium uppercase tracking-wider">
              Applications This Month
            </p>
            <p className="text-3xl font-bold">{usage.applications_this_month} / 300</p>
          </div>

          <div className="text-right">
            {isTrialing && (
              <Badge className="text-sm px-3 py-1.5 bg-white/10 border border-white/20 text-white hover:bg-white/20">
                <Clock className="h-4 w-4 mr-1.5 inline text-[#00f0ff]" />
                Trial ({trialDaysRemaining} days left)
              </Badge>
            )}
            {isActive && (
              <Badge className="text-sm px-3 py-1.5 bg-[#00ff9d]/20 border border-[#00ff9d]/30 text-[#00ff9d] hover:bg-[#00ff9d]/30">
                <CheckCircle2 className="h-4 w-4 mr-1.5 inline" />
                Pro Active
              </Badge>
            )}
            {isPastDue && (
              <Badge variant="destructive" className="text-sm px-3 py-1.5">
                <XCircle className="h-4 w-4 mr-1.5 inline" />
                Payment Failed
              </Badge>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00f0ff] to-[#7000ff] transition-all duration-300"
            style={{
              width: `${(usage.applications_this_month / 300) * 100}%`,
            }}
          />
        </div>

        <div className="mt-2 flex justify-between text-xs text-slate-400">
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
