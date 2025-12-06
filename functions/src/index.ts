import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();

// Initialize Stripe with secret key from config
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

/**
 * Creates a Stripe Checkout session for subscription (hosted mode)
 */
export const createCheckoutSession = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const userId = context.auth.uid;
  const userEmail = context.auth.token.email;

  if (!userEmail) {
    throw new functions.https.HttpsError('invalid-argument', 'User email is required');
  }

  functions.logger.info(`Creating checkout session for user: ${userId}`);

  try {
    // Create Stripe Checkout Session in hosted mode (opens in new tab)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 3, // 3-day free trial
        metadata: {
          userId, // Link subscription to Firebase user
        },
      },
      // Success/cancel URLs
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
    });

    functions.logger.info(`Checkout session created: ${session.id}`);

    return {
      url: session.url, // Hosted checkout URL
      sessionId: session.id,
    };
  } catch (error) {
    functions.logger.error('Error creating checkout session:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to create checkout session',
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Webhook handler for Stripe events
 * Handles subscription lifecycle events
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    functions.logger.error('Missing Stripe signature');
    res.status(400).send('Missing signature');
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err) {
    functions.logger.error('Webhook signature verification failed:', err);
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return;
  }

  functions.logger.info(`Webhook received: ${event.type}`);

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        functions.logger.info(`Checkout completed for session: ${session.id}`);

        // Get subscription from session
        if (session.subscription && session.metadata?.userId) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          // Update user's subscription status in Firestore
          await admin
            .firestore()
            .doc(`users/${session.metadata.userId}`)
            .set(
              {
                subscription: {
                  status: subscription.status,
                  tier: 'pro',
                  stripeCustomerId: subscription.customer,
                  stripeSubscriptionId: subscription.id,
                  currentPeriodEnd: admin.firestore.Timestamp.fromDate(
                    new Date(subscription.current_period_end * 1000)
                  ),
                  cancelAtPeriodEnd: subscription.cancel_at_period_end,
                  trialEndsAt: subscription.trial_end
                    ? admin.firestore.Timestamp.fromDate(new Date(subscription.trial_end * 1000))
                    : null,
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

          functions.logger.info(`Subscription created for user: ${session.metadata.userId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        if (userId) {
          await admin
            .firestore()
            .doc(`users/${userId}`)
            .update({
              'subscription.status': subscription.status,
              'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromDate(
                new Date(subscription.current_period_end * 1000)
              ),
              'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

          functions.logger.info(`Subscription updated for user: ${userId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        if (userId) {
          await admin
            .firestore()
            .doc(`users/${userId}`)
            .update({
              'subscription.status': 'canceled',
              'subscription.tier': 'free',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

          functions.logger.info(`Subscription canceled for user: ${userId}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription as string
          );
          const userId = subscription.metadata.userId;

          if (userId) {
            // Reset monthly usage count on successful payment
            await admin
              .firestore()
              .doc(`users/${userId}`)
              .update({
                'subscription.status': 'active',
                'usage.applications_this_month': 0,
                'usage.month_started': new Date().toISOString().slice(0, 7), // YYYY-MM
                'usage.last_reset': admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

            functions.logger.info(`Payment succeeded, usage reset for user: ${userId}`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription as string
          );
          const userId = subscription.metadata.userId;

          if (userId) {
            await admin
              .firestore()
              .doc(`users/${userId}`)
              .update({
                'subscription.status': 'past_due',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

            functions.logger.info(`Payment failed for user: ${userId}`);
          }
        }
        break;
      }

      default:
        functions.logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    functions.logger.error('Error processing webhook:', error);
    res.status(500).send('Webhook processing failed');
  }
});

