import express from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { config } from '../config.js';
import { authenticateFirebase, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Initialize Stripe
if (!config.stripe.secretKey) {
  throw new Error('STRIPE_SECRET_KEY is required but not configured');
}

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2025-11-17.clover',
});

// Request schema
const createCheckoutSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/**
 * POST /create-checkout
 * Creates a Stripe Checkout session for subscription
 */
router.post('/create-checkout', authenticateFirebase, async (req: AuthenticatedRequest, res) => {
  try {
    // Validate request body
    const { successUrl, cancelUrl } = createCheckoutSchema.parse(req.body);

    const userId = req.user!.uid;
    const userEmail = req.user!.email;

    if (!userEmail) {
      res.status(400).json({ error: 'bad_request', message: 'User email is required' });
      return;
    }

    console.log(`[Checkout] Creating checkout session for user: ${userId}`);

    // Validate Stripe configuration
    if (!config.stripe.priceId) {
      res.status(500).json({
        error: 'configuration_error',
        message: 'Stripe price ID is not configured',
      });
      return;
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [
        {
          price: config.stripe.priceId,
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
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    console.log(`[Checkout] Session created: ${session.id}`);

    res.json({
      url: session.url, // Hosted checkout URL
      sessionId: session.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request data',
        details: error.flatten(),
      });
      return;
    }

    console.error('[Checkout] Error creating checkout session:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to create checkout session',
    });
  }
});

export { router as checkoutRouter };

