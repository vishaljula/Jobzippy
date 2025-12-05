# Jobzippy Product Strategy & Implementation Plan

**Last Updated:** December 4, 2025  
**Status:** 🎯 Ready for Implementation

---

## 💰 Pricing Strategy

### **Model: Trial → Paid (No Free Tier)**
```
Trial: 3 days, card required, full access (300 apps)
   ↓
Pro: $9.99/month, 300 applications/month, all features
   ↓
(Future) Teams: $49.99/month, 5 seats, analytics
```

### **Why This Works:**
- ✅ **$9.99 = impulse buy territory** (same as Netflix/Spotify)
- ✅ **Card required** = blocks freeloaders & WhatsApp hack groups
- ✅ **No countdown warnings** = 60-75% trial conversion (vs 25-35% with warnings)
- ✅ **300 app limit** = protects from LinkedIn rate limits
- ✅ **10x cheaper than competitors** ($99-299/mo → $9.99/mo)

### **Conversion Funnel:**
```
Signup → Enter Card → 3-Day Trial → Silent Charge → Pro Member
                ↓ (if cancels before Day 3)
                Account Paused (No Charge)
```

---

## 🎯 Feature Roadmap

### **Phase 1: Critical Fixes (Current Sprint)**
**Priority: 🔴 CRITICAL - Legal/Product Issues**

1. ✅ Add `citizenship_status` to onboarding
   - Field: `'us_citizen' | 'permanent_resident' | 'work_visa' | 'no_authorization'`
   - Location: `UserProfile.work_auth.citizenship_status`
   - Issue: Currently hardcodes "us_citizen" (legal fraud risk)

2. ✅ Fix inconsistent visa sponsorship logic
   - Issue: Randomly sends "yes" or "no" (12 vs 4 submissions)
   - Root cause: Bug in ATS form filling
   - Fix: Use consistent value from vault

3. ✅ Add LinkedIn URL collection
   - Field: `UserProfile.identity.linkedin_url`
   - Issue: 70% of recruiters expect LinkedIn, we send empty string

4. ✅ Fix cover letter handling
   - Issue: Using resume.pdf as cover letter
   - Fix: Leave blank if optional, or generate with AI

5. ✅ Calculate work authorization correctly
   - Don't hardcode "no", calculate from visa_type

### **Phase 2: Job Matching Improvements (Next Sprint)**
**Priority: 🟡 HIGH - Improves Success Rate**

6. ✅ Add target roles/job titles
   - Field: `UserProfile.preferences.target_roles: string[]`
   - Example: ["Software Engineer", "Full Stack Developer"]
   - Use: Filter LinkedIn jobs by title relevance

7. ✅ Add years of experience
   - Field: `UserProfile.experience.years_total: number`
   - Use: Filter out "10+ years required" jobs

8. ✅ Add seniority level preferences
   - Field: `UserProfile.preferences.seniority_levels: string[]`
   - Options: ['entry', 'mid', 'senior', 'staff', 'principal']
   - Use: Match LinkedIn experience level filters

9. ✅ Add job type preferences
   - Field: `UserProfile.preferences.job_types: string[]`
   - Options: ['full_time', 'contract', 'part_time']
   - Use: Filter LinkedIn job type

10. ✅ Update LinkedIn search integration
    - Use experience_level filter
    - Use job_type filter
    - Better keyword matching

### **Phase 3: Polish & Upsells (Future)**
**Priority: 🔵 MEDIUM - Revenue Growth**

11. 🔲 Add portfolio URL collection
12. 🔲 Security clearance questions (conditional)
13. 🔲 Industry preferences
14. 🔲 Company size preferences
15. 🔲 AI cover letter generation (upsell: $0.50/letter)
16. 🔲 Resume review service (upsell: $49 one-time)
17. 🔲 Interview prep (upsell: $99 one-time)

---

## 📊 Updated Schema (ProfileVault)

### **Current Issues:**
- ❌ Missing citizenship status (legal risk)
- ❌ Missing job matching fields (poor targeting)
- ❌ Missing professional URLs (reduces credibility)

### **Required Changes:**

```typescript
export interface UserProfile {
  identity: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    address: string;
    country_code: string;              // ← NEW: ISO code (e.g., "US", "CA")
    linkedin_url?: string;             // ← NEW: Professional profile
    portfolio_url?: string;            // ← NEW: Personal website
  };
  
  work_auth: {
    visa_type: string;
    sponsorship_required: boolean;
    citizenship_status: 'us_citizen' | 'permanent_resident' | 'work_visa' | 'no_authorization';  // ← NEW (CRITICAL!)
    clearance_eligible?: boolean;      // ← NEW: Security clearance
    clearance_level?: 'none' | 'secret' | 'top_secret' | 'ts_sci';
  };
  
  preferences: {
    // Existing
    remote: boolean;
    locations: string[];
    salary_min: number;
    salary_currency: string;
    start_date: string;
    
    // NEW - Job Matching
    target_roles: string[];            // ← NEW: What roles to apply for
    seniority_levels: string[];        // ← NEW: What levels to target
    job_types: string[];               // ← NEW: full_time, contract, etc.
    industries?: string[];             // ← NEW (optional)
    company_sizes?: string[];          // ← NEW (optional)
  };
  
  // NEW - Experience Summary
  experience: {
    years_total: number;               // ← NEW: Total years of experience
    years_in_role: number;             // ← NEW: Years in current specialty
    current_level: 'entry' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead';
  };
}
```

---

## 💳 Stripe Integration Plan

### **Implementation Checklist:**
- [ ] Create Stripe account
- [ ] Set up product: "Jobzippy Pro" at $9.99/mo
- [ ] Configure 3-day trial
- [ ] Deploy Firebase Functions for webhooks
- [ ] Update Firestore schema
- [ ] Implement Firestore security rules
- [ ] Build payment UI in extension
- [ ] Add subscription status checks
- [ ] Test trial → paid flow
- [ ] Test cancellation flow
- [ ] Test payment failure handling

### **Webhook Events to Handle:**
```typescript
1. customer.subscription.created
   → Set user.subscription.status = 'trialing'
   
2. customer.subscription.updated
   → Update subscription status
   
3. customer.subscription.deleted
   → Set status = 'canceled', tier = 'paused'
   
4. invoice.payment_succeeded
   → Set status = 'active', reset monthly usage
   
5. invoice.payment_failed
   → Set status = 'past_due', send email
```

---

## 🛡️ Security Architecture

See [SECURITY_STRATEGY.md](./SECURITY_STRATEGY.md) for detailed anti-abuse measures.

**Summary:**
- Layer 1: Client-side UI checks (Firestore subscription status)
- Layer 2: Firestore security rules (enforce 300/month limit)
- Layer 3: Stripe webhooks (source of truth)
- Layer 4: Backend API verification (for premium features)
- Layer 5: Server-side token verification (anti-mock protection)
- Layer 6: Rate limiting & usage tracking (prevent abuse)

---

## 📈 Success Metrics

### **Key Metrics to Track:**

**Acquisition:**
- Signups per week
- Trial starts per week
- Cost per acquisition (CPA)

**Activation:**
- % of users who complete onboarding
- % of users who apply to first job
- Time to first application

**Conversion:**
- Trial → paid conversion rate (target: 60%+)
- Days to conversion (trial → paid)
- Payment failure rate (target: <5%)

**Retention:**
- Monthly churn rate (target: <5%)
- Average applications per user per month
- User engagement (sessions per week)

**Revenue:**
- Monthly recurring revenue (MRR)
- Average revenue per user (ARPU): $9.99
- Lifetime value (LTV): target $50-60 (5-6 months)

**Product Health:**
- Application success rate (applied vs errors)
- Average time saved per user
- LinkedIn/platform ban rate (target: 0%)

---

## 🎯 Growth Strategy

### **Phase 1: Manual Outreach (0-100 users)**
- Reddit: r/jobs, r/cscareerquestions, r/jobsearchhacks
- LinkedIn posts: Share success stories
- ProductHunt launch
- Friends & family beta

### **Phase 2: Content Marketing (100-1000 users)**
- SEO content: "How to apply to 300 jobs in a week"
- YouTube demos
- TikTok job search hacks
- Twitter job search tips

### **Phase 3: Paid Ads (1000+ users)**
- Google Ads: "job application automation"
- LinkedIn Ads: Target job seekers
- Reddit Ads: Career subreddits
- Target CPA: <$10 (1 month LTV)

### **Phase 4: Viral Loops (Ongoing)**
- Referral program: Give $5, Get $5
- Public stats: "Jobzippy users applied to 1M+ jobs"
- Success stories: "Got hired in 2 weeks"

---

## 🚀 Launch Checklist

### **Pre-Launch (This Sprint):**
- [ ] Fix critical data issues (citizenship, visa, LinkedIn)
- [ ] Add job matching fields (roles, experience, seniority)
- [ ] Set up Stripe trial flow
- [ ] Implement subscription gating
- [ ] Write security rules
- [ ] Deploy webhook handlers
- [ ] Test payment flow end-to-end

### **Launch Week:**
- [ ] ProductHunt launch
- [ ] Reddit posts (5 subreddits)
- [ ] LinkedIn announcement
- [ ] Email to beta testers
- [ ] Press kit ready

### **Post-Launch:**
- [ ] Monitor trial conversion rate
- [ ] Track churn rate
- [ ] Collect user feedback
- [ ] Fix bugs rapidly
- [ ] Iterate on onboarding

---

## 💡 Competitive Positioning

| Feature | LazyApply | Simplify | Sonara | **Jobzippy** |
|---------|-----------|----------|--------|--------------|
| **Price** | $99/mo | $29/mo | $79/mo | **$9.99/mo** ✨ |
| Applications | Unlimited | Unlimited | Unlimited | 300/mo (safer) |
| Auto-fill | ✅ | ✅ | ❌ | ✅ |
| Cover Letters | ❌ | ✅ | ✅ | ✅ |
| Google Sheets | ❌ | ❌ | ❌ | ✅ |
| Free Trial | 7 days | 14 days | None | 3 days |
| Card Required | ❌ | ❌ | N/A | ✅ |

**Our Advantage:**
- 🎯 **10x cheaper** than competitors
- 🎯 **Safer** (300/mo limit protects from bans)
- 🎯 **Better data backup** (Google Sheets integration)
- 🎯 **Higher quality users** (card required filters freeloaders)

---

## 📝 Pricing Evolution Plan

### **Current: Early Adopter Pricing**
```
$9.99/month
Users 0-1000: Locked at $9.99 forever (grandfathered)
```

### **Future: Tiered Pricing**
```
Month 6 (1000+ users):
- Pro: $14.99/month (new users only)
- Early Adopters: $9.99/month (grandfathered)

Month 12 (5000+ users):
- Pro: $19.99/month (new users)
- Legacy: $14.99/month (joined Month 6-12)
- Founders: $9.99/month (joined Month 0-6)

Year 2 (10,000+ users):
- Pro: $24.99/month
- Teams: $49.99/month (5 seats)
- Enterprise: Custom pricing
- Legacy tiers: Grandfathered
```

---

## 🔗 Related Documents

- [ONBOARDING_ISSUES.md](./ONBOARDING_ISSUES.md) - Current data quality issues
- [SECURITY_STRATEGY.md](./SECURITY_STRATEGY.md) - Anti-abuse architecture
- [SHEETS_BACKUP.md](./SHEETS_BACKUP.md) - Backup system documentation

---

**Next Steps:**
1. Implement Phase 1 (Critical Fixes)
2. Set up Stripe + webhooks
3. Launch beta with card-required trial
4. Monitor metrics closely
5. Iterate based on feedback

---

**Target Launch Date:** 2 weeks from Dec 4, 2025 = **Dec 18, 2025**

**Success Definition (3 months post-launch):**
- ✅ 500+ paying users
- ✅ $5,000/month MRR
- ✅ <5% monthly churn
- ✅ 60%+ trial conversion
- ✅ 0 LinkedIn ban incidents

