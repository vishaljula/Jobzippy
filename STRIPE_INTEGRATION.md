# Stripe Integration Setup Guide

**Status:** ✅ Embedded Checkout Implemented  
**Last Updated:** December 5, 2025

---

## 🎉 What's Been Implemented

### **Embedded Stripe Checkout** (Modal-based, stays in extension)

✅ **Cloud Functions:**
- `createEmbeddedCheckout` - Creates Stripe checkout session
- `stripeWebhook` - Handles subscription lifecycle events

✅ **UI Components:**
- `SubscriptionCard` - Beautiful trial offer with embedded checkout
- `SubscriptionStatus` - Shows trial/active status and usage

✅ **Features:**
- 3-day free trial
- $9.99/month after trial
- 300 applications/month limit
- Card required upfront
- Embedded checkout (no tab switching!)

---

## 📋 Setup Checklist

### **1. Deploy Firebase Functions**

```bash
cd /Users/adi/Projects/Jobzippy

# Deploy functions
firebase deploy --only functions

# Copy the webhook URL from output:
# Function URL (stripeWebhook): https://us-central1-jobzippy-d4002.cloudfunctions.net/stripeWebhook
```

### **2. Configure Stripe Webhook**

Go to: https://dashboard.stripe.com/test/webhooks

**Add endpoint:**
```
URL: https://us-central1-jobzippy-d4002.cloudfunctions.net/stripeWebhook
```

**Select events:**
- ✅ `checkout.session.completed`
- ✅ `customer.subscription.updated`
- ✅ `customer.subscription.deleted`
- ✅ `invoice.payment_succeeded`
- ✅ `invoice.payment_failed`

**Copy the Signing Secret:** `whsec_xxxxx`

### **3. Update Environment Variables**

```bash
cd functions

# Update .env file with your webhook secret
# Replace whsec_placeholder with your actual signing secret
```

Edit `functions/.env`:
```
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE  ← Get from Stripe Dashboard
STRIPE_PRICE_ID=price_YOUR_PRICE_ID_HERE        ← Get from Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET  ← Get after creating webhook
```

**Redeploy after updating:**
```bash
firebase deploy --only functions
```

### **4. Test with Test Cards**

Use Stripe test cards (no real charges):

**Successful payment:**
```
Card: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/34)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

**Failed payment:**
```
Card: 4000 0000 0000 0002
```

**3D Secure (requires authentication):**
```
Card: 4000 0027 6000 3184
```

---

## 🧪 Testing Flow

### **1. Start the Extension**
```bash
cd ui
npm run dev
```

### **2. Test the Flow**

1. **Sign in** to the extension
2. **See SubscriptionCard** on dashboard
3. **Click "Start Free Trial"**
4. **Modal opens** with Stripe checkout (stays in extension!)
5. **Enter test card:** `4242 4242 4242 4242`
6. **Submit payment**
7. **Modal closes**, see **"Trial Started!"**
8. **Check Firestore:** `users/{userId}` should have `subscription` object

### **3. Verify in Stripe Dashboard**

Go to: https://dashboard.stripe.com/test/subscriptions

You should see:
- New customer with your email
- Subscription in "trialing" status
- Trial ends in 3 days

---

## 📊 Data Structure

### **Firestore: `users/{userId}`**

```typescript
{
  subscription: {
    status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused',
    tier: 'free' | 'pro',
    stripeCustomerId: 'cus_xxxxx',
    stripeSubscriptionId: 'sub_xxxxx',
    currentPeriodEnd: Timestamp,
    cancelAtPeriodEnd: boolean,
    trialEndsAt: Timestamp | null,
  },
  usage: {
    applications_this_month: 0,
    month_started: '2025-12',
    last_reset: Timestamp,
  },
  updatedAt: Timestamp,
}
```

---

## 🎯 User Experience

### **Before Trial:**
```
┌──────────────────────────────────────┐
│ 🚀 Start Your 3-Day Free Trial      │
│                                      │
│ ✓ Auto-fill LinkedIn, Indeed         │
│ ✓ AI cover letter generation         │
│ ✓ Google Sheets backup                │
│ ✓ Priority support                    │
│                                      │
│ [Start Free Trial - $9.99/month after]│
│                                      │
│ Card required. Cancel anytime.       │
└──────────────────────────────────────┘
```

### **After Clicking Button:**
```
┌─────────────────────────────────────────────┐
│  [X]                            (Modal)     │
│                                             │
│  ┌─────────────────────────────────┐       │
│  │  [Stripe Embedded Checkout]      │       │
│  │                                   │       │
│  │  Card: ____________________      │       │
│  │  Expiry: ____  CVC: ____         │       │
│  │                                   │       │
│  │  Free for 3 days, then $9.99/mo  │       │
│  │                                   │       │
│  │  [Subscribe]                      │       │
│  └─────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

### **During Trial:**
```
┌──────────────────────────────────────┐
│  Applications This Month     [Trial] │
│  0 / 300                  2 days left│
│                                      │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░       │
│  300 remaining    Resets on Jan 7    │
└──────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### **Error: "Failed to create checkout session"**

**Check:**
1. Functions deployed: `firebase deploy --only functions`
2. .env file exists: `functions/.env`
3. Keys are correct in .env
4. User is authenticated (Firebase Auth)

**Debug:**
```bash
# View function logs
firebase functions:log --only createEmbeddedCheckout

# Check if function is deployed
firebase functions:list
```

### **Error: "Webhook signature verification failed"**

**Fix:**
1. Go to Stripe Dashboard → Webhooks
2. Copy the **Signing Secret**: `whsec_xxxxx`
3. Update `functions/.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```
4. Redeploy: `firebase deploy --only functions`

### **Subscription Not Updating in Firestore**

**Check:**
1. Webhook is configured in Stripe
2. Webhook secret is correct
3. Events are being sent (check Stripe Dashboard → Webhooks → Events)
4. Function logs: `firebase functions:log --only stripeWebhook`

### **Modal Not Opening**

**Check:**
1. Stripe SDK installed: `npm list @stripe/stripe-js`
2. Publishable key is correct in `SubscriptionCard.tsx`
3. Console for errors: Open DevTools on extension

---

## 🚀 Going Live (Production)

### **1. Switch to Live Mode**

**Stripe Dashboard:**
- Toggle "Test mode" OFF (top right)
- Get live keys: `pk_live_...` and `sk_live_...`

**Update Keys:**
```bash
# Don't commit these! Use Firebase config
firebase functions:config:set \
  stripe.secret_key="sk_live_..." \
  stripe.publishable_key="pk_live_..." \
  stripe.price_id="price_live_..." \
  stripe.webhook_secret="whsec_live_..."
```

**Update UI:**
Edit `ui/src/components/subscription/SubscriptionCard.tsx`:
```typescript
const stripePromise = loadStripe('pk_live_...');  // ← Use live key
```

### **2. Verify Live Webhook**

- Create new webhook endpoint for live mode
- Use live signing secret
- Test with real card (small amount)
- Monitor live transactions

### **3. Security Checklist**

- [ ] Firestore Security Rules deployed
- [ ] Webhook signature verified
- [ ] Environment variables not in code
- [ ] HTTPS only (already enforced by Chrome)
- [ ] Rate limiting implemented (Layer 6)

---

## 📈 Monitoring

### **Stripe Dashboard:**
- **Customers:** Track signups
- **Subscriptions:** Monitor trials → paid
- **Revenue:** See MRR growth
- **Disputes:** Handle chargebacks

### **Firebase Console:**
- **Firestore:** Check subscription documents
- **Functions:** Monitor execution time, errors
- **Usage:** Track API calls, costs

### **Key Metrics:**
- Trial signups per day
- Trial → paid conversion rate (target: 60%+)
- Monthly churn rate (target: <5%)
- Revenue per user: $9.99

---

## 🎯 Next Steps

### **Phase 1: Testing (Current)**
- [ ] Test embedded checkout flow
- [ ] Verify webhook updates Firestore
- [ ] Test with test cards
- [ ] Check trial countdown
- [ ] Test subscription cancellation

### **Phase 2: Polish**
- [ ] Add Stripe Customer Portal (manage subscriptions)
- [ ] Add "Upgrade to Pro" messaging for paused users
- [ ] Add trial expiry email notifications
- [ ] Implement usage enforcement (300/month limit)

### **Phase 3: Production**
- [ ] Switch to live Stripe keys
- [ ] Deploy to production
- [ ] Monitor first 10 signups
- [ ] Collect feedback
- [ ] Iterate

---

## 🔗 Resources

- **Stripe Dashboard:** https://dashboard.stripe.com/test
- **Stripe Docs (Embedded Checkout):** https://stripe.com/docs/payments/checkout/embedded
- **Firebase Functions:** https://firebase.google.com/docs/functions
- **Test Cards:** https://stripe.com/docs/testing

---

## 🆘 Need Help?

### **Common Issues:**

1. **"Cannot find module '@stripe/stripe-js'"**
   ```bash
   cd ui && npm install @stripe/stripe-js
   ```

2. **"Webhook not receiving events"**
   - Check webhook URL is correct
   - Check events are selected in Stripe
   - Check webhook secret matches

3. **"Functions not deploying"**
   ```bash
   cd functions && npm install
   firebase deploy --only functions --debug
   ```

---

**Status:** Ready for testing! 🚀  
**Next:** Deploy functions and test the flow with test cards.

